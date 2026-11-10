// Mijn spullen & Documenten: de verwijderprocedure op verzoek (A9, docs/thuisplanner-beta-voorbereiding.md §5.4) tegen een
// echte, LOKALE Supabase-stack met Storage, via staging/verwijderen-spullen.mjs. De regels: persoonlijk verdwijnt met het
// account (en bij vertrek), gedeeld blijft zolang het huishouden bestaat, een verwijderd huishouden neemt alles mee, en de
// bestaande opruimronde laat geen bestanden achter. Andere accounts en huishoudens blijven precies zoals ze waren.
// Met tegenproeven: een achtergelaten bestand en een achtergelaten persoonlijke rij laten de controle falen; een
// opruimronde die niets doet, staat in spullen-tegenproeven.mjs.
//
//   API_URL=... ANON_KEY=... SERVICE_ROLE_KEY=... DB_URL=... node --test verwijderen-spullen.test.mjs
//   (de opruimronde vraagt pg_net en Vault op de stack, zoals bij de uitnodigingsmail)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { createClient } from '@supabase/supabase-js';
import { spullenNietsMeer, spullenOpruimenNu, spullenOverzicht } from '../../staging/verwijderen-spullen.mjs';

const { API_URL, ANON_KEY, SERVICE_ROLE_KEY, DB_URL } = process.env;
for (const [k, v] of Object.entries({ API_URL, ANON_KEY, SERVICE_ROLE_KEY, DB_URL })) {
  if (!v) throw new Error(k + ' ontbreekt: start via run.sh (leest supabase status -o env)');
}
for (const u of [API_URL, DB_URL]) if (!/\/\/([^@/]*@)?(127\.0\.0\.1|localhost)[:/]/.test(u)) throw new Error('Weigering: alleen een lokale Supabase');

const opties = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(API_URL, SERVICE_ROLE_KEY, opties);
const run = randomUUID().slice(0, 8);
const wachtwoord = 'Test-' + randomUUID();
const BUCKET = 'documenten';
const PDF = Buffer.from('%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n');
const ok = ({ data, error }) => { assert.ifError(error); return data; };
const accounts = [];
const huishoudens = [];
let db;

before(async () => { db = new pg.Client({ connectionString: DB_URL }); await db.connect(); });
after(async () => {
  for (const h of huishoudens) {
    const { data: mappen } = await admin.storage.from(BUCKET).list(h);
    for (const m of mappen ?? []) await admin.storage.from(BUCKET).remove([`${h}/${m.name}/origineel`]);
  }
  if (huishoudens.length) await admin.from('households').delete().in('id', huishoudens);
  for (const id of accounts) await admin.auth.admin.deleteUser(id);
  await db?.end();
});

async function account(naam) {
  const email = `${naam}-${run}@test.invalid`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: wachtwoord, email_confirm: true });
  assert.ifError(error);
  accounts.push(data.user.id);
  const c = createClient(API_URL, ANON_KEY, opties);
  ok(await c.auth.signInWithPassword({ email, password: wachtwoord }));
  return { id: data.user.id, c };
}
async function huishouden(eigenaar, naam) {
  const h = ok(await eigenaar.c.rpc('create_household', { p_name: naam + ' ' + run, p_display_name: naam }));
  huishoudens.push(h);
  return h;
}
async function erbij(eigenaar, h, wie, naam) {
  const token = ok(await eigenaar.c.rpc('create_invite', { p_household: h }));
  ok(await wie.c.rpc('accept_invite', { p_token: token, p_display_name: naam }));
}
const lid = async (wie, h) => ok(await wie.c.rpc('my_memberships')).find(m => m.household_id === h).member_id;

/** Een spul met een bevestigd document (rij, bestand, bevestig-upload) en een koppeling, persoonlijk of gedeeld. */
async function spulMetDocument(wie, h, zichtbaarheid) {
  const m = await lid(wie, h);
  const spul = randomUUID(), doc = randomUUID();
  ok(await wie.c.from('possessions').insert({ id: spul, household_id: h, name: 'Wasmachine ' + run, owner_member_id: m, visibility: zichtbaarheid }));
  ok(await wie.c.from('documents').insert({ id: doc, household_id: h, title: 'Factuur ' + run, kind: 'factuur', owner_member_id: m,
    mime: 'application/pdf', size_bytes: PDF.length, visibility: zichtbaarheid }));
  const pad = `${h}/${doc}/origineel`;
  ok(await wie.c.storage.from(BUCKET).upload(pad, PDF, { contentType: 'application/pdf', upsert: false }));
  const { data: { session } } = await wie.c.auth.getSession();
  const r = await fetch(`${API_URL}/functions/v1/bevestig-upload`, { method: 'POST',
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ document_id: doc }) });
  assert.equal(r.status, 200);
  ok(await wie.c.from('document_links').insert({ household_id: h, document_id: doc, possession_id: spul }));
  return { spul, doc, pad };
}
const bestaat = async pad => !(await admin.storage.from(BUCKET).download(pad)).error;
const rij = async (tabel, id) => Number((await db.query(`select count(*) as n from public.${tabel} where id = $1`, [id])).rows[0].n) === 1;

