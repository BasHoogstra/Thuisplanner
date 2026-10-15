// KomtGoed KG-5B herstelronde 1: gelijktijdigheidstests met echte, aparte databaseverbindingen.
// Elk scenario zet twee transacties zo tegen elkaar dat de tweede de eerste "inhaalt" op het
// gevaarlijke moment, en controleert de toestand ná COMMIT met een derde verbinding.
//
//   DB_URL=postgresql://postgres:postgres@127.0.0.1:55322/postgres node --test gelijktijdig.test.mjs
//   KG_TEGENPROEF=1 ...   tegenproef: de vergrendelingen worden tijdelijk uitgezet (no-op) en dan MOET
//                         elk scenario de fout weer laten zien; anders meet de test niets.
//
// Alleen tegen een lokale database (127.0.0.1/localhost of een unix-socket). De test maakt
// synthetische accounts (@test.invalid) en huishoudens en ruimt ze na afloop op.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';

const DB_URL = process.env.DB_URL || '';
const TEGENPROEF = process.env.KG_TEGENPROEF === '1';
const lokaal = DB_URL
  ? /\/\/([^@/]*@)?(127\.0\.0\.1|localhost)[:/]/.test(DB_URL)
  : (process.env.PGHOST || '').startsWith('/');
if (!lokaal) throw new Error('Weigering: alleen een lokale database (DB_URL naar 127.0.0.1/localhost of PGHOST als socketmap)');

const verbinding = naam => new pg.Client(DB_URL ? { connectionString: DB_URL, application_name: naam } : { application_name: naam });
const wacht = ms => new Promise(r => setTimeout(r, ms));
const run = randomUUID().slice(0, 8);
let db;                       // derde verbinding: opzet en controle, als postgres
const accounts = [];
const huishoudens = [];
const bewaard = {};           // tegenproef: originele functiedefinities

// Binnen een transactie optreden als een ingelogde gebruiker (zoals PostgREST dat doet).
async function als(c, uid) {
  await c.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: uid, role: 'authenticated' })]);
  await c.query('set local role authenticated');
}
async function alsDoe(uid, sql, params = []) {
  await db.query('begin');
  try {
    await als(db, uid);
    const r = await db.query(sql, params);
    await db.query('commit');
    return r.rows[0] ? Object.values(r.rows[0])[0] : undefined;
  } catch (e) { await db.query('rollback'); throw e; }
}
async function account(naam) {
  const id = randomUUID();
  await db.query('insert into auth.users (id, email) values ($1, $2)', [id, `${naam}-${run}@test.invalid`]);
  accounts.push(id);
  return id;
}
async function huishouden(eigenaar, naam) {
  const id = await alsDoe(eigenaar, 'select public.create_household($1, $2)', [naam + ' ' + run, naam]);
  huishoudens.push(id);
  return id;
}
async function lidMetAccount(h, eigenaar, uid, naam, rol) {
  const tok = await alsDoe(eigenaar, 'select public.create_invite($1, null, $2)', [h, rol]);
  await alsDoe(uid, 'select public.accept_invite($1, $2)', [tok, naam]);
  return (await db.query('select id from public.household_members where household_id = $1 and user_id = $2', [h, uid])).rows[0].id;
}
const eigenAantal = async uid => Number((await db.query(
  `select count(*) from public.household_members where user_id = $1 and status = 'active' and role = 'owner'`, [uid])).rows[0].count);

// Volgt een lopende query zonder dat een fout onafgehandeld blijft.
function volg(p) {
  const s = { klaar: false };
  s.p = p.then(r => { s.klaar = true; return { ok: true, r }; }, e => { s.klaar = true; return { ok: false, e }; });
  return s;
}
// Wacht tot verbinding c op een vergrendeling wacht, of tot haar query klaar is.
async function geblokkeerdOfKlaar(c, s) {
  for (let i = 0; i < 400; i++) {
    if (s.klaar) return 'klaar';
    const r = await db.query('select wait_event_type from pg_stat_activity where pid = $1', [c.processID]);
    if (r.rows[0]?.wait_event_type === 'Lock') return 'wacht';
    await wacht(25);
  }
  throw new Error('tweede verbinding na 10 s niet geblokkeerd en niet klaar');
}

