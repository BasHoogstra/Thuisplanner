// Thuisplanner KG-5D herstelronde 1 (review van 3f3b7da): regressietests voor de vier bevindingen, tegen
// een echte, LOKALE Supabase-stack. Lopende verzoeken worden met "poorten" in een vaste volgorde
// vastgehouden, uitgevoerd of zonder antwoord afgebroken. Zie docs/thuisplanner-sync.md.
//   thuisplanner/supabase/tests/integratie/run.sh
// Tegenproef tegen een andere versie van de module (bijv. de oude uit 3f3b7da):
//   KG_SYNC_MODULE=/pad/naar/thuisplanner-sync.js node --test herstel.test.mjs   (moet falen)
// KG_TEGENPROEF=1: draait alleen de realtime-tegenproef (zonder kanaalwissel blijft een niet-meewerkende
// client seintjes ontvangen; zo is aangetoond dat Realtime zelf niet intrekt en de test dat ziet).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { maakOmgeving, nieuweOpslag, sql, wacht, totdat, isRest, isRpc } from './testhulp.mjs';

const MODULE = process.env.KG_SYNC_MODULE ? pathToFileURL(path.resolve(process.env.KG_SYNC_MODULE)).href : '../../../sync/thuisplanner-sync.js';
const { maakSync, STATUS } = await import(MODULE);
const TEGENPROEF = process.env.KG_TEGENPROEF === '1';

const omg = maakOmgeving({ maakSync, voorvoegsel: 'Herstel' });
const { run, sessie, maak, heeftInhoud, lidId, rpcAls } = omg;

let anna;   // sessie van Anna (eigenaar van alle testhuishoudens)
const huishouden = (naam, leden = []) => omg.huishouden(anna, naam, leden);

before(async () => {
  for (const n of ['anna', 'bram', 'carla']) await omg.maakPersoon(n);
  anna = await sessie('anna');
});

after(() => omg.ruimOp());

// ============================ Bevinding 1: levenscyclus en generaties ============================
test('B1a stoppen tijdens een lopende wijziging: een late fout zet niets terug in de cache en meldt niets', { skip: TEGENPROEF, timeout: 60000 }, async () => {
  const h = await huishouden('B1a', ['bram']);
  await rpcAls(anna, 'add_shopping_items', { p_household: h, p_ids: [randomUUID()], p_names: ['B1a-kaas'] });
  const bram = await sessie('bram');
  const b = maak(bram, h);
  await b.start();
  await totdat(() => b.toestand.boodschappen.length === 1, 15000, 'B ziet de boodschap');
  const poort = bram.poort(isRest('shopping_items', 'PATCH'));
  const actie = b.acties.boodschapAfvinken(b.toestand.boodschappen[0]);
  await poort.binnen;                 // het verzoek is onderweg
  await b.stop();                     // uitloggen of ander huishouden
  const na = b.meldingen.length;
  poort.geefVrij({ antwoordWeg: true });   // pas nu faalt het verzoek
  await actie;
  await wacht(500);
  assert.equal(b.toestand.status, STATUS.GESTOPT);
  assert.ok(!heeftInhoud(b.toestand), 'gegevens na stoppen terug in de cache');
  assert.deepEqual(b.meldingen.slice(na).filter(heeftInhoud), [], 'inhoud gemeld na stoppen');
  assert.equal(b.meldingen.length, na, 'meldingen na stoppen');
});

test('B1b toegang ingetrokken tijdens een lopende wijziging: een late fout zet niets terug', { skip: TEGENPROEF, timeout: 60000 }, async () => {
  const h = await huishouden('B1b', ['bram']);
  await rpcAls(anna, 'add_shopping_items', { p_household: h, p_ids: [randomUUID()], p_names: ['B1b-geheim'] });
  const bram = await sessie('bram');
  const b = maak(bram, h);
  await b.start();
  await totdat(() => b.toestand.boodschappen.length === 1, 15000, 'B ziet de boodschap');
  const poort = bram.poort(isRest('shopping_items', 'PATCH'));
  const actie = b.acties.boodschapAfvinken(b.toestand.boodschappen[0]);
  await poort.binnen;
  await rpcAls(anna, 'archive_member', { p_household: h, p_member: lidId(h, 'Bram') });
  await b.vernieuw();
  await totdat(() => b.toestand.status === STATUS.GEEN_TOEGANG, 15000, 'B ziet geen toegang');
  const na = b.meldingen.length;
  poort.geefVrij({ antwoordWeg: true });
  await actie;
  await wacht(500);
  assert.equal(b.toestand.status, STATUS.GEEN_TOEGANG);
  assert.ok(!heeftInhoud(b.toestand), 'gegevens na intrekking terug in de cache');
  assert.deepEqual(b.meldingen.slice(na).filter(heeftInhoud), [], 'inhoud gemeld na intrekking');
});

