// Thuisplanner D6: de uitnodigingsmail, automatisch verstuurd, tegen de echte lokale stack: de database (wachtrij,
// pg_net, pg_cron, Vault), de Edge Functions stuur-uitnodiging en mail-bezorging, Mailpit, en een nagebootste aanbieder
// (testaanbieder.mjs) voor storingen, verloren antwoorden, idempotentie en bezorgmeldingen. Zie
// docs/thuisplanner-uitnodigingsmail-verzending.md (V1 tot en met V9) en docs/thuisplanner-registratie-inloggen.md §15
// (T16 tot en met T18).
//
// Een paar tests stoppen of herstarten een container van de lokale stack (KG_PROJECT_ID, standaard "thuisplanner") om
// storingen en herstarts na te spelen. Alleen lokaal.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';
import { createClient } from '@supabase/supabase-js';
import pg from 'pg';
import { functieEnv, startTestaanbieder } from './testaanbieder.mjs';

const { API_URL, ANON_KEY, SERVICE_ROLE_KEY, DB_URL } = process.env;
if (!API_URL || !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(API_URL)) throw new Error('Weigering: alleen een lokale Supabase');
if (!DB_URL || !/@(127\.0\.0\.1|localhost):\d+\//.test(DB_URL)) throw new Error('Weigering: alleen een lokale database');
const api = new URL(API_URL);
const MAIL = process.env.MAILPIT_URL ?? `http://${api.hostname}:${Number(api.port) + 3}`;
const FUNCTIES = `${API_URL.replace(/\/$/, '')}/functions/v1`;
const PROJECT = process.env.KG_PROJECT_ID ?? 'thuisplanner';
const GEHEIM = functieEnv().WACHTRIJ_GEHEIM;

const geen = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(API_URL, SERVICE_ROLE_KEY, geen);
let db = new pg.Client({ connectionString: DB_URL });
const run = randomUUID().slice(0, 8);
const accounts = [];
const huishoudens = [];
let vorige, aanbieder;
const wacht = ms => new Promise(r => setTimeout(r, ms));
async function tot(fn, ms = 15000, wat = 'voorwaarde') {
  const eind = Date.now() + ms;
  for (;;) { if (await fn()) return; if (Date.now() > eind) throw new Error('niet op tijd: ' + wat); await wacht(250); }
}
const docker = (...a) => execFileSync('docker', a, { stdio: 'ignore' });

before(async () => {
  await db.connect();
  vorige = (await db.query('select * from private.instellingen')).rows[0];
  await db.query(`update private.instellingen set wachtwoordsessies_toegestaan = false, huishouden_open = true, mail_testaanbieder = 'gewoon'`);
  aanbieder = await startTestaanbieder(Number(api.port) + 7);
});
after(async () => {
  try { alsBeheerder('alter role authenticator login'); } catch { /* de stack is weg */ }
  await aanbieder?.stop();
  for (const h of huishoudens) await db.query('delete from public.households where id = $1', [h]);
  for (const id of accounts) await admin.auth.admin.deleteUser(id);
  await db.query('update private.instellingen set wachtwoordsessies_toegestaan = $1, huishouden_open = $2, mail_testaanbieder = $3',
    [vorige.wachtwoordsessies_toegestaan, vorige.huishouden_open, vorige.mail_testaanbieder]);
  await db.end();
});

const adres = naam => `${naam}-${run}@test.invalid`;
const zetAanbieder = w => db.query('update private.instellingen set mail_testaanbieder = $1', [w]);
async function codeSessie(email) {
  const g = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  assert.ifError(g.error);
  accounts.push(g.data.user.id);
  const c = createClient(API_URL, ANON_KEY, geen);
  const v = await c.auth.verifyOtp({ token_hash: g.data.properties.hashed_token, type: 'email' });
  assert.ifError(v.error);
  return { c, s: v.data.session };
}
async function huishouden(c, naam = `Mail ${run}`) {
  const h = await c.rpc('create_household', { p_name: naam, p_display_name: 'Olaf' });
  assert.ifError(h.error);
  huishoudens.push(h.data);
  return h.data;
}
async function uitnodigen(c, h, email, rol = 'member') {
  const r = await c.rpc('create_invite', { p_household: h, p_role: rol, p_email: email });
  assert.ifError(r.error);
  return (await db.query('select id from public.household_invites where household_id = $1 and invited_email = $2', [h, email])).rows[0].id;
}
const rijen = invite => db.query('select * from private.uitnodigingsmails where invite_id = $1 order by nummer', [invite]).then(r => r.rows);
const standen = async invite => (await rijen(invite)).map(r => r.status);
// Wacht tot de mail weer in de wachtrij staat na n pogingen, en geeft die rij terug. Stand, pogingen en "volgende" komen
// uit één en dezelfde lezing: met losse lezingen kan de functie de mail er tussendoor oppakken (stand nog "wacht" van de
// vorige poging, pogingen al opgehoogd, "volgende" nog de oude), en meet de test een tijd die nooit zo gepland is.
async function gepland(invite, n, wat) {
  let rij;
  await tot(async () => { [rij] = await rijen(invite); return rij?.status === 'wacht' && rij.pogingen === n; }, 20000, wat);
  return rij;
}
// Bij een time-out de hele keten in één blik (cron → pg_net → functie → PostgREST → wachtrij), zonder adressen: zo
// verklaart een mislukte run in CI zichzelf (tweede review PR #54).
async function keten(invite) {
  const q = async (sql, p = []) => { try { return (await db.query(sql, p)).rows; } catch (e) { return 'fout: ' + e.message; } };
  const logs = (naam, filter) => {
    const r = spawnSync('docker', ['logs', '--since', '4m', naam], { encoding: 'utf8' });
    return `${r.stdout ?? ''}${r.stderr ?? ''}`.split('\n').filter(l => filter.test(l)).slice(-12).map(l => l.slice(0, 220));
  };
  return JSON.stringify({
    mail: await q('select status, pogingen, volgende, bezig_tot, now() as nu from private.uitnodigingsmails where invite_id = $1 order by nummer', [invite]),
    cron: await q(`select d.status, left(d.return_message, 80) as melding, d.start_time from cron.job_run_details d join cron.job j using (jobid)
                   where j.jobname = 'thuisplanner-uitnodigingsmails-versturen' order by d.start_time desc limit 4`),
    pgnet: await q('select id, status_code, left(error_msg, 120) as fout, timed_out, created from net._http_response order by id desc limit 4'),
    pgnetWachtrij: await q('select count(*)::int as n from net.http_request_queue'),
    functie: logs(`supabase_edge_runtime_${PROJECT}`, /stuur-uitnodiging/),
    postgrest: logs(`supabase_rest_${PROJECT}`, /fail|retry|error|reconnect|connected/i),
  }, null, 1);
}
const klaarMet = async (invite, ms) => {
  try { await tot(async () => (await rijen(invite)).every(r => !['wacht', 'bezig'].includes(r.status)), ms, 'mail verwerkt'); }
  catch (e) { e.message += '\nketen: ' + await keten(invite); throw e; }
};
// Zoals vlak na een herstart van de database: PostgREST draait, maar heeft (nog) geen verbinding en antwoordt 503
// (PGRST001). Na te spelen door zijn inlogrol even te blokkeren en zijn verbindingen te sluiten (alleen lokaal, als
// supabase_admin in de container). Kong vangt dit niet op: een draaiende PostgREST die 503 geeft, is een antwoord.
const alsBeheerder = sql => execFileSync('docker', ['exec', `supabase_db_${PROJECT}`, 'psql', '-U', 'supabase_admin', '-d', 'postgres', '-Atq', '-c', sql], { stdio: 'ignore' });
const restZonderDb = () => alsBeheerder(`alter role authenticator nologin; select pg_terminate_backend(pid) from pg_stat_activity where usename = 'authenticator'`);
const restMetDb = async () => {
  alsBeheerder('alter role authenticator login');
  await tot(async () => !(await admin.rpc('mail_testaanbieder')).error, 60000, 'PostgREST weer verbonden');
};
// Zonder het vangnet van pg_cron: zo bewijst een test dat déze ronde het werk afmaakt, niet de volgende minuut.
async function zonderCron(f) {
  const job = `(select jobid from cron.job where jobname = 'thuisplanner-uitnodigingsmails-versturen')`;
  await db.query(`select cron.alter_job(job_id := ${job}, active := false)`);
  try { await f(); } finally { await db.query(`select cron.alter_job(job_id := ${job}, active := true)`); }
}
// De tijd vooruit zetten (de wachttijd is voorbij) en een ronde draaien, zoals het vangnet elke minuut doet.
const vooruit = invite => db.query(`update private.uitnodigingsmails set volgende = now() - interval '1 second' where invite_id = $1 and status = 'wacht'`, [invite]);
const ronde = () => db.query('select private.uitnodigingsmail_ronde()');
// Een Vault-waarde even onvindbaar maken (en terug), via de functie van Vault zelf (de tabel is niet direct te wijzigen).
const hernoem = (oud, nieuw) => db.query('select vault.update_secret(id, decrypted_secret, $2) from vault.decrypted_secrets where name = $1', [oud, nieuw]);
const terug = (invite, minuten) => db.query(`update private.uitnodigingsmails set gevraagd = gevraagd - make_interval(mins => $2) where invite_id = $1`, [invite, minuten]);
// Rust in de verzending: pg_net heeft geen verzoek meer in de wachtrij, en elke aanroep die al liep, heeft daarna tijd
// om zijn (lege) volgende ronde te doen en te stoppen. De functie antwoordt meteen (202) en werkt daarna verder; met niets
// meer te doen, stopt hij na één lege ronde.
async function rust() {
  await tot(async () => Number((await db.query('select count(*) from net.http_request_queue')).rows[0].count) === 0, 30000, 'pg_net leeg');
  await wacht(3000);
}
const wachtrij = (kop = {}) => fetch(`${FUNCTIES}/stuur-uitnodiging`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...kop }, body: '{}' }).then(r => r.status);
async function mailpit(email) {
  const r = await (await fetch(`${MAIL}/api/v1/search?query=${encodeURIComponent('to:' + email)}&limit=50`)).json();
  return Promise.all((r.messages ?? []).map(async m => {
    const v = await (await fetch(`${MAIL}/api/v1/message/${m.ID}`)).json();
    const k = await (await fetch(`${MAIL}/api/v1/message/${m.ID}/headers`)).json();
    return { id: m.ID, onderwerp: v.Subject, tekst: v.Text, html: v.HTML, sleutel: k['X-Thuisplanner-Sleutel']?.[0] ?? null };
  }));
}

