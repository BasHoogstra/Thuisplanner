// Lokale demo-staat. Alles leeft alleen in het geheugen van dit tabblad: niets gaat naar een server
// en niets wordt bewaard. Herladen zet de demo terug.
import { useMemo, useReducer } from 'react';
import { demoItems, huishouden, type Scenario } from '../data/demo';
import { zichtbaarVoor } from './rechten';
import type { Datum, Item } from './types';

export interface Melding {
  id: number;
  tekst: string;
  /** Alleen waar: "Ongedaan maken" draait precies de wijziging terug waar deze melding over gaat. */
  ongedaan: boolean;
}

export interface Staat {
  scenario: Scenario;
  items: Item[];
  weggeklikt: Set<string>;
  /** Eén stap terug ("fouten moeten goedkoop zijn"). */
  vorige: Item[] | null;
  melding: Melding | null;
}

/**
 * Elke wijziging van de items zet de vorige stand klaar voor "Ongedaan maken" en vervangt de melding.
 * Een wijziging zonder eigen melding (bijvoorbeeld een boodschap afvinken) haalt een oude melding weg,
 * zodat "Ongedaan maken" nooit iets anders terugdraait dan wat erbij staat.
 */
type Wijziging = { melding?: string };
type Actie =
  | ({ type: 'toevoegen'; items: Item[] } & Wijziging)
  | ({ type: 'vervangAlles'; items: Item[] } & Wijziging)
  | ({ type: 'bijwerken'; item: Item } & Wijziging)
  | ({ type: 'wissel'; id: string; vandaag: Datum } & Wijziging)
  | ({ type: 'verwijder'; ids: string[] } & Wijziging)
  | { type: 'ongedaan' }
  | { type: 'wegklikken'; id: string }
  | { type: 'meld'; tekst: string }
  | { type: 'meldingWeg'; id: number }
  | { type: 'scenario'; scenario: Scenario; vandaag: Datum; melding: string };

let meldingTeller = 0;
const melding = (tekst: string | undefined, ongedaan: boolean): Melding | null =>
  tekst ? { id: ++meldingTeller, tekst, ongedaan } : null;

function wijzig(s: Staat, items: Item[], tekst?: string): Staat {
  return { ...s, vorige: s.items, items, melding: melding(tekst, true) };
}

export function reducer(s: Staat, a: Actie): Staat {
  switch (a.type) {
    case 'toevoegen':
      return wijzig(s, [...s.items, ...a.items], a.melding);
    case 'vervangAlles':
      return wijzig(s, a.items, a.melding);
    case 'bijwerken':
      return wijzig(s, s.items.map(i => (i.id === a.item.id ? a.item : i)), a.melding);
    case 'wissel':
      return wijzig(s, s.items.map(i => {
        if (i.id !== a.id) return i;
        if (i.soort === 'taak') return { ...i, klaar: !i.klaar, klaarOp: i.klaar ? null : a.vandaag };
        if (i.soort === 'boodschap') return { ...i, afgevinkt: !i.afgevinkt };
        return i;
      }), a.melding);
    case 'verwijder':
      return wijzig(s, s.items.filter(i => !a.ids.includes(i.id)), a.melding);
    case 'ongedaan':
      return s.vorige ? { ...s, items: s.vorige, vorige: null, melding: melding('Teruggezet', false) } : s;
    case 'wegklikken':
      return { ...s, weggeklikt: new Set([...s.weggeklikt, a.id]) };
    case 'meld':
      return { ...s, melding: melding(a.tekst, false) };
    case 'meldingWeg':
      return s.melding?.id === a.id ? { ...s, melding: null } : s;
    case 'scenario':
      return { ...beginStaat(a.vandaag, a.scenario), melding: melding(a.melding, false) };
  }
}

export function beginStaat(vandaag: Datum, scenario: Scenario = 'gewoon'): Staat {
  // Zoals een server het zou teruggeven: privé-afspraken van anderen zonder details.
  return { scenario, items: zichtbaarVoor(demoItems(vandaag, scenario), huishouden.ik), weggeklikt: new Set(), vorige: null, melding: null };
}

let teller = 0;
export const nieuwId = (prefix: string) => `${prefix}-nieuw-${Date.now().toString(36)}-${++teller}`;

export function useDemoStaat(vandaag: Datum) {
  const [staat, dispatch] = useReducer(reducer, undefined, () => beginStaat(vandaag));
  const acties = useMemo(() => ({
    toevoegen: (items: Item[], melding?: string) => dispatch({ type: 'toevoegen', items, melding }),
    vervangAlles: (items: Item[], melding?: string) => dispatch({ type: 'vervangAlles', items, melding }),
    bijwerken: (item: Item, melding?: string) => dispatch({ type: 'bijwerken', item, melding }),
    wissel: (id: string, melding?: string) => dispatch({ type: 'wissel', id, vandaag, melding }),
    verwijder: (ids: string[], melding?: string) => dispatch({ type: 'verwijder', ids, melding }),
    ongedaan: () => dispatch({ type: 'ongedaan' }),
    wegklikken: (id: string) => dispatch({ type: 'wegklikken', id }),
    meld: (tekst: string) => dispatch({ type: 'meld', tekst }),
    meldingWeg: (id: number) => dispatch({ type: 'meldingWeg', id }),
    kiesScenario: (scenario: Scenario, melding: string) => dispatch({ type: 'scenario', scenario, vandaag, melding }),
  }), [vandaag]);
  return { staat, ...acties };
}

export type DemoActies = Omit<ReturnType<typeof useDemoStaat>, 'staat'>;
