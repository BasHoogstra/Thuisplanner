// F8 Vakanties: rekenregels voor de schermen (docs/thuisplanner-vakanties.md §6.5). Pure functies, los getest
// (tests/vakantie.test.ts). Dezelfde regel voor "voorbij" als de sync-module (laatsteDag/vakantieVoorbij), zodat het
// scherm en het ophalen van paklijsten het altijd eens zijn.
import { plusDagen, vanDatum, verschilInDagen } from './datum';
import type { Datum, Huishouden, LidId, PakDoel, Pakitem, Paklijst, Vakantie, VakantieKoppeling } from './types';

const KORTE_MAANDEN = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];

/** De laatste dag: de terugdatum, of zonder terugdatum vertrek + 13 (hoogstens 14 dagen); zonder datum null. */
export function laatsteDag(v: Pick<Vakantie, 'vertrek' | 'terug'>): Datum | null {
  if (!v.vertrek) return null;
  return v.terug ?? plusDagen(v.vertrek, 13);
}

export type Fase = 'komend' | 'nu' | 'eerder';

/** Komend (geen datum, of vertrek na vandaag), nu (vertrek ≤ vandaag ≤ laatste dag) of eerder. */
export function fase(v: Pick<Vakantie, 'vertrek' | 'terug'>, vandaag: Datum): Fase {
  if (!v.vertrek || v.vertrek > vandaag) return 'komend';
  const l = laatsteDag(v)!;
  return l >= vandaag ? 'nu' : 'eerder';
}

export const isVoorbij = (v: Pick<Vakantie, 'vertrek' | 'terug'>, vandaag: Datum) => fase(v, vandaag) === 'eerder';

/** "Nog 9 dagen", "Morgen", "Vandaag vertrek", "Dag 3 van 15", "Dag 3", "Afgelopen"; zonder datum null. */
export function aftelling(v: Pick<Vakantie, 'vertrek' | 'terug'>, vandaag: Datum): string | null {
  if (!v.vertrek) return null;
  const tot = verschilInDagen(vandaag, v.vertrek);
  if (tot > 1) return `Nog ${tot} dagen`;
  if (tot === 1) return 'Morgen';
  if (tot === 0) return 'Vandaag vertrek';
  if (fase(v, vandaag) === 'eerder') return 'Afgelopen';
  const dag = -tot + 1;
  return v.terug ? `Dag ${dag} van ${verschilInDagen(v.vertrek, v.terug) + 1}` : `Dag ${dag}`;
}

/** Voor de kaart op Vandaag en de rij in Meer: "over 9 dagen", "morgen", "vandaag vertrek", "dag 3 van 15". */
export function wanneerKort(v: Pick<Vakantie, 'vertrek' | 'terug'>, vandaag: Datum): string | null {
  const a = aftelling(v, vandaag);
  if (!a) return null;
  if (a.startsWith('Nog ')) return 'over ' + a.slice(4);
  return a.charAt(0).toLowerCase() + a.slice(1);
}

/** Een kleine voorkeur per toestel (laatste onderdeel, laatste persoon). Nooit gedeelde gegevens; mag ontbreken. */
export function leesVoorkeur(sleutel: string): string | null {
  try { return globalThis.localStorage?.getItem(`thuisplanner-vakantie:${sleutel}`) ?? null; } catch { return null; }
}
export function zetVoorkeur(sleutel: string, waarde: string): void {
  try { globalThis.localStorage?.setItem(`thuisplanner-vakantie:${sleutel}`, waarde); } catch { /* geen opslag: geen voorkeur */ }
}

/** "12 jul", met jaar als dat niet het jaar van vandaag is. */
function kort(d: Datum, vandaag: Datum, metJaar: boolean): string {
  const x = vanDatum(d);
  return `${x.getDate()} ${KORTE_MAANDEN[x.getMonth()]}` + (metJaar || d.slice(0, 4) !== vandaag.slice(0, 4) ? ` ${x.getFullYear()}` : '');
}

/** "12–26 jul", "28 jul – 3 aug", "vertrek 27 dec", "nog geen datum". */
export function periode(v: Pick<Vakantie, 'vertrek' | 'terug'>, vandaag: Datum): string {
  if (!v.vertrek) return 'nog geen datum';
  if (!v.terug) return `vertrek ${kort(v.vertrek, vandaag, false)}`;
  const a = vanDatum(v.vertrek), b = vanDatum(v.terug);
  const anderJaar = v.terug.slice(0, 4) !== vandaag.slice(0, 4) || v.vertrek.slice(0, 4) !== v.terug.slice(0, 4);
  if (a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth()) {
    return `${a.getDate()}–${kort(v.terug, vandaag, anderJaar)}`;
  }
  return `${kort(v.vertrek, vandaag, v.vertrek.slice(0, 4) !== v.terug.slice(0, 4))} – ${kort(v.terug, vandaag, anderJaar)}`;
}

