#!/usr/bin/env node
// Thuisplanner K1: maakt de LOKALE geheimen voor de codelaag aan (alleen als ze nog niet bestaan), voor
// `supabase start` in thuisplanner/. Willekeurig per toestel; nooit in de repository (.env staat in .gitignore) en nooit
// online te gebruiken. Online zet de beheerder eigen geheimen in het dashboard (checklist in
// docs/thuisplanner-deel2-bouwscope.md).
//   supabase/.env            K1_HOOK_SECRET (gebruikt door config.toml: [auth.hook.send_email])
//   supabase/functions/.env  dezelfde K1_HOOK_SECRET, K1_PEPPER, K1_SLEUTEL, en de lokale mail (Mailpit)
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HIER = dirname(fileURLToPath(import.meta.url));
const auth = join(HIER, '.env');
const functies = join(HIER, 'functions', '.env');
const lees = p => existsSync(p) ? Object.fromEntries(readFileSync(p, 'utf8').split(/\r?\n/).filter(r => r.includes('=')).map(r => [r.slice(0, r.indexOf('=')), r.slice(r.indexOf('=') + 1)])) : {};

const bestaand = { ...lees(auth), ...lees(functies) };
const hook = bestaand.K1_HOOK_SECRET ?? `v1,whsec_${randomBytes(32).toString('base64')}`;
const waarden = {
  K1_HOOK_SECRET: hook,
  K1_PEPPER: bestaand.K1_PEPPER ?? randomBytes(32).toString('hex'),
  K1_SLEUTEL: bestaand.K1_SLEUTEL ?? randomBytes(32).toString('base64'),
  MAIL_ADAPTER: 'mailpit',
  MAILPIT_URL: bestaand.MAILPIT_URL ?? 'http://host.docker.internal:55324',
  MAIL_AFZENDER: 'Thuisplanner (lokaal) <noreply@thuisplanner.test>',
  K1_CAPTCHA: 'uit',
  APP_URL: 'http://127.0.0.1:5180/',
  // D6: het wachtrijgeheim (ook in Vault, via seed-lokaal.sql) en de nagebootste aanbieder van de lokale tests
  // (tests/integratie/testaanbieder.mjs, op de API-poort + 7).
  WACHTRIJ_GEHEIM: bestaand.WACHTRIJ_GEHEIM ?? randomBytes(32).toString('hex'),
  TESTAANBIEDER_URL: bestaand.TESTAANBIEDER_URL ?? 'http://host.docker.internal:55328',
  TESTAANBIEDER_GEHEIM: bestaand.TESTAANBIEDER_GEHEIM ?? randomBytes(32).toString('hex'),
};
const kop = '# Lokale geheimen van Thuisplanner K1 (thuisplanner/supabase/k1-lokaal.mjs). Niet committen, niet online gebruiken.\n';
writeFileSync(auth, kop + `K1_HOOK_SECRET=${hook}\n`);
writeFileSync(functies, kop + Object.entries(waarden).map(([k, v]) => `${k}=${v}`).join('\n') + '\n');
// Vault (alleen lokaal, via [db.seed]): waar de database de wachtrij aanroept, en met welk geheim. De gateway (Kong)
// is binnen het Docker-netwerk van de stack bereikbaar onder zijn containernaam.
const project = readFileSync(join(HIER, 'config.toml'), 'utf8').match(/^project_id\s*=\s*"([^"]+)"/m)?.[1] ?? 'thuisplanner';
writeFileSync(join(HIER, 'seed-lokaal.sql'), '-- Gemaakt door k1-lokaal.mjs: alleen lokaal, niet committen.\n'
  + `select vault.create_secret('http://supabase_kong_${project}:8000/functions/v1/stuur-uitnodiging', 'thuisplanner_wachtrij_url');\n`
  + `select vault.create_secret('${waarden.WACHTRIJ_GEHEIM}', 'thuisplanner_wachtrij_geheim');\n`);
console.log('Lokale K1-geheimen staan klaar (supabase/.env, supabase/functions/.env en supabase/seed-lokaal.sql).');