// Verbinding 1 voert stap1 uit en houdt haar transactie open. Verbinding 2 start stap2. Is die
// meteen klaar (geen vergrendeling), dan laat ze ook haar uitgestelde controles nu lopen, vóór de
// COMMIT van verbinding 1: dat is wat er gebeurt als beide tegelijk committen. Dan COMMIT 1, daarna 2.
async function race(stap1, stap2) {
  const c1 = verbinding('kg-race-1'), c2 = verbinding('kg-race-2');
  await c1.connect(); await c2.connect();
  try {
    await c1.query('begin');
    await stap1(c1);
    await c2.query('begin');
    const s2 = await stap2(c2);
    const toestand = await geblokkeerdOfKlaar(c2, s2);
    if (toestand === 'klaar' && (await s2.p).ok) {
      await c2.query('set constraints all immediate').catch(() => {});
    }
    await c1.query('commit');
    const r2 = await s2.p;
    let fout2 = r2.ok ? null : r2.e;
    try {
      const tag = (await c2.query('commit')).command;
      if (tag !== 'COMMIT' && !fout2) fout2 = new Error('transactie 2 teruggedraaid');
    } catch (e) { fout2 = fout2 || e; }
    return { toestand, fout2 };
  } finally {
    await c1.end().catch(() => {}); await c2.end().catch(() => {});
  }
}

// Uitkomst toetsen: normaal moet de fout geblokkeerd zijn én moest verbinding 2 echt wachten
// (bewijs van serialisatie); in de tegenproef moet de fout juist optreden.
function toets(naam, geschonden, uitkomst) {
  if (TEGENPROEF) {
    assert.equal(geschonden, true, `tegenproef ${naam}: zonder vergrendeling trad de fout niet op; de test meet niets`);
  } else {
    assert.equal(geschonden, false, `${naam}: fout niet geblokkeerd`);
    assert.equal(uitkomst.toestand, 'wacht', `${naam}: tweede transactie werd niet geserialiseerd`);
    assert.ok(uitkomst.fout2, `${naam}: tweede transactie had geweigerd moeten worden`);
  }
}

before(async () => {
  db = verbinding('kg-controle');
  await db.connect();
  if (TEGENPROEF) {
    for (const f of ['lock_household', 'lock_owner_count']) {
      bewaard[f] = (await db.query(`select pg_get_functiondef(p.oid) as d from pg_proc p
        where p.pronamespace = 'private'::regnamespace and p.proname = $1`, [f])).rows[0].d;
    }
    await db.query(`create or replace function private.lock_household(p_household uuid) returns void
      language plpgsql security definer set search_path = '' as $$ begin end $$`);
    await db.query(`create or replace function private.lock_owner_count(p_user uuid) returns void
      language plpgsql security definer set search_path = '' as $$ begin end $$`);
  }
});

after(async () => {
  for (const d of Object.values(bewaard)) await db.query(d);
  if (huishoudens.length) await db.query('delete from public.households where id = any($1::uuid[])', [huishoudens]);
  if (accounts.length) await db.query('delete from auth.users where id = any($1::uuid[])', [accounts]);
  await db.end();
});

