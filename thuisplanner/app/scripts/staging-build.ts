// Bewaking van de browserbuild (gebruikt door vite.config.ts). Zie docs/thuisplanner-staging.md en
// docs/thuisplanner-beta-voorbereiding.md §2.2.
//
// 1. Vooraf: een online build (`vite build --mode staging|beta|productie`) mag alleen met precies één online
//    Supabase-project, de publieke sleutel en geen VITE_DEMO_* of geheime sleutels (src/lib/omgeving.ts: onlineFouten).
//    Het project moet bovendien precies het vastgelegde project van die omgeving zijn uit thuisplanner/omgevingen.json
//    (L8: ook bij een losse `vite --mode …`, niet alleen via npm run build:…). Enige uitzondering: de offline e2e
//    (playwright.staging.config.ts, playwright.beta.config.ts) met KG_E2E_NEPPROJECT=1, en dan alleen het verzonnen
//    project NEP_REF. Een gewone build mag nooit stilletjes een online build worden.
// 2. Achteraf: in de gebouwde bestanden staat geen geheime sleutel, geen ander Supabase-project en geen
//    Huisplan-project. Zo niet, dan faalt de build.
// 3. Altijd: een _headers-bestand voor Cloudflare Pages met de beveiligingsheaders. connect-src staat alleen
//    het eigen adres toe, en online daarnaast precies het project van de omgeving (https en wss).
import { createHash } from 'node:crypto';
import type { Plugin } from 'vite';
import { isOnlineOmgeving, onlineFouten, projectRef, type OnlineOmgeving } from '../src/lib/omgeving';
import { publiekeVapidSleutel } from '../src/pwa/push';
import { BUILDNAAM, kenmerkFouten, leesOmgevingen, type Omgevingen } from './staging-kenmerk.mjs';

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

/** Alle fouten van een online configuratie: die van de app, plus geheime sleutels in VITE_-variabelen. */
export function onlineBuildFouten(env: Record<string, string | undefined>, omgeving: OnlineOmgeving): string[] {
  const fouten = onlineFouten(env, omgeving, isHuisplanRef);
  for (const [k, v] of Object.entries(env)) {
    if (!k.startsWith('VITE_')) continue;
    if (/SERVICE|SECRET|PRIVATE/.test(k)) fouten.push(`${k}: een geheime sleutel hoort nooit in een browserbuild.`);
    if (isGeheimeSleutel(v)) fouten.push(`${k} bevat een geheime sleutel (service-rol of secret key).`);
  }
  // Pushproef (PR P0): alleen de publieke VAPID-sleutel mag in de build, en die moet er ook echt een zijn (een private
  // sleutel is 32 bytes, de publieke 65).
  if (env.VITE_VAPID_PUBLIC_KEY !== undefined && !publiekeVapidSleutel(env.VITE_VAPID_PUBLIC_KEY)) {
    fouten.push('VITE_VAPID_PUBLIC_KEY is geen publieke VAPID-sleutel (65 bytes, base64url, begint met B).');
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

/**
 * Het verzonnen project van de offline e2e (playwright.staging.config.ts en playwright.beta.config.ts). Alleen dit
 * kenmerk mag, en alleen met KG_E2E_NEPPROJECT=1, langs de kenmerkcontrole van omgevingen.json: zo kan de uitzondering
 * nooit een echt ander project in een build laten. Het staat bij geen enkele omgeving (zie de tests).
 */
export const NEP_REF = 'abcdefghijklmnopqrst';

export interface OmgevingOpties {
  /** thuisplanner/omgevingen.json (in tests een eigen variant). */
  omgevingen?: Omgevingen;
  /** De offline e2e: KG_E2E_NEPPROJECT=1 (alleen uit process.env, nooit uit een .env-bestand). */
  nepproject?: boolean;
}

export function controleerOmgeving(mode: string, env: Record<string, string | undefined>, opties: OmgevingOpties = {}):
  { omgeving: OnlineOmgeving | null; ref: string | null } {
  if (isOnlineOmgeving(mode)) {
    const fouten = onlineBuildFouten({ ...env, VITE_OMGEVING: mode }, mode);
    if (env.VITE_OMGEVING !== undefined && env.VITE_OMGEVING !== mode) fouten.push(`VITE_OMGEVING=${env.VITE_OMGEVING} past niet bij --mode ${mode}.`);
    const ref = projectRef(env.VITE_SUPABASE_URL, isHuisplanRef);
    if (ref && opties.nepproject) {
      if (ref !== NEP_REF) fouten.push('KG_E2E_NEPPROJECT is alleen voor de offline e2e met het verzonnen project; met een echt project geldt omgevingen.json.');
    } else if (ref) {
      fouten.push(...kenmerkFouten(env.VITE_SUPABASE_URL, opties.omgevingen ?? leesOmgevingen(), mode));
    }
    if (fouten.length) throw new Error(`${BUILDNAAM[mode]} geweigerd:\n- ` + fouten.join('\n- '));
    return { omgeving: mode, ref };
  }
  if (isOnlineOmgeving(env.VITE_OMGEVING)) throw new Error(`VITE_OMGEVING=${env.VITE_OMGEVING} kan alleen via \`npm run build:${env.VITE_OMGEVING}\`.`);
  if (env.VITE_OMGEVING !== undefined && env.VITE_OMGEVING !== 'lokaal') throw new Error(`VITE_OMGEVING=${env.VITE_OMGEVING} is geen omgeving van Thuisplanner.`);
  return { omgeving: null, ref: null };
}

/** Cloudflare Turnstile (de captcha bij het aanvragen van een code), alleen als er een sitekey is ingesteld. */
const TURNSTILE = 'https://challenges.cloudflare.com';

/**
 * De _headers voor Cloudflare Pages. img-src staat ook blob: toe: Mijn spullen toont een foto van een document als
 * blob-adres in het geheugen (opgehaald met een ondertekende link, no-store), nooit als publieke URL. De rest blijft dicht.
 */
export function headersBestand(ref: string | null, turnstile = false): string {
  const connect = (ref ? `'self' https://${ref}.supabase.co wss://${ref}.supabase.co` : `'self'`) + (turnstile ? ` ${TURNSTILE}` : '');
  const csp = [
    `default-src 'self'`, `script-src 'self'${turnstile ? ' ' + TURNSTILE : ''}`, `style-src 'self'`, `img-src 'self' data: blob:`, `font-src 'self'`,
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
    // PWA (PR P0): de service worker en het manifest altijd vers, zodat een nieuwe versie meteen geldt.
    '/sw.js',
    '  Cache-Control: no-cache',
    '/manifest.webmanifest',
    '  Cache-Control: no-cache',
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

/** De titel in index.html (ook vóór het inloggen zichtbaar, in het tabblad en op het beginscherm). */
const TITEL: Record<OnlineOmgeving, string> = { staging: 'Thuisplanner (testomgeving)', beta: 'Thuisplanner', productie: 'Thuisplanner' };

export function bewaking(mode: string, env: Record<string, string | undefined>, opties: OmgevingOpties = {}): Plugin {
  const { omgeving, ref } = controleerOmgeving(mode, env, opties);
  return {
    name: 'thuisplanner-bewaking',
    apply: 'build',
    // Staging: ook vóór het inloggen zichtbaar dat dit de testomgeving is. Bèta en productie: gewoon "Thuisplanner"
    // (de rustige bètamarkering staat op het inlogscherm en in Meer, besluit O7), nooit "(demo)".
    transformIndexHtml(html) {
      return omgeving ? html.replace(/<title>[^<]*<\/title>/, `<title>${TITEL[omgeving]}</title>`) : html;
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
