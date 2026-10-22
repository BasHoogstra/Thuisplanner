import { createContext, useContext } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { LidRij, Melding as SyncMelding, SyncStatus } from '../../../sync/thuisplanner-sync.js';
import type { Lidmaatschap, UitnodigingVoorMij, Uitkomst } from './lokaal/sessie';
import type { DemoActies, Staat } from './store';
import type { GezinsFilter } from './filter';
import type { Datum, Huishouden, Item, Lid, LidId, Tijd } from './types';

export type AgendaWeergave = 'dag' | 'week' | 'maand';

/** Waar je in de agenda bent; blijft staan als je even naar een ander scherm gaat. */
export interface AgendaStand {
  weergave: AgendaWeergave;
  datum: Datum;
  filter: GezinsFilter;
}

export type Soort = 'afspraak' | 'taak' | 'boodschap';

export interface AppContext extends DemoActies {
  staat: Staat;
  huishouden: Huishouden;
  vandaag: Datum;
  nu: Tijd;
  uur: number;
  lid: (id: LidId) => Lid | undefined;
  /** Opent het centrale venster voor iets nieuws, eventueel al op een bepaalde dag. */
  openToevoegen: (soort?: Soort, datum?: Datum) => void;
  /** Opent een bestaand item om te bekijken, bewerken of verwijderen. */
  openItem: (id: string) => void;
  gaNaar: (scherm: Scherm) => void;
  agenda: AgendaStand;
  zetAgenda: (stand: Partial<AgendaStand>) => void;
  lokaal?: LokaalContext;
}

/**
 * Alleen in de lokale Supabase-modus (zie lib/lokaal). In de demo-modus is dit undefined en tonen de
 * schermen niets van accounts of synchronisatie.
 */
export interface LokaalContext {
  /** lokaal (fictief, eigen netwerk) of staging (de testomgeving online). */
  omgeving: 'lokaal' | 'staging';
  /** Huishoudbeheer (KG-5H): het huidige huishouden met je rol, je andere huishoudens en de leden. */
  beheer: {
    client: SupabaseClient;
    huishouden: Lidmaatschap;
    huishoudens: Lidmaatschap[];
    leden: LidRij[];
    kies: (id: string) => void;
  };
  /** Uitnodigingen voor het bevestigde e-mailadres van dit account (KG-5H deel 1b). */
  uitnodigingen: {
    lijst: UitnodigingVoorMij[];
    /** Voor de melding op Vandaag: zonder wat je met "Later" hebt weggezet (tot de app opnieuw opent). */
    melding: UitnodigingVoorMij[];
    bekijk: (u: UitnodigingVoorMij) => void;
    later: () => void;
  };
  account: string;
  /** Account in Meer (KG-5H deel 2): overal uitloggen en het adres wijzigen. */
  accountBeheer: {
    /** wissen: na de waarschuwing gekozen om onbevestigde opdrachten van dit toestel te wissen (P2). */
    uitloggenOveral: (opties?: { wissen?: boolean }) => Promise<void>;
    wijzigAdres: (nieuw: string) => Promise<Uitkomst>;
    bevestigAdres: (email: string, code: string) => Promise<Uitkomst<'gewijzigd' | 'nog-een'>>;
    wijziging: { nieuw: string } | null;
  };
  status: SyncStatus;
  /** false: deze browser bewaart niets; onbevestigde opdrachten gaan verloren bij sluiten. */
  opslagDuurzaam: boolean | null;
  /** Melding van de sync-module (conflict, geen verbinding, niet bevestigd, ...). */
  syncMelding: SyncMelding | null;
  syncMeldingWeg: () => void;
  /** Opdrachten die nog niet door de server zijn bevestigd (op dit toestel). */
  openstaand: { soort: string; id: string; staat: string; bewaard: boolean; zonderInhoud: boolean }[];
  opnieuwProberen: (id: string) => void;
  vergeten: (id: string) => void;
  /** Een opdracht zonder bewaarde inhoud (P1) opnieuw invoeren, met dezelfde opdracht-ID. */
  herinvoeren: (id: string, item: Item, melding?: string) => void;
  /** Onbevestigde opdrachten van dit account op dit toestel (alle huishoudens), voor de waarschuwing bij uitloggen (P2). */
  onbevestigdOpToestel: () => number;
  /** Eerst laten nakijken: opnieuw ophalen, zodat wat de server al heeft, bevestigd wordt. */
  nakijken: () => void;
  uitloggen: (opties?: { wissen?: boolean }) => void;
}

export type Scherm = 'vandaag' | 'agenda' | 'boodschappen' | 'meer';

export const Ctx = createContext<AppContext | null>(null);

export function useApp(): AppContext {
  const c = useContext(Ctx);
  if (!c) throw new Error('useApp buiten <App>');
  return c;
}
