// Plannen (besluit 18, migratie 20261111120000): de sync-module met de optie plannen tegen een echte, LOKALE
// Supabase-stack, met twee telefoons in één huishouden (Sara en Tim) en een buitenstaander (Bo).
// Een taak in een plan is een gewone taak: één vinkje overal. Gate 9 voor het domein plannen: rls_tests.sql (KG-T98).
//   thuisplanner/supabase/tests/integratie/run.sh
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { maakSync } from '../../../sync/thuisplanner-sync.js';

const { API_URL, ANON_KEY, SERVICE_ROLE_KEY } = process.env;
if (!API_URL || !/\/\/(127\.0\.0\.1|localhost)[:/]/.test(API_URL)) throw new Error('Weigering: alleen een lokale Supabase');
const wacht = ms => new Promise(r => setTimeout(r, ms));
async function totdat(f, ms = 10000, wat = 'voorwaarde') {
  const eind = Date.now() + ms;
  while (Date.now() < eind) { if (await f()) return; await wacht(100); }
  throw new Error('Niet binnen ' + ms + ' ms: ' + wat);
}
const opties = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(API_URL, SERVICE_ROLE_KEY, opties);
const run = randomUUID().slice(0, 8);
const wachtwoord = 'Pl-' + randomUUID();
const ok = ({ data, error }) => { assert.ifError(error); return data; };
const personen = {}, syncs = [], huishoudens = [];

async function persoon(naam) {
  const email = `${naam}-${run}@test.invalid`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: wachtwoord, email_confirm: true });
  assert.ifError(error);
  const c = createClient(API_URL, ANON_KEY, opties);
  ok(await c.auth.signInWithPassword({ email, password: wachtwoord }));
  personen[naam] = { id: data.user.id, c };
  return personen[naam];
}
async function startSync(naam, h, extra = {}) {
  const s = maakSync({ supabase: personen[naam].c, huishoudenId: h, vangnetMs: 60000, plannen: true, ...extra });
  syncs.push(s);
  await s.start();
  return s;
}

let ha, hb, sara, tim, bo, mSara, mTim, sSara, sTim, sBo;
before(async () => {
  sara = await persoon('sara'); tim = await persoon('tim'); bo = await persoon('bo');
  ha = ok(await sara.c.rpc('create_household', { p_name: 'Plannen ' + run, p_display_name: 'Sara' }));
  huishoudens.push(ha);
  hb = ok(await bo.c.rpc('create_household', { p_name: 'Buren ' + run, p_display_name: 'Bo' }));
  huishoudens.push(hb);
  ok(await tim.c.rpc('accept_invite', { p_token: ok(await sara.c.rpc('create_invite', { p_household: ha })), p_display_name: 'Tim' }));
  const lid = async (p, h) => ok(await p.c.rpc('my_memberships')).find(m => m.household_id === h).member_id;
  mSara = await lid(sara, ha); mTim = await lid(tim, ha);
  sSara = await startSync('sara', ha);
  sTim = await startSync('tim', ha);
  sBo = await startSync('bo', hb);
});
after(async () => {
  const fouten = [];
  const probeer = async (wat, f) => { try { await f(); } catch (e) { fouten.push(`${wat}: ${e.message}`); } };
  for (const s of syncs) await probeer('sync stoppen', () => s.stop());
  await probeer('huishoudens', async () => ok(await admin.from('households').delete().in('id', huishoudens)));
  for (const { id } of Object.values(personen)) await probeer('gebruiker', async () => ok(await admin.auth.admin.deleteUser(id)));
  if (fouten.length) throw new Error('Opruimen niet volledig gelukt: ' + fouten.join('; '));
});

const plan = (s, id) => s.toestand.plannen.find(x => x.id === id);
const taak = (s, titel) => s.toestand.taken.find(x => x.title === titel);

test('zonder de optie plannen: precies de oude zoekopdrachten (geen plantabellen, geen planvelden)', async () => {
  const gevraagd = [];
  const c = createClient(API_URL, ANON_KEY, { ...opties, global: { fetch: (u, o) => { gevraagd.push(String(u)); return fetch(u, o); } } });
  ok(await c.auth.signInWithPassword({ email: `tim-${run}@test.invalid`, password: wachtwoord }));
  const s = maakSync({ supabase: c, huishoudenId: ha, vangnetMs: 60000 });
  syncs.push(s);
  await s.vernieuw();
  assert.ok(!gevraagd.some(u => u.includes('/rest/v1/plans') || u.includes('/rest/v1/plan_sections')), 'plantabellen gevraagd zonder de optie');
  assert.ok(!gevraagd.some(u => u.includes('/rest/v1/tasks') && u.includes('plan_id')), 'planvelden gevraagd zonder de optie');
  assert.deepEqual(s.toestand.plannen, []);
});

