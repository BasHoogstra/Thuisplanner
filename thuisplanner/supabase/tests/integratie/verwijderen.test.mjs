// Verwijderen op verzoek (A9, docs/thuisplanner-beta-voorbereiding.md §5.4): het verwijderscript staging/verwijderen.mjs
// tegen een echte, LOKALE Supabase-stack, als opdracht (met de getypte bevestiging op standaardinvoer), voor beide
// varianten:
//   (a) de eigenaar vraagt om het hele huishouden: alles weg (ook afspraken, taken, boodschappen, vakanties en paklijsten,
//       plannen, spullen, documenten en bestanden, en de lidmaatschappen); het account van de partner blijft, zonder
//       huishouden; een ander huishouden blijft precies zoals het was;
//   (b) een partner vraagt om alleen het eigen account: het account, de privé-afspraken en het persoonlijke weg; de
//       gedeelde gegevens blijven.
// In beide: het adres van de testerslijst, de codes en tellers bij het adres, uitnodigingen naar dat adres in een ander
// huishouden en de regels in het auditlogboek van Supabase Auth zijn weg, en de controle "niets meer aanwezig" slaagt.
// Met tegenproeven: een opzettelijk achtergelaten rij (per soort: adres, hash van het adres, account-id, huishouden-id,
// bestand) laat de controle falen; zonder bevestiging, of als de database zou weigeren, wordt er niets verwijderd.
//
//   API_URL=... ANON_KEY=... SERVICE_ROLE_KEY=... DB_URL=... K1_PEPPER=... node --test verwijderen.test.mjs
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { createClient } from '@supabase/supabase-js';
import { adresHash, controleer, leesVerzoek, zoekResten } from '../../staging/verwijderen.mjs';

const { API_URL, ANON_KEY, SERVICE_ROLE_KEY, DB_URL, K1_PEPPER } = process.env;
for (const [k, v] of Object.entries({ API_URL, ANON_KEY, SERVICE_ROLE_KEY, DB_URL, K1_PEPPER })) {
  if (!v) throw new Error(k + ' ontbreekt: start via run.sh (leest supabase status -o env en functions/.env)');
}
for (const u of [API_URL, DB_URL]) if (!/\/\/([^@/]*@)?(127\.0\.0\.1|localhost)[:/]/.test(u)) throw new Error('Weigering: alleen een lokale Supabase');

const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../staging/verwijderen.mjs');
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
  if (huishoudens.length) await db.query('delete from public.households where id = any($1::uuid[])', [huishoudens]);
  for (const id of accounts) await db.query('delete from auth.users where id = $1', [id]).catch(() => {});
  await db.query(`delete from private.testers where email like $1`, [`%-${run}@test.invalid`]);
  await db?.end();
});

