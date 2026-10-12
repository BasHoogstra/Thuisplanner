// KomtGoed KG-5B: integratietest tegen een echte, LOKALE Supabase-stack (supabase start in komtgoed/).
// Controleert wat de SQL-matrix niet kan: de echte API (PostgREST), Auth (GoTrue) en Realtime.
//
//   cd komtgoed && supabase start          (realtime aan, zie supabase/config.toml)
//   komtgoed/supabase/tests/integratie/run.sh
//
// De sleutels komen tijdens het draaien uit `supabase status -o env` (lokale demosleutels); ze staan
// nergens in de repository. Alle accounts zijn synthetisch (@test.invalid) en worden na afloop verwijderd.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const { API_URL, ANON_KEY, SERVICE_ROLE_KEY, DB_URL } = process.env;
for (const [k, v] of Object.entries({ API_URL, ANON_KEY, SERVICE_ROLE_KEY, DB_URL })) {
  if (!v) throw new Error(k + ' ontbreekt: start via run.sh (leest supabase status -o env)');
}
for (const u of [API_URL, DB_URL]) {
  if (!/\/\/([^@/]*@)?(127\.0\.0\.1|localhost)[:/]/.test(u)) throw new Error('Weigering: alleen een lokale Supabase, niet ' + u.replace(/\/\/[^@]*@/, '//***@'));
}

const opties = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(API_URL, SERVICE_ROLE_KEY, opties);
const anon = createClient(API_URL, ANON_KEY, opties);
const run = randomUUID().slice(0, 8);
const wachtwoord = 'Test-' + randomUUID();
const accounts = {};   // naam -> { id, client }
const wacht = ms => new Promise(r => setTimeout(r, ms));

// Controle als postgres (buiten RLS), alleen om de uitkomst te verifiëren.
function sql(q) {
  return execFileSync(process.env.PSQL || 'psql', ['-X', '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1', '-d', DB_URL, '-c', q]).toString().trim();
}

async function account(naam) {
  const email = `${naam}-${run}@test.invalid`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: wachtwoord, email_confirm: true });
  assert.ifError(error);
  const client = createClient(API_URL, ANON_KEY, opties);
  const { error: e2 } = await client.auth.signInWithPassword({ email, password: wachtwoord });
  assert.ifError(e2);
  accounts[naam] = { id: data.user.id, client };
  return accounts[naam];
}
async function rpc(naam, fn, args) {
  const { data, error } = await accounts[naam].client.rpc(fn, args);
  assert.ifError(error);
  return data;
}

let h1;
before(async () => {
  for (const n of ['anna', 'mira', 'eve']) await account(n);
  h1 = await rpc('anna', 'create_household', { p_name: 'De Wit ' + run, p_display_name: 'Anna' });
  await rpc('anna', 'add_member', { p_household: h1, p_display_name: 'Lynn', p_kind: 'child' });
  const token = await rpc('anna', 'create_invite', { p_household: h1 });
  await rpc('mira', 'accept_invite', { p_token: token, p_display_name: 'Mira' });
});

after(async () => {
  for (const { id, client } of Object.values(accounts)) {
    await client.removeAllChannels();
    await admin.auth.admin.deleteUser(id);   // fouten negeren: sommige zijn al verwijderd
  }
  sql(`delete from public.households where name like '%${run}%'`);
});

test('anon krijgt niets: geen rijen, geen functies', async () => {
  for (const t of ['households', 'household_members', 'household_invites', 'profiles']) {
    const { data, error } = await anon.from(t).select('id');
    assert.ok(error || data.length === 0, 'anon ziet rijen in ' + t);
  }
  const { error } = await anon.rpc('create_household', { p_name: 'x', p_display_name: 'x' });
  assert.ok(error, 'anon mag create_household aanroepen');
  const { error: e2 } = await anon.rpc('my_memberships');
  assert.ok(e2, 'anon mag my_memberships aanroepen');
});

test('buitenstaander ziet geen huishouden, leden of uitnodigingen van een ander', async () => {
  const c = accounts.eve.client;
  for (const t of ['households', 'household_members', 'household_invites']) {
    const { data, error } = await c.from(t).select('id');
    assert.ifError(error);
    assert.equal(data.length, 0, 'Eve ziet rijen in ' + t);
  }
  const { data } = await c.from('household_members').select('id').eq('household_id', h1);
  assert.equal(data.length, 0);
  assert.deepEqual(await rpc('eve', 'my_memberships'), []);
});