/** Alles van Mijn spullen in een huishouden (rijen met versie, en de bestanden): om "precies zoals het was" te toetsen. */
async function foto(h) {
  const q = async s => (await db.query(s, [h])).rows;
  return JSON.stringify({
    h: await q('select id from public.households where id = $1'),
    leden: await q('select id, user_id, role, status from public.household_members where household_id = $1 order by id'),
    spullen: await q('select id, version, visibility from public.possessions where household_id = $1 order by id'),
    documenten: await q('select id, version, visibility, upload_status from public.documents where household_id = $1 order by id'),
    koppelingen: await q('select id, version from public.document_links where household_id = $1 order by id'),
    bestanden: await q(`select name from storage.objects where bucket_id = '${BUCKET}' and name like $1::text || '/%' order by name`),
  });
}

test('1. een heel huishouden: alle spullen, documenten, koppelingen en bestanden weg; een ander huishouden blijft gelijk', async () => {
  const eva = await account('eva'), finn = await account('finn'), gijs = await account('gijs');
  const h = await huishouden(eva, 'Eva'); await erbij(eva, h, finn, 'Finn');
  const g = await huishouden(gijs, 'Gijs');
  await spulMetDocument(eva, h, 'household'); await spulMetDocument(eva, h, 'private'); await spulMetDocument(finn, h, 'private');
  await spulMetDocument(gijs, g, 'household');
  const voor = await foto(g);
  const o = await spullenOverzicht(db, { huishouden: h });
  assert.deepEqual([o.spullen, o.documenten, o.koppelingen, o.bestanden], [3, 3, 3, 3]);
  ok(await eva.c.rpc('delete_household', { p_household: h }));
  assert.equal(o.bestanden, Number((await db.query(`select count(*) as n from storage.objects where bucket_id = '${BUCKET}' and name like $1::text || '/%'`, [h])).rows[0].n),
    'een cascade wist geen bestanden: vóór de opruimronde staan ze er nog');
  assert.deepEqual(await spullenOpruimenNu(db, o), []);
  assert.equal(await foto(g), voor, 'een ander huishouden is veranderd');
  // Tegenproef 1: een achtergelaten bestand onder het verwijderde huishouden laat de controle falen.
  const wees = `${h}/${randomUUID()}/origineel`;
  ok(await admin.storage.from(BUCKET).upload(wees, PDF, { contentType: 'application/pdf' }));
  try {
    const f = await spullenNietsMeer(db, o);
    assert.ok(f.some(x => x.includes('bestand(en) in Storage')), 'achtergelaten bestand niet gemeld: ' + JSON.stringify(f));
  } finally { await admin.storage.from(BUCKET).remove([wees]); }
});

test('2. een partner verwijdert het eigen account: persoonlijk weg (rij en bestand), gedeeld blijft voor het huishouden', async () => {
  const hanna = await account('hanna'), ivo = await account('ivo');
  const h = await huishouden(hanna, 'Hanna'); await erbij(hanna, h, ivo, 'Ivo');
  const ivoPriv = await spulMetDocument(ivo, h, 'private');
  const ivoGedeeld = await spulMetDocument(ivo, h, 'household');
  const hannaPriv = await spulMetDocument(hanna, h, 'private');
  const o = await spullenOverzicht(db, { account: ivo.id });
  assert.deepEqual(o.persoonlijkeDocumenten.map(d => d.id), [ivoPriv.doc]);
  assert.deepEqual(o.persoonlijkeSpullen, [ivoPriv.spul]);
  ok(await admin.auth.admin.deleteUser(ivo.id));
  assert.deepEqual(await spullenOpruimenNu(db, o), []);
  assert.ok(!(await rij('documents', ivoPriv.doc)) && !(await rij('possessions', ivoPriv.spul)) && !(await bestaat(ivoPriv.pad)));
  // Gedeeld blijft: rij, koppeling en bestand, en Hanna kan het nog openen.
  assert.ok(await rij('documents', ivoGedeeld.doc) && await rij('possessions', ivoGedeeld.spul) && await bestaat(ivoGedeeld.pad));
  assert.ifError((await hanna.c.storage.from(BUCKET).createSignedUrl(ivoGedeeld.pad, 60, { download: true })).error);
  assert.ok(await rij('documents', hannaPriv.doc) && await bestaat(hannaPriv.pad), 'het persoonlijke document van Hanna is geraakt');
  // Tegenproef 2: een persoonlijke rij die er nog is, laat de controle falen.
  const f = await spullenNietsMeer(db, { ...o, persoonlijkeDocumenten: [{ id: hannaPriv.doc, pad: hannaPriv.pad }] });
  assert.ok(f.some(x => x.includes('persoonlijk(e) document(en)')) && f.some(x => x.includes('bestand(en) van persoonlijke documenten')),
    'achtergelaten persoonlijke rij niet gemeld: ' + JSON.stringify(f));
});

