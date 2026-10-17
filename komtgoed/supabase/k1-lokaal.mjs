#!/usr/bin/env node
// Thuisplanner K1: maakt de LOKALE geheimen voor de codelaag aan (alleen als ze nog niet bestaan), voor
// `supabase start` in komtgoed/. Willekeurig per toestel; nooit in de repository (.env staat in .gitignore) en nooit
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
};
const kop = '# Lokale geheimen van Thuisplanner K1 (komtgoed/supabase/k1-lokaal.mjs). Niet committen, niet online gebruiken.\n';
writeFileSync(auth, kop + `K1_HOOK_SECRET=${hook}\n`);
writeFileSync(functies, kop + Object.entries(waarden).map(([k, v]) => `${k}=${v}`).join('\n') + '\n');
console.log('Lokale K1-geheimen staan klaar (supabase/.env en supabase/functions/.env).');
