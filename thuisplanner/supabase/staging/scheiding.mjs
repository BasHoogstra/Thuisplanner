#!/usr/bin/env node
// Thuisplanner, Access-poort (docs/thuisplanner-beta-voorbereiding.md §2.3, regel "Huishoudscheiding"; voorwaarde V7 van
// de besloten bèta): het API-scheidingsscript, met tegenproef.
//
// Wat het aantoont: met twee testhuishoudens (gezin A en gezin B, elk een eigenaar en een partner, verzonnen accounts op
// @test.invalid) ziet of wijzigt gezin A via directe API-verzoeken met een eigen sessie niets van gezin B: afspraken (en
// een privé-afspraak blijft "Bezet" voor de partner), taken, boodschappen, vakanties en paklijsten, leden,
// uitnodigingen, Mijn spullen en documenten (ook via een bekend pad, id of verlopen link) en Plannen. Realtime-seintjes
// bevatten geen inhoud, en het kanaal van B gaat voor A niet open.
//
// Hoe: het script maakt zijn eigen accounts en huishoudens aan en ruimt ze aan het eind altijd weer op (ook na een fout),
// en controleert daarna dat er niets van is achtergebleven. De sessies zijn echte codesessies (amr "otp", een bestaande
// session_id), gemaakt met een eenmalige inloglink van Supabase Auth (generateLink). Daarbij gaat er geen mail uit. Elke
// sessie moet eerst door de toegangspoort (mijn_toegang = ok), anders stopt het script. B's gegevens worden vóór en na
// alle pogingen van A vergeleken (met de service-rol, buiten RLS): er mag niets veranderd zijn.
//
// Omgevingen (thuisplanner/omgevingen.json). Alles wat niet precies klopt, wordt geweigerd vóór er verbinding is:
//   lokaal  een eigen lokale stack (supabase start); de waarden uit `supabase status -o env`:
//           KG_OMGEVING=lokaal API_URL=… ANON_KEY=… SERVICE_ROLE_KEY=… DB_URL=… node scheiding.mjs
//   beta    alleen het kenmerk dat in omgevingen.json bij beta staat (nooit een ander kenmerk, nooit Huisplan):
//           KG_OMGEVING=beta KG_REF=<kenmerk> KG_DB_URL=<session pooler zonder wachtwoord> PGPASSWORD=… \
//           KG_ANON_KEY=<publieke sleutel> KG_GEHEIME_SLEUTEL=<service-rol of sb_secret_> node scheiding.mjs
//           De sleutels en het wachtwoord alleen in de omgeving van dit ene proces; het script toont ze nooit.
//   Staging (echte gezinsgegevens van de gezinsbèta) en productie worden altijd geweigerd.
//
// Tegenproeven (het script moet dan falen; het meldt "TEGENPROEF GESLAAGD" als dat zo is, en eindigt dan met 0):
//   --tegenproef sessie   de "partner van A" gebruikt opzettelijk de sessie van de partner van B
//   --tegenproef beleid   alleen lokaal: tijdelijk een te ruime leesregel op taken en op de documentenbucket
//
//   node scheiding.mjs zelftest    alleen de weigeringen, zonder netwerk
//
// Uitkomst: 0 = geslaagd (of tegenproef gefaald zoals bedoeld), 1 = een controle faalde (of de tegenproef zag niets),
// 2 = geweigerd vóór verbinden.
import { createHash, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isHuisplanRef, leesOmgevingen, omgevingFouten, supabaseRoots, verbindingFouten } from './verbinding-controle.mjs';

const HIER = path.dirname(fileURLToPath(import.meta.url));
const BUCKET = 'documenten';
const SEINTJE_SLEUTELS = ['id', 'op', 't', 'v'];

// ---------------------------------------------------------------------------------------------
// 1. Weigeren vóór verbinden
// ---------------------------------------------------------------------------------------------
const LOKALE_API = /^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/;
const LOKALE_DB = /^postgres(ql)?:\/\/[^@/]*@(127\.0\.0\.1|localhost):\d+\/postgres$/;

/** De claims van een JWT-sleutel, of null als het geen JWT is. */
export function jwtClaims(sleutel) {
  const d = String(sleutel || '').split('.');
  if (d.length !== 3) return null;
  try { return JSON.parse(Buffer.from(d[1], 'base64url').toString('utf8')); } catch { return null; }
}

/** Staat er ergens een Huisplan-kenmerk in deze tekst (elk stuk van 20 kleine letters)? */
export function noemtHuisplan(tekst, isHuisplan = isHuisplanRef) {
  for (const m of String(tekst || '').matchAll(/[a-z]{20,}/g)) {
    for (let i = 0; i + 20 <= m[0].length; i++) if (isHuisplan(m[0].slice(i, i + 20))) return true;
  }
  return false;
}

/** Fouten in een API-sleutel (soort 'publiek' of 'geheim'). ref = het verwachte kenmerk, of null (lokaal). */
export function sleutelFouten(soort, sleutel, ref, naam) {
  const f = [];
  if (!sleutel) return [`${naam} is niet gezet.`];
  const claims = jwtClaims(sleutel);
  if (soort === 'publiek') {
    if (sleutel.startsWith('sb_secret_') || claims?.role === 'service_role') f.push(`${naam} is een geheime sleutel; hier hoort de publieke.`);
    else if (!sleutel.startsWith('sb_publishable_') && claims?.role !== 'anon') f.push(`${naam} is geen publieke sleutel (sb_publishable_… of een anon-JWT).`);
  } else if (!sleutel.startsWith('sb_secret_') && claims?.role !== 'service_role') {
    f.push(`${naam} is geen geheime sleutel (sb_secret_… of een service_role-JWT).`);
  }
  // Een JWT-sleutel noemt zijn project: dat moet precies het verwachte zijn (online), of geen project (lokaal).
  if (claims && ref && claims.ref !== ref) f.push(`${naam} hoort bij een ander project dan KG_REF.`);
  if (claims && !ref && claims.ref) f.push(`${naam} hoort bij een online project; lokaal hoort een lokale sleutel.`);
  return f;
}

/**
 * Wat er nodig is om te verbinden, of de fouten. Leeg fouten = in orde. Pure functie (zonder netwerk), zodat de
 * zelftest elke weigering kan nalopen.
 */