test('B1c stoppen, intrekken en opnieuw starten: een oud ophaalantwoord publiceert niets', { skip: TEGENPROEF, timeout: 60000 }, async () => {
  const h = await huishouden('B1c', ['bram']);
  await rpcAls(anna, 'add_shopping_items', { p_household: h, p_ids: [randomUUID()], p_names: ['B1c-geheim'] });
  const bram = await sessie('bram');
  const b = maak(bram, h);
  await b.start();
  await totdat(() => b.toestand.boodschappen.length === 1, 15000, 'B ziet de boodschap');
  const poort = bram.poort(isRest('shopping_items', 'GET'), { eerstUitvoeren: true });   // antwoord van vóór de intrekking
  const ronde = b.vernieuw();
  await poort.binnen;
  await wacht(1000);                  // de rest van die ronde is binnen; alleen dit antwoord loopt nog
  await b.stop();
  const na = b.meldingen.length;
  await rpcAls(anna, 'archive_member', { p_household: h, p_member: lidId(h, 'Bram') });
  // Opnieuw starten; de lidmaatschapscontrole van de nieuwe ronde loopt nog als het oude antwoord binnenkomt.
  const lidPoort = bram.poort(isRpc('my_memberships'));
  const herstart = b.start();
  await Promise.race([lidPoort.binnen, wacht(2000)]);
  poort.geefVrij();                   // het oude antwoord komt nu pas binnen
  await wacht(300);
  lidPoort.geefVrij();
  await Promise.allSettled([ronde, herstart]);
  await totdat(() => b.toestand.status === STATUS.GEEN_TOEGANG, 15000, 'B ziet geen toegang');
  await wacht(500);
  assert.ok(!heeftInhoud(b.toestand));
  assert.deepEqual(b.meldingen.slice(na).filter(heeftInhoud).map(t => t.boodschappen.map(x => x.name)), [],
    'een antwoord van vóór het stoppen werd na het stoppen gepubliceerd');
});

test('B1d terugdraaien raakt alleen de eigen wijziging: wat intussen binnenkwam, blijft staan', { skip: TEGENPROEF, timeout: 60000 }, async () => {
  const h = await huishouden('B1d', ['bram']);
  await rpcAls(anna, 'add_shopping_items', { p_household: h, p_ids: [randomUUID()], p_names: ['B1d-eerst'] });
  const bram = await sessie('bram');
  const b = maak(bram, h);
  await b.start();
  await totdat(() => b.toestand.boodschappen.length === 1, 15000, 'B ziet de boodschap');
  const item = b.toestand.boodschappen[0];
  const poort = bram.poort(isRest('shopping_items', 'PATCH'));
  const actie = b.acties.boodschapAfvinken(item);
  await poort.binnen;
  await rpcAls(anna, 'add_shopping_items', { p_household: h, p_ids: [randomUUID()], p_names: ['B1d-intussen'] });
  await b.vernieuw();
  assert.ok(b.toestand.boodschappen.some(x => x.name === 'B1d-intussen'));
  poort.geefVrij({ antwoordWeg: true });
  await actie;
  // Direct na de mislukte wijziging (vóór de volgende ophaalronde): het nieuwe item staat er nog, en
  // de eigen wijziging is teruggedraaid.
  assert.ok(b.toestand.boodschappen.some(x => x.name === 'B1d-intussen'), 'terugdraaien zette een oude momentopname terug');
  assert.equal(b.toestand.boodschappen.find(x => x.id === item.id).checked_at, null);
});

