// Lokale demo-staat. Alles leeft alleen in het geheugen van dit tabblad: niets gaat naar een server
// en niets wordt bewaard. Herladen zet de demo terug.
import { useCallback, useMemo, useReducer } from 'react';
import { demoItems, type Scenario } from '../data/demo';
import type { Item } from './types';

export interface Staat {
  scenario: Scenario;
  items: Item[];
  weggeklikt: Set<string>;
  /** Eén stap terug ("fouten moeten goedkoop zijn"). */
  vorige: Item[] | null;
}

type Actie =
  | { type: 'toevoegen'; items: Item[] }
  | { type: 'wissel'; id: string }
  | { type: 'verwijder'; ids: string[] }
  | { type: 'ongedaan' }
  | { type: 'wegklikken'; id: string }
  | { type: 'scenario'; scenario: Scenario; vandaag: string };

function reducer(s: Staat, a: Actie): Staat {
  switch (a.type) {
    case 'toevoegen':
      return { ...s, vorige: s.items, items: [...s.items, ...a.items] };
    case 'wissel':
      return {
        ...s, vorige: s.items, items: s.items.map(i => {
          if (i.id !== a.id) return i;
          if (i.soort === 'taak') return { ...i, klaar: !i.klaar };
          if (i.soort === 'boodschap') return { ...i, afgevinkt: !i.afgevinkt };
          return i;
        }),
      };
    case 'verwijder':
      return { ...s, vorige: s.items, items: s.items.filter(i => !a.ids.includes(i.id)) };
    case 'ongedaan':
      return s.vorige ? { ...s, items: s.vorige, vorige: null } : s;
    case 'wegklikken':
      return { ...s, weggeklikt: new Set([...s.weggeklikt, a.id]) };
    case 'scenario':
      return beginStaat(a.vandaag, a.scenario);
  }
}

export function beginStaat(vandaag: string, scenario: Scenario = 'gewoon'): Staat {
  return { scenario, items: demoItems(vandaag, scenario), weggeklikt: new Set(), vorige: null };
}

let teller = 0;
export const nieuwId = (prefix: string) => `${prefix}-nieuw-${Date.now().toString(36)}-${++teller}`;

export function useDemoStaat(vandaag: string) {
  const [staat, dispatch] = useReducer(reducer, undefined, () => beginStaat(vandaag));
  const acties = useMemo(() => ({
    toevoegen: (items: Item[]) => dispatch({ type: 'toevoegen', items }),
    wissel: (id: string) => dispatch({ type: 'wissel', id }),
    verwijder: (ids: string[]) => dispatch({ type: 'verwijder', ids }),
    ongedaan: () => dispatch({ type: 'ongedaan' }),
    wegklikken: (id: string) => dispatch({ type: 'wegklikken', id }),
  }), []);
  const kiesScenario = useCallback((scenario: Scenario) => dispatch({ type: 'scenario', scenario, vandaag }), [vandaag]);
  return { staat, ...acties, kiesScenario };
}

export type DemoActies = Omit<ReturnType<typeof useDemoStaat>, 'staat'>;