export function configuratie(env, { omgevingen = leesOmgevingen(), isHuisplan = isHuisplanRef, tegenproef = null } = {}) {
  const f = [];
  const omgeving = env.KG_OMGEVING;
  let c = null;
  if (omgeving === 'lokaal') {
    if (env.KG_REF) f.push('KG_REF is gezet: lokaal hoort geen online kenmerk.');
    if (!LOKALE_API.test(env.API_URL || '')) f.push('API_URL moet een lokale stack zijn (http://127.0.0.1:<poort>).');
    if (!LOKALE_DB.test(env.DB_URL || '')) f.push('DB_URL moet een lokale database zijn (127.0.0.1 of localhost).');
    f.push(...sleutelFouten('publiek', env.ANON_KEY, null, 'ANON_KEY'), ...sleutelFouten('geheim', env.SERVICE_ROLE_KEY, null, 'SERVICE_ROLE_KEY'));
    c = { omgeving, api: String(env.API_URL || '').replace(/\/$/, ''), db: env.DB_URL, publiek: env.ANON_KEY, geheim: env.SERVICE_ROLE_KEY, lokaal: true };
  } else if (omgeving === 'beta') {
    const ref = env.KG_REF;
    f.push(...omgevingFouten('beta', ref, omgevingen));
    if (ref && isHuisplan(ref)) f.push('KG_REF is een Huisplan-project.');
    f.push(...verbindingFouten(env.KG_DB_URL, ref, env.PGPASSWORD));
    const api = `https://${ref}.supabase.co`;
    if (env.KG_API_URL && env.KG_API_URL.replace(/\/$/, '') !== api) f.push('KG_API_URL wijkt af van het adres van KG_REF; laat hem weg.');
    f.push(...sleutelFouten('publiek', env.KG_ANON_KEY, ref, 'KG_ANON_KEY'), ...sleutelFouten('geheim', env.KG_GEHEIME_SLEUTEL, ref, 'KG_GEHEIME_SLEUTEL'));
    if (tegenproef === 'beleid') f.push('De tegenproef "beleid" wijzigt het schema en mag alleen lokaal; online alleen --tegenproef sessie.');
    c = { omgeving, ref, api, db: env.KG_DB_URL, publiek: env.KG_ANON_KEY, geheim: env.KG_GEHEIME_SLEUTEL, lokaal: false };
  } else if (omgeving === 'staging') {
    f.push('Staging bevat echte gegevens van de gezinsbèta: dit script draait daar niet (alleen lokaal of beta).');
  } else if (omgeving === 'productie') {
    f.push('Productie: nooit. Dit script draait alleen lokaal of op de bèta, met verzonnen accounts.');
  } else {
    f.push(`KG_OMGEVING moet lokaal of beta zijn (niet ${JSON.stringify(omgeving ?? null)}).`);
  }
  // Nergens een Huisplan-kenmerk, ook niet in een adres of sleutel.
  for (const k of ['KG_REF', 'KG_DB_URL', 'KG_API_URL', 'KG_ANON_KEY', 'KG_GEHEIME_SLEUTEL', 'API_URL', 'DB_URL', 'ANON_KEY', 'SERVICE_ROLE_KEY']) {
    const w = env[k];
    if (noemtHuisplan(w, isHuisplan)) f.push(`${k} noemt een Huisplan-project.`);
    const claims = jwtClaims(w);
    if (claims?.ref && isHuisplan(claims.ref)) f.push(`${k} is een sleutel van een Huisplan-project.`);
  }
  if (tegenproef && !['sessie', 'beleid'].includes(tegenproef)) f.push('--tegenproef moet sessie of beleid zijn.');
  return { fouten: [...new Set(f)], config: f.length ? null : c };
}

// ---------------------------------------------------------------------------------------------
// 2. Zelftest (zonder netwerk): elke weigering, met een tegenproef dat de goede invoer wél door komt
// ---------------------------------------------------------------------------------------------
function zelftest() {
  const BETA = 'bbbbbbbbbbbbbbbbbbbb', STAGING = 'sssssssssssssssssssss'.slice(0, 20), HUISPLAN = 'hhhhhhhhhhhhhhhhhhhh', ANDER = 'aaaaaaaaaaaaaaaaaaaa';
  const omgevingen = { staging: { supabaseRef: STAGING }, beta: { supabaseRef: BETA }, productie: { supabaseRef: null } };
  const isHuisplan = r => r === HUISPLAN;
  const jwt = claims => `x.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.y`;
  const goedBeta = {
    KG_OMGEVING: 'beta', KG_REF: BETA, KG_DB_URL: `postgresql://postgres.${BETA}@aws-1-eu-central-1.pooler.supabase.com:5432/postgres`,
    PGPASSWORD: 'x', KG_ANON_KEY: 'sb_publishable_abc', KG_GEHEIME_SLEUTEL: 'sb_secret_abc',
  };
  const goedLokaal = {
    KG_OMGEVING: 'lokaal', API_URL: 'http://127.0.0.1:56801', DB_URL: 'postgresql://postgres:postgres@127.0.0.1:56802/postgres',
    ANON_KEY: jwt({ role: 'anon' }), SERVICE_ROLE_KEY: jwt({ role: 'service_role' }),
  };
  const toets = (env, opties = {}) => configuratie(env, { omgevingen, isHuisplan, ...opties }).fouten;
  const gevallen = [
    ['goede bèta wordt aangenomen', toets(goedBeta), false],
    ['goede lokale stack wordt aangenomen', toets(goedLokaal), false],
    ['bèta met het stagingkenmerk', toets({ ...goedBeta, KG_REF: STAGING, KG_DB_URL: goedBeta.KG_DB_URL.replace(BETA, STAGING) }), true],
    ['bèta met een ander kenmerk', toets({ ...goedBeta, KG_REF: ANDER, KG_DB_URL: goedBeta.KG_DB_URL.replace(BETA, ANDER) }), true],
    ['bèta met een Huisplan-kenmerk', toets({ ...goedBeta, KG_REF: HUISPLAN, KG_DB_URL: goedBeta.KG_DB_URL.replace(BETA, HUISPLAN) }), true],
    ['bèta zonder vastgelegd kenmerk (zoals nu)', configuratie(goedBeta, { omgevingen: { ...omgevingen, beta: { supabaseRef: null } }, isHuisplan }).fouten, true],
    ['de databaseverbinding noemt een ander project', toets({ ...goedBeta, KG_DB_URL: goedBeta.KG_DB_URL.replace(BETA, ANDER) }), true],
    ['de databaseverbinding noemt Huisplan', toets({ ...goedBeta, KG_DB_URL: goedBeta.KG_DB_URL + `?x=${HUISPLAN}` }), true],
    ['een ander API-adres', toets({ ...goedBeta, KG_API_URL: `https://${ANDER}.supabase.co` }), true],
    ['de geheime sleutel als publieke sleutel', toets({ ...goedBeta, KG_ANON_KEY: 'sb_secret_abc' }), true],
    ['een sleutel van een ander project (JWT)', toets({ ...goedBeta, KG_GEHEIME_SLEUTEL: jwt({ role: 'service_role', ref: ANDER }) }), true],
    ['een sleutel van Huisplan (JWT)', toets({ ...goedBeta, KG_ANON_KEY: jwt({ role: 'anon', ref: HUISPLAN }) }), true],
    ['staging', toets({ ...goedBeta, KG_OMGEVING: 'staging', KG_REF: STAGING }), true],
    ['productie', toets({ ...goedBeta, KG_OMGEVING: 'productie' }), true],
    ['geen omgeving', toets({ ...goedBeta, KG_OMGEVING: undefined }), true],
    ['lokaal met een online API', toets({ ...goedLokaal, API_URL: `https://${BETA}.supabase.co` }), true],
    ['lokaal met een online database', toets({ ...goedLokaal, DB_URL: goedBeta.KG_DB_URL }), true],
    ['lokaal met een online sleutel', toets({ ...goedLokaal, SERVICE_ROLE_KEY: jwt({ role: 'service_role', ref: BETA }) }), true],
    ['lokaal met een kenmerk erbij', toets({ ...goedLokaal, KG_REF: BETA }), true],
    ['tegenproef beleid online', toets(goedBeta, { tegenproef: 'beleid' }), true],
    ['tegenproef beleid lokaal mag', toets(goedLokaal, { tegenproef: 'beleid' }), false],
  ];
  let fout = 0;
  for (const [naam, fouten, moetWeigeren] of gevallen) {
    // Bij een Huisplan-geval moet de weigering Huisplan ook echt noemen (niet alleen toevallig om een andere reden).
    const reden = /Huisplan/.test(naam) ? fouten.find(x => /Huisplan/.test(x)) : fouten[0];
    const goed = moetWeigeren ? Boolean(reden) : fouten.length === 0;
    if (!goed) fout++;
    console.log(`${goed ? 'ok  ' : 'FOUT'} ${naam}${fouten.length ? ` (geweigerd: ${reden ?? fouten[0]})` : ''}`);
  }
  // En met de echte omgevingen.json: een verzonnen kenmerk wordt altijd geweigerd (nu heeft de bèta nog geen kenmerk).
  const echt = configuratie({ ...goedBeta }, {}).fouten;
  console.log(`${echt.length ? 'ok  ' : 'FOUT'} met de echte omgevingen.json: ${echt.length ? 'geweigerd (' + echt[0] + ')' : 'aangenomen'}`);
  if (!echt.length) fout++;
  console.log(fout ? `ZELFTEST MISLUKT: ${fout} geval(len)` : `ZELFTEST GESLAAGD: ${gevallen.length} gevallen`);
  process.exit(fout ? 1 : 0);
}

