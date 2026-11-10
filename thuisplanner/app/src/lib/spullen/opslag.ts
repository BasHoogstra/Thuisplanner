// De opslag van Mijn spullen & Documenten achter één interface (voorbereiding op KG-5E licht: één Opslag-interface voor
// demo en echt). De schermen en de + kennen alleen SpullenOpslag. De demo-opslag hieronder houdt alles in het geheugen
// van dit tabblad en bewaart nooit een bestand van de gebruiker; het echte pad (Supabase, privé-bucket, uploaden in twee
// fasen, §6.2–6.3) komt er later naast, met dezelfde handelingen.
import { createContext, useContext, useMemo, useReducer } from 'react';
import { demoSpullen, voorbeeldBestand } from '../../data/spullen-demo';
import type { Datum, LidId } from '../types';
import { koppel, ontkoppel, zichtbaarVoorLid } from './logica';
import type { Document, Spul, SpullenGegevens } from './types';

/** Wat de + of een scherm meegeeft om een document in te voeren: een gekozen bestand of een meegeleverd voorbeeld. */
export type InvoerBron =
  | { soort: 'bestand'; bestand: File }
  | { soort: 'voorbeeld'; sleutel: 'factuur-pdf' | 'bon-foto' };

export interface NieuwDocument {
  document: Omit<Document, 'id' | 'upload' | 'bestand' | 'eigenaar'>;
  /** Het voorbereide bestand (verkleinde foto of PDF). De demo gooit het weg; het echte pad uploadt het. */
  bestand: Blob | null;
  voorbeeld?: 'factuur-pdf' | 'bon-foto';
  /** Koppelen aan bestaande spullen, en eventueel een nieuw spul dat in dezelfde handeling wordt gemaakt. */
  spullen: string[];
  nieuwSpul?: Omit<Spul, 'id' | 'eigenaar'>;
}

export interface SpullenOpslag {
  soort: 'demo' | 'echt';
  /** Alleen wat dit lid mag zien (demo: gefilterd; echt: wat RLS teruggeeft). */
  gegevens: SpullenGegevens;
  /** Inclusief wat in de prullenbak staat (voor de prullenbak zelf). */
  ik: LidId;
  spulBewaren: (s: Omit<Spul, 'id' | 'eigenaar'> & { id?: string }) => Promise<string>;
  spulVerwijderen: (id: string, metDocumenten?: boolean) => void;
  spulTerugzetten: (id: string) => void;
  /** Eén handeling: document, eventueel een nieuw spul, en de koppelingen samen (zoals maakSamen in KG-5E licht). */
  documentBewaren: (n: NieuwDocument) => Promise<{ documentId: string; spulId?: string }>;
  documentBijwerken: (d: Document) => void;
  documentVerwijderen: (id: string) => void;
  documentTerugzetten: (id: string) => void;
  koppel: (documentId: string, spulId: string) => void;
  ontkoppel: (documentId: string, spulId: string) => void;
  /** Echte opslag: documenten waarvan de upload nog wacht of mislukte (niet in de gewone lijst). */
  onvoltooid?: Document[];
  /** Het bestand om buiten de app te openen; 'niet-bewaard' in de demo voor een eigen bestand. */
  openBestand: (d: Document) => Promise<Blob | 'niet-bewaard' | null>;
}

type Actie =
  | { type: 'spul'; spul: Spul }
  | { type: 'spulWeg'; id: string; op: string; metDocumenten: boolean }
  | { type: 'spulTerug'; id: string }
  | { type: 'document'; document: Document; spul?: Spul; spullen: string[] }
  | { type: 'documentBij'; document: Document }
  | { type: 'documentWeg'; id: string; op: string }
  | { type: 'documentTerug'; id: string }
  | { type: 'koppel'; documentId: string; spulId: string }
  | { type: 'ontkoppel'; documentId: string; spulId: string };

function reducer(g: SpullenGegevens, a: Actie): SpullenGegevens {
  switch (a.type) {
    case 'spul': {
      const er = g.spullen.some(s => s.id === a.spul.id);
      return { ...g, spullen: er ? g.spullen.map(s => (s.id === a.spul.id ? a.spul : s)) : [...g.spullen, a.spul] };
    }
    case 'spulWeg': {
      const docs = a.metDocumenten ? new Set(g.koppelingen.filter(k => k.spulId === a.id).map(k => k.documentId)) : new Set<string>();
      return {
        ...g,
        spullen: g.spullen.map(s => (s.id === a.id ? { ...s, verwijderdOp: a.op } : s)),
        documenten: g.documenten.map(d => (docs.has(d.id) && !d.verwijderdOp ? { ...d, verwijderdOp: a.op } : d)),
      };
    }
    case 'spulTerug':
      return { ...g, spullen: g.spullen.map(s => (s.id === a.id ? { ...s, verwijderdOp: null } : s)) };
    case 'document': {
      let koppelingen = g.koppelingen;
      for (const s of a.spullen) koppelingen = koppel(koppelingen, a.document.id, s);
      return { spullen: a.spul ? [...g.spullen, a.spul] : g.spullen, documenten: [...g.documenten, a.document], koppelingen };
    }
    case 'documentBij':
      return { ...g, documenten: g.documenten.map(d => (d.id === a.document.id ? a.document : d)) };
    case 'documentWeg':
      return { ...g, documenten: g.documenten.map(d => (d.id === a.id ? { ...d, verwijderdOp: a.op } : d)) };
    case 'documentTerug':
      return { ...g, documenten: g.documenten.map(d => (d.id === a.id ? { ...d, verwijderdOp: null } : d)) };
    case 'koppel':
      return { ...g, koppelingen: koppel(g.koppelingen, a.documentId, a.spulId) };
    case 'ontkoppel':
      return { ...g, koppelingen: ontkoppel(g.koppelingen, a.documentId, a.spulId) };
  }
}

