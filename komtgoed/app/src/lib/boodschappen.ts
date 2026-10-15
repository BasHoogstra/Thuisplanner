// Boodschappen toevoegen zonder dubbelingen. Pure functies, los getest.
import type { Boodschap, Item } from './types';

/** Splitst "eieren, kaas en appels" in losse boodschappen, met een hoofdletter. */
export function splitsBoodschappen(tekst: string): string[] {
  return tekst.split(/,|;|\n|\sen\s/i).map(s => s.trim().replace(/\s+/g, ' ')).filter(Boolean)
    .map(s => s.charAt(0).toUpperCase() + s.slice(1));
}

const sleutel = (naam: string) => naam.trim().toLocaleLowerCase('nl');

export interface BoodschappenResultaat {
  items: Item[];
  nieuw: string[];
  /** Stond al op de lijst als "nog nodig"; niets veranderd. */
  alOpLijst: string[];
  /** Was al afgevinkt en staat nu weer op "nog nodig". */
  terug: string[];
}

/**
 * Voegt namen toe. Staat iets al open op de lijst, dan komt het er niet nog eens bij.
 * Was het al afgevinkt, dan gaat het terug naar "nog nodig". Dubbelingen in de invoer zelf tellen één keer.
 */
export function voegBoodschappenToe(items: Item[], namen: string[], maakId: () => string): BoodschappenResultaat {
  const uit = [...items];
  const nieuw: string[] = [], alOpLijst: string[] = [], terug: string[] = [];
  const gezien = new Set<string>();
  for (const naam of namen) {
    const k = sleutel(naam);
    if (!k || gezien.has(k)) continue;
    gezien.add(k);
    const i = uit.findIndex(x => x.soort === 'boodschap' && sleutel(x.naam) === k);
    if (i === -1) {
      uit.push({ id: maakId(), soort: 'boodschap', naam, afgevinkt: false });
      nieuw.push(naam);
    } else if ((uit[i] as Boodschap).afgevinkt) {
      uit[i] = { ...(uit[i] as Boodschap), afgevinkt: false };
      terug.push((uit[i] as Boodschap).naam);
    } else {
      alOpLijst.push((uit[i] as Boodschap).naam);
    }
  }
  return { items: uit, nieuw, alOpLijst, terug };
}

/** Een korte, eerlijke melding over wat er gebeurd is. */
export function boodschappenMelding(r: Pick<BoodschappenResultaat, 'nieuw' | 'alOpLijst' | 'terug'>): string {
  const delen: string[] = [];
  if (r.nieuw.length === 1) delen.push(`${r.nieuw[0]} op de lijst`);
  else if (r.nieuw.length > 1) delen.push(`${r.nieuw.length} boodschappen toegevoegd`);
  if (r.terug.length) delen.push(`${r.terug.join(', ')} weer nodig`);
  if (r.alOpLijst.length) delen.push(`${r.alOpLijst.join(', ')} stond${r.alOpLijst.length > 1 ? 'en' : ''} er al op`);
  return delen.join(' · ') || 'Niets toegevoegd';
}
