import { createContext, useContext } from 'react';
import type { DemoActies, Staat } from './store';
import type { GezinsFilter } from './filter';
import type { Datum, Huishouden, Lid, LidId, Tijd } from './types';

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
}

export type Scherm = 'vandaag' | 'agenda' | 'boodschappen' | 'meer';

export const Ctx = createContext<AppContext | null>(null);

export function useApp(): AppContext {
  const c = useContext(Ctx);
  if (!c) throw new Error('useApp buiten <App>');
  return c;
}
