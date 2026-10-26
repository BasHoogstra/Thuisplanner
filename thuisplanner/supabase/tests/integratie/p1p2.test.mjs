// Thuisplanner P1 en P2 (besluiten van 19 oktober 2026, docs/thuisplanner-sync.md §9): wat het toestel bewaart van
// onbevestigde opdrachten, tegen een echte, LOKALE Supabase-stack.
//   P1  duurzaam alleen de identiteit, nooit de inhoud; na een herstart eerst serverbevestiging, daarna opnieuw
//       invoeren onder dezelfde UUID (nooit dubbel);
//   P2  bij uitloggen tellen en, alleen na een keuze, wissen (alle huishoudens van dat account, niet van een ander);
//   P3  de ontwikkelmodus (bewaarInhoud) bewaart de inhoud wel, behalve van privé-afspraken;
//   P4  niets wordt stil gewist.
// Tegenproef tegen een andere versie van de module (de versie van vóór P1 moet hier falen):
//   KG_SYNC_MODULE=/pad/naar/oude/thuisplanner-sync.js node --test p1p2.test.mjs
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { maakOmgeving, nieuweOpslag, sql, wacht, totdat, isRest, isRpc } from './testhulp.mjs';

const MODULE = process.env.KG_SYNC_MODULE ? pathToFileURL(path.resolve(process.env.KG_SYNC_MODULE)).href : '../../../sync/thuisplanner-sync.js';
const mod = await import(MODULE);
const { maakSync } = mod;

const omg = maakOmgeving({ maakSync, voorvoegsel: 'P1P2' });
const { run, sessie, maak } = omg;
let anna;
const huishouden = (naam, leden = []) => omg.huishouden(anna, naam, leden);
// Alles wat de opslag op het toestel bevat, als één tekst (sleutels en waarden).
const opgeslagen = o => [...o.m.entries()].map(([k, v]) => `${k}=${v}`).join('\n');

before(async () => {
  for (const n of ['anna', 'bram', 'carla']) await omg.maakPersoon(n);
  anna = await sessie('anna');
});
after(() => omg.ruimOp());

test('P1 de opslag op het toestel bevat alleen identiteiten: geen titel, naam, plek of notitie van een onbevestigde opdracht', { timeout: 90000 }, async () => {
  const h = await huishouden('P1a', ['bram']);
  const bram = await sessie('bram');
  const opslag = nieuweOpslag();
  const b = maak(bram, h, { opslag, geheugen: new Map() });
  await b.start();
  await totdat(() => b.toestand.lid, 15000, 'geladen');
  // Netwerk weg na het vastleggen: de opdrachten blijven onbevestigd (onzeker).
  const pt = bram.poort(isRest('tasks', 'POST'));
  const pb = bram.poort(isRpc('add_shopping_items'));
  const pa = bram.poort(isRpc('save_event'));
  b.acties.taakToevoegen(`P1a-tandarts-${run}`, { due_date: '2026-11-03' });
  b.acties.boodschapToevoegen(`P1a-hagelslag-${run}`);
  b.acties.afspraakBewaren({ start_date: '2026-11-04', title: `P1a-ouderavond-${run}`, location: `P1a-school-${run}`, notes: `P1a-notitie-${run}`, visibility: 'household' });
  await Promise.all([pt.binnen, pb.binnen, pa.binnen]);
  for (const p of [pt, pb, pa]) p.geefVrij({ antwoordWeg: true });
  await totdat(() => b.openstaand.length === 3 && b.openstaand.every(o => o.staat === 'onzeker'), 15000, 'drie onbevestigd');
  const tekst = opgeslagen(opslag);
  assert.equal(opslag.m.size, 3, 'drie identiteiten op het toestel');
  for (const woord of ['tandarts', 'hagelslag', 'ouderavond', 'school', 'notitie', '2026-11-03', '2026-11-04']) {
    assert.ok(!tekst.includes(woord), `inhoud op het toestel: ${woord}`);
  }
  for (const v of opslag.m.values()) {
    const o = JSON.parse(v);
    assert.equal(o.inhoudNietBewaard, true);
    assert.ok(['taak', 'boodschap', 'afspraak'].includes(o.soort) && o.id && o.staat === 'onzeker');
  }
  // In het geheugen van deze pagina staat de inhoud nog wel: zonder herstart gewoon opnieuw proberen.
  assert.ok(b.toestand.taken.some(x => x.title === `P1a-tandarts-${run}` && x.onzeker));
});

