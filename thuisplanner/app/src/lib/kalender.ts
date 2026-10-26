// Kalenderhulpjes voor de dag-, week- en maandweergave. Pure functies, los getest.
import { maandagVan, plusDagen, vanDatum } from './datum';
import { afspraakPast, taakPast, type GezinsFilter } from './filter';
import { afsprakenOp, takenOp } from './vandaag';
import type { Afspraak, Datum, Item, Taak } from './types';

/** Eerste dag van de maand, en een maand verder of terug (dag 1, dus nooit 31 februari). */
export function maandBegin(d: Datum): Datum { return `${d.slice(0, 7)}-01`; }
export function plusMaanden(d: Datum, n: number): Datum {
  const x = vanDatum(maandBegin(d));
  x.setMonth(x.getMonth() + n);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-01`;
}

/** De dagen die de maandkalender toont: hele weken (ma–zo) die de maand bedekken. */
export function maandRaster(d: Datum): Datum[] {
  const begin = maandagVan(maandBegin(d));
  const volgende = plusMaanden(d, 1);
  const dagen: Datum[] = [];
  for (let x = begin; x < volgende || dagen.length % 7 !== 0; x = plusDagen(x, 1)) dagen.push(x);
  return dagen;
}

/**
 * Hoe vol een dag is, in drie stappen (0 = niets, 1 = één of twee, 2 = drie of vier, 3 = vijf of meer). Voor één rustig,
 * neutraal streepje per dag in plaats van stippen (Agenda, A5).
 */
export function drukte(aantal: number): 0 | 1 | 2 | 3 {
  return aantal <= 0 ? 0 : aantal <= 2 ? 1 : aantal <= 4 ? 2 : 3;
}

/** De schermlezertekst van een dag in de maand en de weekstrip: "2 afspraken, 1 taak", of "niets gepland". */
export function beschrijfDag(afspraken: number, openTaken: number): string {
  return [
    afspraken ? `${afspraken} ${afspraken === 1 ? 'afspraak' : 'afspraken'}` : '',
    openTaken ? `${openTaken} ${openTaken === 1 ? 'taak' : 'taken'}` : '',
  ].filter(Boolean).join(', ') || 'niets gepland';
}

/** Afspraken en taken van één dag, met het gezinsfilter toegepast. */
export function dagInhoud(items: Item[], datum: Datum, filter: GezinsFilter): { afspraken: Afspraak[]; taken: Taak[] } {
  return {
    afspraken: afsprakenOp(items, datum).filter(a => afspraakPast(a, filter)),
    taken: takenOp(items, datum).filter(t => taakPast(t, filter)),
  };
}

