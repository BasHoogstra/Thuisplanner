// Mijn spullen & Documenten: het echte type van een bestand uit de eerste bytes (magic bytes), niet uit de naam, de
// extensie of wat de client zegt. Dezelfde regels als app/src/lib/spullen/bestand.ts (typeUitBytes).
export type BestandType = 'application/pdf' | 'image/jpeg' | 'image/png' | 'image/webp';

export function typeUitBytes(b: Uint8Array): BestandType | null {
  const is = (...x: number[]) => x.every((v, i) => b[i] === v);
  if (b.length >= 5 && is(0x25, 0x50, 0x44, 0x46, 0x2d)) return 'application/pdf'; // %PDF-
  if (b.length >= 3 && is(0xff, 0xd8, 0xff)) return 'image/jpeg';
  if (b.length >= 8 && is(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return 'image/png';
  if (b.length >= 12 && is(0x52, 0x49, 0x46, 0x46) && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'image/webp';
  return null;
}