test('V1: niemand opent de app, de mail gaat vanzelf; "aangenomen" is nog niet "bezorgd"; T18 alleen met een geldige handtekening', { timeout: 60000 }, async () => {
  const { c } = await codeSessie(adres('v1'));
  const h = await huishouden(c);
  const gast = adres('v1-gast');
  // Het vangnet even uit: zo is bewezen dat het seintje van de database de mail verstuurt (geen app, geen test, geen
  // geplande taak).
  const taak = (await db.query(`select jobid from cron.job where jobname = 'thuisplanner-uitnodigingsmails-versturen'`)).rows[0].jobid;
  await db.query('select cron.alter_job($1, active := false)', [taak]);
  let inv;
  try {
    inv = await uitnodigen(c, h, gast);
    await tot(async () => aanbieder.voor(gast).length === 1, 15000, 'mail bij de aanbieder');
  } finally { await db.query('select cron.alter_job($1, active := true)', [taak]); }
  await klaarMet(inv);
  const [rij] = await rijen(inv);
  assert.equal(rij.status, 'aangenomen');
  assert.equal(rij.bericht_id, aanbieder.voor(gast)[0].id);
  assert.equal(aanbieder.voor(gast)[0].sleutel, rij.id, 'de rij-id is de idempotentiesleutel');
  let st = (await c.rpc('uitnodigingsmails', { p_household: h })).data[0];
  assert.equal(st.status, 'aangenomen');
  assert.ok(st.aangenomen_op && !st.bezorgd_op);
  // Een valse melding verandert niets; een geldige maakt hem bezorgd; een latere bounce wint.
  assert.equal(await aanbieder.bezorg(FUNCTIES, rij.bericht_id, 'bezorgd', { vals: true }), 401);
  assert.deepEqual(await standen(inv), ['aangenomen']);
  assert.equal(await aanbieder.bezorg(FUNCTIES, rij.bericht_id, 'bezorgd'), 200);
  st = (await c.rpc('uitnodigingsmails', { p_household: h })).data[0];
  assert.equal(st.status, 'bezorgd');
  assert.ok(st.bezorgd_op);
  assert.equal(await aanbieder.bezorg(FUNCTIES, rij.bericht_id, 'niet_bezorgd'), 200);
  assert.deepEqual(await standen(inv), ['niet_bezorgd']);
  // Een latere "bezorgd" maakt een bounce niet ongedaan.
  assert.equal(await aanbieder.bezorg(FUNCTIES, rij.bericht_id, 'bezorgd'), 200);
  assert.deepEqual(await standen(inv), ['niet_bezorgd']);
  // Een onbekend bericht-id verandert niets; een gebruiker kan de bezorging niet zelf zetten.
  assert.equal(await aanbieder.bezorg(FUNCTIES, 'test-onbekend', 'bezorgd'), 200);
  assert.ok((await c.rpc('uitnodigingsmail_bezorging', { p_bericht: rij.bericht_id, p_uitkomst: 'bezorgd' })).error);
  assert.deepEqual(await standen(inv), ['niet_bezorgd']);
});

