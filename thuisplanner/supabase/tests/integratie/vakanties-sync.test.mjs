// Thuisplanner F8 Vakanties (V1.2): de synchronisatielaag voor vakanties, paklijsten en koppelingen tegen een echte,
// LOKALE Supabase-stack, met twee accounts in één huishouden (Anna en Bram). Zie docs/thuisplanner-vakanties.md §14.
//   thuisplanner/supabase/tests/integratie/run.sh
//   KG_SYNC_MODULE=/pad/naar/gesaboteerde/thuisplanner-sync.js node --test vakanties-sync.test.mjs   (moet falen;
//   zie vakanties-sync-tegenproeven.mjs)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const MODULE = process.env.KG_SYNC_MODULE ? pathToFileURL(path.resolve(process.env.KG_SYNC_MODULE)).href : '../../../sync/thuisplanner-sync.js';
const { maakSync, STATUS } = await import(MODULE);

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
const wachtwoord = 'Vak-' + randomUUID();
const personen = {};
const syncs = [];

// Een client waarvan het antwoord op één bepaald verzoek "verloren gaat": het verzoek bereikt de server wel, maar de
// client krijgt een netwerkfout (zoals wifi die wegvalt vlak na het versturen).
// Met verlies.voor = true bereikt het verzoek de server niet eens (maar de client weet dat niet: ook "onzeker").
function clientMetVerlies() {
  const verlies = { wat: null, voor: false };   // wat: (url, methode) => boolean
  const f = async (url, opties = {}) => {
    if (verlies.voor && verlies.wat && verlies.wat(String(url), (opties.method || 'GET').toUpperCase())) {
      verlies.wat = null; verlies.voor = false;
      throw new TypeError('fetch failed (verbinding weg)');
    }
    const r = await fetch(url, opties);
    if (verlies.wat && verlies.wat(String(url), (opties.method || 'GET').toUpperCase())) {
      verlies.wat = null;
      throw new TypeError('fetch failed (antwoord verloren)');
    }
    return r;
  };
  const c = createClient(API_URL, ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: f } });
  return { c, verlies };
}
async function persoon(naam) {
  const email = `${naam}-${run}@test.invalid`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: wachtwoord, email_confirm: true });
  assert.ifError(error);
  const { c, verlies } = clientMetVerlies();
  assert.ifError((await c.auth.signInWithPassword({ email, password: wachtwoord })).error);
  personen[naam] = { id: data.user.id, c, verlies };
  return personen[naam];
}
// Opslag zoals localStorage, om te zien wat duurzaam op het toestel komt (P1).
function opslag() {
  const m = new Map();
  return { get length() { return m.size; }, key: i => [...m.keys()][i] ?? null, getItem: k => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); }, removeItem: k => { m.delete(k); }, m };
}
const actief = {};
async function startSync(naam, h, extra = {}) {
  if (actief[naam]) await actief[naam].stop();
  const s = maakSync({ supabase: personen[naam].c, huishoudenId: h, vangnetMs: 60000, ...extra });
  actief[naam] = s;
  syncs.push(s);
  await s.start();
  return s;
}
const isPost = pad => (u, m) => m === 'POST' && new URL(u).pathname === pad;

let h, mAnna, mBram;
before(async () => {
  for (const n of ['anna', 'bram']) await persoon(n);
  h = (await personen.anna.c.rpc('create_household', { p_name: 'Vakantie-sync ' + run, p_display_name: 'Anna' })).data;
  const tok = (await personen.anna.c.rpc('create_invite', { p_household: h, p_member: null, p_role: 'member' })).data;
  assert.ifError((await personen.bram.c.rpc('accept_invite', { p_token: tok, p_display_name: 'Bram' })).error);
  mAnna = sql(`select id from public.household_members where household_id = '${h}' and display_name = 'Anna'`);
  mBram = sql(`select id from public.household_members where household_id = '${h}' and display_name = 'Bram'`);
});

after(async () => {
  sql(`delete from public.households where name like '%${run}%'`);
  for (const p of Object.values(personen)) await admin.auth.admin.deleteUser(p.id);
  await Promise.race([Promise.allSettled(syncs.map(s => s.stop())), wacht(5000)]);
  for (const p of Object.values(personen)) p.c.realtime.disconnect();
});

async function beide() {
  const a = await startSync('anna', h), b = await startSync('bram', h);
  await totdat(() => a.toestand.status === STATUS.VERBONDEN && b.toestand.status === STATUS.VERBONDEN, 30000, 'beide verbonden');
  return { a, b };
}
async function nieuweVakantie(s, naam, velden = {}) {
  const r = await s.acties.vakantieToevoegen({ name: naam, ...velden });
  assert.ok(r.ok, 'vakantie toevoegen: ' + JSON.stringify(r.melding));
  return r.id;
}
const pak = (s, v, naam, lid) => s.toestand.pakitems.find(x => x.trip_id === v && x.name === naam && (lid === undefined || x.member_id === lid));

