import { createContext, useContext } from 'react';
import type { DemoActies, Staat } from './store';
import type { Datum, Huishouden, Lid, LidId, Tijd } from './types';

export interface Melding {
  id: number;
  tekst: string;
  ongedaan?: boolean;
}

export interface AppContext extends DemoActies {
  staat: Staat;
  huishouden: Huishouden;
  vandaag: Datum;
  nu: Tijd;
  uur: number;
  meld: (tekst: string, opties?: { ongedaan?: boolean }) => void;
  lid: (id: LidId) => Lid | undefined;
  openToevoegen: (soort?: 'afspraak' | 'taak' | 'boodschap') => void;
  gaNaar: (scherm: Scherm) => void;
}

export type Scherm = 'vandaag' | 'agenda' | 'boodschappen' | 'meer';

export const Ctx = createContext<AppContext | null>(null);

export function useApp(): AppContext {
  const c = useContext(Ctx);
  if (!c) throw new Error('useApp buiten <App>');
  return c;
}