test('lokale ontwikkelstand (Mailpit): één mail, zonder token, met vaste tekst', { timeout: 60000 }, async () => {
  await zetAanbieder(null);
  try {
    const { c } = await codeSessie(adres('mailpit'));
    const h = await huishouden(c, 'Familie <b>www.reclame.nl</b>');
    const gast = adres('mailpit-gast');
    const inv = await uitnodigen(c, h, gast);
    await tot(async () => (await mailpit(gast)).length === 1, 15000, 'mail in Mailpit');
    await klaarMet(inv);
    const [m] = await mailpit(gast);
    const [rij] = await rijen(inv);
    assert.equal(rij.status, 'aangenomen');
    assert.equal(m.sleutel, rij.id);
    assert.doesNotMatch(m.tekst + m.html, /[0-9a-f]{64}|uitnodiging\/|token/i);
    assert.doesNotMatch(m.tekst + m.onderwerp, /reclame|www\.|<b>/);
    assert.match(m.tekst, /Olaf nodigt je uit voor een huishouden in Thuisplanner/);
    assert.doesNotMatch(m.onderwerp, /@/);
  } finally { await zetAanbieder('gewoon'); }
});

test('T16: het antwoord gaat verloren nadat de aanbieder verstuurde (niet idempotent): onzeker, en nooit een tweede mail', { timeout: 90000 }, async () => {
  const { c } = await codeSessie(adres('t16'));
  const h = await huishouden(c);
  const gast = adres('t16-gast');
  aanbieder.zet('verlies');
  const inv = await uitnodigen(c, h, gast);
  await klaarMet(inv, 20000);
  assert.deepEqual(await standen(inv), ['onzeker']);
  assert.equal(aanbieder.voor(gast).length, 1, 'de aanbieder verstuurde hem wel');
  // Rondes van het vangnet, ook "later": geen nieuwe poging.
  await db.query(`update private.uitnodigingsmails set volgende = now() - interval '1 hour' where invite_id = $1`, [inv]);
  await ronde(); await wacht(1500); await ronde(); await wacht(1500);
  assert.equal(aanbieder.voor(gast).length, 1);
  assert.deepEqual(await standen(inv), ['onzeker']);
  // De uitnodiger ziet "onzeker" en kan zelf nog eens sturen (een nieuwe rij, met de grenzen).
  assert.equal((await c.rpc('uitnodigingsmails', { p_household: h })).data[0].status, 'onzeker');
  // De functie stopte halverwege (de rij bleef "bezig", de termijn verliep): ook dat wordt "onzeker", niet opnieuw.
  await terug(inv, 11);
  assert.ifError((await c.rpc('uitnodigingsmail_opnieuw', { p_invite: inv })).error);
  await klaarMet(inv);
  const tweede = (await rijen(inv))[1];
  await db.query(`update private.uitnodigingsmails set status = 'bezig', bezig_tot = now() - interval '1 second' where id = $1`, [tweede.id]);
  const voor = aanbieder.voor(gast).length;
  await ronde(); await wacht(2000);
  assert.equal((await rijen(inv))[1].status, 'onzeker');
  assert.equal(aanbieder.voor(gast).length, voor);
  // Een late uitkomst verandert niets meer (alleen vanuit "bezig").
  assert.ifError((await admin.rpc('uitnodigingsmail_klaar', { p_id: tweede.id, p_uitkomst: 'aangenomen', p_bericht: 'x' })).error);
  assert.equal((await rijen(inv))[1].status, 'onzeker');
  // Ook als de aanbieder niets verstuurde maar te laat antwoordde: onzeker (de adapter kan dat niet weten).
  const gast2 = adres('t16-traag');
  aanbieder.zet('traag');
  const inv2 = await uitnodigen(c, h, gast2);
  await klaarMet(inv2, 20000);
  assert.deepEqual(await standen(inv2), ['onzeker']);
  assert.equal(aanbieder.voor(gast2).length, 0);
});

