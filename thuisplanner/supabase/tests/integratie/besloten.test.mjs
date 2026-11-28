// Thuisplanner besloten bèta (pakket P2, migratie 20261125120000) tegen de echte lokale stack: registratie alleen op
// uitnodiging, de uitlegmail met een grens per adres (L1), de grenzen voor uitnodigingsmails per account en per
// ontvanger (R4) en het geheugen voor webhook-id's (L4). Zie docs/thuisplanner-registratie-inloggen.md §29.
// Alleen fictieve adressen op @test.invalid. De tegenproeven staan in k1-tegenproeven.mjs.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHmac, randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';
import { createClient } from '@supabase/supabase-js';
import pg from 'pg';
import { functieEnv } from './testaanbieder.mjs';

const { API_URL, ANON_KEY, SERVICE_ROLE_KEY, DB_URL } = process.env;
if (!API_URL || !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(API_URL)) throw new Error('Weigering: alleen een lokale Supabase');
if (!DB_URL || !/@(127\.0\.0\.1|localhost):\d+\//.test(DB_URL)) throw new Error('Weigering: alleen een lokale database');
const api = new URL(API_URL);
const MAIL = process.env.MAILPIT_URL ?? `http://${api.hostname}:${Number(api.port) + 3}`;
const FUNCTIES = `${API_URL.replace(/\/$/, '')}/functions/v1`;
const ENV = functieEnv();

const geen = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(API_URL, SERVICE_ROLE_KEY, geen);
const db = new pg.Client({ connectionString: DB_URL });
const run = randomUUID().slice(0, 8);
const wacht = ms => new Promise(r => setTimeout(r, ms));
const huishoudens = [];
const PROJECT = process.env.KG_PROJECT_ID ?? 'thuisplanner';
let vorigeInst, vorigeGrenzen, vorigeMail;

before(async () => {
  await db.connect();
  vorigeInst = (await db.query('select * from private.instellingen')).rows[0];
  vorigeGrenzen = (await db.query('select * from private.k1_grenzen')).rows[0];
  vorigeMail = (await db.query('select per_account, per_adres from private.uitnodigingsmail_grenzen')).rows[0];
  // De stand van de besloten bèta: registratie open (voor partners), huishouden_open uit (alleen de testerslijst).
  await db.query('update private.instellingen set wachtwoordsessies_toegestaan = false, codes_aan = true, registratie_open = true, huishouden_open = false');
  await db.query('update private.uitnodigingsmail_grenzen set per_account = 5, per_adres = 3');
});
after(async () => {
  await db.query('update private.instellingen set wachtwoordsessies_toegestaan = $1, codes_aan = $2, registratie_open = $3, huishouden_open = $4',
    [vorigeInst.wachtwoordsessies_toegestaan, vorigeInst.codes_aan, vorigeInst.registratie_open, vorigeInst.huishouden_open]);
  await db.query('update private.k1_grenzen set aanvragen_kwartier = $1, aanvragen_dag = $2', [vorigeGrenzen.aanvragen_kwartier, vorigeGrenzen.aanvragen_dag]);
  await db.query('update private.uitnodigingsmail_grenzen set per_account = $1, per_adres = $2', [vorigeMail.per_account, vorigeMail.per_adres]);
  for (const h of huishoudens) await db.query('delete from public.households where id = $1', [h]);
  await db.query('delete from private.testers where email like $1', [`%-${run}@test.invalid`]);
  const { rows } = await db.query('select id from auth.users where email like $1', [`%-${run}@test.invalid`]);
  for (const r of rows) await admin.auth.admin.deleteUser(r.id);
  await db.end();
});

const adres = naam => `${naam}-${run}@test.invalid`;
const adresHmac = email => createHmac('sha256', ENV.K1_PEPPER).update('adres:' + email.trim().toLowerCase()).digest('hex');
async function mails(email, sinds) {
  const r = await (await fetch(`${MAIL}/api/v1/search?query=${encodeURIComponent('to:' + email)}&limit=50`)).json();
  const lijst = (r.messages || []).filter(m => new Date(m.Created).getTime() >= sinds - 1500).sort((a, b) => new Date(a.Created) - new Date(b.Created));
  return Promise.all(lijst.map(async m => {
    const v = await (await fetch(`${MAIL}/api/v1/message/${m.ID}`)).json();
    return { onderwerp: v.Subject, tekst: v.Text, code: (v.Text.match(/\b(\d{6})\b/) || [])[1] };
  }));
}
// De laatste mail sinds dit moment; de uitnodigingsmail (die vanzelf naar een uitgenodigd adres gaat) telt niet mee.
async function laatsteMail(email, sinds) {
  for (let i = 0; i < 40; i++) {
    const m = (await mails(email, sinds)).filter(x => !/nodigt je uit/.test(x.onderwerp));
    if (m.length) return m.at(-1);
    await wacht(250);
  }
  throw new Error('geen mail voor ' + email);
}
// Een code aanvragen zoals de app (GoTrue staat lokaal 1 aanvraag per seconde per adres toe).
async function vraag(email) {
  const sinds = Date.now();
  const r = await createClient(API_URL, ANON_KEY, geen).auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
  await wacht(1100);
  return { r, sinds };
}
const antwoord = a => JSON.stringify([a.r.error?.status ?? null, a.r.error?.message ?? null, a.r.data]);
async function controleer(email, code) {
  const r = await fetch(`${FUNCTIES}/controleer-code`, {
    method: 'POST', headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, code }),
  });
  return { status: r.status, body: await r.json().catch(() => null) };
}
// Inloggen met een code; geeft de client met sessie.
async function inloggen(email) {
  const { sinds } = await vraag(email);
  const m = await laatsteMail(email, sinds);
  assert.equal(m.onderwerp, 'Je inlogcode voor Thuisplanner', `geen inlogcode maar "${m.onderwerp}"`);
  const a = await controleer(email, m.code);
  assert.equal(a.status, 200, JSON.stringify(a.body));
  const c = createClient(API_URL, ANON_KEY, geen);
  const v = await c.auth.verifyOtp({ token_hash: a.body.token_hash, type: a.body.type });
  assert.ifError(v.error);
  return { c, s: v.data.session };
}
// Een bestaand, bevestigd account buiten de codelaag om (de beheerder maakt de link; er gaat geen mail).
async function bestaandAccount(email) {
  const g = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  assert.ifError(g.error);
  const c = createClient(API_URL, ANON_KEY, geen);
  const v = await c.auth.verifyOtp({ token_hash: g.data.properties.hashed_token, type: 'email' });
  assert.ifError(v.error);
  return { c, s: v.data.session };
}
async function tester(naam) {
  const email = adres(naam);
  await db.query('insert into private.testers (email) values ($1) on conflict do nothing', [email]);
  return { email, ...(await bestaandAccount(email)) };
}
async function huishouden(c, naam = `Bèta ${run}`) {
  const h = await c.rpc('create_household', { p_name: naam, p_display_name: 'Eigenaar' });
  assert.ifError(h.error);
  huishoudens.push(h.data);
  return h.data;
}
async function uitnodigen(c, h, email) {
  const r = await c.rpc('create_invite', { p_household: h, p_role: 'member', p_email: email });
  assert.ifError(r.error);
  return (await db.query('select id from public.household_invites where household_id = $1 and invited_email = $2', [h, email])).rows[0].id;
}
const eersteMail = async invite => (await db.query('select status from private.uitnodigingsmails where invite_id = $1 order by nummer desc limit 1', [invite])).rows[0]?.status;
const codesVan = async email => Number((await db.query(`select count(*) n from private.k1_codes k join auth.users u on u.id = k.user_id where u.email = $1`, [email])).rows[0].n);
const bevestigd = async email => (await db.query('select email_confirmed_at from auth.users where email = $1', [email])).rows[0]?.email_confirmed_at ?? null;

