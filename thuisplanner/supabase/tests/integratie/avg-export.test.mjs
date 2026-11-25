// AVG-inzage (docs/thuisplanner-beta-voorbereiding.md §5.4): staging/avg-export.sql tegen een LOKALE Supabase-stack.
// De query loopt in een alleen-lezende transactie (zoals in de SQL-editor, maar daar zonder die bescherming: de query
// moet dus zelf niets schrijven). Getoetst: alle domeinen staan erin (huishoudens, eigen en gedeelde afspraken, taken,
// boodschappen, vakanties met paklijsten, spullen, documenten, plannen), en NOOIT meer dan het account in de app mag
// zien: geen privé-afspraak, persoonlijk spul of persoonlijk document van een ander, geen ander huishouden, geen
// account-id's, adressen, hashes of tokens van anderen.
// Tegenproeven: een variant van de query zonder de privacyfilter, of met een ander huishouden erbij, laat de toetsen falen.
//
//   API_URL=... ANON_KEY=... SERVICE_ROLE_KEY=... DB_URL=... node --test avg-export.test.mjs
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { createClient } from '@supabase/supabase-js';

const { API_URL, ANON_KEY, SERVICE_ROLE_KEY, DB_URL } = process.env;
for (const [k, v] of Object.entries({ API_URL, ANON_KEY, SERVICE_ROLE_KEY, DB_URL })) if (!v) throw new Error(k + ' ontbreekt: start via run.sh');
for (const u of [API_URL, DB_URL]) if (!/\/\/([^@/]*@)?(127\.0\.0\.1|localhost)[:/]/.test(u)) throw new Error('Weigering: alleen een lokale Supabase');

const SQL = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '../../staging/avg-export.sql'), 'utf8');
const PLEK = "'VUL-HIER-HET-ADRES-IN'";   // de waarde in de query (in het commentaar staat de plek zonder aanhalingstekens)
const opties = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(API_URL, SERVICE_ROLE_KEY, opties);
const run = randomUUID().slice(0, 8);
const wachtwoord = 'Test-' + randomUUID();
const ok = ({ data, error }) => { assert.ifError(error); return data; };
const accounts = [], huishoudens = [];
let db;

before(async () => { db = new pg.Client({ connectionString: DB_URL }); await db.connect(); });
after(async () => {
  if (huishoudens.length) await db.query('delete from public.households where id = any($1::uuid[])', [huishoudens]);
  for (const id of accounts) await db.query('delete from auth.users where id = $1', [id]).catch(() => {});
  await db?.end();
});

async function account(naam) {
  const email = `${naam}-${run}@test.invalid`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: wachtwoord, email_confirm: true });
  assert.ifError(error);
  accounts.push(data.user.id);
  const c = createClient(API_URL, ANON_KEY, opties);
  ok(await c.auth.signInWithPassword({ email, password: wachtwoord }));
  return { id: data.user.id, email, c };
}
async function huishouden(eigenaar, naam) {
  const h = ok(await eigenaar.c.rpc('create_household', { p_name: naam + ' ' + run, p_display_name: naam }));
  huishoudens.push(h);
  return h;
}
const lid = async (wie, h) => ok(await wie.c.rpc('my_memberships')).find(m => m.household_id === h).member_id;

