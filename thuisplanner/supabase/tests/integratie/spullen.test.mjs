// Mijn spullen & Documenten: gate 9 tegen een echte, LOKALE Supabase-stack met Storage (docs/thuisplanner-spullen-documenten.md
// §7 en §14.4). Via de echte API (PostgREST), Auth, Storage en de Edge Function bevestig-upload, wat de SQL-matrix
// (KG-T89 t/m KG-T94) niet kan: uploaden in twee fasen, ondertekende links (ook verlopen), en de negatieve
// scheidingstests: huishouden A kan nooit een bestand van huishouden B lezen, uploaden of koppelen, ook niet via een
// bekende URL, bestands-id of pad. De tegenproeven staan in spullen-tegenproeven.mjs (een te ruime policy of functie
// moet een test hier laten falen).
//
//   API_URL=... ANON_KEY=... SERVICE_ROLE_KEY=... DB_URL=... node --test spullen.test.mjs
//   Optioneel WACHTRIJ_GEHEIM (uit supabase/functions/.env van de stack) voor de opruimronde.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const { API_URL, ANON_KEY, SERVICE_ROLE_KEY, WACHTRIJ_GEHEIM } = process.env;
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
const ok = ({ data, error }) => { assert.ifError(error); return data; };
const BUCKET = 'documenten';

async function account(naam) {
  const email = `${naam}-${run}@test.invalid`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: wachtwoord, email_confirm: true });
  assert.ifError(error);
  const client = createClient(API_URL, ANON_KEY, opties);
  ok(await client.auth.signInWithPassword({ email, password: wachtwoord }));
  accounts[naam] = { id: data.user.id, client };
  return client;
}

// Verzonnen bestanden: een kleine echte PDF en een HTML-bestand dat zich als PDF voordoet.
const PDF = Buffer.from('%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n');
const NEP = Buffer.from('<!doctype html><script>alert("x")</script>');

let ha, hb, sara, tim, bo, mSara, mTim, mBo;
before(async () => {
  sara = await account('sara'); tim = await account('tim'); bo = await account('bo');
  ha = ok(await sara.rpc('create_household', { p_name: 'Spullen ' + run, p_display_name: 'Sara' }));
  hb = ok(await bo.rpc('create_household', { p_name: 'Buren ' + run, p_display_name: 'Bo' }));
  huishoudens.push(ha, hb);
  const token = ok(await sara.rpc('create_invite', { p_household: ha }));
  ok(await tim.rpc('accept_invite', { p_token: token, p_display_name: 'Tim' }));
  const lid = async (c, h) => ok(await c.rpc('my_memberships')).find(m => m.household_id === h).member_id;
  mSara = await lid(sara, ha); mTim = await lid(tim, ha); mBo = await lid(bo, hb);
});

after(async () => {
  // Eerst de bestanden (een cascade wist geen objecten), dan de rijen en de accounts.
  for (const h of huishoudens) {
    const { data: mappen } = await admin.storage.from(BUCKET).list(h);
    for (const m of mappen ?? []) await admin.storage.from(BUCKET).remove([`${h}/${m.name}/origineel`]);
  }
  if (huishoudens.length) await admin.from('households').delete().in('id', huishoudens);
  for (const { id } of Object.values(accounts)) await admin.auth.admin.deleteUser(id);
});

/** Fase 1 en 2: een rij op 'wacht' en het object. Geeft id en pad. */
async function nieuwDocument(client, h, lidId, { bytes = PDF, mime = 'application/pdf', zichtbaarheid = 'household', uploaden = true } = {}) {
  const id = randomUUID();
  ok(await client.from('documents').insert({ id, household_id: h, title: 'Factuur ' + run, kind: 'factuur', owner_member_id: lidId,
    mime, size_bytes: bytes.length, visibility: zichtbaarheid }));
  const pad = `${h}/${id}/origineel`;
  if (uploaden) ok(await client.storage.from(BUCKET).upload(pad, bytes, { contentType: mime, upsert: false }));
  return { id, pad };
}
/** Fase 3: bevestig-upload met de eigen sessie. */
async function bevestig(client, id) {
  const { data: { session } } = await client.auth.getSession();
  const r = await fetch(`${API_URL}/functions/v1/bevestig-upload`, {
    method: 'POST', headers: { apikey: ANON_KEY, Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ document_id: id }),
  });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}
const link = async (client, pad, s = 60) => client.storage.from(BUCKET).createSignedUrl(pad, s, { download: true });