test('een niet-uitgenodigd adres krijgt geen account: zelfde antwoord als een bestaand account, uitlegmail, geen code', { timeout: 90000 }, async () => {
  const vreemd = adres('vreemd');
  const bestaand = adres('bestaand');
  await bestaandAccount(bestaand);   // niet op de testerslijst, geen uitnodiging
  const n = await vraag(vreemd);
  const b = await vraag(bestaand);
  assert.equal(antwoord(n), antwoord(b), 'het antwoord verraadt of het adres een account heeft');
  const uitleg = await laatsteMail(vreemd, n.sinds);
  assert.equal(uitleg.onderwerp, 'Thuisplanner is nog in een besloten test');
  assert.equal(uitleg.code, undefined, 'de uitlegmail bevat een code');
  assert.equal(await codesVan(vreemd), 0, 'er is toch een code gemaakt');
  assert.equal(await bevestigd(vreemd), null, 'het adres is bevestigd');
  assert.equal((await controleer(vreemd, '123456')).body?.code, 'TPK01');
  // Een bestaand account logt gewoon in, ook zonder testerslijst of uitnodiging.
  assert.equal((await laatsteMail(bestaand, b.sinds)).onderwerp, 'Je inlogcode voor Thuisplanner');
  const { c } = await inloggen(bestaand);
  assert.equal((await c.rpc('mijn_toegang')).data, 'ok');
});