const adresVan = naam => `${naam}-${run}@test.invalid`;
async function account(naam) {
  const email = adresVan(naam);
  const { data, error } = await admin.auth.admin.createUser({ email, password: wachtwoord, email_confirm: true });
  assert.ifError(error);
  accounts.push(data.user.id);
  const c = createClient(API_URL, ANON_KEY, opties);
  ok(await c.auth.signInWithPassword({ email, password: wachtwoord }));   // ook een regel in het auditlogboek
  return { id: data.user.id, email, c };
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
const tel = async (sql, p) => Number((await db.query(sql, p)).rows[0].n);

/** De resten bij een adres die de codelaag en de testpoort achterlaten: testerslijst, een code en de tellers. */
async function restenBijAdres(email, userId) {
  const hash = adresHash(K1_PEPPER, email);
  await db.query('insert into private.testers (email) values ($1) on conflict do nothing', [email]);
  await db.query(`insert into private.k1_accounts (adres_hmac, totaal, aanvragen_dag) values ($1, 3, 2) on conflict do nothing`, [hash]);
  await db.query(`insert into private.k1_codes (adres_hmac, user_id, soort, code_hmac, token_hash_enc, verloopt, status)
    values ($1, $2, 'email', repeat('a', 64), 'versleuteld', now() + interval '10 minutes', 'gebruikt')`, [hash, userId ?? randomUUID()]);
  return hash;
}

/** Inhoud in alle domeinen, met directe SQL (de regels voor verwijderen staan in de database, niet in de app). */
async function inhoud(h, m, naam) {
  const ev = async zicht => {
    const id = randomUUID();
    await db.query(`insert into public.events (id, household_id, owner_member_id, visibility, start_date) values ($1, $2, $3, $4, current_date)`, [id, h, m, zicht]);
    await db.query(`insert into public.event_details (event_id, household_id, title) values ($1, $2, $3)`, [id, h, `${zicht} ${naam} ${run}`]);
    return id;
  };
  const prive = await ev('private'), gedeeld = await ev('household');
  const trip = randomUUID(), plan = randomUUID();
  await db.query(`insert into public.tasks (household_id, title, assignee_member_id) values ($1, $2, $3)`, [h, 'Taak ' + naam, m]);
  await db.query(`insert into public.shopping_items (household_id, name) values ($1, $2)`, [h, 'Melk ' + naam + run]);
  await db.query(`insert into public.trips (id, household_id, name) values ($1, $2, $3)`, [trip, h, 'Vakantie ' + naam]);
  await db.query(`insert into public.trip_packing_items (household_id, trip_id, member_id, name) values ($1, $2, $3, $4)`, [h, trip, m, 'Zonnebrand ' + naam]);
  await db.query(`insert into public.trip_packing_lists (household_id, trip_id, name) values ($1, $2, $3)`, [h, trip, 'Extra']);
  await db.query(`insert into public.plans (id, household_id, title, member_ids) values ($1, $2, $3, $4)`, [plan, h, 'Plan ' + naam, [m]]);
  await db.query(`insert into public.plan_sections (household_id, plan_id, name) values ($1, $2, 'Onderdeel')`, [h, plan]);
  return { prive, gedeeld, trip, plan };
}

/** Een spul met een bevestigd document (rij, bestand via de API, bevestig-upload) en een koppeling. */
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

/** Alles van een huishouden (elke tabel met household_id, en de bestanden), om "precies zoals het was" te toetsen. */
async function foto(h, { zonder = [] } = {}) {
  const tabellen = (await db.query(`select ns.nspname as s, c.relname as t from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
    join pg_attribute a on a.attrelid = c.oid and a.attname = 'household_id' where c.relkind = 'r' and ns.nspname in ('public', 'private') order by 1, 2`)).rows;
  const uit = {};
  for (const { s, t } of tabellen) {
    if (zonder.includes(`${s}.${t}`)) continue;
    uit[`${s}.${t}`] = (await db.query(`select to_jsonb(x) as r from "${s}"."${t}" x where household_id = $1 order by 1`, [h])).rows.map(r => JSON.stringify(r.r)).sort();
  }
  uit.bestanden = (await db.query(`select name from storage.objects where bucket_id = '${BUCKET}' and name like $1::text || '/%' order by name`, [h])).rows;
  return JSON.stringify(uit);
}

/** Het script als opdracht, zoals verwijderen.ps1 het aanroept; de bevestiging gaat via standaardinvoer. */
function script(args, invoer) {
  return new Promise((resolve, reject) => {
    const p = spawn(process.execPath, [SCRIPT, ...args], {
      env: { ...process.env, KG_OMGEVING: 'lokaal', KG_DB_URL: DB_URL, KG_PEPPER: K1_PEPPER }, stdio: ['pipe', 'pipe', 'pipe'] });
    let uit = '';
    p.stdout.on('data', d => { uit += d; });
    p.stderr.on('data', d => { uit += d; });
    p.on('error', reject);
    p.on('close', code => resolve({ code, uit }));
    p.stdin.end(invoer ?? '');
  });
}
const bevestig = adres => `verwijder lokaal ${adres}\n`;

test('(a) heel huishouden op verzoek van de eigenaar: alles weg, partner zonder huishouden, de rest ongemoeid; tegenproeven', async () => {
  const anna = await account('anna'), bram = await account('bram'), gijs = await account('gijs');
  const h = await huishouden(anna, 'Anna'); await erbij(anna, h, bram, 'Bram');
  const g = await huishouden(gijs, 'Gijs');
  ok(await anna.c.rpc('create_invite', { p_household: h, p_email: adresVan('oma') }));            // open uitnodiging in H
  ok(await gijs.c.rpc('create_invite', { p_household: g, p_email: anna.email }));                // naar Anna, in een ander huishouden
  ok(await anna.c.rpc('add_member', { p_household: h, p_display_name: 'Kind', p_kind: 'child' }));   // een kind zonder account
  const ma = await lid(anna, h), mb = await lid(bram, h);
  await inhoud(h, ma, 'Anna'); await inhoud(h, mb, 'Bram'); await inhoud(g, await lid(gijs, g), 'Gijs');
  await spulMetDocument(anna, h, 'household'); await spulMetDocument(anna, h, 'private'); await spulMetDocument(bram, h, 'private');
  await spulMetDocument(gijs, g, 'household');
  const hashAnna = await restenBijAdres(anna.email, anna.id);
  await restenBijAdres(adresVan('ander'), null);
  const voorG = await foto(g, { zonder: ['public.household_invites', 'private.uitnodigingsmails'] });

  // Zonder bevestiging (verkeerde zin): niets verwijderd.
  const nee = await script(['--soort', 'huishouden', '--adres', anna.email], 'ja\n');
  assert.equal(nee.code, 3, nee.uit);
  assert.match(nee.uit, /HUISHOUDEN WEG: "Anna/);
  assert.match(nee.uit, /Bram \(adult, member, active\): account blijft/);
  assert.match(nee.uit, /public\.trips 2|public\.trips (\d)/);
  assert.match(nee.uit, /Sporen nu .*auth\.audit_log_entries/, 'het overzicht ziet de regels in het auditlogboek niet');
  assert.equal(await tel('select count(*) as n from public.households where id = $1', [h]), 1, 'zonder bevestiging is het huishouden toch weg');
  assert.equal(await tel('select count(*) as n from auth.users where id = $1', [anna.id]), 1);

  const ja = await script(['--soort', 'huishouden', '--adres', anna.email], bevestig(anna.email));
  assert.equal(ja.code, 0, ja.uit);
  assert.match(ja.uit, /NIETS MEER AANWEZIG/);
  assert.match(ja.uit, /Register \(zonder persoonsgegevens\): \d{4}-\d\d-\d\d, heel huishouden, 1 huishouden\(s\) en 1 account\(s\)/);
  assert.doesNotMatch(ja.uit.split('Register')[1], /@/, 'de registerregel bevat een adres');
  // Weg: het huishouden met alle inhoud, het account, de testerslijst, de codes, de tellers, de bestanden.
  assert.equal(await tel('select count(*) as n from public.households where id = $1', [h]), 0);
  assert.equal(await tel('select count(*) as n from auth.users where id = $1', [anna.id]), 0);
  for (const t of ['events', 'event_details', 'tasks', 'shopping_items', 'trips', 'trip_packing_items', 'trip_packing_lists', 'plans', 'plan_sections',
    'possessions', 'documents', 'document_links', 'household_members', 'household_invites']) {
    assert.equal(await tel(`select count(*) as n from public.${t} where household_id = $1`, [h]), 0, `nog rijen in ${t}`);
  }
  assert.equal(await tel(`select count(*) as n from storage.objects where bucket_id = '${BUCKET}' and name like $1::text || '/%'`, [h]), 0);
  assert.equal(await tel('select count(*) as n from private.testers where email = $1', [anna.email]), 0);
  assert.equal(await tel('select count(*) as n from private.k1_accounts where adres_hmac = $1', [hashAnna]), 0);
  assert.equal(await tel('select count(*) as n from private.k1_codes where adres_hmac = $1 or user_id = $2', [hashAnna, anna.id]), 0);
  // Bram: het account blijft (geen eigen verzoek), zonder huishouden.
  assert.equal(await tel('select count(*) as n from auth.users where id = $1', [bram.id]), 1, 'het account van de partner is weg zonder eigen verzoek');
  assert.equal(await tel('select count(*) as n from public.household_members where user_id = $1', [bram.id]), 0);
  // Het andere huishouden: precies zoals het was; alleen de uitnodiging naar Anna is ingetrokken en zonder adres.
  assert.equal(await foto(g, { zonder: ['public.household_invites', 'private.uitnodigingsmails'] }), voorG, 'een ander huishouden is veranderd');
  assert.equal(await tel(`select count(*) as n from public.household_invites where household_id = $1 and invited_email is null and revoked_at is not null`, [g]), 1);
  // Een andere tester en zijn tellers blijven.
  assert.equal(await tel('select count(*) as n from private.testers where email = $1', [adresVan('ander')]), 1, 'een andere tester is weg');
  assert.equal(await tel('select count(*) as n from private.k1_accounts where adres_hmac = $1', [adresHash(K1_PEPPER, adresVan('ander'))]), 1);

  // Tegenproeven: per soort een opzettelijk achtergelaten rij laat de controle falen.
  const plan = { soort: 'huishouden', accounts: [{ id: anna.id }], huishoudens: [{ id: h }], adressen: [anna.email], hashes: [hashAnna],
    spullen: [{ soort: 'huishouden', huishouden: h, bestanden: 0 }] };
  assert.deepEqual((await controleer(db, plan)).fouten, [], 'de controle faalt al zonder achtergelaten rij');
  const tegen = [
    ['adres', `insert into private.testers (email) values ('${anna.email}')`, `delete from private.testers where email = '${anna.email}'`, /private\.testers: nog 1 rij\(en\) met het adres/],
    ['hash', `insert into private.k1_accounts (adres_hmac) values ('${hashAnna}')`, `delete from private.k1_accounts where adres_hmac = '${hashAnna}'`, /private\.k1_accounts: nog 1 rij\(en\) met de hash van het adres/],
    ['account-id', `insert into private.k1_codes (adres_hmac, user_id, soort, code_hmac, token_hash_enc, verloopt) values (repeat('b', 64), '${anna.id}', 'email', repeat('c', 64), 'x', now())`,
      `delete from private.k1_codes where user_id = '${anna.id}'`, /private\.k1_codes: nog 1 rij\(en\) met een account-id/],
    ['huishouden-id', `insert into private.household_channels (household_id, epoch) values ('${h}', 3)`, `delete from private.household_channels where household_id = '${h}'`,
      /private\.household_channels: nog 1 rij\(en\) met een huishouden-id/],
    ['auditlogboek', `insert into auth.audit_log_entries (id, payload, created_at, ip_address) values (gen_random_uuid(), jsonb_build_object('traits', jsonb_build_object('user_email', '${anna.email.toUpperCase()}')), now(), '')`,
      `delete from auth.audit_log_entries where payload->'traits'->>'user_email' = '${anna.email.toUpperCase()}'`, /auth\.audit_log_entries: nog 1 rij\(en\) met het adres/],
  ];
  for (const [naam, zet, weg, verwacht] of tegen) {
    await db.query(zet);
    try {
      const f = (await controleer(db, plan)).fouten;
      assert.ok(f.some(x => verwacht.test(x)), `tegenproef ${naam}: niet gemeld: ${JSON.stringify(f)}`);
    } finally { await db.query(weg); }
  }
  // Een achtergelaten bestand onder het verwijderde huishouden.
  const wees = `${h}/${randomUUID()}/origineel`;
  ok(await admin.storage.from(BUCKET).upload(wees, PDF, { contentType: 'application/pdf' }));
  try {
    const f = (await controleer(db, plan, { wachtMs: 0 })).fouten;
    assert.ok(f.some(x => /bestand\(en\) in Storage/.test(x)) && f.some(x => /storage\.objects: nog 1 rij\(en\) met een huishouden-id/.test(x)),
      'achtergelaten bestand niet gemeld: ' + JSON.stringify(f));
  } finally { await admin.storage.from(BUCKET).remove([wees]); }
  assert.deepEqual((await controleer(db, plan)).fouten, [], 'na de tegenproeven is de stand niet terug');
});

test('(b) een partner vraagt om alleen het eigen account: persoonlijk weg, gedeeld blijft; tegenproef', async () => {
  const carla = await account('carla'), dirk = await account('dirk');
  const h = await huishouden(carla, 'Carla'); await erbij(carla, h, dirk, 'Dirk');
  const mc = await lid(carla, h), md = await lid(dirk, h);
  const c = await inhoud(h, mc, 'Carla'), d = await inhoud(h, md, 'Dirk');
  const dirkPriv = await spulMetDocument(dirk, h, 'private'), dirkGedeeld = await spulMetDocument(dirk, h, 'household');
  const carlaPriv = await spulMetDocument(carla, h, 'private');
  const hashDirk = await restenBijAdres(dirk.email, dirk.id);

  const r = await script(['--soort', 'account', '--adres', dirk.email], bevestig(dirk.email));
  assert.equal(r.code, 0, r.uit);
  assert.match(r.uit, /HUISHOUDEN BLIJFT: "Carla[^"]*" .*verdwijnen: 1 privé-afspraak\/-afspraken, 1 persoonlijk\(e\) spul\(len\), 1 persoonlijk\(e\) document\(en\)/);
  assert.match(r.uit, /NIETS MEER AANWEZIG/);
  assert.equal(await tel('select count(*) as n from auth.users where id = $1', [dirk.id]), 0);
  // Persoonlijk weg; gedeeld blijft; Carla ongemoeid.
  assert.equal(await tel('select count(*) as n from public.events where id = $1', [d.prive]), 0, 'de privé-afspraak van Dirk is er nog');
  assert.equal(await tel('select count(*) as n from public.events where id = any($1::uuid[])', [[d.gedeeld, c.prive, c.gedeeld]]), 3);
  assert.ok(!(await bestaat(dirkPriv.pad)) && await bestaat(dirkGedeeld.pad) && await bestaat(carlaPriv.pad));
  assert.equal(await tel('select count(*) as n from public.trips where id = any($1::uuid[])', [[c.trip, d.trip]]), 2);
  assert.equal(await tel('select count(*) as n from public.plans where id = any($1::uuid[])', [[c.plan, d.plan]]), 2);
  assert.equal(await tel('select count(*) as n from public.household_members where id = $1 and user_id is null', [md]), 1, 'het lid Dirk blijft, zonder account');
  assert.equal(await tel(`select count(*) as n from storage.objects where owner_id = $1 or owner = $2::uuid`, [dirk.id, dirk.id]), 0);
  assert.equal(await tel('select count(*) as n from auth.users where id = $1', [carla.id]), 1);

  // Tegenproef: een achtergelaten code met de account-id (k1_codes heeft bewust geen verwijzing naar auth.users).
  const plan = { soort: 'account', accounts: [{ id: dirk.id }], huishoudens: [], adressen: [dirk.email], hashes: [hashDirk],
    spullen: [{ soort: 'account', account: dirk.id, persoonlijkeDocumenten: [{ id: dirkPriv.doc, pad: dirkPriv.pad }], persoonlijkeSpullen: [dirkPriv.spul], huishoudens: [h] }] };
  assert.deepEqual((await controleer(db, plan, { wachtMs: 0 })).fouten, []);
  await db.query(`insert into private.k1_codes (adres_hmac, user_id, soort, code_hmac, token_hash_enc, verloopt) values (repeat('d', 64), $1, 'email', repeat('e', 64), 'x', now())`, [dirk.id]);
  try {
    const f = (await controleer(db, plan, { wachtMs: 0 })).fouten;
    assert.ok(f.some(x => /private\.k1_codes: nog 1 rij\(en\) met een account-id/.test(x)), 'achtergelaten code niet gemeld: ' + JSON.stringify(f));
  } finally { await db.query('delete from private.k1_codes where user_id = $1', [dirk.id]); }
});

test('weigeringen: de database zou weigeren, of de pepper klopt niet: er wordt niets verwijderd', async () => {
  const eva = await account('eva'), finn = await account('finn');
  const h = await huishouden(eva, 'Eva'); await erbij(eva, h, finn, 'Finn');
  await inhoud(h, await lid(eva, h), 'Eva');
  await restenBijAdres(eva.email, eva.id);
  const voor = await foto(h);
  // (b) voor de enige eigenaar met een ander account: de database weigert, dus het script ook (vóór de bevestiging).
  const r = await script(['--soort', 'account', '--adres', eva.email], bevestig(eva.email));
  assert.equal(r.code, 3, r.uit);
  assert.match(r.uit, /WEIGERING: het account is de enige eigenaar van "Eva/);
  assert.doesNotMatch(r.uit, /Typ precies/);
  // Een verkeerde pepper (er is een recente code om aan te toetsen).
  const p = await new Promise(res => {
    const c = spawn(process.execPath, [SCRIPT, '--soort', 'huishouden', '--adres', eva.email],
      { env: { ...process.env, KG_OMGEVING: 'lokaal', KG_DB_URL: DB_URL, KG_PEPPER: 'verkeerd' } });
    let uit = ''; c.stdout.on('data', x => { uit += x; }); c.on('close', code => res({ code, uit })); c.stdin.end(bevestig(eva.email));
  });
  assert.equal(p.code, 3, p.uit);
  assert.match(p.uit, /WEIGERING: de pepper klopt niet/);
  // Een online omgeving zonder vastgelegd kenmerk of met een lokale verbinding: geweigerd vóór verbinden.
  const o = await new Promise(res => {
    const c = spawn(process.execPath, [SCRIPT, '--soort', 'account', '--adres', eva.email],
      { env: { ...process.env, KG_OMGEVING: 'beta', KG_DB_URL: DB_URL, KG_REF: 'abcdefghijklmnopqrst', PGPASSWORD: 'x', KG_PEPPER: K1_PEPPER } });
    let uit = ''; c.stdout.on('data', x => { uit += x; }); c.on('close', code => res({ code, uit })); c.stdin.end('');
  });
  assert.equal(o.code, 2, o.uit);
  assert.match(o.uit, /GEWEIGERD vóór verbinden/);
  assert.equal(await foto(h), voor, 'na een weigering is er iets veranderd');
  assert.equal(await tel('select count(*) as n from auth.users where id = any($1::uuid[])', [[eva.id, finn.id]]), 2);
  assert.equal(await tel('select count(*) as n from private.testers where email = $1', [eva.email]), 1);
});

test('alleen een adres (nooit ingelogd): testerslijst, tellers en uitnodigingen weg; niets anders geraakt', async () => {
  const gert = await account('gert');
  const g = await huishouden(gert, 'Gert');
  const adres = adresVan('nieuw');
  const hash = await restenBijAdres(adres, null);
  ok(await gert.c.rpc('create_invite', { p_household: g, p_email: adres }));
  const voor = await foto(g, { zonder: ['public.household_invites', 'private.uitnodigingsmails'] });
  const r = await script(['--soort', 'account', '--adres', adres], bevestig(adres));
  assert.equal(r.code, 0, r.uit);
  assert.match(r.uit, /geen account bij dit adres/);
  assert.equal(await tel('select count(*) as n from private.testers where email = $1', [adres]), 0);
  assert.equal(await tel('select count(*) as n from private.k1_accounts where adres_hmac = $1', [hash]), 0);
  assert.equal(await tel('select count(*) as n from public.household_invites where invited_email = $1', [adres]), 0);
  assert.equal(await foto(g, { zonder: ['public.household_invites', 'private.uitnodigingsmails'] }), voor);
  // De controle zoekt echt: vóór het opruimen vond dezelfde zoektocht de sporen.
  const z = await zoekResten(db, [{ soort: 'account', waarde: gert.id }]);
  assert.ok(z.treffers.some(t => t.tabel === 'auth.users') && z.treffers.some(t => t.tabel === 'public.household_members') && z.tabellen >= 20, JSON.stringify(z));
  assert.deepEqual(z.onleesbaar, []);
});

test('het overzicht is alleen lezend', async () => {
  const hans = await account('hans');
  const h = await huishouden(hans, 'Hans');
  await inhoud(h, await lid(hans, h), 'Hans');
  const voor = await foto(h);
  const p = await leesVerzoek(db, { soort: 'huishouden', adres: hans.email }, K1_PEPPER);
  assert.equal(p.huishoudens[0].id, h);
  assert.ok(p.huishoudens[0].aantallen['public.events'] >= 2);
  assert.equal(await foto(h), voor);
  assert.equal(await tel('select count(*) as n from auth.users where id = $1', [hans.id]), 1);
});