// ============================ Bevinding 3: idempotente toevoegingen ============================
// Opnieuw proberen zoals de app het aanbiedt; een module zonder die actie (de oude) kan alleen opnieuw
// toevoegen.
const opnieuw = (s, r, nogEens) => (s.acties.opnieuwProberen && r.id ? s.acties.opnieuwProberen(r.id) : nogEens());
const geenZekerNietOpgeslagen = r => {
  assert.equal(r.ok, false);
  assert.notEqual(r.melding?.soort, 'offline', 'melding zegt dat het niet is opgeslagen, terwijl dat onbekend is');
  assert.doesNotMatch(r.melding?.tekst || '', /niet opgeslagen/i);
};

test('B3a taak: commit, antwoord verloren, opnieuw proberen = precies één taak met dezelfde UUID', { skip: TEGENPROEF, timeout: 60000 }, async () => {
  const h = await huishouden('B3a', ['bram']);
  const bram = await sessie('bram');
  const b = maak(bram, h);
  await b.start();
  await totdat(() => b.toestand.lid, 15000, 'B geladen');
  bram.poort(isRest('tasks', 'POST'), { eerstUitvoeren: true }).geefVrij({ antwoordWeg: true });
  const r = await b.acties.taakToevoegen('B3a-fietsband');
  assert.equal(sql(`select count(*) from public.tasks where household_id = '${h}'`), '1', 'de server heeft hem wél');
  // Opnieuw proberen: dezelfde opdracht, dezelfde UUID. (Sinds herstelronde 2 alleen via de identiteit;
  // dezelfde tekst opnieuw invoeren vraagt eerst een keuze, zie herstel2.test.mjs.)
  const r2 = await opnieuw(b, r, () => b.acties.taakToevoegen('B3a-fietsband'));
  assert.equal(sql(`select count(*) from public.tasks where household_id = '${h}'`), '1', 'dubbele taak');
  assert.equal(r2.ok, true, 'opnieuw proberen na een geslaagde commit moet slagen');
  geenZekerNietOpgeslagen(r);
  if (r.id) assert.equal(sql(`select id from public.tasks where household_id = '${h}'`), r.id);
  await b.vernieuw();
  assert.equal(b.toestand.taken.length, 1);
  assert.ok(!b.toestand.taken[0].onzeker);
});

test('B3b boodschap en afspraak: commit, antwoord verloren, opnieuw proberen = één keer, nooit "niet opgeslagen"', { skip: TEGENPROEF, timeout: 60000 }, async () => {
  const h = await huishouden('B3b', ['bram']);
  const bram = await sessie('bram');
  const b = maak(bram, h);
  await b.start();
  await totdat(() => b.toestand.lid, 15000, 'B geladen');
  bram.poort(isRpc('add_shopping_items'), { eerstUitvoeren: true }).geefVrij({ antwoordWeg: true });
  const rb = await b.acties.boodschapToevoegen('B3b-melk');
  geenZekerNietOpgeslagen(rb);
  assert.ok((await opnieuw(b, rb, () => b.acties.boodschapToevoegen('B3b-melk'))).ok);
  assert.equal(sql(`select count(*) from public.shopping_items where household_id = '${h}'`), '1');
  bram.poort(isRpc('save_event'), { eerstUitvoeren: true }).geefVrij({ antwoordWeg: true });
  const afspraak = { start_date: '2026-11-03', start_time: '15:00', title: 'B3b-zwemles' };
  const ra = await b.acties.afspraakBewaren(afspraak);
  geenZekerNietOpgeslagen(ra);
  const ra2 = await opnieuw(b, ra, () => b.acties.afspraakBewaren(afspraak));
  assert.equal(ra2.ok, true, 'opnieuw proberen na een geslaagde commit moet slagen');
  assert.equal(sql(`select count(*) from public.events where household_id = '${h}'`), '1', 'dubbele afspraak');
});