test('een adres op de testerslijst krijgt een account en mag een huishouden maken', { timeout: 60000 }, async () => {
  const email = adres('lijst');
  await db.query('insert into private.testers (email) values ($1)', [email]);
  const { c } = await inloggen(email);
  assert.ok(await bevestigd(email));
  await huishouden(c);
});

test('een adres met een open uitnodiging krijgt een account; een verlopen of ingetrokken uitnodiging niet', { timeout: 120000 }, async () => {
  const eigenaar = await tester('eigenaar');
  const h = await huishouden(eigenaar.c);
  const partner = adres('partner');
  const inv = await uitnodigen(eigenaar.c, h, partner);
  const p = await inloggen(partner);
  assert.ifError((await p.c.rpc('accept_invite_by_id', { p_invite: inv, p_display_name: 'Partner' })).error);
  // Verlopen: het adres staat nog in de uitnodiging (tot het opruimen), maar telt niet meer.
  const laat = adres('verlopen');
  const inv2 = await uitnodigen(eigenaar.c, h, laat);
  await db.query(`update public.household_invites set created_at = now() - interval '8 days', expires_at = now() - interval '1 day' where id = $1`, [inv2]);
  const v = await vraag(laat);
  assert.equal((await laatsteMail(laat, v.sinds)).onderwerp, 'Thuisplanner is nog in een besloten test');
  assert.equal(await codesVan(laat), 0);
  // Ingetrokken.
  const weg = adres('ingetrokken');
  const inv3 = await uitnodigen(eigenaar.c, h, weg);
  assert.ifError((await eigenaar.c.rpc('revoke_invite', { p_invite: inv3 })).error);
  const w = await vraag(weg);
  assert.equal((await laatsteMail(weg, w.sinds)).onderwerp, 'Thuisplanner is nog in een besloten test');
  assert.equal(await codesVan(weg), 0);
});

test('L1: hoogstens één uitlegmail per adres per dag, en dezelfde grens voor onbekende adressen als voor accounts', { timeout: 120000 }, async () => {
  await db.query('update private.k1_grenzen set aanvragen_kwartier = 3');
  try {
    const vreemd = adres('l1-vreemd');
    const bestaand = adres('l1-bestaand');
    await bestaandAccount(bestaand);
    const sinds = Date.now();
    const v = [], b = [];
    for (let i = 0; i < 4; i++) { v.push(await vraag(vreemd)); b.push(await vraag(bestaand)); }
    // Aanvraag 1–3 lukt voor allebei; de vierde loopt voor allebei op dezelfde grens vast.
    assert.deepEqual(v.map(antwoord), b.map(antwoord), 'de grenzen verraden welke adressen een account hebben');
    assert.ok(!v[2].r.error && v[3].r.error?.status === 429, JSON.stringify(v.map(x => x.r.error?.status ?? null)));
    await wacht(1500);
    const uitleg = (await mails(vreemd, sinds)).filter(m => m.onderwerp === 'Thuisplanner is nog in een besloten test');
    assert.equal(uitleg.length, 1, `${uitleg.length} uitlegmails in plaats van 1`);
    assert.equal((await mails(bestaand, sinds)).length, 3);
    // Een dag later mag er weer één uitlegmail.
    await db.query(`update private.k1_accounts set uitleg_op = now() - interval '25 hours', aanvragen_kwartier = 0 where adres_hmac = $1`, [adresHmac(vreemd)]);
    const later = await vraag(vreemd);
    assert.equal((await laatsteMail(vreemd, later.sinds)).onderwerp, 'Thuisplanner is nog in een besloten test');
  } finally { await db.query('update private.k1_grenzen set aanvragen_kwartier = $1', [vorigeGrenzen.aanvragen_kwartier]); }
});