test('V1 vakantie, pakitem, voorbereiding en boodschap van Anna verschijnen bij Bram via seintjes', { timeout: 90000 }, async () => {
  const { a, b } = await beide();
  const voor = b.statistiek.seintjes;
  const v = await nieuweVakantie(a, 'Frankrijk', { start_date: '2027-07-12', end_date: '2027-07-26', destination: 'Ardèche' });
  await totdat(() => b.toestand.vakanties.some(x => x.id === v && x.name === 'Frankrijk'), 10000, 'Bram ziet de vakantie');
  assert.ok((await a.acties.pakitemToevoegen(v, mBram, 'Sokken')).ok);
  assert.ok((await a.acties.pakitemToevoegen(v, null, 'Zonnebrand')).ok);
  await totdat(() => pak(b, v, 'Sokken', mBram) && pak(b, v, 'Zonnebrand', null), 10000, 'Bram ziet de pakitems');
  assert.ok((await a.acties.taakToevoegen('Vignet regelen', { trip_id: v })).ok);
  await totdat(() => b.toestand.taken.some(t => t.title === 'Vignet regelen' && t.trip_id === v), 10000, 'Bram ziet de voorbereiding');
  const r = await a.acties.boodschapToevoegen('Reispil', { vakantie: v });
  assert.ok(r.ok);
  await totdat(() => {
    const item = b.toestand.boodschappen.find(x => x.name === 'Reispil');
    return item && b.toestand.vakantieKoppelingen.some(k => k.shopping_item_id === item.id && k.trip_id === v && !k.settled_at);
  }, 10000, 'Bram ziet de boodschap met koppeling');
  assert.ok(b.statistiek.seintjes > voor, 'Bram kreeg geen seintjes (dan was het alleen het vangnet)');
  // Een bekende versie wordt overgeslagen.
  const p = pak(b, v, 'Sokken', mBram);
  const genegeerd = b.statistiek.genegeerd;
  b.verwerkSeintje({ payload: { t: 'trip_packing_items', id: p.id, v: p.version, op: 'U' } });
  assert.equal(b.statistiek.genegeerd, genegeerd + 1, 'een bekende versie van een pakitem werd niet overgeslagen');
});

test('V2 samen inpakken: afvinken komt bij de ander; een verouderde versie geeft een conflict en de actuele stand', { timeout: 60000 }, async () => {
  const { a, b } = await beide();
  const v = await nieuweVakantie(a, 'Texel');
  assert.ok((await a.acties.pakitemToevoegen(v, mAnna, 'Laders')).ok);
  await totdat(() => pak(b, v, 'Laders'), 10000, 'Bram ziet Laders');
  assert.ok((await b.acties.pakitemAfvinken(pak(b, v, 'Laders'))).ok);
  await totdat(() => pak(a, v, 'Laders')?.packed_at, 10000, 'Anna ziet het vinkje');
  assert.equal(pak(a, v, 'Laders').packed_by_member_id, mBram, 'ingepakt door Bram');
  const oud = { ...pak(a, v, 'Laders'), version: 1 };
  const r = await a.acties.pakitemBijwerken(oud, { name: 'Oude laders' });
  assert.equal(r.ok, false);
  assert.equal(r.melding.soort, 'conflict');
  await totdat(() => pak(a, v, 'Laders')?.packed_at && !pak(a, v, 'Oude laders'), 10000, 'actuele stand terug');
});

test('V3 dubbel (U1): toevoegen, hernoemen, verplaatsen en herstellen naar een bestaand item verandert niets', { timeout: 60000 }, async () => {
  const { a, b } = await beide();
  const v = await nieuweVakantie(a, 'Ardennen');
  assert.ok((await a.acties.pakitemToevoegen(v, mBram, 'Sokken')).ok);
  const dubbel = await a.acties.pakitemToevoegen(v, mBram, '  sokken ');
  assert.equal(dubbel.ok, false);
  assert.equal(dubbel.melding.soort, 'dubbel');
  assert.equal(a.openstaand.length, 0, 'een zeker geweigerde toevoeging bleef als opdracht staan');
  assert.ok((await a.acties.pakitemToevoegen(v, mBram, 'Shirts')).ok);
  assert.ok((await a.acties.pakitemToevoegen(v, mAnna, 'Sokken')).ok);
  await a.vernieuw();
  const hernoem = await a.acties.pakitemBijwerken(pak(a, v, 'Shirts', mBram), { name: 'SOKKEN' });
  assert.equal(hernoem.melding?.soort, 'dubbel');
  const verplaats = await a.acties.pakitemBijwerken(pak(a, v, 'Sokken', mAnna), { member_id: mBram });
  assert.equal(verplaats.melding?.soort, 'dubbel');
  // Verwijderen, Bram voert het opnieuw in, Anna maakt het verwijderen ongedaan.
  await a.vernieuw();
  const sokken = pak(a, v, 'Sokken', mBram);
  const weg = await a.acties.pakitemVerwijderen(sokken);
  assert.ok(weg.ok);
  await totdat(() => !pak(b, v, 'Sokken', mBram), 10000, 'Bram ziet de verwijdering');
  assert.ok((await b.acties.pakitemToevoegen(v, mBram, 'Sokken')).ok);
  const terug = await a.acties.pakitemHerstellen(sokken, weg.data[0].version);
  assert.equal(terug.ok, false);
  assert.equal(terug.melding.soort, 'dubbel');
  await a.vernieuw();
  assert.equal(a.toestand.pakitems.filter(x => x.trip_id === v && x.member_id === mBram && x.name.toLowerCase() === 'sokken').length, 1);
  assert.equal(sql(`select count(*) from public.trip_packing_items where trip_id = '${v}' and member_id = '${mBram}' and name_key = 'sokken' and deleted_at is null`), '1');
  // Een onzekere eerste poging (de server zag haar niet), intussen voert Bram hetzelfde in: opnieuw proberen is dan
  // zeker "staat er al", en de opdracht verdwijnt (geen eeuwig "niet bevestigd").
  personen.anna.verlies.voor = true;
  personen.anna.verlies.wat = isPost('/rest/v1/trip_packing_items');
  const onzeker = await a.acties.pakitemToevoegen(v, null, 'Kompas');
  assert.equal(onzeker.onzeker, true);
  assert.ok((await b.acties.pakitemToevoegen(v, null, 'kompas')).ok);
  const opnieuw = await a.acties.opnieuwProberen(onzeker.id);
  assert.equal(opnieuw.ok, false);
  assert.equal(opnieuw.melding?.soort, 'dubbel');
  assert.equal(a.openstaand.length, 0, 'zeker geweigerde opdracht bleef "niet bevestigd"');
});

