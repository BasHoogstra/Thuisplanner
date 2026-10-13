import type { Datum, Tijd } from './types';

const DAGEN = ['zondag', 'maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag'];
const MAANDEN = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september',
  'oktober', 'november', 'december'];

const twee = (n: number) => String(n).padStart(2, '0');

/** Lokale datum (geen UTC), zodat "vandaag" na middernacht niet verspringt. */
export function naarDatum(d: Date): Datum {
  return `${d.getFullYear()}-${twee(d.getMonth() + 1)}-${twee(d.getDate())}`;
}

export function vanDatum(s: Datum): Date {
  const [j, m, d] = s.split('-').map(Number);
  return new Date(j, m - 1, d);
}

export function plusDagen(s: Datum, n: number): Datum {
  const d = vanDatum(s);
  d.setDate(d.getDate() + n);
  return naarDatum(d);
}

export function verschilInDagen(van: Datum, tot: Datum): number {
  return Math.round((vanDatum(tot).getTime() - vanDatum(van).getTime()) / 86400000);
}

export function naarTijd(d: Date): Tijd {
  return `${twee(d.getHours())}:${twee(d.getMinutes())}`;
}

/** "zaterdag 10 oktober" */
export function langeDatum(s: Datum): string {
  const d = vanDatum(s);
  return `${DAGEN[d.getDay()]} ${d.getDate()} ${MAANDEN[d.getMonth()]}`;
}

/** "Vandaag", "Morgen", "Overmorgen", anders "dinsdag 13 oktober". */
export function dagLabel(s: Datum, vandaag: Datum): string {
  const v = verschilInDagen(vandaag, s);
  if (v === 0) return 'Vandaag';
  if (v === 1) return 'Morgen';
  if (v === 2) return 'Overmorgen';
  if (v === -1) return 'Gisteren';
  const l = langeDatum(s);
  return l.charAt(0).toUpperCase() + l.slice(1);
}

/** Korte dagnaam voor de compacte vooruitblik: "ma 12". */
export function korteDag(s: Datum): string {
  const d = vanDatum(s);
  return `${DAGEN[d.getDay()].slice(0, 2)} ${d.getDate()}`;
}

export function begroeting(uur: number): string {
  if (uur < 6) return 'Goedenacht';
  if (uur < 12) return 'Goedemorgen';
  if (uur < 18) return 'Goedemiddag';
  return 'Goedenavond';
}

/** De maandag van de week waarin deze datum valt (weken beginnen in Nederland op maandag). */
export function maandagVan(s: Datum): Datum {
  const dag = vanDatum(s).getDay(); // 0 = zondag
  return plusDagen(s, dag === 0 ? -6 : 1 - dag);
}

/** ISO-weeknummer (zoals in Nederlandse agenda's). */
export function weekNummer(s: Datum): number {
  const d = vanDatum(s);
  const donderdag = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const jan4 = new Date(donderdag.getFullYear(), 0, 4);
  return 1 + Math.round(((donderdag.getTime() - jan4.getTime()) / 86400000 - 3 + ((jan4.getDay() + 6) % 7)) / 7);
}

/** "5 – 11 oktober" of "29 september – 5 oktober". */
export function weekBereik(maandag: Datum): string {
  const a = vanDatum(maandag), b = vanDatum(plusDagen(maandag, 6));
  return a.getMonth() === b.getMonth()
    ? `${a.getDate()} – ${b.getDate()} ${MAANDEN[b.getMonth()]}`
    : `${a.getDate()} ${MAANDEN[a.getMonth()]} – ${b.getDate()} ${MAANDEN[b.getMonth()]}`;
}

/** "Zaterdag 10 oktober" met hoofdletter. */
export function langeDatumHoofdletter(s: Datum): string {
  const l = langeDatum(s);
  return l.charAt(0).toUpperCase() + l.slice(1);
}

/** Korte weekdagnaam: "ma", "di", ... */
export function weekdagKort(s: Datum): string {
  return DAGEN[vanDatum(s).getDay()].slice(0, 2);
}

export function isGeldigeDatum(s: string): s is Datum {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && naarDatum(vanDatum(s)) === s;
}
