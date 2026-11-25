// Gezinsfilter voor de agenda: het hele gezin of één lid.
// Een privé-afspraak van een ander blijft altijd "bezet": het filter bepaalt alleen óf hij te zien is,
// nooit hoeveel details. Zie rechten.ts.
import { taakMensen } from './mensen';
import type { Afspraak, LidId, Taak } from './types';

/** null = het hele gezin. */
export type GezinsFilter = LidId | null;

/** Afspraken voor iedereen (geen leden gekozen) horen ook bij elk lid. */
export function afspraakPast(a: Afspraak, f: GezinsFilter): boolean {
  return f === null || a.wie.length === 0 || a.wie.includes(f);
}

/**
 * Bij één lid: de taken die dat lid oppakt, plus de taken zonder persoon (die horen bij het hele gezin, dus ook bij elk
 * lid), net als bij afspraken. Besluit 20: "Ik" toont jouw taken plus wat voor het hele gezin is.
 */
export function taakPast(t: Taak, f: GezinsFilter): boolean {
  if (f === null) return true;
  const wie = taakMensen(t);
  return wie.length === 0 || wie.includes(f);
}