test('P1 herstart: eerst serverbevestiging; wat niet aankwam, opnieuw invoeren onder dezelfde UUID; een late aankomst maakt niets dubbel', { timeout: 120000 }, async () => {
  const h = await huishouden('P1b', ['bram']);
  const s1 = await sessie('bram');
  const opslag1 = nieuweOpslag();
  const b1 = maak(s1, h, { opslag: opslag1, geheugen: new Map() });
  await b1.start();
  await totdat(() => b1.toestand.lid, 15000, 'geladen');
  // (1) Opgeslagen, maar het antwoord is verloren. (2) Nooit aangekomen (en het oude verzoek hangt nog).
  const p1 = s1.poort(isRest('tasks', 'POST'), { eerstUitvoeren: true });
  b1.acties.taakToevoegen(`P1b-opgeslagen-${run}`);
  await p1.binnen;
  const p2 = s1.poort(isRest('tasks', 'POST'));
  b1.acties.taakToevoegen(`P1b-nooit-${run}`);
  await p2.binnen;
  const p3 = s1.poort(isRpc('add_shopping_items'));
  b1.acties.boodschapToevoegen(`P1b-melk-${run}`);
  await p3.binnen;
  const bewaard = Object.fromEntries(opslag1.m);
  assert.equal(Object.keys(bewaard).length, 3);
  // De taak die de server (nog) niet heeft: de eerste is al gecommit, de tweede hangt in de poort.
  const nooitId = Object.values(bewaard).map(v => JSON.parse(v))
    .find(o => o.soort === 'taak' && !sql(`select id from public.tasks where id = '${o.id}'`)).id;

  // Herstart: nieuwe sessie, nieuwe module-instantie (leeg geheugen), dezelfde opslag.
  const s2 = await sessie('bram');
  let posts = 0;
  s2.poort((u, m) => { if (isRest('tasks', 'POST')(u, m) || isRpc('add_shopping_items')(u, m)) posts++; return false; });
  const opslag2 = nieuweOpslag(bewaard);
  const b2 = maak(s2, h, { opslag: opslag2, geheugen: new Map() });
  await b2.start();
  // Eerst serverbevestiging: de opgeslagen taak staat er met zijn titel van de server en is van het toestel gehaald.
  await totdat(() => b2.toestand.taken.some(x => x.title === `P1b-opgeslagen-${run}` && !x.onzeker), 15000, 'opgeslagen taak bevestigd');
  assert.equal(opslag2.m.size, 2, 'de bevestigde taak staat niet meer op het toestel');
  // Wat de server niet heeft: zichtbaar als "inhoud niet op dit toestel", zonder titel; er is niets vanzelf verstuurd.
  const taak = b2.toestand.taken.find(x => x.id === nooitId);
  assert.ok(taak?.inhoudNietBewaard && taak.title === null && taak.onzeker, 'taak zonder inhoud');
  const bood = b2.toestand.boodschappen.find(x => x.inhoudNietBewaard);
  assert.ok(bood && bood.name === null, 'boodschap zonder inhoud');
  assert.equal(posts, 0, 'na de herstart vanzelf verstuurd');
  assert.ok(b2.openstaand.every(o => o.zonderInhoud), 'openstaand meldt zonder inhoud');
  // Opnieuw proberen zonder inhoud kan niet (er is niets om te versturen): een uitleg, niets verstuurd.
  const leeg = await b2.acties.opnieuwProberen(nooitId);
  assert.ok(!leeg.ok && leeg.inhoudOntbreekt, 'zonder inhoud verstuurd');
  assert.equal(posts, 0);
  // Opnieuw invoeren: dezelfde UUID.
  assert.ok((await b2.acties.opnieuwInvoeren(nooitId, { soort: 'taak', titel: `P1b-nooit-${run}`, velden: {} })).ok);
  assert.ok((await b2.acties.opnieuwInvoeren(bood.id, { soort: 'boodschap', naam: `P1b-melk-${run}` })).ok);
  assert.equal(sql(`select id from public.tasks where household_id = '${h}' and title = 'P1b-nooit-${run}'`), nooitId);
  // De oude verzoeken van vóór de herstart komen alsnog aan: nog steeds één van elk.
  p2.geefVrij();
  p3.geefVrij();
  p1.geefVrij({ antwoordWeg: true });
  await wacht(1500);
  assert.equal(sql(`select count(*) from public.tasks where household_id = '${h}' and title = 'P1b-opgeslagen-${run}'`), '1');
  assert.equal(sql(`select count(*) from public.tasks where household_id = '${h}' and title = 'P1b-nooit-${run}'`), '1');
  assert.equal(sql(`select count(*) from public.shopping_items where household_id = '${h}' and deleted_at is null and name ilike 'P1b-melk-${run}'`), '1');
  await b2.vernieuw();
  assert.equal(opslag2.m.size, 0, 'het toestel is leeg na bevestiging');
});

