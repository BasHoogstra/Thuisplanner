// Mijn spullen & Documenten: de sync (spullen, documenten, koppelingen) en het uploaden in twee fasen tegen een echte,
// LOKALE Supabase-stack met Storage, met twee telefoons in één huishouden (Sara en Tim) en een buitenstaander (Bo).
// Zie docs/thuisplanner-spullen-documenten.md §14. Zonder psql: controle buiten RLS gaat via de service-rol.
//   thuisplanner/supabase/tests/integratie/run.sh
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import pg from 'pg';
import { maakSync } from '../../../sync/thuisplanner-sync.js';
import { maakSpullenOpslag, padVan } from '../../../sync/spullen-opslag.js';
import { bestandenLijst, controleerExport, haalBestanden, herstelBestanden, leesExport, schrijfExport } from '../../staging/export.mjs';

const { API_URL, ANON_KEY, SERVICE_ROLE_KEY, DB_URL } = process.env;
for (const u of [API_URL, DB_URL]) {
  if (!u || !/\/\/([^@/]*@)?(127\.0\.0\.1|localhost)[:/]/.test(u)) throw new Error('Weigering: alleen een lokale Supabase');
}
const wacht = ms => new Promise(r => setTimeout(r, ms));
async function totdat(f, ms = 10000, wat = 'voorwaarde') {
  const eind = Date.now() + ms;
  while (Date.now() < eind) { if (await f()) return; await wacht(100); }
  throw new Error('Niet binnen ' + ms + ' ms: ' + wat);
}
const opties = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(API_URL, SERVICE_ROLE_KEY, opties);
const run = randomUUID().slice(0, 8);
const wachtwoord = 'Sp-' + randomUUID();
const personen = {};
const syncs = [];
const huishoudens = [];
const ok = ({ data, error }) => { assert.ifError(error); return data; };

// Een client waarvan één verzoek "wegvalt": vóór de server (voor: true) of na de server (het antwoord gaat verloren).
function clientMetVerlies() {
  const verlies = { wat: null, voor: false };
  const f = async (url, o = {}) => {
    const treft = verlies.wat && verlies.wat(String(url), (o.method || 'GET').toUpperCase());
    if (treft && verlies.voor) { verlies.wat = null; verlies.voor = false; throw new TypeError('fetch failed (verbinding weg)'); }
    const r = await fetch(url, o);
    if (treft) { verlies.wat = null; throw new TypeError('fetch failed (antwoord verloren)'); }
    return r;
  };
  return { c: createClient(API_URL, ANON_KEY, { ...opties, global: { fetch: f } }), verlies };
}
async function persoon(naam) {
  const email = `${naam}-${run}@test.invalid`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: wachtwoord, email_confirm: true });
  assert.ifError(error);
  const { c, verlies } = clientMetVerlies();
  ok(await c.auth.signInWithPassword({ email, password: wachtwoord }));
  personen[naam] = { id: data.user.id, c, verlies };
  return personen[naam];
}
async function startSync(naam, h, extra = {}) {
  const s = maakSync({ supabase: personen[naam].c, huishoudenId: h, vangnetMs: 60000, spullen: true, ...extra });
  syncs.push(s);
  await s.start();
  return s;
}
const PDF = Buffer.from('%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n');
const NEP = Buffer.from('<!doctype html><script>alert(1)</script>');
const docVelden = (lid, bytes = PDF, extra = {}) => ({ title: 'Factuur ' + run, kind: 'factuur', visibility: 'household', owner_member_id: lid,
  mime: 'application/pdf', size_bytes: bytes.length, sha256: null, ...extra });

