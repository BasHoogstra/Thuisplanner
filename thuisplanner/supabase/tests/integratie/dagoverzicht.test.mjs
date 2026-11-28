// Bewaking (docs/thuisplanner-beta-voorbereiding.md §7): staging/dagoverzicht.sql tegen een LOKALE Supabase-stack.
// Getoetst, in een alleen-lezende transactie: elke regel telt precies wat erbij komt (codes, pogingen, geremd door H, U en
// D, de aanvraaggrens, nieuwe en onbevestigde accounts, de mailwachtrij via private.uitnodigingsmail_stand), oude codes
// (ouder dan 24 uur) tellen niet mee, de laatste run van elke geplande taak staat erin, en er staat nooit een adres,
// hash, code, token of id in.
// Tegenproeven: een variant die een adres toont, of oude codes meetelt, laat de toetsen falen.
//
//   API_URL=... SERVICE_ROLE_KEY=... DB_URL=... node --test dagoverzicht.test.mjs
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { createClient } from '@supabase/supabase-js';

const { API_URL, SERVICE_ROLE_KEY, DB_URL } = process.env;
for (const [k, v] of Object.entries({ API_URL, SERVICE_ROLE_KEY, DB_URL })) if (!v) throw new Error(k + ' ontbreekt: start via run.sh');
for (const u of [API_URL, DB_URL]) if (!/\/\/([^@/]*@)?(127\.0\.0\.1|localhost)[:/]/.test(u)) throw new Error('Weigering: alleen een lokale Supabase');

