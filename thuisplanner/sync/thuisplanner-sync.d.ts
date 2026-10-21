// Typen voor thuisplanner-sync.js (voor de React-app; de module zelf is gewoon JavaScript).
// Rijen zijn zoals de server ze teruggeeft (alleen expliciete kolommen, alleen wat RLS toelaat).
import type { SupabaseClient } from '@supabase/supabase-js';

export declare const STATUS: {
  readonly LADEN: 'laden'; readonly VERBONDEN: 'verbonden'; readonly SYNCHRONISEREN: 'synchroniseren';
  readonly OFFLINE: 'offline'; readonly GEEN_TOEGANG: 'geen-toegang'; readonly GESTOPT: 'gestopt';
};
export type SyncStatus = (typeof STATUS)[keyof typeof STATUS];

/** Velden voor een nog niet bevestigde toevoeging (alleen in de cache van de client). */
export interface VoorlopigeVelden {
  wachtend?: boolean;
  onzeker?: boolean;
  geweigerd?: boolean;
  inhoudNietBewaard?: boolean;
}

export interface BoodschapRij extends VoorlopigeVelden {
  /** null: inhoud niet op dit toestel (P1, inhoudNietBewaard). */
  id: string; household_id?: string; name: string | null; checked_at: string | null; version: number;
  created_at?: string; updated_at?: string;
}
export interface TaakRij extends VoorlopigeVelden {
  /** title null: inhoud niet op dit toestel (P1, inhoudNietBewaard). */
  id: string; household_id?: string; title: string | null; due_date: string | null; assignee_member_id: string | null;
  done_on: string | null; done_by_member_id?: string | null; version: number; created_at?: string; updated_at?: string;
  /** De vakantie waarvoor dit een voorbereiding is (F8), of null. */
  trip_id?: string | null;
}
export interface AfspraakRij extends VoorlopigeVelden {
  id: string; household_id?: string; owner_member_id?: string; visibility: 'household' | 'private';
  start_date: string | null; start_time: string | null; end_date: string | null; end_time: string | null;
  recurrence_freq?: 'daily' | 'weekly' | 'monthly' | 'yearly' | null; recurrence_until?: string | null;
  series_id?: string | null; original_date?: string | null; version: number; is_busy: boolean;
  title: string | null; location?: string | null; notes?: string | null; preparation?: string | null;
  participant_ids: string[];
}
export interface LidRij {
  id: string; household_id: string; display_name: string; kind: 'adult' | 'child'; role: string;
  status: 'active' | 'archived'; color: string | null; has_account: boolean; sort: number; created_at: string;
}
export interface Uitzondering { series_id: string; occurrence_date: string }

/** F8 Vakanties. name null: inhoud niet op dit toestel (P1, inhoudNietBewaard). */
export interface VakantieRij extends VoorlopigeVelden {
  id: string; household_id?: string; name: string | null; start_date: string | null; end_date: string | null;
  destination: string | null; notes: string | null; version: number; created_at?: string; updated_at?: string;
}
/** member_id null: Gezamenlijk. trip_id en name null: inhoud niet op dit toestel (P1). */
export interface PakitemRij extends VoorlopigeVelden {
  id: string; household_id?: string; trip_id: string | null; member_id: string | null; name: string | null;
  packed_at: string | null; packed_by_member_id?: string | null; version: number; created_at?: string; updated_at?: string;
}
/** Een boodschap voor een vakantie. settled_at: afgehandeld (gekocht en daarna voor iets anders teruggezet). */
export interface VakantieKoppelingRij {
  id: string; household_id: string; trip_id: string; shopping_item_id: string; settled_at: string | null;
  version: number; created_at: string; updated_at: string;
}
/** Wat vinkjesTerugzetten nodig heeft om vinkjes precies terug te zetten. */
export interface VinkjeTerug { id: string; version: number; packed: true; packed_at: string | null; packed_by: string | null }

export interface Melding { soort: string; tekst: string; id?: string }

export interface Toestand {
  status: SyncStatus;
  melding: Melding | null;
  laatstOpgehaald: string | null;
  opslagDuurzaam: boolean | null;
  bewaardOpToestel?: number;
  lid: { household_id: string; member_id: string; role: string } | null;
  leden: LidRij[];
  boodschappen: BoodschapRij[];
  taken: TaakRij[];
  afspraken: AfspraakRij[];
  uitzonderingen: Uitzondering[];
  /** Alle (niet-verwijderde) vakanties van het huishouden. */
  vakanties: VakantieRij[];
  /** Pakitems van vakanties die niet voorbij zijn, plus van geopende afgelopen vakanties (vakantieOpenen). */
  pakitems: PakitemRij[];
  /** Koppelingen vakantie–boodschap van dezelfde vakanties (ook afgehandelde). */
  vakantieKoppelingen: VakantieKoppelingRij[];
}