test('R4 per account: hoogstens 5 uitnodigingsmails per uitnodiger per 24 uur, over al zijn huishoudens', { timeout: 90000 }, async () => {
  const e = await tester('r4-account');
  const h1 = await huishouden(e.c, `R4 een ${run}`);
  const h2 = await huishouden(e.c, `R4 twee ${run}`);
  const inv = [];
  for (let i = 0; i < 5; i++) inv.push(await uitnodigen(e.c, i < 3 ? h1 : h2, adres(`r4a-${i}`)));
  for (const x of inv) assert.notEqual(await eersteMail(x), 'daglimiet');
  // De zesde, in welk huishouden ook: de uitnodiging geldt, de mail gaat niet.
  const zesde = await uitnodigen(e.c, h2, adres('r4a-5'));
  assert.equal(await eersteMail(zesde), 'daglimiet');
  assert.equal((await db.query('select count(*) n from public.household_invites where id = $1 and invited_email is not null', [zesde])).rows[0].n, '1');
  // "Nog eens sturen" telt ook mee.
  await db.query(`update private.uitnodigingsmails set gevraagd = gevraagd - interval '11 minutes' where invite_id = $1`, [inv[0]]);
  assert.equal((await e.c.rpc('uitnodigingsmail_opnieuw', { p_invite: inv[0] })).error?.code, 'TPM03');
  // Een andere uitnodiger in hetzelfde huishouden heeft nog plek.
  const ander = await tester('r4-ander');
  const h3 = await huishouden(ander.c, `R4 drie ${run}`);
  assert.notEqual(await eersteMail(await uitnodigen(ander.c, h3, adres('r4a-ander'))), 'daglimiet');
});

test('R4 per adres: hoogstens 3 uitnodigingsmails per ontvanger per 24 uur, ook na opnieuw uitnodigen en van een ander', { timeout: 90000 }, async () => {
  const a = await tester('r4-adres-a');
  const b = await tester('r4-adres-b');
  const ha = await huishouden(a.c, `R4 adres a ${run}`);
  const hb = await huishouden(b.c, `R4 adres b ${run}`);
  const gast = adres('r4-gast');
  // Opnieuw uitnodigen trekt de vorige in en begon voorheen weer bij 1. De mails zijn al aangenomen (tellen dus mee).
  for (let i = 0; i < 3; i++) {
    const x = await uitnodigen(a.c, ha, gast);
    assert.notEqual(await eersteMail(x), 'daglimiet');
    await db.query(`update private.uitnodigingsmails set status = 'aangenomen' where invite_id = $1`, [x]);
  }
  assert.equal(await eersteMail(await uitnodigen(a.c, ha, gast)), 'daglimiet');
  assert.equal(await eersteMail(await uitnodigen(b.c, hb, gast)), 'daglimiet');
  // Een ander adres van dezelfde uitnodiger gaat gewoon.
  assert.notEqual(await eersteMail(await uitnodigen(b.c, hb, adres('r4-gast-ander'))), 'daglimiet');
  // De wachtrij bevat geen adres, alleen de HMAC (met een sleutel die alleen de database kent).
  const rijen = (await db.query(`select row_to_json(m)::text as rij, m.ontvanger_hmac from private.uitnodigingsmails m
    where m.household_id = any ($1)`, [[ha, hb]])).rows;
  assert.equal(rijen.length, 6);
  for (const r of rijen) {
    assert.match(r.ontvanger_hmac, /^[0-9a-f]{64}$/);
    assert.ok(!r.rij.includes('@'), 'een adres in de wachtrij');
  }
});

