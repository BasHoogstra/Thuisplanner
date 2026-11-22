// Privacyherstel tasks.possession_id (optie A, migratie 20261029130000): taken zijn voor het hele huishouden zichtbaar,
// dus een taak hoort alleen bij een gedeeld spul. Tegen een echte, LOKALE Supabase-stack: via de API (zoals de app) en
// met twee aparte databaseverbindingen voor de race tussen koppelen en persoonlijk maken (P6).
// Tegenproeven: spullen-tegenproeven.mjs. Zie de notitie possession-herstel-voorstel-10nov.md (P1–P13).
//   thuisplanner/supabase/tests/integratie/run.sh
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import pg from 'pg';
import { maakSync } from '../../../sync/thuisplanner-sync.js';

const { API_URL, ANON_KEY, SERVICE_ROLE_KEY, DB_URL } = process.env;
for (const u of [API_URL, DB_URL]) {
  if (!u || !/\/\/([^@/]*@)?(127\.0\.0\.1|localhost)[:/]/.test(u)) throw new Error('Weigering: alleen een lokale Supabase');
}
const wacht = ms => new Promise(r => setTimeout(r, ms));
const opties = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(API_URL, SERVICE_ROLE_KEY, opties);
const run = randomUUID().slice(0, 8);
const wachtwoord = 'Tp-' + randomUUID();
const ok = ({ data, error }) => { assert.ifError(error); return data; };
const personen = {}, huishoudens = [], syncs = [], verbindingen = [];

async function persoon(naam) {
  const email = `${naam}-${run}@test.invalid`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: wachtwoord, email_confirm: true });
  assert.ifError(error);
  const c = createClient(API_URL, ANON_KEY, opties);
  ok(await c.auth.signInWithPassword({ email, password: wachtwoord }));
  personen[naam] = { id: data.user.id, c };
  return personen[naam];
}
// Een eigen databaseverbinding die optreedt als een ingelogd lid (zoals PostgREST), voor de race (P6).
async function verbinding() {
  const c = new pg.Client({ connectionString: DB_URL });
  await c.connect();
  verbindingen.push(c);
  return c;
}
async function alsLid(c, uid) {
  await c.query('begin');
  await c.query(`select set_config('request.jwt.claims', $1, true)`,
    [JSON.stringify({ sub: uid, role: 'authenticated', amr: [{ method: 'otp', timestamp: 1 }], session_id: uid })]);
  await c.query('set local role authenticated');
}
function volg(p) {
  const s = { klaar: false };
  s.p = p.then(r => { s.klaar = true; return { ok: true, r }; }, e => { s.klaar = true; return { ok: false, e }; });
  return s;
}

let db, ha, sara, tim, mSara;
before(async () => {
  sara = await persoon('sara'); tim = await persoon('tim');
  ha = ok(await sara.c.rpc('create_household', { p_name: 'Taakprivacy ' + run, p_display_name: 'Sara' }));
  huishoudens.push(ha);
  ok(await tim.c.rpc('accept_invite', { p_token: ok(await sara.c.rpc('create_invite', { p_household: ha })), p_display_name: 'Tim' }));
  mSara = ok(await sara.c.rpc('my_memberships')).find(m => m.household_id === ha).member_id;
  db = await verbinding();
  // De toegangspoort eist een bestaande sessie met dit id (zie gelijktijdig.test.mjs).
  for (const p of [sara, tim]) await db.query('insert into auth.sessions (id, user_id) values ($1, $1) on conflict do nothing', [p.id]);
});
after(async () => {
  const fouten = [];
  const probeer = async (wat, f) => { try { await f(); } catch (e) { fouten.push(`${wat}: ${e.message}`); } };
  for (const s of syncs) await probeer('sync', () => s.stop());
  for (const c of verbindingen) await probeer('verbinding', async () => { await c.query('rollback').catch(() => {}); await c.end(); });
  await probeer('huishoudens', async () => ok(await admin.from('households').delete().in('id', huishoudens)));
  for (const { id } of Object.values(personen)) await probeer('gebruiker', async () => ok(await admin.auth.admin.deleteUser(id)));
  if (fouten.length) throw new Error('Opruimen niet volledig gelukt: ' + fouten.join('; '));
});