test('twee fasen: pas na bevestig-upload te lezen, en dan alleen met een korte ondertekende link als bijlage', async () => {
  const d = await nieuwDocument(sara, ha, mSara);
  assert.ok((await link(sara, d.pad)).error, 'een link vóór de bevestiging');
  const r = await bevestig(sara, d.id);
  assert.equal(r.status, 200); assert.equal(r.body.status, 'klaar');
  assert.equal(ok(await sara.from('documents').select('upload_status').eq('id', d.id).single()).upload_status, 'klaar');
  const { signedUrl } = ok(await link(sara, d.pad));
  const antwoord = await fetch(signedUrl);
  assert.equal(antwoord.status, 200);
  assert.match(antwoord.headers.get('content-disposition') ?? '', /attachment/);
  assert.deepEqual(Buffer.from(await antwoord.arrayBuffer()), PDF);
  // Een ander lid van hetzelfde huishouden mag het gedeelde document ook lezen.
  assert.ifError((await link(tim, d.pad)).error);
  // Nogmaals bevestigen verandert niets.
  assert.equal((await bevestig(sara, d.id)).status, 409);
});

test('scheiding: huishouden B leest nooit een bestand van A, ook niet via een bekend pad, id of een publieke URL', async () => {
  const d = await nieuwDocument(sara, ha, mSara);
  assert.equal((await bevestig(sara, d.id)).status, 200);
  assert.ok((await link(bo, d.pad)).error, 'Bo krijgt een link voor een pad van A');
  assert.ok((await bo.storage.from(BUCKET).download(d.pad)).error, 'Bo downloadt een object van A');
  assert.equal((await bo.from('documents').select('id').eq('id', d.id)).data.length, 0, 'Bo ziet de rij van A');
  // Het id van A onder het eigen huishouden: geen object en geen rij.
  assert.ok((await link(bo, `${hb}/${d.id}/origineel`)).error);
  // Een publieke URL werkt nooit (privé-bucket).
  const publiek = bo.storage.from(BUCKET).getPublicUrl(d.pad).data.publicUrl;
  assert.notEqual((await fetch(publiek)).status, 200, 'publieke URL geeft het bestand');
  // Bevestigen door B: niet gevonden.
  assert.equal((await bevestig(bo, d.id)).status, 404);
});

test('scheiding: B uploadt nooit naar een pad van A, of naar een eigen pad met een id dat niet wacht of van A is', async () => {
  const wachtA = await nieuwDocument(sara, ha, mSara, { uploaden: false });
  assert.ok((await bo.storage.from(BUCKET).upload(wachtA.pad, PDF, { contentType: 'application/pdf' })).error, 'Bo uploadt in A');
  assert.ok((await bo.storage.from(BUCKET).upload(`${ha}/${randomUUID()}/origineel`, PDF, { contentType: 'application/pdf' })).error, 'Bo uploadt een verzonnen pad in A');
  assert.ok((await bo.storage.from(BUCKET).upload(`${hb}/${wachtA.id}/origineel`, PDF, { contentType: 'application/pdf' })).error, 'Bo uploadt met het id van A');
  // Een eigen document dat al klaar is: niet overschrijven.
  const eigen = await nieuwDocument(bo, hb, mBo);
  assert.equal((await bevestig(bo, eigen.id)).status, 200);
  assert.ok((await bo.storage.from(BUCKET).upload(eigen.pad, NEP, { contentType: 'application/pdf', upsert: true })).error, 'overschrijven van een bevestigd document');
  // Een ander pad dan het vaste pad.
  assert.ok((await bo.storage.from(BUCKET).upload(`${hb}/${eigen.id}/anders.pdf`, PDF, { contentType: 'application/pdf' })).error);
  // Een ander lid (Tim) uploadt niet in het wachtende document van Sara.
  assert.ok((await tim.storage.from(BUCKET).upload(wachtA.pad, PDF, { contentType: 'application/pdf' })).error, 'Tim uploadt voor Sara');
});

test('een verlopen link werkt niet meer (de tegenproef: dezelfde link werkt direct wel)', async () => {
  const d = await nieuwDocument(sara, ha, mSara);
  assert.equal((await bevestig(sara, d.id)).status, 200);
  const { signedUrl } = ok(await link(sara, d.pad, 1));
  assert.equal((await fetch(signedUrl)).status, 200, 'tegenproef: de verse link werkt');
  await wacht(2500);
  assert.notEqual((await fetch(signedUrl)).status, 200, 'verlopen link werkt nog');
});