test('P1 opnieuw invoeren van iets dat de server intussen al heeft: dezelfde UUID, geen tweede (taak, boodschap, afspraak)', { timeout: 90000 }, async () => {
  const h = await huishouden('P1c', ['bram']);
  const bram = await sessie('bram');
  const b = maak(bram, h, { opslag: nieuweOpslag(), geheugen: new Map() });
  await b.start();
  await totdat(() => b.toestand.lid, 15000, 'geladen');
  const t = await b.acties.taakToevoegen(`P1c-taak-${run}`);
  const bo = await b.acties.boodschapToevoegen(`P1c-kaas-${run}`);
  const a = await b.acties.afspraakBewaren({ start_date: '2026-11-05', title: `P1c-afspraak-${run}`, visibility: 'private' });
  assert.ok(t.ok && bo.ok && a.ok);
  const boId = sql(`select id from public.shopping_items where household_id = '${h}' and name ilike 'P1c-kaas-${run}'`);
  const aId = sql(`select e.id from public.events e join public.event_details d on d.event_id = e.id where e.household_id = '${h}' and d.title = 'P1c-afspraak-${run}'`);
  // Opnieuw invoeren met dezelfde UUID's (bijvoorbeeld een tweede toestel met een oude identiteit, of een race met
  // de eerste bevestiging): de server herkent ze; er komt niets bij.
  assert.ok((await b.acties.opnieuwInvoeren(t.id, { soort: 'taak', titel: `P1c-taak-${run}`, velden: {} })).ok);
  assert.ok((await b.acties.opnieuwInvoeren(boId, { soort: 'boodschap', naam: `P1c-kaas-${run}` })).ok);
  assert.ok((await b.acties.opnieuwInvoeren(aId, { soort: 'afspraak', afspraak: { id: aId, start_date: '2026-11-05', title: `P1c-afspraak-${run}`, visibility: 'private' } })).ok);
  assert.equal(sql(`select count(*) from public.tasks where household_id = '${h}'`), '1');
  assert.equal(sql(`select count(*) from public.shopping_items where household_id = '${h}' and deleted_at is null`), '1');
  assert.equal(sql(`select count(*) from public.events where household_id = '${h}'`), '1');
});