let ha, hb, sara, tim, bo, mSara, mTim, mBo, sSara, sTim;
before(async () => {
  sara = await persoon('sara'); tim = await persoon('tim'); bo = await persoon('bo');
  // Elk huishouden staat meteen op de opruimlijst van after(), zodat het ook verdwijnt als een latere stap faalt.
  ha = ok(await sara.c.rpc('create_household', { p_name: 'Spullen ' + run, p_display_name: 'Sara' }));
  huishoudens.push(ha);
  hb = ok(await bo.c.rpc('create_household', { p_name: 'Buren ' + run, p_display_name: 'Bo' }));
  huishoudens.push(hb);
  ok(await tim.c.rpc('accept_invite', { p_token: ok(await sara.c.rpc('create_invite', { p_household: ha })), p_display_name: 'Tim' }));
  const lid = async (p, h) => ok(await p.c.rpc('my_memberships')).find(m => m.household_id === h).member_id;
  mSara = await lid(sara, ha); mTim = await lid(tim, ha); mBo = await lid(bo, hb);
  sSara = await startSync('sara', ha);
  sTim = await startSync('tim', ha);
});
after(async () => {
  // Elke stap apart: een fout in één stap mag de rest van het opruimen niet overslaan.
  const fouten = [];
  const probeer = async (wat, f) => { try { await f(); } catch (e) { fouten.push(`${wat}: ${e.message}`); } };
  for (const s of syncs) await probeer('sync stoppen', () => s.stop());
  for (const h of huishoudens) {
    await probeer('bestanden ' + h, async () => {
      const { data: mappen } = await admin.storage.from('documenten').list(h);
      for (const m of mappen ?? []) await admin.storage.from('documenten').remove([`${h}/${m.name}/origineel`]);
    });
  }
  await probeer('huishoudens', async () => ok(await admin.from('households').delete().in('id', huishoudens)));
  for (const { id } of Object.values(personen)) await probeer('gebruiker', async () => ok(await admin.auth.admin.deleteUser(id)));
  if (fouten.length) throw new Error('Opruimen niet volledig gelukt: ' + fouten.join('; '));
});

test('zonder de optie spullen: precies de oude zoekopdrachten (geen spullentabellen, geen possession_id)', async () => {
  const gevraagd = [];
  const f = async (url, o) => { gevraagd.push(String(url)); return fetch(url, o); };
  const c = createClient(API_URL, ANON_KEY, { ...opties, global: { fetch: f } });
  ok(await c.auth.signInWithPassword({ email: `sara-${run}@test.invalid`, password: wachtwoord }));
  const s = maakSync({ supabase: c, huishoudenId: ha, vangnetMs: 60000 });
  syncs.push(s);
  await s.start();
  await s.vernieuw();
  assert.ok(gevraagd.some(u => u.includes('/rest/v1/tasks')));
  assert.ok(!gevraagd.some(u => /\/rest\/v1\/(possessions|documents|document_links)/.test(u)), 'spullentabellen gevraagd zonder de optie');
  assert.ok(!gevraagd.some(u => u.includes('/rest/v1/tasks') && u.includes('possession_id')), 'possession_id gevraagd zonder de optie');
  assert.deepEqual([s.toestand.spullen, s.toestand.documenten, s.toestand.documentKoppelingen], [[], [], []]);
  await s.stop();
});

test('twee telefoons: een spul van Sara verschijnt bij Tim (seintje); een persoonlijk spul niet', async () => {
  const id = randomUUID(), prive = randomUUID();
  assert.ok((await sSara.acties.spulToevoegen(id, { name: 'Vaatwasser ' + run, brand: 'Voorbeeldmerk', owner_member_id: mSara, field_status: { model: 'voorstel' } })).ok);
  assert.ok((await sSara.acties.spulToevoegen(prive, { name: 'Sieraad ' + run, owner_member_id: mSara, visibility: 'private' })).ok);
  await totdat(() => sTim.toestand.spullen.some(x => x.id === id), 15000, 'Tim ziet het spul');
  await sTim.vernieuw();
  assert.ok(!sTim.toestand.spullen.some(x => x.id === prive), 'Tim ziet het persoonlijke spul van Sara');
  assert.ok(sSara.toestand.spullen.some(x => x.id === prive));
  assert.deepEqual(sTim.toestand.spullen.find(x => x.id === id).field_status, { model: 'voorstel' });
  // Opnieuw toevoegen met dezelfde UUID (na een onzekere uitkomst): geen tweede, geen fout.
  assert.ok((await sSara.acties.spulToevoegen(id, { name: 'Vaatwasser ' + run, owner_member_id: mSara })).ok);
  assert.equal((await admin.from('possessions').select('id').eq('id', id)).data.length, 1);
});

test('gelijktijdig bewerken: de tweede krijgt de conflictmelding, niets wordt overschreven', async () => {
  const id = randomUUID();
  assert.ok((await sSara.acties.spulToevoegen(id, { name: 'Fiets ' + run, owner_member_id: mSara })).ok);
  await sSara.vernieuw(); await sTim.vernieuw();
  const a = sSara.toestand.spullen.find(x => x.id === id), b = sTim.toestand.spullen.find(x => x.id === id);
  assert.ok((await sSara.acties.spulBijwerken(a, { shop: 'Winkel A' })).ok);
  const r = await sTim.acties.spulBijwerken(b, { shop: 'Winkel B' });
  assert.equal(r.ok, false); assert.equal(r.melding.soort, 'conflict');
  await sTim.vernieuw();
  assert.equal(sTim.toestand.spullen.find(x => x.id === id).shop, 'Winkel A');
});