const SQL = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '../../staging/dagoverzicht.sql'), 'utf8');
const admin = createClient(API_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const run = randomUUID().slice(0, 8);
const hex = () => (randomUUID() + randomUUID()).replace(/-/g, '');
const accounts = [], hashes = [], huishoudens = [];
let db;

before(async () => { db = new pg.Client({ connectionString: DB_URL }); await db.connect(); });
after(async () => {
  await db.query('delete from private.k1_codes where adres_hmac = any($1::text[])', [hashes]);
  await db.query('delete from private.k1_accounts where adres_hmac = any($1::text[])', [hashes]);
  if (huishoudens.length) await db.query('delete from public.households where id = any($1::uuid[])', [huishoudens]);
  for (const id of accounts) await db.query('delete from auth.users where id = $1', [id]).catch(() => {});
  await db?.end();
});

async function overzicht(sql = SQL) {
  await db.query('begin transaction read only');
  try {
    const r = await db.query(sql);
    return { rijen: r.rows, kaart: Object.fromEntries(r.rows.map(x => [x.onderdeel, x.waarde])), tekst: JSON.stringify(r.rows) };
  } finally { await db.query('rollback'); }
}
const getal = (o, naam) => { assert.ok(naam in o.kaart, `regel ontbreekt: ${naam}`); return Number(o.kaart[naam]); };
/** Nooit een adres, hash, code, token of id. */
function lekFouten(tekst) {
  const f = [];
  if (tekst.includes('@')) f.push('een adres');
  if (/[0-9a-f]{32,}/i.test(tekst)) f.push('een hash of token');
  if (/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(tekst)) f.push('een id');
  return f;
}

const REGELS = {
  aangevraagd: 'codes aangevraagd (24 uur)', gebruikt: 'codes gebruikt, dus geslaagde inlog of registratie (24 uur)',
  pogingen: 'codepogingen gecontroleerd (24 uur)', vervallen: 'codes vervallen na te veel fouten (24 uur)',
  h: 'adressen geremd door H (alle pogingen op)', u: 'adressen geremd door U (pogingen van onbekende toestellen op)',
  d: 'toestellen geremd door D', grens: 'adressen aan de aanvraaggrens (kwartier of dag)',
  nieuw: 'nieuwe accounts (24 uur)', onbevestigd: 'waarvan nog onbevestigd',
  mislukt: 'uitnodigingsmails mislukt (7 dagen)', nietBezorgd: 'uitnodigingsmails niet bezorgd (7 dagen)',
};
const tellen = o => Object.fromEntries(Object.entries(REGELS).map(([k, n]) => [k, getal(o, n)]));

let voor, na;
test('elke regel telt precies wat erbij komt; oude codes tellen niet mee; geen adres of id', async () => {
  voor = tellen(await overzicht());
  // Twee nieuwe accounts, waarvan één onbevestigd.
  for (const [naam, bevestigd] of [['nina', true], ['otto', false]]) {
    const { data, error } = await admin.auth.admin.createUser({ email: `${naam}-${run}@test.invalid`, password: 'Test-' + randomUUID(), email_confirm: bevestigd });
    assert.ifError(error);
    accounts.push(data.user.id);
  }
  const [a1, a2, a3, a4] = [hex(), hex(), hex(), hex()];
  hashes.push(a1, a2, a3, a4);
  const code = (adres, status, pogingen, oud = false) => db.query(`insert into private.k1_codes (adres_hmac, user_id, soort, code_hmac, token_hash_enc, verloopt, status, pogingen, gemaakt)
    values ($1, $2, 'email', $3, 'x', now() + interval '10 minutes', $4, $5, now() - $6::interval)`, [adres, accounts[0], hex(), status, pogingen, oud ? '25 hours' : '1 minute']);
  await code(a1, 'gebruikt', 1);
  await code(a2, 'vervallen', 5);            // te veel fouten (per_code = 5)
  await code(a3, 'actief', 2);
  await code(a4, 'gebruikt', 3, true);      // ouder dan 24 uur: telt niet
  // Grenzen: één adres op H (en dus ook op U), één aan de dag-aanvraaggrens; één toestel op D.
  await db.query(`insert into private.k1_accounts (adres_hmac, totaal, onbekend) values ($1, 100, 30)`, [a1]);
  await db.query(`insert into private.k1_accounts (adres_hmac, aanvragen_dag) values ($1, 8)`, [a2]);
  await db.query(`insert into private.k1_toestellen (user_id, token_hmac, fout) values ($1, $2, 10)`, [accounts[0], hex()]);
  // De mailwachtrij: één mislukt en één niet bezorgd (via een uitnodiging met adres in een eigen huishouden).
  const h = randomUUID(); huishoudens.push(h);
  await db.query(`insert into public.households (id, name) values ($1, $2)`, [h, 'Dagoverzicht ' + run]);
  for (const status of ['mislukt', 'niet_bezorgd']) {
    const inv = (await db.query(`insert into public.household_invites (household_id, token_hash) values ($1, $2) returning id`, [h, hex()])).rows[0].id;
    await db.query(`insert into private.uitnodigingsmails (invite_id, household_id, nummer, status) values ($1, $2, 1, $3)`, [inv, h, status]);
  }
  const o = await overzicht();
  na = tellen(o);
  const delta = Object.fromEntries(Object.keys(REGELS).map(k => [k, na[k] - voor[k]]));
  assert.deepEqual(delta, { aangevraagd: 3, gebruikt: 1, pogingen: 8, vervallen: 1, h: 1, u: 1, d: 1, grens: 1, nieuw: 2, onbevestigd: 1, mislukt: 1, nietBezorgd: 1 });
  assert.deepEqual(lekFouten(o.tekst), []);
  // De mailwachtrij en de laatste run van de 6 geplande taken staan erin.
  for (const n of ['uitnodigingsmails langer dan 10 minuten wachtend', 'uitnodigingsmails vastgelopen (bezig over de termijn)', 'uitnodigingsmails onzeker (7 dagen)']) getal(o, n);
  const taken = o.rijen.filter(r => r.onderdeel.startsWith('geplande taak thuisplanner-'));
  assert.deepEqual(taken.map(r => r.onderdeel.replace('geplande taak ', '')).sort(), ['thuisplanner-archief-opruimen', 'thuisplanner-codes-opruimen',
    'thuisplanner-documenten-opruimen', 'thuisplanner-uitnodigingen-opschonen', 'thuisplanner-uitnodigingsmails-opruimen', 'thuisplanner-uitnodigingsmails-versturen']);
  assert.ok(taken.every(r => /^(succeeded|failed|running|starting|nog niet gelopen)/.test(r.waarde)), JSON.stringify(taken));
  assert.equal(getal(o, 'geplande taken van Thuisplanner'), 6);
  assert.equal(o.rijen.find(r => r.onderdeel === REGELS.h).let_op, 'let op: vergrendeld adres');
});

test('tegenproeven: een adres in de uitkomst, of oude codes meetellen, laat de toetsen falen', async () => {
  const metAdres = SQL.replace("'accounts in totaal', (select count(*) from auth.users)::text", "'accounts in totaal', (select string_agg(email, ',') from auth.users)");
  assert.notEqual(metAdres, SQL);
  assert.ok(lekFouten((await overzicht(metAdres)).tekst).includes('een adres'), 'het adres werd niet opgemerkt');
  const oudeCodes = SQL.replace("codes as (select * from private.k1_codes where gemaakt > now() - interval '24 hours')", 'codes as (select * from private.k1_codes)');
  assert.notEqual(oudeCodes, SQL);
  const n = tellen(await overzicht(oudeCodes));
  assert.notEqual(n.aangevraagd, na.aangevraagd, 'de oude code werd niet meegeteld: de toets op het venster zegt niets');
  // En het overzicht schrijft niets.
  assert.doesNotMatch(SQL.replace(/--.*$/gm, ''), /\b(insert|update|delete|truncate|alter|create|drop|grant|perform)\b/i);
});
