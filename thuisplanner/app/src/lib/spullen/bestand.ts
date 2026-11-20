// Bestanden kiezen en voorbereiden op het toestel (docs/thuisplanner-spullen-documenten.md §5 en §6.5). Alleen PDF, JPEG,
// PNG en WebP, hoogstens 10 MB; het type volgt uit de eerste bytes (magic bytes), niet uit de naam of de extensie.
// Foto's worden verkleind en opnieuw getekend: zo verdwijnen de plaatsgegevens (EXIF/GPS). Hetzelfde controleert de server
// later opnieuw (bevestig-upload); de client kan liegen.
import type { BestandType } from './types';

export const MAX_BYTES = 10 * 1024 * 1024;
/** Langste zijde van een verkleinde foto. */
export const MAX_ZIJDE = 2000;
export const ACCEPT = 'application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif';

/** Het echte type uit de eerste bytes; null als het geen toegestaan type is (SVG, HTML, Office, leeg, ...). */
export function typeUitBytes(b: Uint8Array): BestandType | null {
  const is = (...x: number[]) => x.every((v, i) => b[i] === v);
  if (b.length >= 5 && is(0x25, 0x50, 0x44, 0x46, 0x2d)) return 'application/pdf'; // %PDF-
  if (b.length >= 3 && is(0xff, 0xd8, 0xff)) return 'image/jpeg';
  if (b.length >= 8 && is(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return 'image/png';
  if (b.length >= 12 && is(0x52, 0x49, 0x46, 0x46) && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'image/webp';
  return null;
}

export type Controle = { ok: true; type: BestandType } | { ok: false; reden: string };

/** De controle op het toestel, vóór er iets gebeurt. */
export function controleer(bytes: Uint8Array, grootte: number): Controle {
  if (grootte === 0) return { ok: false, reden: 'Dit bestand is leeg.' };
  if (grootte > MAX_BYTES) return { ok: false, reden: 'Dit bestand is groter dan 10 MB.' };
  const type = typeUitBytes(bytes);
  if (!type) return { ok: false, reden: 'Dit soort bestand kan Thuisplanner niet bewaren. Kies een PDF of een foto (JPEG, PNG of WebP).' };
  return { ok: true, type };
}

/** De nieuwe maat van een foto: de langste zijde hoogstens MAX_ZIJDE, de verhouding gelijk, nooit groter dan het origineel. */
export function nieuweMaat(breedte: number, hoogte: number, max = MAX_ZIJDE): { breedte: number; hoogte: number } {
  const f = Math.min(1, max / Math.max(breedte, hoogte));
  return { breedte: Math.max(1, Math.round(breedte * f)), hoogte: Math.max(1, Math.round(hoogte * f)) };
}

/** SHA-256 als hex (voor "Dit document staat er al"). */
export async function sha256(bytes: Uint8Array): Promise<string | undefined> {
  if (!globalThis.crypto?.subtle) return undefined;
  const h = await crypto.subtle.digest('SHA-256', bytes as BufferSource);
  return [...new Uint8Array(h)].map(x => x.toString(16).padStart(2, '0')).join('');
}

/**
 * Een foto verkleinen en opnieuw tekenen als JPEG (zonder EXIF of plaatsgegevens). HEIC opent alleen als de browser het
 * kan decoderen (Safari); het resultaat is altijd JPEG. Null als het toestel de foto niet kan lezen.
 */
export async function verkleinFoto(bestand: Blob): Promise<Blob | null> {
  if (typeof createImageBitmap !== 'function') return null;
  let beeld: ImageBitmap;
  try { beeld = await createImageBitmap(bestand, { imageOrientation: 'from-image' }); } catch { return null; }
  const maat = nieuweMaat(beeld.width, beeld.height);
  const c = document.createElement('canvas');
  c.width = maat.breedte; c.height = maat.hoogte;
  const x = c.getContext('2d');
  if (!x) return null;
  x.drawImage(beeld, 0, 0, maat.breedte, maat.hoogte);
  beeld.close();
  return new Promise(r => c.toBlob(b => r(b), 'image/jpeg', 0.85));
}

/** De eerste bytes van een bestand (genoeg voor de magic bytes). */
export async function eersteBytes(bestand: Blob, n = 16): Promise<Uint8Array> {
  return new Uint8Array(await bestand.slice(0, n).arrayBuffer());
}
