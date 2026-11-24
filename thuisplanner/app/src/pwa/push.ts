// Hulpjes voor de pushproef (PR P0). Geen opslag, geen database: de proef toont alleen de stand van dit toestel en
// maakt een abonnement dat de tester zelf kopieert (zie src/pwa/PushProef.tsx en scripts/pushproef-stuur.mjs).
// Ook gebruikt door de build (scripts/staging-build.ts), dus zonder DOM op het hoogste niveau.

/** base64url (zonder opvulling) naar bytes; null als het geen geldige base64url is. */
export function base64urlNaarBytes(tekst: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]*$/.test(tekst) || tekst.length % 4 === 1) return null;
  const b64 = tekst.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (tekst.length % 4)) % 4);
  try {
    return Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  } catch {
    return null;
  }
}

/**
 * De publieke VAPID-sleutel als bytes, als het er precies een is: een ongecomprimeerd P-256-punt (65 bytes, begint met
 * 0x04) in base64url. Een private sleutel (32 bytes) of iets anders geeft null.
 */
export function publiekeVapidSleutel(tekst: string | undefined): Uint8Array | null {
  if (!tekst) return null;
  const bytes = base64urlNaarBytes(tekst.trim());
  return bytes && bytes.length === 65 && bytes[0] === 0x04 ? bytes : null;
}

export type Toestemming = NotificationPermission | 'niet-ondersteund';

export interface PushStand {
  /** Notification.permission, of 'niet-ondersteund' als de browser geen meldingen kent (zoals Safari buiten het beginscherm). */
  toestemming: Toestemming;
  /** Draait de app als app op het beginscherm (standalone)? */
  standalone: boolean;
  /** Kent deze browser service workers en de Push API? */
  pushOndersteund: boolean;
  /** iPhone of iPad (ook een iPad die zich als Mac voordoet). */
  ios: boolean;
}

type Venster = {
  navigator: Navigator;
  matchMedia?: (q: string) => { matches: boolean };
  Notification?: { permission: NotificationPermission };
  PushManager?: unknown;
};

export function pushStand(v: Venster = window as unknown as Venster): PushStand {
  const nav = v.navigator as Navigator & { standalone?: boolean };
  const standalone = !!v.matchMedia?.('(display-mode: standalone)').matches || nav.standalone === true;
  let sw = false;
  try { sw = 'serviceWorker' in nav && !!nav.serviceWorker; } catch { sw = false; }
  const ua = nav.userAgent || '';
  return {
    toestemming: v.Notification ? v.Notification.permission : 'niet-ondersteund',
    standalone,
    pushOndersteund: sw && !!v.PushManager,
    ios: /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && (nav.maxTouchPoints ?? 0) > 1),
  };
}

/** Het abonnement zoals scripts/pushproef-stuur.mjs het inleest: { endpoint, expirationTime, keys: { p256dh, auth } }. */
export function abonnementTekst(abonnement: Pick<PushSubscription, 'toJSON'>): string {
  return JSON.stringify(abonnement.toJSON(), null, 2);
}