test('L4: een geldig ondertekend hookverzoek werkt maar één keer', { timeout: 60000 }, async () => {
  const email = adres('l4');
  const { s } = await bestaandAccount(email);
  const id = `msg_${randomUUID()}`;
  const tijd = String(Math.floor(Date.now() / 1000));
  const body = JSON.stringify({ user: { id: s.user.id, email }, email_data: { email_action_type: 'magiclink', token_hash: 'a'.repeat(56) } });
  const sleutel = Buffer.from(ENV.K1_HOOK_SECRET.replace(/^v1,/, '').replace(/^whsec_/, ''), 'base64');
  const handtekening = 'v1,' + createHmac('sha256', sleutel).update(`${id}.${tijd}.${body}`).digest('base64');
  const stuur = () => fetch(`${FUNCTIES}/stuur-code`, { method: 'POST', body,
    headers: { 'Content-Type': 'application/json', 'webhook-id': id, 'webhook-timestamp': tijd, 'webhook-signature': handtekening } });
  const sinds = Date.now();
  const eerste = await stuur();
  assert.equal(eerste.status, 200);
  assert.deepEqual(await eerste.json(), {});
  const tweede = await stuur();
  assert.equal(tweede.status, 401, 'een herhaald verzoek werd nog eens verwerkt');
  await wacht(1500);
  assert.equal((await mails(email, sinds)).length, 1, 'het herhaalde verzoek verstuurde een tweede code');
  // Tegelijk: van tien gelijke verzoeken met een nieuwe id wordt er precies één verwerkt.
  const id2 = `msg_${randomUUID()}`;
  const h2 = 'v1,' + createHmac('sha256', sleutel).update(`${id2}.${tijd}.${body}`).digest('base64');
  const tegelijk = await Promise.all(Array.from({ length: 10 }, () => fetch(`${FUNCTIES}/stuur-code`, { method: 'POST', body,
    headers: { 'Content-Type': 'application/json', 'webhook-id': id2, 'webhook-timestamp': tijd, 'webhook-signature': h2 } }).then(r => r.status)));
  assert.equal(tegelijk.filter(x => x === 200).length, 1, JSON.stringify(tegelijk));
});

test('L5: de database roept de wachtrij alleen aan via https, of via http naar de gateway van een lokale stack', { timeout: 60000 }, async () => {
  // Elk adres in één transactie die wordt teruggedraaid: Vault blijft zoals het was en pg_net verstuurt niets (een
  // verzoek gaat pas na de commit weg).
  const pad = '/functions/v1/stuur-uitnodiging';
  const met = async url => {
    await db.query('begin');
    try {
      await db.query(`select vault.update_secret(id, $1) from vault.decrypted_secrets where name = 'thuisplanner_wachtrij_url'`, [url]);
      const r = (await db.query('select private.uitnodigingsmail_aanroepen() as mail, private.documenten_opruimen_ronde() as opruimen')).rows[0];
      return [r.mail, r.opruimen];
    } finally { await db.query('rollback'); }
  };
  for (const url of [`http://voorbeeld.test${pad}`, `http://192.0.2.1:8000${pad}`, `http://localhost.voorbeeld.test${pad}`,
    `http://localhost@voorbeeld.test${pad}`, `http://kong.voorbeeld.test${pad}`, `ftp://voorbeeld.test${pad}`,
    // Ook geen andere lokale http-adressen meer: alleen de gateway van een lokale stack.
    `http://127.0.0.1:54321${pad}`, `http://localhost:54321${pad}`, `http://host.docker.internal:54321${pad}`, `http://kong:8000${pad}`,
    `http://supabase_kong_thuisplanner${pad}`, `http://supabase_kong_thuisplanner.voorbeeld.test:8000${pad}`,
    `HTTP://supabase_kong_thuisplanner:8000${pad}`, `https://iemand@voorbeeld.test${pad}`, `https://voorbeeld.test:443${pad}`,
    // Alleen de functie stuur-uitnodiging, en niets erachter.
    'https://voorbeeld.test/functions/v1/opruimen-documenten', `https://voorbeeld.test${pad}/extra`, `https://voorbeeld.test${pad}?x=1`,
    `https://voorbeeld.test/iets${pad}`, `https://voorbeeld.test${pad}\n`, `https://${pad}`, '',
    // Een poort van één cijfer is geen gateway.
    `http://supabase_kong_thuisplanner:8${pad}`]) {
    assert.deepEqual(await met(url), [false, false], `aangeroepen via ${JSON.stringify(url)}`);
  }
  for (const url of [`https://voorbeeld.test${pad}`, `https://abcdefghijklmnopqrst.supabase.co${pad}`,
    `http://supabase_kong_thuisplanner:8000${pad}`, `http://supabase_kong_thuisplanner_p2:56601${pad}`]) {
    assert.deepEqual(await met(url), [true, true], `niet aangeroepen via ${url}`);
  }
});