test('V4 overnemen: aanvullend, dezelfde opdracht geeft dezelfde items (U2), ongedaan maken alleen wat niemand aanpaste', { timeout: 60000 }, async () => {
  const { a, b } = await beide();
  const oud = await nieuweVakantie(a, 'Italië 2025', { start_date: '2025-07-01', end_date: '2025-07-15' });
  const v = await nieuweVakantie(a, 'Zweden');
  for (const [lid, naam] of [[mAnna, 'Zwembroek'], [mAnna, 'Sokken'], [mBram, 'Knuffel'], [null, 'Paspoorten']]) {
    assert.ifError((await personen.anna.c.from('trip_packing_items').insert({ household_id: h, trip_id: oud, member_id: lid, name: naam })).error);
  }
  assert.ok((await a.acties.pakitemToevoegen(v, mAnna, 'Sokken')).ok);
  const r1 = await a.acties.paklijstOvernemen({ van: oud, naar: v });
  assert.ok(r1.ok, JSON.stringify(r1.melding));
  assert.deepEqual(r1.items.map(x => x.name).sort(), ['Knuffel', 'Paspoorten', 'Zwembroek']);
  const r2 = await a.acties.paklijstOvernemen({ van: oud, naar: v, opdracht: r1.opdracht });
  assert.deepEqual(r2.items.map(x => x.id).sort(), r1.items.map(x => x.id).sort(), 'herhaling gaf andere items');
  assert.equal(sql(`select count(*) from public.trip_packing_items where trip_id = '${v}' and deleted_at is null`), '4');
  // Bram vinkt intussen Knuffel af; Anna maakt de overname ongedaan.
  await totdat(() => pak(b, v, 'Knuffel'), 10000, 'Bram ziet Knuffel');
  assert.ok((await b.acties.pakitemAfvinken(pak(b, v, 'Knuffel'))).ok);
  const o = await a.acties.overnemenOngedaanMaken(r1.items.map(x => x.id));
  assert.ok(o.ok);
  assert.equal(o.verwijderd, 2);
  assert.equal(o.gebleven, 1);
  assert.equal(o.melding.soort, 'deels');
  await a.vernieuw();
  assert.deepEqual(a.toestand.pakitems.filter(x => x.trip_id === v).map(x => x.name).sort(), ['Knuffel', 'Sokken'], 'ongedaan maken raakte het verkeerde');
  // Alleen voor één persoon, en alleen Gezamenlijk.
  const r3 = await a.acties.paklijstOvernemen({ van: oud, naar: v, lid: mAnna });
  assert.deepEqual(r3.items.map(x => x.name), ['Zwembroek']);
  const r4 = await a.acties.paklijstOvernemen({ van: oud, naar: v, gezamenlijk: true });
  assert.deepEqual(r4.items.map(x => x.name), ['Paspoorten']);
});

