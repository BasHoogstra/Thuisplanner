// Gezinsfilter voor de agenda: het hele gezin of één lid.
// Een privé-afspraak van een ander blijft altijd "bezet": het filter bepaalt alleen óf hij te zien is,
// nooit hoeveel details. Zie rechten.ts.
import type { Afspraak, LidId, Taak } from './types';

/** null = het hele gezin. */
export type GezinsFilter = LidId | null;

/** Afspraken voor iedereen (geen leden gekozen) horen ook bij elk lid. */
export function afspraakPast(a: Afspraak, f: GezinsFilter): boolean {
  return f === null || a.wie.length === 0 || a.wie.includes(f);
}

/** Bij één lid: alleen taken die dat lid oppakt. Taken zonder persoon horen bij het hele gezin. */
export function taakPast(t: Taak, f: GezinsFilter): boolean {
  return f === null || t.voor === f;
}
