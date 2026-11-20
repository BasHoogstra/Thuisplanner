// Besluit 18, gate "Meerdere verantwoordelijken" (docs/thuisplanner-plannen.md §5.1): de enige plek die de personen van een taak
// leest en schrijft, zodat geen scherm stil iemand kan verliezen. Eén gedeeld vinkje; voor blijft de eerste, ook voor de server.
import type { LidId, Taak } from './types';

export const taakMensen = (t: Pick<Taak, 'voor' | 'ookVoor'>): LidId[] => (t.voor ? [t.voor, ...(t.ookVoor ?? [])] : [...(t.ookVoor ?? [])]);

/**
 * De velden voor deze personen. Leeg en ontbrekend zijn verschillend: ookVoor [] betekent "niemand anders meer", een ontbrekend
 * veld betekent "niet gewijzigd". Een taak die nooit extra personen had, krijgt het veld niet.
 */
export function metMensen(t: Pick<Taak, 'ookVoor'> | undefined, wie: LidId[]): Pick<Taak, 'voor' | 'ookVoor'> {
  const [voor = null, ...rest] = wie;
  return rest.length || t?.ookVoor ? { voor, ookVoor: rest } : { voor };
}
