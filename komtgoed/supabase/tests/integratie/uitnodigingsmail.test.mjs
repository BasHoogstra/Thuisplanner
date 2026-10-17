// Thuisplanner D6: de uitnodigingsmail tegen de echte lokale stack (database, Edge Function stuur-uitnodiging, Mailpit).
// Zie docs/thuisplanner-registratie-inloggen.md §15 en de migratie uitnodigingsmail. Toetst T16 (nooit dubbel), T17
// (hoogstens 3, één per 10 minuten, in de database), T18 (niet bezorgd), de daglimiet, gelijktijdigheid, de
// toegangspoort (alleen een beheerder met een codesessie) en dat de mail en de wachtrij geen geheim of adres bewaren.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';
import { createClient } from '@supabase/supabase-js';
import pg from 'pg';

const { API_URL, ANON_KEY, SERVICE_ROLE_KEY, DB_URL } = process.env;
if (!API_URL || !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(API_URL)) throw new Error('Weigering: alleen een lokale Supabase');
if (!DB_URL || !/@(127\.0\.0\.1|localhost):\d+\//.test(DB_URL)) throw new Error('Weigering: alleen een lokale database');
const api = new URL(API_URL);
const MAIL = process.env.MAILPIT_URL ?? `http://${api.hostname}:${Number(api.port) + 3}`;
const FUNCTIE = `${API_URL.replace(/\/$/, '')}/functions/v1/stuur-uitnodiging`;

const geen = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(API_URL, SERVICE_ROLE_KEY, geen);
const db = new pg.Client({ connectionString: DB_URL });
const run = randomUUID().slice(0, 8);
const accounts = [];
const huishoudens = [];
let vorige;
const wacht = ms => new Promise(r => setTimeout(r, ms));

before(async () => {
  await db.connect();
  vorige = (await db.query('select * from private.instellingen')).rows[0];
  await db.query('update private.instellingen set wachtwoordsessies_toegestaan = false, huishouden_open = true');
});
after(async () => {
  for (const h of huishoudens) await db.query('delete from public.households where id = $1', [h]);
  for (const id of accounts) await admin.auth.admin.deleteUser(id);
  await db.query('update private.instellingen set wachtwoordsessies_toegestaan = $1, huishouden_open = $2',
    [vorige.wachtwoordsessies_toegestaan, vorige.huishouden_open]);
  await db.end();
});

const adres = naam => `${naam}-${run}@test.invalid`;
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
const stuur = (token, h) => fetch(FUNCTIE, {
  method: 'POST', headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ huishouden: h }),
}).then(async r => ({ status: r.status, body: await r.json().catch(() => null) }));
async function mails(email) {
  const r = await (await fetch(`${MAIL}/api/v1/search?query=${encodeURIComponent('to:' + email)}&limit=50`)).json();
  return Promise.all((r.messages ?? []).map(async m => {
    const v = await (await fetch(`${MAIL}/api/v1/message/${m.ID}`)).json();
    const k = await (await fetch(`${MAIL}/api/v1/message/${m.ID}/headers`)).json();
    return { id: m.ID, onderwerp: v.Subject, tekst: v.Text, html: v.HTML, sleutel: k['X-Thuisplanner-Sleutel']?.[0] ?? null };
  }));
}
const rijen = invite => db.query('select * from private.uitnodigingsmails where invite_id = $1 order by nummer', [invite]).then(r => r.rows);
const terug = (invite, minuten) => db.query(`update private.uitnodigingsmails set gevraagd = gevraagd - make_interval(mins => $2) where invite_id = $1`, [invite, minuten]);

test('een uitnodiging op adres: één mail, zonder token, met vaste tekst; status voor de uitnodiger', { timeout: 60000 }, async () => {
  const { c, s } = await codeSessie(adres('olaf'));
  const h = await huishouden(c, 'Familie <b>www.reclame.nl</b>');
  const gast = adres('gast');
  const inv = await uitnodigen(c, h, gast);
  assert.deepEqual((await rijen(inv)).map(r => [r.nummer, r.status]), [[1, 'wacht']]);
  const r = await stuur(s.access_token, h);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.verstuurd, 1);
  const m = await mails(gast);
  assert.equal(m.length, 1);
  const [rij] = await rijen(inv);
  assert.equal(rij.status, 'verstuurd');
  assert.equal(m[0].sleutel, rij.id, 'de rij-id gaat als idempotentiesleutel mee');
  assert.equal(rij.bericht_id, m[0].id);
  // Geen token, geen link met een geheim; de naam van het huishouden met iets dat op een link lijkt komt er niet in.
  assert.doesNotMatch(m[0].tekst + m[0].html, /[0-9a-f]{64}|uitnodiging\/|token/i);
  assert.doesNotMatch(m[0].tekst + m[0].onderwerp, /reclame|www\.|<b>/);
  assert.match(m[0].tekst, /Olaf nodigt je uit voor een huishouden in Thuisplanner/);
  assert.match(m[0].tekst, new RegExp(`log in met dit e-mailadres \\(${gast.replace(/[.]/g, '\\.')}\\)`));
  assert.doesNotMatch(m[0].onderwerp, /@/);
  assert.doesNotMatch(m[0].html, /De code staat in deze mail/);
  const st = await c.rpc('uitnodigingsmails', { p_household: h });
  assert.ifError(st.error);
  assert.equal(st.data.length, 1);
  assert.equal(st.data[0].status, 'verstuurd');
  assert.ok(st.data[0].verstuurd);
});

