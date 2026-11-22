// Mijn spullen & Documenten (docs/thuisplanner-spullen-documenten.md §4 en §6.1). Los van Item: een spul of document is
// geen afspraak, taak of boodschap. De vorm volgt het voorgestelde datamodel (possessions, documents, document_links),
// zodat een Supabase-opslag later dezelfde typen kan teruggeven als de demo.
import type { Datum, LidId, SyncVelden } from '../types';

/** Per veld: gezien of ingevoerd door de gebruiker, herkend maar niet bevestigd, of leeg. */
export type VeldStatus = 'bevestigd' | 'voorstel' | 'ontbreekt';

/** Persoonlijk: alleen de eigenaar ziet het, en anderen krijgen geen aanwijzing dat het bestaat (besluit 14). */
export type Zichtbaarheid = 'gedeeld' | 'persoonlijk';

/** De velden van een aankoopdossier waarvoor een status bestaat (de controlekaart en de antwoorden van de +). */
export type SpulVeld = 'naam' | 'categorie' | 'merk' | 'model' | 'serienummer' | 'aankoopdatum' | 'winkel' | 'prijs'
  | 'bestelnummer' | 'garantieTot' | 'extraGarantieTot' | 'extraGarantieAanbieder';

export interface Spul extends SyncVelden {
  id: string;
  naam: string;
  categorie?: string;
  merk?: string;
  model?: string;
  serienummer?: string;
  aankoopdatum?: Datum;
  winkel?: string;
  /** In centen; nooit een kommagetal. */
  prijsCenten?: number;
  bestelnummer?: string;
  /** Commerciële garantie (fabrikant of winkel), zoals de gebruiker die invoert. Nooit berekend. */
  garantieTot?: Datum;
  /** Aanvullende (verlengde) garantie, zoals de gebruiker die invoert. */
  extraGarantieTot?: Datum;
  extraGarantieAanbieder?: string;
  notities?: string;
  zichtbaarheid: Zichtbaarheid;
  eigenaar: LidId;
  /** Ontbreekt een veld hier, dan geldt: ingevuld = bevestigd, leeg = ontbreekt. */
  status?: Partial<Record<SpulVeld, VeldStatus>>;
  /** In de prullenbak sinds (ISO-tijd); na 30 dagen echt weg. */
  verwijderdOp?: string | null;
}

export type DocumentSoort = 'factuur' | 'bon' | 'garantiebewijs' | 'handleiding' | 'polis' | 'contract' | 'onderhoudsrapport' | 'overig';

export type BestandType = 'application/pdf' | 'image/jpeg' | 'image/png' | 'image/webp';

/**
 * Waar het bestand is. De demo bewaart geen bestanden van de gebruiker: alleen de meegeleverde voorbeelden zijn te openen.
 * Het echte pad kent alleen een opslagpad; openen gaat dan via een kort geldige ondertekende link (§6.2).
 */
export type BestandBron =
  | { soort: 'voorbeeld'; sleutel: 'factuur-pdf' | 'bon-foto' | 'handleiding-pdf' }
  | { soort: 'niet-bewaard' }
  | { soort: 'opslag'; pad: string };

export interface Document extends SyncVelden {
  id: string;
  titel: string;
  soort: DocumentSoort;
  datum?: Datum;
  zichtbaarheid: Zichtbaarheid;
  eigenaar: LidId;
  /** Twee fasen (§6.3): pas 'klaar' na de controle op de server. De demo kent alleen 'klaar'. */
  upload: 'wacht' | 'klaar' | 'mislukt';
  type: BestandType;
  grootte: number;
  sha256?: string;
  bestand: BestandBron;
  verwijderdOp?: string | null;
}

/** Document ↔ spul, veel-op-veel. Eén document is één rij; een koppeling kopieert nooit. */
export interface DocumentKoppeling {
  documentId: string;
  spulId: string;
}

export interface SpullenGegevens {
  spullen: Spul[];
  documenten: Document[];
  koppelingen: DocumentKoppeling[];
}