/** Een afspraak, spul en document per zichtbaarheid, en de rest van de domeinen, met een herkenbare tekst. */
async function inhoud(h, m, naam) {
  for (const zicht of ['private', 'household']) {
    const id = randomUUID();
    await db.query(`insert into public.events (id, household_id, owner_member_id, visibility, start_date) values ($1, $2, $3, $4, current_date)`, [id, h, m, zicht]);
    await db.query(`insert into public.event_details (event_id, household_id, title, notes) values ($1, $2, $3, $4)`, [id, h, `Afspraak-${zicht}-${naam}-${run}`, 'notitie']);
    const spul = randomUUID(), doc = randomUUID();
    await db.query(`insert into public.possessions (id, household_id, name, owner_member_id, visibility) values ($1, $2, $3, $4, $5)`, [spul, h, `Spul-${zicht}-${naam}-${run}`, m, zicht]);
    await db.query(`insert into public.documents (id, household_id, title, kind, owner_member_id, mime, size_bytes, visibility)
      values ($1, $2, $3, 'factuur', $4, 'application/pdf', 10, $5)`, [doc, h, `Document-${zicht}-${naam}-${run}`, m, zicht]);
    await db.query(`insert into public.document_links (household_id, document_id, possession_id) values ($1, $2, $3)`, [h, doc, spul]);
  }
  const trip = randomUUID(), plan = randomUUID();
  await db.query(`insert into public.tasks (household_id, title) values ($1, $2)`, [h, `Taak-${naam}-${run}`]);
  await db.query(`insert into public.shopping_items (household_id, name) values ($1, $2)`, [h, `Boodschap-${naam}-${run}`]);
  await db.query(`insert into public.trips (id, household_id, name) values ($1, $2, $3)`, [trip, h, `Vakantie-${naam}-${run}`]);
  await db.query(`insert into public.trip_packing_lists (household_id, trip_id, name) values ($1, $2, $3)`, [h, trip, `Lijst-${naam}`]);
  await db.query(`insert into public.trip_packing_items (household_id, trip_id, member_id, name) values ($1, $2, $3, $4)`, [h, trip, m, `Inpak-${naam}-${run}`]);
  await db.query(`insert into public.plans (id, household_id, title) values ($1, $2, $3)`, [plan, h, `Plan-${naam}-${run}`]);
  await db.query(`insert into public.plan_sections (household_id, plan_id, name) values ($1, $2, $3)`, [h, plan, `Onderdeel-${naam}`]);
}