const spul = async (naam, visibility = 'household') => {
  const id = randomUUID();
  ok(await sara.c.from('possessions').insert({ id, household_id: ha, name: naam + ' ' + run, owner_member_id: mSara, visibility }));
  return id;
};
const taak = (c, title, possession_id = null) => c.from('tasks').insert({ id: randomUUID(), household_id: ha, title, possession_id }).select('id').single();
const zichtbaarheid = async (id, visibility) => ok(await sara.c.from('possessions').update({ visibility }).eq('id', id).select('id'));

test('P1/P2 via de API: ook de eigenaar koppelt geen taak aan een persoonlijk spul; de partner krijgt dezelfde fout als bij een onbekend id', async () => {
  const prive = await spul('Trouwring', 'private');
  const eigen = await taak(sara.c, 'Ring laten taxeren', prive);
  assert.equal(eigen.error?.code, '42501', 'eigenaar koppelt een taak aan het eigen persoonlijke spul');
  const partner = await taak(tim.c, 'Ring', prive), onbekend = await taak(tim.c, 'Ring', randomUUID());
  assert.ok(partner.error && onbekend.error);
  assert.deepEqual([partner.error.code, partner.error.message], [onbekend.error.code, onbekend.error.message], 'een andere fout verraadt het spul');
  // Ook achteraf koppelen (update) kan niet.
  const t = ok(await taak(sara.c, 'Losse taak'));
  assert.equal((await sara.c.from('tasks').update({ possession_id: prive }).eq('id', t.id)).error?.code, '42501');
  // Ook de service-rol niet: de regel geldt voor elke rol.
  assert.ok((await admin.from('tasks').insert({ household_id: ha, title: 'Dienst', possession_id: prive })).error, 'service-rol koppelt aan een persoonlijk spul');
});

test('P3/P4/P5/P7 via de API: gedeeld werkt; persoonlijk maken maakt de koppeling meteen leeg en laat alle taken staan; weer delen brengt haar niet terug', async () => {
  const s = await spul('Wasmachine'), ander = await spul('Droger');
  const t1 = ok(await taak(sara.c, 'Filter wasmachine', s)), t2 = ok(await taak(sara.c, 'Pluizenfilter', ander)), t0 = ok(await taak(sara.c, 'Vuilnis'));
  const lees = async c => Object.fromEntries(ok(await c.from('tasks').select('id,title,possession_id,version,deleted_at').eq('household_id', ha)).map(r => [r.id, r]));
  let bij = await lees(tim.c);
  assert.equal(bij[t1.id].possession_id, s, 'P3: de partner ziet de koppeling aan een gedeeld spul');
  const voor = bij;
  await zichtbaarheid(s, 'private');
  bij = await lees(tim.c);
  assert.equal(bij[t1.id].possession_id, null, 'P4: koppeling blijft na persoonlijk maken');
  assert.equal(bij[t1.id].title, 'Filter wasmachine', 'P4: de titel is veranderd');
  assert.equal(bij[t1.id].deleted_at, null, 'P4: de taak is verwijderd');
  assert.deepEqual(bij[t2.id], voor[t2.id], 'een taak bij een ander spul is geraakt');
  assert.deepEqual(bij[t0.id], voor[t0.id], 'een losse taak is geraakt');
  assert.equal(Object.keys(bij).length, Object.keys(voor).length, 'het aantal taken is veranderd');
  // P7: geen enkele possession_id die de partner niet kan lezen, en nergens het id of de naam van het persoonlijke spul.
  const zicht = new Set(ok(await tim.c.from('possessions').select('id').eq('household_id', ha)).map(r => r.id));
  for (const r of Object.values(bij)) assert.ok(r.possession_id === null || zicht.has(r.possession_id), 'P7: onleesbare possession_id');
  const ruw = JSON.stringify([ok(await tim.c.from('tasks').select('*')), ok(await tim.c.from('possessions').select('id,name,notes,visibility')), ok(await tim.c.from('document_links').select('*'))]);
  assert.ok(!ruw.includes(s) && !ruw.includes('Wasmachine ' + run), 'P7: spoor van het persoonlijke spul via de API');
  const sTim = maakSync({ supabase: tim.c, huishoudenId: ha, vangnetMs: 60000, spullen: true });
  syncs.push(sTim);
  await sTim.start();
  assert.ok(!JSON.stringify(sTim.toestand).includes(s), 'P7: spoor van het persoonlijke spul in de sync');
  // P5: weer gedeeld, de koppeling komt niet vanzelf terug; opnieuw koppelen mag dan wel.
  await zichtbaarheid(s, 'household');
  assert.equal((await lees(tim.c))[t1.id].possession_id, null, 'P5: koppeling komt terug');
  ok(await sara.c.from('tasks').update({ possession_id: s }).eq('id', t1.id).select('id'));
  // Niet aan een spul in de prullenbak.
  ok(await sara.c.from('possessions').update({ deleted_at: new Date().toISOString() }).eq('id', ander).select('id'));
  assert.equal((await taak(sara.c, 'Nog een', ander)).error?.code, '42501', 'taak aan een spul in de prullenbak');
});

