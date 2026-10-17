// Tegenproeven voor K1: elke regel in de databasefuncties tijdelijk saboteren en nagaan dat de bijbehorende
// integratietest (k1.test.mjs) dan faalt. Alleen tegen een LOKALE stack; elke sabotage wordt teruggedraaid, ook bij
// een fout. Zelfde omgeving als k1.test.mjs (API_URL, ANON_KEY, SERVICE_ROLE_KEY, DB_URL).
import { spawnSync } from 'node:child_process';
import pg from 'pg';

const { DB_URL } = process.env;
if (!DB_URL || !/@(127\.0\.0\.1|localhost):\d+\//.test(DB_URL)) throw new Error('Weigering: alleen een lokale database');

const SABOTAGES = [
  { fn: 'private.k1_controleer(text,text,text,text,boolean)', test: 'gelijktijdig', wat: 'geen grens per code',
    van: "if c.pogingen + 1 >= g.per_code then update private.k1_codes set status = 'vervallen' where id = c.id; end if;", naar: '' },
  { fn: 'private.k1_controleer(text,text,text,text,boolean)', test: 'gelijktijdig', wat: 'code niet vergeleken',
    van: 'if c.code_hmac is distinct from p_code_hmac then', naar: 'if false then' },
  { fn: 'private.k1_controleer(text,text,text,text,boolean)', test: 'harde grens', wat: 'geen harde grens per account',
    van: 'a.totaal >= g.h_totaal or ', naar: '' },
  { fn: 'private.k1_controleer(text,text,text,text,boolean)', test: 'blokkadepoging', wat: 'geen onbekende emmer',
    van: 'or (not bekend and a.onbekend >= g.u_onbekend)', naar: '' },
  { fn: 'private.k1_controleer(text,text,text,text,boolean)', test: 'eigen account', wat: 'toestel niet aan het account gebonden',
    van: 'and d.user_id = c.user_id ', naar: '' },
  { fn: 'private.k1_controleer(text,text,text,text,boolean)', test: 'noodstops', wat: 'noodstop codes genegeerd bij controleren',
    van: "if not inst.codes_aan then return query select 'codes-uit'::text, null::text, null::text, null::uuid; return; end if;", naar: '' },
  { fn: 'private.k1_nieuwe_code(text,uuid,text,text,text)', test: 'limiet op aanvragen', wat: 'geen limiet op aanvragen',
    van: 'if a.aanvragen_kwartier >= g.aanvragen_kwartier or a.aanvragen_dag >= g.aanvragen_dag then', naar: 'if false then' },
  { fn: 'private.k1_nieuwe_code(text,uuid,text,text,text)', test: 'noodstops', wat: 'registratie dicht genegeerd',
    van: "if p_soort = 'signup' and not inst.registratie_open then return query select 'registratie-dicht'::text, null::uuid; return; end if;", naar: '' },
  { fn: 'private.k1_toestellen_intrekken(uuid)', test: 'intrekken', wat: 'toestellen niet ingetrokken',
    van: 'update private.k1_toestellen set ingetrokken = true where user_id = p_user_id and not ingetrokken;', naar: 'perform 1;' },
];

const db = new pg.Client({ connectionString: DB_URL });
await db.connect();
let fouten = 0;
for (const [i, s] of SABOTAGES.entries()) {
  const def = (await db.query('select pg_get_functiondef($1::regprocedure) d', [s.fn])).rows[0].d;
  if (!def.includes(s.van)) { console.log(`TEGENPROEF ${i + 1} ONGELDIG (${s.wat}): tekst niet gevonden`); fouten++; continue; }
  await db.query(def.replace(s.van, s.naar));
  try {
    const r = spawnSync(process.execPath, ['--test', '--test-concurrency=1', '--test-force-exit', '--test-reporter=tap', `--test-name-pattern=${s.test}`, 'k1.test.mjs'],
      { env: process.env, encoding: 'utf8', timeout: 600000 });
    const gevangen = r.status !== 0 && /# fail [1-9]/.test(r.stdout);
    console.log(`${gevangen ? 'tegenproef' : 'TEGENPROEF'} ${i + 1} ${gevangen ? 'gevangen' : 'NIET GEVANGEN'}: ${s.wat} (test: ${s.test})`);
    if (!gevangen) fouten++;
  } finally {
    await db.query(def);
  }
}
await db.end();
console.log(`K1-tegenproeven gevangen: ${SABOTAGES.length - fouten} van ${SABOTAGES.length}`);
process.exit(fouten ? 1 : 0);