test('T16 met een idempotente aanbieder: het antwoord gaat verloren, de nieuwe poging met dezelfde sleutel geeft geen tweede mail', { timeout: 90000 }, async () => {
  await zetAanbieder('idempotent');
  try {
    const { c } = await codeSessie(adres('idem'));
    const h = await huishouden(c);
    const gast = adres('idem-gast');
    aanbieder.zet('verlies');
    const inv = await uitnodigen(c, h, gast);
    // Na het verloren antwoord: weer "wacht", met de wachttijd van een eerste nieuwe poging (1 minuut).
    await tot(async () => { const [r] = await rijen(inv); return r.status === 'wacht' && r.pogingen === 1; }, 20000, 'terug in de wachtrij');
    const [r1] = await rijen(inv);
    const s = (new Date(r1.volgende) - Date.now()) / 1000;
    assert.ok(s > 40 && s <= 61, `wachttijd ${s} s`);
    await vooruit(inv);
    await ronde();
    await klaarMet(inv);
    assert.deepEqual(await standen(inv), ['aangenomen']);
    assert.equal(aanbieder.voor(gast).length, 1, 'precies één mail');
    assert.equal(aanbieder.herhaald, 1, 'de aanbieder herkende de sleutel');
    assert.equal((await rijen(inv))[0].bericht_id, aanbieder.voor(gast)[0].id);
  } finally { await zetAanbieder('gewoon'); }
});

test('opnieuw proberen: een storing na 1, 4 en 9 minuten, daarna mislukt; 429 volgt de wachttijd van de aanbieder; 4xx meteen mislukt', { timeout: 90000 }, async () => {
  const { c } = await codeSessie(adres('storing'));
  const h = await huishouden(c);
  const gast = adres('storing-gast');
  // De klaargezette antwoorden gelden voor de eerstvolgende verzoeken bij de aanbieder, van wie ook. Faalt deze test
  // halverwege, dan mogen ze niet blijven staan voor de mail van een volgende test.
  try {
    aanbieder.zet('503', '503', '503', '503');
    const inv = await uitnodigen(c, h, gast);
    for (const minuten of [1, 4, 9]) {
      const rij = await gepland(inv, [1, 4, 9].indexOf(minuten) + 1, 'nieuwe poging gepland');
      const s = (new Date(rij.volgende) - Date.now()) / 1000;
      assert.ok(s > minuten * 60 - 20 && s <= minuten * 60 + 1, `na ${minuten} min: ${s} s`);
      await vooruit(inv);
      await ronde();
    }
    await klaarMet(inv, 20000);
    assert.deepEqual(await standen(inv), ['mislukt']);
    assert.equal((await rijen(inv))[0].pogingen, 4);
    assert.equal(aanbieder.voor(gast).length, 0);
    // 429 met Retry-After van 10 minuten: de wachttijd van de aanbieder gaat voor (langer dan 1 minuut).
    const gast2 = adres('storing-429');
    aanbieder.zet('429:600');
    const inv2 = await uitnodigen(c, h, gast2);
    const rij2 = await gepland(inv2, 1, '429 gepland');
    const s2 = (new Date(rij2.volgende) - Date.now()) / 1000;
    assert.ok(s2 > 560 && s2 <= 601, `429: ${s2} s`);
    // 400: meteen mislukt, geen nieuwe poging.
    const gast3 = adres('storing-400');
    aanbieder.zet('400');
    const inv3 = await uitnodigen(c, h, gast3);
    await klaarMet(inv3, 20000);
    assert.deepEqual(await standen(inv3), ['mislukt']);
    assert.equal((await c.rpc('uitnodigingsmails', { p_household: h })).data.find(x => x.invite_id === inv3).status, 'mislukt');
  } finally { aanbieder.gedrag.length = 0; }
});

test('T17: "nog eens sturen" vier keer: hoogstens 3 mails, één per 10 minuten, afgedwongen in de database', { timeout: 90000 }, async () => {
  const { c } = await codeSessie(adres('t17'));
  const h = await huishouden(c);
  const gast = adres('t17-gast');
  const inv = await uitnodigen(c, h, gast);
  await klaarMet(inv);
  const opnieuw = () => c.rpc('uitnodigingsmail_opnieuw', { p_invite: inv });
  assert.equal((await opnieuw()).error?.code, 'TPM01');
  await terug(inv, 11);
  assert.ifError((await opnieuw()).error);
  assert.equal((await opnieuw()).error?.code, 'TPM01');
  await klaarMet(inv);
  await terug(inv, 11);
  // Gelijktijdig: tien keer tegelijk; precies één slaagt (huishoudvergrendeling); de rest krijgt "wacht 10 minuten" of,
  // als de winnaar al de derde mail maakte, "al 3 keer".
  const tegelijk = await Promise.all(Array.from({ length: 10 }, () => opnieuw()));
  assert.equal(tegelijk.filter(x => !x.error).length, 1);
  assert.ok(tegelijk.filter(x => x.error).every(x => ['TPM01', 'TPM02'].includes(x.error.code)), JSON.stringify(tegelijk.map(x => x.error?.code)));
  await klaarMet(inv);
  await terug(inv, 11);
  assert.equal((await opnieuw()).error?.code, 'TPM02');
  assert.equal(aanbieder.voor(gast).length, 3);
  assert.deepEqual((await rijen(inv)).map(x => x.nummer), [1, 2, 3]);
  assert.ok((await c.from('uitnodigingsmails').select('id')).error);
  await assert.rejects(db.query(`insert into private.uitnodigingsmails (invite_id, household_id, nummer) values ($1, $2, 4)`, [inv, h]));
});

