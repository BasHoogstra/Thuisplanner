// Thuisplanner K1: gedeelde hulpfuncties voor de Edge Functions stuur-code en controleer-code. Geen externe imports:
// alleen WebCrypto en fetch (Deno). Zie docs/thuisplanner-k1-ontwerp.md.
//
// Geheimen (alleen als secrets van de Edge Functions; nooit in de frontend, de repository of logboeken):
//   K1_PEPPER        HMAC-sleutel voor adressen, codes en toestel-tokens
//   K1_SLEUTEL       32 bytes (base64) voor AES-256-GCM van de token_hash
//   K1_HOOK_SECRET   "v1,whsec_<base64>" (Standard Webhooks; hetzelfde als in de hookinstelling van Supabase Auth)
// Verder: MAIL_ADAPTER (lokaal: mailpit), MAILPIT_URL, MAIL_AFZENDER, K1_CAPTCHA ("aan" of "uit"), TURNSTILE_SECRET,
// APP_URL.

const tekst = new TextEncoder();

/** Een verplichte instelling; ontbreekt hij, dan weigert de functie (fail-closed). */
export function instelling(naam: string): string {
  const v = Deno.env.get(naam);
  if (!v) throw new Error(`ontbrekende instelling ${naam}`);
  return v;
}

/**
 * Mag de captcha uit (K1_CAPTCHA=uit)? Alleen als deze functie op een lokale stack draait: de gateway van de lokale
 * Supabase-stack (kong of een supabase_kong_*-container), of dit toestel. Online (https://<kenmerk>.supabase.co) of bij
 * een onbekend adres nooit (review stap 3a, L3); de nacontrole meldt het daarnaast.
 */
export function captchaUitToegestaan(supabaseUrl: string | undefined): boolean {
  let host: string;
  try { host = new URL(supabaseUrl ?? '').hostname; } catch { return false; }
  return /^(kong|supabase_kong_[a-z0-9_]+|localhost|127\.0\.0\.1|host\.docker\.internal)$/.test(host);
}

const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
const b64 = (b: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(b instanceof Uint8Array ? b : new Uint8Array(b))));
const uitB64 = (s: string) => Uint8Array.from(atob(s), c => c.charCodeAt(0));

export async function hmacHex(sleutel: string | Uint8Array, bericht: string): Promise<string> {
  const k = await crypto.subtle.importKey('raw', typeof sleutel === 'string' ? tekst.encode(sleutel) : sleutel,
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', k, tekst.encode(bericht)));
}

export const adresHmac = (email: string) => hmacHex(instelling('K1_PEPPER'), 'adres:' + email.trim().toLowerCase());
export const codeHmac = (adres: string, code: string) => hmacHex(instelling('K1_PEPPER'), 'code:' + adres + ':' + code);
export const toestelHmac = (token: string) => hmacHex(instelling('K1_PEPPER'), 'toestel:' + token);

/** 6 cijfers, elke waarde even waarschijnlijk (rejection sampling op 32 bits). */
export function willekeurigeCode(): string {
  const grens = Math.floor(0x100000000 / 1_000_000) * 1_000_000;
  const buf = new Uint32Array(1);
  for (;;) {
    crypto.getRandomValues(buf);
    if (buf[0] < grens) return String(buf[0] % 1_000_000).padStart(6, '0');
  }
}

export function willekeurigToken(bytes = 32): string {
  const b = new Uint8Array(bytes);
  crypto.getRandomValues(b);
  return [...b].map(x => x.toString(16).padStart(2, '0')).join('');
}

async function aesSleutel(): Promise<CryptoKey> {
  const ruw = uitB64(instelling('K1_SLEUTEL'));
  if (ruw.length !== 32) throw new Error('K1_SLEUTEL moet 32 bytes zijn');
  return crypto.subtle.importKey('raw', ruw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}
export async function versleutel(waarde: string): Promise<string> {
  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await aesSleutel(), tekst.encode(waarde));
  const alles = new Uint8Array(12 + ct.byteLength);
  alles.set(iv, 0);
  alles.set(new Uint8Array(ct), 12);
  return b64(alles);
}
export async function ontsleutel(waarde: string): Promise<string> {
  const alles = uitB64(waarde);
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: alles.slice(0, 12) }, await aesSleutel(), alles.slice(12));
  return new TextDecoder().decode(pt);
}

/** Vergelijken in constante tijd (geheimen, handtekeningen). */
export function geheimGelijk(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let v = 0;
  for (let i = 0; i < a.length; i++) v |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return v === 0;
}

/** Standard Webhooks (zoals Supabase Auth de hook ondertekent): handtekening en tijd (hoogstens 5 minuten oud). */
export async function webhookGeldig(geheim: string, kop: Headers, body: string): Promise<boolean> {
  const id = kop.get('webhook-id'), tijd = kop.get('webhook-timestamp'), handtekeningen = kop.get('webhook-signature');
  if (!id || !tijd || !handtekeningen || !/^\d+$/.test(tijd)) return false;
  if (Math.abs(Date.now() / 1000 - Number(tijd)) > 300) return false;
  const sleutel = uitB64(geheim.replace(/^v1,/, '').replace(/^whsec_/, ''));
  const k = await crypto.subtle.importKey('raw', sleutel, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const verwacht = b64(await crypto.subtle.sign('HMAC', k, tekst.encode(`${id}.${tijd}.${body}`)));
  return handtekeningen.split(' ').some(h => geheimGelijk(h.replace(/^v1,/, ''), verwacht));
}

/** Een RPC met de service-rol (alleen in de Edge Functions). */
export async function rpc<T>(naam: string, args: Record<string, unknown>): Promise<T> {
  const sleutel = instelling('SUPABASE_SERVICE_ROLE_KEY');
  const r = await fetch(`${instelling('SUPABASE_URL')}/rest/v1/rpc/${naam}`, {
    method: 'POST',
    headers: { apikey: sleutel, Authorization: `Bearer ${sleutel}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  if (!r.ok) throw new Error(`rpc ${naam}: ${r.status}`);
  // Een functie zonder resultaat (void) geeft 204 zonder body.
  const tekst = await r.text();
  return (tekst ? JSON.parse(tekst) : null) as T;
}

export interface Mail { aan: string; onderwerp: string; tekst: string; html: string }

// Versturen: zie aanbieder.ts (verwisselbare koppeling met de mailaanbieder).

export function json(status: number, body: unknown, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...extra } });
}

/** Alleen wat nodig is voor bewaking: nooit een adres, code, token of token_hash. */
export function log(functie: string, gegevens: Record<string, string | number | boolean | null>): void {
  console.log(JSON.stringify({ functie, ...gegevens }));
}