test('alleen de eigenaar maakt iets persoonlijk; een lid zonder eigenaarschap krijgt "geen toegang"', async () => {
  const id = randomUUID();
  assert.ok((await sSara.acties.spulToevoegen(id, { name: 'Boor ' + run, owner_member_id: mSara })).ok);
  await sTim.vernieuw();
  const r = await sTim.acties.spulBijwerken(sTim.toestand.spullen.find(x => x.id === id), { visibility: 'private' });
  assert.equal(r.ok, false);
  // Een spul op naam van een ander maken kan niet.
  assert.equal((await sTim.acties.spulToevoegen(randomUUID(), { name: 'Vals', owner_member_id: mSara })).ok, false);
});

test('prullenbak: verwijderen en terugzetten, ook zichtbaar bij de ander', async () => {
  const id = randomUUID();
  assert.ok((await sSara.acties.spulToevoegen(id, { name: 'Lamp ' + run, owner_member_id: mSara })).ok);
  await sSara.vernieuw();
  assert.ok((await sSara.acties.spulVerwijderen(sSara.toestand.spullen.find(x => x.id === id))).ok);
  await sTim.vernieuw();
  assert.ok(sTim.toestand.spullen.find(x => x.id === id).deleted_at, 'in de prullenbak (nog zichtbaar om terug te zetten)');
  await sSara.vernieuw();
  assert.ok((await sSara.acties.spulTerugzetten(sSara.toestand.spullen.find(x => x.id === id))).ok);
  await sTim.vernieuw();
  assert.equal(sTim.toestand.spullen.find(x => x.id === id).deleted_at, null);
});

test('realtime bewijst de sync: Tim ziet een gedeeld spul en document zonder zelf op te halen; persoonlijk geeft hem geen seintje', async () => {
  // Het vangnet staat op 60 s: wat Tim binnen 15 s ziet, kwam via een seintje en de ophaalronde die daarop volgt.
  const rondes = sTim.statistiek.rondes;
  const gedeeld = randomUUID(), doc = randomUUID();
  assert.ok((await sSara.acties.spulToevoegen(gedeeld, { name: 'Wasmachine ' + run, owner_member_id: mSara })).ok);
  await totdat(() => sTim.toestand.spullen.some(x => x.id === gedeeld), 15000, 'Tim ziet het gedeelde spul via een seintje');
  const o = maakSpullenOpslag({ supabase: sara.c, sync: sSara, huishoudenId: ha, nieuweId: randomUUID });
  assert.ok((await o.bewaarDocument({ documentId: doc, velden: docVelden(mSara), bytes: PDF, spullen: [gedeeld] })).ok);
  await totdat(() => sTim.toestand.documenten.some(x => x.id === doc && x.upload_status === 'klaar')
    && sTim.toestand.documentKoppelingen.some(k => k.document_id === doc), 15000, 'Tim ziet het document en de koppeling');
  assert.ok(sTim.statistiek.rondes > rondes, 'Tim haalde opnieuw op (door seintjes)');
  // Persoonlijk: geen seintje naar het huishouden, dus Tim hoort er niets van (en ziet het niet).
  await wacht(1500);
  const seintjes = sTim.statistiek.seintjes;
  const prive = randomUUID(), priveDoc = randomUUID();
  assert.ok((await sSara.acties.spulToevoegen(prive, { name: 'Dagboek ' + run, owner_member_id: mSara, visibility: 'private' })).ok);
  assert.ok((await o.bewaarDocument({ documentId: priveDoc, velden: docVelden(mSara, PDF, { visibility: 'private' }), bytes: PDF })).ok);
  await wacht(3000);
  assert.equal(sTim.statistiek.seintjes, seintjes, 'Tim kreeg een seintje over een persoonlijk item van Sara');
  await sTim.vernieuw();
  assert.ok(!sTim.toestand.spullen.some(x => x.id === prive) && !sTim.toestand.documenten.some(x => x.id === priveDoc));
  // Tegenproef in dezelfde test: een gedeelde wijziging geeft Tim wél een seintje.
  await sSara.vernieuw();
  assert.ok((await sSara.acties.spulBijwerken(sSara.toestand.spullen.find(x => x.id === gedeeld), { shop: 'Winkel ' + run })).ok);
  await totdat(() => sTim.statistiek.seintjes > seintjes, 15000, 'een seintje bij een gedeelde wijziging');
});