test('daglimiet: hoogstens 20 uitnodigingsmails per huishouden per 24 uur; de uitnodiging zelf blijft geldig', { timeout: 90000 }, async () => {
  const { c } = await codeSessie(adres('dag'));
  const h = await huishouden(c);
  for (let i = 0; i < 20; i++) {
    const inv = await uitnodigen(c, h, adres(`dag-${i}`));
    assert.ifError((await c.rpc('revoke_invite', { p_invite: inv })).error);
  }
  await db.query(`update private.uitnodigingsmails set status = 'aangenomen' where household_id = $1`, [h]);
  const gast = adres('dag-gast');
  const inv = await uitnodigen(c, h, gast);
  assert.deepEqual(await standen(inv), ['daglimiet']);
  await terug(inv, 11);
  assert.equal((await c.rpc('uitnodigingsmail_opnieuw', { p_invite: inv })).error?.code, 'TPM03');
  await ronde(); await wacht(1500);
  assert.equal(aanbieder.voor(gast).length, 0);
  const g = await codeSessie(gast);
  assert.equal((await g.c.rpc('my_invites')).data.length, 1);
  assert.equal((await c.rpc('uitnodigingsmails', { p_household: h })).data.find(x => x.invite_id === inv).status, 'daglimiet');
});

test('een ingetrokken uitnodiging (of opnieuw uitnodigen) krijgt geen mail meer; de wachtrij bevat geen adres', { timeout: 60000 }, async () => {
  const { c } = await codeSessie(adres('weg'));
  const h = await huishouden(c);
  const gast = adres('weg-gast');
  // Het seintje even "kwijt" (Vault zonder URL), zodat beide rijen tegelijk wachten.
  await hernoem('thuisplanner_wachtrij_url', 'thuisplanner_wachtrij_url_weg');
  let eerste, tweede;
  try {
    eerste = await uitnodigen(c, h, gast);
    tweede = await uitnodigen(c, h, gast);   // trekt de eerste in (deel 1b)
  } finally {
    await hernoem('thuisplanner_wachtrij_url_weg', 'thuisplanner_wachtrij_url');
  }
  await ronde();
  await klaarMet(eerste); await klaarMet(tweede);
  assert.deepEqual(await standen(eerste), ['vervallen']);
  assert.deepEqual(await standen(tweede), ['aangenomen']);
  assert.equal(aanbieder.voor(gast).length, 1);
  const kol = await db.query(`select column_name from information_schema.columns where table_schema = 'private' and table_name = 'uitnodigingsmails'`);
  assert.ok(!kol.rows.some(k => /mail|adres|^aan$|token/.test(k.column_name)), JSON.stringify(kol.rows));
});

test('gelijktijdig: 30 uitnodigingen in 3 huishoudens en 5 extra aanroepen tegelijk: elke mail precies één keer', { timeout: 120000 }, async () => {
  const groepen = await Promise.all([0, 1, 2].map(async i => {
    const { c } = await codeSessie(adres(`druk-${i}`));
    return { c, h: await huishouden(c, `Druk ${i} ${run}`) };
  }));
  const gasten = [];
  await Promise.all([
    ...groepen.flatMap(({ c, h }, i) => Array.from({ length: 10 }, async (_, j) => {
      const gast = adres(`druk-${i}-${j}`);
      gasten.push(gast);
      const r = await c.rpc('create_invite', { p_household: h, p_role: 'member', p_email: gast });
      assert.ifError(r.error);
    })),
    ...Array.from({ length: 5 }, () => wachtrij({ 'X-Thuisplanner-Wachtrij': GEHEIM })),
  ]);
  await ronde();
  await tot(async () => gasten.every(g => aanbieder.voor(g).length >= 1), 45000, '30 mails');
  await tot(async () => Number((await db.query(`select count(*) n from private.uitnodigingsmails where household_id = any ($1) and status in ('wacht', 'bezig')`,
    [groepen.map(g => g.h)])).rows[0].n) === 0, 20000, 'wachtrij leeg');
  await ronde(); await wacht(2000);
  for (const g of gasten) assert.equal(aanbieder.voor(g).length, 1, g);
  const sleutels = gasten.map(g => aanbieder.voor(g)[0].sleutel);
  assert.equal(new Set(sleutels).size, 30);
});

test('teruggedraaid: een uitnodiging die niet doorgaat, geeft geen seintje en geen mail', { timeout: 60000 }, async () => {
  const { c, s } = await codeSessie(adres('terug'));
  const h = await huishouden(c);
  const gast = adres('terug-gast');
  const verzoeken = aanbieder.verzoeken;
  await db.query('begin');
  await db.query(`insert into public.household_invites (household_id, role, token_hash, created_by, expires_at, invited_email)
    values ($1, 'member', encode(extensions.digest(gen_random_uuid()::text, 'sha256'), 'hex'), $2, now() + interval '7 days', $3)`, [h, s.user.id, gast]);
  await db.query('rollback');
  await wacht(4000);
  assert.equal(aanbieder.voor(gast).length, 0);
  assert.equal(aanbieder.verzoeken, verzoeken);
  assert.equal(Number((await db.query(`select count(*) n from public.household_invites where invited_email = $1`, [gast])).rows[0].n), 0);
});