test('account-ID\'s en tokenhash zijn niet leesbaar via de API', async () => {
  const c = accounts.mira.client;
  for (const sel of ['user_id', '*', 'id,user_id']) {
    const { error } = await c.from('household_members').select(sel);
    assert.ok(error, 'household_members.select(' + sel + ') lukt');
  }
  const { error: ef } = await c.from('household_members').select('id').eq('user_id', accounts.anna.id);
  assert.ok(ef, 'filteren op user_id lukt');
  for (const sel of ['token_hash', 'created_by', 'accepted_by', '*']) {
    const { error } = await accounts.anna.client.from('household_invites').select(sel);
    assert.ok(error, 'household_invites.select(' + sel + ') lukt');
  }
  // households.created_by (account-ID van de maker) is ook niet leesbaar of filterbaar (herstel P2).
  for (const sel of ['created_by', '*', 'id,created_by']) {
    const { error } = await c.from('households').select(sel);
    assert.ok(error, 'households.select(' + sel + ') lukt');
  }
  const { error: eh } = await c.from('households').select('id').eq('created_by', accounts.anna.id);
  assert.ok(eh, 'filteren op households.created_by lukt');
  const { data: hh, error: eh2 } = await c.from('households').select('id,name,created_at,updated_at');
  assert.ifError(eh2);
  assert.equal(hh.length, 1);
  const { data, error } = await c.from('household_members').select('id,display_name,has_account,role').eq('household_id', h1).order('display_name');
  assert.ifError(error);
  assert.deepEqual(data.map(m => [m.display_name, m.has_account]), [['Anna', true], ['Lynn', false], ['Mira', true]]);
  const mijn = await rpc('mira', 'my_memberships');
  assert.equal(mijn.length, 1);
  assert.equal(mijn[0].household_id, h1);
  assert.equal(mijn[0].role, 'member');
});

test('schema private is niet bereikbaar via de API', async () => {
  const { error } = await accounts.mira.client.schema('private').rpc('my_household_ids');
  assert.ok(error, 'private.my_household_ids via de API');
  const { error: e2 } = await accounts.mira.client.schema('private').rpc('is_active_member', { p_household: h1 });
  assert.ok(e2, 'private.is_active_member via de API');
});

// Wacht tot een kanaal een eindstatus heeft (SUBSCRIBED, CHANNEL_ERROR, TIMED_OUT of CLOSED).
// Na hooguit 10 s geeft het op met status 'GEEN_ANTWOORD'.
function abonneer(kanaal) {
  return new Promise(resolve => {
    const t = setTimeout(() => resolve({ status: 'GEEN_ANTWOORD' }), 10000);
    kanaal.subscribe((status, err) => { clearTimeout(t); resolve({ status, err }); });
  });
}

// Realtime is na een (her)start pas na ±30 s klaar; wacht tot een gewoon broadcast-kanaal lukt.
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

// Een kanaal telt alleen mee als het aantoonbaar live is: status SUBSCRIBED én een eigen
// broadcast-bericht komt via de server terug (echo). Een time-out of foutstatus is nooit 'geslaagd'.
async function bewijsLive(kanaal, ontvangen) {
  const id = randomUUID();
  const r = await kanaal.send({ type: 'broadcast', event: 'kg-echo', payload: { id } });
  assert.equal(r, 'ok', 'echo niet verstuurd: ' + r);
  for (let i = 0; i < 40 && !ontvangen.includes(id); i++) await wacht(100);
  assert.ok(ontvangen.includes(id), 'kanaal is niet live (geen echo binnen 4 s)');
}

