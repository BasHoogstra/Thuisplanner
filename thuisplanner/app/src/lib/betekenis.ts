// De betekenis van een zin in gewone taal, voor de kaart boven de invoerbalk van de + (docs/thuisplanner-snelinvoer.md §10).
// Niet "Afspraak · Morgen · 15:00 · Lotte", maar "Morgen om 15:00 · met Lotte". Een pure functie: geen klok, geen staat.
import { dagLabel } from './datum';
import { herhalingTekst } from './herhaling';
import type { Datum, Frequentie } from './types';
import type { Soort } from './zin';

export interface BetekenisInvoer {
  soort: Soort;
  titel: string;
  /** Bij een boodschap: de losse namen. */
  boodschappen: string[];
  datum: Datum | null;
  /** De dag kwam niet uit de zin (afspraak: vandaag; of de dag uit de Agenda). */
  datumAangenomen: boolean;
  start?: string;
  eind?: string;
  /** Namen van de gekozen leden. */
  wie: string[];
  plek?: string;
  herhaling?: { freq: Frequentie; tot: Datum | null };
  /** Naam van de gekozen vakantie (taak of boodschap). */
  vakantie?: string;
  /** Boodschap: bij Later nodig. */
  later: boolean;
  vandaag: Datum;
}

export interface Betekenis {
  /** De titel (bij boodschappen: de namen als één regel). */
  titel: string;
  /** Eén regel betekenis in gewone taal. */
  regel: string;
}

const hoofdletter = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/** "A", "A en B", "A, B en C", "A, B en 3 meer". */
export function opsomming(namen: string[]): string {
  if (namen.length <= 1) return namen[0] ?? '';
  if (namen.length <= 3) return `${namen.slice(0, -1).join(', ')} en ${namen[namen.length - 1]}`;
  return `${namen.slice(0, 2).join(', ')} en ${namen.length - 2} meer`;
}

export function betekenis(x: BetekenisInvoer): Betekenis {
  if (x.soort === 'boodschap') {
    const waar = x.vakantie
      ? `Voor ${x.vakantie} · ${x.later ? 'bij Later nodig' : 'nu te kopen'}`
      : x.later ? 'Bij Later nodig' : 'Op de boodschappenlijst';
    return { titel: opsomming(x.boodschappen), regel: waar };
  }
  const delen: string[] = [];
  if (x.soort === 'afspraak') {
    const d = x.datum ?? x.vandaag;
    const dag = x.herhaling ? herhalingTekst(d, { freq: x.herhaling.freq, tot: x.herhaling.tot, uitzonderingen: [] })
      : dagLabel(d, x.vandaag);
    const tijd = x.start ? ` om ${x.start}${x.eind ? `–${x.eind}` : ''}` : ', hele dag';
    delen.push(dag + tijd + (x.datumAangenomen && !x.herhaling ? ' (geen dag genoemd)' : ''));
    if (x.wie.length) delen.push(`met ${opsomming(x.wie)}`);
    if (x.plek) delen.push(x.plek);
  } else {
    if (x.datum) delen.push(dagLabel(x.datum, x.vandaag));
    if (x.wie.length) delen.push(`voor ${x.wie[0]}`);
    if (x.vakantie) delen.push(`voorbereiding voor ${x.vakantie}`);
    if (!delen.length) delen.push('Zonder datum');
  }
  return { titel: x.titel, regel: hoofdletter(delen.join(' · ')) };
}