test('poort: alleen de database, met het wachtrijgeheim; gebruikers, wachtwoordsessies, de anon-sleutel en een vals geheim niet', { timeout: 60000 }, async () => {
  const { c, s } = await codeSessie(adres('poort'));
  const h = await huishouden(c);
  const lidAdres = adres('poort-lid');
  const inv = await uitnodigen(c, h, lidAdres);
  const lid = await codeSessie(lidAdres);
  assert.ifError((await lid.c.rpc('accept_invite_by_id', { p_invite: inv, p_display_name: 'Lid' })).error);
  // De functie: geen geheim, een vals of kort geheim, een gebruikerstoken, de anon-sleutel: 401.
  assert.equal(await wachtrij(), 401);
  assert.equal(await wachtrij({ 'X-Thuisplanner-Wachtrij': 'x'.repeat(64) }), 401);
  assert.equal(await wachtrij({ 'X-Thuisplanner-Wachtrij': GEHEIM.slice(0, -1) }), 401);
  assert.equal(await wachtrij({ Authorization: `Bearer ${s.access_token}`, apikey: ANON_KEY }), 401);
  assert.equal(await wachtrij({ Authorization: `Bearer ${SERVICE_ROLE_KEY}`, apikey: ANON_KEY }), 401);
  assert.equal(await wachtrij({ 'X-Thuisplanner-Wachtrij': GEHEIM }), 202);
  // Geen enkele route voor gebruikers naar de wachtrij of Vault.
  for (const [f, a] of [['uitnodigingsmail_pak', {}], ['uitnodigingsmail_klaar', { p_id: randomUUID(), p_uitkomst: 'aangenomen' }],
    ['uitnodigingsmail_bezorging', { p_bericht: 'x', p_uitkomst: 'bezorgd' }], ['mail_testaanbieder', {}], ['uitnodigingsmail_verzoek', { p_household: h }]]) {
    assert.ok((await c.rpc(f, a)).error, f);
  }
  for (const f of ['uitnodigingsmail_aanroepen()', 'uitnodigingsmail_ronde()', 'uitnodigingsmail_stand()', 'uitnodigingsmail_werk()']) {
    const r = await db.query(`select has_function_privilege('authenticated', 'private.${f}', 'execute') a, has_function_privilege('anon', 'private.${f}', 'execute') b`);
    assert.deepEqual(r.rows[0], { a: false, b: false }, f);
  }
  assert.deepEqual((await lid.c.rpc('uitnodigingsmails', { p_household: h })).data, []);
  // Een wachtwoordsessie van de eigenaar zelf (achterdeur) ziet de status niet.
  await admin.auth.admin.updateUserById(s.user.id, { password: `Achterdeur-${run}-wachtwoord!` });
  const w = await createClient(API_URL, ANON_KEY, geen).auth.signInWithPassword({ email: adres('poort'), password: `Achterdeur-${run}-wachtwoord!` });
  assert.ifError(w.error);
  const met = createClient(API_URL, ANON_KEY, { ...geen, global: { headers: { Authorization: `Bearer ${w.data.session.access_token}` } } });
  assert.equal((await met.rpc('uitnodigingsmails', { p_household: h })).error?.code, 'TPA01');
});

test('herstel: de functie is weg (container gestopt) of Vault is leeg: de mail wacht, en daarna gaat hij precies één keer', { timeout: 180000 }, async () => {
  const { c } = await codeSessie(adres('herstel'));
  const h = await huishouden(c);
  const gast = adres('herstel-gast');
  docker('stop', `supabase_edge_runtime_${PROJECT}`);
  let inv;
  try {
    inv = await uitnodigen(c, h, gast);
    await wacht(4000);
    assert.deepEqual(await standen(inv), ['wacht']);
  } finally {
    docker('start', `supabase_edge_runtime_${PROJECT}`);
  }
  await tot(async () => (await wachtrij()) === 401, 60000, 'functie weer bereikbaar');
  await ronde();
  await klaarMet(inv, 30000);
  assert.deepEqual(await standen(inv), ['aangenomen']);
  assert.equal(aanbieder.voor(gast).length, 1);
  // Eerst rust: verzoeken die al met het geheim onderweg waren (deze ronde, of het vangnet dat elke minuut vuurde terwijl
  // de functie weg was) en aanroepen die nog in hun lus zitten, zouden de volgende mail terecht oppakken. Dat is geen
  // seintje zonder Vault en hoort dus niet bij wat hier wordt bewezen.
  await rust();
  // Vault zonder geheim: het seintje verstuurt niets (geen fout bij de uitnodiging); terug: het vangnet verstuurt hem.
  const gast2 = adres('herstel-vault');
  await hernoem('thuisplanner_wachtrij_geheim', 'thuisplanner_wachtrij_geheim_weg');
  let inv2;
  try {
    inv2 = await uitnodigen(c, h, gast2);
    assert.equal((await db.query('select private.uitnodigingsmail_aanroepen() a')).rows[0].a, false);
    await wacht(3000);
    assert.deepEqual(await standen(inv2), ['wacht']);
    assert.ok((await db.query('select * from private.uitnodigingsmail_stand()')).rows[0]);
  } finally {
    await hernoem('thuisplanner_wachtrij_geheim_weg', 'thuisplanner_wachtrij_geheim');
  }
  await ronde();
  await klaarMet(inv2);
  assert.equal(aanbieder.voor(gast2).length, 1);
});

