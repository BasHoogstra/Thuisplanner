// Wie mag wat met een item, in deze demo. In de echte app beslist de server (RLS, zie KG-1 en gate 9);
// het scherm volgt dan alleen wat de server teruggeeft.
import type { Afspraak, Item, LidId } from './types';

/** Een privé-afspraak van een ander komt alleen als "bezet" binnen: zonder titel en zonder rechten. */
export function isBezetVanAnder(a: Afspraak, ik: LidId): boolean {
  return a.zichtbaarheid === 'prive' && a.eigenaar !== ik;
}

/**
 * Gedeelde items mag ieder lid aanpassen (het is één huishouden).
 * Een privé-afspraak alleen de eigenaar; alleen de eigenaar kan iets privé of weer gedeeld maken.
 */
export function magBewerken(item: Item, ik: LidId): boolean {
  return item.soort !== 'afspraak' || !isBezetVanAnder(item, ik);
}

export function magZichtbaarheidKiezen(a: Afspraak | null, ik: LidId): boolean {
  return a === null || a.eigenaar === ik;
}
