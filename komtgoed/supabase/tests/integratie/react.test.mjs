// Thuisplanner React-integratie: de acties en gegevens die de React-app nieuw van de sync-module gebruikt,
// tegen een echte, LOKALE Supabase-stack met twee accounts. Zie docs/thuisplanner-app.md.
//   - uitzonderingen op herhalende afspraken (ook over meerdere pagina's), zodat de app verwijderde en
//     losgemaakte voorkomens niet meer toont;
//   - één voorkomen wijzigen of verwijderen (edit_occurrence / delete_occurrence), zichtbaar bij de ander;
//   - een taak bijwerken met versiecontrole (verouderde versie = conflict, niets overschreven).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { maakSync, STATUS } from '../../../sync/thuisplanner-sync.js';

const { API_URL, ANON_KEY, SERVICE_ROLE_KEY, DB_URL } = process.env;
for (const u of [API_URL, DB_URL]) {
  if (!u || !/\/\/([^@/]*@)?(127\.0\.0\.1|localhost)[:/]/.test(u)) throw new Error('Weigering: alleen een lokale Supabase');
}
const sql = q => execFileSync(process.env.PSQL || 'psql', ['-X', '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1', '-d', DB_URL, '-c', q]).toString().trim();
const wacht = ms => new Promise(r => setTimeout(r, ms));
async function totdat(f, ms = 10000, wat = 'voorwaarde') {
  const eind = Date.now() + ms;
  while (Date.now() < eind) { if (await f()) return; await wacht(100); }
  throw new Error('Niet binnen ' + ms + ' ms: ' + wat);
}

const admin = createClient(API_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const run = randomUUID().slice(0, 8);
const wachtwoord = 'React-' + randomUUID();
const personen = {};
const syncs = [];

async function persoon(naam) {
  const email = `${naam}-${run}@test.invalid`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: wachtwoord, email_confirm: true });
  assert.ifError(error);
  const c = createClient(API_URL, ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  assert.ifError((await c.auth.signInWithPassword({ email, password: wachtwoord })).error);
  personen[naam] = { id: data.user.id, c };
}
// Eén sync per sessie tegelijk (zoals in de app: de Sessie stopt een vorige eerst).
const actief = {};
async function startSync(naam, opties = {}) {
  if (actief[naam]) await actief[naam].stop();
  const s = maakSync({ supabase: personen[naam].c, huishoudenId: h, vangnetMs: 60000, ...opties });
  actief[naam] = s;
  syncs.push(s);
  await s.start();
  await totdat(() => s.toestand.status === STATUS.VERBONDEN, 30000, naam + ' verbonden');
  return s;
}
const uitz = (s, reeks) => s.toestand.uitzonderingen.filter(u => u.series_id === reeks).map(u => u.occurrence_date).sort();

let h;
before(async () => {
  for (const n of ['eva', 'thomas']) await persoon(n);
  h = (await personen.eva.c.rpc('create_household', { p_name: 'React ' + run, p_display_name: 'Eva' })).data;
  const tok = (await personen.eva.c.rpc('create_invite', { p_household: h, p_member: null, p_role: 'member' })).data;
  assert.ifError((await personen.thomas.c.rpc('accept_invite', { p_token: tok, p_display_name: 'Thomas' })).error);
});

after(async () => {
  sql(`delete from public.households where name like '%${run}%'`);
  for (const p of Object.values(personen)) await admin.auth.admin.deleteUser(p.id);
  await Promise.race([Promise.allSettled(syncs.map(s => s.stop())), wacht(5000)]);
  for (const p of Object.values(personen)) p.c.realtime.disconnect();
});

test('Herhalende afspraak: één voorkomen verwijderen en één wijzigen; de ander ziet de uitzonderingen en het losgemaakte voorkomen', { timeout: 60000 }, async () => {
  // Kleine pagina's: de uitzonderingen komen over meerdere pagina's binnen (keyset op reeks + datum).
  const eva = await startSync('eva', { paginaGrootte: 2 });
  const thomas = await startSync('thomas', { paginaGrootte: 2 });
  const reeks = randomUUID();
  assert.ok((await eva.acties.afspraakBewaren({ id: reeks, start_date: '2026-11-02', start_time: '09:15', title: 'Zwemles', recurrence_freq: 'weekly' })).ok);
  await totdat(() => thomas.toestand.afspraken.some(a => a.id === reeks), 10000, 'Thomas ziet de reeks');

  for (const d of ['2026-11-09', '2026-11-16', '2026-11-23']) {
    assert.ok((await eva.acties.afspraakVoorkomenVerwijderen(reeks, d)).ok, 'verwijderen ' + d);
  }
  const los = randomUUID();
  const r = await thomas.acties.afspraakVoorkomenWijzigen(reeks, '2026-11-30', {
    id: los, start_date: '2026-12-01', start_time: '10:00', title: 'Zwemles (verzet)', participant_ids: [],
  });
  assert.ok(r.ok, JSON.stringify(r.melding));

  const verwacht = ['2026-11-09', '2026-11-16', '2026-11-23', '2026-11-30'];
  await totdat(() => uitz(eva, reeks).length === 4 && uitz(thomas, reeks).length === 4, 10000, 'beide zien 4 uitzonderingen');
  assert.deepEqual(uitz(eva, reeks), verwacht);
  assert.deepEqual(uitz(thomas, reeks), verwacht);
  await totdat(() => eva.toestand.afspraken.some(a => a.id === los), 10000, 'Eva ziet het losgemaakte voorkomen');
  const l = eva.toestand.afspraken.find(a => a.id === los);
  assert.equal(l.series_id, reeks);
  assert.equal(l.original_date, '2026-11-30');
  assert.equal(l.title, 'Zwemles (verzet)');

  // Een verse sessie haalt alles in één keer op (geen seintjes nodig), ook met kleine pagina's.
  const vers = await startSync('eva', { paginaGrootte: 1 });
  assert.deepEqual(uitz(vers, reeks), verwacht);
});

test('Taak bijwerken: titel, datum en wie; met een verouderde versie een conflict in plaats van overschrijven', { timeout: 60000 }, async () => {
  const eva = await startSync('eva');
  const thomas = await startSync('thomas');
  assert.ok((await eva.acties.taakToevoegen('Fietsband plakken')).ok);
  await totdat(() => thomas.toestand.taken.some(t => t.title === 'Fietsband plakken'), 10000, 'Thomas ziet de taak');
  const lidThomas = thomas.toestand.lid.member_id;

  // Eva opent de taak (onthoudt de versie); Thomas wijzigt intussen; Eva bewaart daarna.
  const bijEva = eva.toestand.taken.find(t => t.title === 'Fietsband plakken');
  const bijThomas = thomas.toestand.taken.find(t => t.title === 'Fietsband plakken');
  assert.ok((await thomas.acties.taakBijwerken(bijThomas, { title: 'Fietsband Lotte plakken', due_date: '2026-11-03', assignee_member_id: lidThomas })).ok);
  await totdat(() => eva.toestand.taken.some(t => t.title === 'Fietsband Lotte plakken'), 10000, 'Eva ziet de wijziging');
  const r = await eva.acties.taakBijwerken(bijEva, { title: 'Fietsband (oud)' }, bijEva.version);
  assert.equal(r.ok, false);
  assert.equal(r.melding?.soort, 'conflict');
  const opServer = sql(`select title || '|' || due_date || '|' || assignee_member_id from public.tasks where id = '${bijEva.id}'`);
  assert.equal(opServer, `Fietsband Lotte plakken|2026-11-03|${lidThomas}`);
});