test('V5 vinkjes opnieuw beginnen en exact terugzetten; een intussen aangepast item wordt gemeld en niet overschreven', { timeout: 60000 }, async () => {
  const { a, b } = await beide();
  const v = await nieuweVakantie(a, 'Schotland');
  for (const n of ['Regenjas', 'Laarzen', 'Muts']) assert.ok((await b.acties.pakitemToevoegen(v, mBram, n)).ok);
  await b.vernieuw();
  for (const n of ['Regenjas', 'Laarzen', 'Muts']) assert.ok((await b.acties.pakitemAfvinken(pak(b, v, n))).ok);
  await totdat(() => ['Regenjas', 'Laarzen', 'Muts'].every(n => pak(a, v, n)?.packed_at), 10000, 'Anna ziet de vinkjes');
  const voor = Object.fromEntries(['Regenjas', 'Laarzen', 'Muts'].map(n => [n, sql(`select packed_at || '|' || packed_by_member_id from public.trip_packing_items where trip_id = '${v}' and name = '${n}'`)]));
  const r = await a.acties.vinkjesOpnieuw(v, mBram);
  assert.ok(r.ok);
  assert.equal(r.terug.length, 3);
  await totdat(() => ['Regenjas', 'Laarzen', 'Muts'].every(n => pak(b, v, n) && !pak(b, v, n).packed_at), 10000, 'Bram ziet de vinkjes weg');
  // Bram hernoemt intussen Muts: dat item mag niet worden overschreven.
  await b.vernieuw();
  assert.ok((await b.acties.pakitemBijwerken(pak(b, v, 'Muts'), { name: 'Wollen muts' })).ok);
  const t = await a.acties.vinkjesTerugzetten(v, r.terug);
  assert.ok(t.ok);
  assert.equal(t.overgeslagen, 1);
  assert.equal(t.melding.soort, 'deels');
  for (const n of ['Regenjas', 'Laarzen']) {
    assert.equal(sql(`select packed_at || '|' || packed_by_member_id from public.trip_packing_items where trip_id = '${v}' and name = '${n}'`), voor[n], `${n} niet exact teruggezet`);
  }
  assert.equal(sql(`select coalesce(packed_at::text, 'leeg') from public.trip_packing_items where trip_id = '${v}' and name = 'Wollen muts'`), 'leeg');
});

test('V6 boodschap voor een vakantie: hergebruik sluit de oude koppeling af; ontkoppelen en herstellen', { timeout: 60000 }, async () => {
  const { a, b } = await beide();
  const v = await nieuweVakantie(a, 'Bretagne');
  assert.ok((await a.acties.boodschapToevoegen('Muggenspray', { vakantie: v })).ok);
  await a.vernieuw();
  const item = a.toestand.boodschappen.find(x => x.name === 'Muggenspray');
  const koppeling = () => a.toestand.vakantieKoppelingen.filter(k => k.shopping_item_id === item.id);
  assert.equal(koppeling().length, 1);
  // Ontkoppelen en weer herstellen.
  const weg = await a.acties.boodschapOntkoppelen(koppeling()[0]);
  assert.ok(weg.ok);
  await a.vernieuw();
  assert.equal(koppeling().length, 0);
  const k0 = sql(`select id from public.trip_shopping_links where shopping_item_id = '${item.id}'`);
  assert.ok((await a.acties.boodschapKoppelingHerstellen({ id: k0 }, weg.data[0].version)).ok);
  await a.vernieuw();
  assert.equal(koppeling().filter(k => !k.settled_at).length, 1);
  // Gekocht (afgevinkt), en later gewoon weer toegevoegd: de oude koppeling is afgehandeld.
  await b.vernieuw();
  assert.ok((await b.acties.boodschapAfvinken(b.toestand.boodschappen.find(x => x.name === 'Muggenspray'))).ok);
  const terug = await a.acties.boodschapToevoegen('muggenspray');
  assert.ok(terug.ok);
  await a.vernieuw();
  assert.equal(koppeling().filter(k => !k.settled_at).length, 0, 'oude koppeling nog actueel na hergebruik');
  assert.equal(koppeling().filter(k => k.settled_at).length, 1);
});

test('V11 slimme +: eigen keuze Nu of Later gaat mee; een verwijderde vakantie geeft een duidelijke melding en geen item', { timeout: 60000 }, async () => {
  const { a, b } = await beide();
  const v = await nieuweVakantie(a, 'Ierland');
  // Met vakantie maar Nu gekozen: gekoppeld, niet bij Later nodig. Zonder vakantie maar Later gekozen: geen koppeling.
  assert.ok((await a.acties.boodschapToevoegen('Regenjas', { vakantie: v, later: false })).ok);
  assert.ok((await a.acties.boodschapToevoegen('Cadeaupapier', { later: true })).ok);
  await totdat(() => b.toestand.boodschappen.some(x => x.name === 'Cadeaupapier'), 10000, 'Bram ziet Cadeaupapier');
  await b.vernieuw();
  const jas = b.toestand.boodschappen.find(x => x.name === 'Regenjas');
  const papier = b.toestand.boodschappen.find(x => x.name === 'Cadeaupapier');
  assert.equal(jas.deferred, false);
  assert.equal(papier.deferred, true);
  assert.ok(b.toestand.vakantieKoppelingen.some(k => k.shopping_item_id === jas.id && k.trip_id === v && !k.settled_at), 'Regenjas niet gekoppeld');
  assert.equal(sql(`select count(*) from public.trip_shopping_links where shopping_item_id = '${papier.id}'`), '0');
  // De vakantie wordt (door de ander) verwijderd terwijl de zin nog open staat: geen item, wel een duidelijke melding.
  const weg = b.toestand.vakanties.find(x => x.id === v);
  assert.ok((await b.acties.vakantieVerwijderen(weg)).ok);
  const r = await a.acties.boodschapToevoegen('Ierse thee', { vakantie: v });
  assert.equal(r.ok, false);
  assert.equal(r.melding.soort, 'vakantie-weg');
  assert.equal(sql(`select count(*) from public.shopping_items where name = 'Ierse thee'`), '0');
  // Een afspraak met een onbekend id blijft neutraal "geen toegang" (privacy).
  const w = await a.acties.afspraakBewaren({ id: randomUUID(), version: 1, start_date: '2026-11-21', title: 'X', visibility: 'household' });
  assert.equal(w.melding.soort, 'toegang');
});

