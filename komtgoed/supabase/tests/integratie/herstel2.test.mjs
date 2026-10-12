// Thuisplanner KG-5D herstelronde 2 (review van 79a5852): regressietests voor de drie resterende
// idempotentieproblemen, tegen een echte, LOKALE Supabase-stack. Zie docs/thuisplanner-sync.md §8.
//   komtgoed/supabase/tests/integratie/run.sh
// Tegenproef tegen een andere versie van de module (bijv. die uit 79a5852):
//   KG_SYNC_MODULE=/pad/naar/thuisplanner-sync.js node --test herstel2.test.mjs   (moet falen)
import { test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { maakOmgeving, nieuweOpslag, sql, wacht, totdat, isRest, isRpc } from './testhulp.mjs';

const MODULE = process.env.KG_SYNC_MODULE ? pathToFileURL(path.resolve(process.env.KG_SYNC_MODULE)).href : '../../../sync/thuisplanner-sync.js';
const { maakSync } = await import(MODULE);
const omg = maakOmgeving({ maakSync, voorvoegsel: 'Herstel2' });
const { sessie, maak, rpcAls, inloggen } = omg;

let anna;
const huishouden = (naam, leden = []) => omg.huishouden(anna, naam, leden);
before(async () => {
  for (const n of ['anna', 'bram', 'carla']) await omg.maakPersoon(n);
  anna = await sessie('anna');
});
after(() => omg.ruimOp());
// Eigenaars hebben hoogstens 10 huishoudens: na elke test de testhuishoudens weg.
afterEach(() => { sql(`delete from public.households where name like '%${omg.run}%'`); });

const telTaken = (h, waar = 'true') => Number(sql(`select count(*) from public.tasks where household_id = '${h}' and ${waar}`));
const heeft = (s, id) => (s.openstaand || []).some(x => x.id === id);
const staatVan = (s, id) => (s.openstaand || []).find(x => x.id === id)?.staat;
// Sleutels in de opslag die bij een opdracht horen (welk formaat ook: de UUID staat erin).
const inOpslag = (opslag, id) => [...opslag.m.entries()].some(([k, v]) => k.includes(id) || v.includes(id));
// Een sync die geladen is (lidmaatschap bekend).
async function geladen(s, h, extra) {
  const sync = maak(s, h, extra);
  await sync.start();
  await totdat(() => sync.toestand.lid, 15000, 'geladen');
  return sync;
}
// Een taak toevoegen waarvan de server de commit doet maar het antwoord verloren gaat.
async function antwoordWeg(s, sync, ...args) {
  s.poort(isRest('tasks', 'POST'), { eerstUitvoeren: true }).geefVrij({ antwoordWeg: true });
  return sync.acties.taakToevoegen(...args);
}
// Een taak toevoegen die de server nooit bereikt (verbinding weg), zonder dat het toestel weet dat het offline is.
async function nooitAangekomen(s, sync, ...args) {
  s.poort(isRest('tasks', 'POST')).geefVrij({ antwoordWeg: true });
  return sync.acties.taakToevoegen(...args);
}

// ============================ 1. Verlopen sessie na een onbekende uitkomst ============================
test('H1a commit, antwoord weg, sessie verlopen: opnieuw proberen faalt maar de opdracht blijft; na inloggen bevestigd', { timeout: 60000 }, async () => {
  const h = await huishouden('H1a', ['bram']);
  const bram = await sessie('bram');
  const opslag = nieuweOpslag();
  const b = await geladen(bram, h, { opslag, geheugen: new Map() });
  const r = await antwoordWeg(bram, b, 'H1a-zwemtas');
  assert.ok(r.id, 'geen opdrachtidentiteit');
  assert.equal(telTaken(h), 1, 'de server heeft hem wél');
  bram.net.tokenVerlopen = true;                       // de sessie verloopt
  const r2 = await b.acties.opnieuwProberen(r.id);     // herhaalpoging: 401
  assert.equal(r2.ok, false);
  assert.ok(heeft(b, r.id), 'opdracht verdwenen na een mislukte herhaalpoging met verlopen sessie');
  assert.ok(inOpslag(opslag, r.id), 'opdracht uit de opslag na een mislukte herhaalpoging');
  assert.equal(r2.melding?.soort, 'sessie');
  assert.ok(b.toestand.taken.find(x => x.id === r.id)?.onzeker, 'niet meer zichtbaar als onbevestigd');
  // Een ophaalronde met verlopen sessie verandert niets aan de opdracht.
  await b.vernieuw();
  assert.ok(heeft(b, r.id));
  // Opnieuw inloggen: de eerstvolgende geldige ronde stelt vast dat de opdracht bestaat.
  await inloggen(bram, 'bram');
  bram.net.tokenVerlopen = false;
  await b.vernieuw();
  await totdat(() => !heeft(b, r.id), 15000, 'bevestigd na opnieuw inloggen');
  assert.equal(telTaken(h), 1);
  assert.equal(sql(`select id from public.tasks where household_id = '${h}'`), r.id);
  assert.ok(!inOpslag(opslag, r.id), 'opslag niet opgeruimd na bevestiging');
});

test('H1b geen commit, sessie verlopen: de opdracht blijft onbevestigd; na inloggen dezelfde UUID één keer opgeslagen', { timeout: 60000 }, async () => {
  const h = await huishouden('H1b', ['bram']);
  const bram = await sessie('bram');
  const opslag = nieuweOpslag();
  const b = await geladen(bram, h, { opslag, geheugen: new Map() });
  const r = await nooitAangekomen(bram, b, 'H1b-gymtas');
  assert.equal(telTaken(h), 0);
  bram.net.tokenVerlopen = true;
  await b.acties.opnieuwProberen(r.id);
  await b.acties.opnieuwProberen(r.id);
  assert.ok(heeft(b, r.id) && inOpslag(opslag, r.id), 'opdracht verdwenen');
  assert.equal(staatVan(b, r.id), 'onzeker', 'na een onbekende uitkomst hoort hij onzeker te blijven, niet "geweigerd"');
  await inloggen(bram, 'bram');
  bram.net.tokenVerlopen = false;
  await b.vernieuw();
  assert.ok(heeft(b, r.id), 'zonder serverrij hoort hij onbevestigd te blijven');
  assert.ok((await b.acties.opnieuwProberen(r.id)).ok);
  assert.equal(telTaken(h), 1);
  assert.equal(sql(`select id from public.tasks where household_id = '${h}'`), r.id);
});

test('H1c eerste poging: verlopen sessie = zeker niet opgeslagen maar bewaard; ongeldige invoer = weg met melding', { timeout: 60000 }, async () => {
  const h = await huishouden('H1c', ['bram']);
  const bram = await sessie('bram');
  const opslag = nieuweOpslag();
  const b = await geladen(bram, h, { opslag, geheugen: new Map() });
  bram.net.tokenVerlopen = true;
  const r = await b.acties.taakToevoegen('H1c-bibliotheekboeken');
  assert.equal(r.ok, false);
  assert.ok(r.id && heeft(b, r.id), 'invoer verloren door een verlopen sessie bij de eerste poging');
  assert.equal(staatVan(b, r.id), 'geweigerd');
  assert.ok(b.toestand.taken.find(x => x.id === r.id)?.geweigerd);
  await inloggen(bram, 'bram');
  bram.net.tokenVerlopen = false;
  assert.ok((await b.acties.opnieuwProberen(r.id)).ok);
  assert.equal(telTaken(h), 1);
  assert.equal(sql(`select id from public.tasks where household_id = '${h}'`), r.id);
  // Een zekere weigering om de inhoud (te lange titel): niets opgeslagen en niets te bewaren.
  const ongeldig = await b.acties.taakToevoegen('x'.repeat(201));
  assert.equal(ongeldig.ok, false);
  assert.equal(ongeldig.melding.soort, 'ongeldig');
  assert.deepEqual(b.openstaand, []);
  assert.deepEqual([...opslag.m.keys()], []);
  assert.equal(telTaken(h), 1);
});

// ============================ 2. Verschillende taken met dezelfde titel ============================
test('H2a "Gymtas" op 13 en op 14 oktober zijn twee taken, ook als de eerste nog onbevestigd is', { timeout: 60000 }, async () => {
  const h = await huishouden('H2a', ['bram']);
  const bram = await sessie('bram');
  const b = await geladen(bram, h, { geheugen: new Map() });
  const r13 = await antwoordWeg(bram, b, 'Gymtas', { due_date: '2026-10-13' });
  assert.equal(telTaken(h), 1);
  const r14 = await b.acties.taakToevoegen('Gymtas', { due_date: '2026-10-14' });
  assert.equal(r14.ok, true, 'de taak van 14 oktober werd niet als eigen taak opgeslagen');
  assert.notEqual(r14.id, r13.id);
  assert.equal(telTaken(h, `due_date = '2026-10-14'`), 1, 'taak van 14 oktober ontbreekt');
  assert.equal(telTaken(h, `due_date = '2026-10-13'`), 1);
  // De eerste opnieuw proberen: geen derde taak.
  assert.ok((await b.acties.opnieuwProberen(r13.id)).ok);
  assert.equal(telTaken(h), 2);
});

test('H2b twee bewust identieke taken: geen stille samenvoeging; bij een onbevestigde gelijke eerst een keuze', { timeout: 60000 }, async () => {
  const h = await huishouden('H2b', ['bram']);
  const bram = await sessie('bram');
  const b = await geladen(bram, h, { geheugen: new Map() });
  // Twee keer dezelfde taak, gewoon opgeslagen: twee taken.
  assert.ok((await b.acties.taakToevoegen('Vuilnis buiten', { due_date: '2026-10-15' })).ok);
  assert.ok((await b.acties.taakToevoegen('Vuilnis buiten', { due_date: '2026-10-15' })).ok);
  assert.equal(telTaken(h), 2);
  // Een derde met verloren antwoord, dan dezelfde inhoud nog eens invoeren: er wordt niets verstuurd en
  // ook niets hergebruikt; de app vraagt een keuze.
  const r3 = await antwoordWeg(bram, b, 'Vuilnis buiten', { due_date: '2026-10-15' });
  assert.equal(telTaken(h), 3);
  const r4 = await b.acties.taakToevoegen('Vuilnis buiten', { due_date: '2026-10-15' });
  assert.equal(r4.ok, false);
  assert.equal(r4.mogelijkDubbel, r3.id, 'geen keuze gevraagd bij een onbevestigde gelijke opdracht');
  assert.equal(telTaken(h), 3);
  // Bewust nieuw: een vierde taak met een eigen UUID.
  const r5 = await b.acties.taakToevoegen('Vuilnis buiten', { due_date: '2026-10-15' }, { bewustNieuw: true });
  assert.equal(r5.ok, true);
  assert.notEqual(r5.id, r3.id);
  assert.equal(telTaken(h), 4, 'de bewust nieuwe taak is niet aangemaakt');
  // Opnieuw proberen van de derde: blijft vier. (De ophaalronde na de vierde kan de derde al bevestigd
  // hebben; dan is er niets meer te proberen.)
  const rr = await b.acties.opnieuwProberen(r3.id);
  assert.ok(rr.ok || !heeft(b, r3.id), 'derde opdracht niet bevestigd en opnieuw proberen mislukt');
  assert.equal(telTaken(h), 4);
});

// ============================ 3. Opdrachtverlies bij stop(), sluiten of opslagproblemen ============================
test('H3a stop() en start() (zoals een React-unmount): de onbevestigde opdracht blijft, ook zonder opslag', { timeout: 60000 }, async () => {
  const h = await huishouden('H3a', ['bram']);
  const bram = await sessie('bram');
  const pagina = new Map();   // het geheugen van deze pagina
  const opslag = nieuweOpslag();
  const b = await geladen(bram, h, { opslag, geheugen: pagina });
  const r = await nooitAangekomen(bram, b, 'H3a-sportschoenen');
  await b.stop();
  assert.ok(inOpslag(opslag, r.id), 'stop() wist de opslag');
  assert.equal(b.toestand.bewaardOpToestel, 1);
  await b.start();
  await totdat(() => b.toestand.taken.some(x => x.id === r.id && x.onzeker), 15000, 'na start weer zichtbaar als onbevestigd');
  assert.ok((await b.acties.opnieuwProberen(r.id)).ok);
  assert.equal(telTaken(h), 1);
  // Unmount en opnieuw mounten = een nieuwe sync in dezelfde pagina, hier zonder opslag: het
  // paginageheugen houdt de opdracht vast.
  const r2 = await nooitAangekomen(bram, b, 'H3a-regenjas');
  await b.stop();
  const b2 = await geladen(bram, h, { geheugen: pagina });
  await totdat(() => b2.toestand.taken.some(x => x.id === r2.id && x.onzeker), 15000, 'na opnieuw mounten zichtbaar');
  assert.ok((await b2.acties.opnieuwProberen(r2.id)).ok);
  assert.equal(telTaken(h), 2);
});

test('H3b herladen en sluiten/heropenen (nieuwe pagina, nieuwe sessie): opdracht terug uit de opslag, één keer opgeslagen', { timeout: 90000 }, async () => {
  const h = await huishouden('H3b', ['bram']);
  const opslag = nieuweOpslag();   // localStorage van deze browser
  const s1 = await sessie('bram');
  const b1 = await geladen(s1, h, { opslag, geheugen: new Map() });
  const opgeslagen = await antwoordWeg(s1, b1, 'H3b-opgeslagen');
  const nietAangekomen = await nooitAangekomen(s1, b1, 'H3b-nooit-aangekomen');
  await b1.stop();                 // het tabblad sluit (unmount)
  // Heropenen: nieuwe pagina (leeg geheugen), opnieuw ingelogd, dezelfde opslag.
  const s2 = await sessie('bram');
  const b2 = await geladen(s2, h, { opslag, geheugen: new Map() });
  await totdat(() => !heeft(b2, opgeslagen.id) && b2.toestand.taken.some(x => x.id === opgeslagen.id && !x.onzeker), 15000, 'opgeslagen taak bevestigd');
  await totdat(() => b2.toestand.taken.some(x => x.id === nietAangekomen.id && x.onzeker), 15000, 'onbevestigde taak terug');
  assert.ok((await b2.acties.opnieuwProberen(nietAangekomen.id)).ok);
  assert.equal(telTaken(h), 2);
  assert.equal(telTaken(h, `id = '${nietAangekomen.id}'`), 1);
  assert.deepEqual([...opslag.m.keys()], [], 'opslag niet leeg na bevestiging');
});

test('H3c meerdere tabbladen: geen overschrijven in de opslag, samen opnieuw proberen geeft één rij', { timeout: 90000 }, async () => {
  const h = await huishouden('H3c', ['bram']);
  const opslag = nieuweOpslag();   // gedeeld door de tabbladen
  const sa = await sessie('bram'), sb = await sessie('bram');
  const a = await geladen(sa, h, { opslag, geheugen: new Map() });
  const b = await geladen(sb, h, { opslag, geheugen: new Map() });
  // Tegelijk in beide tabbladen een toevoeging die de server niet bereikt.
  const [ra, rb] = await Promise.all([nooitAangekomen(sa, a, 'H3c-tab-a'), nooitAangekomen(sb, b, 'H3c-tab-b')]);
  assert.ok(inOpslag(opslag, ra.id) && inOpslag(opslag, rb.id), 'het ene tabblad overschreef de opdracht van het andere');
  // Een derde tabblad ziet beide; tab a en tab b proberen tegelijk dezelfde opdracht opnieuw.
  const sc = await sessie('bram');
  const c = await geladen(sc, h, { opslag, geheugen: new Map() });
  assert.ok(heeft(c, ra.id) && heeft(c, rb.id), 'een ander tabblad ziet de onbevestigde opdrachten niet');
  await b.vernieuw();
  const pogingen = await Promise.all([a.acties.opnieuwProberen(ra.id), c.acties.opnieuwProberen(ra.id)]);
  assert.ok(pogingen.some(x => x.ok));
  assert.equal(telTaken(h, `id = '${ra.id}'`), 1);
  assert.equal(telTaken(h), 1);
  // Bevestigd in het ene tabblad: het andere ruimt hem op bij zijn volgende ronde.
  await b.vernieuw();
  assert.ok(!heeft(b, ra.id), 'tabblad b houdt een elders bevestigde opdracht vast');
  assert.ok(heeft(b, rb.id));
});

test('H3d opslag geweigerd: duidelijke waarschuwing, werkt in het geheugen, geen claim van duurzaamheid', { timeout: 60000 }, async () => {
  const h = await huishouden('H3d', ['bram']);
  const bram = await sessie('bram');
  const geweigerd = nieuweOpslag({}, { weigert: true });
  const b = await geladen(bram, h, { opslag: geweigerd, geheugen: new Map() });
  assert.equal(b.toestand.opslagDuurzaam, false, 'geen waarschuwing bij geweigerde opslag');
  const r = await nooitAangekomen(bram, b, 'H3d-paraplu');
  assert.ok(r.id && heeft(b, r.id));
  assert.equal((b.openstaand || []).find(x => x.id === r.id)?.bewaard, false, 'opdracht als duurzaam bewaard gemeld');
  assert.ok((await b.acties.opnieuwProberen(r.id)).ok);
  assert.equal(telTaken(h), 1);
  // Zonder opslag: ook de waarschuwing.
  const b2 = await geladen(await sessie('bram'), h, { geheugen: new Map() });
  assert.equal(b2.toestand.opslagDuurzaam, false);
  // Met werkende opslag: duurzaam.
  const b3 = await geladen(await sessie('bram'), h, { opslag: nieuweOpslag(), geheugen: new Map() });
  assert.equal(b3.toestand.opslagDuurzaam, true);
});

test('H3e accountwissel en ander huishouden: geen opdrachten van een ander overnemen of versturen', { timeout: 90000 }, async () => {
  const h = await huishouden('H3e', ['bram', 'carla']);
  const h2 = await huishouden('H3e-2', ['bram']);
  const opslag = nieuweOpslag();   // dezelfde browser
  const pagina = new Map();
  const bram = await sessie('bram');
  const b = await geladen(bram, h, { opslag, geheugen: pagina });
  const r = await nooitAangekomen(bram, b, 'H3e-van-bram');
  await b.stop();
  // Carla logt in op dezelfde browser (zelfde opslag en paginageheugen).
  const carla = await sessie('carla');
  const c = await geladen(carla, h, { opslag, geheugen: pagina });
  await c.vernieuw();
  assert.ok(!heeft(c, r.id), 'Carla neemt de opdracht van Bram over');
  assert.ok(!c.toestand.taken.some(x => x.id === r.id));
  assert.equal((await c.acties.opnieuwProberen(r.id)).ok, false);
  // Een vervalste opdracht onder Carla's sleutel maar van Bram: genegeerd.
  const sleutelB = [...opslag.m.keys()].find(k => k.includes(r.id));
  opslag.m.set(sleutelB.replace(omg.personen.bram.id, omg.personen.carla.id), opslag.m.get(sleutelB));
  await c.vernieuw();
  assert.ok(!heeft(c, r.id), 'een record van een ander account onder de eigen sleutel wordt overgenomen');
  // Bram in een ander huishouden: ziet hem daar niet.
  const b2 = await geladen(bram, h2, { opslag, geheugen: pagina });
  assert.ok(!heeft(b2, r.id));
  assert.equal(telTaken(h2), 0);
  assert.equal(telTaken(h), 0);
  assert.ok(opslag.m.has(sleutelB), 'de opdracht van Bram is verdwenen');
});

test('H3f privé-afspraak: inhoud niet in de opslag; na herstart de identiteit behouden en de inhoud opnieuw invoeren', { timeout: 60000 }, async () => {
  const h = await huishouden('H3f', ['bram']);
  const opslag = nieuweOpslag();
  const s1 = await sessie('bram');
  const pagina = new Map();
  const b1 = await geladen(s1, h, { opslag, geheugen: pagina });
  const afspraak = { start_date: '2026-11-04', start_time: '08:30', visibility: 'private', title: 'H3f-geheim', location: 'H3f-plek-geheim', notes: 'H3f-notitie-geheim' };
  s1.poort(isRpc('save_event')).geefVrij({ antwoordWeg: true });
  const r = await b1.acties.afspraakBewaren(afspraak);
  assert.ok(r.id);
  assert.ok(inOpslag(opslag, r.id), 'identiteit niet bewaard');
  assert.ok(![...opslag.m.values()].some(v => v.includes('geheim')), 'privé-inhoud in de opslag');
  // In dezelfde pagina (stop/start) is de inhoud er nog: opnieuw proberen kan direct.
  await b1.stop();
  await b1.start();
  await totdat(() => b1.toestand.lid, 15000, 'geladen');
  // Na herladen (nieuwe pagina): alleen de identiteit.
  const s2 = await sessie('bram');
  const b2 = await geladen(s2, h, { opslag, geheugen: new Map() });
  const item = b2.toestand.afspraken.find(x => x.id === r.id);
  assert.ok(item?.inhoudNietBewaard, 'na herladen niet zichtbaar als "inhoud niet bewaard"');
  const zonder = await b2.acties.opnieuwProberen(r.id);
  assert.equal(zonder.ok, false);
  assert.ok(zonder.inhoudOntbreekt);
  // Opnieuw invoeren met dezelfde identiteit: één afspraak.
  assert.ok((await b2.acties.afspraakBewaren({ ...afspraak, id: r.id })).ok);
  assert.equal(sql(`select count(*) from public.events where household_id = '${h}'`), '1');
  assert.ok((await b1.acties.opnieuwProberen(r.id)).ok, 'de pagina met de inhoud kan hem ook nog afmaken (geen dubbel)');
  assert.equal(sql(`select count(*) from public.events where household_id = '${h}'`), '1');
});

test('H3g vergeten is een expliciete actie, ook na stop(); verder ruimt alleen een bevestiging op', { timeout: 60000 }, async () => {
  const h = await huishouden('H3g', ['bram']);
  const opslag = nieuweOpslag();
  const bram = await sessie('bram');
  const b = await geladen(bram, h, { opslag, geheugen: new Map() });
  const r = await nooitAangekomen(bram, b, 'H3g-vergeten');
  await b.stop();
  assert.ok(inOpslag(opslag, r.id));
  assert.equal(b.vergeten(r.id), true);
  assert.ok(!inOpslag(opslag, r.id));
  assert.deepEqual(b.openstaand, []);
  assert.equal(telTaken(h), 0);
});
