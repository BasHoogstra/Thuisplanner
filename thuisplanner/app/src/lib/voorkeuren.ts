// Besluit 20: persoonlijke instellingen (docs/thuisplanner-besluit20-bouwvoorstel.md §2 en §5.1). Pure regels, los getest
// (tests/voorkeuren.test.ts). Een voorkeur verandert alleen de eigen weergave: nooit gedeelde gegevens, privacy of wat een
// ander ziet. Per account, nooit per huishouden of lid.
//
// Opslag: platte sleutels met een vaste set waarden, dezelfde lijst als de controle in de database
// (migratie 20261124120000_account_preferences.sql). Een ontbrekende of onbekende sleutel is de standaard.
import type { AgendaWeergave } from './context';

/** Waar de app opent zonder eigen adres. "taken" is de takenweergave van de Agenda. */
export type Startscherm = 'vandaag' | 'agenda' | 'taken' | 'boodschappen';
/** Wiens agenda bij openen: als woord, niet als lid-id, zodat het in elk huishouden van het account werkt. */
export type AgendaWie = 'iedereen' | 'ik';
/** De vier onderdelen van het Overzicht (besluit 19). "verder": de vakantie en de suggestie. */
export type OverzichtDeel = 'afspraken' | 'taken' | 'boodschappen' | 'verder';

export interface Voorkeuren {
  startscherm: Startscherm;
  overzicht: Record<OverzichtDeel, boolean>;
  agendaWeergave: AgendaWeergave;
  agendaWie: AgendaWie;
}

export const STANDAARD: Voorkeuren = Object.freeze({
  startscherm: 'vandaag',
  overzicht: Object.freeze({ afspraken: true, taken: true, boodschappen: true, verder: true }),
  agendaWeergave: 'week',
  agendaWie: 'iedereen',
}) as Voorkeuren;

export const OVERZICHT_DELEN: OverzichtDeel[] = ['afspraken', 'taken', 'boodschappen', 'verder'];

/** Elke sleutel met zijn toegestane waarden. Dezelfde lijst staat in de database (private.voorkeur_geldig). */
export const SLEUTELS = {
  startscherm: ['vandaag', 'agenda', 'taken', 'boodschappen'],
  'overzicht.afspraken': [true, false],
  'overzicht.taken': [true, false],
  'overzicht.boodschappen': [true, false],
  'overzicht.verder': [true, false],
  'agenda.weergave': ['dag', 'week', 'maand', 'taken'],
  'agenda.wie': ['iedereen', 'ik'],
} as const satisfies Record<string, readonly (string | boolean)[]>;

export type Sleutel = keyof typeof SLEUTELS;
export type Waarde<S extends Sleutel> = (typeof SLEUTELS)[S][number];

export function isGeldig(sleutel: string, waarde: unknown): sleutel is Sleutel {
  const lijst = (SLEUTELS as Record<string, readonly unknown[]>)[sleutel];
  return !!lijst && lijst.includes(waarde);
}

/** Wat de server of de cache bewaart (platte sleutels) → voorkeuren. Onbekend of ongeldig = de standaard. */
export function uitOpslag(ruw: unknown): Voorkeuren {
  const o = ruw && typeof ruw === 'object' && !Array.isArray(ruw) ? (ruw as Record<string, unknown>) : {};
  const lees = <S extends Sleutel>(s: S, standaard: Waarde<S>): Waarde<S> => (isGeldig(s, o[s]) ? (o[s] as Waarde<S>) : standaard);
  const v: Voorkeuren = {
    startscherm: lees('startscherm', STANDAARD.startscherm),
    overzicht: {
      afspraken: lees('overzicht.afspraken', true),
      taken: lees('overzicht.taken', true),
      boodschappen: lees('overzicht.boodschappen', true),
      verder: lees('overzicht.verder', true),
    },
    agendaWeergave: lees('agenda.weergave', STANDAARD.agendaWeergave),
    agendaWie: lees('agenda.wie', STANDAARD.agendaWie),
  };
  // Vangnet: het Overzicht is nooit leeg (ook niet als twee toestellen tegelijk het laatste onderdeel uitzetten).
  if (!OVERZICHT_DELEN.some(d => v.overzicht[d])) v.overzicht = { ...STANDAARD.overzicht };
  return v;
}

/** Voorkeuren → platte sleutels (voor de cache en de demo). */
export function naarOpslag(v: Voorkeuren): Record<Sleutel, string | boolean> {
  return {
    startscherm: v.startscherm,
    'overzicht.afspraken': v.overzicht.afspraken,
    'overzicht.taken': v.overzicht.taken,
    'overzicht.boodschappen': v.overzicht.boodschappen,
    'overzicht.verder': v.overzicht.verder,
    'agenda.weergave': v.agendaWeergave,
    'agenda.wie': v.agendaWie,
  };
}