test('realtime postgres_changes: wijzigingen lekken niet uit (met tegenproef)', { timeout: 300000 }, async () => {
  await wachtOpRealtime(accounts.mira.client);
  await wachtOpRealtime(accounts.eve.client);
  const gebeurtenissen = [];
  // Abonneert op alle wijzigingen in public plus een echo; het abonnement moet actief zijn.
  const luister = async (naam) => {
    const echo = [];
    const k = accounts[naam].client.channel('kg-pg-' + naam + '-' + randomUUID(), { config: { broadcast: { self: true, ack: true } } })
      .on('postgres_changes', { event: '*', schema: 'public' }, p => gebeurtenissen.push({ naam, tabel: p.table, rij: p.new }))
      .on('broadcast', { event: 'kg-echo' }, m => echo.push(m.payload.id));
    const r = await abonneer(k);
    assert.equal(r.status, 'SUBSCRIBED', `${naam}: postgres_changes-abonnement niet actief (${r.status} ${r.err?.message || ''}); een afwezig bericht bewijst dan niets`);
    return { k, echo };
  };
  let teller = 0;
  const wijzig = async () => {
    const { error } = await accounts.anna.client.from('household_members')
      .update({ display_name: 'Lynn ' + (++teller) }).eq('household_id', h1).like('display_name', 'Lynn%');
    assert.ifError(error);
  };

  // 1. Zoals het is: geen tabel in een publicatie. Mira (lid) en Eve (buitenstaander) krijgen niets,
  //    terwijl hun abonnementen aantoonbaar live zijn (echo vóór en ná het meetvenster).
  assert.equal(sql(`select count(*) from pg_publication_tables where schemaname = 'public'`), '0');
  const kanalen = [await luister('mira'), await luister('eve')];
  for (const { k, echo } of kanalen) await bewijsLive(k, echo);
  await wijzig();
  await accounts.anna.client.rpc('create_invite', { p_household: h1 });
  await wacht(5000);
  for (const { k, echo } of kanalen) await bewijsLive(k, echo);
  assert.deepEqual(gebeurtenissen, [], 'postgres_changes leverde gebeurtenissen');
  for (const { k } of kanalen) await k.unsubscribe();

  // 2. Tegenproef: zet de tabel tijdelijk in de publicatie; dan MOET Mira iets ontvangen, anders
  //    bewijst stap 1 niets. Realtime merkt de nieuwe publicatie pas na enkele seconden op en een
  //    abonnement van daarvóór krijgt niets, dus: opnieuw abonneren en wijzigen tot er iets binnenkomt
  //    (hooguit ±3 min; op een verse stack duurt het soms meer dan een minuut). Daarna weer eruit.
  sql('alter publication supabase_realtime add table public.household_members');
  try {
    // Eve abonneert telkens mee; in de ronde waarin Mira iets ontvangt, moeten beide live zijn.
    let raak = false;
    for (let i = 0; i < 45 && !raak; i++) {
      const mira = await luister('mira');
      const eve = await luister('eve');
      await wacht(500); await wijzig(); await wacht(3000);
      raak = gebeurtenissen.some(g => g.naam === 'mira');
      if (raak) { await bewijsLive(mira.k, mira.echo); await bewijsLive(eve.k, eve.echo); }
      await accounts.mira.client.removeChannel(mira.k);
      await accounts.eve.client.removeChannel(eve.k);
    }
    const vanMira = gebeurtenissen.filter(g => g.naam === 'mira' && g.tabel === 'household_members');
    assert.ok(vanMira.length > 0, 'tegenproef: zelfs met de tabel in de publicatie kwam er niets binnen; de test meet niets');
    // Ook dan: geen account-ID's in de berichten (realtime volgt de kolomrechten) en niets voor Eve.
    vanMira.forEach(g => assert.ok(!('user_id' in g.rij), 'user_id in realtime-bericht'));
    assert.ok(vanMira.every(g => 'has_account' in g.rij));
    assert.equal(gebeurtenissen.filter(g => g.naam === 'eve').length, 0, 'Eve ontving gebeurtenissen van H1');
  } finally {
    sql('alter publication supabase_realtime drop table public.household_members');
  }
  assert.equal(sql(`select count(*) from pg_publication_tables where schemaname = 'public'`), '0');
});

test('realtime private kanalen: dicht voor buitenstaander én lid (met tegenproef)', { timeout: 120000 }, async () => {
  for (const naam of ['eve', 'mira']) await wachtOpRealtime(accounts[naam].client);
  // Een weigering telt alleen als de server expliciet 'geen toegang' antwoordt; een time-out of een
  // andere fout is geen bewijs.
  for (const naam of ['eve', 'mira']) {
    const c = accounts[naam].client;
    await c.realtime.setAuth();
    const k = c.channel('household:' + h1, { config: { private: true } });
    const r = await abonneer(k);
    await c.removeChannel(k);
    assert.equal(r.status, 'CHANNEL_ERROR', `${naam}: verwacht een expliciete weigering, kreeg ${r.status}`);
    assert.match(String(r.err?.message || r.err), /Unauthorized|permission/i, `${naam}: weigering zonder autorisatiereden: ${r.err?.message || r.err}`);
  }
  // Tegenproef: met een tijdelijk toegangsbeleid voor één testkanaal gaat een privékanaal wél open
  // en is het live. Zo is aangetoond dat de weigering hierboven door het ontbrekende beleid komt.
  const topic = 'kg-controle-' + run;
  sql(`create policy kg_controle_${run} on realtime.messages for select to authenticated using ((select realtime.topic()) = '${topic}')`);
  try {
    const c = accounts.mira.client;
    const echo = [];
    const k = c.channel(topic, { config: { private: true, broadcast: { self: true, ack: true } } })
      .on('broadcast', { event: 'kg-echo' }, m => echo.push(m.payload.id));
    const r = await abonneer(k);
    assert.equal(r.status, 'SUBSCRIBED', `tegenproef: privékanaal met beleid niet open (${r.status} ${r.err?.message || ''})`);
    await c.removeChannel(k);
  } finally {
    sql(`drop policy kg_controle_${run} on realtime.messages`);
  }
});

