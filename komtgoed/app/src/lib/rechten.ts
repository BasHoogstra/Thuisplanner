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

/**
 * Wat een lid van andermans privé-afspraak mag weten: alleen dat iemand bezet is.
 * Titel, plek en voorbereiding gaan eruit. In de echte app doet de server dit (RLS, gate 9);
 * de demo doet het bij het laden, zodat het scherm die details nooit in handen krijgt.
 */
export function zichtbaarVoor(items: Item[], ik: LidId): Item[] {
  return items.map(i => {
    if (i.soort !== 'afspraak' || !isBezetVanAnder(i, ik)) return i;
    const { titel: _t, plek: _p, voorbereiding: _v, ...rest } = i;
    return rest;
  });
}

/** De titel zoals dit lid hem mag zien: "Bezet" voor een privé-afspraak van een ander. */
export function titelVoor(a: Afspraak, ik: LidId): string {
  return isBezetVanAnder(a, ik) ? 'Bezet' : a.titel ?? '';
}

/** De plek zoals dit lid hem mag zien: niets voor een privé-afspraak van een ander. */
export function plekVoor(a: Afspraak, ik: LidId): string | undefined {
  return isBezetVanAnder(a, ik) ? undefined : a.plek;
}