/** Nu, komend (op vertrek, zonder datum achteraan) en eerder (nieuwste eerst). */
export function groepen(vakanties: Vakantie[], vandaag: Datum): { nu: Vakantie[]; komend: Vakantie[]; eerder: Vakantie[] } {
  const op = (a: Vakantie, b: Vakantie) => (a.vertrek ?? '9999') < (b.vertrek ?? '9999') ? -1 : (a.vertrek ?? '9999') > (b.vertrek ?? '9999') ? 1 : a.naam.localeCompare(b.naam);
  return {
    nu: vakanties.filter(v => fase(v, vandaag) === 'nu').sort(op),
    komend: vakanties.filter(v => fase(v, vandaag) === 'komend').sort(op),
    eerder: vakanties.filter(v => fase(v, vandaag) === 'eerder').sort((a, b) => -op(a, b)),
  };
}

/** De vakantie voor de kaart op Vandaag: een lopende, anders de eerstvolgende die binnen 14 dagen begint. */
export function vakantieVoorVandaag(vakanties: Vakantie[], vandaag: Datum): Vakantie | undefined {
  const { nu, komend } = groepen(vakanties, vandaag);
  if (nu.length) return nu[0];
  return komend.find(v => v.vertrek && verschilInDagen(vandaag, v.vertrek) <= 14);
}

/** Vakanties op deze dag (de Agenda). Zonder terugdatum alleen de vertrekdag. */
export function vakantiesOp(vakanties: Vakantie[], datum: Datum): { v: Vakantie; vertrek: boolean }[] {
  return vakanties
    .filter(v => v.vertrek && (v.terug ? v.vertrek <= datum && datum <= v.terug : v.vertrek === datum))
    .map(v => ({ v, vertrek: !v.terug }));
}

/** Zelfde sleutel als de server (name_key): zonder hoofdletters en overbodige spaties. */
export const pakSleutel = (naam: string) => naam.trim().replace(/\s+/g, ' ').toLocaleLowerCase('nl');

// ---- Waar een pakitem hoort (PakDoel): een lid, Gezamenlijk (null) of een extra lijst ({ lijst }) ----
/** Het doel van een pakitem. Gezamenlijk = geen lid én geen lijst. */
export const doelVan = (p: Pick<Pakitem, 'lid' | 'lijst'>): PakDoel => (p.lijst ? { lijst: p.lijst } : p.lid ?? null);
/** Een vaste tekst per doel: voor sleutels, de bewaarde keuze en vergelijken. */
export const doelSleutel = (d: PakDoel): string => (d === null ? 'gezamenlijk' : typeof d === 'object' ? `lijst:${d.lijst}` : d);
export const zelfdeDoel = (a: PakDoel, b: PakDoel) => doelSleutel(a) === doelSleutel(b);
export const inDoel = (p: Pick<Pakitem, 'lid' | 'lijst'>, d: PakDoel) => zelfdeDoel(doelVan(p), d);
/** lid en lijst van een pakitem bij dit doel (nooit allebei). */
export const doelVelden = (d: PakDoel): { lid: LidId | null; lijst: string | null } =>
  (d && typeof d === 'object' ? { lid: null, lijst: d.lijst } : { lid: d ?? null, lijst: null });

/** Staat deze tekst al in deze lijst (bij die persoon, Gezamenlijk of die extra lijst) in deze vakantie? */
export function alOpPaklijst(pakitems: Pakitem[], vakantieId: string, doel: PakDoel, naam: string, behalve?: string): boolean {
  const k = pakSleutel(naam);
  return pakitems.some(p => p.id !== behalve && p.vakantieId === vakantieId && inDoel(p, doel) && pakSleutel(p.naam) === k);
}

export interface PakGroep { doel: PakDoel; sleutel: string; naam: string; kleur?: string; lijst?: Paklijst }
/** De groepen van de paklijst: elk lid, dan Gezamenlijk, dan de extra lijsten van deze vakantie (zoals aangemaakt). */
export function pakGroepen(huishouden: Huishouden, paklijsten: Paklijst[] = [], vakantieId?: string): PakGroep[] {
  return [
    ...huishouden.leden.map(l => ({ doel: l.id as PakDoel, sleutel: l.id, naam: l.naam, kleur: l.kleur })),
    { doel: null, sleutel: 'gezamenlijk', naam: 'Gezamenlijk' },
    ...paklijsten.filter(l => l.vakantieId === vakantieId).map(l => ({ doel: { lijst: l.id }, sleutel: `lijst:${l.id}`, naam: l.naam, lijst: l })),
  ];
}