// ---------------------------------------------------------------------------------------------
// 3. Hulp
// ---------------------------------------------------------------------------------------------
const wacht = ms => new Promise(r => setTimeout(r, ms));
const uitslagen = [];
/** Eén controle. ok moet true zijn; uitleg komt alleen bij een fout in beeld. */
function controle(id, ok, uitleg = '') {
  uitslagen.push({ id, ok: ok === true, uitleg: ok === true ? '' : uitleg });
}
/** Een controle die zelf een fout kan gooien: een uitzondering telt als gefaald. */
async function probeer(id, f) {
  try { const r = await f(); if (r !== undefined) controle(id, r === true, typeof r === 'string' ? r : 'niet in orde'); else controle(id, true); }
  catch (e) { controle(id, false, String(e?.message || e).slice(0, 200)); }
}
const zelfdeFout = r => (r.error ? null : r.data);

function abonneer(kanaal, ms = 10000) {
  return new Promise(resolve => {
    const t = setTimeout(() => resolve({ status: 'GEEN_ANTWOORD' }), ms);
    kanaal.subscribe((status, err) => { if (status === 'SUBSCRIBED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') { clearTimeout(t); resolve({ status, err }); } });
  });
}

// De tabellen (en views) met huishoudgegevens: [naam, idkolom, kolom om te wijzigen of null].
const TABELLEN = [
  ['households', 'id', 'name'], ['household_members', 'id', 'display_name'], ['household_invites', 'id', null],
  ['events', 'id', null], ['event_details', 'event_id', null], ['event_overview', 'id', null],
  ['event_participants', 'event_id', null], ['event_exceptions', 'series_id', null],
  ['tasks', 'id', 'title'], ['shopping_items', 'id', 'name'],
  ['trips', 'id', 'name'], ['trip_packing_lists', 'id', 'name'], ['trip_packing_items', 'id', 'name'], ['trip_shopping_links', 'id', 'deleted_at'],
  ['possessions', 'id', 'name'], ['documents', 'id', 'title'], ['document_links', 'id', 'deleted_at'],
  ['plans', 'id', 'title'], ['plan_sections', 'id', 'name'],
];
const huishoudKolom = t => (t === 'households' ? 'id' : 'household_id');