test('T16: een herhaling, en een poging die halverwege stopte (time-out na het versturen): nooit een tweede mail', { timeout: 60000 }, async () => {
  const { c, s } = await codeSessie(adres('t16'));
  const h = await huishouden(c);
  const gast = adres('t16-gast');
  const inv = await uitnodigen(c, h, gast);
  assert.equal((await stuur(s.access_token, h)).body.verstuurd, 1);
  assert.equal((await stuur(s.access_token, h)).body.verstuurd, 0);
  assert.equal((await mails(gast)).length, 1);
  // Een tweede mail ("nog eens sturen", 10 minuten later) waarvan de vorige poging na het versturen geen antwoord kreeg:
  // de rij bleef "bezig" en de termijn verliep. De volgende ronde verstuurt hem NIET opnieuw maar meldt "onzeker".
  await terug(inv, 11);
  assert.ifError((await c.rpc('uitnodigingsmail_opnieuw', { p_invite: inv })).error);
  await db.query(`update private.uitnodigingsmails set status = 'bezig', bezig_tot = now() - interval '1 second', pogingen = 1
    where invite_id = $1 and nummer = 2`, [inv]);
  const r = await stuur(s.access_token, h);
  assert.equal(r.body.verstuurd, 0);
  assert.deepEqual((await rijen(inv)).map(x => x.status), ['verstuurd', 'onzeker']);
  assert.equal((await mails(gast)).length, 1);
  // De uitkomst kan alleen vanuit "bezig" worden gezet (een late melding verandert niets meer).
  const rij2 = (await rijen(inv))[1];
  assert.ifError((await admin.rpc('uitnodigingsmail_klaar', { p_id: rij2.id, p_uitkomst: 'verstuurd', p_bericht: 'x' })).error);
  assert.equal((await rijen(inv))[1].status, 'onzeker');
});

test('T17: "nog eens sturen" vier keer: hoogstens 3 mails, één per 10 minuten, afgedwongen in de database', { timeout: 60000 }, async () => {
  const { c, s } = await codeSessie(adres('t17'));
  const h = await huishouden(c);
  const gast = adres('t17-gast');
  const inv = await uitnodigen(c, h, gast);
  await stuur(s.access_token, h);
  const opnieuw = () => c.rpc('uitnodigingsmail_opnieuw', { p_invite: inv });
  assert.equal((await opnieuw()).error?.code, 'TPM01');
  await terug(inv, 11);
  assert.ifError((await opnieuw()).error);
  assert.equal((await opnieuw()).error?.code, 'TPM01');
  await stuur(s.access_token, h);
  await terug(inv, 11);
  // Gelijktijdig: tien keer tegelijk "nog eens sturen"; precies één slaagt (huishoudvergrendeling); de rest krijgt
  // "wacht 10 minuten" of, als de winnaar al de derde mail maakte, "al 3 keer".
  const tegelijk = await Promise.all(Array.from({ length: 10 }, () => opnieuw()));
  assert.equal(tegelijk.filter(x => !x.error).length, 1);
  assert.ok(tegelijk.filter(x => x.error).every(x => ['TPM01', 'TPM02'].includes(x.error.code)), JSON.stringify(tegelijk.map(x => x.error?.code)));
  await stuur(s.access_token, h);
  await terug(inv, 11);
  assert.equal((await opnieuw()).error?.code, 'TPM02');
  await wacht(300);
  assert.equal((await mails(gast)).length, 3);
  assert.deepEqual((await rijen(inv)).map(x => x.nummer), [1, 2, 3]);
  // Rechtstreeks in de wachtrij schrijven kan niet (geen rechten), en een vierde rij weigert de tabel zelf.
  assert.ok((await c.from('uitnodigingsmails').select('id')).error);
  await assert.rejects(db.query(`insert into private.uitnodigingsmails (invite_id, household_id, nummer) values ($1, $2, 4)`, [inv, h]));
});

