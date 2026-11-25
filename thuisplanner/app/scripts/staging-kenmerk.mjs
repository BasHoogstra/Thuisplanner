// Vóór een echte online build (`npm run build:staging`, `build:beta` of `build:productie`, ook in Cloudflare Pages): het
// Supabase-project in VITE_SUPABASE_URL moet precies het vastgelegde project van die omgeving zijn uit
// thuisplanner/omgevingen.json. Zonder vastgelegd kenmerk (de bèta en productie tot hun project bestaat), met een
// project van een andere omgeving of met een ander project stopt de build. Zie docs/thuisplanner-staging-overstap.md,
// stap 0, en docs/thuisplanner-beta-voorbereiding.md §2.2.
//   node scripts/staging-kenmerk.mjs [staging|beta|productie]     (zonder omgeving: staging, zoals voorheen)
// Dezelfde controle zit ook in de build zelf (scripts/staging-build.ts: controleerOmgeving, L8), zodat een losse
// `vite build --mode beta` ook weigert. Dit script geeft de melding alleen eerder, vóór de typecontrole. De regels zijn
// die van supabase/staging/verbinding-controle.mjs (omgevingFouten): staging, bèta en productie nooit door elkaar.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const hier = path.dirname(fileURLToPath(import.meta.url));

export const ONLINE = ['staging', 'beta', 'productie'];
/** De naam van de build in meldingen ("Stagingbuild geweigerd"). */
export const BUILDNAAM = { staging: 'Stagingbuild', beta: 'Bètabuild', productie: 'Productiebuild' };
const NAAM = { staging: 'staging', beta: 'de bèta', productie: 'productie' };

export const leesOmgevingen = () => JSON.parse(readFileSync(path.join(hier, '../../omgevingen.json'), 'utf8'));

/** Fouten (leeg = in orde) voor deze URL tegen de omgevingen. */
export function kenmerkFouten(url, omgevingen, omgeving = 'staging') {
  if (!ONLINE.includes(omgeving)) return [`Onbekende omgeving ${JSON.stringify(omgeving)}: alleen staging, beta of productie.`];
  const vast = omgevingen?.[omgeving]?.supabaseRef;
  if (!vast) {
    return [`Voor ${NAAM[omgeving]} staat nog geen projectkenmerk in thuisplanner/omgevingen.json (${omgeving}.supabaseRef). `
      + 'Deze build kan pas als dat project bestaat en het kenmerk na controle in het dashboard is vastgelegd.'];
  }
  const m = /^https:\/\/([a-z]{20})\.supabase\.co$/.exec(url ?? '');
  if (!m) return ['VITE_SUPABASE_URL is niet https://<kenmerk>.supabase.co.'];
  for (const [ander, o] of Object.entries(omgevingen)) {
    if (ander !== omgeving && o && typeof o === 'object' && o.supabaseRef === m[1]) {
      return [`VITE_SUPABASE_URL hoort bij de omgeving ${ander}, niet bij ${omgeving}.`];
    }
  }
  if (m[1] !== vast) return [`VITE_SUPABASE_URL hoort niet bij het vastgelegde project van ${NAAM[omgeving]} uit omgevingen.json.`];
  return [];
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const omgeving = process.argv[2] ?? 'staging';
  if (!ONLINE.includes(omgeving)) { console.error(`Onbekende omgeving ${JSON.stringify(omgeving)}: alleen staging, beta of productie.`); process.exit(1); }
  // Vite pas hier laden: de build en de tests importeren dit bestand ook (zonder esbuild in de testomgeving).
  const { loadEnv } = await import('vite');
  const env = { ...loadEnv(omgeving, path.join(hier, '..'), 'VITE_'), ...process.env };
  const fouten = kenmerkFouten(env.VITE_SUPABASE_URL, leesOmgevingen(), omgeving);
  if (fouten.length) { console.error(`${BUILDNAAM[omgeving]} geweigerd:\n- ` + fouten.join('\n- ')); process.exit(1); }
  console.log(`Project van ${NAAM[omgeving]}: het vastgelegde kenmerk uit omgevingen.json.`);
}
