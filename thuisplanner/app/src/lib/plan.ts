// Plannen (besluit 18, docs/thuisplanner-plannen.md). Een plan-taak is een gewone taak met een planId; voortgang en stand
// worden hier berekend en nooit opgeslagen. Plannen bestaat alleen in de demo: er is nog geen tabel op de server.
import { vanDatum } from './datum';
import type { Scherm } from './context';
import { taakMensen } from './mensen';
import type { Datum, Item, LidId, Plan, PlanOnderdeel, Taak } from './types';

export type PlanStand = 'Nog geen taken' | 'Nog niet begonnen' | 'Bezig' | 'Alles klaar' | 'Afgerond';
export type TaakStatus = 'Te doen' | 'Bezig' | 'Afgerond';
export const TAAK_STATUSSEN: TaakStatus[] = ['Te doen', 'Bezig', 'Afgerond'];

/** Afgeleid: klaar is de enige waarheid voor afgerond, er is geen los statusveld dat kan gaan afwijken. */
export const taakStatus = (t: Taak): TaakStatus => (t.klaar ? 'Afgerond' : t.bezig ? 'Bezig' : 'Te doen');

/** De velden die bij een status horen. */
export function statusVelden(status: TaakStatus, t: Taak, vandaag: Datum): Pick<Taak, 'klaar' | 'klaarOp' | 'bezig'> {
  if (status === 'Afgerond') return { klaar: true, klaarOp: t.klaar ? t.klaarOp : vandaag, bezig: false };
  return { klaar: false, klaarOp: null, bezig: status === 'Bezig' };
}

export const takenVan = (items: Item[], planId: string): Taak[] =>
  items.filter((i): i is Taak => i.soort === 'taak' && i.planId === planId);

export function voortgang(taken: Taak[]): { klaar: number; totaal: number } {
  return { klaar: taken.filter(t => t.klaar).length, totaal: taken.length };
}

export function planStand(plan: Plan, taken: Taak[]): PlanStand {
  if (plan.afgerondOp) return 'Afgerond';
  const { klaar, totaal } = voortgang(taken);
  if (!totaal) return 'Nog geen taken';
  if (klaar === totaal) return 'Alles klaar';
  return klaar || taken.some(t => t.bezig) ? 'Bezig' : 'Nog niet begonnen';
}

const DAG_MAAND = new Intl.DateTimeFormat('nl-NL', { day: 'numeric', month: 'long' });

/** De einddatum als gewone zin; geen rood of waarschuwing als die voorbij is. */
export function eindTekst(plan: Plan, vandaag: Datum): string | null {
  if (!plan.einddatum || plan.afgerondOp) return null;
  const dag = DAG_MAAND.format(vanDatum(plan.einddatum));
  return plan.einddatum < vandaag ? `was vóór ${dag}` : `vóór ${dag}`;
}

/** Eerst de dichtstbijzijnde einddatum, daarna het nieuwste plan (de lijst staat in volgorde van aanmaken). */
export function sorteerPlannen(plannen: Plan[]): Plan[] {
  const metDatum = plannen.filter(p => p.einddatum).sort((a, b) => (a.einddatum! < b.einddatum! ? -1 : a.einddatum! > b.einddatum! ? 1 : 0));
  return [...metDatum, ...plannen.filter(p => !p.einddatum).reverse()];
}

/** Open taken: eerst wat een datum heeft (de dichtstbijzijnde bovenaan), de volgorde verder ongewijzigd. */
export function openTakenOpVolgorde(taken: Taak[]): Taak[] {
  const open = taken.filter(t => !t.klaar);
  return [...open.filter(t => t.datum).sort((a, b) => (a.datum! < b.datum! ? -1 : a.datum! > b.datum! ? 1 : 0)), ...open.filter(t => !t.datum)];
}

export const onderdelenVan = (lijst: PlanOnderdeel[], planId: string): PlanOnderdeel[] =>
  lijst.filter(o => o.planId === planId).sort((a, b) => a.volgorde - b.volgorde);

/** Verdeelt de taken: los (geen of een niet meer bestaand onderdeel) en per onderdeel. */
export function takenPerOnderdeel(taken: Taak[], onderdelen: PlanOnderdeel[]): { los: Taak[]; per: Map<string, Taak[]> } {
  const per = new Map<string, Taak[]>(onderdelen.map(o => [o.id, []]));
  const los: Taak[] = [];
  for (const t of taken) (t.onderdeelId ? per.get(t.onderdeelId) ?? los : los).push(t);
  return { los, per };
}

/** Voor de Agenda: per plan (in de volgorde van het overzicht) de taken uit de lijst. Plannen zonder taken vallen weg. */
export function plannenMetTaken(plannen: Plan[], taken: Taak[]): { plan: Plan; taken: Taak[] }[] {
  return sorteerPlannen(plannen).map(plan => ({ plan, taken: openTakenOpVolgorde(takenVan(taken, plan.id)) })).filter(x => x.taken.length);
}

/** Wie doet wat: een lid, "niemand" (wat kan ik oppakken?) of iedereen (null). */
export type PlanFilter = LidId | 'niemand' | null;
export function planTaakPast(t: Taak, f: PlanFilter): boolean {
  if (f === null) return true;
  const mensen = taakMensen(t);
  return f === 'niemand' ? !mensen.length : mensen.includes(f);
}

/** Plannen staat aan: altijd in de demo; in lokaal en staging alleen met de schakelaar VITE_PLANNEN (en migratie 20261111120000). */
export const plannenAan = (app: { lokaal?: { plannen?: boolean } }): boolean => !app.lokaal || !!app.lokaal.plannen;

/** Zonder Plannen valt het scherm Plannen terug op Vandaag (geen route ernaartoe). */
export function schermVoor(scherm: Scherm, aan: boolean): Scherm {
  return !aan && scherm === 'plannen' ? 'vandaag' : scherm;
}