test('V10 Later nodig: vanuit een vakantie bij Later nodig, zichtbaar bij de ander; Nu kopen en terug met versie; gewone boodschap blijft Nu', { timeout: 60000 }, async () => {
  const { a, b } = await beide();
  const v = await nieuweVakantie(a, 'Zweden');
  assert.ok((await a.acties.boodschapToevoegen('Muggenolie', { vakantie: v })).ok);
  assert.ok((await a.acties.boodschapToevoegen('Brood')).ok);
  await totdat(() => b.toestand.boodschappen.find(x => x.name === 'Muggenolie')?.deferred === true, 10000, 'Bram ziet Muggenolie bij Later nodig');
  await totdat(() => b.toestand.boodschappen.find(x => x.name === 'Brood'), 10000, 'Bram ziet Brood');
  assert.equal(b.toestand.boodschappen.find(x => x.name === 'Brood').deferred, false, 'een gewone boodschap staat bij Nu te kopen');
  // Bram zet hem op Nu te kopen; Anna ziet het via een seintje. Een verouderde versie geeft een conflict.
  const item = b.toestand.boodschappen.find(x => x.name === 'Muggenolie');
  const nu = await b.acties.boodschapLater(item, false);
  assert.ok(nu.ok);
  await totdat(() => a.toestand.boodschappen.find(x => x.name === 'Muggenolie')?.deferred === false, 10000, 'Anna ziet Muggenolie bij Nu te kopen');
  const oud = await a.acties.boodschapLater({ ...item }, true);
  assert.equal(oud.ok, false, 'een verouderde versie overschreef de stand');
  // Ongedaan maken met de nieuwe versie (zoals de app doet).
  assert.ok((await b.acties.boodschapLater({ ...item, deferred: false }, true, nu.data[0].version)).ok);
  await totdat(() => a.toestand.boodschappen.find(x => x.name === 'Muggenolie')?.deferred === true, 10000, 'Anna ziet het ongedaan maken');
  // Op de gewone lijst toegevoegd: dezelfde boodschap naar Nu te kopen.
  assert.ok((await a.acties.boodschapToevoegen('muggenolie')).ok);
  await a.vernieuw();
  assert.equal(a.toestand.boodschappen.filter(x => x.name.toLowerCase() === 'muggenolie').length, 1);
  assert.equal(a.toestand.boodschappen.find(x => x.name === 'Muggenolie').deferred, false);
});

test('V7 een afgelopen vakantie: paklijst pas na openen, blijft dan actueel, en na sluiten niet meer opgehaald', { timeout: 60000 }, async () => {
  const { a, b } = await beide();
  const oud = await nieuweVakantie(a, 'Lissabon 2024', { start_date: '2024-05-01', end_date: '2024-05-08' });
  const zonderEinde = await nieuweVakantie(a, 'Weekend 2026', { start_date: '2026-03-01' });   // + 13 dagen: voorbij
  for (const [t, n] of [[oud, 'Zonnehoed'], [zonderEinde, 'Weekendtas']]) {
    assert.ifError((await personen.anna.c.from('trip_packing_items').insert({ household_id: h, trip_id: t, name: n })).error);
  }
  await a.vernieuw();
  assert.equal(a.toestand.pakitems.filter(x => x.trip_id === oud || x.trip_id === zonderEinde).length, 0, 'paklijst van een afgelopen vakantie opgehaald');
  await a.acties.vakantieOpenen(oud);
  assert.ok(pak(a, oud, 'Zonnehoed'), 'na openen niet opgehaald');
  // Bram wijzigt intussen iets: Anna ziet het, want de vakantie is open.
  assert.ifError((await personen.bram.c.from('trip_packing_items').update({ name: 'Grote zonnehoed' }).eq('trip_id', oud).eq('name', 'Zonnehoed')).error);
  await totdat(() => pak(a, oud, 'Grote zonnehoed'), 10000, 'geopende oude vakantie blijft actueel');
  a.acties.vakantieSluiten(oud);
  await a.vernieuw();
  assert.equal(a.toestand.pakitems.filter(x => x.trip_id === oud).length, 0, 'na sluiten nog opgehaald');
  // Met een andere "vandaag" (de app bepaalt die) telt dezelfde vakantie niet als voorbij.
  const c = await startSync('anna', h, { vandaag: () => '2024-05-03' });
  await totdat(() => c.toestand.status === STATUS.VERBONDEN, 30000, 'verbonden');
  assert.ok(pak(c, oud, 'Grote zonnehoed'), 'vandaag van de app niet gebruikt');
  void b;
});