test('uploaden in twee fasen: bewaard, bij beide telefoons te openen, als bijlage; koppeling bij het spul', async () => {
  const spul = randomUUID(); const doc = randomUUID();
  assert.ok((await sSara.acties.spulToevoegen(spul, { name: 'Oven ' + run, owner_member_id: mSara })).ok);
  const o = maakSpullenOpslag({ supabase: sara.c, sync: sSara, huishoudenId: ha, nieuweId: randomUUID });
  const r = await o.bewaarDocument({ documentId: doc, velden: docVelden(mSara), bytes: PDF, spullen: [spul] });
  assert.deepEqual(r, { ok: true, documentId: doc, spulId: undefined });
  await sTim.vernieuw();
  assert.equal(sTim.toestand.documenten.find(x => x.id === doc).upload_status, 'klaar');
  assert.ok(sTim.toestand.documentKoppelingen.some(k => k.document_id === doc && k.possession_id === spul));
  const t = maakSpullenOpslag({ supabase: tim.c, sync: sTim, huishoudenId: ha, nieuweId: randomUUID });
  const open = await t.openBestand(doc);
  assert.ok(open.ok);
  assert.deepEqual(Buffer.from(await open.blob.arrayBuffer()), PDF);
});

test('onderbroken upload: het bestand komt niet aan; niets "bewaard"; opnieuw proberen met dezelfde UUID lukt', async () => {
  const doc = randomUUID();
  const o = maakSpullenOpslag({ supabase: sara.c, sync: sSara, huishoudenId: ha, nieuweId: randomUUID });
  sara.verlies.wat = (u, m) => m === 'POST' && u.includes(`/storage/v1/object/documenten/${ha}/${doc}`); sara.verlies.voor = true;
  const r = await o.bewaarDocument({ documentId: doc, velden: docVelden(mSara), bytes: PDF });
  assert.equal(r.ok, false); assert.equal(r.fase, 'upload'); assert.equal(r.opnieuw, true);
  assert.equal(sSara.toestand.documenten.find(x => x.id === doc).upload_status, 'wacht');
  assert.ok((await sara.c.storage.from('documenten').createSignedUrl(padVan(ha, doc), 60)).error, 'een wachtend document is niet te openen');
  const tweede = await o.opnieuwUploaden(doc, PDF, 'application/pdf');
  assert.equal(tweede.ok, true);
  await sSara.vernieuw();
  assert.equal(sSara.toestand.documenten.find(x => x.id === doc).upload_status, 'klaar');
  assert.equal((await admin.from('documents').select('id').eq('id', doc)).data.length, 1, 'geen tweede document');
});

test('antwoord van de upload verloren: opnieuw proberen ziet het bestaande object en bevestigt (niet overschreven)', async () => {
  const doc = randomUUID();
  const o = maakSpullenOpslag({ supabase: sara.c, sync: sSara, huishoudenId: ha, nieuweId: randomUUID });
  sara.verlies.wat = (u, m) => m === 'POST' && u.includes(`/storage/v1/object/documenten/${ha}/${doc}`);
  const r = await o.bewaarDocument({ documentId: doc, velden: docVelden(mSara), bytes: PDF });
  assert.equal(r.fase, 'upload');
  assert.equal((await o.opnieuwUploaden(doc, PDF, 'application/pdf')).ok, true);
});

test('bevestigen onderbroken: opnieuw proberen bevestigt; een vermomd bestand wordt geweigerd en blijft geweigerd', async () => {
  const doc = randomUUID();
  const o = maakSpullenOpslag({ supabase: sara.c, sync: sSara, huishoudenId: ha, nieuweId: randomUUID });
  sara.verlies.wat = (u, m) => m === 'POST' && u.includes('/functions/v1/bevestig-upload'); sara.verlies.voor = true;
  const r = await o.bewaarDocument({ documentId: doc, velden: docVelden(mSara), bytes: PDF });
  assert.equal(r.fase, 'bevestigen');
  assert.equal((await o.opnieuwUploaden(doc, PDF, 'application/pdf')).ok, true);
  const nep = randomUUID();
  const n = await o.bewaarDocument({ documentId: nep, velden: docVelden(mSara, NEP), bytes: NEP });
  assert.deepEqual([n.ok, n.fase, n.opnieuw], [false, 'controle', false]);
  await sSara.vernieuw();
  assert.equal(sSara.toestand.documenten.find(x => x.id === nep).upload_status, 'mislukt');
  assert.equal((await o.opnieuwUploaden(nep, PDF, 'application/pdf')).ok, false, 'een geweigerd document opnieuw bevestigd');
});

