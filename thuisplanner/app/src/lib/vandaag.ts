// Wat Vandaag laat zien. Pure functies, zodat de keuzes ("rust boven volledigheid") los te testen zijn.
import { plusDagen, verschilInDagen } from './datum';
import { afsprakenTussen } from './herhaling';
import { isBezetVanAnder } from './rechten';
import type { Afspraak, Boodschap, Datum, Item, LidId, Taak, Tijd } from './types';

export const isAfspraak = (i: Item): i is Afspraak => i.soort === 'afspraak';
export const isTaak = (i: Item): i is Taak => i.soort === 'taak';
export const isBoodschap = (i: Item): i is Boodschap => i.soort === 'boodschap';

/** Afspraken zonder tijd (hele dag) eerst, daarna op begintijd. */
export function opTijd(a: Afspraak, b: Afspraak): number {
  return (a.start ?? '').localeCompare(b.start ?? '');
}

/** Alle afspraken op één dag, inclusief voorkomens van herhalende afspraken, op tijd gesorteerd. */
export function afsprakenOp(items: Item[], datum: Datum): Afspraak[] {
  return afsprakenTussen(items, datum, datum).sort(opTijd);
}

/** Voorbij als de eindtijd (of anders de begintijd) al geweest is. Hele-dag-afspraken zijn nooit voorbij. */
export function isVoorbij(a: Afspraak, nu: Tijd): boolean {
  const grens = a.eind ?? a.start;
  return grens !== undefined && grens <= nu;
}

/** De eerstvolgende afspraak met een tijd die nog niet voorbij is: die krijgt als enige nadruk. */
export function straks(items: Item[], vandaag: Datum, nu: Tijd): Afspraak | undefined {
  return eerstvolgende(afsprakenOp(items, vandaag), nu);
}

/**
 * Dezelfde keuze binnen een lijst die het scherm al heeft. Een herhalende afspraak is bij elke berekening een nieuw
 * voorkomen; kies daarom uit dezelfde lijst, anders herkent het scherm de afspraak niet en staat hij er twee keer.
 */
export function eerstvolgende(afspraken: Afspraak[], nu: Tijd): Afspraak | undefined {
  return afspraken.find(a => a.start !== undefined && !isVoorbij(a, nu));
}

/** Is deze afspraak nu bezig? */
export function loopt(a: Afspraak, nu: Tijd): boolean {
  return a.start !== undefined && a.start <= nu && !isVoorbij(a, nu);
}

/** Open taken voor vandaag, inclusief blijven liggen van eerder. Taken zonder datum horen niet op Vandaag. */
export function takenVandaag(items: Item[], vandaag: Datum): Taak[] {
  return items.filter(isTaak)
    .filter(t => !t.klaar && t.datum !== null && t.datum <= vandaag)
    .sort((a, b) => (a.datum ?? '').localeCompare(b.datum ?? ''));
}

/** Vandaag afgevinkte taken die bij vandaag (of eerder) hoorden: klein en ingeklapt op Vandaag. */
export function afgerondVandaag(items: Item[], vandaag: Datum): Taak[] {
  return items.filter(isTaak).filter(t => t.klaar && t.klaarOp === vandaag && t.datum !== null && t.datum <= vandaag);
}

/** Alle taken van één dag (open én afgerond), voor de weekweergave. */
export function takenOp(items: Item[], datum: Datum): Taak[] {
  return items.filter(isTaak).filter(t => t.datum === datum).sort((a, b) => Number(a.klaar) - Number(b.klaar));
}

export function takenZonderDatum(items: Item[]): Taak[] {
  return items.filter(isTaak).filter(t => t.datum === null).sort((a, b) => Number(a.klaar) - Number(b.klaar));
}