test('B3c commit, antwoord verloren, verbinding weg en terug: de volgende ronde bevestigt hem, zonder tweede verzending', { skip: TEGENPROEF, timeout: 90000 }, async () => {
  const h = await huishouden('B3c', ['bram']);
  const bram = await sessie('bram');
  const b = maak(bram, h);
  await b.start();
  await totdat(() => b.toestand.lid, 15000, 'B geladen');
  const poort = bram.poort(isRest('tasks', 'POST'), { eerstUitvoeren: true });
  const actie = b.acties.taakToevoegen('B3c-boodschappentas');
  await poort.binnen;                  // de server heeft hem opgeslagen ...
  bram.net.uit = true;                 // ... en precies dan valt de verbinding weg
  bram.c.realtime.disconnect();
  poort.geefVrij({ antwoordWeg: true });
  const r = await actie;
  geenZekerNietOpgeslagen(r);
  assert.ok(b.toestand.taken.some(x => x.title === 'B3c-boodschappentas'), 'onbevestigde taak verdwenen');
  let posts = 0;
  bram.poort((u, m) => { if (isRest('tasks', 'POST')(u, m)) posts++; return false; });
  bram.net.uit = false;
  globalThis.dispatchEvent?.(new Event('online'));
  await b.vernieuw();
  await totdat(() => b.toestand.taken.length === 1 && !b.toestand.taken[0].onzeker && !b.toestand.taken[0].wachtend, 30000, 'bevestigd na herverbinden');
  assert.equal(posts, 0, 'na herverbinden opnieuw verstuurd');
  assert.equal(sql(`select count(*) from public.tasks where household_id = '${h}'`), '1');
  if (b.openstaand) assert.deepEqual(b.openstaand, []);
});

test('B3d herstart na verloren antwoord: dezelfde UUID overleeft de herstart; bevestigd of opnieuw geprobeerd, nooit dubbel', { skip: TEGENPROEF, timeout: 90000 }, async () => {
  const h = await huishouden('B3d', ['bram']);
  // (1) De server heeft hem opgeslagen; de app sluit voordat het antwoord er is.
  const s1 = await sessie('bram');
  const opslag1 = nieuweOpslag();
  const b1 = maak(s1, h, { opslag: opslag1, geheugen: new Map() });
  await b1.start();
  await totdat(() => b1.toestand.lid, 15000, 'B geladen');
  const p1 = s1.poort(isRest('tasks', 'POST'), { eerstUitvoeren: true });
  b1.acties.taakToevoegen('B3d-opgeslagen');
  await p1.binnen;
  // (2) Een tweede toevoeging bereikt de server nooit (netwerk weg); ook daarna sluit de app.
  const p2 = s1.poort(isRest('tasks', 'POST'));
  b1.acties.taakToevoegen('B3d-nooit-aangekomen');
  await p2.binnen;
  const bewaard = Object.fromEntries(opslag1.m);   // wat de app op het toestel achterliet
  // Herstart: nieuwe sessie, nieuwe module-instantie, dezelfde opslag.
  const s2 = await sessie('bram');
  const opslag2 = nieuweOpslag(bewaard);
  const b2 = maak(s2, h, { opslag: opslag2, geheugen: new Map() });   // nieuwe pagina: leeg geheugen
  await b2.start();
  await totdat(() => b2.toestand.taken.some(x => x.title === 'B3d-opgeslagen' && !x.onzeker), 15000, 'opgeslagen taak bevestigd');
  const onbevestigd = b2.toestand.taken.find(x => x.title === 'B3d-nooit-aangekomen');
  assert.ok(onbevestigd?.onzeker, 'de niet-bevestigde taak is na de herstart niet zichtbaar als onzeker');
  assert.ok(b2.acties.opnieuwProberen, 'geen opnieuw proberen');
  assert.ok((await b2.acties.opnieuwProberen(onbevestigd.id)).ok);
  // Het oude verzoek komt alsnog binnen (laat, na de herstart): nog steeds niets dubbel.
  p2.geefVrij();
  p1.geefVrij({ antwoordWeg: true });
  await wacht(1000);
  assert.equal(sql(`select count(*) from public.tasks where household_id = '${h}' and title = 'B3d-opgeslagen'`), '1');
  assert.equal(sql(`select count(*) from public.tasks where household_id = '${h}' and title = 'B3d-nooit-aangekomen'`), '1');
  assert.equal(sql(`select id from public.tasks where household_id = '${h}' and title = 'B3d-nooit-aangekomen'`), onbevestigd.id);
  await b2.vernieuw();
  assert.equal(b2.toestand.taken.length, 2);
  assert.deepEqual([...opslag2.m.keys()], [], 'opslag niet leeg na bevestiging');
});

