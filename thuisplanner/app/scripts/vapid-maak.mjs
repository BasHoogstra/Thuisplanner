#!/usr/bin/env node
// Pushproef (PR P0): maakt het VAPID-sleutelpaar voor staging (= bèta) op deze computer, zonder extra software en
// zonder netwerk (alleen node:crypto). Eenmalig, met een eigen akkoord; zie README, "PWA en pushproef (PR P0)".
//
//   cd thuisplanner/app
//   node scripts/vapid-maak.mjs
//
// - Schrijft .env.pushproef.local (naast package.json) zelf, als UTF-8 zonder BOM. Niet via ">" in PowerShell: Windows
//   PowerShell 5.1 schrijft dan UTF-16 of een BOM, en node --env-file leest de sleutels dan niet.
// - Overschrijft nooit: bestaat het bestand al, dan stopt het script (anders zou een bestaand paar, en daarmee elk
//   abonnement, ongemerkt verloren gaan).
// - Stopt als git het bestand niet negeert (.env.* in .gitignore), zodat de private sleutel nooit in de repository komt.
// - Toont alleen de publieke sleutel. De private sleutel staat alleen in het bestand; zet hem vandaar in de
//   wachtwoordkluis. Hij komt nooit in de terminal, een log of de repository.
import { execFileSync } from 'node:child_process';
import { generateKeyPairSync } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isHoofdscript } from './lokaal-platform.mjs';
import { vapidSleutel } from './pushproef-stuur.mjs';

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const STANDAARD_BESTAND = path.join(APP, '.env.pushproef.local');

/** Een nieuw P-256-paar als base64url: publiek = 0x04‖x‖y (65 bytes), privaat = d uit de JWK (altijd 32 bytes). */
export function maakPaar() {
  const jwk = generateKeyPairSync('ec', { namedCurve: 'prime256v1' }).privateKey.export({ format: 'jwk' });
  const publiek = Buffer.concat([Buffer.from([0x04]), Buffer.from(jwk.x, 'base64url'), Buffer.from(jwk.y, 'base64url')]);
  return { publiek: publiek.toString('base64url'), privaat: jwk.d };
}

/** De inhoud van .env.pushproef.local, zoals scripts/pushproef-stuur.mjs hem leest. */
export function bestandInhoud({ publiek, privaat }) {
  return [
    '# VAPID-sleutelpaar voor staging (= bèta), gemaakt met scripts/vapid-maak.mjs. Geheim: nooit in git, chat of log.',
    '# De private sleutel hoort ook in de wachtwoordkluis; P1 gebruikt hetzelfde paar (als Supabase-geheim).',
    `PUSHPROEF_VAPID_PUBLIC=${publiek}`,
    `PUSHPROEF_VAPID_PRIVATE=${privaat}`,
    '',
  ].join('\n');
}

/** Negeert git dit bestand? (git check-ignore geeft 0 als het genegeerd wordt.) */
export function doorGitGenegeerd(bestand) {
  try {
    execFileSync('git', ['check-ignore', '-q', bestand], { cwd: path.dirname(bestand), stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Maakt het paar en schrijft het bestand. Geeft alleen de publieke sleutel terug; `meld` krijgt nooit de private.
 * `isGenegeerd` alleen voor de tests (een tijdelijke map staat buiten de repository).
 */
export function maakSleutelbestand({ bestand = STANDAARD_BESTAND, isGenegeerd = doorGitGenegeerd, meld = console.log } = {}) {
  if (!isGenegeerd(bestand)) {
    throw new Error(`${bestand} wordt niet door git genegeerd; gestopt zodat de private sleutel nooit in de repository komt.`);
  }
  const paar = maakPaar();
  vapidSleutel(paar.publiek, paar.privaat);   // dezelfde controle als het verzendscript: het paar hoort bij elkaar
  try {
    // flag 'wx': nooit een bestaand bestand overschrijven. mode 0o600: alleen de eigenaar (op Windows zonder effect).
    writeFileSync(bestand, bestandInhoud(paar), { encoding: 'utf8', flag: 'wx', mode: 0o600 });
  } catch (fout) {
    if (fout?.code === 'EEXIST') {
      throw new Error(`${bestand} bestaat al. Er is niets veranderd. Een nieuw paar maakt alle abonnementen ongeldig; `
        + 'verwijder het bestand alleen als dat echt de bedoeling is (en werk dan ook de kluis en Cloudflare Pages bij).');
    }
    throw fout;
  }
  meld(`Gemaakt: ${bestand}`);
  meld('');
  meld('Publieke sleutel (voor VITE_VAPID_PUBLIC_KEY in Cloudflare Pages, met een eigen akkoord):');
  meld(paar.publiek);
  meld('');
  meld('De private sleutel staat alleen in dat bestand. Open het (notepad .env.pushproef.local), zet de waarde achter');
  meld('PUSHPROEF_VAPID_PRIVATE= in de wachtwoordkluis, en deel hem nergens anders.');
  return { publiek: paar.publiek };
}

if (isHoofdscript(import.meta.url, process.argv[1])) {
  try {
    maakSleutelbestand();
  } catch (fout) {
    console.error(`Fout: ${fout.message}`);
    process.exitCode = 1;
  }
}
