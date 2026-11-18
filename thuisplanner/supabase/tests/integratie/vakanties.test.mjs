// Thuisplanner F8 Vakanties (V1.1): integratietest tegen een echte, LOKALE Supabase-stack (supabase start in thuisplanner/).
// Controleert via de echte API (PostgREST), Auth (GoTrue) en Realtime wat de SQL-matrix (KG-T76 t/m KG-T83) niet kan:
// de nieuwe tabellen en functies zijn via de API bruikbaar voor een lid en dicht voor een buitenstaander, oude
// aanroepen van add_shopping_items (zonder vakantie) werken ongewijzigd, en de seintjes van de vakantietabellen
// bevatten alleen {t, id, v, op}. Gebruikt geen psql: controle buiten RLS gaat via de service-rol van de lokale stack.
//
//   thuisplanner/supabase/tests/integratie/run.sh
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const { API_URL, ANON_KEY, SERVICE_ROLE_KEY } = process.env;
for (const [k, v] of Object.entries({ API_URL, ANON_KEY, SERVICE_ROLE_KEY })) {
  if (!v) throw new Error(k + ' ontbreekt: start via run.sh (leest supabase status -o env)');
}
if (!/\/\/(127\.0\.0\.1|localhost)[:/]/.test(API_URL)) throw new Error('Weigering: alleen een lokale Supabase');

const opties = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(API_URL, SERVICE_ROLE_KEY, opties);
const run = randomUUID().slice(0, 8);
const wachtwoord = 'Test-' + randomUUID();
const accounts = {};
const huishoudens = [];
const wacht = ms => new Promise(r => setTimeout(r, ms));

async function account(naam) {
  const email = `${naam}-${run}@test.invalid`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: wachtwoord, email_confirm: true });
  assert.ifError(error);
  const client = createClient(API_URL, ANON_KEY, opties);
  const { error: e2 } = await client.auth.signInWithPassword({ email, password: wachtwoord });
  assert.ifError(e2);
  accounts[naam] = { id: data.user.id, client };
  return client;
}
const ok = ({ data, error }) => { assert.ifError(error); return data; };

let h, ho, vera, wout, otto, mWout;
before(async () => {
  vera = await account('vera'); wout = await account('wout'); otto = await account('otto');
  h = ok(await vera.rpc('create_household', { p_name: 'Vakantie ' + run, p_display_name: 'Vera' }));
  ho = ok(await otto.rpc('create_household', { p_name: 'Overburen ' + run, p_display_name: 'Otto' }));
  huishoudens.push(h, ho);
  const token = ok(await vera.rpc('create_invite', { p_household: h }));
  ok(await wout.rpc('accept_invite', { p_token: token, p_display_name: 'Wout' }));
  mWout = ok(await wout.rpc('my_memberships')).find(m => m.household_id === h).member_id;
});

after(async () => {
  for (const { client } of Object.values(accounts)) await client.removeAllChannels();
  if (huishoudens.length) await admin.from('households').delete().in('id', huishoudens);
  for (const { id } of Object.values(accounts)) await admin.auth.admin.deleteUser(id);
});

// Wacht tot een kanaal een eindstatus heeft; na 10 s 'GEEN_ANTWOORD'.
function abonneer(kanaal) {
  return new Promise(resolve => {
    const t = setTimeout(() => resolve({ status: 'GEEN_ANTWOORD' }), 10000);
    kanaal.subscribe((status, err) => { clearTimeout(t); resolve({ status, err }); });
  });
}
// Realtime is na een (her)start pas na ±30 s klaar.
async function wachtOpRealtime(client) {
  for (let i = 0; i < 18; i++) {
    const k = client.channel('kg-gereed-' + randomUUID());
    const r = await abonneer(k);
    await client.removeChannel(k);
    if (r.status === 'SUBSCRIBED') return;
    await wacht(5000);
  }
  throw new Error('Realtime werd niet gereed');
}