// ============================ Bevinding 4: paginering ============================
let hGroot;
// Ruime wachttijd voor het laden van dit grote huishouden: op een trage CI-runner duurde het eens
// langer dan 30 s (lokaal ~1 s). De beweringen zelf (alle rijen, niets dubbel) veranderen niet.
const LAADTIJD = 90000;
async function grootHuishouden() {
  if (hGroot) return hGroot;
  hGroot = await huishouden('B4');
  // 1001+ rijen per soort, met fictieve gegevens, rechtstreeks in de database (snel). Zonder triggers
  // (replica, alleen in deze transactie): anders zouden 4000 seintjes Realtime minutenlang bezighouden.
  sql(`set local session_replication_role = replica;
       insert into public.shopping_items (household_id, name) select '${hGroot}', 'B4-boodschap-' || i from generate_series(1, 1001) i;
       insert into public.tasks (household_id, title) select '${hGroot}', 'B4-taak-' || i from generate_series(1, 1001) i;
       with e as (insert into public.events (household_id, owner_member_id, owner_user_id, visibility, start_date)
                  select '${hGroot}', m.id, m.user_id, 'household', date '2026-11-01' + (i % 30)
                  from generate_series(1, 1001) i, (select id, user_id from public.household_members where household_id = '${hGroot}') m
                  returning id, household_id)
       insert into public.event_details (event_id, household_id, title) select id, household_id, 'B4-afspraak' from e;
       insert into public.household_members (household_id, display_name, kind) select '${hGroot}', 'B4-kind-' || i, 'child' from generate_series(1, 1001) i;`);
  return hGroot;
}
const telling = h => ({
  boodschappen: Number(sql(`select count(*) from public.shopping_items where household_id = '${h}' and deleted_at is null`)),
  taken: Number(sql(`select count(*) from public.tasks where household_id = '${h}' and deleted_at is null`)),
  afspraken: Number(sql(`select count(*) from public.events where household_id = '${h}' and deleted_at is null`)),
  leden: Number(sql(`select count(*) from public.household_members where household_id = '${h}'`)),
});
const inCache = t => ({ boodschappen: t.boodschappen.length, taken: t.taken.length, afspraken: t.afspraken.length, leden: t.leden.length });

test('B4a meer dan 1000 rijen per soort: alles komt mee (boodschappen, taken, afspraken, leden)', { skip: TEGENPROEF, timeout: 240000 }, async () => {
  const h = await grootHuishouden();
  const s = await sessie('anna');
  const a = maak(s, h);
  await a.start();
  await totdat(() => a.toestand.lid, LAADTIJD, 'geladen');
  const verwacht = telling(h);
  assert.ok(Object.values(verwacht).every(n => n > 1000), JSON.stringify(verwacht));
  assert.deepEqual(inCache(a.toestand), verwacht);
  for (const l of ['boodschappen', 'taken', 'afspraken', 'leden']) {
    assert.equal(new Set(a.toestand[l].map(x => x.id)).size, a.toestand[l].length, `${l}: dubbele rijen`);
  }
  // Volgorde voor het scherm blijft zoals voorheen (aanmaakmoment, datum).
  const datums = a.toestand.afspraken.map(x => x.start_date);
  assert.deepEqual(datums, [...datums].sort());
});