// ============================== KG-5C: inhoud via de API ==============================
const nieuweAfspraak = (naam, args) => accounts[naam].client.rpc('save_event', {
  p_household: h1, p_id: args.id, p_version: args.versie ?? null, p_start_date: args.dag ?? '2026-10-13',
  p_start_time: '10:00', p_end_date: null, p_end_time: '11:00', p_visibility: args.zicht ?? 'household',
  p_title: args.titel, p_location: args.plek ?? null, p_notes: args.notitie ?? null, p_preparation: null,
  p_participants: args.wie ?? null, p_recurrence_freq: null, p_recurrence_until: null });

test('KG-5C privé-afspraak via de API: een ander lid ziet alleen "Bezet", de buitenstaander niets', async () => {
  const prive = randomUUID(), gedeeld = randomUUID();
  let r = await nieuweAfspraak('anna', { id: prive, zicht: 'private', titel: 'API-geheim', plek: 'Plek-geheim', notitie: 'Notitie-geheim' });
  assert.ifError(r.error);
  r = await nieuweAfspraak('anna', { id: gedeeld, titel: 'Gedeeld etentje' });
  assert.ifError(r.error);
  const m = accounts.mira.client;
  const { data: rij, error } = await m.from('event_overview').select('id,is_busy,title,location,notes,preparation,start_date,start_time,owner_member_id').eq('id', prive).single();
  assert.ifError(error);
  assert.equal(rij.is_busy, true);
  assert.deepEqual([rij.title, rij.location, rij.notes, rij.preparation], [null, null, null, null]);
  assert.equal(rij.start_date, '2026-10-13');
  assert.equal(rij.start_time, '10:00:00');
  // Geen enkele leesweg geeft de privé-tekst: details, filters, zoeken in de view.
  const { data: det } = await m.from('event_details').select('event_id,title');
  assert.ok(det.every(d => d.event_id !== prive));
  assert.ok(det.some(d => d.event_id === gedeeld), 'gedeelde details zouden zichtbaar moeten zijn');
  for (const q of [m.from('event_details').select('event_id').ilike('title', '%geheim%'),
                   m.from('event_overview').select('id').or('title.ilike.*geheim*,location.ilike.*geheim*,notes.ilike.*geheim*'),
                   m.from('event_details').select('event_id').eq('event_id', prive)]) {
    const { data, error: e } = await q;
    assert.ifError(e);
    assert.deepEqual(data, []);
  }
  // Wijzigen of verwijderen: "niet gevonden", zoals bij een onbekend id.
  const w = await nieuweAfspraak('mira', { id: prive, versie: 1, zicht: 'private', titel: 'Overschreven' });
  assert.equal(w.error?.code, 'P0002');
  const v = await m.rpc('delete_event', { p_id: prive, p_version: 1 });
  assert.equal(v.error?.code, 'P0002');
  // Een verouderde versie geeft HTTP 409.
  assert.ifError((await nieuweAfspraak('mira', { id: gedeeld, versie: 1, titel: 'Etentje (verzet)' })).error);
  const oud = await nieuweAfspraak('anna', { id: gedeeld, versie: 1, titel: 'Etentje (oud)' });
  assert.equal(oud.error?.code, 'PT409');
  assert.equal(oud.status, 409);
  // Buitenstaander en anon: niets.
  for (const t of ['events', 'event_details', 'event_overview', 'tasks', 'shopping_items']) {
    const { data, error: e } = await accounts.eve.client.from(t).select('id:household_id');
    assert.ifError(e);
    assert.equal(data.length, 0, 'Eve ziet ' + t);
    const a = await anon.from(t).select('household_id');
    assert.ok(a.error || a.data.length === 0, 'anon ziet ' + t);
  }
  const { error: ea } = await anon.rpc('save_event', { p_household: h1, p_id: randomUUID(), p_version: null, p_start_date: '2026-10-13',
    p_start_time: null, p_end_date: null, p_end_time: null, p_visibility: 'household', p_title: 'anon', p_location: null, p_notes: null,
    p_preparation: null, p_participants: null, p_recurrence_freq: null, p_recurrence_until: null });
  assert.ok(ea, 'anon mag save_event aanroepen');
});