test('V12 extra inpaklijsten: lijst en items bij de ander; hernoemen met versie; vinkjes opnieuw per lijst raakt Gezamenlijk niet', { timeout: 90000 }, async () => {
  const { a, b } = await beide();
  const v = await nieuweVakantie(a, 'Ardennen');
  const rl = await a.acties.paklijstToevoegen(v, 'Paard');
  assert.ok(rl.ok, JSON.stringify(rl.melding));
  const lijst = rl.id;
  assert.ok((await a.acties.pakitemToevoegen(v, null, 'Zadel', { lijst })).ok);
  assert.ok((await a.acties.pakitemToevoegen(v, null, 'Zadel')).ok);   // Gezamenlijk: dezelfde tekst mag
  await totdat(() => b.toestand.paklijsten.some(x => x.id === lijst) && b.toestand.pakitems.filter(x => x.trip_id === v).length === 2, 10000, 'Bram ziet lijst en items');
  assert.equal(b.toestand.pakitems.find(x => x.list_id === lijst)?.member_id, null);
  assert.equal(b.toestand.pakitems.find(x => x.trip_id === v && !x.list_id)?.name, 'Zadel');
  // Dubbel en ongeldig: duidelijke meldingen, niets dubbel.
  assert.equal((await b.acties.paklijstToevoegen(v, ' paard ')).melding?.soort, 'dubbel');
  assert.equal((await b.acties.paklijstToevoegen(v, 'Bram')).melding?.soort, 'ongeldig');
  assert.equal((await b.acties.paklijstToevoegen(v, 'gezamenlijk')).melding?.soort, 'ongeldig');
  assert.equal((await b.acties.pakitemToevoegen(v, null, 'zadel', { lijst })).melding?.soort, 'dubbel');
  // Hernoemen; een verouderde versie geeft een conflict en de actuele stand.
  const l1 = b.toestand.paklijsten.find(x => x.id === lijst);
  assert.ok((await b.acties.paklijstHernoemen(l1, 'Pony')).ok);
  await totdat(() => a.toestand.paklijsten.find(x => x.id === lijst)?.name === 'Pony', 10000, 'Anna ziet de nieuwe naam');
  const oud = await a.acties.paklijstHernoemen({ ...l1 }, 'Ezel');
  assert.equal(oud.melding?.soort, 'conflict');
  await a.vernieuw();
  assert.equal(a.toestand.paklijsten.find(x => x.id === lijst).name, 'Pony');
  // Vinkjes: beide aan; opnieuw voor de lijst haalt alleen het lijst-item weg, opnieuw voor Gezamenlijk alleen dat.
  await a.vernieuw();
  for (const x of a.toestand.pakitems.filter(y => y.trip_id === v)) assert.ok((await a.acties.pakitemAfvinken(x)).ok);
  await a.vernieuw();
  const r1 = await a.acties.vinkjesOpnieuw(v, { lijst });
  assert.equal(r1.terug.length, 1);
  await a.vernieuw();
  assert.equal(a.toestand.pakitems.find(x => x.list_id === lijst).packed_at, null);
  assert.ok(a.toestand.pakitems.find(x => x.trip_id === v && !x.list_id).packed_at, 'Gezamenlijk geraakt door vinkjes opnieuw voor de lijst');
  assert.ok((await a.acties.pakitemAfvinken(a.toestand.pakitems.find(x => x.list_id === lijst))).ok);
  await a.vernieuw();
  const r2 = await a.acties.vinkjesOpnieuw(v, null);
  assert.equal(r2.terug.length, 1, 'Gezamenlijk nam ook het item van de extra lijst mee');
  await a.vernieuw();
  assert.ok(a.toestand.pakitems.find(x => x.list_id === lijst).packed_at, 'het item van de extra lijst werd als Gezamenlijk behandeld');
  // Verplaatsen naar een lid en terug.
  const item = a.toestand.pakitems.find(x => x.list_id === lijst);
  assert.ok((await a.acties.pakitemBijwerken(item, { list_id: null, member_id: mAnna })).ok);
  await a.vernieuw();
  const bijAnna = a.toestand.pakitems.find(x => x.id === item.id);
  assert.deepEqual([bijAnna.member_id, bijAnna.list_id], [mAnna, null]);
  assert.ok((await a.acties.pakitemBijwerken(bijAnna, { member_id: null, list_id: lijst })).ok);
});