test('P2 tellen en wissen per account, over alle huishoudens; een ander account op hetzelfde toestel blijft ongemoeid', { timeout: 90000 }, async () => {
  const h1 = await huishouden('P2a', ['bram', 'carla']);
  const h2 = await huishouden('P2b', ['bram']);
  const opslag = nieuweOpslag();
  const geheugen = new Map();
  const bram = await sessie('bram');
  const carla = await sessie('carla');
  const b1 = maak(bram, h1, { opslag, geheugen });
  const b2 = maak(bram, h2, { opslag, geheugen });
  const c1 = maak(carla, h1, { opslag, geheugen });
  for (const s of [b1, b2, c1]) { await s.start(); await totdat(() => s.toestand.lid, 15000, 'geladen'); }
  const pb1 = bram.poort(isRest('tasks', 'POST'));
  const pb2 = bram.poort(isRpc('add_shopping_items'));
  const pc = carla.poort(isRest('tasks', 'POST'));
  b1.acties.taakToevoegen(`P2-b1-${run}`);
  b2.acties.boodschapToevoegen(`P2-b2-${run}`);
  c1.acties.taakToevoegen(`P2-c-${run}`);
  await Promise.all([pb1.binnen, pb2.binnen, pc.binnen]);
  for (const p of [pb1, pb2, pc]) p.geefVrij({ antwoordWeg: true });
  await totdat(() => b1.openstaand.length === 1 && b2.openstaand.length === 1 && c1.openstaand.length === 1, 15000, 'onbevestigd');
  const bramId = omg.personen.bram.id, carlaId = omg.personen.carla.id;
  assert.equal(mod.onbevestigdOpToestel({ opslag, geheugen, gebruiker: bramId }), 2, 'Bram: twee huishoudens');
  assert.equal(mod.onbevestigdOpToestel({ opslag, geheugen, gebruiker: carlaId }), 1);
  assert.equal(mod.onbevestigdOpToestel({ opslag, geheugen, gebruiker: null }), 0);
  // P4: stoppen, opnieuw ophalen en een nieuwe sessie wissen niets.
  await b1.stop(); await b1.start(); await b1.vernieuw();
  assert.equal(mod.onbevestigdOpToestel({ opslag, geheugen, gebruiker: bramId }), 2, 'stil gewist');
  // P2: wissen na de keuze van de gebruiker: alleen Bram, in beide huishoudens, opslag en geheugen.
  assert.equal(mod.wisOnbevestigdOpToestel({ opslag, geheugen, gebruiker: bramId }), 2);
  assert.equal(mod.onbevestigdOpToestel({ opslag, geheugen, gebruiker: bramId }), 0);
  assert.ok(![...opslag.m.keys()].some(k => k.includes(bramId)), 'opslag van Bram niet leeg');
  assert.equal(mod.onbevestigdOpToestel({ opslag, geheugen, gebruiker: carlaId }), 1, 'Carla geraakt');
  assert.equal(c1.openstaand.length, 1);
  // Wat de server al heeft, blijft daar (wissen is alleen dit toestel).
  assert.equal(sql(`select count(*) from public.tasks where household_id = '${h1}' and title = 'P2-b1-${run}'`), '0', 'nooit aangekomen');
});

test('P3 de ontwikkelmodus (bewaarInhoud) bewaart de inhoud wel, een privé-afspraak nooit', { timeout: 60000 }, async () => {
  const h = await huishouden('P3', ['bram']);
  const bram = await sessie('bram');
  const opslag = nieuweOpslag();
  const b = maak(bram, h, { opslag, geheugen: new Map(), bewaarInhoud: true });
  await b.start();
  await totdat(() => b.toestand.lid, 15000, 'geladen');
  const pt = bram.poort(isRest('tasks', 'POST'));
  const pa = bram.poort(isRpc('save_event'));
  b.acties.taakToevoegen(`P3-taak-${run}`);
  b.acties.afspraakBewaren({ start_date: '2026-11-06', title: `P3-geheim-${run}`, visibility: 'private' });
  await Promise.all([pt.binnen, pa.binnen]);
  for (const p of [pt, pa]) p.geefVrij({ antwoordWeg: true });
  await totdat(() => b.openstaand.length === 2 && b.openstaand.every(o => o.staat === 'onzeker'), 15000, 'onbevestigd');
  const tekst = opgeslagen(opslag);
  assert.ok(tekst.includes(`P3-taak-${run}`), 'ontwikkelmodus bewaart de taak niet');
  assert.ok(!tekst.includes('P3-geheim'), 'privé-afspraak met inhoud op het toestel');
});
