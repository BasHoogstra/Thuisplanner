// Lokale demo-staat. Alles leeft alleen in het geheugen van dit tabblad: niets gaat naar een server
// en niets wordt bewaard. Herladen zet de demo terug.
import { useMemo, useReducer } from 'react';
import { demoItems, demoVakanties, huishouden, type Scenario } from '../data/demo';
import { zichtbaarVoor } from './rechten';
import { boodschappenMelding, voegBoodschappenToe } from './boodschappen';
import { verwijderReeks, verwijderVoorkomen, wijzigVoorkomen } from './herhaling';
import { alOpPaklijst, groepNaam } from './vakantie';
import type { Afspraak, Boodschap, Datum, Item, LidId, Pakitem, Vakantie, VakantieKoppeling } from './types';

export interface Melding {
  id: number;
  tekst: string;
  /** Alleen waar: "Ongedaan maken" draait precies de wijziging terug waar deze melding over gaat. */
  ongedaan: boolean;
}

/** Alles wat "Ongedaan maken" terugzet. */
export interface Gegevens {
  items: Item[];
  vakanties: Vakantie[];
  pakitems: Pakitem[];
  koppelingen: VakantieKoppeling[];
}

export interface Staat extends Gegevens {
  scenario: Scenario;
  weggeklikt: Set<string>;
  /** Eén stap terug ("fouten moeten goedkoop zijn"). */
  vorige: Gegevens | null;
  melding: Melding | null;
}

/** Voor wie vinkjes of overnemen gelden: één lid, Gezamenlijk (null) of iedereen. */
export type Groep = LidId | null | 'iedereen';

/**
 * Elke wijziging van de gegevens zet de vorige stand klaar voor "Ongedaan maken" en vervangt de melding.
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
  | { type: 'boodschappen'; namen: string[]; vakantieId?: string; later?: boolean }
  | ({ type: 'boodschapLater'; id: string; later: boolean } & Wijziging)
  | ({ type: 'voorkomenWijzigen'; reeksId: string; datum: Datum; afspraak: Afspraak } & Wijziging)
  | ({ type: 'voorkomenVerwijderen'; reeksId: string; datum: Datum } & Wijziging)
  | ({ type: 'reeksVerwijderen'; reeksId: string } & Wijziging)
  | { type: 'ongedaan' }
  | { type: 'wegklikken'; id: string }
  | { type: 'meld'; tekst: string }
  | { type: 'meldingWeg'; id: number }
  | { type: 'scenario'; scenario: Scenario; vandaag: Datum; melding: string }
  // F8 Vakanties
  | ({ type: 'vakantieToevoegen'; vakantie: Vakantie } & Wijziging)
  | ({ type: 'vakantieBijwerken'; vakantie: Vakantie } & Wijziging)
  | ({ type: 'vakantieVerwijderen'; id: string } & Wijziging)
  | { type: 'pakitemToevoegen'; item: Pakitem }
  | { type: 'pakitemWissel'; id: string; door: LidId }
  | { type: 'pakitemBijwerken'; id: string; naam?: string; lid?: LidId | null }
  | ({ type: 'pakitemVerwijderen'; id: string } & Wijziging)
  | { type: 'overnemen'; van: string; naar: string; groep: Groep }
  | { type: 'vinkjesOpnieuw'; vakantieId: string; groep: Groep }
  | ({ type: 'ontkoppelen'; koppelingId: string } & Wijziging);

let meldingTeller = 0;
const melding = (tekst: string | undefined, ongedaan: boolean): Melding | null =>
  tekst ? { id: ++meldingTeller, tekst, ongedaan } : null;

const gegevens = (s: Staat): Gegevens => ({ items: s.items, vakanties: s.vakanties, pakitems: s.pakitems, koppelingen: s.koppelingen });

function wijzigAlles(s: Staat, nieuw: Partial<Gegevens>, tekst?: string): Staat {
  return { ...s, vorige: gegevens(s), ...nieuw, melding: melding(tekst, true) };
}
function wijzig(s: Staat, items: Item[], tekst?: string): Staat {
  return wijzigAlles(s, { items }, tekst);
}
/** Alleen een melding, zonder iets te wijzigen (en zonder "Ongedaan maken"). */
const meldAlleen = (s: Staat, tekst: string): Staat => ({ ...s, melding: melding(tekst, false) });

const inGroep = (p: Pakitem, groep: Groep) => groep === 'iedereen' || (p.lid ?? null) === groep;
const meervoud = (n: number, een: string, meer: string) => `${n} ${n === 1 ? een : meer}`;