test('vakanties via de API: lid maakt, wijzigt, pakt in, neemt over en koppelt; buitenstaander ziet en doet niets', async () => {
  const v1 = randomUUID(), v2 = randomUUID();
  ok(await vera.from('trips').insert([
    { id: v2, household_id: h, name: 'Texel', start_date: '2026-07-01', end_date: '2026-07-08' },
    { id: v1, household_id: h, name: 'Frankrijk', start_date: '2027-07-12' },
  ]));
  // Alleen een einddatum kan niet.
  const { error: eEinde } = await vera.from('trips').insert({ household_id: h, name: 'Alleen einde', end_date: '2027-01-01' });
  assert.ok(eEinde, 'einddatum zonder vertrekdatum geaccepteerd');
  // Wijzigen met versie: een tweede wijziging met dezelfde versie raakt niets.
  assert.equal(ok(await wout.from('trips').update({ end_date: '2027-07-26' }).eq('id', v1).eq('version', 1).select('version')).length, 1);
  assert.equal(ok(await vera.from('trips').update({ name: 'Oud' }).eq('id', v1).eq('version', 1).select('version')).length, 0);

  // Paklijst: per persoon en Gezamenlijk; dubbel geeft 23505.
  ok(await vera.from('trip_packing_items').insert([
    { household_id: h, trip_id: v2, member_id: mWout, name: 'Sokken' },
    { household_id: h, trip_id: v2, member_id: mWout, name: 'Zwembroek' },
    { household_id: h, trip_id: v2, member_id: null, name: 'Zonnebrand' },
    { household_id: h, trip_id: v1, member_id: mWout, name: 'Sokken' },
  ]));
  const { error: eDubbel } = await wout.from('trip_packing_items').insert({ household_id: h, trip_id: v1, member_id: mWout, name: ' sokken' });
  assert.equal(eDubbel?.code, '23505', 'dubbel pakitem niet geweigerd');

  // Overnemen: aanvullend; herhaling met dezelfde opdracht geeft dezelfde items.
  const opdracht = randomUUID();
  const eerste = ok(await wout.rpc('copy_packing_items', { p_household: h, p_command: opdracht, p_from_trip: v2, p_to_trip: v1 }));
  assert.deepEqual(eerste.map(r => r.name).sort(), ['Zonnebrand', 'Zwembroek']);
  const herhaling = ok(await wout.rpc('copy_packing_items', { p_household: h, p_command: opdracht, p_from_trip: v2, p_to_trip: v1 }));
  assert.deepEqual(herhaling.map(r => r.id).sort(), eerste.map(r => r.id).sort());

  // Vinkjes in één keer, met versies.
  const items = ok(await wout.from('trip_packing_items').select('id, version').eq('trip_id', v1).is('deleted_at', null));
  const gezet = ok(await wout.rpc('set_packed', { p_household: h, p_trip: v1, p_items: items.map(i => ({ id: i.id, version: i.version, packed: true })) }));
  assert.ok(gezet.every(r => r.outcome === 'gezet'), 'niet alle vinkjes gezet');
  const verouderd = ok(await wout.rpc('set_packed', { p_household: h, p_trip: v1, p_items: [{ id: items[0].id, version: items[0].version, packed: false }] }));
  assert.equal(verouderd[0].outcome, 'overgeslagen');

  // Voorbereiding als gewone taak.
  ok(await wout.from('tasks').insert({ household_id: h, title: 'Vignet regelen', trip_id: v1 }));
  assert.equal(ok(await vera.from('tasks').select('id').eq('trip_id', v1)).length, 1);

  // Boodschappen: de oude aanroep (zonder vakantie) werkt ongewijzigd; met vakantie komt er een koppeling.
  const los = ok(await vera.rpc('add_shopping_items', { p_household: h, p_ids: [randomUUID()], p_names: ['Melk'] }));
  assert.equal(los[0].outcome, 'nieuw');
  const metVakantie = ok(await vera.rpc('add_shopping_items', { p_household: h, p_ids: [randomUUID()], p_names: ['Reispil'], p_trip: v1 }));
  const koppelingen = ok(await wout.from('trip_shopping_links').select('trip_id, settled_at').eq('shopping_item_id', metVakantie[0].id));
  assert.deepEqual(koppelingen, [{ trip_id: v1, settled_at: null }]);
  const { error: eSettled } = await wout.from('trip_shopping_links').update({ settled_at: new Date().toISOString() }).eq('shopping_item_id', metVakantie[0].id);
  assert.ok(eSettled, 'settled_at via de API te schrijven');

  // Buitenstaander: ziet niets, schrijft niets, roept niets aan.
  for (const t of ['trips', 'trip_packing_items', 'trip_shopping_links']) {
    assert.equal(ok(await otto.from(t).select('id').eq('household_id', h)).length, 0, 'buitenstaander ziet ' + t);
  }
  const { error: eOtto } = await otto.rpc('copy_packing_items', { p_household: h, p_command: randomUUID(), p_from_trip: v2, p_to_trip: v1 });
  assert.ok(eOtto, 'buitenstaander neemt over');
  assert.equal(eOtto.details ?? null, null, 'fout bevat DETAIL');
  const { error: eOttoTrip } = await otto.from('trips').insert({ household_id: h, name: 'Inbraak' });
  assert.ok(eOttoTrip, 'buitenstaander maakt een vakantie');
  // Echt verwijderen kan niemand.
  await vera.from('trips').delete().eq('id', v1);
  assert.equal(ok(await admin.from('trips').select('id').eq('id', v1)).length, 1, 'vakantie echt verwijderd via de API');
});