test('P6 gelijktijdig: koppelen en persoonlijk maken kruisen nooit (twee verbindingen, beide volgordes)', async () => {
  const c1 = await verbinding(), c2 = await verbinding();
  const geenKoppeling = async (id, wat) => assert.equal((await db.query('select possession_id from public.tasks where id = $1', [id])).rows[0]?.possession_id ?? null, null, wat);
  // A: eerst koppelen (nog niet bevestigd), dan persoonlijk maken: dat wacht, en maakt daarna ook deze koppeling leeg.
  const a = await spul('Boor'), ta = randomUUID();
  await alsLid(c1, sara.id);
  await c1.query('insert into public.tasks (id, household_id, title, possession_id) values ($1, $2, $3, $4)', [ta, ha, 'Boor smeren', a]);
  await alsLid(c2, sara.id);
  const omzetten = volg(c2.query(`update public.possessions set visibility = 'private' where id = $1`, [a]));
  await wacht(500);
  assert.equal(omzetten.klaar, false, 'A: persoonlijk maken wacht niet op de lopende koppeling');
  await c1.query('commit');
  assert.ok((await omzetten.p).ok);
  await c2.query('commit');
  await geenKoppeling(ta, 'A: koppeling aan een persoonlijk spul na de race');
  // B: eerst persoonlijk maken (nog niet bevestigd), dan koppelen: dat wacht, en wordt daarna geweigerd.
  const b = await spul('Zaag'), tb = randomUUID();
  await alsLid(c2, sara.id);
  await c2.query(`update public.possessions set visibility = 'private' where id = $1`, [b]);
  await alsLid(c1, sara.id);
  const koppelen = volg(c1.query('insert into public.tasks (id, household_id, title, possession_id) values ($1, $2, $3, $4)', [tb, ha, 'Zaag slijpen', b]));
  await wacht(500);
  assert.equal(koppelen.klaar, false, 'B: koppelen wacht niet op het lopende persoonlijk maken');
  await c2.query('commit');
  const r = await koppelen.p;
  await c1.query(r.ok ? 'commit' : 'rollback');
  assert.equal(r.ok, false, 'B: koppelen aan een intussen persoonlijk spul lukt');
  await geenKoppeling(tb, 'B: koppeling aan een persoonlijk spul na de race');
});

test('P8/P9: wissen van een persoonlijk spul verandert niets aan de taken van de partner; een gedeeld spul wissen maakt de koppeling leeg', async () => {
  const prive = await spul('Dagboek', 'private'), gedeeld = await spul('Ladder');
  const t = ok(await taak(sara.c, 'Ladder keuren', gedeeld));
  const momentopname = async () => JSON.stringify(ok(await tim.c.from('tasks').select('id,version,updated_at,possession_id').eq('household_id', ha).order('id')));
  const voor = await momentopname();
  ok(await sara.c.from('possessions').update({ deleted_at: new Date().toISOString() }).eq('id', prive).select('id'));
  await db.query('delete from public.possessions where id = $1', [prive]);   // zoals de opruimronde na 30 dagen
  assert.equal(await momentopname(), voor, 'P9: de partner ziet aan zijn taken dat een persoonlijk spul weg is');
  // De bestaande cascade blijft werken (on delete set null), ook met de guard.
  await db.query('delete from public.possessions where id = $1', [gedeeld]);
  assert.equal((await db.query('select possession_id from public.tasks where id = $1', [t.id])).rows[0].possession_id, null);
});
