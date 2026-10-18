#!/usr/bin/env node
// Thuisplanner: de React-app tegen een LOKALE Supabase-stack (supabase start in thuisplanner/), met een
// verzonnen gezin. Nooit tegen een online project: het script weigert elk ander adres dan dit toestel.
//
//   npm run lokaal:seed          fictief gezin De Boer opnieuw klaarzetten (Eva en Thomas, Lotte en Daan)
//   npm run lokaal               app starten op http://127.0.0.1:5180 (twee tabbladen = twee accounts)
//   npm run lokaal:lan           app op het eigen netwerk (twee telefoons); Supabase blijft op dit toestel,
//                                bereikbaar via de Vite-proxy op poort 5180
//
// URL's en sleutels komen uit `supabase status -o env` (of uit API_URL/ANON_KEY/SERVICE_ROLE_KEY in de
// omgeving). De service-role-sleutel blijft in dit Node-script; de browser krijgt alleen de anon-sleutel.
import { execSync, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { isHoofdscript, isPriveAdres, lanAdressen, leesStatus, supabaseOpdracht, viteOpdracht } from './lokaal-platform.mjs';

const HIER = dirname(fileURLToPath(import.meta.url));
const APP = join(HIER, '..');
const THUISPLANNER = join(APP, '..');

// Verzonnen accounts (domein .invalid bestaat niet) met een lokaal testwachtwoord.
export const WACHTWOORD = 'lokaal-alleen-fictief';
export const ACCOUNTS = [
  { naam: 'Eva', email: 'eva.demo@test.invalid' },
  { naam: 'Thomas', email: 'thomas.demo@test.invalid' },
  // Zonder huishouden (KG-5H): om het eerste huishouden aan te maken en uitnodigingen te accepteren.
  { naam: 'Sanne', email: 'sanne.demo@test.invalid' },
  { naam: 'Joris', email: 'joris.demo@test.invalid' },
];
export const HUISHOUDEN = 'Familie De Boer';

const LOKAAL = /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/;

function stackOmgeving() {
  let { API_URL, ANON_KEY, SERVICE_ROLE_KEY } = process.env;
  if (!API_URL || !ANON_KEY || !SERVICE_ROLE_KEY) {
    const opdracht = supabaseOpdracht(process.env.SUPABASE);
    let uit;
    try { uit = execSync(opdracht, { cwd: THUISPLANNER, stdio: ['ignore', 'pipe', 'ignore'] }).toString(); }
    catch { throw new Error(`\`${opdracht}\` in thuisplanner/ mislukte. Draait de lokale stack (supabase start in thuisplanner/)? Staat de CLI niet op het PATH, zet dan bijvoorbeeld SUPABASE="npx supabase@2.120.0".`); }
    ({ API_URL, ANON_KEY, SERVICE_ROLE_KEY } = leesStatus(uit));
  }
  if (!API_URL || !LOKAAL.test(API_URL)) throw new Error('Weigering: alleen een lokale Supabase (127.0.0.1 of localhost). Draai eerst `supabase start` in thuisplanner/.');
  if (!ANON_KEY || !SERVICE_ROLE_KEY) throw new Error('Geen sleutels gevonden in `supabase status -o env`.');
  return { API_URL, ANON_KEY, SERVICE_ROLE_KEY };
}

const datum = (basis, n) => { const d = new Date(basis + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

/** Zet het fictieve gezin opnieuw klaar. Bestaande demo-accounts en hun huishoudens gaan eerst weg. */
export async function seed({ API_URL, ANON_KEY, SERVICE_ROLE_KEY }, vandaag = new Date().toISOString().slice(0, 10)) {
  const geen = { auth: { persistSession: false, autoRefreshToken: false } };
  const admin = createClient(API_URL, SERVICE_ROLE_KEY, geen);
  const moet = (r, wat) => { if (r.error) throw new Error(`${wat}: ${r.error.message}`); return r.data; };

  // Opruimen: huishoudens van deze accounts (cascade naar leden, afspraken, taken, boodschappen) en de accounts.
  const lijst = moet(await admin.auth.admin.listUsers({ perPage: 1000 }), 'accounts opvragen');
  for (const a of ACCOUNTS) {
    const u = lijst.users.find(x => x.email === a.email);
    if (!u) continue;
    moet(await admin.from('households').delete().eq('created_by', u.id), 'oud huishouden wissen');
    moet(await admin.auth.admin.deleteUser(u.id), 'oud account wissen');
  }

  const clients = {};
  for (const a of ACCOUNTS) {
    moet(await admin.auth.admin.createUser({ email: a.email, password: WACHTWOORD, email_confirm: true }), 'account maken');
    const c = createClient(API_URL, ANON_KEY, geen);
    moet(await c.auth.signInWithPassword({ email: a.email, password: WACHTWOORD }), 'inloggen');
    clients[a.naam] = c;
  }
  const { Eva: eva, Thomas: thomas } = clients;
  const h = moet(await eva.rpc('create_household', { p_name: HUISHOUDEN, p_display_name: 'Eva' }), 'huishouden');
  const lotte = moet(await eva.rpc('add_member', { p_household: h, p_display_name: 'Lotte', p_kind: 'child' }), 'Lotte');
  const daan = moet(await eva.rpc('add_member', { p_household: h, p_display_name: 'Daan', p_kind: 'child' }), 'Daan');
  const token = moet(await eva.rpc('create_invite', { p_household: h, p_role: 'member' }), 'uitnodiging');
  moet(await thomas.rpc('accept_invite', { p_token: token, p_display_name: 'Thomas' }), 'uitnodiging aannemen');
  const leden = moet(await eva.from('household_members').select('id, display_name').eq('household_id', h), 'leden');
  const lid = naam => leden.find(l => l.display_name === naam).id;
  const [m_eva, m_thomas] = [lid('Eva'), lid('Thomas')];
  const d = n => datum(vandaag, n);

  const afspraak = (c, a) => c.rpc('save_event', {
    p_household: h, p_id: randomUUID(), p_version: null, p_start_date: a.datum, p_start_time: a.start ?? null,
    p_end_date: a.eindDatum ?? null, p_end_time: a.eind ?? null, p_visibility: a.prive ? 'private' : 'household', p_title: a.titel,
    p_location: a.plek ?? null, p_notes: a.notities ?? null, p_preparation: a.voorbereiding ?? null, p_participants: a.wie ?? [],
    p_recurrence_freq: a.herhaal ?? null, p_recurrence_until: null,
  });
  const afspraken = [
    [eva, { titel: 'Zwemles', datum: d(-21), start: '09:15', eind: '10:00', wie: [daan], plek: 'Sportfondsenbad', herhaal: 'weekly', notities: 'Badpas zit in de blauwe tas' }],
    // Meerdaags, met notities: het venster toont die velden niet, maar ze mogen nooit verloren gaan.
    [eva, { titel: 'Kamp Daan', datum: d(2), eindDatum: d(4), start: '18:00', eind: '11:00', wie: [daan], plek: 'Scoutinggebouw', notities: 'Slaapzak en zaklamp mee. Ophalen bij de achteringang.', voorbereiding: 'Tas inpakken' }],
    [thomas, { titel: 'Voetbal', datum: d(0), start: '13:00', eind: '14:30', wie: [lotte], plek: 'Sportpark Noord' }],
    // Privé-afspraak van Thomas: Eva krijgt van de server alleen "bezet" (geen titel, geen plek).
    [thomas, { titel: 'Fysiotherapie', datum: d(-7), start: '15:00', eind: '16:00', wie: [m_thomas], plek: 'Praktijk Oost', prive: true, herhaal: 'weekly' }],
    [eva, { titel: 'Pizza bakken met de buren', datum: d(0), start: '18:00' }],
    [eva, { titel: 'Gym', datum: d(1), start: '08:30', wie: [lotte], plek: 'School', voorbereiding: 'Gymtas inpakken' }],
    [thomas, { titel: 'Eten bij oma', datum: d(1), start: '17:30' }],
    [eva, { titel: 'Ouderavond groep 4', datum: d(3), start: '19:30', wie: [m_eva, m_thomas], plek: 'De Regenboog' }],
    [thomas, { titel: 'Oud papier aan de straat', datum: d(5), herhaal: 'monthly' }],
    [thomas, { titel: 'Tandarts', datum: d(8), start: '10:15', wie: [daan], plek: 'Tandartspraktijk Centrum' }],
  ];
  for (const [c, a] of afspraken) moet(await afspraak(c, a), 'afspraak ' + a.titel);

  const taken = [
    { title: 'Plantenbak water geven', due_date: d(0), assignee_member_id: lotte },
    { title: 'Cadeautje voor Noor kopen', due_date: d(0), assignee_member_id: m_eva },
    { title: 'Toestemmingsformulier schoolreis', due_date: d(-1), assignee_member_id: null },
    { title: 'Groene container buiten zetten', due_date: d(0), assignee_member_id: m_thomas, done_on: d(0), done_by_member_id: m_thomas },
    { title: 'Fietsband Lotte plakken', due_date: d(2), assignee_member_id: m_thomas },
    { title: 'Aanslag gemeentebelasting nakijken', due_date: null, assignee_member_id: null },
  ];
  moet(await eva.from('tasks').insert(taken.map(t => ({ id: randomUUID(), household_id: h, ...t }))), 'taken');

  const namen = ['Melk', 'Pizzadeeg', 'Mozzarella', 'Tomaten', 'Bananen', 'Wc-papier'];
  moet(await eva.rpc('add_shopping_items', { p_household: h, p_ids: namen.map(() => randomUUID()), p_names: namen }), 'boodschappen');
  moet(await eva.from('shopping_items').update({ checked_at: new Date().toISOString() }).eq('household_id', h).eq('name', 'Wc-papier'), 'afvinken');

  for (const c of Object.values(clients)) await c.auth.signOut({ scope: 'local' });
  return { huishouden: h };
}

export { lanAdressen };

function lanAdres(gekozen) {
  if (gekozen) {
    if (!isPriveAdres(gekozen)) throw new Error(`Weigering: ${gekozen} is geen adres op een eigen netwerk (10.x, 172.16-31.x of 192.168.x).`);
    return gekozen;
  }
  const kandidaten = lanAdressen();
  if (!kandidaten.length) throw new Error('Geen adres op het eigen netwerk gevonden. Geef het op met --host <ip> (zie de wifi-instellingen van deze computer).');
  if (kandidaten.length > 1) console.log('Meerdere netwerken: ' + kandidaten.map(k => `${k.adres} (${k.naam})`).join(', ') + `. Gekozen: ${kandidaten[0].adres}; anders --host <ip>.`);
  return kandidaten[0].adres;
}

/** Wacht tot Auth en REST via de Vite-proxy antwoorden (gecontroleerd vanaf deze computer). */
async function controleerProxy(basis, anonKey, pogingen = 60) {
  for (const pad of ['/auth/v1/health', '/rest/v1/']) {
    let r;
    for (let i = 0; i < pogingen; i++) {
      r = await fetch(basis + pad, { headers: { apikey: anonKey } }).catch(e => ({ ok: false, status: e.message }));
      if (r.ok) break;
      await new Promise(klaar => setTimeout(klaar, 500));
    }
    if (!r.ok) throw new Error(`Supabase antwoordt niet via de proxy op ${basis}${pad} (${r.status}). Draait \`supabase start\` in thuisplanner/?`);
  }
}

/**
 * Schrijft .env.lokaal.local (genegeerd door git): wat de app in de modus "lokaal" leest. Met een proxypoort
 * praat de browser alleen met de app zelf (http://<host>:<poort>) en stuurt Vite Auth, REST en Realtime door
 * naar de lokale Supabase (KG_SUPABASE_DOEL: alleen voor vite.config.ts, niet voor de browser).
 */
export function schrijfEnv(omg, host = '127.0.0.1', proxyPoort) {
  const url = proxyPoort ? `http://${host}:${proxyPoort}` : omg.API_URL.replace(/\/\/(127\.0\.0\.1|localhost)/, `//${host}`).replace(/\/$/, '');
  writeFileSync(process.env.KG_ENV_BESTAND || join(APP, '.env.lokaal.local'), [
    '# Gemaakt door scripts/lokaal.mjs. Alleen de lokale anon-sleutel; nooit de service-role-sleutel.',
    `VITE_SUPABASE_URL=${url}`,
    `VITE_SUPABASE_ANON_KEY=${omg.ANON_KEY}`,
    `VITE_DEMO_ACCOUNTS=${JSON.stringify(ACCOUNTS)}`,
    `VITE_DEMO_WACHTWOORD=${WACHTWOORD}`,
    ...(proxyPoort ? [`KG_SUPABASE_DOEL=${omg.API_URL.replace(/\/$/, '')}`] : []),
    '',
  ].join('\n'));
}

/**
 * Start Vite in de modus "lokaal". Op het netwerk (--lan/--host) altijd via de proxy: Vite luistert alleen op
 * het gekozen adres, en Supabase (API, database, Studio) blijft op 127.0.0.1. Met --proxy op dit toestel
 * dezelfde weg, om die op één computer te testen.
 */
async function dev(omg, lan, gekozen, proxy) {
  const host = lan ? lanAdres(gekozen) : '127.0.0.1';
  const viaProxy = lan || proxy;
  schrijfEnv(omg, host, viaProxy ? 5180 : undefined);
  const [cmd, args] = viteOpdracht(['--mode', 'lokaal', ...(lan ? ['--host', host] : [])]);
  console.log(lan
    ? `Open op beide telefoons (zelfde wifi): http://${host}:5180/  ·  Eva op de ene, Thomas op de andere.`
    : 'Open http://127.0.0.1:5180/ in twee tabbladen (of twee browsers): Eva in het ene, Thomas in het andere.');
  if (lan) {
    console.log('Supabase (API, database, Studio) blijft op dit toestel; telefoons praten alleen met poort 5180 (app en proxy).');
    console.log('Docker Desktop: Port binding "Local only". Firewall: alleen 5180, alleen vanaf het eigen netwerk. Alleen fictieve gegevens.');
  }
  const p = spawn(cmd, args, { cwd: APP, stdio: 'inherit' });
  p.on('exit', code => process.exit(code ?? 0));
  if (viaProxy) {
    await controleerProxy(`http://${host}:5180`, omg.ANON_KEY).then(
      () => console.log(`Supabase bereikbaar via de proxy op http://${host}:5180 (Auth en REST, gecontroleerd vanaf deze computer).`),
      fout => { console.error(fout.message); p.kill(); process.exit(1); },
    );
  }
}

if (isHoofdscript(import.meta.url, process.argv[1])) {
  const [opdracht = 'dev', ...rest] = process.argv.slice(2);
  const omg = stackOmgeving();
  if (opdracht === 'seed') {
    const i = rest.indexOf('--datum');
    const r = await seed(omg, i >= 0 ? rest[i + 1] : undefined);
    console.log(`Fictief gezin "${HUISHOUDEN}" klaargezet (${r.huishouden}). Accounts: ${ACCOUNTS.map(a => a.email).join(', ')}; wachtwoord: ${WACHTWOORD}`);
  } else if (opdracht === 'env') {
    // Met --host altijd via de proxy op 5180 (Supabase staat niet op het netwerk); --proxy <poort> kiest de
    // poort van de app (bijvoorbeeld 5182 voor `vite preview` in de browsertests).
    const i = rest.indexOf('--host');
    const j = rest.indexOf('--proxy');
    const poort = j >= 0 ? Number(rest[j + 1]) : i >= 0 ? 5180 : undefined;
    if (poort !== undefined && !(poort > 0 && poort < 65536)) throw new Error(`Ongeldige proxypoort: ${rest[j + 1]}`);
    schrijfEnv(omg, i >= 0 ? lanAdres(rest[i + 1]) : undefined, poort);
  } else if (opdracht === 'dev') {
    const i = rest.indexOf('--host');
    await dev(omg, rest.includes('--lan') || i >= 0, i >= 0 ? rest[i + 1] : undefined, rest.includes('--proxy'));
  } else {
    console.error('Gebruik: node scripts/lokaal.mjs seed [--datum JJJJ-MM-DD] | dev [--lan] [--host <ip>] [--proxy] | env [--host <ip>] [--proxy <poort>]');
    process.exit(2);
  }
}