// De tijdslimiet ligt boven de som van de wachttijden binnen de test (wachtOpRealtime ±270 s, proeven 120 s, controle
// 10 s), zodat een fout altijd met een eigen melding eindigt en nooit als algemene time-out (review PR #54, R3/R4).
test('vakanties realtime: seintjes van de drie vakantietabellen bevatten alleen {t, id, v, op}', { timeout: 420000 }, async () => {
  await wachtOpRealtime(wout);
  const kanaal = ok(await wout.rpc('household_channel', { p_household: h }));
  await wout.realtime.setAuth();
  const ontvangen = [];
  const k = wout.channel(kanaal, { config: { private: true } }).on('broadcast', { event: 'wijziging' }, m => ontvangen.push(m.payload));
  const r = await abonneer(k);
  assert.equal(r.status, 'SUBSCRIBED', `lid kan het huishoudkanaal niet openen (${r.status})`);
  // Pas live als een seintje uit de database aantoonbaar binnenkomt (tweede review PR #54; deze test faalde in de
  // CI-volgorde). Twee oorzaken, allebei van de lokale Realtime en niet van de app:
  //  - na een (her)start bouwt Realtime de replicatie vanuit de database pas op bij het eerste privékanaal; wat vóór die
  //    stream geschreven wordt, komt nooit aan (wachtOpRealtime bewijst dat niet: een openbaar kanaal raakt de replicatie
  //    niet);
  //  - node --test draait de bestanden op alfabet, dus vlak hiervoor schrijft vakanties-sync.test.mjs (V16, grote
  //    overname) ~3700 inpakitems, elk een seintje; is Realtime dan verbonden, dan raakt de lokale tenant zijn limiet per
  //    seconde en laat hij ongeveer een minuut lang seintjes vallen (gemeten: 57 s), en die limiet slaat pas na een paar
  //    seconden aan.
  // Daarom: een proefvakantie per poging, en pas verder als 5 proeven op rij (~10 s) aankomen (hoogstens 2 minuten,
  // binnen de tijdslimiet van de test). De controles hieronder blijven gelijk.
  // Review PR #54, R3: elke controle op de precieze rij (id) en de soort gebeurtenis (op 'I'), niet alleen op de tabel:
  // een laat proefseintje of een seintje van een andere rij mag de test nooit laten slagen. Het kanaal gaat altijd dicht.
  try {
    const proefTot = Date.now() + 120000;
    let opRij = 0;
    for (let i = 0; opRij < 5 && Date.now() < proefTot; i++) {
      const proef = randomUUID();
      ok(await vera.from('trips').insert({ id: proef, household_id: h, name: 'Proef ' + i }));
      let kwam = false;
      for (let j = 0; j < 20 && !kwam; j++) { kwam = ontvangen.some(p => p.t === 'trips' && p.id === proef); if (!kwam) await wacht(100); }
      opRij = kwam ? opRij + 1 : 0;
      if (kwam) await wacht(1000);
    }
    assert.ok(opRij >= 5, 'het huishoudkanaal ontvangt geen betrouwbare seintjes uit de database');
    ontvangen.length = 0;
    const v = randomUUID();
    ok(await vera.from('trips').insert({ id: v, household_id: h, name: 'Geheime-bestemming-' + run }));
    const item = ok(await vera.from('trip_packing_items').insert({ household_id: h, trip_id: v, name: 'Geheim-item-' + run }).select('id'))[0].id;
    ok(await vera.rpc('add_shopping_items', { p_household: h, p_ids: [randomUUID()], p_names: ['Geheime-boodschap-' + run], p_trip: v }));
    const links = ok(await admin.from('trip_shopping_links').select('id').eq('trip_id', v)).map(x => x.id);
    assert.equal(links.length, 1, 'precies één koppeling met deze vakantie');
    const verwacht = [['trips', v], ['trip_packing_items', item], ['trip_shopping_links', links[0]]];
    const binnen = (t, id) => ontvangen.some(p => p.t === t && p.id === id && p.op === 'I');
    const tot = Date.now() + 10000;
    while (!verwacht.every(([t, id]) => binnen(t, id)) && Date.now() < tot) await wacht(100);
    for (const [t, id] of verwacht) assert.ok(binnen(t, id), `geen seintje (I) voor ${t} ${id}`);
    assert.equal(ontvangen.find(p => p.t === 'trips' && p.id === v).v, 1, 'het seintje van de nieuwe vakantie noemt niet versie 1');
    for (const p of ontvangen) {
      assert.deepEqual(Object.keys(p).sort(), ['id', 'op', 't', 'v'], 'seintje bevat meer dan t/id/v/op');
      assert.doesNotMatch(JSON.stringify(p), /Geheim/, 'seintje bevat inhoud');
    }
  } finally {
    await wout.removeChannel(k);
  }
});