test('P1 set_member_role: een oud-eigenaar kan na overdracht geen rol meer wijzigen', async () => {
  const a = await account('a1'), b = await account('b1'), c = await account('c1');
  const h = await huishouden(a, 'Rol');
  const mB = await lidMetAccount(h, a, b, 'B', 'admin');
  const mC = await lidMetAccount(h, a, c, 'C', 'member');
  const uitkomst = await race(
    async c1 => {                       // A draagt het eigendom over aan B (A wordt beheerder) ...
      await als(c1, a);
      await c1.query('select public.transfer_ownership($1, $2)', [h, mB]);
      await c1.query('reset role');     // ... en de rij van C is nog even in gebruik.
      await c1.query('select 1 from public.household_members where id = $1 for update', [mC]);
    },
    async c2 => { await als(c2, a); return volg(c2.query(`select public.set_member_role($1, $2, 'admin')`, [h, mC])); });
  const rol = (await db.query('select role from public.household_members where id = $1', [mC])).rows[0].role;
  toets('set_member_role', rol === 'admin', uitkomst);
});

test('P1 delete_household: een oud-eigenaar kan na overdracht het huishouden niet verwijderen', async () => {
  const a = await account('a2'), b = await account('b2');
  const h = await huishouden(a, 'Weg');
  const mB = await lidMetAccount(h, a, b, 'B', 'admin');
  const uitkomst = await race(
    async c1 => {
      await als(c1, a);
      await c1.query('select public.transfer_ownership($1, $2)', [h, mB]);
      await c1.query('reset role');
      await c1.query('select 1 from public.households where id = $1 for no key update', [h]);
    },
    async c2 => { await als(c2, a); return volg(c2.query('select public.delete_household($1)', [h])); });
  const bestaat = (await db.query('select count(*) from public.households where id = $1', [h])).rows[0].count === '1';
  toets('delete_household', !bestaat, uitkomst);
});

test('P3 twee eigenaars vertrekken tegelijk: er blijft altijd een eigenaar', async () => {
  const a = await account('a3'), b = await account('b3');
  const h = await huishouden(a, 'Samen');
  const mB = await lidMetAccount(h, a, b, 'B', 'admin');
  await db.query(`update public.household_members set role = 'owner' where id = $1`, [mB]);   // twee eigenaars
  const uitkomst = await race(
    async c1 => {
      await als(c1, a);
      await c1.query('select public.leave_household($1)', [h]);
      await c1.query('set constraints all immediate');
    },
    async c2 => { await als(c2, b); return volg(c2.query('select public.leave_household($1)', [h])); });
  const eigenaars = Number((await db.query(`select count(*) from public.household_members
    where household_id = $1 and role = 'owner' and status = 'active' and user_id is not null`, [h])).rows[0].count);
  toets('leave_household', eigenaars === 0, uitkomst);
});

test('P5 limiet: twee gelijktijdige overdrachten naar hetzelfde account', async () => {
  const t = await account('t5'), x = await account('x5'), y = await account('y5');
  for (let i = 1; i <= 9; i++) await huishouden(t, 'Eigen ' + i);
  const h1 = await huishouden(x, 'Een'), h2 = await huishouden(y, 'Twee');
  const m1 = await lidMetAccount(h1, x, t, 'T', 'admin');
  const m2 = await lidMetAccount(h2, y, t, 'T', 'admin');
  const uitkomst = await race(
    async c1 => { await als(c1, x); await c1.query('select public.transfer_ownership($1, $2)', [h1, m1]); },
    async c2 => { await als(c2, y); return volg(c2.query('select public.transfer_ownership($1, $2)', [h2, m2])); });
  toets('transfer_ownership', (await eigenAantal(t)) > 10, uitkomst);
});

test('P5 limiet: twee gelijktijdige nieuwe huishoudens van hetzelfde account', async () => {
  const t = await account('t6');
  for (let i = 1; i <= 9; i++) await huishouden(t, 'Eigen ' + i);
  const nieuw = async (c, naam) => {
    const r = await c.query('select public.create_household($1, $2) as id', [naam + ' ' + run, 'T']);
    huishoudens.push(r.rows[0].id);
    return r;
  };
  const uitkomst = await race(
    async c1 => { await als(c1, t); await nieuw(c1, 'Tiende'); },
    async c2 => { await als(c2, t); return volg(nieuw(c2, 'Elfde')); });
  toets('create_household', (await eigenAantal(t)) > 10, uitkomst);
});