export interface Resultaat {
  ok: boolean;
  id?: string;
  data?: unknown;
  melding?: Melding | null;
  onzeker?: boolean;
  geweigerd?: boolean;
  mogelijkDubbel?: string;
  inhoudOntbreekt?: boolean;
  vervallen?: boolean;
}

export interface NieuweAfspraak {
  id?: string; version?: number | null; start_date: string; start_time?: string | null; end_date?: string | null;
  end_time?: string | null; visibility?: 'household' | 'private'; title: string; location?: string | null;
  notes?: string | null; preparation?: string | null; participant_ids?: string[] | null;
  recurrence_freq?: string | null; recurrence_until?: string | null;
}

export type Inhoud =
  | { soort: 'boodschap'; naam: string }
  | { soort: 'taak'; titel: string; velden?: Record<string, unknown> }
  | { soort: 'afspraak'; afspraak: NieuweAfspraak }
  | { soort: 'vakantie'; vakantie: NieuweVakantie }
  | { soort: 'pakitem'; pakitem: { trip_id: string; member_id: string | null; name: string } };

export interface NieuweVakantie { name: string; start_date?: string | null; end_date?: string | null; destination?: string | null; notes?: string | null }

export interface Openstaand { soort: string; id: string; staat: string; bewaard: boolean; zonderInhoud: boolean }

export interface Acties {
  /** opties.vakantie: de boodschap is (ook) voor deze vakantie. */
  boodschapToevoegen(naam: string, opties?: { bewustNieuw?: boolean; vakantie?: string }): Promise<Resultaat>;
  boodschapAfvinken(item: BoodschapRij): Promise<Resultaat>;
  boodschapHernoemen(item: BoodschapRij, naam: string, versie?: number): Promise<Resultaat>;
  boodschapVerwijderen(item: BoodschapRij): Promise<Resultaat>;
  taakToevoegen(titel: string, velden?: Record<string, unknown>, opties?: { bewustNieuw?: boolean }): Promise<Resultaat>;
  taakBijwerken(taak: TaakRij, velden: Record<string, unknown>, versie?: number): Promise<Resultaat>;
  /** vandaag: de dag die de app als "vandaag" toont (jjjj-mm-dd); zonder: de lokale datum van dit toestel. */
  taakAfvinken(taak: TaakRij, vandaag?: string): Promise<Resultaat>;
  taakVerwijderen(taak: TaakRij): Promise<Resultaat>;
  afspraakBewaren(a: NieuweAfspraak, opties?: { bewustNieuw?: boolean }): Promise<Resultaat>;
  afspraakVerwijderen(a: { id: string; version: number }): Promise<Resultaat>;
  afspraakVoorkomenWijzigen(reeksId: string, datum: string, a: NieuweAfspraak): Promise<Resultaat>;
  afspraakVoorkomenVerwijderen(reeksId: string, datum: string): Promise<Resultaat>;
  /** Een opdracht zonder inhoud op dit toestel (P1) opnieuw invoeren, onder dezelfde UUID. */
  /** Bij een boodschap kan de vakantie mee: { soort: 'boodschap', naam, vakantie }. */
  opnieuwInvoeren(id: string, inhoud: Inhoud | { soort: 'boodschap'; naam: string; vakantie?: string }): Promise<Resultaat>;
  // ---- Vakanties (F8) ----
  vakantieToevoegen(v: NieuweVakantie, opties?: { bewustNieuw?: boolean }): Promise<Resultaat>;
  vakantieBijwerken(v: VakantieRij, velden: Partial<NieuweVakantie>, versie?: number): Promise<Resultaat>;
  /** data[0].version: nodig voor vakantieHerstellen. */
  vakantieVerwijderen(v: VakantieRij): Promise<Resultaat>;
  vakantieHerstellen(v: VakantieRij, versie: number): Promise<Resultaat>;
  /** Een afgelopen vakantie tonen: haar paklijst gaat mee in elke ophaalronde tot vakantieSluiten. */
  vakantieOpenen(id: string): Promise<void>;
  vakantieSluiten(id: string): void;
  /** lidId null: Gezamenlijk. Dezelfde tekst bij die persoon: melding "dubbel". */
  pakitemToevoegen(vakantieId: string, lidId: string | null, naam: string, opties?: { bewustNieuw?: boolean }): Promise<Resultaat>;
  pakitemAfvinken(item: PakitemRij): Promise<Resultaat>;
  pakitemBijwerken(item: PakitemRij, velden: { name?: string; member_id?: string | null }, versie?: number): Promise<Resultaat>;
  /** data[0].version: nodig voor pakitemHerstellen. */
  pakitemVerwijderen(item: PakitemRij): Promise<Resultaat>;
  pakitemHerstellen(item: PakitemRij, versie: number): Promise<Resultaat>;
  /** Onzeker? Dezelfde opdracht opnieuw meegeven: dezelfde items, niets dubbel. */
  paklijstOvernemen(o: { van: string; naar: string; lid?: string | null; gezamenlijk?: boolean; opdracht?: string | null }):
    Promise<Resultaat & { opdracht: string; items?: { id: string; member_id: string | null; name: string }[] }>;
  /** Alleen items van die overname die niemand aanpaste; de rest blijft staan (gebleven). */
  overnemenOngedaanMaken(ids: string[]): Promise<Resultaat & { verwijderd?: number; gebleven?: number }>;
  /** lidId: een lid, null (Gezamenlijk) of 'iedereen'. */
  vinkjesOpnieuw(vakantieId: string, lidId: string | null | 'iedereen'): Promise<Resultaat & { terug?: VinkjeTerug[]; overgeslagen?: number }>;
  vinkjesTerugzetten(vakantieId: string, terug: VinkjeTerug[]): Promise<Resultaat & { overgeslagen?: number }>;
  boodschapOntkoppelen(k: VakantieKoppelingRij): Promise<Resultaat>;
  boodschapKoppelingHerstellen(k: VakantieKoppelingRij, versie: number): Promise<Resultaat>;
  opnieuwProberen(id: string): Promise<Resultaat>;
  vergeten(id: string): boolean;
  meldingWeg(): void;
}