/** De query zoals de producteigenaar hem uitvoert, in een alleen-lezende transactie. */
async function exporteer(adres, sql = SQL) {
  assert.equal(sql.split(PLEK).length, 2, 'de plek voor het adres staat er niet precies één keer in');
  await db.query('begin transaction read only');
  try {
    const r = await db.query(sql.replace(PLEK, "'" + adres.replace(/'/g, "''") + "'"));
    assert.equal(r.rows.length, 1);
    return { tekst: r.rows[0].avg_export, json: JSON.parse(r.rows[0].avg_export) };
  } finally { await db.query('rollback'); }
}

let anna, bram, gijs, h, g;
/** De privacytoetsen: wat van een ander is, of buiten de huishoudens van het account, staat er niet in. */
function privacyFouten(tekst) {
  const f = [];
  for (const s of [`Afspraak-private-Bram-${run}`, `Spul-private-Bram-${run}`, `Document-private-Bram-${run}`]) if (tekst.includes(s)) f.push('privé van een ander: ' + s);
  for (const s of [`Afspraak-household-Gijs-${run}`, `Taak-Gijs-${run}`, `Plan-Gijs-${run}`, g]) if (tekst.includes(s)) f.push('ander huishouden: ' + s);
  for (const s of [bram.email, bram.id, gijs.email, gijs.id, anna.id]) if (tekst.includes(s)) f.push('account-id of adres: ' + s);
  if (/[0-9a-f]{64}/.test(tekst)) f.push('een hash of token');
  return f;
}

test('de kopie bevat alle domeinen van het account, en niets wat het account in de app niet mag zien', async () => {
  anna = await account('anna'); bram = await account('bram'); gijs = await account('gijs');
  h = await huishouden(anna, 'Anna');
  ok(await bram.c.rpc('accept_invite', { p_token: ok(await anna.c.rpc('create_invite', { p_household: h })), p_display_name: 'Bram' }));
  g = await huishouden(gijs, 'Gijs');
  await inhoud(h, await lid(anna, h), 'Anna'); await inhoud(h, await lid(bram, h), 'Bram'); await inhoud(g, await lid(gijs, g), 'Gijs');
  ok(await gijs.c.rpc('create_invite', { p_household: g, p_email: anna.email }));   // een open uitnodiging aan Anna
  ok(await anna.c.rpc('create_invite', { p_household: h, p_email: `oma-${run}@test.invalid` }));
  await db.query('insert into private.testers (email) values ($1)', [anna.email]);

  const { tekst, json } = await exporteer(anna.email.toUpperCase());
  assert.equal(json.account.adres, anna.email);
  assert.equal(json.op_de_testerslijst, true);
  assert.equal(json.huishoudens.length, 1);
  const x = json.huishoudens[0];
  assert.equal(x.mijn_rol, 'owner');
  assert.deepEqual(x.leden.map(l => l.naam).sort(), ['Anna', 'Bram']);
  const titels = x.afspraken.map(a => a.titel).sort();
  assert.deepEqual(titels, [`Afspraak-household-Anna-${run}`, `Afspraak-household-Bram-${run}`, `Afspraak-private-Anna-${run}`]);
  assert.deepEqual(x.spullen.map(s => s.name).sort(), [`Spul-household-Anna-${run}`, `Spul-household-Bram-${run}`, `Spul-private-Anna-${run}`]);
  assert.deepEqual(x.documenten.map(s => s.title).sort(), [`Document-household-Anna-${run}`, `Document-household-Bram-${run}`, `Document-private-Anna-${run}`]);
  assert.ok(x.documenten.every(d => d.bij_spullen?.length === 1));
  assert.deepEqual(x.taken.map(t => t.title).sort(), [`Taak-Anna-${run}`, `Taak-Bram-${run}`]);
  assert.deepEqual(x.boodschappen.map(t => t.name).sort(), [`Boodschap-Anna-${run}`, `Boodschap-Bram-${run}`]);
  assert.equal(x.vakanties.length, 2);
  assert.ok(x.vakanties.every(v => v.paklijsten.length === 1 && v.inpakken.length === 1));
  assert.equal(x.plannen.length, 2);
  assert.ok(x.plannen.every(p => p.onderdelen.length === 1));
  assert.equal(x.uitnodigingen_die_ik_maakte.filter(u => u.met_adres).length, 1);
  assert.equal(json.open_uitnodigingen_aan_dit_adres.length, 1);
  assert.equal(json.open_uitnodigingen_aan_dit_adres[0].huishouden, `Gijs ${run}`);
  assert.ok(!tekst.includes(`oma-${run}@test.invalid`), 'het adres van een ander (uitnodiging) staat erin');
  assert.deepEqual(privacyFouten(tekst), []);

  // De partner ziet het gedeelde, en alleen de eigen privé-dingen.
  const b = (await exporteer(bram.email)).json.huishoudens[0];
  assert.deepEqual(b.afspraken.map(a => a.titel).sort(), [`Afspraak-household-Anna-${run}`, `Afspraak-household-Bram-${run}`, `Afspraak-private-Bram-${run}`]);
  assert.ok(!JSON.stringify(b).includes(`Spul-private-Anna-${run}`));
});

test('tegenproeven: zonder de privacyfilter, of met een ander huishouden, falen de toetsen', async () => {
  const zonderAfspraakfilter = SQL.replace("where e.visibility = 'household' or e.owner_member_id = l.lid_id", 'where true');
  const zonderSpulfilter = SQL.replace("(p.visibility = 'household' or p.owner_member_id = l.lid_id)", 'true');
  const zonderDocfilter = SQL.replace("(d.visibility = 'household' or d.owner_member_id = l.lid_id)", 'true');
  const metAnderHuishouden = SQL.replace("where m.status = 'active'\n),", "where m.status = 'active'\n  union all select household_id, id, role, display_name from public.household_members where household_id = '" + g + "'\n),");
  for (const [naam, sql] of [['afspraken', zonderAfspraakfilter], ['spullen', zonderSpulfilter], ['documenten', zonderDocfilter], ['ander huishouden', metAnderHuishouden]]) {
    assert.notEqual(sql, SQL, `tegenproef ${naam}: de sabotage vond zijn plek niet`);
    const { tekst } = await exporteer(anna.email, sql);
    assert.ok(privacyFouten(tekst).length > 0, `tegenproef ${naam}: de privacytoets merkte niets`);
  }
});

test('geen account bij het adres; en de query schrijft niets', async () => {
  const { json } = await exporteer(`niemand-${run}@test.invalid`);
  assert.equal(json.account, null);
  assert.match(json.opmerking, /geen account/);
  assert.deepEqual(json.huishoudens, []);
  // Alleen select: geen schrijfopdracht in de tekst (de alleen-lezende transactie hierboven is de echte toets).
  assert.doesNotMatch(SQL.replace(/--.*$/gm, ''), /\b(insert|update|delete|truncate|alter|create|drop|grant|perform)\b/i);
});