/** Voor wie of wat: de naam van een lid, "Gezamenlijk" of de naam van een extra lijst. */
export function groepNaam(huishouden: Huishouden, doel: PakDoel, paklijsten: Paklijst[] = []): string {
  if (doel && typeof doel === 'object') return paklijsten.find(l => l.id === doel.lijst)?.naam ?? 'een lijst';
  return doel ? huishouden.leden.find(l => l.id === doel)?.naam ?? 'iemand' : 'Gezamenlijk';
}

/**
 * Mag dit de naam van een extra lijst worden? Niet leeg, niet de naam van een lid of "Gezamenlijk" (besluit 22 oktober
 * 2026) en niet al een lijst bij deze vakantie. Geeft een melding of null. Dezelfde regels als de server.
 */
export function paklijstNaamFout(naam: string, huishouden: Huishouden, paklijsten: Paklijst[], vakantieId: string, behalve?: string): string | null {
  const k = pakSleutel(naam);
  if (!k) return 'Geef de lijst een naam.';
  if (k.length > 40) return 'Hoogstens 40 tekens.';
  if (k === 'gezamenlijk' || huishouden.leden.some(l => pakSleutel(l.naam) === k)) return 'Die naam hoort al bij iemand uit het huishouden of bij Gezamenlijk.';
  const al = paklijsten.find(l => l.vakantieId === vakantieId && l.id !== behalve && pakSleutel(l.naam) === k);
  return al ? `Er is al een lijst "${al.naam}".` : null;
}

/**
 * Voor welke vakanties is deze boodschap nu nodig? Alleen actuele koppelingen (niet afgehandeld) van vakanties die niet
 * voorbij zijn: oude koppelingen van een hergebruikte boodschap verschijnen niet opnieuw (§6.2).
 */
export function vakantiesVoorBoodschap(boodschapId: string, koppelingen: VakantieKoppeling[], vakanties: Vakantie[], vandaag: Datum): Vakantie[] {
  const ids = new Set(koppelingen.filter(k => k.boodschapId === boodschapId && !k.afgehandeld).map(k => k.vakantieId));
  return vakanties.filter(v => ids.has(v.id) && !isVoorbij(v, vandaag));
}

/**
 * Bronnen om een paklijst van over te nemen, beste eerst: de laatste vakantie waar je echt geweest bent (afgelopen, nieuwste
 * eerst), dan de andere vakanties (nieuwste eerst). heeftLijst: is de paklijst hier bekend en niet leeg (in de lokale
 * modus wordt een afgelopen paklijst pas bij openen opgehaald; die telt dan toch mee).
 */
export function overneemBronnen(vakanties: Vakantie[], naar: string, vandaag: Datum, heeftLijst: (id: string) => boolean): Vakantie[] {
  const nieuwsteEerst = (a: Vakantie, b: Vakantie) => ((b.vertrek ?? '') < (a.vertrek ?? '') ? -1 : (b.vertrek ?? '') > (a.vertrek ?? '') ? 1 : 0);
  const anders = vakanties.filter(v => v.id !== naar);
  const eerder = anders.filter(v => isVoorbij(v, vandaag)).sort(nieuwsteEerst);
  const rest = anders.filter(v => !isVoorbij(v, vandaag)).sort(nieuwsteEerst);
  // Afgelopen vakanties altijd (hun paklijst kan nog onbekend zijn), die met een bekende lijst eerst; komende alleen met een lijst.
  return [...eerder.filter(v => heeftLijst(v.id)), ...eerder.filter(v => !heeftLijst(v.id)), ...rest.filter(v => heeftLijst(v.id))];
}

/** Een vakantie zoals je hem kunt kiezen bij een taak: komend of lopend (plus de huidige keuze). */
export function kiesbareVakanties(vakanties: Vakantie[], vandaag: Datum, huidig?: string | null): Vakantie[] {
  const { nu, komend } = groepen(vakanties, vandaag);
  const lijst = [...nu, ...komend];
  const h = huidig ? vakanties.find(v => v.id === huidig) : undefined;
  return h && !lijst.includes(h) ? [...lijst, h] : lijst;
}