test('V13 extra inpaklijst verwijderen en herstellen: items gaan mee; bij de ander weg en terug; toevoegen aan een verwijderde lijst geeft een duidelijke melding', { timeout: 90000 }, async () => {
  const { a, b } = await beide();
  const v = await nieuweVakantie(a, 'Camping');
  const lijst = (await a.acties.paklijstToevoegen(v, 'Kampeerspullen')).id;
  for (const n of ['Tent', 'Haringen']) assert.ok((await a.acties.pakitemToevoegen(v, null, n, { lijst })).ok);
  await totdat(() => b.toestand.pakitems.filter(x => x.list_id === lijst).length === 2, 10000, 'Bram ziet de items');
  const l = b.toestand.paklijsten.find(x => x.id === lijst);
  const weg = await b.acties.paklijstVerwijderen(l);
  assert.ok(weg.ok, JSON.stringify(weg.melding));
  assert.deepEqual([weg.data[0].outcome, weg.data[0].items], ['verwijderd', 2]);
  await totdat(() => !a.toestand.paklijsten.some(x => x.id === lijst) && !a.toestand.pakitems.some(x => x.list_id === lijst), 10000, 'bij Anna weg');
  // Anna had de lijst nog open en voegt toe: geen item, een duidelijke melding.
  const laat = await a.acties.pakitemToevoegen(v, null, 'Lantaarn', { lijst });
  assert.equal(laat.ok, false);
  assert.equal(laat.melding?.soort, 'weg');
  assert.equal(sql(`select count(*) from public.trip_packing_items where name = 'Lantaarn'`), '0');
  // Hernoemen van een verwijderde lijst: geen bijwerking.
  assert.equal((await a.acties.paklijstHernoemen(l, 'Iets')).ok, false);
  // Herstellen (ongedaan maken) met de versie van het verwijderen.
  const terug = await b.acties.paklijstHerstellen(l, weg.data[0].version);
  assert.ok(terug.ok, JSON.stringify(terug.melding));
  await totdat(() => a.toestand.pakitems.filter(x => x.list_id === lijst).length === 2, 10000, 'bij Anna terug');
  // Nog eens verwijderen en daarna door de ander een lijst met dezelfde naam: herstellen geeft "dubbel".
  const l2 = (await b.vernieuw(), b.toestand.paklijsten.find(x => x.id === lijst));
  const weg2 = await b.acties.paklijstVerwijderen(l2);
  assert.ok(weg2.ok);
  assert.ok((await a.acties.paklijstToevoegen(v, 'kampeerspullen')).ok);
  const botsing = await b.acties.paklijstHerstellen(l2, weg2.data[0].version);
  assert.equal(botsing.melding?.soort, 'dubbel');
});

test('V14 overnemen met extra lijsten: aanvullen, nieuwe lijst, herhalen geeft hetzelfde; ongedaan maken ruimt de nieuwe lege lijst op', { timeout: 90000 }, async () => {
  const { a } = await beide();
  const bron = await nieuweVakantie(a, 'Bron-lijsten');
  const doel = await nieuweVakantie(a, 'Doel-lijsten');
  const paard = (await a.acties.paklijstToevoegen(bron, 'Paard')).id;
  const oma = (await a.acties.paklijstToevoegen(bron, 'Oma')).id;
  for (const [n, l] of [['Zadel', paard], ['Hoefkrabber', paard], ['Pillen', oma]]) assert.ok((await a.acties.pakitemToevoegen(bron, null, n, { lijst: l })).ok);
  assert.ok((await a.acties.pakitemToevoegen(bron, null, 'Paspoorten')).ok);
  const bestaand = (await a.acties.paklijstToevoegen(doel, 'paard')).id;
  assert.ok((await a.acties.pakitemToevoegen(doel, null, 'Zadel', { lijst: bestaand })).ok);
  await a.vernieuw();
  const r = await a.acties.paklijstOvernemen({ van: bron, naar: doel, lijsten: [paard, oma] });
  assert.ok(r.ok, JSON.stringify(r.melding));
  assert.equal(r.nieuweLijsten.length, 1, 'alleen Oma is nieuw');
  const herhaal = await a.acties.paklijstOvernemen({ van: bron, naar: doel, lijsten: [paard, oma], opdracht: r.opdracht });
  assert.deepEqual(herhaal.items.map(x => x.id).sort(), r.items.map(x => x.id).sort());
  await a.vernieuw();
  assert.equal(a.toestand.paklijsten.filter(x => x.trip_id === doel).length, 2);
  assert.equal(a.toestand.pakitems.filter(x => x.list_id === bestaand).length, 2, 'Paard niet aangevuld (of overschreven)');
  assert.equal(a.toestand.pakitems.filter(x => x.trip_id === doel && !x.list_id && !x.member_id).map(x => x.name).join(), 'Paspoorten');
  // Ongedaan maken: de items van die overname weg, de nieuwe (nu lege) lijst Oma ook; Paard blijft met Zadel.
  const o = await a.acties.overnemenOngedaanMaken(r.items.map(x => x.id), r.nieuweLijsten);
  assert.ok(o.ok);
  await a.vernieuw();
  assert.deepEqual(a.toestand.paklijsten.filter(x => x.trip_id === doel).map(x => x.id), [bestaand]);
  assert.deepEqual(a.toestand.pakitems.filter(x => x.trip_id === doel).map(x => x.name), ['Zadel']);
});

