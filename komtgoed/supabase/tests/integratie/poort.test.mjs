// Thuisplanner KG-5H deel 2: de toegangspoort tegen een echte (lokale) Supabase Auth, met echte tokens. Zie
// docs/thuisplanner-deel2-bouwscope.md §1. De wachtwoordmodus van de lokale ontwikkelstack (seed.sql) staat tijdens
// deze test UIT, zoals op staging, bèta en productie; na afloop wordt de vorige stand teruggezet.
// - Een wachtwoordsessie (ook na vooraf kapen of met een achterdeurwachtwoord) krijgt via REST, RPC en Realtime niets.
// - Een code-sessie (zoals K1 die laat uitgeven: verifyOtp met een token_hash) krijgt alles.
// - "Uitloggen op alle toestellen" werkt direct, ook voor een nog geldig toegangstoken.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';
import { createClient } from '@supabase/supabase-js';
import pg from 'pg';

const { API_URL, ANON_KEY, SERVICE_ROLE_KEY, DB_URL } = process.env;
if (!API_URL || !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(API_URL)) throw new Error('Weigering: alleen een lokale Supabase');
if (!DB_URL || !/@(127\.0\.0\.1|localhost):\d+\//.test(DB_URL)) throw new Error('Weigering: alleen een lokale database');

const geen = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(API_URL, SERVICE_ROLE_KEY, geen);
const db = new pg.Client({ connectionString: DB_URL });
const run = randomUUID().slice(0, 8);
const accounts = [];
const huishoudens = [];
let vorige;

before(async () => {
  await db.connect();
  vorige = (await db.query('select wachtwoordsessies_toegestaan from private.instellingen')).rows[0].wachtwoordsessies_toegestaan;
  await db.query('update private.instellingen set wachtwoordsessies_toegestaan = false, huishouden_open = true');
});
after(async () => {
  for (const h of huishoudens) await db.query('delete from public.households where id = $1', [h]);
  for (const id of accounts) await admin.auth.admin.deleteUser(id);
  await db.query('update private.instellingen set wachtwoordsessies_toegestaan = $1', [vorige]);
  await db.end();
});

const met = token => createClient(API_URL, ANON_KEY, { ...geen, global: { headers: { Authorization: `Bearer ${token}` } } });
const amr = s => JSON.parse(Buffer.from(s.access_token.split('.')[1], 'base64url')).amr?.map(a => a.method);
// Een code-sessie zoals K1 die laat uitgeven: een token_hash, door de app aan verifyOtp gegeven.
async function codeSessie(email) {
  const g = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  assert.ifError(g.error);
  const c = createClient(API_URL, ANON_KEY, geen);
  const v = await c.auth.verifyOtp({ token_hash: g.data.properties.hashed_token, type: 'email' });
  assert.ifError(v.error);
  return { c, s: v.data.session };
}
async function telling(token) {
  const c = met(token);
  const n = {};
  // Tellen op een kolom die authenticated mag lezen (select * mag niet op tabellen met kolomrechten).
  for (const [t, k] of [['households', 'id'], ['household_members', 'id'], ['household_invites', 'id'], ['events', 'id'], ['event_details', 'event_id'],
    ['tasks', 'id'], ['shopping_items', 'id'], ['profiles', 'user_id']]) {
    const r = await c.from(t).select(k, { count: 'exact', head: true });
    n[t] = r.error ? `fout ${r.error.code}` : r.count;
  }
  n.my_memberships = ((await c.rpc('my_memberships')).data ?? []).length;
  n.mijn_toegang = (await c.rpc('mijn_toegang')).data;
  return n;
}
const leeg = n => Object.entries(n).every(([k, v]) => k === 'mijn_toegang' || v === 0);

test('vooraf kapen en een achterdeurwachtwoord: de wachtwoordsessie krijgt via REST en RPC niets; de code-sessie alles', { timeout: 60000 }, async () => {
  const email = `poort-${run}@test.invalid`;
  // De aanvaller zet vooraf een wachtwoord op het adres van het slachtoffer.
  const a = await createClient(API_URL, ANON_KEY, geen).auth.signUp({ email, password: 'Aanvaller-wachtwoord-1!' });
  assert.ifError(a.error);
  accounts.push(a.data.user.id);
  // Het slachtoffer logt in met een code en maakt een huishouden met inhoud.
  const { c: slachtoffer, s } = await codeSessie(email);
  assert.deepEqual(amr(s), ['otp']);
  const h = await slachtoffer.rpc('create_household', { p_name: `Poort ${run}`, p_display_name: 'Slachtoffer' });
  assert.ifError(h.error);
  huishoudens.push(h.data);
  assert.ifError((await slachtoffer.rpc('add_shopping_items', { p_household: h.data, p_ids: [randomUUID()], p_names: ['Poort-geheim'] })).error);
  assert.ifError((await slachtoffer.from('profiles').insert({ user_id: s.user.id, display_name: 'Slachtoffer' })).error);
  const goed = await telling(s.access_token);
  assert.equal(goed.mijn_toegang, 'ok');
  assert.ok(goed.households === 1 && goed.shopping_items === 1 && goed.profiles === 1, JSON.stringify(goed));

  // De aanvaller logt in met zijn wachtwoord: Supabase geeft een sessie, de database niets.
  const w = await createClient(API_URL, ANON_KEY, geen).auth.signInWithPassword({ email, password: 'Aanvaller-wachtwoord-1!' });
  assert.ifError(w.error);
  assert.deepEqual(amr(w.data.session), ['password']);
  const kwaad = await telling(w.data.session.access_token);
  assert.equal(kwaad.mijn_toegang, 'code-nodig');
  assert.ok(leeg(kwaad), 'wachtwoordsessie ziet iets: ' + JSON.stringify(kwaad));
  const k = met(w.data.session.access_token);
  for (const [naam, args] of [['create_household', { p_name: 'Kaap', p_display_name: 'Kaap' }], ['create_invite', { p_household: h.data }],
    ['add_member', { p_household: h.data, p_display_name: 'Kaap' }], ['household_channel', { p_household: h.data }],
    ['add_shopping_items', { p_household: h.data, p_ids: [randomUUID()], p_names: ['Kaap'] }]]) {
    const r = await k.rpc(naam, args);
    assert.equal(r.error?.code, 'TPA01', `${naam} met een wachtwoordsessie: ${JSON.stringify(r.error ?? r.data)}`);
  }
  const u = await k.from('households').update({ name: 'Gekaapt' }).eq('id', h.data).select();
  assert.deepEqual(u.data ?? [], []);
  // Ook na vernieuwen blijft het een wachtwoordsessie.
  const v = await createClient(API_URL, ANON_KEY, geen).auth.refreshSession({ refresh_token: w.data.session.refresh_token });
  assert.ok(leeg(await telling(v.data.session.access_token)));

  // Achterdeur: met de sessie van het slachtoffer een wachtwoord toevoegen, overal uitloggen, met dat wachtwoord in.
  await slachtoffer.auth.updateUser({ password: 'Achterdeur-wachtwoord-1!' });
  const d = await createClient(API_URL, ANON_KEY, geen).auth.signInWithPassword({ email, password: 'Achterdeur-wachtwoord-1!' });
  assert.ifError(d.error);
  assert.ok(leeg(await telling(d.data.session.access_token)), 'achterdeurwachtwoord geeft toegang');
});

test('Realtime: een wachtwoordsessie komt niet op het kanaal van het huishouden; een code-sessie wel', { timeout: 60000 }, async () => {
  const email = `poort-rt-${run}@test.invalid`;
  // Eerst het account met een wachtwoord (een wachtwoordwijziging via de Admin-API trekt alle sessies in), dan de
  // code-sessie, dan de wachtwoordsessie: beide bestaan naast elkaar.
  const nieuw = await admin.auth.admin.createUser({ email, password: 'Rt-wachtwoord-1!', email_confirm: true });
  assert.ifError(nieuw.error);
  accounts.push(nieuw.data.user.id);
  const { c, s } = await codeSessie(email);
  const h = (await c.rpc('create_household', { p_name: `Poort RT ${run}`, p_display_name: 'RT' })).data;
  huishoudens.push(h);
  const topic = (await c.rpc('household_channel', { p_household: h })).data;
  assert.match(topic, /^household:/);
  const w = (await createClient(API_URL, ANON_KEY, geen).auth.signInWithPassword({ email, password: 'Rt-wachtwoord-1!' })).data.session;
  async function abonneer(sessie) {
    const k = createClient(API_URL, ANON_KEY, geen);
    await k.realtime.setAuth(sessie.access_token);
    const kanaal = k.channel(topic, { config: { private: true } });
    const stand = await new Promise(res => {
      const t = setTimeout(() => res('time-out'), 8000);
      kanaal.subscribe(st => { if (st !== 'CLOSED') { clearTimeout(t); res(st); } });
    });
    await k.removeAllChannels();
    k.realtime.disconnect();
    return stand;
  }
  assert.equal(await abonneer(s), 'SUBSCRIBED');
  assert.notEqual(await abonneer(w), 'SUBSCRIBED', 'een wachtwoordsessie komt op het kanaal');
});

test('uitloggen op alle toestellen: een nog geldig toegangstoken heeft direct geen toegang meer (TPA02)', { timeout: 60000 }, async () => {
  const email = `poort-uit-${run}@test.invalid`;
  const { c, s } = await codeSessie(email);
  accounts.push(s.user.id);
  const h = (await c.rpc('create_household', { p_name: `Poort uit ${run}`, p_display_name: 'Uit' })).data;
  huishoudens.push(h);
  const tweede = await codeSessie(email);
  assert.equal((await telling(tweede.s.access_token)).households, 1);
  assert.ifError((await c.auth.signOut({ scope: 'global' })).error);
  // Het toegangstoken van het tweede toestel is nog niet verlopen, maar de sessie bestaat niet meer.
  const n = await telling(tweede.s.access_token);
  assert.equal(n.mijn_toegang, 'sessie-ingetrokken');
  assert.ok(leeg(n), JSON.stringify(n));
  assert.equal((await met(tweede.s.access_token).rpc('create_invite', { p_household: h })).error?.code, 'TPA02');
  // Opnieuw inloggen met een code: weer toegang.
  assert.equal((await telling((await codeSessie(email)).s.access_token)).households, 1);
});

test('zonder token (anon) en met de service-sleutel als gebruiker: geen toegang via de poort', { timeout: 30000 }, async () => {
  const anon = createClient(API_URL, ANON_KEY, geen);
  assert.ok((await anon.rpc('mijn_toegang')).error, 'anon kan mijn_toegang aanroepen');
  assert.deepEqual((await anon.from('households').select('id')).data ?? [], []);
});