test('daglimiet: hoogstens 20 uitnodigingsmails per huishouden per 24 uur; de uitnodiging zelf blijft geldig', { timeout: 60000 }, async () => {
  const { c, s } = await codeSessie(adres('dag'));
  const h = await huishouden(c);
  // 20 eerdere mails vandaag (zonder ze echt te versturen): rijen van ingetrokken uitnodigingen.
  for (let i = 0; i < 20; i++) {
    const inv = await uitnodigen(c, h, adres(`dag-${i}`));
    assert.ifError((await c.rpc('revoke_invite', { p_invite: inv })).error);
  }
  await db.query(`update private.uitnodigingsmails set status = 'verstuurd' where household_id = $1`, [h]);
  const gast = adres('dag-gast');
  const inv = await uitnodigen(c, h, gast);
  assert.deepEqual((await rijen(inv)).map(x => x.status), ['daglimiet']);
  await terug(inv, 11);
  assert.equal((await c.rpc('uitnodigingsmail_opnieuw', { p_invite: inv })).error?.code, 'TPM03');
  assert.equal((await stuur(s.access_token, h)).body.verstuurd, 0);
  assert.equal((await mails(gast)).length, 0);
  // De uitnodiging staat er gewoon; de genodigde ziet hem na het inloggen.
  const g = await codeSessie(gast);
  assert.equal((await g.c.rpc('my_invites')).data.length, 1);
  const st = await c.rpc('uitnodigingsmails', { p_household: h });
  assert.equal(st.data.find(x => x.invite_id === inv).status, 'daglimiet');
});

test('een ingetrokken uitnodiging (of opnieuw uitnodigen) krijgt geen mail meer; de wachtrij bevat geen adres', { timeout: 60000 }, async () => {
  const { c, s } = await codeSessie(adres('weg'));
  const h = await huishouden(c);
  const gast = adres('weg-gast');
  const eerste = await uitnodigen(c, h, gast);
  const tweede = await uitnodigen(c, h, gast);   // trekt de eerste in (deel 1b)
  const r = await stuur(s.access_token, h);
  assert.equal(r.body.verstuurd, 1);
  assert.equal((await rijen(eerste))[0].status, 'vervallen');
  assert.equal((await rijen(tweede))[0].status, 'verstuurd');
  assert.equal((await mails(gast)).length, 1);
  const kol = await db.query(`select column_name from information_schema.columns where table_schema = 'private' and table_name = 'uitnodigingsmails'`);
  assert.ok(!kol.rows.some(k => /mail|adres|aan|token/.test(k.column_name.replace('uitnodigingsmails', ''))), JSON.stringify(kol.rows));
});

test('T18: een bounce-melding van de aanbieder geeft "niet bezorgd" bij de uitnodiger', { timeout: 60000 }, async () => {
  const { c, s } = await codeSessie(adres('t18'));
  const h = await huishouden(c);
  const inv = await uitnodigen(c, h, adres('t18-gast'));
  await stuur(s.access_token, h);
  const [rij] = await rijen(inv);
  // Alleen de service-rol (de bounce-adapter); een gebruiker kan dit niet.
  assert.ok((await c.rpc('uitnodigingsmail_niet_bezorgd', { p_bericht: rij.bericht_id })).error);
  const n = await admin.rpc('uitnodigingsmail_niet_bezorgd', { p_bericht: rij.bericht_id });
  assert.ifError(n.error);
  assert.equal(n.data, 1);
  assert.equal((await c.rpc('uitnodigingsmails', { p_household: h })).data[0].status, 'niet_bezorgd');
});

test('poort: zonder codesessie, met een wachtwoordsessie, of als gewoon lid: geen versturen en geen status', { timeout: 60000 }, async () => {
  const { c, s } = await codeSessie(adres('poort'));
  const h = await huishouden(c);
  const lidAdres = adres('poort-lid');
  const inv = await uitnodigen(c, h, lidAdres);
  // Een gewoon lid (heeft de uitnodiging geaccepteerd).
  const lid = await codeSessie(lidAdres);
  assert.ifError((await lid.c.rpc('accept_invite_by_id', { p_invite: inv, p_display_name: 'Lid' })).error);
  assert.equal((await stuur(lid.s.access_token, h)).status, 403);
  assert.deepEqual((await lid.c.rpc('uitnodigingsmails', { p_household: h })).data, []);
  assert.ok((await lid.c.rpc('uitnodigingsmail_pak', { p_household: h })).error, 'pak alleen voor de service-rol');
  // Geen token, de anon-sleutel, een verzonnen token.
  assert.equal((await fetch(FUNCTIE, { method: 'POST', headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ huishouden: h }) })).status, 401);
  assert.equal((await stuur(ANON_KEY, h)).status, 401);
  assert.equal((await stuur('geen.echt.token', h)).status, 401);
  // Een wachtwoordsessie van de eigenaar zelf (achterdeur): de poort weigert.
  await admin.auth.admin.updateUserById(s.user.id, { password: `Achterdeur-${run}-wachtwoord!` });
  const w = await createClient(API_URL, ANON_KEY, geen).auth.signInWithPassword({ email: adres('poort'), password: `Achterdeur-${run}-wachtwoord!` });
  assert.ifError(w.error);
  const r = await stuur(w.data.session.access_token, h);
  assert.equal(r.status, 401);
  assert.equal(r.body.code, 'TPA01');
  // Een ongeldig verzoek.
  assert.equal((await stuur(lid.s.access_token, 'geen-uuid')).status, 400);
});
