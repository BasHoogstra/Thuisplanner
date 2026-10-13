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

// ---- Herstelronde 1, bevinding 4: privé-afspraak zonder bewaarde inhoud opnieuw invoeren ----------------
// Een client waarvan save_event "de verbinding verliest": 'weg' = het verzoek komt niet aan, 'antwoordWeg'
// = de server voert het uit maar het antwoord komt niet terug. 'normaal' = gewoon doorlaten.
async function clientMetVerbinding(naam) {
  const net = { saveEvent: 'normaal' };
  const f = async (url, init = {}) => {
    const u = String(url?.url || url);
    if (new URL(u).pathname === '/rest/v1/rpc/save_event' && net.saveEvent !== 'normaal') {
      if (net.saveEvent === 'antwoordWeg') await fetch(url, init);
      throw new TypeError('fetch failed (verbinding weg)');
    }
    return fetch(url, init);
  };
  const c = createClient(API_URL, ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: f } });
  assert.ifError((await c.auth.signInWithPassword({ email: `${naam}-${run}@test.invalid`, password: wachtwoord })).error);
  return { c, net };
}
// Opslag zoals localStorage (alleen wat de sync-module duurzaam bewaart).
function opslagNieuw() {
  const m = new Map();
  return { get length() { return m.size; }, key: i => [...m.keys()][i] ?? null, getItem: k => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); }, removeItem: k => { m.delete(k); }, m };
}
async function syncOp(c, opslag) {
  const s = maakSync({ supabase: c, huishoudenId: h, vangnetMs: 60000, opslag, geheugen: new Map() });
  syncs.push(s);
  await s.start();
  await totdat(() => s.toestand.status === STATUS.VERBONDEN, 30000, 'verbonden');
  return s;
}
const prive = (titel, datum = '2026-11-12') => ({ start_date: datum, start_time: '10:00', end_time: '11:00', visibility: 'private', title: titel, notes: 'Pasje mee' });
const telAfspraken = (titel) => Number(sql(`select count(*) from public.event_details d join public.events e on e.id = d.event_id where e.household_id = '${h}' and d.title = '${titel}' and e.deleted_at is null`));

test('Privé-afspraak niet aangekomen → herladen → opnieuw invoeren met dezelfde ID: één afspraak, met die ID', { timeout: 60000 }, async () => {
  for (const s of Object.values(actief)) await s.stop();
  const { c, net } = await clientMetVerbinding('eva');
  const opslag = opslagNieuw();
  const voor = await syncOp(c, opslag);
  net.saveEvent = 'weg';
  const r = await voor.acties.afspraakBewaren(prive('Huisarts Eva'));
  assert.equal(r.ok, false);
  const id = r.id ?? voor.openstaand[0]?.id;
  assert.ok(id, 'geen opdracht-ID');
  // Op het toestel: identiteit, geen inhoud.
  assert.equal(opslag.m.size, 1);
  assert.ok(![...opslag.m.values()][0].includes('Huisarts'), 'inhoud van een privé-afspraak in de opslag');
  await voor.stop();

  // Herladen: nieuw paginageheugen, zelfde opslag. Een plaatshouder zonder inhoud, met dezelfde ID.
  net.saveEvent = 'normaal';
  const na = await syncOp(c, opslag);
  const plaats = na.toestand.afspraken.find(a => a.id === id);
  assert.ok(plaats?.inhoudNietBewaard, 'geen plaatshouder zonder inhoud na herladen');
  assert.equal((await na.acties.opnieuwProberen(id)).inhoudOntbreekt, true, 'opnieuw proberen zonder inhoud moet om de inhoud vragen');

  // Opnieuw invoeren zoals de app doet: afspraakBewaren met dezelfde id en zonder versie.
  const her = await na.acties.afspraakBewaren({ ...prive('Huisarts Eva'), id });
  assert.ok(her.ok, JSON.stringify(her.melding));
  assert.equal(telAfspraken('Huisarts Eva'), 1);
  assert.equal(sql(`select count(*) from public.events where id = '${id}'`), '1');
  assert.equal(opslag.m.size, 0, 'bevestigde opdracht nog op het toestel');
  await na.stop();
});

test('Privé-afspraak wél aangekomen (antwoord weg) → herladen: laat bevestigd; herinvoer daarna maakt geen tweede', { timeout: 60000 }, async () => {
  const { c, net } = await clientMetVerbinding('eva');
  const opslag = opslagNieuw();
  const voor = await syncOp(c, opslag);
  net.saveEvent = 'antwoordWeg';
  const r = await voor.acties.afspraakBewaren(prive('Tandarts Eva'));
  assert.equal(r.ok, false);
  const id = r.id ?? [...opslag.m.keys()][0].split(':').pop();
  await voor.stop();
  net.saveEvent = 'normaal';

  const na = await syncOp(c, opslag);
  // De eerste ronde ziet de afspraak op de server: bevestigd, zonder herinvoer.
  await totdat(() => na.toestand.afspraken.some(a => a.id === id && a.title === 'Tandarts Eva' && !a.inhoudNietBewaard), 10000, 'laat bevestigd');
  assert.equal(opslag.m.size, 0);
  // Een verouderd herinvoer-venster dat toch nog opslaat (zelfde ID): geen tweede afspraak.
  const her = await na.acties.afspraakBewaren({ ...prive('Tandarts Eva'), id });
  assert.ok(her.ok, JSON.stringify(her.melding));
  assert.equal(telAfspraken('Tandarts Eva'), 1);
  await na.stop();
});

test('Herinvoer terwijl het antwoord opnieuw wegvalt, dan opnieuw proberen: nog steeds één afspraak', { timeout: 60000 }, async () => {
  const { c, net } = await clientMetVerbinding('eva');
  const opslag = opslagNieuw();
  const voor = await syncOp(c, opslag);
  net.saveEvent = 'weg';
  const r = await voor.acties.afspraakBewaren(prive('Pedicure Eva'));
  const id = r.id ?? [...opslag.m.keys()][0].split(':').pop();
  await voor.stop();

  const na = await syncOp(c, opslag);
  net.saveEvent = 'antwoordWeg';
  const her = await na.acties.afspraakBewaren({ ...prive('Pedicure Eva'), id });
  assert.equal(her.ok, false);
  net.saveEvent = 'normaal';
  const opnieuw = await na.acties.opnieuwProberen(id);
  assert.ok(opnieuw.ok, JSON.stringify(opnieuw.melding));
  assert.equal(telAfspraken('Pedicure Eva'), 1);
  assert.equal(sql(`select count(*) from public.events where id = '${id}'`), '1');
  await na.stop();
});