test('geen adresverraad via de tijd: ook zonder mail duurt het antwoord even lang', { timeout: 90000 }, async () => {
  const vreemd = adres('tijd-vreemd');
  const bestaand = adres('tijd-bestaand');
  await bestaandAccount(bestaand);
  await vraag(vreemd);   // de eerste keer: de uitlegmail
  const duur = async email => {
    const begin = performance.now();
    const r = await createClient(API_URL, ANON_KEY, geen).auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
    const ms = performance.now() - begin;
    await wacht(1100);
    assert.ifError(r.error);
    return ms;
  };
  // Daarna gaat er niets meer (registratie-stil); toch even lang als een verstuurde inlogcode.
  for (let i = 0; i < 2; i++) {
    const stil = await duur(vreemd);
    const code = await duur(bestaand);
    assert.ok(stil >= 1400, `het stille antwoord kwam na ${Math.round(stil)} ms`);
    assert.ok(code >= 1400, `de inlogcode kwam na ${Math.round(code)} ms`);
  }
  assert.equal((await mails(vreemd, 0)).filter(m => m.onderwerp === 'Thuisplanner is nog in een besloten test').length, 1);
});

test('oude ingang (zonder adres): nooit een nieuw account, en geen stille uitkomst die een oude functie niet kent', { timeout: 30000 }, async () => {
  const email = adres('oude-ingang');
  await db.query('insert into private.testers (email) values ($1)', [email]);   // zelfs op de testerslijst
  const h = adresHmac(email);
  const oud = async () => (await db.query(`select uitkomst from private.k1_nieuwe_code($1, $2::uuid, 'signup', $3, $4)`,
    [h, randomUUID(), 'x'.repeat(64), 'versleuteld'])).rows[0].uitkomst;
  await db.query('begin');
  try {
    assert.equal(await oud(), 'registratie-dicht');
    assert.equal(await oud(), 'registratie-dicht', 'de oude ingang gaf een uitkomst die een oude functie niet kent');
    // De nieuwe ingang zwijgt de tweede keer wel.
    assert.equal((await db.query(`select uitkomst from private.k1_nieuwe_code($1, null, $2::uuid, 'signup', $3, $4)`,
      [h, randomUUID(), 'x'.repeat(64), 'versleuteld'])).rows[0].uitkomst, 'registratie-stil');
  } finally { await db.query('rollback'); }
});

test('zonder grenzenrij geen codes (fail-closed)', { timeout: 30000 }, async () => {
  const email = adres('grenzenrij');
  await db.query('insert into private.testers (email) values ($1)', [email]);
  await db.query('begin');
  try {
    await db.query('delete from private.k1_grenzen');
    const r = await db.query(`select uitkomst from private.k1_nieuwe_code($1, $2, $3::uuid, 'signup', $4, $5)`,
      [adresHmac(email), email, randomUUID(), 'x'.repeat(64), 'versleuteld']);
    assert.equal(r.rows[0].uitkomst, 'codes-uit');
  } finally { await db.query('rollback'); }
});

test('huishouden_open: dan krijgt iedereen een account', { timeout: 60000 }, async () => {
  await db.query('update private.instellingen set huishouden_open = true');
  try {
    const email = adres('huishouden-open');
    await inloggen(email);
    assert.ok(await bevestigd(email));
  } finally { await db.query('update private.instellingen set huishouden_open = false'); }
});

