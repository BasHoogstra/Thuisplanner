// Thuisplanner KG-5D: de synchronisatielaag (thuisplanner/sync/thuisplanner-sync.js) tegen een echte, LOKALE
// Supabase-stack, met aparte accounts en sessies. Zie docs/thuisplanner-sync.md.
//   thuisplanner/supabase/tests/integratie/run.sh
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
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

// De service-role-sleutel blijft in dit testproces (opzet en opruimen); de clients krijgen hem nooit.
const admin = createClient(API_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const run = randomUUID().slice(0, 8);
const wachtwoord = 'Sync-' + randomUUID();
const personen = {};
const syncs = [];

// Een client met een eigen "netwerk": staat het uit, dan falen HTTP en websocket (zoals offline gaan).
function clientMetNetwerk() {
  const net = { uit: false };
  const fetchMetNet = (...a) => (net.uit ? Promise.reject(new TypeError('fetch failed (netwerk uit)')) : fetch(...a));
  class WsMetNet extends WebSocket {
    constructor(url, protocols) { super(net.uit ? 'ws://127.0.0.1:9/' : url, protocols); }
  }
  const c = createClient(API_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: fetchMetNet },
    realtime: { transport: WsMetNet },
  });
  return { c, net };
}
async function persoon(naam) {
  const email = `${naam}-${run}@test.invalid`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: wachtwoord, email_confirm: true });
  assert.ifError(error);
  const { c, net } = clientMetNetwerk();
  assert.ifError((await c.auth.signInWithPassword({ email, password: wachtwoord })).error);
  personen[naam] = { id: data.user.id, c, net };
  return personen[naam];
}
// Eén sync per sessie tegelijk (zoals in de app); een vorige van dezelfde persoon stopt eerst.
const actief = {};
async function startSync(naam, h) {
  if (actief[naam]) await actief[naam].stop();
  const s = maakSync({ supabase: personen[naam].c, huishoudenId: h, vangnetMs: 60000 });
  actief[naam] = s;
  syncs.push(s);
  await s.start();
  return s;
}
// Een tweede, losse sessie van dezelfde persoon (om ruwe kanaalberichten te bekijken).
async function tweedeSessie(naam) {
  const c = createClient(API_URL, ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  assert.ifError((await c.auth.signInWithPassword({ email: `${naam}-${run}@test.invalid`, password: wachtwoord })).error);
  return c;
}
const naamLijst = s => s.toestand.boodschappen.map(b => b.name).sort();

let h, hEigen;
before(async () => {
  for (const n of ['anna', 'bram', 'carla']) await persoon(n);
  h = (await personen.anna.c.rpc('create_household', { p_name: 'Sync ' + run, p_display_name: 'Anna' })).data;
  const tok = (await personen.anna.c.rpc('create_invite', { p_household: h, p_member: null, p_role: 'member' })).data;
  assert.ifError((await personen.bram.c.rpc('accept_invite', { p_token: tok, p_display_name: 'Bram' })).error);
  hEigen = (await personen.carla.c.rpc('create_household', { p_name: 'Carla ' + run, p_display_name: 'Carla' })).data;
});

after(async () => {
  // Eerst de testgegevens weg (snel en zeker), dan de kanalen stoppen (begrensd: afmelden kan haperen).
  sql(`delete from public.households where name like '%${run}%'`);
  for (const p of Object.values(personen)) await admin.auth.admin.deleteUser(p.id);
  await Promise.race([Promise.allSettled(syncs.map(s => s.stop())), wacht(5000)]);
  for (const p of Object.values(personen)) { p.net.uit = false; p.c.realtime.disconnect(); }
});

test('A voegt toe, vinkt af, hernoemt en verwijdert; B ziet het zonder te verversen', { timeout: 60000 }, async () => {
  const a = await startSync('anna', h), b = await startSync('bram', h);
  await totdat(() => a.toestand.status === STATUS.VERBONDEN && b.toestand.status === STATUS.VERBONDEN, 30000, 'beide verbonden');
  assert.ok((await a.acties.boodschapToevoegen('Melk')).ok);
  await totdat(() => naamLijst(b).includes('Melk'), 10000, 'B ziet Melk');
  const melk = () => b.toestand.boodschappen.find(x => x.name === 'Melk');
  const ma = a.toestand.boodschappen.find(x => x.name === 'Melk');
  assert.ok((await a.acties.boodschapAfvinken(ma)).ok);
  await totdat(() => melk()?.checked_at, 10000, 'B ziet afgevinkt');
  assert.ok((await a.acties.boodschapHernoemen(a.toestand.boodschappen.find(x => x.name === 'Melk'), 'Halfvolle melk')).ok);
  await totdat(() => naamLijst(b).includes('Halfvolle melk'), 10000, 'B ziet nieuwe naam');
  assert.ok((await a.acties.boodschapVerwijderen(a.toestand.boodschappen.find(x => x.name === 'Halfvolle melk'))).ok);
  await totdat(() => !naamLijst(b).includes('Halfvolle melk'), 10000, 'B ziet verwijdering');
  // Taken: toevoegen en afvinken
  assert.ok((await b.acties.taakToevoegen('Gymtas')).ok);
  await totdat(() => a.toestand.taken.some(t => t.title === 'Gymtas'), 10000, 'A ziet taak');
  // K1: de server bewaart precies de dag die de app als "vandaag" meegeeft (geen UTC-datum).
  assert.ok((await a.acties.taakAfvinken(a.toestand.taken.find(t => t.title === 'Gymtas'), '2026-10-16')).ok);
  await totdat(() => b.toestand.taken.find(t => t.title === 'Gymtas')?.done_on, 10000, 'B ziet taak afgevinkt');
  assert.equal(b.toestand.taken.find(t => t.title === 'Gymtas').done_on, '2026-10-16');
  assert.ok(b.statistiek.seintjes > 0, 'B kreeg geen seintjes (dan was het alleen het vangnet)');
});

test('Geen dubbele verwerking: herhaalde opdracht, salvo van seintjes en bekende versies', { timeout: 60000 }, async () => {
  const a = await startSync('anna', h), b = await startSync('bram', h);
  await totdat(() => a.toestand.status === STATUS.VERBONDEN && b.toestand.status === STATUS.VERBONDEN, 30000, 'verbonden');
  // Dezelfde toevoeging (zelfde UUID) twee keer versturen, zoals bij een herhaalde opdracht.
  const id = randomUUID();
  for (let i = 0; i < 2; i++) assert.ifError((await personen.anna.c.rpc('add_shopping_items', { p_household: h, p_ids: [id], p_names: ['Brood'] })).error);
  await totdat(() => naamLijst(b).includes('Brood'), 10000, 'B ziet Brood');
  await wacht(1000);
  assert.equal(b.toestand.boodschappen.filter(x => x.name === 'Brood').length, 1);
  assert.equal(a.toestand.boodschappen.filter(x => x.name === 'Brood').length, 1);
  // Een salvo van vijf boodschappen in één opdracht = vijf seintjes vlak na elkaar. B verwerkt ze
  // samen (debounce + één ronde tegelijk): veel minder ophaalrondes dan seintjes, en elk item één keer.
  const voor = { ...b.statistiek };
  const namen = ['Appels', 'Peren', 'Druiven', 'Kiwi', 'Mango'];
  assert.ifError((await personen.anna.c.rpc('add_shopping_items', { p_household: h, p_ids: namen.map(() => randomUUID()), p_names: namen })).error);
  await totdat(() => namen.every(n => naamLijst(b).includes(n)), 10000, 'B ziet het salvo');
  await wacht(1500);
  const seintjes = b.statistiek.seintjes - voor.seintjes, rondes = b.statistiek.rondes - voor.rondes;
  assert.ok(seintjes >= namen.length, `verwacht minstens ${namen.length} seintjes, kreeg ${seintjes}`);
  assert.ok(rondes <= 2, `te veel ophaalrondes (${rondes}) voor ${seintjes} seintjes`);
  for (const n of namen) assert.equal(b.toestand.boodschappen.filter(x => x.name === n).length, 1, n + ' dubbel');
  // Een seintje voor een versie die B al heeft, wordt overgeslagen (geen extra ronde).
  const nu = b.statistiek;
  const bekend = b.toestand.boodschappen.find(x => x.name === 'Appels');
  b.verwerkSeintje({ payload: { t: 'shopping_items', id: bekend.id, v: bekend.version, op: 'U' } });
  await wacht(500);
  assert.equal(b.statistiek.genegeerd, nu.genegeerd + 1);
  assert.equal(b.statistiek.rondes, nu.rondes);
});

test('Gelijktijdig wijzigen: verouderde versie = conflictmelding, niets gaat verloren', { timeout: 60000 }, async () => {
  const a = await startSync('anna', h), b = await startSync('bram', h);
  await totdat(() => a.toestand.status === STATUS.VERBONDEN && b.toestand.status === STATUS.VERBONDEN, 30000, 'verbonden');
  assert.ok((await a.acties.boodschapToevoegen('Eieren')).ok);
  await totdat(() => naamLijst(b).includes('Eieren'), 10000, 'B ziet Eieren');
  // B begint te bewerken (onthoudt de versie), A wijzigt intussen, B bewaart daarna.
  const bijB = b.toestand.boodschappen.find(x => x.name === 'Eieren');
  assert.ok((await a.acties.boodschapHernoemen(a.toestand.boodschappen.find(x => x.name === 'Eieren'), 'Eieren (scharrel)')).ok);
  const r = await b.acties.boodschapHernoemen(bijB, 'Eieren (10)', bijB.version);
  assert.equal(r.ok, false);
  assert.equal(r.melding.soort, 'conflict');
  await totdat(() => naamLijst(b).includes('Eieren (scharrel)'), 10000, 'B ziet de winnende versie');
  // Tegelijk afvinken door beiden met dezelfde versie: precies één wint, de ander krijgt een conflict.
  const x = a.toestand.boodschappen.find(i => i.name === 'Eieren (scharrel)');
  const y = b.toestand.boodschappen.find(i => i.name === 'Eieren (scharrel)');
  const [ra, rb] = await Promise.all([a.acties.boodschapAfvinken(x), b.acties.boodschapAfvinken(y)]);
  assert.equal([ra.ok, rb.ok].filter(Boolean).length, 1, 'precies één afvinkactie wint');
  assert.equal(sql(`select version from public.shopping_items where id = '${x.id}'`), String(x.version + 1));
  // Afspraak: verouderde versie via save_event (PT409).
  const e = randomUUID();
  assert.ok((await a.acties.afspraakBewaren({ id: e, start_date: '2026-11-20', title: 'Ouderavond' })).ok);
  await totdat(() => b.toestand.afspraken.some(x => x.id === e), 10000, 'B ziet afspraak');
  assert.ok((await a.acties.afspraakBewaren({ id: e, version: 1, start_date: '2026-11-20', title: 'Ouderavond (verzet)' })).ok);
  const rc = await b.acties.afspraakBewaren({ id: e, version: 1, start_date: '2026-11-20', title: 'Ouderavond (oud)' });
  assert.equal(rc.melding?.soort, 'conflict');
});

test('Verbinding weg en terug: status offline, daarna de gemiste wijzigingen alsnog binnen', { timeout: 90000 }, async () => {
  const a = await startSync('anna', h), b = await startSync('bram', h);
  await totdat(() => a.toestand.status === STATUS.VERBONDEN && b.toestand.status === STATUS.VERBONDEN, 30000, 'verbonden');
  personen.bram.net.uit = true;
  personen.bram.c.realtime.disconnect();
  await totdat(() => b.toestand.status === STATUS.OFFLINE, 15000, 'B offline');
  // Zonder antwoord is de uitkomst onbekend: niet "niet opgeslagen" melden, maar "niet bevestigd" tonen
  // met dezelfde UUID (KG-5D herstelronde, bevinding 3). Niets wordt automatisch later verstuurd.
  const r = await b.acties.boodschapToevoegen('Offline toegevoegd');
  assert.equal(r.ok, false);
  assert.equal(r.melding.soort, 'onzeker');
  assert.ok(r.onzeker && r.id);
  assert.ok(b.toestand.boodschappen.find(x => x.id === r.id)?.onzeker, 'onbevestigde toevoeging zichtbaar als onzeker');
  assert.ok((await a.acties.boodschapToevoegen('Tijdens storing')).ok);
  await wacht(2000);
  assert.ok(!naamLijst(b).includes('Tijdens storing'));
  personen.bram.net.uit = false;
  await totdat(() => naamLijst(b).includes('Tijdens storing'), 45000, 'B haalt de gemiste wijziging op');
  await totdat(() => b.toestand.status === STATUS.VERBONDEN, 45000, 'B weer verbonden');
  // Bram probeert opnieuw: dezelfde UUID, precies één keer opgeslagen.
  assert.ok((await b.acties.opnieuwProberen(r.id)).ok);
  assert.equal(sql(`select count(*) from public.shopping_items where household_id = '${h}' and name = 'Offline toegevoegd'`), '1');
  assert.equal(sql(`select id from public.shopping_items where household_id = '${h}' and name = 'Offline toegevoegd'`), r.id);
  // En daarna gewoon weer live.
  assert.ok((await a.acties.boodschapToevoegen('Na herstel')).ok);
  await totdat(() => naamLijst(b).includes('Na herstel'), 10000, 'B weer live');
});

test('Huishoudisolatie: een ander huishouden ziet en hoort niets', { timeout: 60000 }, async () => {
  const c = await startSync('carla', h);   // Carla is geen lid van h
  assert.equal(c.toestand.status, STATUS.GEEN_TOEGANG);
  assert.deepEqual([c.toestand.boodschappen, c.toestand.taken, c.toestand.afspraken], [[], [], []]);
  // Kanaal van h direct proberen (eigen sessie): geweigerd.
  const carla2 = await tweedeSessie('carla');
  await carla2.realtime.setAuth();
  const k = carla2.channel(sql(`select private.household_topic('${h}')`), { config: { private: true } });
  const status = await new Promise(r => { const t = setTimeout(() => r('GEEN_ANTWOORD'), 10000); k.subscribe(s => { clearTimeout(t); r(s); }); });
  await carla2.removeChannel(k);
  assert.equal(status, 'CHANNEL_ERROR');
  // Carla's eigen huishouden blijft leeg als Anna iets toevoegt.
  const eigen = await startSync('carla', hEigen);
  await totdat(() => eigen.toestand.status === STATUS.VERBONDEN, 30000, 'Carla verbonden');
  const a = await startSync('anna', h);
  assert.ok((await a.acties.boodschapToevoegen('Alleen voor Anna')).ok);
  await wacht(3000);
  assert.ok(!naamLijst(eigen).includes('Alleen voor Anna'));
  assert.equal(eigen.statistiek.seintjes, 0, 'Carla kreeg een seintje van een ander huishouden');
});

test('Privacy: privé-afspraak voor de eigenaar volledig, voor het andere lid alleen "Bezet" (ook in seintjes en cache)', { timeout: 60000 }, async () => {
  const a = await startSync('anna', h), b = await startSync('bram', h);
  await totdat(() => a.toestand.status === STATUS.VERBONDEN && b.toestand.status === STATUS.VERBONDEN, 30000, 'verbonden');
  // Alle ruwe berichten op het kanaal bij Bram vastleggen.
  const ruw = [];
  const bram2 = await tweedeSessie('bram');
  await bram2.realtime.setAuth();
  const k = bram2.channel(b.kanaalNaam, { config: { private: true } }).on('broadcast', { event: '*' }, m => ruw.push(m));
  await new Promise(r => k.subscribe(s => s === 'SUBSCRIBED' && r()));
  const id = randomUUID();
  assert.ok((await a.acties.afspraakBewaren({ id, start_date: '2026-11-21', start_time: '09:00', end_time: '10:00', visibility: 'private',
    title: 'Sync-geheim', location: 'Plek-geheim', notes: 'Notitie-geheim' })).ok);
  await totdat(() => b.toestand.afspraken.some(x => x.id === id), 10000, 'B ziet de afspraak (als bezet)');
  await totdat(() => ruw.length > 0, 10000, 'seintje bij B');
  const bijB = b.toestand.afspraken.find(x => x.id === id);
  assert.equal(bijB.is_busy, true);
  assert.deepEqual([bijB.title, bijB.location, bijB.notes, bijB.preparation], [null, null, null, null]);
  assert.equal(a.toestand.afspraken.find(x => x.id === id).title, 'Sync-geheim');
  assert.ok(!JSON.stringify(b.toestand).includes('geheim'), 'privé-tekst in de clientcache van B');
  for (const m of ruw) {
    assert.deepEqual(Object.keys(m.payload).filter(x => !['t', 'id', 'v', 'op'].includes(x)), [], 'seintje met extra velden');
    assert.ok(!JSON.stringify(m).includes('geheim'), 'privé-tekst in een seintje');
    assert.ok(!JSON.stringify(m).includes(personen.anna.id), 'account-ID in een seintje');
  }
  // Wijzigen door B: dezelfde neutrale melding als bij een onbekend id.
  const w = await b.acties.afspraakBewaren({ id, version: 1, start_date: '2026-11-21', title: 'Gekaapt', visibility: 'private' });
  assert.equal(w.melding.soort, 'toegang');
  assert.ok(!JSON.stringify(b.toestand).includes('geheim'));
  await bram2.removeChannel(k);
  // De module schrijft niets naar de console (geen inhoud in logboeken).
  assert.ok(!/console\./.test(readFileSync(new URL('../../../sync/thuisplanner-sync.js', import.meta.url), 'utf8')));
});

test('Toegang ingetrokken tijdens een sessie: B ziet "geen toegang" en de gegevens zijn uit het geheugen', { timeout: 90000 }, async () => {
  const a = await startSync('anna', h), b = await startSync('bram', h);
  await totdat(() => a.toestand.status === STATUS.VERBONDEN && b.toestand.status === STATUS.VERBONDEN, 30000, 'verbonden');
  assert.ok((await a.acties.boodschapToevoegen('Voor het archiveren')).ok);
  await totdat(() => naamLijst(b).includes('Voor het archiveren'), 10000, 'B ziet het');
  const mBram = (await personen.anna.c.from('household_members').select('id,display_name').eq('household_id', h)).data.find(m => m.display_name === 'Bram').id;
  assert.ifError((await personen.anna.c.rpc('archive_member', { p_household: h, p_member: mBram })).error);
  await totdat(() => b.toestand.status === STATUS.GEEN_TOEGANG, 15000, 'B ziet geen toegang');
  assert.deepEqual([b.toestand.boodschappen, b.toestand.taken, b.toestand.afspraken, b.toestand.lid], [[], [], [], null]);
  // Daarna komt er niets meer binnen.
  assert.ok((await a.acties.boodschapToevoegen('Na het archiveren')).ok);
  await wacht(3000);
  assert.deepEqual(b.toestand.boodschappen, []);
  // Stoppen (uitloggen of ander huishouden kiezen) wist ook alles bij A.
  await a.stop();
  assert.deepEqual([a.toestand.boodschappen, a.toestand.afspraken, a.toestand.status], [[], [], STATUS.GESTOPT]);
});

// K3 (docs/thuisplanner-k3-archiveren.md): archiveren met een bewaartermijn. Na archiveren verdwijnt de privé-
// afspraak van het gearchiveerde lid bij een ander lid uit de sync (ook als "Bezet"), zonder dat er inhoud in een
// seintje of cache komt; de gedeelde afspraak blijft. Terughalen brengt "Bezet" terug. Verwijdert de betrokkene
// tijdens het archief het eigen account, dan zijn de privé-afspraken direct definitief weg.
test('K3 archiveren: privé verdwijnt (ook "Bezet"), gedeeld blijft; terughalen brengt "Bezet" terug; account weg = privé weg', { timeout: 90000 }, async () => {
  const dirk = await persoon('dirk');
  const hK = (await personen.anna.c.rpc('create_household', { p_name: 'K3 ' + run, p_display_name: 'Anna' })).data;
  for (const [naam, weergave] of [['dirk', 'Dirk'], ['bram', 'Bram']]) {
    const tok = (await personen.anna.c.rpc('create_invite', { p_household: hK, p_member: null, p_role: 'member' })).data;
    assert.ifError((await personen[naam].c.rpc('accept_invite', { p_token: tok, p_display_name: weergave })).error);
  }
  const mDirk = (await personen.anna.c.from('household_members').select('id,display_name').eq('household_id', hK)).data.find(m => m.display_name === 'Dirk').id;
  const d = maakSync({ supabase: dirk.c, huishoudenId: hK, vangnetMs: 60000 });
  syncs.push(d);
  await d.start();
  const b = await startSync('bram', hK);
  await totdat(() => d.toestand.status === STATUS.VERBONDEN && b.toestand.status === STATUS.VERBONDEN, 30000, 'verbonden');
  const prive = randomUUID(), gedeeld = randomUUID();
  assert.ok((await d.acties.afspraakBewaren({ id: prive, start_date: '2026-11-23', start_time: '09:00', end_time: '10:00', visibility: 'private', title: 'K3-geheim' })).ok);
  assert.ok((await d.acties.afspraakBewaren({ id: gedeeld, start_date: '2026-11-24', start_time: '19:00', end_time: '20:00', visibility: 'household', title: 'K3-gedeeld' })).ok);
  await totdat(() => b.toestand.afspraken.some(x => x.id === prive && x.is_busy) && b.toestand.afspraken.some(x => x.id === gedeeld), 10000, 'Bram ziet "Bezet" en gedeeld');

  // Archiveren: bij Bram verdwijnt de privé-afspraak (geen "Bezet" meer), de gedeelde blijft. Niets wordt gewist.
  assert.ifError((await personen.anna.c.rpc('archive_member', { p_household: hK, p_member: mDirk })).error);
  await totdat(() => !b.toestand.afspraken.some(x => x.id === prive), 10000, 'privé-afspraak weg bij Bram');
  assert.ok(b.toestand.afspraken.some(x => x.id === gedeeld && x.title === 'K3-gedeeld'), 'gedeelde afspraak verdwenen');
  assert.ok(!JSON.stringify(b.toestand).includes('K3-geheim'), 'privé-tekst in de cache van Bram');
  assert.equal(sql(`select count(*) from public.events where id = '${prive}'`), '1', 'archiveren wiste de privé-afspraak');

  // Terughalen: "Bezet" komt terug bij Bram.
  assert.ifError((await personen.anna.c.rpc('restore_member', { p_household: hK, p_member: mDirk })).error);
  await b.vernieuw();
  await totdat(() => b.toestand.afspraken.some(x => x.id === prive && x.is_busy), 10000, '"Bezet" terug bij Bram');

  // Opnieuw archiveren, en dan verwijdert Dirk zijn account: de privé-afspraak is direct definitief weg.
  assert.ifError((await personen.anna.c.rpc('archive_member', { p_household: hK, p_member: mDirk })).error);
  await d.stop();
  dirk.c.realtime.disconnect();
  assert.ifError((await admin.auth.admin.deleteUser(dirk.id)).error);
  delete personen.dirk;
  assert.equal(sql(`select count(*) from public.events where id = '${prive}'`), '0', 'privé-afspraak blijft na verwijderen van het account');
  assert.equal(sql(`select count(*) from public.events where id = '${gedeeld}'`), '1', 'gedeelde afspraak verdween met het account');
});