test('een vermomd bestand (HTML als PDF) wordt geweigerd en gewist; een echte PDF niet (tegenproef)', async () => {
  const d = await nieuwDocument(sara, ha, mSara, { bytes: NEP });
  const r = await bevestig(sara, d.id);
  assert.equal(r.status, 422); assert.equal(r.body.status, 'mislukt');
  assert.equal(ok(await sara.from('documents').select('upload_status').eq('id', d.id).single()).upload_status, 'mislukt');
  assert.ok((await admin.storage.from(BUCKET).download(d.pad)).error, 'het vermomde object staat er nog');
  assert.ok((await link(sara, d.pad)).error);
  // Tegenproef: een echte PDF van dezelfde grootte-regels komt wel door.
  assert.equal((await bevestig(sara, (await nieuwDocument(sara, ha, mSara)).id)).status, 200);
  // De bucket zelf weigert een type dat niet mag (SVG).
  assert.ok((await sara.storage.from(BUCKET).upload(`${ha}/${randomUUID()}/origineel`, Buffer.from('<svg/>'), { contentType: 'image/svg+xml' })).error);
});

test('persoonlijk: het persoonlijke document van de partner is onzichtbaar, niet te lezen en niet te koppelen', async () => {
  const d = await nieuwDocument(sara, ha, mSara, { zichtbaarheid: 'private' });
  assert.equal((await bevestig(sara, d.id)).status, 200);
  assert.ifError((await link(sara, d.pad)).error);
  assert.ok((await link(tim, d.pad)).error, 'Tim leest het persoonlijke document van Sara');
  assert.equal((await tim.from('documents').select('id').eq('id', d.id)).data.length, 0, 'Tim ziet de rij');
  const p = randomUUID();
  ok(await tim.from('possessions').insert({ id: p, household_id: ha, name: 'Fiets Tim', owner_member_id: mTim }));
  assert.ok((await tim.from('document_links').insert({ household_id: ha, document_id: d.id, possession_id: p })).error, 'Tim koppelt het');
  // Sara koppelt het wel; Tim ziet die koppeling niet.
  ok(await sara.from('document_links').insert({ household_id: ha, document_id: d.id, possession_id: p }));
  assert.equal((await tim.from('document_links').select('id').eq('possession_id', p)).data.length, 0, 'Tim ziet de koppeling');
});

test('koppelen tussen huishoudens kan niet; binnen het huishouden zonder duplicaten', async () => {
  const d = await nieuwDocument(sara, ha, mSara);
  const pb = randomUUID();
  ok(await bo.from('possessions').insert({ id: pb, household_id: hb, name: 'Fiets Bo', owner_member_id: mBo }));
  assert.ok((await bo.from('document_links').insert({ household_id: hb, document_id: d.id, possession_id: pb })).error);
  assert.ok((await sara.from('document_links').insert({ household_id: ha, document_id: d.id, possession_id: pb })).error);
  const pa = randomUUID();
  ok(await sara.from('possessions').insert({ id: pa, household_id: ha, name: 'Vaatwasser', owner_member_id: mSara }));
  ok(await sara.from('document_links').insert({ household_id: ha, document_id: d.id, possession_id: pa }));
  assert.ok((await tim.from('document_links').insert({ household_id: ha, document_id: d.id, possession_id: pa })).error, 'dubbele koppeling');
});

test('opruimen: een wees na het verwijderen van een huishouden verdwijnt; zonder geheim gebeurt er niets', { skip: !WACHTRIJ_GEHEIM && 'WACHTRIJ_GEHEIM niet gezet' }, async () => {
  const c = await account('cas');
  const hc = ok(await c.rpc('create_household', { p_name: 'Weg ' + run, p_display_name: 'Cas' }));
  const mc = ok(await c.rpc('my_memberships')).find(m => m.household_id === hc).member_id;
  const d = await nieuwDocument(c, hc, mc);
  assert.equal((await bevestig(c, d.id)).status, 200);
  const roep = geheim => fetch(`${API_URL}/functions/v1/opruimen-documenten`, { method: 'POST', headers: { 'x-thuisplanner-wachtrij': geheim } });
  assert.equal((await roep('fout-' + randomUUID())).status, 401);
  ok(await c.rpc('delete_household', { p_household: hc }));
  assert.ifError((await admin.storage.from(BUCKET).download(d.pad)).error, 'het object hoort er nog te zijn (een cascade wist geen bestanden)');
  const r = await roep(WACHTRIJ_GEHEIM);
  assert.equal(r.status, 200);
  assert.ok((await admin.storage.from(BUCKET).download(d.pad)).error, 'de wees staat er nog');
});