test('vangnet met de echte pg_cron (tot 90 s): een seintje dat verloren gaat, wordt binnen een minuut opgepakt', { timeout: 150000 }, async () => {
  const { c } = await codeSessie(adres('vangnet'));
  const h = await huishouden(c);
  const gast = adres('vangnet-gast');
  const taak = (await db.query(`select schedule, command, active from cron.job where jobname = 'thuisplanner-uitnodigingsmails-versturen'`)).rows[0];
  assert.deepEqual(taak, { schedule: '* * * * *', command: 'select private.uitnodigingsmail_ronde()', active: true });
  // Het seintje gaat naar een verkeerd adres (verloren); daarna staat Vault weer goed. Geen ronde vanuit de test.
  await hernoem('thuisplanner_wachtrij_url', 'thuisplanner_wachtrij_url_weg');
  let inv;
  try { inv = await uitnodigen(c, h, gast); }
  finally { await hernoem('thuisplanner_wachtrij_url_weg', 'thuisplanner_wachtrij_url'); }
  assert.deepEqual(await standen(inv), ['wacht']);
  await klaarMet(inv, 90000);
  assert.deepEqual(await standen(inv), ['aangenomen']);
  assert.equal(aanbieder.voor(gast).length, 1);
});

// Tweede review PR #54 (CI: "niet op tijd: mail verwerkt" na de herstart van de database): vlak na een herstart geeft
// PostgREST even 503 (nog geen verbinding). Dan gaf de functie de hele ronde meteen op, en wachtte de mail op het vangnet
// van de volgende minuut; gebeurde dat tussen versturen en vastleggen, dan bleef de mail zelfs 2 minuten "bezig".
// Nu probeert de functie het binnen dezelfde ronde opnieuw. Zonder pg_cron, zodat alleen deze ronde telt.
test('PostgREST zonder databaseverbinding bij het begin van een ronde: de functie probeert opnieuw en verstuurt de mail in dezelfde ronde', { timeout: 120000 }, async () => {
  const { c } = await codeSessie(adres('rest-weg'));
  const h = await huishouden(c);
  const gast = adres('rest-weg-gast');
  await rust();
  await zonderCron(async () => {
    await hernoem('thuisplanner_wachtrij_url', 'thuisplanner_wachtrij_url_weg');
    let inv;
    try { inv = await uitnodigen(c, h, gast); } finally { await hernoem('thuisplanner_wachtrij_url_weg', 'thuisplanner_wachtrij_url'); }
    restZonderDb();
    try {
      assert.equal((await db.query('select private.uitnodigingsmail_ronde() r')).rows[0].r, true);
      await wacht(3000);
      assert.deepEqual(await standen(inv), ['wacht']);
    } finally {
      await restMetDb();
    }
    await klaarMet(inv, 25000);
    assert.deepEqual(await standen(inv), ['aangenomen']);
    assert.equal(aanbieder.voor(gast).length, 1);
  });
});

test('PostgREST zonder databaseverbinding tussen versturen en vastleggen: de uitkomst komt alsnog vast, geen "bezig" en geen tweede mail', { timeout: 120000 }, async () => {
  const { c } = await codeSessie(adres('rest-klaar'));
  const h = await huishouden(c);
  const gast = adres('rest-klaar-gast');
  await rust();
  await zonderCron(async () => {
    await hernoem('thuisplanner_wachtrij_url', 'thuisplanner_wachtrij_url_weg');
    let inv;
    try { inv = await uitnodigen(c, h, gast); } finally { await hernoem('thuisplanner_wachtrij_url_weg', 'thuisplanner_wachtrij_url'); }
    // Op het moment dat de mail bij de aanbieder binnenkomt (de rij is dan al gepakt), verliest PostgREST zijn verbinding;
    // na 3 s mag hij weer verbinden.
    aanbieder.zet(() => { restZonderDb(); setTimeout(() => { try { alsBeheerder('alter role authenticator login'); } catch { /* restMetDb */ } }, 3000); });
    try {
      await ronde();
      await klaarMet(inv, 30000);
    } finally {
      await restMetDb();
    }
    assert.deepEqual(await standen(inv), ['aangenomen']);
    assert.equal(aanbieder.voor(gast).length, 1);
  });
});