test('offline: niets verstuurd, niets aangemaakt, een duidelijke melding', async () => {
  const doc = randomUUID();
  const o = maakSpullenOpslag({ supabase: sara.c, sync: sSara, huishoudenId: ha, nieuweId: randomUUID });
  const oud = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', { value: { onLine: false }, configurable: true });
  try {
    const r = await o.bewaarDocument({ documentId: doc, velden: docVelden(mSara), bytes: PDF });
    assert.deepEqual([r.ok, r.fase], [false, 'offline']);
    assert.equal((await sSara.acties.spulToevoegen(randomUUID(), { name: 'Offline', owner_member_id: mSara })).melding.soort, 'offline');
  } finally {
    if (oud) Object.defineProperty(globalThis, 'navigator', oud); else delete globalThis.navigator;
  }
  assert.equal((await admin.from('documents').select('id').eq('id', doc)).data.length, 0);
});

test('taken bij een spul: possession_id via de sync; nooit aan een persoonlijk spul van de partner of een spul van een ander huishouden', async () => {
  const spul = randomUUID();
  assert.ok((await sSara.acties.spulToevoegen(spul, { name: 'CV-ketel ' + run, owner_member_id: mSara })).ok);
  const r = await sSara.acties.taakToevoegen('Ketel laten onderhouden', { due_date: null, assignee_member_id: null, possession_id: spul });
  assert.ok(r.ok);
  await sTim.vernieuw();
  assert.equal(sTim.toestand.taken.find(t => t.title === 'Ketel laten onderhouden').possession_id, spul);
  // Het persoonlijke spul van de partner: Tim kan er geen taak aan hangen (de trigger; anders zou de taak het verraden).
  const prive = randomUUID();
  assert.ok((await sSara.acties.spulToevoegen(prive, { name: 'Kluis ' + run, owner_member_id: mSara, visibility: 'private' })).ok);
  assert.equal((await sTim.acties.taakToevoegen('Kluis openen', { due_date: null, assignee_member_id: null, possession_id: prive })).ok, false, 'taak aan een persoonlijk spul van een ander');
  const sBo = await startSync('bo', hb);
  const fout = await sBo.acties.taakToevoegen('Indringer', { due_date: null, assignee_member_id: null, possession_id: spul });
  assert.equal(fout.ok, false);
});

test('gedeeld document bij een persoonlijk spul: lid en beheerder zien het document, maar niets van het spul', async () => {
  const spul = randomUUID(), doc = randomUUID(), geheim = 'Trouwring ' + run;
  assert.ok((await sSara.acties.spulToevoegen(spul, { name: geheim, owner_member_id: mSara, visibility: 'private' })).ok);
  const o = maakSpullenOpslag({ supabase: sara.c, sync: sSara, huishoudenId: ha, nieuweId: randomUUID });
  assert.ok((await o.bewaarDocument({ documentId: doc, spullen: [spul], velden: docVelden(mSara, PDF, { title: 'Bon van 1 november ' + run }), bytes: PDF })).ok);
  const controleer = async wat => {
    await sTim.vernieuw();
    assert.ok(sTim.toestand.documenten.some(d => d.id === doc), wat + ': het gedeelde document ontbreekt');
    // Via de sync en via een ruwe zoekopdracht op elke tabel: geen naam, geen id, geen koppeling.
    assert.ok(!JSON.stringify(sTim.toestand).includes(spul) && !JSON.stringify(sTim.toestand).includes(geheim), wat + ': spoor in de toestand');
    assert.equal(ok(await tim.c.from('possessions').select('id').eq('id', spul)).length, 0, wat);
    assert.equal(ok(await tim.c.from('document_links').select('id').eq('possession_id', spul)).length, 0, wat);
    assert.equal(ok(await tim.c.from('document_links').select('id').eq('document_id', doc)).length, 0, wat);
  };
  await controleer('lid');
  // Een beheerder heeft geen uitzondering op persoonlijk.
  ok(await sara.c.rpc('set_member_role', { p_household: ha, p_member: mTim, p_role: 'admin' }));
  try { await controleer('beheerder'); } finally { ok(await sara.c.rpc('set_member_role', { p_household: ha, p_member: mTim, p_role: 'member' })); }
  // De eigenaar ziet de koppeling wel.
  await sSara.vernieuw();
  assert.ok(sSara.toestand.documentKoppelingen.some(k => k.document_id === doc && k.possession_id === spul));
});