export function reducer(s: Staat, a: Actie): Staat {
  switch (a.type) {
    case 'toevoegen':
      return wijzig(s, [...s.items, ...a.items], a.melding);
    case 'vervangAlles':
      return wijzig(s, a.items, a.melding);
    case 'bijwerken':
      return wijzig(s, s.items.map(i => (i.id === a.item.id ? behoudVakantie(i, a.item) : i)), a.melding);
    case 'wissel':
      return wijzig(s, s.items.map(i => {
        if (i.id !== a.id) return i;
        if (i.soort === 'taak') return { ...i, klaar: !i.klaar, klaarOp: i.klaar ? null : a.vandaag };
        if (i.soort === 'boodschap') return { ...i, afgevinkt: !i.afgevinkt };
        return i;
      }), a.melding);
    case 'verwijder':
      return wijzig(s, s.items.filter(i => !a.ids.includes(i.id)), a.melding);
    case 'boodschappen': {
      // Vanuit een vakantie: standaard bij "Later nodig" (zelfde regels als add_shopping_items met p_later).
      const later = a.later ?? !!a.vakantieId;
      const r = voegBoodschappenToe(s.items, a.namen, () => nieuwId('b'), later);
      const sleutel = (n: string) => n.trim().toLocaleLowerCase('nl');
      const idVan = (naam: string) => (r.items.find(i => i.soort === 'boodschap' && sleutel(i.naam) === sleutel(naam)) as Boodschap | undefined)?.id;
      // Hergebruik (afgevinkt komt terug): de oude koppelingen zijn afgehandeld en worden niet opnieuw actueel (§6.2).
      const terugIds = new Set(r.terug.map(idVan).filter(Boolean) as string[]);
      let koppelingen = s.koppelingen.map(k => (terugIds.has(k.boodschapId) && !k.afgehandeld ? { ...k, afgehandeld: true } : k));
      if (a.vakantieId) {
        for (const naam of [...r.nieuw, ...r.alOpLijst, ...r.terug, ...(r.naarNu ?? [])]) {
          const id = idVan(naam);
          if (id && !koppelingen.some(k => k.boodschapId === id && k.vakantieId === a.vakantieId && !k.afgehandeld)) {
            koppelingen = [...koppelingen, { id: nieuwId('k'), vakantieId: a.vakantieId, boodschapId: id, afgehandeld: false }];
          }
        }
      }
      return wijzigAlles(s, { items: r.items, koppelingen }, boodschappenMelding(r, later));
    }
    case 'boodschapLater':
      return wijzig(s, s.items.map(i => {
        if (i.id !== a.id || i.soort !== 'boodschap') return i;
        const { later: _, ...rest } = i;
        return a.later ? { ...rest, later: true } : rest;
      }), a.melding);
    case 'voorkomenWijzigen':
      return wijzig(s, wijzigVoorkomen(s.items, a.reeksId, a.datum, a.afspraak), a.melding);
    case 'voorkomenVerwijderen':
      return wijzig(s, verwijderVoorkomen(s.items, a.reeksId, a.datum), a.melding);
    case 'reeksVerwijderen':
      return wijzig(s, verwijderReeks(s.items, a.reeksId), a.melding);
    case 'ongedaan':
      return s.vorige ? { ...s, ...s.vorige, vorige: null, melding: melding('Teruggezet', false) } : s;
    case 'wegklikken':
      return { ...s, weggeklikt: new Set([...s.weggeklikt, a.id]) };
    case 'meld':
      return { ...s, melding: melding(a.tekst, false) };
    case 'meldingWeg':
      return s.melding?.id === a.id ? { ...s, melding: null } : s;
    case 'scenario':
      return { ...beginStaat(a.vandaag, a.scenario), melding: melding(a.melding, false) };

    // ---- Vakanties ----
    case 'vakantieToevoegen':
      return wijzigAlles(s, { vakanties: [...s.vakanties, a.vakantie] }, a.melding);
    case 'vakantieBijwerken':
      return wijzigAlles(s, { vakanties: s.vakanties.map(v => (v.id === a.vakantie.id ? a.vakantie : v)) }, a.melding);
    case 'vakantieVerwijderen':
      // Taken en boodschappen blijven bestaan; zonder vakantie verdwijnt alleen het label.
      return wijzigAlles(s, { vakanties: s.vakanties.filter(v => v.id !== a.id) }, a.melding);
    case 'pakitemToevoegen': {
      const p = a.item;
      if (alOpPaklijst(s.pakitems, p.vakantieId, p.lid, p.naam)) return meldAlleen(s, `Staat al op de lijst van ${groepNaam(huishouden, p.lid)}`);
      return { ...wijzigAlles(s, { pakitems: [...s.pakitems, p] }), melding: null };
    }
    case 'pakitemWissel':
      return { ...wijzigAlles(s, { pakitems: s.pakitems.map(p => (p.id !== a.id ? p
        : p.ingepakt ? { ...p, ingepakt: false, ingepaktOp: null, ingepaktDoor: null }
          : { ...p, ingepakt: true, ingepaktOp: new Date().toISOString(), ingepaktDoor: a.door })) }), melding: null };
    case 'pakitemBijwerken': {
      const p = s.pakitems.find(x => x.id === a.id);
      if (!p) return s;
      const nieuw = { ...p, ...(a.naam !== undefined ? { naam: a.naam } : {}), ...(a.lid !== undefined ? { lid: a.lid } : {}) };
      if (alOpPaklijst(s.pakitems, nieuw.vakantieId, nieuw.lid, nieuw.naam, p.id)) return meldAlleen(s, `Staat al op de lijst van ${groepNaam(huishouden, nieuw.lid)}`);
      const tekst = a.lid !== undefined && a.lid !== p.lid ? `${nieuw.naam} staat nu bij ${groepNaam(huishouden, nieuw.lid)}` : `${nieuw.naam} aangepast`;
      return wijzigAlles(s, { pakitems: s.pakitems.map(x => (x.id === a.id ? nieuw : x)) }, tekst);
    }
    case 'pakitemVerwijderen':
      return wijzigAlles(s, { pakitems: s.pakitems.filter(p => p.id !== a.id) }, a.melding);
    case 'overnemen': {
      // Aanvullend: wat er al staat (zelfde persoon en tekst), wordt overgeslagen; overgenomen items zijn niet afgevinkt.
      const nieuw: Pakitem[] = [];
      for (const p of s.pakitems.filter(x => x.vakantieId === a.van && inGroep(x, a.groep))) {
        if (alOpPaklijst([...s.pakitems, ...nieuw], a.naar, p.lid, p.naam)) continue;
        nieuw.push({ id: nieuwId('p'), vakantieId: a.naar, lid: p.lid, naam: p.naam, ingepakt: false, ingepaktOp: null, ingepaktDoor: null });
      }
      if (!nieuw.length) return meldAlleen(s, 'Alles stond er al');
      return wijzigAlles(s, { pakitems: [...s.pakitems, ...nieuw] }, `${meervoud(nieuw.length, 'item', 'items')} overgenomen`);
    }
    case 'vinkjesOpnieuw': {
      const weg = s.pakitems.filter(p => p.vakantieId === a.vakantieId && p.ingepakt && inGroep(p, a.groep));
      if (!weg.length) return meldAlleen(s, 'Er stond nog niets afgevinkt');
      const ids = new Set(weg.map(p => p.id));
      return wijzigAlles(s, { pakitems: s.pakitems.map(p => (ids.has(p.id) ? { ...p, ingepakt: false, ingepaktOp: null, ingepaktDoor: null } : p)) },
        `${meervoud(weg.length, 'vinkje', 'vinkjes')} weggehaald`);
    }
    case 'ontkoppelen':
      return wijzigAlles(s, { koppelingen: s.koppelingen.filter(k => k.id !== a.koppelingId) }, a.melding);
  }
}