test('V15 extra inpaklijst onzeker (antwoord verloren): opnieuw proberen geeft er één; P1: geen naam in de opslag', { timeout: 60000 }, async () => {
  const o = opslag();
  const a = await startSync('anna', h, { opslag: o });
  await totdat(() => a.toestand.status === STATUS.VERBONDEN, 30000, 'verbonden');
  const v = await nieuweVakantie(a, 'Onzeker-lijst');
  personen.anna.verlies.wat = isPost('/rest/v1/trip_packing_lists');
  const r = await a.acties.paklijstToevoegen(v, 'Geheim-Oma');
  assert.equal(r.onzeker, true);
  assert.doesNotMatch([...o.m.values()].join('\n'), /Geheim|trip_id/, 'naam van de lijst in de duurzame opslag');
  // Een tweede poging met dezelfde naam: eerst een keuze (mogelijk dubbel), niets verstuurd.
  assert.ok((await a.acties.paklijstToevoegen(v, 'Geheim-Oma')).mogelijkDubbel);
  const opnieuw = await a.acties.opnieuwProberen(r.id);
  assert.ok(opnieuw.ok, JSON.stringify(opnieuw.melding));
  assert.equal(sql(`select count(*) from public.trip_packing_lists where trip_id = '${v}'`), '1');
  await a.vernieuw();
  assert.equal(a.openstaand.length, 0);
});

test('V8 onzeker (antwoord verloren): opnieuw proberen geeft er één; P1: geen inhoud in de opslag; duidelijke meldingen', { timeout: 60000 }, async () => {
  const o = opslag();
  const a = await startSync('anna', h, { opslag: o });
  await totdat(() => a.toestand.status === STATUS.VERBONDEN, 30000, 'verbonden');
  // Vakantie: antwoord verloren.
  personen.anna.verlies.wat = isPost('/rest/v1/trips');
  const rv = await a.acties.vakantieToevoegen({ name: 'Geheim-Noorwegen', start_date: '2027-08-01', destination: 'Geheim-Bergen' });
  assert.equal(rv.onzeker, true);
  assert.match(rv.melding.tekst, /nog niet bevestigd/i);
  const v = rv.id;
  // Pakitem: antwoord verloren.
  await a.vernieuw();
  assert.ok(a.toestand.vakanties.some(x => x.id === v), 'de vakantie stond toch op de server');
  personen.anna.verlies.wat = isPost('/rest/v1/trip_packing_items');
  const rp = await a.acties.pakitemToevoegen(v, mAnna, 'Geheim-Dagboek');
  assert.equal(rp.onzeker, true);
  // P1: de opslag bevat alleen identiteiten, geen namen, datums of teksten.
  const inhoud = [...o.m.values()].join('\n');
  assert.ok(o.m.size >= 1, 'de onbevestigde opdracht staat niet in de opslag');
  assert.doesNotMatch(inhoud, /Geheim|2027-08-01|trip_id|member_id/, 'inhoud in de duurzame opslag');
  // Opnieuw proberen: dezelfde UUID, er komt er één.
  const opnieuw = await a.acties.opnieuwProberen(rp.id);
  assert.ok(opnieuw.ok, JSON.stringify(opnieuw.melding));
  assert.equal(sql(`select count(*) from public.trip_packing_items where trip_id = '${v}' and name = 'Geheim-Dagboek'`), '1');
  await a.vernieuw();
  assert.equal(a.openstaand.length, 0, 'opdrachten bleven openstaan na bevestiging');
  // Overnemen met een verloren antwoord: duidelijke melding, en dezelfde opdracht opnieuw geeft dezelfde items.
  const bron = await nieuweVakantie(a, 'Bron ' + run);
  assert.ok((await a.acties.pakitemToevoegen(bron, null, 'Kaart')).ok);
  personen.anna.verlies.wat = isPost('/rest/v1/rpc/copy_packing_items');
  const ro = await a.acties.paklijstOvernemen({ van: bron, naar: v });
  assert.equal(ro.ok, false);
  assert.match(ro.melding.tekst, /overnemen/);
  const ro2 = await a.acties.paklijstOvernemen({ van: bron, naar: v, opdracht: ro.opdracht });
  assert.ok(ro2.ok);
  assert.deepEqual(ro2.items.map(x => x.name), ['Kaart'], 'herhaling na verloren antwoord gaf niet hetzelfde item');
  assert.equal(sql(`select count(*) from public.trip_packing_items where trip_id = '${v}' and name = 'Kaart'`), '1');
});

test('V9 toegang kwijt: vakanties, pakitems, extra lijsten en koppelingen verdwijnen uit de cache', { timeout: 60000 }, async () => {
  const { a, b } = await beide();
  const v = await nieuweVakantie(a, 'Laatste');
  assert.ok((await a.acties.pakitemToevoegen(v, null, 'Tent')).ok);
  assert.ok((await a.acties.paklijstToevoegen(v, 'Hond')).ok);
  assert.ok((await a.acties.boodschapToevoegen('Haringen', { vakantie: v })).ok);
  await totdat(() => pak(b, v, 'Tent') && b.toestand.vakantieKoppelingen.length > 0, 10000, 'Bram heeft alles');
  assert.ifError((await personen.anna.c.rpc('archive_member', { p_household: h, p_member: mBram })).error);
  await totdat(() => b.toestand.status === STATUS.GEEN_TOEGANG, 20000, 'Bram verliest toegang');
  assert.equal(b.toestand.vakanties.length + b.toestand.pakitems.length + b.toestand.paklijsten.length + b.toestand.vakantieKoppelingen.length, 0);
});
