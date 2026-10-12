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
  id: string; household_id?: string; name: string; checked_at: string | null; version: number;
  created_at?: string; updated_at?: string;
}
export interface TaakRij extends VoorlopigeVelden {
  id: string; household_id?: string; title: string; due_date: string | null; assignee_member_id: string | null;
  done_on: string | null; done_by_member_id?: string | null; version: number; created_at?: string; updated_at?: string;
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

export interface Acties {
  boodschapToevoegen(naam: string, opties?: { bewustNieuw?: boolean }): Promise<Resultaat>;
  boodschapAfvinken(item: BoodschapRij): Promise<Resultaat>;
  boodschapHernoemen(item: BoodschapRij, naam: string, versie?: number): Promise<Resultaat>;
  boodschapVerwijderen(item: BoodschapRij): Promise<Resultaat>;
  taakToevoegen(titel: string, velden?: Record<string, unknown>, opties?: { bewustNieuw?: boolean }): Promise<Resultaat>;
  taakBijwerken(taak: TaakRij, velden: Record<string, unknown>, versie?: number): Promise<Resultaat>;
  taakAfvinken(taak: TaakRij): Promise<Resultaat>;
  taakVerwijderen(taak: TaakRij): Promise<Resultaat>;
  afspraakBewaren(a: NieuweAfspraak, opties?: { bewustNieuw?: boolean }): Promise<Resultaat>;
  afspraakVerwijderen(a: { id: string; version: number }): Promise<Resultaat>;
  afspraakVoorkomenWijzigen(reeksId: string, datum: string, a: NieuweAfspraak): Promise<Resultaat>;
  afspraakVoorkomenVerwijderen(reeksId: string, datum: string): Promise<Resultaat>;
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
  readonly openstaand: { soort: string; id: string; staat: string; bewaard: boolean }[];
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
  geheugen?: Map<string, unknown>;
  spoor?: (soort: string, status: string) => void;
}): Sync;

export declare function meldingVoor(fout: unknown): Melding | null;
