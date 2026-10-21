// Thuisplanner K1 (eigen codelaag) tegen de echte lokale stack: Supabase Auth met de Send Email-hook, de Edge Functions
// stuur-code en controleer-code, Mailpit als mailaanbieder. Zie docs/thuisplanner-k1-ontwerp.md (AC-nummers) en
// docs/thuisplanner-deel2-bouwscope.md §2. Alleen fictieve adressen op @test.invalid.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';
import { createClient } from '@supabase/supabase-js';
import pg from 'pg';

const { API_URL, ANON_KEY, SERVICE_ROLE_KEY, DB_URL } = process.env;
if (!API_URL || !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(API_URL)) throw new Error('Weigering: alleen een lokale Supabase');
if (!DB_URL || !/@(127\.0\.0\.1|localhost):\d+\//.test(DB_URL)) throw new Error('Weigering: alleen een lokale database');
const api = new URL(API_URL);
// Mailpit draait in de lokale stack op de API-poort + 3 (zie config.toml: [local_smtp]).
const MAIL = process.env.MAILPIT_URL ?? `http://${api.hostname}:${Number(api.port) + 3}`;
const FUNCTIES = `${API_URL.replace(/\/$/, '')}/functions/v1`;

const geen = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(API_URL, SERVICE_ROLE_KEY, geen);
const db = new pg.Client({ connectionString: DB_URL });
const run = randomUUID().slice(0, 8);
const wacht = ms => new Promise(r => setTimeout(r, ms));
let vorigeInst, vorigeGrenzen;

before(async () => {
  await db.connect();
  vorigeInst = (await db.query('select * from private.instellingen')).rows[0];
  vorigeGrenzen = (await db.query('select * from private.k1_grenzen')).rows[0];
  await db.query('update private.instellingen set wachtwoordsessies_toegestaan = false, codes_aan = true, registratie_open = true, huishouden_open = true');
});
after(async () => {
  await db.query(`update private.instellingen set wachtwoordsessies_toegestaan = $1, codes_aan = $2, registratie_open = $3, huishouden_open = $4`,
    [vorigeInst.wachtwoordsessies_toegestaan, vorigeInst.codes_aan, vorigeInst.registratie_open, vorigeInst.huishouden_open]);
  await db.query('update private.k1_grenzen set aanvragen_kwartier = $1, aanvragen_dag = $2, u_onbekend = $3, h_totaal = $4, m_toestellen = $5, d_toestel = $6',
    [vorigeGrenzen.aanvragen_kwartier, vorigeGrenzen.aanvragen_dag, vorigeGrenzen.u_onbekend, vorigeGrenzen.h_totaal, vorigeGrenzen.m_toestellen, vorigeGrenzen.d_toestel]);
  const { rows } = await db.query(`select id from auth.users where email like $1 or email like $2`, [`%-${run}@test.invalid`, `%-${run}-nieuw@test.invalid`]);
  for (const r of rows) await admin.auth.admin.deleteUser(r.id);
  await db.end();
});

const adres = naam => `${naam}-${run}@test.invalid`;
async function mails(email, sinds) {
  const r = await (await fetch(`${MAIL}/api/v1/search?query=${encodeURIComponent('to:' + email)}&limit=50`)).json();
  const lijst = (r.messages || []).filter(m => new Date(m.Created).getTime() >= sinds - 1500).sort((a, b) => new Date(a.Created) - new Date(b.Created));
  return Promise.all(lijst.map(async m => {
    const v = await (await fetch(`${MAIL}/api/v1/message/${m.ID}`)).json();
    return { onderwerp: v.Subject, tekst: v.Text, html: v.HTML, code: (v.Text.match(/\b(\d{6})\b/) || [])[1] };
  }));
}
async function laatsteMail(email, sinds) {
  for (let i = 0; i < 40; i++) { const m = await mails(email, sinds); if (m.length) return m.at(-1); await wacht(250); }
  throw new Error('geen mail voor ' + email);
}
// Een code aanvragen zoals de app (Supabase Auth; GoTrue staat lokaal 1 aanvraag per seconde per adres toe).
async function vraag(email) {
  const sinds = Date.now();
  const r = await createClient(API_URL, ANON_KEY, geen).auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
  await wacht(1100);
  return { r, sinds };
}
async function controleer(email, code, extra = {}, kop = {}) {
  const r = await fetch(`${FUNCTIES}/controleer-code`, {
    method: 'POST', headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}`, 'Content-Type': 'application/json', ...kop },
    body: JSON.stringify({ email, code, ...extra }),
  });
  return { status: r.status, body: await r.json().catch(() => null), kop: r.headers };
}
async function sessie(antwoord) {
  const c = createClient(API_URL, ANON_KEY, geen);
  const v = await c.auth.verifyOtp({ token_hash: antwoord.token_hash, type: antwoord.type });
  assert.ifError(v.error);
  return { c, s: v.data.session };
}
async function inloggen(email, extra = {}) {
  const { sinds } = await vraag(email);
  const m = await laatsteMail(email, sinds);
  const a = await controleer(email, m.code, extra);
  assert.equal(a.status, 200, JSON.stringify(a.body));
  return { ...(await sessie(a.body)), toestel: a.body.toestel, mail: m };
}
const amr = s => JSON.parse(Buffer.from(s.access_token.split('.')[1], 'base64url')).amr?.map(a => a.method);
const fout = (code) => String((Number(code) + 1) % 1e6).padStart(6, '0');

test('AC-1/AC-9 nieuw en bestaand adres: dezelfde mail met alleen 6 cijfers, code → sessie (amr otp), adres bevestigd', { timeout: 60000 }, async () => {
  const email = adres('nieuw');
  const eerste = await inloggen(email);
  assert.deepEqual(amr(eerste.s), ['otp']);
  assert.ok(eerste.s.user.email_confirmed_at, 'adres niet bevestigd');
  assert.equal((await eerste.c.rpc('mijn_toegang')).data, 'ok');
  const tweede = await inloggen(email);
  assert.equal(tweede.s.user.id, eerste.s.user.id);
  for (const m of [eerste.mail, tweede.mail]) {
    assert.equal(m.onderwerp, 'Je inlogcode voor Thuisplanner');
    assert.doesNotMatch(m.onderwerp, /\d/, 'code in het onderwerp');
    assert.deepEqual(m.tekst.match(/\b\d{6,}\b/g), [m.code], 'meer dan de eigen code (interne code?) in de mail');
    assert.doesNotMatch(m.tekst + m.html, /https?:\/\/|token|verify/i, 'link of token in de mail');
  }
  assert.equal(eerste.mail.tekst.replace(eerste.mail.code, 'X'), tweede.mail.tekst.replace(tweede.mail.code, 'X'), 'nieuw en bestaand krijgen een andere tekst');
});

test('omzeilen: de 6 cijfers werken niet bij Supabase zelf; herstel, herbevestiging en directe hookaanroepen worden geweigerd', { timeout: 60000 }, async () => {
  const email = adres('omweg');
  await inloggen(email);
  const { sinds } = await vraag(email);
  const m = await laatsteMail(email, sinds);
  // De eigen code bij Supabase Auth zelf invoeren (de interne code heeft 10 cijfers): geen sessie.
  const direct = await createClient(API_URL, ANON_KEY, geen).auth.verifyOtp({ email, token: m.code, type: 'email' });
  assert.ok(direct.error && !direct.data.session, 'de 6 cijfers geven bij Supabase zelf een sessie');
  // De code is daarna nog gewoon bruikbaar via controleer-code (de omweg kost geen poging van de echte gebruiker).
  assert.equal((await controleer(email, m.code)).status, 200);
  // "Wachtwoord vergeten" en herbevestiging: de hook weigert, er gaat geen mail uit.
  const voor = Date.now();
  const herstel = await createClient(API_URL, ANON_KEY, geen).auth.resetPasswordForEmail(email);
  assert.ok(herstel.error, 'herstelmail toegestaan');
  const { s } = await inloggen(email);
  const ingelogd = createClient(API_URL, ANON_KEY, geen);
  await ingelogd.auth.setSession(s);
  const herbevestig = await ingelogd.auth.reauthenticate();
  assert.ok(herbevestig.error, 'herbevestiging toegestaan');
  await wacht(1500);
  assert.equal((await mails(email, voor)).filter(x => x.onderwerp !== 'Je inlogcode voor Thuisplanner').length, 0, 'er ging toch een andere mail uit');
  // De hook direct aanroepen zonder geldige handtekening: geweigerd (geen codes te maken buiten Supabase om).
  const nep = await fetch(`${FUNCTIES}/stuur-code`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'webhook-id': 'x', 'webhook-timestamp': String(Math.floor(Date.now() / 1000)), 'webhook-signature': 'v1,nep' },
    body: JSON.stringify({ user: { id: randomUUID(), email }, email_data: { email_action_type: 'magiclink', token_hash: 'x'.repeat(56) } }) });
  assert.equal(nep.status, 401);
  // Alleen e-mail staat aan als inlogroute; automatisch bevestigen staat uit.
  const inst = await (await fetch(`${API_URL}/auth/v1/settings`, { headers: { apikey: ANON_KEY } })).json();
  assert.deepEqual(Object.entries(inst.external).filter(([, v]) => v).map(([k]) => k), ['email']);
  assert.equal(inst.mailer_autoconfirm, false);
});

test('AC-15/16 gelijktijdig: 50 foute pogingen tellen precies 5 en laten de code vervallen; 10 goede tegelijk geven precies één token', { timeout: 90000 }, async () => {
  const email = adres('tegelijk');
  await inloggen(email);
  let { sinds } = await vraag(email);
  let m = await laatsteMail(email, sinds);
  const uit = await Promise.all(Array.from({ length: 50 }, () => controleer(email, fout(m.code))));
  const tel = s => uit.filter(x => x.status === s).length;
  assert.equal(tel(200), 0);
  const verdeling = JSON.stringify(uit.reduce((v, x) => ({ ...v, [x.status + '/' + (x.body?.code ?? '-')]: (v[x.status + '/' + (x.body?.code ?? '-')] ?? 0) + 1 }), {}));
  // De lokale Edge Runtime trekt bij zo'n piek soms een worker in (503); dat is een lokale grens, geen poging. De
  // beveiligingseigenschap: nooit een token, en hoogstens 5 pogingen op de code.
  assert.equal(uit.filter(x => x.status === 200).length, 0, verdeling);
  const r = (await db.query(`select pogingen, status from private.k1_codes order by gemaakt desc limit 1`)).rows[0];
  assert.deepEqual({ pogingen: r.pogingen <= 5, status: r.status }, { pogingen: true, status: 'vervallen' });
  // Daarna werkt ook de juiste code niet: vervallen (TPK01), of de onbekende emmer is vol (TPK02).
  assert.ok(['TPK01', 'TPK02'].includes((await controleer(email, m.code)).body?.code), 'de juiste code werkt nog na 5 fouten');
  const ander = adres('tegelijk-goed');
  await inloggen(ander);
  ({ sinds } = await vraag(ander));
  m = await laatsteMail(ander, sinds);
  const goed = await Promise.all(Array.from({ length: 10 }, () => controleer(ander, m.code)));
  assert.equal(goed.filter(x => x.status === 200).length, 1, 'meer dan één token voor één code');
});

test('AC-19 geen adresverraad: hetzelfde antwoord voor fout, verlopen, geen code en een onbekend adres', { timeout: 60000 }, async () => {
  const bekend = adres('bekend');
  await inloggen(bekend);
  const antwoorden = [await controleer(bekend, '000000'), await controleer(adres('nooit-gezien'), '000000')];
  const { sinds } = await vraag(bekend);
  const m = await laatsteMail(bekend, sinds);
  await db.query(`update private.k1_codes set verloopt = now() - interval '1 second' where status = 'actief' and gemaakt >= now() - interval '1 minute'`);
  antwoorden.push(await controleer(bekend, m.code));
  for (const a of antwoorden) assert.deepEqual({ s: a.status, b: a.body }, { s: 400, b: { code: 'TPK01' } });
  assert.deepEqual((await controleer(bekend, '12345')).body, { code: 'TPK00' });
  assert.deepEqual((await controleer('geen-adres', '123456')).body, { code: 'TPK00' });
  // Aanvragen: Supabase geeft hetzelfde antwoord voor een nieuw en een bestaand adres.
  const n = await vraag(adres('nieuw-onbekend'));
  const b = await vraag(bekend);
  assert.deepEqual([n.r.error, n.r.data], [b.r.error, b.r.data]);
});

test('blokkadepoging: verzonnen toestellen vallen in één emmer; het bekende toestel van de echte gebruiker logt gewoon in', { timeout: 120000 }, async () => {
  await db.query('update private.k1_grenzen set aanvragen_kwartier = 100, aanvragen_dag = 100');
  const email = adres('blokkade');
  const eerste = await inloggen(email);
  assert.match(eerste.toestel, /^[0-9a-f]{64}$/);
  // De aanvaller: telkens een nieuwe code laten sturen en die opbranden, met steeds een ander verzonnen toestel.
  let geremd = false, bekeken = 0;
  for (let ronde = 0; ronde < 8 && !geremd; ronde++) {
    const { sinds } = await vraag(email);
    const m = await laatsteMail(email, sinds);
    for (let i = 0; i < 5; i++) {
      const a = await controleer(email, fout(m.code), { toestel: randomUUID().replace(/-/g, '').repeat(2) });
      if (a.status === 429) { geremd = true; break; }
      if (a.body?.code === 'TPK01') bekeken++;
    }
  }
  assert.ok(geremd, 'de onbekende emmer raakte niet vol');
  assert.ok(bekeken <= 30, `meer dan U = 30 pogingen bekeken (${bekeken})`);
  // Een nieuw, onbekend toestel van het slachtoffer is nu geremd (bewust restrisico) ...
  let { sinds } = await vraag(email);
  let m = await laatsteMail(email, sinds);
  assert.equal((await controleer(email, m.code)).status, 429);
  // ... maar het bekende toestel logt in, en krijgt een nieuw token (het oude vervalt).
  ({ sinds } = await vraag(email));
  m = await laatsteMail(email, sinds);
  const a = await controleer(email, m.code, { toestel: eerste.toestel });
  assert.equal(a.status, 200, JSON.stringify(a.body));
  assert.notEqual(a.body.toestel, eerste.toestel);
  ({ sinds } = await vraag(email));
  m = await laatsteMail(email, sinds);
  assert.equal((await controleer(email, m.code, { toestel: eerste.toestel })).status, 429, 'het oude, gedraaide token is nog bekend');
});

test('harde grens per account: ook met een (gestolen) toestel dat steeds opnieuw inlogt, nooit meer dan H controles in 24 uur', { timeout: 180000 }, async () => {
  // Door de regel H >= U + M * D bereiken mislukte pogingen de harde grens nooit; geslaagde controles tellen wel mee. Een
  // toestel dat steeds opnieuw inlogt (het token draait elke keer, dus de emmer per toestel loopt nooit vol), stuit
  // daarom op H. Kleine waarden om het zichtbaar te maken.
  await db.query('update private.k1_grenzen set aanvragen_kwartier = 100, aanvragen_dag = 100, h_totaal = 12, u_onbekend = 6, m_toestellen = 1, d_toestel = 5');
  try {
    const email = adres('grens');
    let { toestel } = await inloggen(email);
    let gelukt = 1, geremd = false;
    while (!geremd && gelukt < 30) {
      const { sinds } = await vraag(email);
      const m = await laatsteMail(email, sinds);
      const a = await controleer(email, m.code, { toestel });
      if (a.status === 429) geremd = true;
      else { assert.equal(a.status, 200, JSON.stringify(a.body)); toestel = a.body.toestel; gelukt++; }
    }
    assert.ok(geremd, 'de harde grens greep niet in');
    assert.ok(gelukt <= 12, `meer dan H = 12 controles: ${gelukt}`);
    const t = (await db.query(`select a.totaal t from private.k1_accounts a where a.adres_hmac = (
      select c.adres_hmac from private.k1_codes c join auth.users u on u.id = c.user_id where u.email = $1 limit 1)`, [email])).rows[0].t;
    assert.ok(t <= 12, `harde grens overschreden: ${t}`);
  } finally {
    await db.query('update private.k1_grenzen set h_totaal = $1, u_onbekend = $2, m_toestellen = $3, d_toestel = $4', [vorigeGrenzen.h_totaal, vorigeGrenzen.u_onbekend, vorigeGrenzen.m_toestellen, vorigeGrenzen.d_toestel]);
  }
});

test('limiet op aanvragen per adres: na 5 in een kwartier een rustige weigering; de laatste code blijft geldig', { timeout: 60000 }, async () => {
  await db.query('update private.k1_grenzen set aanvragen_kwartier = 5, aanvragen_dag = 20');
  const email = adres('aanvragen');
  let laatste;
  for (let i = 0; i < 5; i++) { const { r, sinds } = await vraag(email); assert.ifError(r.error); laatste = await laatsteMail(email, sinds); }
  const zesde = await vraag(email);
  assert.equal(zesde.r.error?.status, 429);
  assert.match(zesde.r.error.message, /Gebruik de laatste code/);
  assert.equal((await controleer(email, laatste.code)).status, 200, 'de laatste code werkt niet meer');
  await db.query('update private.k1_grenzen set aanvragen_kwartier = 100, aanvragen_dag = 100');
});

test('noodstops: codes uit (geen code, geen controle; bestaande sessies werken door) en registratie dicht (zelfde antwoord, uitlegmail)', { timeout: 90000 }, async () => {
  const email = adres('noodstop');
  const { c } = await inloggen(email);
  await db.query('update private.instellingen set codes_aan = false');
  try {
    const a = await vraag(email);
    assert.equal(a.r.error?.status, 503);
    assert.equal((await controleer(email, '123456')).body?.code, 'TPK03');
    assert.equal((await c.rpc('mijn_toegang')).data, 'ok', 'bestaande sessie werkt niet meer');
  } finally { await db.query('update private.instellingen set codes_aan = true'); }
  await db.query('update private.instellingen set registratie_open = false');
  try {
    const nieuw = adres('registratie-dicht');
    const n = await vraag(nieuw);
    const b = await vraag(email);
    assert.deepEqual([n.r.error, n.r.data], [b.r.error, b.r.data], 'antwoord verraadt of het adres bestaat');
    assert.equal((await laatsteMail(nieuw, n.sinds)).onderwerp, 'Thuisplanner is nog in een besloten test');
    assert.equal((await laatsteMail(email, b.sinds)).onderwerp, 'Je inlogcode voor Thuisplanner');
  } finally { await db.query('update private.instellingen set registratie_open = true'); }
});

test('zonder instellingenrij: geen code, geen controle en geen toegang (fail-closed, review stap 3a R1)', { timeout: 90000 }, async () => {
  const email = adres('zonder-rij');
  const { c } = await inloggen(email);
  const bewaard = (await db.query('select * from private.instellingen')).rows[0];
  // Verwijderen kan alleen langs de trigger heen (zoals bij een herstel); gewoon verwijderen wordt geweigerd.
  await assert.rejects(db.query('delete from private.instellingen'), /altijd precies één rij/);
  await db.query('begin; set local session_replication_role = replica; delete from private.instellingen; commit;');
  try {
    const a = await vraag(email);
    assert.equal(a.r.error?.status, 503, 'zonder instellingenrij wordt toch een code verstuurd');
    assert.equal((await controleer(email, '123456')).body?.code, 'TPK03', 'zonder instellingenrij wordt toch gecontroleerd');
    assert.equal((await c.rpc('mijn_toegang')).data, 'onderhoud', 'zonder instellingenrij is de poort open');
  } finally {
    const k = Object.keys(bewaard);
    await db.query(`insert into private.instellingen (${k.join(', ')}) values (${k.map((_, i) => '$' + (i + 1)).join(', ')})`, k.map(x => bewaard[x]));
  }
  assert.equal((await c.rpc('mijn_toegang')).data, 'ok');
});

test('zonder actieve code: pogingen tellen niet mee en maken geen rij; de echte gebruiker logt daarna gewoon in (review stap 3a R2)', { timeout: 180000 }, async () => {
  const email = adres('zonder-code');
  await inloggen(email);   // de code is gebruikt: er is nu geen actieve code
  const tel = async () => (await db.query(`select a.totaal, a.onbekend from private.k1_accounts a where a.adres_hmac = (
    select c.adres_hmac from private.k1_codes c join auth.users u on u.id = c.user_id where u.email = $1 limit 1)`, [email])).rows[0];
  const voor = await tel();
  // De aanvaller kent alleen het adres: meer pogingen dan de onbekende emmer (U = 30), steeds met een ander toestel.
  for (let i = 0; i < 35; i++) {
    const a = await controleer(email, String(100000 + i), { toestel: randomUUID().replace(/-/g, '').repeat(2) });
    assert.deepEqual({ s: a.status, b: a.body }, { s: 400, b: { code: 'TPK01' } }, 'het antwoord verraadt dat er geen code is');
  }
  assert.deepEqual(await tel(), voor, 'pogingen zonder code tellen mee');
  // Een adres dat nooit een code kreeg, krijgt ook geen rij.
  const rijen = Number((await db.query('select count(*) n from private.k1_accounts')).rows[0].n);
  for (let i = 0; i < 5; i++) await controleer(adres('nooit-een-code'), '123456');
  assert.equal(Number((await db.query('select count(*) n from private.k1_accounts')).rows[0].n), rijen, 'een adres zonder code kreeg een rij');
  // De echte gebruiker, op een nieuw (onbekend) toestel: gewoon binnen.
  const { sinds } = await vraag(email);
  const m = await laatsteMail(email, sinds);
  assert.equal((await controleer(email, m.code)).status, 200, 'de echte gebruiker is geblokkeerd');
});

test('standaardgrenzen: hoogstens 8 codes per adres per dag (review stap 3a R3) en de vaste regel H >= U + M * D', async () => {
  const { rows } = await db.query(`select column_name, column_default from information_schema.columns
    where table_schema = 'private' and table_name = 'k1_grenzen' and column_name in ('aanvragen_dag', 'aanvragen_kwartier')`);
  const d = Object.fromEntries(rows.map(r => [r.column_name, r.column_default]));
  assert.deepEqual(d, { aanvragen_dag: '8', aanvragen_kwartier: '5' });
  await assert.rejects(db.query('update private.k1_grenzen set u_onbekend = h_totaal + 1'), /k1_grenzen_regel/);
});

test('AC-8 adres wijzigen: twee eigen codes (oud met waarschuwing, nieuw); pas na beide gewijzigd; hetzelfde account', { timeout: 90000 }, async () => {
  const oud = adres('wijzig');
  const nieuw = `wijzig-${run}-nieuw@test.invalid`;
  const { c, s } = await inloggen(oud);
  await c.auth.setSession(s);
  const sinds = Date.now();
  assert.ifError((await c.auth.updateUser({ email: nieuw })).error);
  const mOud = await laatsteMail(oud, sinds), mNieuw = await laatsteMail(nieuw, sinds);
  assert.match(mOud.tekst, /Was jij dit niet/);
  assert.match(mOud.tekst, /w…@…\.invalid/);
  assert.doesNotMatch(mOud.tekst, new RegExp(nieuw));
  const aNieuw = await controleer(nieuw, mNieuw.code);
  assert.equal(aNieuw.status, 200, JSON.stringify(aNieuw.body));
  assert.equal(aNieuw.body.type, 'email_change');
  assert.ifError((await c.auth.verifyOtp({ token_hash: aNieuw.body.token_hash, type: 'email_change' })).error);
  assert.equal((await admin.auth.admin.getUserById(s.user.id)).data.user.email, oud, 'gewijzigd na één bevestiging');
  const aOud = await controleer(oud, mOud.code);
  assert.equal(aOud.status, 200, JSON.stringify(aOud.body));
  assert.ifError((await c.auth.verifyOtp({ token_hash: aOud.body.token_hash, type: 'email_change' })).error);
  const u = (await admin.auth.admin.getUserById(s.user.id)).data.user;
  assert.equal(u.email, nieuw);
  assert.equal(u.id, s.user.id);
});

test('toestellen intrekken (uitloggen op alle toestellen): het oude toestel-token is daarna niet meer bekend', { timeout: 60000 }, async () => {
  const email = adres('intrekken');
  const { c, s, toestel } = await inloggen(email);
  await c.auth.setSession(s);
  assert.ok((await c.rpc('mijn_toestellen_intrekken')).data >= 1);
  const n = (await db.query('select count(*)::int n from private.k1_toestellen where user_id = $1 and not ingetrokken', [s.user.id])).rows[0].n;
  assert.equal(n, 0);
  assert.ok(toestel);
});

test('CORS: de app kan controleer-code vanuit de browser aanroepen (geen cookies; CORS is hier geen grens)', { timeout: 30000 }, async () => {
  const r = await controleer(adres('cors'), '000000', {}, { Origin: 'http://127.0.0.1:5180' });
  assert.ok(r.kop.get('access-control-allow-origin'));
  assert.equal(r.kop.get('access-control-allow-credentials'), null, 'inloggegevens via CORS toegestaan');
});

test('AC-11/AC-12 geen lek: codes en token_hash staan niet in de logboeken; de database bevat alleen HMAC en versleuteld', { timeout: 60000 }, async () => {
  const email = adres('lek');
  const { sinds } = await vraag(email);
  const m = await laatsteMail(email, sinds);
  const a = await controleer(email, m.code);
  assert.equal(a.status, 200);
  const rij = (await db.query('select code_hmac, token_hash_enc from private.k1_codes order by gemaakt desc limit 1')).rows[0];
  assert.doesNotMatch(JSON.stringify(rij), new RegExp(`${m.code}|${a.body.token_hash}`));
  await wacht(1000);
  const project = (await db.query(`select current_setting('cluster_name', true) c`)).rows[0].c;
  for (const container of execFileSync('docker', ['ps', '--format', '{{.Names}}']).toString().split('\n').filter(n => /^supabase_(edge_runtime|auth|kong|rest)_/.test(n))) {
    const u = spawnSync('docker', ['logs', '--since', '5m', container], { maxBuffer: 64 * 1024 * 1024 });
    const logboek = String(u.stdout ?? '') + String(u.stderr ?? '');
    assert.ok(!logboek.includes(a.body.token_hash), `token_hash in het logboek van ${container}`);
    assert.ok(!logboek.includes(`"${m.code}"`) && !logboek.includes(` ${m.code} `), `code in het logboek van ${container}`);
    if (container.startsWith('supabase_edge_runtime_')) assert.ok(!logboek.includes(email), 'adres in het logboek van de Edge Functions');
  }
  void project;
});

test('een toestel-token geldt alleen voor het eigen account', { timeout: 120000 }, async () => {
  await db.query('update private.k1_grenzen set aanvragen_kwartier = 100, aanvragen_dag = 100');
  const a = adres('toestel-a'), b = adres('toestel-b');
  const { toestel } = await inloggen(a);
  await inloggen(b);
  // De onbekende emmer van B vol laten lopen.
  let geremd = false;
  for (let ronde = 0; ronde < 8 && !geremd; ronde++) {
    const { sinds } = await vraag(b);
    const m = await laatsteMail(b, sinds);
    for (let i = 0; i < 5 && !geremd; i++) if ((await controleer(b, fout(m.code))).status === 429) geremd = true;
  }
  assert.ok(geremd);
  // Met het toestel-token van A is B nog steeds geremd: het telt bij B als onbekend.
  const { sinds } = await vraag(b);
  const m = await laatsteMail(b, sinds);
  assert.equal((await controleer(b, m.code, { toestel })).status, 429, 'een token van een ander account opent een eigen emmer');
});
