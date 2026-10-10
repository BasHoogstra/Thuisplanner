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

test('realtime postgres_changes: wijzigingen lekken niet uit (met tegenproef)', { timeout: 300000 }, async () => {
  await wachtOpRealtime(accounts.mira.client);
  const gebeurtenissen = [];
  const luister = async (naam) => {
    const k = accounts[naam].client.channel('kg-pg-' + naam + '-' + randomUUID())
      .on('postgres_changes', { event: '*', schema: 'public' }, p => gebeurtenissen.push({ naam, tabel: p.table, rij: p.new }));
    const r = await abonneer(k);
    return { k, r };
  };
  let teller = 0;
  const wijzig = async () => {
    const { error } = await accounts.anna.client.from('household_members')
      .update({ display_name: 'Lynn ' + (++teller) }).eq('household_id', h1).like('display_name', 'Lynn%');
    assert.ifError(error);
  };

  // 1. Zoals het is: geen tabel in een publicatie. Mira (lid) en Eve (buitenstaander) krijgen niets.
  assert.equal(sql(`select count(*) from pg_publication_tables where schemaname = 'public'`), '0');
  const kanalen = [await luister('mira'), await luister('eve')];
  kanalen.forEach(({ r }) => assert.ok(['SUBSCRIBED', 'CHANNEL_ERROR'].includes(r.status), 'onverwachte status: ' + r.status));
  await wacht(1000);
  await wijzig();
  await accounts.anna.client.rpc('create_invite', { p_household: h1 });
  await wacht(5000);
  assert.deepEqual(gebeurtenissen, [], 'postgres_changes leverde gebeurtenissen');
  for (const { k } of kanalen) await k.unsubscribe();

  // 2. Tegenproef: zet de tabel tijdelijk in de publicatie; dan MOET Mira iets ontvangen, anders
  //    bewijst stap 1 niets. Realtime merkt de nieuwe publicatie pas na enkele seconden op en een
  //    abonnement van daarvóór krijgt niets, dus: opnieuw abonneren en wijzigen tot er iets binnenkomt
  //    (hooguit ±3 min; op een verse stack duurt het soms meer dan een minuut). Daarna weer eruit.
  sql('alter publication supabase_realtime add table public.household_members');
  try {
    // Eve abonneert telkens mee, zodat haar abonnement net zo 'actief' is als dat van Mira.
    for (let i = 0; i < 45 && !gebeurtenissen.some(g => g.naam === 'mira'); i++) {
      const { k, r } = await luister('mira');
      const { k: kEve } = await luister('eve');
      if (r.status === 'SUBSCRIBED') { await wacht(500); await wijzig(); await wacht(3000); }
      else await wacht(3000);
      await accounts.mira.client.removeChannel(k);
      await accounts.eve.client.removeChannel(kEve);
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

test('realtime private kanalen: dicht voor buitenstaander én lid (nog geen toegangsregels)', async () => {
  for (const naam of ['eve', 'mira']) {
    const c = accounts[naam].client;
    await c.realtime.setAuth();
    const k = c.channel('household:' + h1, { config: { private: true } });
    const r = await abonneer(k);
    assert.notEqual(r.status, 'SUBSCRIBED', naam + ' kan het private kanaal van H1 openen');
    await c.removeChannel(k);
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
