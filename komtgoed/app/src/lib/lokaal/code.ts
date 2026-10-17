// Inloggen met een e-mailcode (KG-5H deel 2, K1). Zie docs/thuisplanner-k1-ontwerp.md.
//
// 1. Code aanvragen: Supabase Auth (signInWithOtp, altijd met shouldCreateUser: true, zodat een nieuw en een bestaand
//    adres precies hetzelfde gaan). De Send Email-hook stuurt een eigen code van 6 cijfers.
// 2. Code controleren: de Edge Function controleer-code. Bij een goede code komt een eenmalige token_hash terug; die
//    geeft de app direct aan verifyOtp, en Supabase geeft de sessie uit. De token_hash wordt nergens bewaard.
//
// Op dit toestel worden alleen bewaard (localStorage):
// - de openstaande aanvraag (adres en tijdstip, hoogstens 10 minuten; nooit de code): zo staat het codescherm er nog
//   als je even naar je mail wisselt en het venster daarbij verdwijnt (M1);
// - per adres een toestel-token: na een geslaagde inlog is dit een bekend toestel (eigen pogingenteller); het token
//   draait bij elke geslaagde inlog. Het opent nooit zelf een account.
import { codeTekst } from '../foutcodes';

const AANVRAAG = 'thuisplanner-code-aanvraag';
const TOESTEL = 'thuisplanner-toestel:';
export const AANVRAAG_GELDIG_MS = 10 * 60 * 1000;
export const NIEUWE_CODE_NA_S = 60;

function opslag(): Storage | null {
  try { return window.localStorage; } catch { return null; }
}

export interface Aanvraag { email: string; tijd: number }

export function bewaarAanvraag(email: string, nu = Date.now()): void {
  try { opslag()?.setItem(AANVRAAG, JSON.stringify({ email: email.trim().toLowerCase(), tijd: nu })); } catch { /* geen opslag */ }
}
export function leesAanvraag(nu = Date.now()): Aanvraag | null {
  try {
    const ruw = opslag()?.getItem(AANVRAAG);
    if (!ruw) return null;
    const a = JSON.parse(ruw) as Aanvraag;
    if (typeof a?.email !== 'string' || typeof a.tijd !== 'number' || a.tijd > nu || nu - a.tijd > AANVRAAG_GELDIG_MS) {
      opslag()?.removeItem(AANVRAAG);
      return null;
    }
    return a;
  } catch { return null; }
}
export function vergeetAanvraag(): void {
  try { opslag()?.removeItem(AANVRAAG); } catch { /* geen opslag */ }
}

export const leesToestel = (email: string): string | null => {
  try {
    const t = opslag()?.getItem(TOESTEL + email.trim().toLowerCase()) ?? null;
    return t && /^[0-9a-f]{64}$/.test(t) ? t : null;
  } catch { return null; }
};
export function bewaarToestel(email: string, token: string): void {
  if (!/^[0-9a-f]{64}$/.test(token)) return;
  try { opslag()?.setItem(TOESTEL + email.trim().toLowerCase(), token); } catch { /* geen opslag: volgende keer onbekend */ }
}
export function vergeetToestellen(): void {
  const o = opslag();
  if (!o) return;
  try {
    for (let i = o.length - 1; i >= 0; i--) { const k = o.key(i); if (k?.startsWith(TOESTEL)) o.removeItem(k); }
  } catch { /* geen opslag */ }
}

/** Een adres voor in beeld, als iemand anders kan meekijken: j…@….nl (de volledige vorm toont de app zelf). */
export function gemaskeerd(email: string): string {
  const [naam, domein = ''] = email.split('@');
  const tld = domein.includes('.') ? domein.slice(domein.lastIndexOf('.')) : '';
  return `${naam.slice(0, 1)}…@…${tld}`;
}

export const geldigAdres = (s: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s.trim()) && s.trim().length <= 254;
export const geldigeCode = (s: string) => /^\d{6}$/.test(s.trim());

export type Controle =
  | { ok: true; tokenHash: string; type: 'signup' | 'email' | 'email_change'; toestel: string }
  | { ok: false; code: string; fout: string };

/** De Edge Function controleer-code. Geen token_hash in een URL; alles in de body van een POST. */
export async function controleerBijServer(
  url: string, anonKey: string,
  invoer: { email: string; code: string; toestel?: string | null; captchaToken?: string | null },
  doe: typeof fetch = fetch,
): Promise<Controle> {
  let r: Response;
  try {
    r = await doe(`${url.replace(/\/$/, '')}/functions/v1/controleer-code`, {
      method: 'POST',
      headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: invoer.email.trim().toLowerCase(), code: invoer.code.trim(),
        ...(invoer.toestel ? { toestel: invoer.toestel } : {}), ...(invoer.captchaToken ? { captchaToken: invoer.captchaToken } : {}) }),
    });
  } catch {
    return { ok: false, code: 'NETWERK', fout: codeTekst('NETWERK') };
  }
  let b: { token_hash?: string; type?: string; toestel?: string; code?: string } | null = null;
  try { b = await r.json(); } catch { b = null; }
  if (r.ok && b?.token_hash && (b.type === 'signup' || b.type === 'email' || b.type === 'email_change') && b.toestel) {
    return { ok: true, tokenHash: b.token_hash, type: b.type, toestel: b.toestel };
  }
  const code = typeof b?.code === 'string' && /^TPK\d\d$/.test(b.code) ? b.code : 'TPK04';
  return { ok: false, code, fout: codeTekst(code) };
}
