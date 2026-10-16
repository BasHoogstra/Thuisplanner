// Thuisplanner KG-5D herstelronde 3 (review van 89e58c5): regressietests voor twee idempotentiefouten,
// tegen een echte, LOKALE Supabase-stack. Zie docs/thuisplanner-sync.md §9.
//   komtgoed/supabase/tests/integratie/run.sh
// Tegenproef tegen een andere versie van de module (bijv. die uit 89e58c5):
//   KG_SYNC_MODULE=/pad/naar/thuisplanner-sync.js node --test herstel3.test.mjs   (R1 moet falen)
// KG_TEGENPROEF=1: R2 met de databasefunctie van vóór deze ronde (eerst op naam zoeken): de herhaalde
// opdracht opent de afgevinkte boodschap dan wél opnieuw; zo is aangetoond dat de test het ziet.
import { test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { maakOmgeving, nieuweOpslag, sql, totdat, isRest, isRpc, isOphalen } from './testhulp.mjs';

const MODULE = process.env.KG_SYNC_MODULE ? pathToFileURL(path.resolve(process.env.KG_SYNC_MODULE)).href : '../../../sync/thuisplanner-sync.js';
const { maakSync } = await import(MODULE);
const TEGENPROEF = process.env.KG_TEGENPROEF === '1';
const omg = maakOmgeving({ maakSync, voorvoegsel: 'Herstel3' });
const { sessie, maak, rpcAls, lidId } = omg;

let anna;
const huishouden = (naam, leden = []) => omg.huishouden(anna, naam, leden);
before(async () => {
  for (const n of ['anna', 'bram']) await omg.maakPersoon(n);
  anna = await sessie('anna');
});
after(() => omg.ruimOp());
afterEach(() => { sql(`delete from public.households where name like '%${omg.run}%'`); });

const telTaken = h => Number(sql(`select count(*) from public.tasks where household_id = '${h}'`));
const heeft = (s, id) => (s.openstaand || []).some(x => x.id === id);
const inOpslag = (opslag, id) => [...opslag.m.entries()].some(([k, v]) => k.includes(id) || v.includes(id));
// Seintjes starten geen ophaalronde (de test bepaalt de volgorde).
async function geladen(s, h, extra) {
  const sync = maak(s, h, { debounceMs: 600000, ...extra });
  await sync.start();
  await totdat(() => sync.toestand.lid, 15000, 'geladen');
  return sync;
}
async function toegangTerug(h, bram) {
  const tok = await rpcAls(anna, 'create_invite', { p_household: h, p_member: null, p_role: 'member' });
  await rpcAls(bram, 'accept_invite', { p_token: tok, p_display_name: 'Bram' });
}

// ============================ Fout 1: overlappende geweigerde herhaalpoging ============================
test('R1a eerste poging gecommit, antwoord tegengehouden; overlappende herhaling krijgt 42501; eerste antwoord verloren: identiteit blijft, na herstel één rij', { skip: TEGENPROEF, timeout: 90000 }, async () => {
  const h = await huishouden('R1a', ['bram']);
  const bram = await sessie('bram');
  const opslag = nieuweOpslag();
  const b = await geladen(bram, h, { opslag, geheugen: new Map() });
  // Het automatische opnieuw ophalen vasthouden tot na stap 4: anders kan de sync de opdracht al zelf
  // bevestigen (bijvoorbeeld bij een laat Realtime-SUBSCRIBED; de taak staat al op de server) en bereikt de
  // herhaling de server nooit. Dat hing af van timing.
  const ophalen = bram.poort(isOphalen('tasks'), { blijvend: true });
  // 1. Eerste poging: de server commit, het antwoord wordt tegengehouden.
  const p1 = bram.poort(isRest('tasks', 'POST'), { eerstUitvoeren: true });
  const eerste = b.acties.taakToevoegen('R1a-fietspomp');
  await p1.binnen;
  const id = b.openstaand[0].id;
  assert.equal(telTaken(h), 1, 'eerste poging is gecommit');
  // 2. Toegang ingetrokken; 3. overlappende herhaling: 42501.
  await rpcAls(anna, 'archive_member', { p_household: h, p_member: lidId(h, 'Bram') });
  assert.ok(heeft(b, id), 'de opdracht was al bevestigd vóór de herhaling');
  const herhaling = await b.acties.opnieuwProberen(id);
  assert.equal(herhaling.ok, false);
  assert.ok(heeft(b, id), 'de geweigerde herhaling verwijderde de opdracht terwijl de eerste poging nog liep');
  assert.ok(inOpslag(opslag, id), 'de geweigerde herhaling haalde de opdracht uit de opslag');
  // 4. Het antwoord van de eerste poging gaat verloren.
  p1.geefVrij({ antwoordWeg: true });
  await eerste;
  assert.ok(heeft(b, id), 'opdracht verdwenen na het verloren eerste antwoord');
  assert.equal(b.openstaand.find(x => x.id === id).staat, 'onzeker');
  ophalen.geefVrij();
  ophalen.dicht = true;
  // 5. Toegang hersteld, opnieuw starten en opnieuw proberen: dezelfde UUID, precies één rij.
  await toegangTerug(h, bram);
  await b.stop();
  await b.start();
  await totdat(() => !heeft(b, id), 15000, 'bevestigd na herstel van toegang');
  const nogmaals = await b.acties.opnieuwProberen(id);
  assert.equal(nogmaals.ok, false, 'bevestigde opdracht nog eens verstuurd');
  assert.equal(telTaken(h), 1);
  assert.equal(sql(`select id from public.tasks where household_id = '${h}'`), id);
  assert.ok(!inOpslag(opslag, id));
});

test('R1b zelfde volgorde maar de eerste poging bereikt de server niet: na herstel opnieuw proberen = één rij, dezelfde UUID', { skip: TEGENPROEF, timeout: 90000 }, async () => {
  const h = await huishouden('R1b', ['bram']);
  const bram = await sessie('bram');
  const opslag = nieuweOpslag();
  const b = await geladen(bram, h, { opslag, geheugen: new Map() });
  const p1 = bram.poort(isRest('tasks', 'POST'));
  const eerste = b.acties.taakToevoegen('R1b-sleutels');
  await p1.binnen;
  const id = b.openstaand[0].id;
  await rpcAls(anna, 'archive_member', { p_household: h, p_member: lidId(h, 'Bram') });
  assert.equal((await b.acties.opnieuwProberen(id)).ok, false);
  assert.ok(heeft(b, id), 'opdracht verdwenen');
  p1.geefVrij({ antwoordWeg: true });
  await eerste;
  assert.equal(telTaken(h), 0);
  await toegangTerug(h, bram);
  await b.stop();
  await b.start();
  await totdat(() => b.toestand.taken.some(x => x.id === id && x.onzeker), 15000, 'na herstel zichtbaar als onbevestigd');
  assert.ok((await b.acties.opnieuwProberen(id)).ok);
  assert.equal(telTaken(h), 1);
  assert.equal(sql(`select id from public.tasks where household_id = '${h}'`), id);
});

// ============================ Fout 2: boodschappen opnieuw proberen ============================
const melk = h => sql(`select count(*) || ':' || bool_and(checked_at is not null) from public.shopping_items where household_id = '${h}' and name = 'Melk' and deleted_at is null`);

test(TEGENPROEF ? 'R2 TEGENPROEF: met de oude databasefunctie opent de herhaalde opdracht de afgevinkte Melk opnieuw'
  : 'R2 Melk toevoegen, antwoord verloren, ander gezinslid vinkt af, opnieuw proberen: Melk blijft afgevinkt; bewust nieuw opent hem wel', { timeout: 90000 }, async () => {
  let oudeFunctie;
  if (TEGENPROEF) {
    oudeFunctie = sql(`select pg_get_functiondef('private.add_shopping_items(uuid, uuid[], text[])'::regprocedure)`);
    const bron = readFileSync(new URL('../../migrations/20261012120000_kg5c_inhoud.sql', import.meta.url), 'utf8');
    const i = bron.indexOf('create function private.add_shopping_items');
    sql(bron.slice(i, bron.indexOf('end $$;', i) + 'end $$;'.length).replace('create function', 'create or replace function'));
  }
  try {
    const h = await huishouden('R2', ['bram']);
    const bram = await sessie('bram');
    const b = await geladen(bram, h, { opslag: nieuweOpslag(), geheugen: new Map() });
    // Het automatische opnieuw ophalen vasthouden tot na de herhaling: anders kan de sync de opdracht al zelf
    // bevestigen (Melk staat op de server) en bereikt de herhaling de server nooit. Dat hing af van timing.
    const ophalen = bram.poort(isOphalen('shopping_items'), { blijvend: true });
    let r;
    try {
      bram.poort(isRpc('add_shopping_items'), { eerstUitvoeren: true }).geefVrij({ antwoordWeg: true });
      r = await b.acties.boodschapToevoegen('Melk');
      assert.equal(r.ok, false);
      assert.equal(melk(h), '1:false');
      // Een ander gezinslid (Anna) vinkt Melk af.
      const { error } = await anna.c.from('shopping_items').update({ checked_at: new Date().toISOString() }).eq('household_id', h).eq('name', 'Melk');
      assert.ifError(error);
      assert.equal(melk(h), '1:true');
      // De oorspronkelijke opdracht opnieuw (zelfde UUID); hij is nog onbevestigd.
      assert.ok(heeft(b, r.id), 'de opdracht was al bevestigd vóór de herhaling');
      assert.ok((await b.acties.opnieuwProberen(r.id)).ok);
      assert.ok(!heeft(b, r.id), 'de herhaling bevestigde de opdracht niet');
    } finally {
      ophalen.geefVrij();
      ophalen.dicht = true;
    }
    if (TEGENPROEF) {
      assert.equal(melk(h), '1:false', 'tegenproef: verwacht dat de oude functie Melk opnieuw opent');
      return;
    }
    assert.equal(melk(h), '1:true', 'de herhaalde opdracht opende de afgevinkte Melk opnieuw');
    // Nog eens herhalen, nu rechtstreeks: geen bijwerking.
    await rpcAls(bram, 'add_shopping_items', { p_household: h, p_ids: [r.id], p_names: ['Melk'] });
    assert.equal(melk(h), '1:true');
    // Bewust een nieuwe toevoeging (nieuwe UUID): de productregel "afgevinkt komt terug" geldt.
    await b.vernieuw();
    const nieuw = await b.acties.boodschapToevoegen('Melk', { bewustNieuw: true });
    assert.equal(nieuw.ok, true);
    assert.notEqual(nieuw.id, r.id);
    assert.equal(melk(h), '1:false', 'bewust nieuwe toevoeging opende de afgevinkte Melk niet');
    assert.equal(nieuw.data?.[0]?.outcome, 'terug');
  } finally {
    if (TEGENPROEF) sql(oudeFunctie);
  }
});
