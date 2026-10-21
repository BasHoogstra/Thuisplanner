// Prototypemodel voor KG-2. Volgt de begrippen uit KG-1 (thuisplanner/supabase): een lid is niet hetzelfde
// als een account, kinderen zijn leden zonder account, en zichtbaarheid hoort bij het item.
// Dit is géén databasecontract. In de lokale Supabase-modus zet src/lib/lokaal/omzetten.ts de rijen van
// de server om naar deze typen (en terug).

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

/**
 * Alleen in de lokale Supabase-modus: de versie van de rij (voor versiecontrole bij bewaren) en, voor een
 * toevoeging die de server nog niet bevestigde, de staat ervan (zie de sync-module).
 */
export interface SyncVelden {
  versie?: number;
  sync?: 'wachtend' | 'onzeker' | 'geweigerd' | 'zonder-inhoud';
}
/** Tijd als HH:MM. */
export type Tijd = string;

export interface Afspraak extends SyncVelden {
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
  /**
   * Velden die het venster (nog) niet toont, maar die bij aanpassen nooit verloren mogen gaan: notities en,
   * bij een meerdaagse afspraak, de laatste dag (alleen als die na `datum` ligt). In de demo ongebruikt.
   */
  notities?: string;
  eindDatum?: Datum;
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

export interface Taak extends SyncVelden {
  id: string;
  soort: 'taak';
  titel: string;
  /** Null betekent: geen datum ("ooit"). */
  datum: Datum | null;
  voor: LidId | null;
  klaar: boolean;
  /** Wanneer de taak is afgevinkt; zo kan Vandaag "afgerond vandaag" tonen en weer openzetten. */
  klaarOp?: Datum | null;
  /** F8: de vakantie waarvoor dit een voorbereiding is. Ontbreekt het veld, dan blijft een bestaande koppeling staan. */
  vakantieId?: string | null;
}

export interface Boodschap extends SyncVelden {
  id: string;
  soort: 'boodschap';
  naam: string;
  afgevinkt: boolean;
}

export type Item = Afspraak | Taak | Boodschap;

// ---- F8 Vakanties (docs/thuisplanner-vakanties.md). Los van Item: een vakantie is geen afspraak, taak of boodschap. ----

export interface Vakantie extends SyncVelden {
  id: string;
  naam: string;
  /** Leeg: nog geen datum. */
  vertrek: Datum | null;
  /** Alleen met een vertrekdatum. Leeg: de vakantie telt als hoogstens 14 dagen. */
  terug: Datum | null;
  bestemming?: string;
  notities?: string;
}

export interface Pakitem extends SyncVelden {
  id: string;
  vakantieId: string;
  /** Leeg: Gezamenlijk. */
  lid: LidId | null;
  naam: string;
  ingepakt: boolean;
  ingepaktOp?: string | null;
  ingepaktDoor?: LidId | null;
}

/** Een boodschap voor een vakantie. Afgehandeld: gekocht en daarna voor iets anders weer op de lijst gezet. */
export interface VakantieKoppeling {
  id: string;
  vakantieId: string;
  boodschapId: string;
  afgehandeld: boolean;
  versie?: number;
}