// Claimronde (migratie 20261116120000, herstelronde review PR #54): de databasefuncties zelf. Zonder pg_cron en zonder
// seintje, zodat alleen deze aanroepen de rij raken.
test('claimronde: pak met hetzelfde token geeft dezelfde claim; los geeft terug zonder poging; klaar alleen voor de eigen ronde', { timeout: 60000 }, async () => {
  const { c } = await codeSessie(adres('ronde'));
  const h = await huishouden(c);
  await rust();
  await zonderCron(async () => {
    await hernoem('thuisplanner_wachtrij_url', 'thuisplanner_wachtrij_url_weg');
    let inv;
    try { inv = await uitnodigen(c, h, adres('ronde-gast')); } finally { await hernoem('thuisplanner_wachtrij_url_weg', 'thuisplanner_wachtrij_url'); }
    const mail = (await rijen(inv))[0].id;
    const pak = async ronde => (await db.query('select id from public.uitnodigingsmail_pak_ronde(50, false, $1)', [ronde])).rows.map(r => r.id);
    const rij = async () => (await db.query('select status, pogingen, ronde from private.uitnodigingsmails where id = $1', [mail])).rows[0];
    const a = randomUUID(), b = randomUUID();
    // Eerste claim, en de herhaling met hetzelfde token (verloren antwoord): dezelfde rij, geen tweede poging.
    assert.ok((await pak(a)).includes(mail));
    assert.deepEqual(await pak(a), (await db.query(`select id from private.uitnodigingsmails where ronde = $1 and status = 'bezig'`, [a])).rows.map(r => r.id));
    assert.deepEqual(await rij(), { status: 'bezig', pogingen: 1, ronde: a });
    // Een andere ronde krijgt deze rij niet.
    assert.ok(!(await pak(b)).includes(mail));
    // (Wat ronde b eventueel van andere tests pakte, meteen terug.)
    const vanB = (await db.query(`select id from private.uitnodigingsmails where ronde = $1 and status = 'bezig'`, [b])).rows.map(r => r.id);
    if (vanB.length) await db.query('select public.uitnodigingsmail_los($1, $2)', [b, vanB]);
    // klaar met het verkeerde token: niets; los met het verkeerde token: niets.
    assert.equal((await db.query(`select public.uitnodigingsmail_klaar_ronde($1, $2, 'aangenomen', 'x') r`, [mail, b])).rows[0].r, false);
    assert.equal((await db.query('select public.uitnodigingsmail_los($1, $2) n', [b, [mail]])).rows[0].n, 0);
    assert.equal((await rij()).status, 'bezig');
    // Teruggeven: weer "wacht", de poging telt niet; daarna te pakken door een nieuwe ronde.
    assert.equal((await db.query('select public.uitnodigingsmail_los($1, $2) n', [a, [mail]])).rows[0].n, 1);
    assert.deepEqual(await rij(), { status: 'wacht', pogingen: 0, ronde: null });
    const d = randomUUID();
    assert.ok((await pak(d)).includes(mail));
    // klaar met het juiste token: vastgelegd; daarna kan los niets meer.
    assert.equal((await db.query(`select public.uitnodigingsmail_klaar_ronde($1, $2, 'aangenomen', 'proef-1') r`, [mail, d])).rows[0].r, true);
    assert.equal((await rij()).status, 'aangenomen');
    assert.equal((await db.query('select public.uitnodigingsmail_los($1, null) n', [d])).rows[0].n, 0);
    // Een verlopen claim geeft los niet meer terug (dan geldt de termijnregel van pak).
    await db.query(`update private.uitnodigingsmails set status = 'bezig', bezig_tot = now() - interval '1 second', ronde = $2 where id = $1`, [mail, d]);
    assert.equal((await db.query('select public.uitnodigingsmail_los($1, null) n', [d])).rows[0].n, 0);
    await db.query(`update private.uitnodigingsmails set status = 'aangenomen', bezig_tot = null where id = $1`, [mail]);
    // Alleen de service-rol: een gebruiker kan de nieuwe functies niet aanroepen.
    for (const [f, args] of [['uitnodigingsmail_pak_ronde', { p_max: 1, p_idempotent: false, p_ronde: a }], ['uitnodigingsmail_los', { p_ronde: a }],
      ['uitnodigingsmail_klaar_ronde', { p_id: mail, p_ronde: a, p_uitkomst: 'aangenomen' }]]) {
      assert.ok((await c.rpc(f, args)).error, `${f} aan te roepen door een gebruiker`);
    }
  });
});

test('herstart van de database: de wachtrij blijft (de wachtrij van pg_net niet), en het vangnet verstuurt de mail daarna één keer', { timeout: 240000 }, async () => {
  const { c } = await codeSessie(adres('dbherstart'));
  const h = await huishouden(c);
  const gast = adres('dbherstart-gast');
  await hernoem('thuisplanner_wachtrij_url', 'thuisplanner_wachtrij_url_weg');
  const inv = await uitnodigen(c, h, gast);
  await db.end();
  docker('restart', `supabase_db_${PROJECT}`);
  await tot(async () => {
    try { const t = new pg.Client({ connectionString: DB_URL }); await t.connect(); await t.query('select 1'); db = t; return true; }
    catch { return false; }
  }, 120000, 'database terug');
  await hernoem('thuisplanner_wachtrij_url_weg', 'thuisplanner_wachtrij_url');
  assert.deepEqual(await standen(inv), ['wacht']);
  await klaarMet(inv, 100000);
  assert.deepEqual(await standen(inv), ['aangenomen']);
  assert.equal(aanbieder.voor(gast).length, 1);
  // Deze test herstart gedeelde infrastructuur; hij eindigt pas als Realtime weer seintjes uit de database aflevert.
  // Na een herstart bouwt Realtime die replicatie pas op bij het eerste privékanaal, en wat vóór die stream geschreven
  // wordt, komt nooit aan: anders mist de eerste realtime-test hierna (in CI vakanties-sync en vakanties) zijn seintjes.
  await realtimeWeerLive(c, h);
});

async function realtimeWeerLive(c, h) {
  const kanaal = (await c.rpc('household_channel', { p_household: h })).data;
  await c.realtime.setAuth();
  for (let poging = 0; poging < 30; poging++) {
    const ontvangen = [];
    const k = c.channel(kanaal, { config: { private: true } }).on('broadcast', { event: 'wijziging' }, m => ontvangen.push(m.payload));
    const status = await new Promise(r => { const t = setTimeout(() => r('GEEN_ANTWOORD'), 10000); k.subscribe(s => { clearTimeout(t); r(s); }); });
    if (status === 'SUBSCRIBED') {
      const id = randomUUID();
      assert.ifError((await c.from('trips').insert({ id, household_id: h, name: 'Proef ' + poging })).error);
      for (let j = 0; j < 30; j++) {
        if (ontvangen.some(p => p.t === 'trips' && p.id === id)) { await c.removeChannel(k); return; }
        await wacht(100);
      }
    }
    await c.removeChannel(k);
    await wacht(2000);
  }
  throw new Error('Realtime levert na de herstart geen seintjes meer af');
}