// ---------------------------------------------------------------------------------------------
// 4. De proef
// ---------------------------------------------------------------------------------------------
async function hoofd() {
  const args = process.argv.slice(2);
  if (args[0] === 'zelftest') return zelftest();
  const ti = args.indexOf('--tegenproef');
  const tegenproef = ti >= 0 ? (args[ti + 1] ?? '') : null;
  const { fouten, config: cfg } = configuratie(process.env, { tegenproef });
  console.log('omgeving: ' + (process.env.KG_OMGEVING ?? '(niet gezet)') + (tegenproef ? `, tegenproef: ${tegenproef}` : ''));
  if (fouten.length) { console.log('GEWEIGERD vóór verbinden:\n- ' + fouten.join('\n- ')); process.exit(2); }

  const require = createRequire(path.join(HIER, '../tests/integratie/package.json'));
  const { createClient } = require('@supabase/supabase-js');
  const { Client } = require('pg');
  const opties = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
  const admin = createClient(cfg.api, cfg.geheim, opties);
  const db = new Client(cfg.lokaal ? { connectionString: cfg.db, application_name: 'thuisplanner-scheiding' }
    : { connectionString: cfg.db, ssl: { rejectUnauthorized: true, ca: supabaseRoots() }, application_name: 'thuisplanner-scheiding' });
  await db.connect();
  const q = async (sql, p = []) => (await db.query(sql, p)).rows;

  const run = randomUUID().replace(/-/g, '').slice(0, 10);
  const adres = naam => `scheiding-${naam}-${run}@test.invalid`;
  const accounts = {};      // naam -> { id, email, c }
  const huishoudens = [];
  const testers = [];
  const kanalen = [];
  let tegenproefRegels = [];
  console.log(`run: ${run} (accounts scheiding-…-${run}@test.invalid)`);

  // De poort moet staan zoals online: geen wachtwoordsessies. (Lokaal wijzigt het script niets aan de schakelaars.)
  const [inst] = await q('select wachtwoordsessies_toegestaan, sessiecontrole, huishouden_open, onderhoud from private.instellingen where id = 1');
  console.log(`schakelaars: wachtwoordsessies ${inst.wachtwoordsessies_toegestaan}, sessiecontrole ${inst.sessiecontrole}, huishouden_open ${inst.huishouden_open}, onderhoud ${inst.onderhoud ?? 'leeg'}`);
  if (!cfg.lokaal && (inst.wachtwoordsessies_toegestaan || !inst.sessiecontrole || inst.onderhoud)) {
    console.log('GESTOPT: de toegangspoort staat niet zoals online hoort (nacontrole). Er is niets aangemaakt.'); await db.end(); process.exit(1);
  }

  try {
    // ---------- Accounts en sessies ----------
    async function account(naam) {
      const email = adres(naam);
      const { data, error } = await admin.auth.admin.createUser({ email, email_confirm: true });
      if (error) throw new Error(`account ${naam} aanmaken: ${error.message}`);
      accounts[naam] = { id: data.user.id, email };
      accounts[naam].c = await sessie(naam);
      return accounts[naam].c;
    }
    // Een echte codesessie: een eenmalige inloglink (geen mail), ingewisseld zoals de app een code inwisselt.
    async function sessie(naam) {
      const { data, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email: accounts[naam].email });
      if (error) throw new Error(`inloglink ${naam}: ${error.message}`);
      const c = createClient(cfg.api, cfg.publiek, opties);
      const v = await c.auth.verifyOtp({ token_hash: data.properties.hashed_token, type: 'magiclink' });
      if (v.error || !v.data.session) throw new Error(`sessie ${naam}: ${v.error?.message ?? 'geen sessie'}`);
      const t = (await c.rpc('mijn_toegang')).data;
      if (t !== 'ok') throw new Error(`sessie ${naam}: de toegangspoort geeft ${JSON.stringify(t)} in plaats van ok`);
      return c;
    }
    const rpc = async (c, fn, a) => { const r = await c.rpc(fn, a); if (r.error) throw new Error(`${fn}: ${r.error.message}`); return r.data; };
    const ok = (r, wat) => { if (r.error) throw new Error(`${wat}: ${r.error.message}`); return r.data; };

    for (const n of ['a1', 'a2', 'b1', 'b2']) await account(n);
    // De eigenaars mogen een huishouden maken (testpoort G1); alleen voor deze run, en aan het eind weer weg.
    for (const n of ['a1', 'b1']) {
      await q('insert into private.testers (email) values ($1) on conflict do nothing', [accounts[n].email]);
      testers.push(accounts[n].email);
    }
    // Zelfde project via API en database: de net gemaakte accounts staan in deze database.
    const [{ n: gevonden }] = await q('select count(*)::int as n from auth.users where id = any($1::uuid[])', [Object.values(accounts).map(a => a.id)]);
    if (gevonden !== 4) throw new Error('de API en de database horen niet bij hetzelfde project (accounts niet gevonden)');

    // ---------- Twee gezinnen met inhoud in elk domein ----------
    const PDF = Buffer.from('%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n');
    async function bevestig(c, id) {
      const { data: { session } } = await c.auth.getSession();
      const r = await fetch(`${cfg.api}/functions/v1/bevestig-upload`, {
        method: 'POST', headers: { apikey: cfg.publiek, Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ document_id: id }),
      });
      return r.status;
    }
    async function gezin(g) {
      const eig = accounts[g + '1'].c, par = accounts[g + '2'].c;
      const merk = `GEHEIM-${g.toUpperCase()}-${run}`;
      const x = { merk };
      x.h = await rpc(eig, 'create_household', { p_name: `Scheiding ${g.toUpperCase()} ${run}`, p_display_name: `Ouder ${g.toUpperCase()}1` });
      huishoudens.push(x.h);
      await rpc(par, 'accept_invite', { p_token: await rpc(eig, 'create_invite', { p_household: x.h }), p_display_name: `Ouder ${g.toUpperCase()}2` });
      x.lidEig = (await rpc(eig, 'my_memberships')).find(m => m.household_id === x.h).member_id;
      x.lidPar = (await rpc(par, 'my_memberships')).find(m => m.household_id === x.h).member_id;
      x.kind = await rpc(eig, 'add_member', { p_household: x.h, p_display_name: `Kind ${g.toUpperCase()}`, p_kind: 'child' });
      // Een openstaande uitnodiging met link, en (alleen lokaal) één op een e-mailadres: die stuurt online een echte mail.
      await rpc(eig, 'create_invite', { p_household: x.h });
      if (cfg.lokaal) await rpc(eig, 'create_invite', { p_household: x.h, p_member: null, p_role: 'member', p_days: 7, p_email: adres(`genodigde-${g}`) });
      x.uitnodigingen = ok(await eig.from('household_invites').select('id, invited_email').eq('household_id', x.h).is('accepted_at', null), 'uitnodigingen');
      // Afspraken: gedeeld (met het kind), privé van de eigenaar, en een reeks met een uitzondering.
      const afspraak = (id, zicht, titel, extra = {}) => rpc(eig, 'save_event', {
        p_household: x.h, p_id: id, p_version: null, p_start_date: '2026-12-14', p_start_time: '10:00', p_end_date: null, p_end_time: '11:00',
        p_visibility: zicht, p_title: titel, p_location: extra.plek ?? null, p_notes: extra.notitie ?? null, p_preparation: null,
        p_participants: extra.wie ?? null, p_recurrence_freq: extra.herhaal ?? null, p_recurrence_until: null });
      x.gedeeld = randomUUID(); x.prive = randomUUID(); x.reeks = randomUUID();
      await afspraak(x.gedeeld, 'household', `Gedeeld ${merk}`, { wie: [x.kind] });
      await afspraak(x.prive, 'private', `Privé ${merk}`, { plek: `Plek ${merk}`, notitie: `Notitie ${merk}` });
      await afspraak(x.reeks, 'household', `Reeks ${merk}`, { herhaal: 'weekly' });
      await rpc(eig, 'delete_occurrence', { p_series: x.reeks, p_date: '2026-12-21' });
      // Taken en boodschappen.
      x.taak = randomUUID();
      ok(await par.from('tasks').insert({ id: x.taak, household_id: x.h, title: `Taak ${merk}` }), 'taak');
      x.boodschap = randomUUID();
      await rpc(par, 'add_shopping_items', { p_household: x.h, p_ids: [x.boodschap], p_names: [`Boodschap ${merk}`] });
      // Vakantie, paklijsten, een boodschap en een voorbereiding voor de vakantie.
      x.reis = randomUUID(); x.lijst = randomUUID(); x.pakitem = randomUUID(); x.reistaak = randomUUID();
      ok(await eig.from('trips').insert({ id: x.reis, household_id: x.h, name: `Reis ${merk}`, start_date: '2027-07-01' }), 'vakantie');
      ok(await eig.from('trip_packing_lists').insert({ id: x.lijst, household_id: x.h, trip_id: x.reis, name: 'Strand' }), 'paklijst');
      ok(await eig.from('trip_packing_items').insert({ id: x.pakitem, household_id: x.h, trip_id: x.reis, member_id: x.lidPar, name: `Item ${merk}` }), 'pakitem');
      x.reisboodschap = randomUUID();
      await rpc(eig, 'add_shopping_items', { p_household: x.h, p_ids: [x.reisboodschap], p_names: [`Reisboodschap ${merk}`], p_trip: x.reis });
      ok(await eig.from('tasks').insert({ id: x.reistaak, household_id: x.h, title: `Voorbereiding ${merk}`, trip_id: x.reis }), 'voorbereiding');
      // Mijn spullen en documenten: een gedeeld en een persoonlijk document (geüpload en bevestigd), een spul, een koppeling.
      x.spul = randomUUID();
      ok(await eig.from('possessions').insert({ id: x.spul, household_id: x.h, name: `Spul ${merk}`, owner_member_id: x.lidEig }), 'spul');
      x.docs = [];
      for (const zicht of ['household', 'private']) {
        const id = randomUUID();
        ok(await eig.from('documents').insert({ id, household_id: x.h, title: `Document ${merk}`, kind: 'factuur', owner_member_id: x.lidEig,
          mime: 'application/pdf', size_bytes: PDF.length, visibility: zicht }), 'document');
        const pad = `${x.h}/${id}/origineel`;
        ok(await eig.storage.from(BUCKET).upload(pad, PDF, { contentType: 'application/pdf', upsert: false }), 'upload');
        const s = await bevestig(eig, id);
        if (s !== 200) throw new Error(`bevestig-upload gaf ${s}`);
        x.docs.push({ id, pad, zicht });
      }
      ok(await eig.from('document_links').insert({ household_id: x.h, document_id: x.docs[0].id, possession_id: x.spul }), 'koppeling');
      // Plannen: een plan, een onderdeel en een taak daarin.
      x.plan = randomUUID(); x.onderdeel = randomUUID(); x.plantaak = randomUUID();
      ok(await par.from('plans').insert({ id: x.plan, household_id: x.h, title: `Plan ${merk}` }), 'plan');
      ok(await par.from('plan_sections').insert({ id: x.onderdeel, household_id: x.h, plan_id: x.plan, name: `Onderdeel ${merk}` }), 'onderdeel');
      ok(await par.from('tasks').insert({ id: x.plantaak, household_id: x.h, title: `Plantaak ${merk}`, plan_id: x.plan, plan_section_id: x.onderdeel }), 'plantaak');
      return x;
    }
    const A = await gezin('a');
    const B = await gezin('b');
    console.log('twee gezinnen aangemaakt, elk met inhoud in elk domein');

    // Alle id's van B per tabel (met de service-rol, buiten RLS): wat A straks gericht probeert.
    const idsVan = async (h) => {
      const r = {};
      for (const [t, idk] of TABELLEN) {
        const d = ok(await admin.from(t).select(idk).eq(huishoudKolom(t), h), `ids ${t}`);
        r[t] = [...new Set(d.map(x => x[idk]))];
      }
      return r;
    };
    const bIds = await idsVan(B.h);
    // B heeft echt iets in elke tabel: anders bewijst "A ziet niets" daar niets.
    for (const [t] of TABELLEN) controle(`opzet: gezin B heeft gegevens in ${t}`, bIds[t].length > 0, 'leeg, dus de controle meet niets');

    // Momentopname van alles van B (inclusief bestanden), om na de pogingen van A te vergelijken.
    async function opname() {
      const o = {};
      for (const [t, idk] of TABELLEN) {
        if (t === 'event_overview') continue;   // view op events
        const d = ok(await admin.from(t).select('*').eq(huishoudKolom(t), B.h).order(idk), `opname ${t}`);
        o[t] = d.map(r => JSON.stringify(r)).sort();
      }
      o.bestanden = (ok(await admin.storage.from(BUCKET).list(B.h), 'opname bestanden') ?? []).map(m => m.name).sort();
      o.uitnodigingen_privaat = (await q('select id, invited_email, accepted_at, revoked_at, declined_at from public.household_invites where household_id = $1 order by id', [B.h])).map(r => JSON.stringify(r));
      return createHash('sha256').update(JSON.stringify(o)).digest('hex');
    }

    // ---------- Tegenproef ----------
    // sessie: de "partner van A" is opzettelijk de partner van B. beleid: een te ruime leesregel (alleen lokaal).
    const sessies = { a1: accounts.a1.c, a2: tegenproef === 'sessie' ? accounts.b2.c : accounts.a2.c };
    if (tegenproef === 'beleid') {
      tegenproefRegels = [`p5_tegenproef_taken_${run}`, `p5_tegenproef_bestanden_${run}`];
      await q(`create policy ${tegenproefRegels[0]} on public.tasks for select to authenticated using (true)`);
      await q(`create policy ${tegenproefRegels[1]} on storage.objects for select to authenticated using (bucket_id = '${BUCKET}')`);
    }

    // ---------- Lezen: niets van B, op geen enkele manier ----------
    for (const [wie, c] of Object.entries(sessies)) {
      for (const [t, idk] of TABELLEN) {
        const hk = huishoudKolom(t);
        await probeer(`${wie} lezen ${t}: alles`, async () => {
          const r = await c.from(t).select(`${idk}, ${hk}`).limit(5000);
          if (r.error) return `fout bij lezen (de controle meet dan niets): ${r.error.message}`;
          const van = r.data.filter(x => x[hk] === B.h);
          return van.length === 0 || `${van.length} rij(en) van B`;
        });
        await probeer(`${wie} lezen ${t}: gericht op id's van B`, async () => {
          const r = await c.from(t).select(idk).in(idk, bIds[t]);
          if (r.error) return `fout bij lezen: ${r.error.message}`;
          return r.data.length === 0 || `${r.data.length} rij(en) van B`;
        });
        await probeer(`${wie} lezen ${t}: filter op huishouden B`, async () => {
          const r = await c.from(t).select(idk).eq(hk, B.h);
          if (r.error) return `fout bij lezen: ${r.error.message}`;
          return r.data.length === 0 || `${r.data.length} rij(en) van B`;
        });
      }
      // Zoeken op de inhoud van B.
      await probeer(`${wie} zoeken op de tekst van B`, async () => {
        const gevonden = [];
        for (const [t, kol] of [['event_details', 'title'], ['tasks', 'title'], ['shopping_items', 'name'], ['trips', 'name'],
          ['trip_packing_items', 'name'], ['possessions', 'name'], ['documents', 'title'], ['plans', 'title'], ['plan_sections', 'name']]) {
          const r = await c.from(t).select(kol).ilike(kol, `%${B.merk}%`);
          if (r.error) return `${t}: ${r.error.message}`;
          if (r.data.length) gevonden.push(t);
        }
        return gevonden.length === 0 || 'gevonden in ' + gevonden.join(', ');
      });
      // Leden en uitnodigingen via de functies.
      await probeer(`${wie} my_memberships zonder B`, async () => {
        const d = zelfdeFout(await c.rpc('my_memberships'));
        return (d && !d.some(m => m.household_id === B.h)) || 'B in my_memberships (of fout)';
      });
      await probeer(`${wie} my_invites zonder B`, async () => {
        const d = zelfdeFout(await c.rpc('my_invites'));
        return (Array.isArray(d) && !JSON.stringify(d).includes(B.h)) || 'uitnodiging van B zichtbaar (of fout)';
      });
      await probeer(`${wie} profielen van B onzichtbaar`, async () => {
        const r = await c.from('profiles').select('user_id').in('user_id', [accounts.b1.id, accounts.b2.id]);
        return (!r.error && r.data.length === 0) || (r.error ? r.error.message : `${r.data.length} profiel(en) van B`);
      });
      await probeer(`${wie} household_channel(B) geweigerd`, async () => (await c.rpc('household_channel', { p_household: B.h })).error ? true : 'geen fout');
      // uitnodigingsmails geeft wie geen eigenaar of beheerder is bewust een lege lijst (geen fout).
      await probeer(`${wie} uitnodigingsmails(B) geweigerd of leeg`, async () => {
        const r = await c.rpc('uitnodigingsmails', { p_household: B.h });
        return !!r.error || (Array.isArray(r.data) && r.data.length === 0) || `${r.data?.length} mail(s) van B`;
      });
    }
    if (cfg.lokaal) {
      await probeer('uitnodigingsmails: de eigenaar van B ziet zijn eigen mail wel (tegencontrole)', async () => {
        const r = await accounts.b1.c.rpc('uitnodigingsmails', { p_household: B.h });
        return (!r.error && r.data.length > 0) || 'leeg: de controle hierboven meet dan niets';
      });
    }

    // ---------- Mijn spullen en documenten: bestanden van B, ook via een bekend pad of id ----------
    for (const [wie, c] of Object.entries(sessies)) {
      for (const d of B.docs) {
        await probeer(`${wie} bestand (${d.zicht}) van B: geen link via het bekende pad`, async () => (await c.storage.from(BUCKET).createSignedUrl(d.pad, 60)).error ? true : 'link gekregen');
        await probeer(`${wie} bestand (${d.zicht}) van B: niet te downloaden`, async () => (await c.storage.from(BUCKET).download(d.pad)).error ? true : 'gedownload');
        await probeer(`${wie} bestand (${d.zicht}) van B: id onder het eigen huishouden geeft niets`, async () => (await c.storage.from(BUCKET).createSignedUrl(`${A.h}/${d.id}/origineel`, 60)).error ? true : 'link gekregen');
        await probeer(`${wie} bestand (${d.zicht}) van B: niet te overschrijven`, async () => (await c.storage.from(BUCKET).upload(d.pad, PDF, { contentType: 'application/pdf', upsert: true })).error ? true : 'overschreven');
        await probeer(`${wie} bestand (${d.zicht}) van B: publieke URL werkt niet`, async () => {
          const s = (await fetch(c.storage.from(BUCKET).getPublicUrl(d.pad).data.publicUrl)).status;
          return s !== 200 || 'publieke URL gaf het bestand';
        });
        await probeer(`${wie} bestand (${d.zicht}) van B: bevestig-upload geeft 404`, async () => {
          const s = await bevestig(c, d.id);
          return s === 404 || `status ${s}`;
        });
      }
      await probeer(`${wie} bestanden: de map van B is leeg voor A`, async () => {
        const r = await c.storage.from(BUCKET).list(B.h);
        return !!r.error || r.data.length === 0 || `${r.data.length} item(s) in de map van B`;
      });
      await probeer(`${wie} bestanden: geen upload in de map van B`, async () => (await c.storage.from(BUCKET).upload(`${B.h}/${randomUUID()}/origineel`, PDF, { contentType: 'application/pdf' })).error ? true : 'geüpload');
    }

    // ---------- Een verlopen link werkt voor niemand (de tegencontrole: vers werkt hij wel) ----------
    await probeer('verlopen link van B werkt niet meer', async () => {
      const { data, error } = await accounts.b1.c.storage.from(BUCKET).createSignedUrl(B.docs[0].pad, 2, { download: true });
      if (error) return 'B kreeg zelf geen link: ' + error.message;
      if ((await fetch(data.signedUrl)).status !== 200) return 'tegencontrole: de verse link werkt niet, de proef meet niets';
      await wacht(4000);
      const s = (await fetch(data.signedUrl)).status;
      return s !== 200 || 'de verlopen link gaf het bestand';
    });

    // ---------- Privé-afspraak: "Bezet" voor de partner (en de eigenaar ziet alles: tegencontrole) ----------
    await probeer('privé-afspraak van A1 is voor de partner alleen "Bezet"', async () => {
      const r = await sessies.a2.from('event_overview').select('is_busy, title, location, notes, preparation, start_date').eq('id', A.prive);
      if (r.error) return r.error.message;
      const [rij] = r.data;
      if (!rij) return 'de partner ziet de afspraak helemaal niet (Bezet hoort wel te tonen)';
      return (rij.is_busy === true && rij.title === null && rij.location === null && rij.notes === null && rij.preparation === null) || 'details zichtbaar: ' + JSON.stringify(rij);
    });
    await probeer('privé-afspraak: de details bestaan niet voor de partner', async () => {
      const r = await sessies.a2.from('event_details').select('event_id').eq('event_id', A.prive);
      return (!r.error && r.data.length === 0) || 'details leesbaar';
    });
    await probeer('privé-afspraak: de eigenaar ziet de details wel (tegencontrole)', async () => {
      const r = await accounts.a1.c.from('event_details').select('title').eq('event_id', A.prive);
      return (!r.error && r.data[0]?.title === `Privé ${A.merk}`) || 'eigenaar ziet zijn eigen details niet';
    });
    await probeer('gedeelde gegevens van A zijn voor de partner wel zichtbaar (tegencontrole)', async () => {
      const r = await sessies.a2.from('tasks').select('id').in('id', [A.taak, A.reistaak, A.plantaak]);
      return (!r.error && r.data.length === 3) || 'de partner ziet de eigen taken niet: de leescontroles meten dan niets';
    });

    // ---------- Realtime: het kanaal van B gaat niet open; seintjes zonder inhoud ----------
    {
      const c = sessies.a2;
      const kanaalA = await rpc(accounts.a2.c, 'household_channel', { p_household: A.h });
      const kanaalB = await rpc(accounts.b1.c, 'household_channel', { p_household: B.h });
      await c.realtime.setAuth();
      // Eerst het eigen kanaal: open, en aantoonbaar live (seintjes van de eigen database komen aan). Pas daarna het
      // kanaal van B, zodat een trage start van Realtime geen time-out geeft die niets bewijst.
      const ontvangen = [];
      const ka = c.channel(kanaalA, { config: { private: true } }).on('broadcast', { event: 'wijziging' }, m => ontvangen.push(m.payload));
      kanalen.push([c, ka]);
      const ra = await abonneer(ka);
      controle('realtime: het eigen kanaal gaat open (tegencontrole)', ra.status === 'SUBSCRIBED', `status ${ra.status}`);
      let live = false;
      if (ra.status === 'SUBSCRIBED') {
        // Realtime bouwt de stroom pas op bij het eerste privékanaal: tot 2 minuten proeven tot 3 seintjes op rij aankomen.
        const tot = Date.now() + 120000;
        for (let opRij = 0; opRij < 3 && Date.now() < tot;) {
          const id = randomUUID();
          ok(await accounts.a1.c.from('tasks').insert({ id, household_id: A.h, title: 'Proef' }), 'proeftaak');
          let kwam = false;
          for (let j = 0; j < 30 && !kwam; j++) { kwam = ontvangen.some(p => p?.id === id); if (!kwam) await wacht(100); }
          opRij = kwam ? opRij + 1 : 0;
        }
        live = ontvangen.length > 0;
      }
      controle('realtime: het eigen kanaal ontvangt seintjes (tegencontrole)', live, 'geen seintjes: de realtimecontroles meten niets');
      // Het kanaal van B: alleen een expliciete weigering telt (een time-out bewijst niets; dan nog eens proberen).
      let rb = { status: 'NIET_GEPROBEERD' };
      for (let i = 0; i < 3 && !['CHANNEL_ERROR', 'SUBSCRIBED'].includes(rb.status); i++) {
        const kb = c.channel(kanaalB, { config: { private: true } });
        kanalen.push([c, kb]);
        rb = await abonneer(kb, 20000);
      }
      controle('realtime: het kanaal van B gaat voor A niet open', rb.status === 'CHANNEL_ERROR', `status ${rb.status}`);
      if (live) {
        await wacht(1500);
        ontvangen.length = 0;
        // B wijzigt in elk domein; A wijzigt één ding (dat moet aankomen).
        const bNieuw = [randomUUID(), randomUUID(), randomUUID()];
        ok(await accounts.b2.c.from('tasks').insert({ id: bNieuw[0], household_id: B.h, title: `Realtime ${B.merk}` }), 'B taak');
        await rpc(accounts.b2.c, 'add_shopping_items', { p_household: B.h, p_ids: [bNieuw[1]], p_names: [`Realtime ${B.merk}`] });
        ok(await accounts.b1.c.from('possessions').insert({ id: bNieuw[2], household_id: B.h, name: `Realtime ${B.merk}`, owner_member_id: B.lidEig }), 'B spul');
        ok(await accounts.b1.c.from('plans').update({ title: `Realtime ${B.merk}` }).eq('id', B.plan), 'B plan');
        const aNieuw = randomUUID();
        ok(await accounts.a1.c.from('tasks').insert({ id: aNieuw, household_id: A.h, title: `Realtime ${A.merk}` }), 'A taak');
        for (let j = 0; j < 100 && !ontvangen.some(p => p?.id === aNieuw); j++) await wacht(100);
        await wacht(3000);
        controle('realtime: het seintje van de eigen wijziging komt aan (tegencontrole)', ontvangen.some(p => p?.id === aNieuw), 'niet ontvangen');
        const bekend = new Set([...Object.values(bIds).flat(), ...bNieuw, B.h]);
        controle('realtime: geen enkel seintje over B', !ontvangen.some(p => bekend.has(p?.id)), JSON.stringify(ontvangen.filter(p => bekend.has(p?.id))).slice(0, 200));
        const vreemd = ontvangen.filter(p => !p || typeof p !== 'object' || Object.keys(p).some(k => !SEINTJE_SLEUTELS.includes(k)));
        controle('realtime: seintjes hebben alleen {t, id, v, op}', vreemd.length === 0, JSON.stringify(vreemd).slice(0, 200));
        const tekst = JSON.stringify(ontvangen);
        controle('realtime: geen inhoud in de seintjes (geen tekst van A of B)', !tekst.includes(A.merk) && !tekst.includes(B.merk) && !tekst.includes('Realtime'), 'inhoud gevonden');
      }
    }

    // ---------- Wijzigen: niets van B, op geen enkele manier ----------
    // Als laatste: een geslaagde poging (zoals in de tegenproef leave_household) mag de controles hierboven niet beïnvloeden.
    const voor = await opname();
    for (const [wie, c] of Object.entries(sessies)) {
      for (const [t, idk, kol] of TABELLEN) {
        if (!kol) continue;
        await probeer(`${wie} wijzigen ${t} van B`, async () => {
          const waarde = kol === 'deleted_at' ? new Date().toISOString() : `Overschreven door A ${run}`;
          const r = await c.from(t).update({ [kol]: waarde }).in(idk, bIds[t]).select(idk);
          return !!r.error || r.data.length === 0 || `${r.data.length} rij(en) van B gewijzigd`;
        });
      }
      const nieuw = {
        tasks: { household_id: B.h, title: 'Van A' }, shopping_items: { household_id: B.h, name: 'Van A' },
        trips: { household_id: B.h, name: 'Van A' }, trip_packing_lists: { household_id: B.h, trip_id: B.reis, name: 'Van A' },
        trip_packing_items: { household_id: B.h, trip_id: B.reis, name: 'Van A' },
        trip_shopping_links: { household_id: B.h, trip_id: B.reis, shopping_item_id: B.boodschap },
        possessions: { household_id: B.h, name: 'Van A', owner_member_id: B.lidEig },
        documents: { household_id: B.h, title: 'Van A', kind: 'factuur', owner_member_id: B.lidEig, mime: 'application/pdf', size_bytes: 10, visibility: 'household' },
        document_links: { household_id: B.h, document_id: B.docs[0].id, possession_id: B.spul },
        plans: { household_id: B.h, title: 'Van A' }, plan_sections: { household_id: B.h, plan_id: B.plan, name: 'Van A' },
      };
      // In het eigen huishouden, maar met een verwijzing naar iets van B.
      const kruis = {
        'taak bij een vakantie van B': ['tasks', { household_id: A.h, title: 'Kruis', trip_id: B.reis }],
        'taak in een plan van B': ['tasks', { household_id: A.h, title: 'Kruis', plan_id: B.plan }],
        'taak bij een spul van B': ['tasks', { household_id: A.h, title: 'Kruis', possession_id: B.spul }],
        'pakitem bij een vakantie van B': ['trip_packing_items', { household_id: A.h, trip_id: B.reis, name: 'Kruis' }],
        'koppeling met een document van B': ['document_links', { household_id: A.h, document_id: B.docs[0].id, possession_id: A.spul }],
        'koppeling met een spul van B': ['document_links', { household_id: A.h, document_id: A.docs[0].id, possession_id: B.spul }],
        'onderdeel in een plan van B': ['plan_sections', { household_id: A.h, plan_id: B.plan, name: 'Kruis' }],
        'paklijst bij een vakantie van B': ['trip_packing_lists', { household_id: A.h, trip_id: B.reis, name: 'Kruis' }],
        'boodschap van B aan een eigen vakantie': ['trip_shopping_links', { household_id: A.h, trip_id: A.reis, shopping_item_id: B.boodschap }],
        'eigen document met de eigenaar van B': ['documents', { household_id: A.h, title: 'Kruis', kind: 'factuur', owner_member_id: B.lidEig, mime: 'application/pdf', size_bytes: 10, visibility: 'household' }],
      };
      for (const [t, rij] of Object.entries(nieuw)) {
        await probeer(`${wie} toevoegen ${t} in B`, async () => (await c.from(t).insert(rij)).error ? true : 'toegevoegd in B');
      }
      for (const [naam, [t, rij]] of Object.entries(kruis)) {
        await probeer(`${wie} kruisverwijzing: ${naam}`, async () => (await c.from(t).insert(rij)).error ? true : 'geaccepteerd');
      }
      const reeksArgs = (h, id, v, titel = 'Van A') => ({ p_household: h, p_id: id, p_version: v, p_start_date: '2026-12-14', p_start_time: null,
        p_end_date: null, p_end_time: null, p_visibility: 'household', p_title: titel, p_location: null, p_notes: null, p_preparation: null,
        p_participants: null, p_recurrence_freq: null, p_recurrence_until: null });
      const pogingen = {
        'save_event nieuw in B': ['save_event', reeksArgs(B.h, randomUUID(), null)],
        'save_event overschrijft afspraak van B': ['save_event', reeksArgs(B.h, B.gedeeld, 1)],
        'save_event haalt afspraak van B naar A': ['save_event', reeksArgs(A.h, B.gedeeld, 1)],
        'save_event met een deelnemer van B': ['save_event', { ...reeksArgs(A.h, randomUUID(), null), p_participants: [B.kind] }],
        'delete_event gedeelde afspraak van B': ['delete_event', { p_id: B.gedeeld, p_version: 1 }],
        'delete_event privé-afspraak van B': ['delete_event', { p_id: B.prive, p_version: 1 }],
        'delete_occurrence in een reeks van B': ['delete_occurrence', { p_series: B.reeks, p_date: '2026-12-28' }],
        'add_shopping_items in B': ['add_shopping_items', { p_household: B.h, p_ids: [randomUUID()], p_names: ['Van A'] }],
        'add_shopping_items bij een vakantie van B': ['add_shopping_items', { p_household: A.h, p_ids: [randomUUID()], p_names: ['Van A'], p_trip: B.reis }],
        'set_packed in B': ['set_packed', { p_household: B.h, p_trip: B.reis, p_items: [{ id: B.pakitem, version: 1, packed: true }] }],
        'copy_packing_items uit B': ['copy_packing_items', { p_household: A.h, p_command: randomUUID(), p_from_trip: B.reis, p_to_trip: A.reis }],
        'copy_packing_items naar B': ['copy_packing_items', { p_household: B.h, p_command: randomUUID(), p_from_trip: B.reis, p_to_trip: B.reis }],
        'delete_packing_list van B': ['delete_packing_list', { p_household: B.h, p_list: B.lijst, p_version: 1 }],
        'restore_packing_list van B': ['restore_packing_list', { p_household: B.h, p_list: B.lijst, p_version: 1 }],
        'delete_plan van B': ['delete_plan', { p_household: B.h, p_plan: B.plan, p_version: 1, p_with_tasks: true }],
        'restore_plan van B': ['restore_plan', { p_household: B.h, p_plan: B.plan, p_version: 1 }],
        'delete_plan_section van B': ['delete_plan_section', { p_household: B.h, p_section: B.onderdeel, p_version: 1 }],
        'create_invite voor B': ['create_invite', { p_household: B.h }],
        'revoke_invite van B': ['revoke_invite', { p_invite: B.uitnodigingen[0].id }],
        'decline_invite van B': ['decline_invite', { p_invite: B.uitnodigingen[0].id }],
        'accept_invite_by_id van B': ['accept_invite_by_id', { p_invite: B.uitnodigingen.at(-1).id, p_display_name: 'Indringer' }],
        'uitnodigingsmail_verzoek voor B': ['uitnodigingsmail_verzoek', { p_household: B.h }],
        'uitnodigingsmail_opnieuw voor B': ['uitnodigingsmail_opnieuw', { p_invite: B.uitnodigingen.at(-1).id }],
        'add_member in B': ['add_member', { p_household: B.h, p_display_name: 'Indringer', p_kind: 'child' }],
        'archive_member in B': ['archive_member', { p_household: B.h, p_member: B.kind }],
        'restore_member in B': ['restore_member', { p_household: B.h, p_member: B.kind }],
        'set_member_role in B': ['set_member_role', { p_household: B.h, p_member: B.lidPar, p_role: 'admin' }],
        'transfer_ownership in B': ['transfer_ownership', { p_household: B.h, p_member: B.lidPar }],
        'delete_household van B': ['delete_household', { p_household: B.h }],
        'leave_household van B': ['leave_household', { p_household: B.h }],
      };
      for (const [naam, [fn, a]] of Object.entries(pogingen)) {
        await probeer(`${wie} functie: ${naam}`, async () => (await c.rpc(fn, a)).error ? true : 'geen fout: de functie nam het aan');
      }

    }
    controle('gegevens van B na alle pogingen van A ongewijzigd (ook de bestanden)', (await opname()) === voor, 'B is veranderd');
  } catch (e) {
    controle('de proef liep tot het eind', false, String(e?.message || e).slice(0, 300));
  } finally {
    // ---------- Opruimen (altijd) en nagaan dat er niets achterblijft ----------
    for (const [c, k] of kanalen) { try { await c.removeChannel(k); } catch { /* al dicht */ } }
    for (const r of tegenproefRegels) {
      try { await q(`drop policy if exists ${r} on ${r.includes('taken') ? 'public.tasks' : 'storage.objects'}`); } catch (e) { controle(`tegenproefregel ${r} weg`, false, e.message); }
    }
    const opruimFouten = [];
    try {
      for (const h of huishoudens) {
        const { data: mappen } = await admin.storage.from(BUCKET).list(h);
        const paden = (mappen ?? []).map(m => `${h}/${m.name}/origineel`);
        if (paden.length) { const r = await admin.storage.from(BUCKET).remove(paden); if (r.error) opruimFouten.push('bestanden: ' + r.error.message); }
      }
      if (huishoudens.length) { const r = await admin.from('households').delete().in('id', huishoudens); if (r.error) opruimFouten.push('huishoudens: ' + r.error.message); }
      for (const a of Object.values(accounts)) {
        try { await a.c?.realtime.disconnect(); } catch { /* al dicht */ }
        const r = await admin.auth.admin.deleteUser(a.id);
        if (r.error) opruimFouten.push('account: ' + r.error.message);
      }
      if (testers.length) await q('delete from private.testers where email = any($1::text[])', [testers]);
      const [rest] = await q(`select
        (select count(*) from auth.users where email like $1)::int as accounts,
        (select count(*) from public.households where name like $2)::int as huishoudens,
        (select count(*) from storage.objects where bucket_id = $3 and split_part(name, '/', 1) = any($4::text[]))::int as bestanden,
        (select count(*) from private.testers where email like $1)::int as testers,
        (select count(*) from public.household_invites where invited_email like $1)::int as uitnodigingen`,
        [`scheiding-%-${run}@test.invalid`, `Scheiding % ${run}`, BUCKET, huishoudens.map(String)]);
      const over = Object.entries(rest).filter(([, n]) => n > 0).map(([k, n]) => `${n} ${k}`);
      if (over.length) opruimFouten.push('achtergebleven: ' + over.join(', '));
      if (tegenproefRegels.length) {
        const [{ n }] = await q('select count(*)::int as n from pg_policy where polname like $1', [`p5_tegenproef_%_${run}`]);
        if (n) opruimFouten.push(`${n} tegenproefregel(s) staan er nog`);
      }
    } catch (e) { opruimFouten.push(String(e?.message || e)); }
    controle('opgeruimd: geen testaccount, huishouden, bestand, tester of uitnodiging achtergebleven', opruimFouten.length === 0, opruimFouten.join('; '));
    await db.end();
  }

  // ---------- Uitslag ----------
  const fout = uitslagen.filter(u => !u.ok);
  console.log(`\n${uitslagen.length} controles, ${uitslagen.length - fout.length} in orde, ${fout.length} niet in orde`);
  for (const u of fout) console.log(`  NIET IN ORDE: ${u.id}${u.uitleg ? ' — ' + u.uitleg : ''}`);
  const opgeruimd = uitslagen.find(u => u.id.startsWith('opgeruimd'))?.ok;
  if (!tegenproef) {
    console.log(fout.length ? '\nGEFAALD: gezin A kon iets van gezin B zien of wijzigen, of de proef was niet volledig.' : '\nGESLAAGD: gezin A ziet en wijzigt niets van gezin B; seintjes zonder inhoud; alles opgeruimd.');
    process.exit(fout.length ? 1 : 0);
  }
  // Tegenproef: de controles moeten de fout zien. Precies de verwachte soort moet falen, en de opruiming moet lukken.
  const verwacht = tegenproef === 'sessie'
    ? [/^a2 lezen tasks: alles$/, /^a2 lezen household_members: gericht/, /^a2 lezen documents: /, /^a2 bestand \(household\) van B: geen link/, /^realtime: het kanaal van B gaat voor A niet open$/]
    : [/^a\d lezen tasks: /, /^a\d bestand \(household\) van B: geen link/];
  const gezien = verwacht.filter(p => fout.some(u => p.test(u.id)));
  if (gezien.length === verwacht.length && opgeruimd) {
    console.log(`\nTEGENPROEF GESLAAGD: het script faalde zoals bedoeld (${fout.length} controles niet in orde, waaronder alle ${verwacht.length} verwachte), en alles is opgeruimd.`);
    process.exit(0);
  }
  console.log(`\nTEGENPROEF MISLUKT: ${verwacht.length - gezien.length} verwachte fout(en) niet gezien${opgeruimd ? '' : ', of het opruimen faalde'}. De controles zijn dan blind.`);
  process.exit(1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  hoofd().catch(e => { console.log('FOUT: ' + String(e?.message || e).replace(/(sb_secret_|password)[^\s]*/gi, '$1***')); process.exit(1); });
}
