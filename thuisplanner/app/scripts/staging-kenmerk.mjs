// Vóór de echte stagingbuild (`npm run build:staging`, ook in Cloudflare Pages): het Supabase-project in
// VITE_SUPABASE_URL moet precies het vastgelegde stagingproject zijn uit thuisplanner/omgevingen.json. Zonder vastgelegd
// kenmerk, of met een ander project, stopt de build. Zie docs/thuisplanner-staging-overstap.md, stap 0.
// De overige bewaking (één project, geen geheimen, geen Huisplan) staat in scripts/staging-build.ts. De offline
// staging-e2e (playwright.staging.config.ts) bouwt bewust met een verzonnen project en roept dit script niet aan.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv } from 'vite';

const hier = path.dirname(fileURLToPath(import.meta.url));

/** Fouten (leeg = in orde) voor deze URL tegen de omgevingen. */
export function kenmerkFouten(url, omgevingen) {
  const vast = omgevingen?.staging?.supabaseRef;
  if (!vast) return ['Voor staging staat geen projectkenmerk in thuisplanner/omgevingen.json.'];
  const m = /^https:\/\/([a-z]{20})\.supabase\.co$/.exec(url ?? '');
  if (!m) return ['VITE_SUPABASE_URL is niet https://<kenmerk>.supabase.co.'];
  if (m[1] !== vast) return ['VITE_SUPABASE_URL hoort niet bij het vastgelegde stagingproject uit omgevingen.json.'];
  return [];
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const env = { ...loadEnv('staging', path.join(hier, '..'), 'VITE_'), ...process.env };
  const omgevingen = JSON.parse(readFileSync(path.join(hier, '../../omgevingen.json'), 'utf8'));
  const fouten = kenmerkFouten(env.VITE_SUPABASE_URL, omgevingen);
  if (fouten.length) { console.error('Stagingbuild geweigerd:\n- ' + fouten.join('\n- ')); process.exit(1); }
  console.log('Stagingproject: het vastgelegde kenmerk uit omgevingen.json.');
}