export function openBoodschappen(items: Item[]): Boodschap[] {
  // "Later nodig" telt hier niet mee: Vandaag gaat over wat je nu moet kopen.
  return items.filter(isBoodschap).filter(b => !b.afgevinkt && !b.later);
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
export function meedenker(items: Item[], vandaag: Datum, weggeklikt: ReadonlySet<string>, ik: LidId): Meedenker | undefined {
  const morgen = plusDagen(vandaag, 1);
  const taken = items.filter(isTaak).map(t => t.titel.toLowerCase());
  for (const a of afsprakenOp(items, morgen)) {
    // Nooit meedenken over andermans privé-afspraak: dat zou details verraden.
    if (!a.voorbereiding || weggeklikt.has(a.id) || isBezetVanAnder(a, ik)) continue;
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

/**
 * Eén zin die de dag samenvat, zonder oordeel of score. voorbij: hoeveel afspraken van vandaag al geweest zijn; die tellen
 * niet meer mee, zodat de zin 's avonds zegt wat er nog komt ("Vandaag nog: …") in plaats van wat er was.
 */
export function samenvatting(afspraken: number, taken: number, voorbij = 0): string {
  if (!afspraken && !taken) return 'Een rustige dag. Vandaag staat er niets gepland.';
  const nog = afspraken - voorbij;
  if (!nog && !taken) return 'Voor vandaag staat er niets meer.';
  const delen: string[] = [];
  if (nog) delen.push(nog === 1 ? '1 afspraak' : `${nog} afspraken`);
  if (taken) delen.push(taken === 1 ? '1 taak' : `${taken} taken`);
  return `${voorbij ? 'Vandaag nog' : 'Vandaag'}: ${delen.join(' en ')}.`;
}

// ---- Overzicht (besluit 19, 23 november 2026): een begrensd startscherm. ----

export interface KomendeAfspraak {
  afspraak: Afspraak;
  datum: Datum;
}

export interface KomendeAfspraken {
  /** Hoogstens `aantal` afspraken met een tijd die nog niet voorbij zijn, vanaf nu, op volgorde. */
  eerst: KomendeAfspraak[];
  /** Afspraken van vandaag zonder tijd (de hele dag): één eigen regel, niet meegeteld. */
  heleDag: Afspraak[];
  /** Hoeveel afspraken met een tijd er vandaag nog komen bovenop `eerst`. */
  nogVandaag: number;
}

/**
 * Besluit 19: de eerstvolgende afspraken met een tijd, vandaag (nog niet voorbij) en de komende `dagen` dagen. Een
 * privé-afspraak van een ander telt mee; die toont het scherm als "Bezet". Een afspraak die over meer dagen loopt, staat
 * er één keer in.
 */
export function komendeAfspraken(items: Item[], vandaag: Datum, nu: Tijd, aantal = 3, dagen = 7): KomendeAfspraken {
  const alle: KomendeAfspraak[] = [];
  const gezien = new Set<string>();
  for (let n = 0; n <= dagen; n++) {
    const datum = plusDagen(vandaag, n);
    for (const a of afsprakenOp(items, datum)) {
      if (a.start === undefined || (n === 0 && isVoorbij(a, nu)) || gezien.has(a.id)) continue;
      gezien.add(a.id);
      alle.push({ afspraak: a, datum });
    }
  }
  const eerst = alle.slice(0, aantal);
  return {
    eerst,
    heleDag: afsprakenOp(items, vandaag).filter(a => a.start === undefined),
    nogVandaag: alle.slice(aantal).filter(k => k.datum === vandaag).length,
  };
}

export type TaakGroep = 'te-laat' | 'vandaag' | 'week' | 'zonder-datum' | 'later';
export const TAAKGROEPEN: TaakGroep[] = ['te-laat', 'vandaag', 'week', 'zonder-datum', 'later'];

/** In welke groep een open taak valt. Een taak uit een plan zonder datum hoort niet op het Overzicht (null). */
export function taakGroep(t: Taak, vandaag: Datum, dagen = 7): TaakGroep | null {
  if (t.datum === null) return t.planId ? null : 'zonder-datum';
  if (t.datum < vandaag) return 'te-laat';
  if (t.datum === vandaag) return 'vandaag';
  return t.datum <= plusDagen(vandaag, dagen) ? 'week' : 'later';
}

export interface TakenOverzicht {
  zichtbaar: { taak: Taak; groep: TaakGroep }[];
  /** Wat er niet in beeld staat, per groep. */
  rest: Record<TaakGroep, number>;
}

/**
 * Besluit 19: hoogstens `max` open taken in een vaste volgorde: te laat (oudste eerst), vandaag, de komende 7 dagen,
 * zonder datum, later. Doordat de volgorde vastligt, drukt een latere taak nooit een taak weg die te laat is of voor
 * vandaag staat; wat niet past, telt de telregel per groep.
 */
export function takenOverzicht(items: Item[], vandaag: Datum, max = 5): TakenOverzicht {
  const open = items.filter(isTaak).filter(t => !t.klaar);
  const geordend: { taak: Taak; groep: TaakGroep }[] = [];
  for (const groep of TAAKGROEPEN) {
    const lijst = open.filter(t => taakGroep(t, vandaag) === groep);
    if (groep !== 'zonder-datum') lijst.sort((a, b) => a.datum!.localeCompare(b.datum!));
    geordend.push(...lijst.map(taak => ({ taak, groep })));
  }
  const rest = { 'te-laat': 0, vandaag: 0, week: 0, 'zonder-datum': 0, later: 0 } as Record<TaakGroep, number>;
  for (const { groep } of geordend.slice(max)) rest[groep]++;
  return { zichtbaar: geordend.slice(0, max), rest };
}