test('B4b een mislukte pagina: de cache blijft zoals hij was (geen halve vervanging)', { skip: TEGENPROEF, timeout: 240000 }, async () => {
  const h = await grootHuishouden();
  const s = await sessie('anna');
  const a = maak(s, h, { debounceMs: 600000 });   // alleen de rondes van de test zelf
  await a.start();
  await totdat(() => a.toestand.lid && a.toestand.taken.length > 1000, LAADTIJD, 'geladen');
  await wacht(1000);
  await a.vernieuw();
  const voor = a.toestand;
  sql(`insert into public.shopping_items (household_id, name) values ('${h}', 'B4b-nieuw')`);
  // De tweede pagina taken faalt (de eerste en alle andere soorten lukken).
  // (Blijvend: supabase-js herhaalt een mislukte GET zelf al een paar keer.)
  const p = s.poort((u, m) => m === 'GET' && new URL(u).pathname === '/rest/v1/tasks' && /id=gt\.|offset=/.test(u), { blijvend: true });
  p.geefVrij({ antwoordWeg: true });
  await a.vernieuw();
  p.dicht = true;
  assert.ok(p.aantal >= 1, 'tweede pagina niet opgevraagd');
  assert.equal(a.toestand.boodschappen, voor.boodschappen, 'boodschappen vervangen terwijl taken mislukten');
  assert.equal(a.toestand.taken, voor.taken);
  assert.equal(a.toestand.status, STATUS.OFFLINE);
  sql(`delete from public.shopping_items where household_id = '${h}' and name = 'B4b-nieuw'`);
});

test('B4c wijzigingen tijdens het ophalen: geen rij overgeslagen of dubbel; daarna gelijk aan de server', { skip: TEGENPROEF, timeout: 240000 }, async () => {
  const h = await grootHuishouden();
  const s = await sessie('anna');
  const a = maak(s, h, { debounceMs: 600000 });   // alleen de rondes van de test zelf
  await a.start();
  await totdat(() => a.toestand.lid && a.toestand.boodschappen.length > 1000, LAADTIJD, 'geladen');
  await wacht(1000);
  await a.vernieuw();
  // Volgorde op id zoals de server die ziet; de eerste rij van pagina 2 moet in elk geval meekomen.
  const ids = sql(`select string_agg(id::text, ',' order by id) from public.shopping_items where household_id = '${h}' and deleted_at is null`).split(',');
  const eersteVanPagina2 = ids[1000];
  const p = s.poort((u, m) => m === 'GET' && new URL(u).pathname === '/rest/v1/shopping_items' && /id=gt\.|offset=/.test(u));
  const voor = a.meldingen.length;
  const ronde = a.vernieuw();
  await p.binnen;
  // Tijdens het ophalen: een rij van pagina 1 verdwijnt (verwijderd) en er komt er één bij (achteraan in
  // de id-volgorde, zodat de verschuiving door het verwijderen niet toevallig wordt opgeheven).
  sql(`update public.shopping_items set deleted_at = now() where id = '${ids[5]}'`);
  sql(`insert into public.shopping_items (id, household_id, name) values ('ffffffff-ffff-4fff-8fff-${randomUUID().slice(-12)}', '${h}', 'B4c-tijdens')`);
  p.geefVrij();
  await ronde;
  const resultaat = a.meldingen.slice(voor).find(t => t.laatstOpgehaald && t.laatstOpgehaald !== a.meldingen[voor - 1]?.laatstOpgehaald);
  assert.ok(resultaat, 'geen resultaat van de ronde');
  const gezien = new Set(resultaat.boodschappen.map(x => x.id));
  assert.equal(gezien.size, resultaat.boodschappen.length, 'dubbele rij');
  const gemist = ids.filter(id => id !== ids[5] && !gezien.has(id));
  assert.deepEqual(gemist, [], `rijen die er de hele tijd waren, ontbreken (o.a. de eerste van pagina 2: ${gemist.includes(eersteVanPagina2)})`);
  // De volgende ronde (bijv. na het seintje) is gelijk aan de server.
  await a.vernieuw();
  assert.deepEqual(inCache(a.toestand), telling(h));
  assert.ok(!a.toestand.boodschappen.some(x => x.id === ids[5]));
  assert.ok(a.toestand.boodschappen.some(x => x.name === 'B4c-tijdens'));
});