test('export met bestanden: in het manifest, met controlesom; een gewijzigd bestand valt op; terugzetten geeft dezelfde bytes', async () => {
  const doc = randomUUID();
  const o = maakSpullenOpslag({ supabase: sara.c, sync: sSara, huishoudenId: ha, nieuweId: randomUUID });
  assert.ok((await o.bewaarDocument({ documentId: doc, velden: docVelden(mSara), bytes: PDF })).ok);
  const db = new pg.Client({ connectionString: DB_URL });
  await db.connect();
  let exp;
  try { exp = await leesExport(db); } finally { await db.end(); }
  assert.ok(exp.bestanden.some(b => b.pad === padVan(ha, doc)));
  // Zonder de bestanden: geen export.
  const map0 = path.join(mkdtempSync(path.join(tmpdir(), 'tp-exp-')), 'x');
  assert.throws(() => schrijfExport(map0, exp), /bestanden/);
  exp.bestandenInhoud = await haalBestanden(exp.bestanden, { url: API_URL, sleutel: SERVICE_ROLE_KEY });
  const map = path.join(mkdtempSync(path.join(tmpdir(), 'tp-exp-')), 'export');
  try {
    const { manifest } = schrijfExport(map, exp);
    const b = manifest.bestanden.find(x => x.pad === padVan(ha, doc));
    assert.equal(b.grootte, PDF.length);
    assert.deepEqual(controleerExport(map).fouten, []);
    // Terugzetten (na het verdwijnen van het object): dezelfde bytes.
    ok(await admin.storage.from('documenten').remove([padVan(ha, doc)]));
    assert.ok((await herstelBestanden(map, { url: API_URL, sleutel: SERVICE_ROLE_KEY })) >= 1);
    const terug = ok(await admin.storage.from('documenten').download(padVan(ha, doc)));
    assert.deepEqual(Buffer.from(await terug.arrayBuffer()), PDF);
    // Tegenproef: een gewijzigd bestand in de export valt op.
    writeFileSync(path.join(map, 'bestanden', ha, doc, 'origineel'), NEP);
    assert.match(controleerExport(map).fouten.join(), /controlesom of grootte/);
  } finally {
    rmSync(path.dirname(map), { recursive: true, force: true });
    rmSync(path.dirname(map0), { recursive: true, force: true });
  }
});

test('verwijderen van een huishouden: rijen weg, bestanden wezen, en de lijst voor de opruimronde noemt ze', async () => {
  const c = await persoon('cas');
  const hc = ok(await c.c.rpc('create_household', { p_name: 'Weg ' + run, p_display_name: 'Cas' }));
  // Ook dit huishouden (en zijn bestanden) ruimt after() op als de test halverwege faalt.
  huishoudens.push(hc);
  const mc = ok(await c.c.rpc('my_memberships')).find(m => m.household_id === hc).member_id;
  const sCas = await startSync('cas', hc);
  const doc = randomUUID();
  const o = maakSpullenOpslag({ supabase: c.c, sync: sCas, huishoudenId: hc, nieuweId: randomUUID });
  assert.ok((await o.bewaarDocument({ documentId: doc, velden: docVelden(mc), bytes: PDF })).ok);
  await sCas.stop();
  ok(await c.c.rpc('delete_household', { p_household: hc }));
  assert.equal((await admin.from('documents').select('id').eq('household_id', hc)).data.length, 0, 'rijen weg');
  const db = new pg.Client({ connectionString: DB_URL });
  await db.connect();
  try {
    assert.ok((await bestandenLijst(db)).some(b => b.pad === padVan(hc, doc)), 'het bestand staat er nog (wees)');
    const opruim = (await db.query('select pad from private.documenten_op_te_ruimen()')).rows.map(r => r.pad);
    assert.ok(opruim.includes(padVan(hc, doc)), 'de opruimronde noemt de wees');
  } finally { await db.end(); }
  ok(await admin.storage.from('documenten').remove([padVan(hc, doc)]));
  assert.equal((await admin.storage.from('documenten').list(hc)).data.length, 0, 'niets meer onder het huishouden');
});