let teller = 0;
const nieuwId = (p: string) => `${p}-nieuw-${Date.now().toString(36)}-${++teller}`;

/**
 * De demo-opslag. `meld` toont een korte melding (die van de app). Een eigen bestand van de gebruiker wordt nooit bewaard:
 * niet in het geheugen, niet in de browseropslag en niet in de cache. Alleen de meegeleverde voorbeelden zijn te openen.
 */
export function useDemoSpullen(vandaag: Datum, ik: LidId, meld: (tekst: string) => void): SpullenOpslag {
  const [alles, dispatch] = useReducer(reducer, vandaag, demoSpullen);
  const gegevens = useMemo(() => zichtbaarVoorLid(alles, ik), [alles, ik]);
  return useMemo<SpullenOpslag>(() => ({
    soort: 'demo',
    gegevens,
    ik,
    spulBewaren: async s => {
      const id = s.id ?? nieuwId('s');
      dispatch({ type: 'spul', spul: { ...s, id, eigenaar: alles.spullen.find(x => x.id === id)?.eigenaar ?? ik } });
      meld(s.id ? `${s.naam} aangepast` : `${s.naam} bewaard`);
      return id;
    },
    spulVerwijderen: (id, metDocumenten = false) => {
      const s = alles.spullen.find(x => x.id === id);
      dispatch({ type: 'spulWeg', id, op: new Date().toISOString(), metDocumenten });
      if (s) meld(`${s.naam} staat in de prullenbak`);
    },
    spulTerugzetten: id => { dispatch({ type: 'spulTerug', id }); meld('Teruggezet'); },
    documentBewaren: async n => {
      const documentId = nieuwId('d');
      const spulId = n.nieuwSpul ? nieuwId('s') : undefined;
      const document: Document = {
        ...n.document, id: documentId, eigenaar: ik, upload: 'klaar', grootte: n.bestand?.size ?? 0,
        bestand: n.voorbeeld ? { soort: 'voorbeeld', sleutel: n.voorbeeld } : { soort: 'niet-bewaard' },
      };
      const spul = n.nieuwSpul && spulId ? { ...n.nieuwSpul, id: spulId, eigenaar: ik } : undefined;
      dispatch({ type: 'document', document, spul, spullen: [...n.spullen, ...(spulId ? [spulId] : [])] });
      meld('Bewaard (in de demo alleen in dit tabblad)');
      return { documentId, spulId };
    },
    documentBijwerken: d => { dispatch({ type: 'documentBij', document: d }); meld(`${d.titel} aangepast`); },
    documentVerwijderen: id => {
      const d = alles.documenten.find(x => x.id === id);
      dispatch({ type: 'documentWeg', id, op: new Date().toISOString() });
      if (d) meld(`${d.titel} staat in de prullenbak`);
    },
    documentTerugzetten: id => { dispatch({ type: 'documentTerug', id }); meld('Teruggezet'); },
    koppel: (documentId, spulId) => { dispatch({ type: 'koppel', documentId, spulId }); meld('Gekoppeld'); },
    ontkoppel: (documentId, spulId) => { dispatch({ type: 'ontkoppel', documentId, spulId }); meld('Ontkoppeld; het document blijft bewaard'); },
    openBestand: async d => (d.bestand.soort === 'voorbeeld' ? voorbeeldBestand(d.bestand.sleutel) : d.bestand.soort === 'niet-bewaard' ? 'niet-bewaard' : null),
  }), [gegevens, alles, ik, meld]);
}

// ---- Context: de schermen en de + vragen de opslag hier op. Zonder opslag (de lokale modus, nog niet gebouwd) is die er
// niet, en dan tonen Meer en de + niets van spullen: de bestaande app werkt dan precies zoals voorheen. ----

export interface SpullenContext extends SpullenOpslag {
  /** Een document invoeren (bijlageknop in de +, of de knop in het overzicht). */
  startInvoer: (bron: InvoerBron, opties?: { spulId?: string }) => void;
}

export const SpullenCtx = createContext<SpullenContext | null>(null);

/** De opslag, of null als dit onderdeel er (in deze modus) niet is. */
export function useSpullen(): SpullenContext | null {
  return useContext(SpullenCtx);
}