test('KG-5C realtime: zelfs met event_details in een publicatie krijgt een ander lid geen privédetails (met tegenproef)', { timeout: 300000 }, async () => {
  await wachtOpRealtime(accounts.anna.client);
  await wachtOpRealtime(accounts.mira.client);
  const ontvangen = [];
  const luister = async (naam) => {
    const echo = [];
    const k = accounts[naam].client.channel('kg-det-' + naam + '-' + randomUUID(), { config: { broadcast: { self: true, ack: true } } })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'event_details' }, p => ontvangen.push({ naam, rij: p.new }))
      .on('broadcast', { event: 'kg-echo' }, m => echo.push(m.payload.id));
    const r = await abonneer(k);
    assert.equal(r.status, 'SUBSCRIBED', `${naam}: abonnement niet actief (${r.status})`);
    return { k, echo };
  };
  sql('alter publication supabase_realtime add table public.event_details');
  try {
    let controle = false;
    const geheimen = [];
    for (let i = 0; i < 45 && !controle; i++) {
      const anna = await luister('anna'), mira = await luister('mira');
      await wacht(500);
      const tekst = 'RT-geheim-' + i;
      geheimen.push(tekst);
      assert.ifError((await nieuweAfspraak('anna', { id: randomUUID(), zicht: 'private', titel: tekst, notitie: tekst })).error);
      assert.ifError((await nieuweAfspraak('anna', { id: randomUUID(), titel: 'RT-gedeeld-' + i })).error);
      await wacht(3000);
      // Tegenproef: Mira ontvangt de gedeelde details wél; dan is haar abonnement echt actief.
      controle = ontvangen.some(o => o.naam === 'mira' && o.rij?.title?.startsWith('RT-gedeeld-'));
      if (controle) { await bewijsLive(anna.k, anna.echo); await bewijsLive(mira.k, mira.echo); }
      await accounts.anna.client.removeChannel(anna.k);
      await accounts.mira.client.removeChannel(mira.k);
    }
    assert.ok(controle, 'tegenproef: Mira ontving ook de gedeelde details niet; de test meet niets');
    assert.ok(ontvangen.some(o => o.naam === 'anna' && geheimen.includes(o.rij?.title)), 'eigenaar ontving haar eigen privédetails niet');
    const lek = ontvangen.filter(o => o.naam === 'mira' && JSON.stringify(o.rij).includes('geheim'));
    assert.deepEqual(lek, [], 'privédetails bij een ander lid via realtime');
  } finally {
    sql('alter publication supabase_realtime drop table public.event_details');
  }
  assert.equal(sql(`select count(*) from pg_publication_tables where schemaname = 'public'`), '0');
});