// ============================ Bevinding 2: realtime na intrekking ============================
// Een niet-meewerkende client: luistert rechtstreeks op het kanaal, meldt zich nooit af en stuurt
// nooit een nieuw token. De bescherming moet van de server komen.
async function luister(s, topic) {
  await s.c.realtime.setAuth();
  const berichten = [];
  const k = s.c.channel(topic, { config: { private: true } }).on('broadcast', { event: '*' }, m => berichten.push({ ...m.payload, tijd: Date.now() }));
  const status = await new Promise(r => { const t = setTimeout(() => r('GEEN_ANTWOORD'), 15000); k.subscribe(st => { if (st !== 'CLOSED') { clearTimeout(t); r(st); } }); });
  return { k, berichten, status };
}

test(TEGENPROEF ? 'B2 TEGENPROEF: zonder kanaalwissel blijft een niet-meewerkende client na intrekking seintjes ontvangen'
  : 'B2 niet-meewerkende client houdt het kanaal open na intrekking: de server stuurt er niets meer heen', { timeout: 120000 }, async () => {
  const h = await huishouden('B2', ['bram', 'carla']);
  if (TEGENPROEF) sql('drop trigger household_members_rotate_channel on public.household_members');
  try {
    const bram = await sessie('bram');
    const topic = await rpcAls(bram, 'household_channel', { p_household: h });
    const oud = await luister(bram, topic);
    assert.equal(oud.status, 'SUBSCRIBED');
    // De app van Anna (de module) blijft live en stapt mee over.
    const a = maak(anna, h);
    await a.start();
    await totdat(() => a.toestand.status === STATUS.VERBONDEN, 30000, 'Anna verbonden');
    await rpcAls(anna, 'add_shopping_items', { p_household: h, p_ids: [randomUUID()], p_names: ['B2-voor'] });
    await totdat(() => oud.berichten.some(x => x.t === 'shopping_items'), 10000, 'Bram ontvangt vóór de intrekking');
    await rpcAls(anna, 'archive_member', { p_household: h, p_member: lidId(h, 'Bram') });
    const tIntrekking = Date.now();
    // Controle: Carla (nog lid) luistert op het actuele kanaal; Anna's module is overgestapt.
    const carla = await sessie('carla');
    const nieuw = await rpcAls(carla, 'household_channel', { p_household: h });
    const controle = await luister(carla, nieuw);
    assert.equal(controle.status, 'SUBSCRIBED');
    if (!TEGENPROEF) {
      assert.notEqual(nieuw, topic, 'kanaalnaam niet gewisseld');
      await totdat(() => a.kanaalNaam === nieuw && a.toestand.status === STATUS.VERBONDEN, 30000, 'Anna overgestapt');
    }
    const seintjesAnna = a.statistiek.seintjes;
    for (let i = 0; i < 5; i++) {
      await rpcAls(anna, 'add_shopping_items', { p_household: h, p_ids: [randomUUID()], p_names: ['B2-na-' + i] });
      await wacht(400);
    }
    await totdat(() => controle.berichten.filter(x => x.t === 'shopping_items').length >= 5, 15000, 'controle ontvangt de seintjes');
    await wacht(1500);
    const naIntrekking = oud.berichten.filter(x => x.tijd > tIntrekking && x.t !== 'household_members');
    // Het oude kanaal van Bram is nog open (de client werkt niet mee): de bescherming komt van de server.
    assert.equal(oud.k.state, 'joined', 'kanaal van Bram is gesloten; dan bewijst deze test niets');
    if (TEGENPROEF) {
      assert.ok(naIntrekking.length >= 5, `tegenproef: verwacht dat Realtime zelf niet intrekt (ontving ${naIntrekking.length})`);
      return;
    }
    assert.deepEqual(naIntrekking, [], 'niet-meewerkende client ontving seintjes na intrekking');
    assert.ok(a.statistiek.seintjes > seintjesAnna, 'Anna ontving geen seintjes meer na het overstappen');
    // Bram kan ook niet op het nieuwe kanaal.
    const poging = await luister(bram, nieuw);
    assert.equal(poging.status, 'CHANNEL_ERROR');
  } finally {
    if (TEGENPROEF) sql(`create trigger household_members_rotate_channel after update or delete on public.household_members
                         for each row execute function private.rotate_channel_on_revoke()`);
  }
});
