// Thuisplanner KG-5H deel 1b: uitnodigingen op e-mailadres tegen een echte (lokale) Supabase Auth. Zie
// docs/thuisplanner-uitnodiging-email.md. De RLS-matrix (KG-T57 tot en met T64) bootst accounts na in auth.users; hier
// komen ze uit Auth zelf, met echte sessies en tokens:
// - met een onbevestigd adres weigert Auth het inloggen al (eerste linie);
// - heeft een sessie toch een onbevestigd adres (tweede linie, hier nagebootst door de bevestiging in de lokale
//   database terug te zetten), dan ziet het account niets en kan het niet accepteren; na het bevestigen wel, met
//   dezelfde sessie (de database leest auth.users, niet het token);
// - een adreswijziging die nog niet bevestigd is, telt niet;
// - fouten komen als stabiele code over HTTP, zonder adres, DETAIL of HINT.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, test } from 'node:test';
import { createClient } from '@supabase/supabase-js';
import pg from 'pg';

const { API_URL, ANON_KEY, SERVICE_ROLE_KEY, DB_URL } = process.env;
if (!API_URL || !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(API_URL)) throw new Error('Weigering: alleen een lokale Supabase');
if (!DB_URL || !/@(127\.0\.0\.1|localhost):\d+\//.test(DB_URL)) throw new Error('Weigering: alleen een lokale database');

const geen = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(API_URL, SERVICE_ROLE_KEY, geen);
const run = randomUUID().slice(0, 8);
const wachtwoord = `uitnodiging-${randomUUID()}`;
const accounts = [];
const huishoudens = [];

after(async () => {
  for (const h of huishoudens) await admin.from('households').delete().eq('id', h);
  for (const id of accounts) await admin.auth.admin.deleteUser(id);
});

async function account(naam) {
  const email = `${naam}-${run}@test.invalid`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: wachtwoord, email_confirm: true });
  assert.ifError(error);
  accounts.push(data.user.id);
  const c = createClient(API_URL, ANON_KEY, geen);
  assert.ifError((await c.auth.signInWithPassword({ email, password: wachtwoord })).error);
  return { c, id: data.user.id, email };
}
const rpc = async (a, naam, args) => { const r = await a.c.rpc(naam, args); assert.ifError(r.error); return r.data; };

test('onbevestigd adres: niets zichtbaar en accepteren geweigerd; na bevestigen met dezelfde sessie wel', { timeout: 60000 }, async () => {
  const ida = await account('ida');
  const h = await rpc(ida, 'create_household', { p_name: `Van Dijk ${run}`, p_display_name: 'Ida' });
  huishoudens.push(h);
  // Eerste linie: Auth laat een onbevestigd adres niet inloggen.
  const ongezien = `ongezien-${run}@test.invalid`;
  const o = await admin.auth.admin.createUser({ email: ongezien, password: wachtwoord, email_confirm: false });
  assert.ifError(o.error);
  accounts.push(o.data.user.id);
  const poging = await createClient(API_URL, ANON_KEY, geen).auth.signInWithPassword({ email: ongezien, password: wachtwoord });
  assert.ok(poging.error && !poging.data.session, 'Auth laat een onbevestigd adres inloggen');

  // Tweede linie: een sessie waarvan het adres (nog of weer) niet bevestigd is.
  const kim = await account('kim');
  const db = new pg.Client({ connectionString: DB_URL });
  await db.connect();
  try { await db.query('update auth.users set email_confirmed_at = null where id = $1', [kim.id]); } finally { await db.end(); }
  const token = await rpc(ida, 'create_invite', { p_household: h, p_email: kim.email.toUpperCase() });

  // Het token van Kim bevat haar adres; de database vertrouwt daar niet op zolang het niet bevestigd is.
  const claims = JSON.parse(Buffer.from((await kim.c.auth.getSession()).data.session.access_token.split('.')[1], 'base64url'));
  assert.equal(claims.email, kim.email);
  assert.deepEqual(await rpc(kim, 'my_invites', {}), []);
  const geweigerd = await kim.c.rpc('accept_invite', { p_token: token, p_display_name: 'Kim' });
  assert.equal(geweigerd.error?.code, 'TPU06');
  assert.doesNotMatch(geweigerd.error.message, /@|kim/i);
  assert.ok(!geweigerd.error.details && !geweigerd.error.hint, 'weigering met DETAIL of HINT');

  // Bevestigd (zoals na het invoeren van een e-mailcode): zelfde sessie, zelfde token, nu wel.
  assert.ifError((await admin.auth.admin.updateUserById(kim.id, { email_confirm: true })).error);
  const lijst = await rpc(kim, 'my_invites', {});
  assert.equal(lijst.length, 1);
  assert.deepEqual(Object.keys(lijst[0]).sort(), ['expires_at', 'household_name', 'id', 'invited_by', 'member_name', 'role']);
  assert.equal(lijst[0].household_name, `Van Dijk ${run}`);
  assert.equal(lijst[0].invited_by, 'Ida');
  assert.doesNotMatch(JSON.stringify(lijst), /@/);
  assert.equal(await rpc(kim, 'accept_invite_by_id', { p_invite: lijst[0].id, p_display_name: 'Kim' }), h);
  assert.deepEqual(await rpc(kim, 'my_invites', {}), []);

  // Het adres is weg; de eigenaar ziet een gebruikte uitnodiging zonder adres.
  const { data: inv } = await ida.c.from('household_invites').select('accepted_at, invited_email');
  assert.equal(inv.length, 1);
  assert.ok(inv[0].accepted_at);
  assert.equal(inv[0].invited_email, null);
});