test('3. een account in twee huishoudens: het eigen huishouden gaat mee; in het andere alleen het persoonlijke; niemand anders geraakt', async () => {
  const jan = await account('jan'), kim = await account('kim'), lot = await account('lot');
  const eigen = await huishouden(jan, 'Jan');
  const ander = await huishouden(kim, 'Kim'); await erbij(kim, ander, jan, 'Jan');
  const derde = await huishouden(lot, 'Lot');
  await spulMetDocument(jan, eigen, 'household'); await spulMetDocument(jan, eigen, 'private');
  const janPriv = await spulMetDocument(jan, ander, 'private');
  const janGedeeld = await spulMetDocument(jan, ander, 'household');
  const kimPriv = await spulMetDocument(kim, ander, 'private');
  const kimGedeeld = await spulMetDocument(kim, ander, 'household');
  await spulMetDocument(lot, derde, 'household');
  const voorDerde = await foto(derde);
  const o = await spullenOverzicht(db, { account: jan.id });
  assert.equal(o.persoonlijkeDocumenten.length, 2);
  assert.deepEqual([...o.huishoudens].sort(), [eigen, ander].sort());
  ok(await admin.auth.admin.deleteUser(jan.id));
  assert.deepEqual(await spullenOpruimenNu(db, o), []);
  assert.equal(Number((await db.query('select count(*) as n from public.households where id = $1', [eigen])).rows[0].n), 0, 'het eigen huishouden van Jan bestaat nog');
  assert.ok(!(await rij('documents', janPriv.doc)) && !(await bestaat(janPriv.pad)));
  assert.ok(await rij('documents', janGedeeld.doc) && await bestaat(janGedeeld.pad), 'het gedeelde document van Jan in het andere huishouden is weg');
  for (const x of [kimPriv, kimGedeeld]) assert.ok(await rij('documents', x.doc) && await rij('possessions', x.spul) && await bestaat(x.pad), 'Kim is geraakt');
  assert.equal(await foto(derde), voorDerde, 'een ander huishouden is veranderd');
  assert.ok(!(await admin.auth.admin.getUserById(kim.id)).error && !(await admin.auth.admin.getUserById(lot.id)).error, 'een ander account is weg');
});

test('4. de eigenaar vertrekt: als laatste eigenaar geweigerd; na overdracht weg met alleen het eigen persoonlijke', async () => {
  const mia = await account('mia'), noor = await account('noor');
  const h = await huishouden(mia, 'Mia'); await erbij(mia, h, noor, 'Noor');
  const miaPriv = await spulMetDocument(mia, h, 'private');
  const miaGedeeld = await spulMetDocument(mia, h, 'household');
  const noorPriv = await spulMetDocument(noor, h, 'private');
  const voor = await foto(h);
  const weiger = await mia.c.rpc('leave_household', { p_household: h });
  assert.equal(weiger.error?.code, '23514', 'de laatste eigenaar mocht vertrekken');
  assert.equal(await foto(h), voor, 'na een geweigerd vertrek is er iets veranderd');
  const o = await spullenOverzicht(db, { account: mia.id });
  ok(await mia.c.rpc('transfer_ownership', { p_household: h, p_member: await lid(noor, h) }));
  ok(await mia.c.rpc('leave_household', { p_household: h }));
  assert.deepEqual(await spullenOpruimenNu(db, o), []);
  assert.ok(!(await rij('documents', miaPriv.doc)) && !(await bestaat(miaPriv.pad)));
  assert.ok(await rij('documents', miaGedeeld.doc) && await bestaat(miaGedeeld.pad), 'gedeeld van Mia is weg na haar vertrek');
  assert.ok(await rij('documents', noorPriv.doc) && await bestaat(noorPriv.pad), 'Noor is geraakt');
});

test('5. de enige eigenaar met andere accounts verwijdert het account: geweigerd, en er is niets gewist', async () => {
  const owen = await account('owen'), pia = await account('pia');
  const h = await huishouden(owen, 'Owen'); await erbij(owen, h, pia, 'Pia');
  await spulMetDocument(owen, h, 'private'); await spulMetDocument(owen, h, 'household'); await spulMetDocument(pia, h, 'private');
  const voor = await foto(h);
  const r = await admin.auth.admin.deleteUser(owen.id);
  assert.ok(r.error, 'het account van de enige eigenaar met andere accounts is verwijderd');
  assert.ok(!(await admin.auth.admin.getUserById(owen.id)).error, 'het account bestaat niet meer');
  assert.equal(await foto(h), voor, 'na een geweigerde verwijdering is er iets veranderd');
});
