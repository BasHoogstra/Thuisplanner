// Prototypemodel voor KG-2. Volgt de begrippen uit KG-1 (komtgoed/supabase): een lid is niet hetzelfde
// als een account, kinderen zijn leden zonder account, en zichtbaarheid hoort bij het item.
// Dit is géén databasecontract; de echte typen volgen uit het schema zodra de app een backend krijgt.

export type LidId = string;

export interface Lid {
  id: LidId;
  naam: string;
  soort: 'volwassene' | 'kind';
  kleur: string;
  heeftAccount: boolean;
}

export interface Huishouden {
  naam: string;
  leden: Lid[];
  /** Het lid dat in deze demo "ingelogd" is. */
  ik: LidId;
}

/** ISO-datum zonder tijd, bijvoorbeeld 2026-10-10. */
export type Datum = string;
/** Tijd als HH:MM. */
export type Tijd = string;

export interface Afspraak {
  id: string;
  soort: 'afspraak';
  datum: Datum;
  start?: Tijd;
  eind?: Tijd;
  /** Leden voor wie de afspraak is. Leeg betekent: het hele huishouden. */
  wie: LidId[];
  eigenaar: LidId;
  zichtbaarheid: 'huishouden' | 'prive';
  /**
   * Een privé-afspraak van een ander komt (later: van de server) alleen als "bezet" binnen,
   * zonder titel of plek. De demo bootst dat na door die velden hier al weg te laten.
   */
  titel?: string;
  plek?: string;
  /** Wat er de dag ervoor klaar moet staan; voedt het ene rustige meedenk-signaal. */
  voorbereiding?: string;
  /** Alleen op de eerste afspraak van een reeks: hoe hij terugkomt. Voorkomens worden berekend, niet opgeslagen. */
  herhaling?: Herhaling;
  /** Bij één losgemaakt voorkomen van een reeks: de reeks en de datum waarop het oorspronkelijk viel. */
  reeksId?: string;
  origineleDatum?: Datum;
  /** Alleen op een berekend voorkomen (nooit opgeslagen): het id van de reeks waar het uit komt. */
  voorkomenVan?: string;
}

export type Frequentie = 'dagelijks' | 'wekelijks' | 'maandelijks' | 'jaarlijks';

export interface Herhaling {
  freq: Frequentie;
  /** Laatste dag waarop de reeks nog mag voorkomen (inclusief). Leeg = zonder einde. */
  tot?: Datum | null;
  /** Datums waarop de reeks níet voorkomt: verwijderd of losgemaakt. */
  uitzonderingen?: Datum[];
}

export interface Taak {
  id: string;
  soort: 'taak';
  titel: string;
  /** Null betekent: geen datum ("ooit"). */
  datum: Datum | null;
  voor: LidId | null;
  klaar: boolean;
  /** Wanneer de taak is afgevinkt; zo kan Vandaag "afgerond vandaag" tonen en weer openzetten. */
  klaarOp?: Datum | null;
}

export interface Boodschap {
  id: string;
  soort: 'boodschap';
  naam: string;
  afgevinkt: boolean;
}

export type Item = Afspraak | Taak | Boodschap;