/** Eén sleutel wijzigen; de uitkomst gaat door dezelfde controle als het lezen. */
export function metWaarde(v: Voorkeuren, sleutel: Sleutel, waarde: string | boolean): Voorkeuren {
  if (!isGeldig(sleutel, waarde)) return v;
  return uitOpslag({ ...naarOpslag(v), [sleutel]: waarde });
}

/** Mag dit onderdeel uit? Niet als het het laatste is dat nog aan staat (geen leeg Overzicht). */
export function magUit(v: Voorkeuren, deel: OverzichtDeel): boolean {
  return OVERZICHT_DELEN.some(d => d !== deel && v.overzicht[d]);
}

export const isStandaard = (v: Voorkeuren): boolean =>
  JSON.stringify(naarOpslag(v)) === JSON.stringify(naarOpslag(STANDAARD));

/** Gewone hoofdschermen: een adres hiervan is geen link naar iets bijzonders (de telefoon onthoudt het gewoon). */
const HOOFDSCHERMEN = new Set(['', 'vandaag', 'agenda', 'boodschappen', 'meer']);

/**
 * Het scherm bij het openen (besluit 20, aangevuld op 25 november 2026, optie a).
 * - Zonder adres (leeg of "#/"): altijd het startscherm.
 * - Met een gewoon hoofdscherm (#/vandaag, #/agenda, #/boodschappen, #/meer): alleen bij een **echte nieuwe start**,
 *   want Safari heropent de laatste pagina en een icoon op het beginscherm bewaart het adres van toen. Herladen houdt het
 *   adres.
 * - Een link naar een item, vakantie, plan, spullen of instellingen, of een uitnodiging: altijd dat adres.
 * Zonder bekende voorkeuren op dit toestel (eerste keer inloggen): niets, dus het adres of het Overzicht.
 */
export function startDoel(hash: string, v: Voorkeuren | null, nieuweStart = false): Startscherm | null {
  if (!v || v.startscherm === 'vandaag') return null;
  const h = hash.replace(/^#\/?/, '').replace(/\/$/, '');
  if (h === '') return v.startscherm;
  if (!nieuweStart || !HOOFDSCHERMEN.has(h)) return null;
  // Staat het adres al op het gekozen scherm, dan hoeft er niets te gebeuren.
  const doelAdres = v.startscherm === 'taken' ? 'agenda' : v.startscherm;
  return h === doelAdres && v.startscherm !== 'taken' ? null : v.startscherm;
}

/**
 * Is dit een echte nieuwe start (geen herladen of terug/vooruit)? Een herlaadbeurt houdt het adres. Zonder Navigation
 * Timing (oude browser): geen nieuwe start, dus het adres wint (veilige kant). Een klik op een pushmelding opent een
 * expliciet doel (public/sw.js zet ?van=melding in het adres): ook geen nieuwe start, zodat het startscherm dat doel
 * niet vervangt (review PR #57).
 */
export function isNieuweStart(): boolean {
  try {
    const n = globalThis.performance?.getEntriesByType?.('navigation')?.[0] as PerformanceNavigationTiming | undefined;
    if (n?.type !== 'navigate') return false;
    const adres = typeof n.name === 'string' ? n.name : '';
    return !adres || new URL(adres).searchParams.get('van') !== 'melding';
  } catch { return false; }
}

// Het startscherm geldt hoogstens één keer per paginalading: een latere herstart van de schil (na een
// netwerkonderbreking of een ander huishouden) springt nooit alsnog, terwijl iemand al kijkt (review PR #58).
let startGebruikt = false;
export function neemStartBeurt(): boolean {
  if (startGebruikt) return false;
  startGebruikt = true;
  return true;
}
/** Alleen voor tests: een nieuwe paginalading nabootsen. */
export function vergeetStartBeurt(): void { startGebruikt = false; }

// ---------------------------------------------------------------------------------------------
// Cache per account op dit toestel (zoals de huishoudkeuze in lokaal/sessie.ts). Alleen weergavekeuzes, geen inhoud.
// ---------------------------------------------------------------------------------------------
const VOORVOEGSEL = 'thuisplanner-voorkeuren:';

export function leesCache(account: string): Voorkeuren | null {
  try {
    const t = globalThis.localStorage?.getItem(VOORVOEGSEL + account);
    return t ? uitOpslag(JSON.parse(t)) : null;
  } catch { return null; }
}

export function bewaarCache(account: string, v: Voorkeuren): void {
  try { globalThis.localStorage?.setItem(VOORVOEGSEL + account, JSON.stringify(naarOpslag(v))); } catch { /* geen opslag: volgende start de standaard */ }
}

/** Bij uitloggen: de voorkeuren van alle accounts van dit toestel weg. */
export function vergeetCaches(): void {
  try {
    const ls = globalThis.localStorage;
    if (!ls) return;
    const weg: string[] = [];
    for (let i = 0; i < ls.length; i++) { const k = ls.key(i); if (k?.startsWith(VOORVOEGSEL)) weg.push(k); }
    weg.forEach(k => ls.removeItem(k));
  } catch { /* niets te wissen */ }
}