export interface Sync {
  start(): Promise<void>;
  stop(): Promise<void>;
  vernieuw(): Promise<void>;
  acties: Acties;
  verwerkSeintje(bericht: unknown): void;
  readonly toestand: Toestand;
  readonly statistiek: { seintjes: number; genegeerd: number; rondes: number };
  readonly openstaand: Openstaand[];
  readonly kanaalNaam: string | null;
  vergeten(id: string): boolean;
}

export declare function maakSync(o: {
  supabase: SupabaseClient;
  huishoudenId: string;
  opWijziging?: (t: Toestand) => void;
  vangnetMs?: number;
  debounceMs?: number;
  paginaGrootte?: number;
  opslag?: Storage | null;
  /** Ook de inhoud duurzaam bewaren: alleen de ontwikkelmodus met fictieve gegevens (P3). Standaard niet (P1). */
  bewaarInhoud?: boolean;
  geheugen?: Map<string, unknown>;
  spoor?: (soort: string, status: string) => void;
  /** De dag die de app als "vandaag" toont (jjjj-mm-dd); bepaalt welke vakanties voorbij zijn. Standaard lokaleDatum(). */
  vandaag?: () => string;
}): Sync;

/** De laatste dag van een vakantie: einddatum, of vertrek + 13 dagen; zonder datum null. */
export declare function laatsteDag(v: { start_date: string | null; end_date: string | null }): string | null;
/** Voorbij op deze dag? Een vakantie zonder datum is nooit voorbij. */
export declare function vakantieVoorbij(v: { start_date: string | null; end_date: string | null }, vandaag: string): boolean;

/** UUID v4 met crypto.randomUUID of, zonder secure context, crypto.getRandomValues (nooit Math.random). */
/** De kalenderdag op dit toestel (jjjj-mm-dd), niet in UTC. */
export declare function lokaleDatum(d?: Date): string;
export declare function uuidV4(c?: Pick<Crypto, 'getRandomValues'> & { randomUUID?: () => string }): string;

export declare function meldingVoor(fout: unknown): Melding | null;

/** Onbevestigde opdrachten van dit account op dit toestel (alle huishoudens; P2). */
export declare function onbevestigdOpToestel(o: { opslag?: Storage | null; geheugen?: Map<string, unknown>; gebruiker: string | null }): number;
/** Ze allemaal van dit toestel wissen, alleen na een keuze van de gebruiker bij uitloggen (P2). Geeft het aantal. */
export declare function wisOnbevestigdOpToestel(o: { opslag?: Storage | null; geheugen?: Map<string, unknown>; gebruiker: string | null }): number;