test('een plan met een onderdeel en taken: de partner ziet alles, en afvinken is overal hetzelfde vinkje', async () => {
  const p = randomUUID(), o = randomUUID();
  assert.ok((await sSara.acties.planToevoegen(p, { title: 'Zolder ' + run, member_ids: [mSara, mTim], due_date: '2026-12-31' })).ok);
  assert.ok((await sSara.acties.onderdeelToevoegen(o, { plan_id: p, name: 'Voorbereiding', position: 1 })).ok);
  assert.ok((await sSara.acties.taakToevoegen('Isolatie ' + run, { due_date: null, assignee_member_id: mTim, plan_id: p, plan_section_id: o })).ok);
  assert.ok((await sSara.acties.taakToevoegen('Vloer ' + run, { due_date: null, assignee_member_id: null, plan_id: p })).ok);
  await sTim.vernieuw();
  assert.deepEqual(plan(sTim, p).member_ids.sort(), [mSara, mTim].sort());
  assert.equal(sTim.toestand.planOnderdelen.find(x => x.id === o).name, 'Voorbereiding');
  const isolatie = taak(sTim, 'Isolatie ' + run);
  assert.deepEqual([isolatie.plan_id, isolatie.plan_section_id, isolatie.assignee_member_id], [p, o, mTim]);
  // Bezig, en afvinken maakt Bezig leeg (de server); weer openzetten laat het leeg.
  assert.ok((await sTim.acties.taakBijwerken(isolatie, { started_on: '2026-11-11' })).ok);
  await sSara.vernieuw();
  assert.equal(taak(sSara, 'Isolatie ' + run).started_on, '2026-11-11');
  assert.ok((await sSara.acties.taakAfvinken(taak(sSara, 'Isolatie ' + run), '2026-11-11')).ok);
  await sTim.vernieuw();
  assert.equal(taak(sTim, 'Isolatie ' + run).done_on, '2026-11-11');
  assert.equal(taak(sTim, 'Isolatie ' + run).started_on, null);
  // Bo (ander huishouden) ziet niets en koppelt niets.
  await sBo.vernieuw();
  assert.equal(sBo.toestand.plannen.length, 0);
  assert.equal((await sBo.acties.taakToevoegen('Indringer', { due_date: null, assignee_member_id: null, plan_id: p })).ok, false);
});

test('versiecontrole: twee leden passen tegelijk hetzelfde plan aan; de tweede krijgt een conflict, niets gaat stil verloren', async () => {
  const p = randomUUID();
  assert.ok((await sSara.acties.planToevoegen(p, { title: 'Tuin ' + run })).ok);
  await sSara.vernieuw();
  await sTim.vernieuw();
  const oudSara = plan(sSara, p), oudTim = plan(sTim, p);
  assert.ok((await sSara.acties.planBijwerken(oudSara, { title: 'Tuin aanleggen ' + run })).ok);
  const r = await sTim.acties.planBijwerken(oudTim, { title: 'Moestuin ' + run });
  assert.equal(r.ok, false);
  assert.equal(r.melding?.soort, 'conflict');
  await sTim.vernieuw();
  assert.equal(plan(sTim, p).title, 'Tuin aanleggen ' + run);
});

test('verwijderen: standaard blijven de taken als losse taken; "plan en taken" neemt ze mee, en terugzetten zet precies dat terug', async () => {
  const p1 = randomUUID(), p2 = randomUUID(), o2 = randomUUID();
  assert.ok((await sSara.acties.planToevoegen(p1, { title: 'Schuur ' + run })).ok);
  assert.ok((await sSara.acties.taakToevoegen('Planken ' + run, { due_date: null, assignee_member_id: null, plan_id: p1 })).ok);
  await sSara.vernieuw();
  assert.ok((await sSara.acties.planVerwijderen(plan(sSara, p1))).ok);
  await sTim.vernieuw();
  assert.equal(plan(sTim, p1), undefined);
  assert.equal(taak(sTim, 'Planken ' + run).plan_id, null, 'de taak blijft niet als losse taak');
  assert.ok((await sSara.acties.planToevoegen(p2, { title: 'Garage ' + run })).ok);
  assert.ok((await sSara.acties.onderdeelToevoegen(o2, { plan_id: p2, name: 'Afvoeren' })).ok);
  assert.ok((await sSara.acties.taakToevoegen('Fietsen ' + run, { due_date: null, assignee_member_id: null, plan_id: p2, plan_section_id: o2 })).ok);
  await sSara.vernieuw();
  const weg = await sSara.acties.planVerwijderen(plan(sSara, p2), true);
  assert.ok(weg.ok);
  await sTim.vernieuw();
  assert.equal(taak(sTim, 'Fietsen ' + run), undefined, 'de taak gaat niet mee');
  assert.ok((await sSara.acties.planHerstellen({ id: p2 }, weg.data[0].version)).ok);
  await sTim.vernieuw();
  assert.ok(plan(sTim, p2));
  assert.equal(taak(sTim, 'Fietsen ' + run)?.plan_section_id, o2, 'terugzetten zet de taak niet terug');
  // Een onderdeel verwijderen: de taak blijft in het plan.
  await sSara.vernieuw();
  assert.ok((await sSara.acties.onderdeelVerwijderen(sSara.toestand.planOnderdelen.find(x => x.id === o2))).ok);
  await sTim.vernieuw();
  const f = taak(sTim, 'Fietsen ' + run);
  assert.deepEqual([f.plan_id, f.plan_section_id], [p2, null]);
});

test('realtime: een wijziging aan een plan bereikt de partner via een seintje (zonder ophaalronde van de partner zelf)', async () => {
  const p = randomUUID();
  assert.ok((await sSara.acties.planToevoegen(p, { title: 'Seintje ' + run })).ok);
  await totdat(() => !!plan(sTim, p), 15000, 'plan bij Tim via het kanaal');
});