/** Een taak uit een formulier zonder vakantieveld houdt haar vakantie (het veld ontbreekt = niet gewijzigd). */
function behoudVakantie(oud: Item, nieuw: Item): Item {
  if (oud.soort === 'taak' && nieuw.soort === 'taak' && nieuw.vakantieId === undefined && oud.vakantieId !== undefined) {
    return { ...nieuw, vakantieId: oud.vakantieId };
  }
  // Een boodschap aanpassen (naam) laat "Later nodig" staan.
  if (oud.soort === 'boodschap' && nieuw.soort === 'boodschap' && nieuw.later === undefined && oud.later) {
    return { ...nieuw, later: true };
  }
  return nieuw;
}

export function beginStaat(vandaag: Datum, scenario: Scenario = 'gewoon'): Staat {
  // Zoals een server het zou teruggeven: privé-afspraken van anderen zonder details.
  const v = demoVakanties(vandaag);
  return {
    scenario, items: zichtbaarVoor([...demoItems(vandaag, scenario), ...v.items], huishouden.ik),
    vakanties: v.vakanties, pakitems: v.pakitems, koppelingen: v.koppelingen,
    weggeklikt: new Set(), vorige: null, melding: null,
  };
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
    // Expliciete handelingen (in plaats van "vervang alles"): zo kan de lokale Supabase-modus precies
    // dezelfde handeling op de server uitvoeren (zie lokaal/staat.ts).
    voegBoodschappenToe: (namen: string[], vakantieId?: string, later?: boolean) => dispatch({ type: 'boodschappen', namen, vakantieId, later }),
    /** Tussen "Nu te kopen" en "Later nodig"; dezelfde boodschap, met ongedaan maken. */
    boodschapLater: (b: Boodschap, later: boolean) =>
      dispatch({ type: 'boodschapLater', id: b.id, later, melding: later ? `${b.naam} bij Later nodig` : `${b.naam} nu te kopen` }),
    wijzigVoorkomen: (reeksId: string, datum: Datum, afspraak: Afspraak, melding?: string) =>
      dispatch({ type: 'voorkomenWijzigen', reeksId, datum, afspraak, melding }),
    verwijderVoorkomen: (reeksId: string, datum: Datum, melding?: string) =>
      dispatch({ type: 'voorkomenVerwijderen', reeksId, datum, melding }),
    verwijderReeks: (reeksId: string, melding?: string) => dispatch({ type: 'reeksVerwijderen', reeksId, melding }),
    ongedaan: () => dispatch({ type: 'ongedaan' }),
    wegklikken: (id: string) => dispatch({ type: 'wegklikken', id }),
    meld: (tekst: string) => dispatch({ type: 'meld', tekst }),
    meldingWeg: (id: number) => dispatch({ type: 'meldingWeg', id }),
    kiesScenario: (scenario: Scenario, melding: string) => dispatch({ type: 'scenario', scenario, vandaag, melding }),

    // ---- Vakanties (dezelfde handelingen als de sync-module, zie lokaal/staat.ts) ----
    /** Geeft het id van de nieuwe vakantie (om haar meteen te openen). */
    vakantieToevoegen: async (v: Omit<Vakantie, 'id'>): Promise<string | null> => {
      const id = nieuwId('v');
      dispatch({ type: 'vakantieToevoegen', vakantie: { ...v, id }, melding: `${v.naam} toegevoegd` });
      return id;
    },
    vakantieBijwerken: (v: Vakantie, melding?: string) => dispatch({ type: 'vakantieBijwerken', vakantie: v, melding }),
    vakantieVerwijderen: (v: Vakantie) => dispatch({ type: 'vakantieVerwijderen', id: v.id, melding: `${v.naam} verwijderd` }),
    pakitemToevoegen: (vakantieId: string, lid: LidId | null, naam: string) => dispatch({ type: 'pakitemToevoegen',
      item: { id: nieuwId('p'), vakantieId, lid, naam: naam.trim().replace(/\s+/g, ' '), ingepakt: false, ingepaktOp: null, ingepaktDoor: null } }),
    pakitemWissel: (p: Pakitem) => dispatch({ type: 'pakitemWissel', id: p.id, door: huishouden.ik }),
    pakitemBijwerken: (p: Pakitem, wijziging: { naam?: string; lid?: LidId | null }) => dispatch({ type: 'pakitemBijwerken', id: p.id,
      naam: wijziging.naam !== undefined ? wijziging.naam.trim().replace(/\s+/g, ' ') : undefined, lid: wijziging.lid }),
    pakitemVerwijderen: (p: Pakitem) => dispatch({ type: 'pakitemVerwijderen', id: p.id, melding: `${p.naam} verwijderd` }),
    paklijstOvernemen: (van: string, naar: string, groep: Groep) => dispatch({ type: 'overnemen', van, naar, groep }),
    vinkjesOpnieuw: (vakantieId: string, groep: Groep) => dispatch({ type: 'vinkjesOpnieuw', vakantieId, groep }),
    boodschapOntkoppelen: (k: VakantieKoppeling, naam: string) => dispatch({ type: 'ontkoppelen', koppelingId: k.id, melding: `${naam} niet meer voor deze vakantie` }),
    /** Een afgelopen vakantie tonen (lokaal: haar paklijst ophalen). In de demo staat alles al klaar. */
    vakantieOpenen: (_id: string) => {},
    vakantieSluiten: (_id: string) => {},
  }), [vandaag]);
  return { staat, ...acties };
}

export type DemoActies = Omit<ReturnType<typeof useDemoStaat>, 'staat'>;
