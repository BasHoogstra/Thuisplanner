// Bijlagen bij plannen en taken: alleen de koppeling, nog geen upload en nog geen scherm (docs/thuisplanner-plannen-bijlagen.md).
// Een bijlage is een verwijzing naar één document (besluit 17). Hetzelfde document kan bij een spul, een plan en een taak horen,
// zonder kopie. Elke koppeling hoort bij precies één doel: het plan of één taak.
import type { BijlageDoel, PlanKoppeling } from './types';

const zelfdeDoel = (a: BijlageDoel, b: BijlageDoel) => a.planId === b.planId && a.taakId === b.taakId;

export const bijlagenVanPlan = (lijst: PlanKoppeling[], planId: string) => lijst.filter(k => k.doel.planId === planId);
export const bijlagenVanTaak = (lijst: PlanKoppeling[], taakId: string) => lijst.filter(k => k.doel.taakId === taakId);

/** Alles op de planpagina: eerst wat bij het plan zelf hoort, daarna wat bij de taken hoort. */
export function alleBijlagenVanPlan(lijst: PlanKoppeling[], planId: string, taakIds: string[]): PlanKoppeling[] {
  const taken = new Set(taakIds);
  return [...bijlagenVanPlan(lijst, planId), ...lijst.filter(k => k.doel.taakId !== undefined && taken.has(k.doel.taakId))];
}

/** Koppelen is idempotent: hetzelfde document staat hoogstens één keer bij hetzelfde doel. */
export function koppelBijlage(lijst: PlanKoppeling[], koppeling: PlanKoppeling): PlanKoppeling[] {
  return lijst.some(k => k.documentId === koppeling.documentId && zelfdeDoel(k.doel, koppeling.doel)) ? lijst : [...lijst, koppeling];
}

export const ontkoppelBijlage = (lijst: PlanKoppeling[], id: string) => lijst.filter(k => k.id !== id);

/** Een plan weg: alleen de koppelingen met het plan zelf vervallen; een taak die blijft, houdt haar bijlagen. Het document blijft. */
export const zonderPlan = (lijst: PlanKoppeling[], planId: string) => lijst.filter(k => k.doel.planId !== planId);

/** Taken weg: alleen de koppelingen vervallen. Het document blijft bestaan. */
export function zonderTaken(lijst: PlanKoppeling[], taakIds: string[]): PlanKoppeling[] {
  const weg = new Set(taakIds);
  return lijst.filter(k => k.doel.taakId === undefined || !weg.has(k.doel.taakId));
}
