// Omgevingen van de app en hun regels. Eén plek, gebruikt door de app (bij het opstarten) én door de build
// (vite.config.ts): wat de build weigert, weigert de app ook. Zie docs/thuisplanner-staging.md.
//
// - demo:    geen Supabase-gegevens in de build; alles in het geheugen van het tabblad.
// - lokaal:  een Supabase op dit toestel of in het eigen netwerk (sessie.ts: isLokaalAdres), met fictieve accounts.
// - staging: precies één online Supabase-project (https://<ref>.supabase.co), alleen via `npm run build:staging`.
//            Geen demo-accounts of -wachtwoord in de build; de build weigert ook geheime sleutels en Huisplan-projecten.

export type Omgeving = 'demo' | 'lokaal' | 'staging';

const PROJECT_HOST = /^([a-z]{20})\.supabase\.co$/;

/**
 * Het projectkenmerk als dit precies een online Supabase-projectadres is (https, geen poort of pad), anders null.
 * isVerboden: extra weigering (de build sluit daarmee de Huisplan-projecten uit, zie scripts/staging-build.ts).
 */
export function stagingRef(url: string | undefined, isVerboden: (ref: string) => boolean = () => false): string | null {
  if (!url) return null;
  let u: URL;
  try { u = new URL(url); } catch { return null; }
  if (u.protocol !== 'https:' || u.port || u.username || u.password || u.search || u.hash) return null;
  if (u.pathname !== '/' && u.pathname !== '') return null;
  const m = PROJECT_HOST.exec(u.hostname);
  if (!m || isVerboden(m[1])) return null;
  // Precies deze schrijfwijze (kleine letters, niets extra): wat in de build staat, staat zo ook in de CSP.
  if (url.replace(/\/$/, '') !== `https://${m[1]}.supabase.co`) return null;
  return m[1];
}

/**
 * Fouten in een stagingconfiguratie (leeg = in orde). De app controleert dit bij het opstarten; de build daarnaast
 * ook op geheime sleutels en Huisplan-projecten (scripts/staging-build.ts), zodat die regels niet in de bundel staan.
 */
export function stagingFouten(env: Record<string, string | undefined>, isVerboden?: (ref: string) => boolean): string[] {
  const fouten: string[] = [];
  if (!stagingRef(env.VITE_SUPABASE_URL, isVerboden)) {
    fouten.push('VITE_SUPABASE_URL moet precies https://<projectkenmerk>.supabase.co zijn (en geen Huisplan-project).');
  }
  if (!env.VITE_SUPABASE_ANON_KEY) fouten.push('VITE_SUPABASE_ANON_KEY ontbreekt.');
  for (const k of Object.keys(env)) {
    if (!k.startsWith('VITE_')) continue;
    if (k.startsWith('VITE_DEMO_')) fouten.push(`${k} hoort niet in een stagingbuild (alleen lokaal).`);
  }
  return fouten;
}