test('extra inpaklijsten via de API: maken, items, verwijderen en herstellen, overnemen; buitenstaander niets; oude app-risico', async () => {
  const v1 = randomUUID(), v2 = randomUUID(), lijst = randomUUID();
  ok(await vera.from('trips').insert([{ id: v1, household_id: h, name: 'Bron' }, { id: v2, household_id: h, name: 'Doel' }]));
  ok(await vera.from('trip_packing_lists').insert({ id: lijst, household_id: h, trip_id: v1, name: 'Paard' }));
  ok(await wout.from('trip_packing_items').insert([{ household_id: h, trip_id: v1, list_id: lijst, name: 'Zadel' },
    { household_id: h, trip_id: v1, list_id: lijst, name: 'Hoefkrabber' }]));
  // Dezelfde naam en de naam van een lid: geweigerd, met een databasecode die de app kan vertalen.
  assert.equal((await wout.from('trip_packing_lists').insert({ household_id: h, trip_id: v1, name: 'paard' })).error?.code, '23505');
  assert.equal((await wout.from('trip_packing_lists').insert({ household_id: h, trip_id: v1, name: 'Wout' })).error?.code, '23514');
  // Hernoemen met versie (zoals de sync-module).
  assert.equal(ok(await wout.from('trip_packing_lists').update({ name: 'Pony' }).eq('id', lijst).eq('version', 1).select('id,version')).length, 1);
  // Verwijderen en herstellen via de functies; herhalen is veilig.
  const weg = ok(await vera.rpc('delete_packing_list', { p_household: h, p_list: lijst, p_version: 2 }))[0];
  assert.deepEqual([weg.outcome, weg.items], ['verwijderd', 2]);
  assert.equal(ok(await vera.rpc('delete_packing_list', { p_household: h, p_list: lijst, p_version: 2 }))[0].outcome, 'al_verwijderd');
  assert.equal(ok(await vera.from('trip_packing_items').select('id').eq('list_id', lijst).is('deleted_at', null)).length, 0);
  const terug = ok(await wout.rpc('restore_packing_list', { p_household: h, p_list: lijst, p_version: weg.version }))[0];
  assert.deepEqual([terug.outcome, terug.items], ['hersteld', 2]);
  // Overnemen met de lijst; zonder p_lists niet (ook niet als Gezamenlijk).
  ok(await wout.rpc('copy_packing_items', { p_household: h, p_command: randomUUID(), p_from_trip: v1, p_to_trip: v2 }));
  assert.equal(ok(await vera.from('trip_packing_items').select('id').eq('trip_id', v2).is('deleted_at', null)).length, 0);
  const over = ok(await wout.rpc('copy_packing_items', { p_household: h, p_command: randomUUID(), p_from_trip: v1, p_to_trip: v2, p_lists: [lijst] }));
  assert.equal(over.length, 2);
  assert.ok(over.every(x => x.list_id && x.list_id !== lijst && x.member_id === null));
  // Buitenstaander: ziet niets, kan niets.
  assert.equal(ok(await otto.from('trip_packing_lists').select('id').eq('household_id', h)).length, 0);
  assert.ok((await otto.rpc('delete_packing_list', { p_household: h, p_list: lijst, p_version: terug.version })).error);
  assert.ok((await otto.from('trip_packing_lists').insert({ household_id: h, trip_id: v1, name: 'Otto' })).error);
  // Oude app-risico (§20.6): wie list_id niet ophaalt, ziet een item van een extra lijst als Gezamenlijk.
  const oud = ok(await vera.from('trip_packing_items').select('id,member_id,name').eq('trip_id', v1).is('deleted_at', null));
  assert.ok(oud.every(x => x.member_id === null), 'zonder list_id lijkt een item van een extra lijst een Gezamenlijk-item');
});
