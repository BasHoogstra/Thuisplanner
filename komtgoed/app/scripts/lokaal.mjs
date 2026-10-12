#!/usr/bin/env node
// Thuisplanner: de React-app tegen een LOKALE Supabase-stack (supabase start in komtgoed/), met een
// verzonnen gezin. Nooit tegen een online project: het script weigert elk ander adres dan dit toestel.
//
//   npm run lokaal:seed          fictief gezin De Boer opnieuw klaarzetten (Eva en Thomas, Lotte en Daan)
//   npm run lokaal               app starten op http://127.0.0.1:5180 (twee tabbladen = twee accounts)
//   npm run lokaal:lan           app en database bereikbaar op het eigen netwerk (twee telefoons)
//
// URL's en sleutels komen uit `supabase status -o env` (of uit API_URL/ANON_KEY/SERVICE_ROLE_KEY in de
// omgeving). De service-role-sleutel blijft in dit Node-script; de browser krijgt alleen de anon-sleutel.
import { execFileSync, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const HIER = dirname(fileURLToPath(import.meta.url));
const APP = join(HIER, '..');
const KOMTGOED = join(APP, '..');

// Verzonnen accounts (domein .invalid bestaat niet) met een lokaal testwachtwoord.
export const WACHTWOORD = 'lokaal-alleen-fictief';
export const ACCOUNTS = [
  { naam: 'Eva', email: 'eva.demo@test.invalid' },
  { naam: 'Thomas', email: 'thomas.demo@test.invalid' },
];
export const HUISHOUDEN = 'Familie De Boer';

const LOKAAL = /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/;

function stackOmgeving() {
  let { API_URL, ANON_KEY, SERVICE_ROLE_KEY } = process.env;
  if (!API_URL || !ANON_KEY || !SERVICE_ROLE_KEY) {
    const [cmd, ...args] = (process.env.SUPABASE || 'supabase').split(' ');
    const uit = execFileSync(cmd, [...args, 'status', '-o', 'env'], { cwd: KOMTGOED, stdio: ['ignore', 'pipe', 'ignore'] }).toString();
    const waarde = k => uit.match(new RegExp(`^${k}="?([^"\\n]*)"?$`, 'm'))?.[1];
    API_URL = waarde('API_URL'); ANON_KEY = waarde('ANON_KEY'); SERVICE_ROLE_KEY = waarde('SERVICE_ROLE_KEY');
  }
  if (!API_URL || !LOKAAL.test(API_URL)) throw new Error('Weigering: alleen een lokale Supabase (127.0.0.1 of localhost). Draai eerst `supabase start` in komtgoed/.');
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
    p_end_date: null, p_end_time: a.eind ?? null, p_visibility: a.prive ? 'private' : 'household', p_title: a.titel,
    p_location: a.plek ?? null, p_notes: null, p_preparation: a.voorbereiding ?? null, p_participants: a.wie ?? [],
    p_recurrence_freq: a.herhaal ?? null, p_recurrence_until: null,
  });
  const afspraken = [
    [eva, { titel: 'Zwemles', datum: d(-21), start: '09:15', eind: '10:00', wie: [daan], plek: 'Sportfondsenbad', herhaal: 'weekly' }],
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

function lanAdres() {
  for (const lijst of Object.values(networkInterfaces())) {
    for (const a of lijst ?? []) {
      if (a.family === 'IPv4' && !a.internal && /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(a.address)) return a.address;
    }
  }
  throw new Error('Geen adres op het eigen netwerk gevonden (10.x, 172.16-31.x of 192.168.x).');
}

/** Schrijft .env.lokaal.local (genegeerd door git): wat de app in de modus "lokaal" leest. */
export function schrijfEnv(omg, host = '127.0.0.1') {
  const url = omg.API_URL.replace(/\/\/(127\.0\.0\.1|localhost)/, `//${host}`).replace(/\/$/, '');
  writeFileSync(join(APP, '.env.lokaal.local'), [
    '# Gemaakt door scripts/lokaal.mjs. Alleen de lokale anon-sleutel; nooit de service-role-sleutel.',
    `VITE_SUPABASE_URL=${url}`,
    `VITE_SUPABASE_ANON_KEY=${omg.ANON_KEY}`,
    `VITE_DEMO_ACCOUNTS=${JSON.stringify(ACCOUNTS)}`,
    `VITE_DEMO_WACHTWOORD=${WACHTWOORD}`,
    '',
  ].join('\n'));
}

/** Start Vite in de modus "lokaal". */
function dev(omg, lan) {
  const host = lan ? lanAdres() : '127.0.0.1';
  schrijfEnv(omg, host);
  const args = ['vite', '--mode', 'lokaal', ...(lan ? ['--host', '0.0.0.0'] : [])];
  console.log(lan
    ? `Open op beide telefoons (zelfde wifi): http://${host}:5180/  ·  Eva op de ene, Thomas op de andere.`
    : 'Open http://127.0.0.1:5180/ in twee tabbladen (of twee browsers): Eva in het ene, Thomas in het andere.');
  const p = spawn('npx', args, { cwd: APP, stdio: 'inherit' });
  p.on('exit', code => process.exit(code ?? 0));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [opdracht = 'dev', ...rest] = process.argv.slice(2);
  const omg = stackOmgeving();
  if (opdracht === 'seed') {
    const i = rest.indexOf('--datum');
    const r = await seed(omg, i >= 0 ? rest[i + 1] : undefined);
    console.log(`Fictief gezin "${HUISHOUDEN}" klaargezet (${r.huishouden}). Accounts: ${ACCOUNTS.map(a => a.email).join(', ')}; wachtwoord: ${WACHTWOORD}`);
  } else if (opdracht === 'env') {
    schrijfEnv(omg);
  } else if (opdracht === 'dev') {
    dev(omg, rest.includes('--lan'));
  } else {
    console.error('Gebruik: node scripts/lokaal.mjs seed [--datum JJJJ-MM-DD] | dev [--lan]');
    process.exit(2);
  }
}