test('een adreswijziging telt pas na bevestigen; een ander account kan de link niet gebruiken', { timeout: 60000 }, async () => {
  const olaf = await account('olaf');
  const h = await rpc(olaf, 'create_household', { p_name: `Smit ${run}`, p_display_name: 'Olaf' });
  huishoudens.push(h);
  const lex = await account('lex');
  const nieuw = `lex-nieuw-${run}@test.invalid`;
  const token = await rpc(olaf, 'create_invite', { p_household: h, p_email: nieuw });

  // Lex vraagt een adreswijziging naar het uitgenodigde adres aan, maar bevestigt die niet.
  assert.ifError((await lex.c.auth.updateUser({ email: nieuw })).error);
  const { data: u } = await admin.auth.admin.getUserById(lex.id);
  assert.equal(u.user.email, lex.email, 'de wijziging is al doorgevoerd zonder bevestiging');
  assert.deepEqual(await rpc(lex, 'my_invites', {}), []);
  assert.equal((await lex.c.rpc('accept_invite', { p_token: token, p_display_name: 'Lex' })).error?.code, 'TPU06');

  // Zoë (bevestigd, ander adres) met de doorgestuurde link en met het id: geweigerd; weigeren mag ze ook niet.
  const zoe = await account('zoe');
  assert.equal((await zoe.c.rpc('accept_invite', { p_token: token, p_display_name: 'Zoë' })).error?.code, 'TPU06');
  const { data: open } = await olaf.c.from('household_invites').select('id, invited_email');
  assert.deepEqual(open.map(i => i.invited_email), [nieuw]);
  assert.equal((await zoe.c.rpc('accept_invite_by_id', { p_invite: open[0].id, p_display_name: 'Zoë' })).error?.code, 'TPU06');
  assert.equal((await zoe.c.rpc('decline_invite', { p_invite: open[0].id })).error?.code, 'TPU01');
  // Zoë ziet geen uitnodigingen van Smit via de tabel.
  assert.deepEqual((await zoe.c.from('household_invites').select('id')).data, []);
  // Een niet-ingelogde client kan niets.
  const anon = createClient(API_URL, ANON_KEY, geen);
  assert.ok((await anon.rpc('my_invites', {})).error);
  assert.ok((await anon.rpc('decline_invite', { p_invite: open[0].id })).error);
});
