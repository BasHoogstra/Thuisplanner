// Wat Vandaag laat zien. Pure functies, zodat de keuzes ("rust boven volledigheid") los te testen zijn.
import { plusDagen, verschilInDagen } from './datum';
import type { Afspraak, Boodschap, Datum, Item, Taak, Tijd } from './types';

export const isAfspraak = (i: Item): i is Afspraak => i.soort === 'afspraak';
export const isTaak = (i: Item): i is Taak => i.soort === 'taak';
export const isBoodschap = (i: Item): i is Boodschap => i.soort === 'boodschap';

/** Afspraken zonder tijd (hele dag) eerst, daarna op begintijd. */
export function opTijd(a: Afspraak, b: Afspraak): number {
  return (a.start ?? '').localeCompare(b.start ?? '');
}

export function afsprakenOp(items: Item[], datum: Datum): Afspraak[] {
  return items.filter(isAfspraak).filter(a => a.datum === datum).sort(opTijd);
}

/** Voorbij als de eindtijd (of anders de begintijd) al geweest is. Hele-dag-afspraken zijn nooit voorbij. */
export function isVoorbij(a: Afspraak, nu: Tijd): boolean {
  const grens = a.eind ?? a.start;
  return grens !== undefined && grens <= nu;
}

/** De eerstvolgende afspraak met een tijd die nog niet voorbij is: die krijgt als enige nadruk. */
export function straks(items: Item[], vandaag: Datum, nu: Tijd): Afspraak | undefined {
  return afsprakenOp(items, vandaag).find(a => a.start !== undefined && !isVoorbij(a, nu));
}

/** Open taken voor vandaag, inclusief blijven liggen van eerder. Taken zonder datum horen niet op Vandaag. */
export function takenVandaag(items: Item[], vandaag: Datum): Taak[] {
  return items.filter(isTaak)
    .filter(t => !t.klaar && t.datum !== null && t.datum <= vandaag)
    .sort((a, b) => (a.datum ?? '').localeCompare(b.datum ?? ''));
}

export function openBoodschappen(items: Item[]): Boodschap[] {
  return items.filter(isBoodschap).filter(b => !b.afgevinkt);
}

export interface VooruitDag {
  datum: Datum;
  afspraken: Afspraak[];
}

/** Compacte vooruitblik: de komende dagen met iets erin; lege dagen laten we weg. */
export function binnenkort(items: Item[], vandaag: Datum, dagen = 4): VooruitDag[] {
  const uit: VooruitDag[] = [];
  for (let n = 1; n <= dagen; n++) {
    const datum = plusDagen(vandaag, n);
    const afspraken = afsprakenOp(items, datum);
    if (afspraken.length) uit.push({ datum, afspraken });
  }
  return uit;
}

export interface Meedenker {
  afspraak: Afspraak;
  voorstel: string;
}

/**
 * Hooguit één rustig signaal: iets wat morgen vroeg klaar moet staan en nog nergens als taak staat.
 * Een vaste, uitlegbare regel (geen AI). De gebruiker beslist; er wordt niets vanzelf toegevoegd.
 */
export function meedenker(items: Item[], vandaag: Datum, weggeklikt: ReadonlySet<string>): Meedenker | undefined {
  const morgen = plusDagen(vandaag, 1);
  const taken = items.filter(isTaak).map(t => t.titel.toLowerCase());
  for (const a of afsprakenOp(items, morgen)) {
    if (!a.voorbereiding || weggeklikt.has(a.id)) continue;
    if (taken.includes(a.voorbereiding.toLowerCase())) continue;
    return { afspraak: a, voorstel: a.voorbereiding };
  }
  return undefined;
}

/** Hoe lang een taak al blijft liggen, in gewone woorden; leeg voor vandaag. */
export function achterstand(t: Taak, vandaag: Datum): string {
  if (t.datum === null) return '';
  const n = verschilInDagen(t.datum, vandaag);
  if (n <= 0) return '';
  return n === 1 ? 'sinds gisteren' : `sinds ${n} dagen`;
}

/** Eén zin die de dag samenvat, zonder oordeel of score. */
export function samenvatting(afspraken: number, taken: number): string {
  if (!afspraken && !taken) return 'Een rustige dag. Er staat niets voor je klaar.';
  const delen: string[] = [];
  if (afspraken) delen.push(afspraken === 1 ? '1 afspraak' : `${afspraken} afspraken`);
  if (taken) delen.push(taken === 1 ? '1 taak' : `${taken} taken`);
  return `Vandaag: ${delen.join(' en ')}.`;
}
