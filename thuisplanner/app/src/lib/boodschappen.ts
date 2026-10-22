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
  /** Stond bij "Later nodig" en is op de gewone lijst toegevoegd: nu te kopen. */
  naarNu?: string[];
}

/**
 * Voegt namen toe. Staat iets al open op de lijst, dan komt het er niet nog eens bij.
 * Was het al afgevinkt, dan gaat het terug naar "nog nodig". Dubbelingen in de invoer zelf tellen één keer.
 * Met `later` (bijvoorbeeld vanuit een vakantie) komen nieuwe en terugkerende boodschappen bij "Later nodig"; wat al
 * te kopen is, blijft dan te kopen. Zonder `later` gaat een boodschap van "Later nodig" naar "Nu te kopen".
 * Zelfde regels als add_shopping_items op de server.
 */
export function voegBoodschappenToe(items: Item[], namen: string[], maakId: () => string, later = false): BoodschappenResultaat {
  const uit = [...items];
  const nieuw: string[] = [], alOpLijst: string[] = [], terug: string[] = [], naarNu: string[] = [];
  const gezien = new Set<string>();
  const metLater = (b: Boodschap, l: boolean): Boodschap => {
    const { later: _, ...rest } = b;
    return l ? { ...rest, later: true } : rest;
  };
  for (const naam of namen) {
    const k = sleutel(naam);
    if (!k || gezien.has(k)) continue;
    gezien.add(k);
    const i = uit.findIndex(x => x.soort === 'boodschap' && sleutel(x.naam) === k);
    if (i === -1) {
      uit.push(metLater({ id: maakId(), soort: 'boodschap', naam, afgevinkt: false }, later));
      nieuw.push(naam);
    } else if ((uit[i] as Boodschap).afgevinkt) {
      uit[i] = metLater({ ...(uit[i] as Boodschap), afgevinkt: false }, later);
      terug.push((uit[i] as Boodschap).naam);
    } else if (!later && (uit[i] as Boodschap).later) {
      uit[i] = metLater(uit[i] as Boodschap, false);
      naarNu.push((uit[i] as Boodschap).naam);
    } else {
      alOpLijst.push((uit[i] as Boodschap).naam);
    }
  }
  return { items: uit, nieuw, alOpLijst, terug, naarNu };
}

/** Een korte, eerlijke melding over wat er gebeurd is. */
export function boodschappenMelding(r: Pick<BoodschappenResultaat, 'nieuw' | 'alOpLijst' | 'terug' | 'naarNu'>, later = false): string {
  const delen: string[] = [];
  const waar = later ? 'bij Later nodig' : 'op de lijst';
  if (r.nieuw.length === 1) delen.push(`${r.nieuw[0]} ${waar}`);
  else if (r.nieuw.length > 1) delen.push(later ? `${r.nieuw.length} boodschappen bij Later nodig` : `${r.nieuw.length} boodschappen toegevoegd`);
  if (r.terug.length) delen.push(later ? `${r.terug.join(', ')} weer bij Later nodig` : `${r.terug.join(', ')} weer nodig`);
  if (r.naarNu?.length) delen.push(`${r.naarNu.join(', ')} nu te kopen`);
  if (r.alOpLijst.length) delen.push(`${r.alOpLijst.join(', ')} stond${r.alOpLijst.length > 1 ? 'en' : ''} er al op`);
  return delen.join(' · ') || 'Niets toegevoegd';
}
