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

/** Afspraken en taken van één dag, met het gezinsfilter toegepast. */
export function dagInhoud(items: Item[], datum: Datum, filter: GezinsFilter): { afspraken: Afspraak[]; taken: Taak[] } {
  return {
    afspraken: afsprakenOp(items, datum).filter(a => afspraakPast(a, filter)),
    taken: takenOp(items, datum).filter(t => taakPast(t, filter)),
  };
}