test('R4 tegelijk: twee uitnodigers die op hetzelfde moment hetzelfde adres uitnodigen gaan samen niet over de grens', { timeout: 90000 }, async () => {
  // Deterministisch met twee eigen databaseverbindingen: de tweede uitnodiging moet op de vergrendeling van het adres
  // wachten tot de eerste klaar is, en ziet dan dat de grens (hier 1) al bereikt is.
  const a = await tester('r4-tegelijk-a');
  const b = await tester('r4-tegelijk-b');
  const ha = await huishouden(a.c, `R4 tegelijk a ${run}`);
  const hb = await huishouden(b.c, `R4 tegelijk b ${run}`);
  const gast = adres('r4-tegelijk');
  const ida = (await db.query('select id from auth.users where email = $1', [a.email])).rows[0].id;
  const idb = (await db.query('select id from auth.users where email = $1', [b.email])).rows[0].id;
  const nieuweInvite = `insert into public.household_invites (household_id, token_hash, created_by, invited_email)
    values ($1, encode(extensions.gen_random_bytes(32), 'hex'), $2, $3) returning id`;
  const een = new pg.Client({ connectionString: DB_URL });
  const twee = new pg.Client({ connectionString: DB_URL });
  await een.connect();
  await twee.connect();
  await db.query('update private.uitnodigingsmail_grenzen set per_adres = 1');
  try {
    await een.query('begin');
    const x = (await een.query(nieuweInvite, [ha, ida, gast])).rows[0].id;
    let klaar = false;
    const later = twee.query(nieuweInvite, [hb, idb, gast]).then(r => { klaar = true; return r.rows[0].id; });
    await wacht(500);
    assert.equal(klaar, false, 'de tweede uitnodiging wachtte niet op de eerste (geen vergrendeling op het adres)');
    await een.query('commit');
    const y = await later;
    assert.notEqual(await eersteMail(x), 'daglimiet');
    assert.equal(await eersteMail(y), 'daglimiet');
  } finally {
    await een.query('rollback').catch(() => {});
    await db.query('update private.uitnodigingsmail_grenzen set per_adres = 3');
    await een.end();
    await twee.end();
  }
});

test('herstel en herbevestiging: stil geweigerd, zonder mail, met hetzelfde antwoord als voor een onbekend adres', { timeout: 90000 }, async () => {
  // Restrisico M1 (§29): Supabase Auth antwoordt bij een onbekend adres zelf, zonder de hook. Een weigering (400) van de
  // hook bij een bestaand account zou dat verschil verraden; nu antwoordt de hook meteen met succes, zonder mail.
  const bestaand = adres('herstel-bestaand');
  const { s } = await bestaandAccount(bestaand);
  const herstel = async email => {
    const begin = performance.now();
    const r = await fetch(`${API_URL}/auth/v1/recover`, { method: 'POST', headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }) });
    const ms = Math.round(performance.now() - begin);
    const body = await r.text();
    await wacht(1100);
    return { status: r.status, body, ms };
  };
  const sinds = Date.now();
  const metingen = [];
  for (let i = 0; i < 2; i++) metingen.push({ bestaand: await herstel(bestaand), onbekend: await herstel(adres(`herstel-onbekend-${i}`)) });
  console.log('meting herstel (status, ms):', JSON.stringify(metingen.map(m => [m.bestaand.status, m.bestaand.ms, m.onbekend.status, m.onbekend.ms])));
  for (const m of metingen) {
    assert.equal(m.bestaand.status, m.onbekend.status, `herstel: ${m.bestaand.body} tegenover ${m.onbekend.body}`);
    assert.equal(m.bestaand.body, m.onbekend.body);
  }
  const c = createClient(API_URL, ANON_KEY, geen);
  await c.auth.setSession(s);
  assert.ifError((await c.auth.reauthenticate()).error);
  await wacht(1500);
  assert.equal((await mails(bestaand, sinds)).length, 0, 'er ging toch een mail uit');
});

test('uitlegmail mislukt: dezelfde 503 als bij een inlogcode die niet verstuurd kan worden', { timeout: 120000 }, async () => {
  // De mailaanbieder van de lokale stack (Mailpit) tijdelijk uit: versturen mislukt voor allebei.
  const vreemd = adres('storing-vreemd');
  const bestaand = adres('storing-bestaand');
  await bestaandAccount(bestaand);
  const mailpit = `supabase_inbucket_${PROJECT}`;
  execFileSync('docker', ['stop', mailpit], { stdio: 'ignore' });
  let n, b;
  try {
    n = await vraag(vreemd);
    b = await vraag(bestaand);
  } finally {
    execFileSync('docker', ['start', mailpit], { stdio: 'ignore' });
    for (let i = 0; i < 60; i++) { try { if ((await fetch(`${MAIL}/api/v1/messages?limit=1`)).ok) break; } catch { /* nog niet */ } await wacht(500); }
  }
  assert.ok(b.r.error, 'de inlogcode ging toch');
  assert.equal(antwoord(n), antwoord(b), 'een storing verraadt welk adres een account heeft');
});
