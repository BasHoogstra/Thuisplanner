// Bewaking van de browserbuild (gebruikt door vite.config.ts). Zie docs/thuisplanner-staging.md.
//
// 1. Vooraf: een stagingbuild (`vite build --mode staging`) mag alleen met precies één online Supabase-project,
//    de publieke sleutel en geen VITE_DEMO_* of geheime sleutels (src/lib/omgeving.ts: stagingFouten).
//    Een gewone build mag nooit stilletjes een stagingbuild worden.
// 2. Achteraf: in de gebouwde bestanden staat geen geheime sleutel, geen ander Supabase-project en geen
//    Huisplan-project. Zo niet, dan faalt de build.
// 3. Altijd: een _headers-bestand voor Cloudflare Pages met de beveiligingsheaders. connect-src staat alleen
//    het eigen adres toe, en in staging daarnaast precies het stagingproject (https en wss).
import { createHash } from 'node:crypto';
import type { Plugin } from 'vite';
import { stagingFouten, stagingRef } from '../src/lib/omgeving';

/** Is deze sleutel geheim (service-rol of secret key)? Zo'n sleutel hoort nooit in een browserbuild. */
export function isGeheimeSleutel(waarde: string | undefined): boolean {
  if (!waarde) return false;
  if (/^sb_secret_/.test(waarde)) return true;
  const delen = waarde.split('.');
  if (delen.length !== 3) return false;
  try {
    return JSON.parse(Buffer.from(delen[1], 'base64url').toString('utf8'))?.role !== 'anon';
  } catch {
    return false;
  }
}

/** Alle fouten van een stagingconfiguratie: die van de app, plus geheime sleutels in VITE_-variabelen. */
export function stagingBuildFouten(env: Record<string, string | undefined>): string[] {
  const fouten = stagingFouten(env, isHuisplanRef);
  for (const [k, v] of Object.entries(env)) {
    if (!k.startsWith('VITE_')) continue;
    if (/SERVICE|SECRET/.test(k)) fouten.push(`${k}: een geheime sleutel hoort nooit in een browserbuild.`);
    if (isGeheimeSleutel(v)) fouten.push(`${k} bevat een geheime sleutel (service-rol of secret key).`);
  }
  return fouten;
}

// De Supabase-projecten van Huisplan, als SHA-256 van het projectkenmerk. De kenmerken zelf mogen nergens in
// thuisplanner/ staan (supabase/tests/statisch.js), en dus ook niet in de app of deze build.
const HUISPLAN_HASHES = new Set([
  'ac0b690fc1fa36c5bb314976c3cc64f799b81ef38494de0e748e26293842125e',
  '81269699bafc709ab950f9156081d6ef6c1359c2f0631e6e99efcbc1690f9b6a',
]);
export const isHuisplanRef = (ref: string) => HUISPLAN_HASHES.has(createHash('sha256').update(ref).digest('hex'));

export function controleerOmgeving(mode: string, env: Record<string, string | undefined>): { staging: boolean; ref: string | null } {
  if (mode === 'staging') {
    const fouten = stagingBuildFouten({ ...env, VITE_OMGEVING: 'staging' });
    if (fouten.length) throw new Error('Stagingbuild geweigerd:\n- ' + fouten.join('\n- '));
    return { staging: true, ref: stagingRef(env.VITE_SUPABASE_URL, isHuisplanRef) };
  }
  if (env.VITE_OMGEVING === 'staging') throw new Error('VITE_OMGEVING=staging kan alleen via `npm run build:staging`.');
  return { staging: false, ref: null };
}

/** Cloudflare Turnstile (de captcha bij het aanvragen van een code), alleen als er een sitekey is ingesteld. */
const TURNSTILE = 'https://challenges.cloudflare.com';

/** De _headers voor Cloudflare Pages. */
export function headersBestand(ref: string | null, turnstile = false): string {
  const connect = (ref ? `'self' https://${ref}.supabase.co wss://${ref}.supabase.co` : `'self'`) + (turnstile ? ` ${TURNSTILE}` : '');
  const csp = [
    `default-src 'self'`, `script-src 'self'${turnstile ? ' ' + TURNSTILE : ''}`, `style-src 'self'`, `img-src 'self' data:`, `font-src 'self'`,
    `connect-src ${connect}`, `frame-src ${turnstile ? TURNSTILE : "'none'"}`, `worker-src 'self'`, `manifest-src 'self'`, `object-src 'none'`,
    `base-uri 'none'`, `form-action 'self'`, `frame-ancestors 'none'`,
  ].join('; ');
  return [
    '/*',
    `  Content-Security-Policy: ${csp}`,
    '  X-Robots-Tag: noindex, nofollow',
    '  Referrer-Policy: no-referrer',
    '  X-Content-Type-Options: nosniff',
    '  X-Frame-Options: DENY',
    '  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()',
    '  Cross-Origin-Opener-Policy: same-origin',
    '/',
    '  Cache-Control: no-cache',
    '/index.html',
    '  Cache-Control: no-cache',
    '/assets/*',
    '  Cache-Control: public, max-age=31536000, immutable',
    '',
  ].join('\n');
}

/** Wat er nooit in een gebouwd bestand mag staan. Geeft de gevonden problemen terug (leeg = in orde). */
export function verbodenInhoud(code: string, toegestaneRef: string | null): string[] {
  const fouten: string[] = [];
  if (/sb_secret_[A-Za-z0-9_-]{8,}/.test(code)) fouten.push('een secret key (sb_secret_…)');
  for (const m of code.matchAll(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g)) {
    if (isGeheimeSleutel(m[0])) fouten.push('een geheime JWT (service-rol)');
  }
  for (const m of new Set(code.match(/[a-z]{20}/g) ?? [])) if (isHuisplanRef(m)) fouten.push('een Huisplan-project');
  for (const m of code.matchAll(/([a-z]{20})\.supabase\.co/g)) {
    if (m[1] !== toegestaneRef) fouten.push('een ander Supabase-project (' + m[1] + ')');
  }
  return [...new Set(fouten)];
}

export function bewaking(mode: string, env: Record<string, string | undefined>): Plugin {
  const { ref } = controleerOmgeving(mode, env);
  return {
    name: 'thuisplanner-bewaking',
    apply: 'build',
    // Ook vóór het inloggen (tabblad, beginscherm) zichtbaar dat dit de testomgeving is.
    transformIndexHtml(html) {
      return ref ? html.replace(/<title>[^<]*<\/title>/, '<title>Thuisplanner (testomgeving)</title>') : html;
    },
    generateBundle(_opties, bundel) {
      for (const [naam, deel] of Object.entries(bundel)) {
        const code = deel.type === 'chunk' ? deel.code : typeof deel.source === 'string' ? deel.source : '';
        const fouten = verbodenInhoud(code, ref);
        if (fouten.length) this.error(`${naam} bevat ${fouten.join(', ')}; de build is gestopt.`);
      }
      this.emitFile({ type: 'asset', fileName: '_headers', source: headersBestand(ref, !!env.VITE_TURNSTILE_SITEKEY) });
    },
  };
}