test('KG-5C herstel 2: foutrespons van de API bevat geen account-ID\'s (DETAIL/HINT weg)', async () => {
  // Mira (lid) wijzigt een gedeelde afspraak van Anna met een einddatum vóór de start. Zonder herstel
  // stond in "details" de hele rij, met het account-ID van Anna (owner_user_id).
  const e = randomUUID(), s = randomUUID();
  assert.ifError((await nieuweAfspraak('anna', { id: e, titel: 'Gedeeld (fouttest)', dag: '2026-11-07' })).error);
  assert.ifError((await accounts.anna.client.rpc('save_event', { p_household: h1, p_id: s, p_version: null, p_start_date: '2026-11-07',
    p_start_time: null, p_end_date: null, p_end_time: null, p_visibility: 'household', p_title: 'Reeks (fouttest)', p_location: null,
    p_notes: null, p_preparation: null, p_participants: null, p_recurrence_freq: 'weekly', p_recurrence_until: null })).error);
  const accountIds = sql('select string_agg(id::text, \',\') from auth.users').split(',');
  const m = accounts.mira.client;
  const pogingen = {
    'save_event eind vóór start': m.rpc('save_event', { p_household: h1, p_id: e, p_version: 1, p_start_date: '2026-11-07', p_start_time: null,
      p_end_date: '2026-11-01', p_end_time: null, p_visibility: 'household', p_title: 'X', p_location: null, p_notes: null, p_preparation: null,
      p_participants: null, p_recurrence_freq: null, p_recurrence_until: null }),
    'save_event herhaling eindigt vóór start': m.rpc('save_event', { p_household: h1, p_id: e, p_version: 1, p_start_date: '2026-11-07',
      p_start_time: null, p_end_date: null, p_end_time: null, p_visibility: 'household', p_title: 'X', p_location: null, p_notes: null,
      p_preparation: null, p_participants: null, p_recurrence_freq: 'weekly', p_recurrence_until: '2026-10-01' }),
    'edit_occurrence eind vóór start': m.rpc('edit_occurrence', { p_series: s, p_original_date: '2026-11-14', p_id: randomUUID(),
      p_start_date: '2026-11-15', p_start_time: null, p_end_date: '2026-11-01', p_end_time: null, p_title: 'X', p_location: null,
      p_notes: null, p_preparation: null, p_participants: null }),
    'huishoudnaam te lang (API)': accounts.anna.client.from('households').update({ name: 'x'.repeat(90) }).eq('id', h1),
  };
  for (const [naam, p] of Object.entries(pogingen)) {
    const r = await p;
    assert.ok(r.error, naam + ': opzet: geen fout');
    assert.equal(r.error.code, '23514', naam + ': foutcode');
    assert.ok(!r.error.details && !r.error.hint, `${naam}: details/hint in de foutrespons: ${r.error.details}`);
    const tekst = JSON.stringify(r.error);
    for (const id of accountIds) assert.ok(!tekst.includes(id), `${naam}: account-ID in de foutrespons`);
  }
});

test('account verwijderen via Auth (AVG): lid lukt, enige eigenaar met anderen geweigerd, anders gaat het huishouden mee', async () => {
  // Tweede huishouden: Ouder (eigenaar) + Helper (beheerder) + een kind.
  await account('ouder'); await account('helper');
  const h2 = await rpc('ouder', 'create_household', { p_name: 'Samen ' + run, p_display_name: 'Ouder' });
  await rpc('ouder', 'add_member', { p_household: h2, p_display_name: 'Kind', p_kind: 'child' });
  const tok = await rpc('ouder', 'create_invite', { p_household: h2, p_member: null, p_role: 'admin' });
  await rpc('helper', 'accept_invite', { p_token: tok, p_display_name: 'Helper' });

  // Gewoon lid (Mira): lukt; het lid blijft in H1 zonder account.
  let { error } = await admin.auth.admin.deleteUser(accounts.mira.id);
  assert.ifError(error);
  const { data } = await accounts.anna.client.from('household_members').select('display_name,has_account,role').eq('household_id', h1).eq('display_name', 'Mira');
  assert.deepEqual(data, [{ display_name: 'Mira', has_account: false, role: 'member' }]);
  delete accounts.mira;

  // Enige eigenaar terwijl Helper nog een account heeft: geweigerd, alles blijft.
  ({ error } = await admin.auth.admin.deleteUser(accounts.ouder.id));
  assert.ok(error, 'enige eigenaar met andere accounts kon worden verwijderd');
  assert.equal(sql(`select count(*) from auth.users where id = '${accounts.ouder.id}'`), '1');
  assert.equal(sql(`select count(*) from public.household_members where household_id = '${h2}'`), '3');

  // Beheerder: lukt. Daarna de eigenaar: lukt, en het huishouden gaat mee (niemand anders heeft toegang).
  ({ error } = await admin.auth.admin.deleteUser(accounts.helper.id)); assert.ifError(error); delete accounts.helper;
  ({ error } = await admin.auth.admin.deleteUser(accounts.ouder.id)); assert.ifError(error); delete accounts.ouder;
  assert.equal(sql(`select count(*) from public.households where id = '${h2}'`), '0');
  assert.equal(sql(`select count(*) from public.household_members where household_id = '${h2}'`), '0');
  assert.equal(sql(`select count(*) from public.household_invites where household_id = '${h2}'`), '0');

  // Anna: H1 heeft geen andere accounts meer: H1 gaat mee.
  ({ error } = await admin.auth.admin.deleteUser(accounts.anna.id)); assert.ifError(error); delete accounts.anna;
  assert.equal(sql(`select count(*) from public.households where id = '${h1}'`), '0');
  assert.equal(sql(`select count(*) from public.household_members where household_id = '${h1}'`), '0');
});
