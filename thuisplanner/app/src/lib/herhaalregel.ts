// Het gedeelde herhalingscontract (ontwerp fase A, §5): welke datums horen bij een herhalingsregel.
// Puur: geen tabellen, geen tijdzones, geen uitzonderingen of losgemaakte voorkomens. Afspraken en (later) taken
// bouwen hun eigen gedrag hierop. De SQL-functie private.rule_occurs_on volgt exact dezelfde regels; beide worden
// getoetst met dezelfde testvectoren (supabase/tests/herhaalregel/vectoren.json).
//
// De regel is een subset van RFC 5545:
// - freq daily | weekly | monthly | yearly, interval 1–99 (standaard 1), weekstart maandag;
// - weekly: optioneel een set weekdagen (byday 'MO'…'SU'); zonder byday de weekdag van het anker;
// - monthly/yearly: optioneel precies één n-de weekdag ('1TU'…'4TU', '-1FR' = de laatste); zonder byday de dag van
//   de maand van het anker (een maand zonder die dag wordt overgeslagen; 29 februari alleen in schrikkeljaren);
// - yearly: altijd in de maand van het anker;
// - einde: until (inclusief) óf count (1–999), nooit beide. Count telt de keren van de regel.
// Het anker (de startdatum) is altijd de eerste keer en moet bij de regel passen.
import type { Datum, Frequentie } from './types';

export type RegelFreq = 'daily' | 'weekly' | 'monthly' | 'yearly';
export type Weekdag = 'MO' | 'TU' | 'WE' | 'TH' | 'FR' | 'SA' | 'SU';

export interface Herhaalregel {
  freq: RegelFreq;
  /** Om de hoeveel dagen, weken, maanden of jaren (1–99). Leeg = 1. */
  interval?: number | null;
  /** weekly: de weekdagen; monthly/yearly: precies één n-de of laatste weekdag ('2TU', '-1FR'). Leeg = van het anker. */
  byday?: string[] | null;
  /** Laatste dag waarop de reeks nog mag voorkomen (inclusief). */
  until?: Datum | null;
  /** Aantal keren (1–999). */
  count?: number | null;
}

/** Hoogstens zoveel datums per berekening (zoals MAX_VOORKOMENS in herhaling.ts). */
export const MAX_KEREN = 1000;

const WEEKDAGEN: Weekdag[] = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];
const DAGNAMEN = ['maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag', 'zondag'];
const MAANDEN = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september',
  'oktober', 'november', 'december'];
const NTE = /^(-1|[1-4])(MO|TU|WE|TH|FR|SA|SU)$/;
const DATUM = /^\d{4}-\d{2}-\d{2}$/;

// Rekenen met hele dagen sinds 1970-01-01 (UTC), zodat zomer- en wintertijd nooit meetellen.
const dagNr = (d: Datum) => { const [j, m, t] = d.split('-').map(Number); return Date.UTC(j, m - 1, t) / 86400000; };
const twee = (n: number) => String(n).padStart(2, '0');
function vanDagNr(n: number): Datum {
  const d = new Date(n * 86400000);
  return `${d.getUTCFullYear()}-${twee(d.getUTCMonth() + 1)}-${twee(d.getUTCDate())}`;
}
/** ISO-weekdag: 1 = maandag … 7 = zondag (1970-01-01 was een donderdag). */
const isoDag = (n: number) => ((((n + 3) % 7) + 7) % 7) + 1;
/** Volgnummer van de week (maandag–zondag). */
const weekNr = (n: number) => Math.floor((n + 3) / 7);
const maandagVanWeek = (w: number) => w * 7 - 3;
const dagenInMaand = (j: number, m0: number) => new Date(Date.UTC(j, m0 + 1, 0)).getUTCDate();
const delen = (d: Datum) => { const [j, m, t] = d.split('-').map(Number); return { j, m0: m - 1, t }; };
const geldigeDatum = (d: unknown): d is Datum =>
  typeof d === 'string' && DATUM.test(d) && vanDagNr(dagNr(d)) === d;

/** De n-de (1–4) of laatste (-1) weekdag van een maand, als dagnummer. */
function nteWeekdag(j: number, m0: number, code: string): number {
  const [, n, wd] = NTE.exec(code)!;
  const doel = WEEKDAGEN.indexOf(wd as Weekdag) + 1;
  if (n === '-1') {
    const laatste = Date.UTC(j, m0, dagenInMaand(j, m0)) / 86400000;
    return laatste - ((isoDag(laatste) - doel + 7) % 7);
  }
  const eerste = Date.UTC(j, m0, 1) / 86400000;
  return eerste + ((doel - isoDag(eerste) + 7) % 7) + (Number(n) - 1) * 7;
}

/** Fouten in een regel (leeg = geldig). De codes zijn stabiel; de database-checks volgen dezelfde lijst. */
export function controleerRegel(anker: Datum, r: Herhaalregel): string[] {
  const f: string[] = [];
  if (!geldigeDatum(anker)) return ['anker'];
  if (!['daily', 'weekly', 'monthly', 'yearly'].includes(r.freq)) return ['freq'];
  const iv = r.interval ?? 1;
  if (!Number.isInteger(iv) || iv < 1 || iv > 99) f.push('interval');
  if (r.until != null && r.count != null) f.push('until_en_count');
  if (r.until != null && (!geldigeDatum(r.until) || r.until < anker)) f.push('until');
  if (r.count != null && (!Number.isInteger(r.count) || r.count < 1 || r.count > 999)) f.push('count');
  const bd = r.byday ?? null;
  if (bd !== null) {
    const a = dagNr(anker);
    if (!Array.isArray(bd) || bd.length === 0) f.push('byday');
    else if (r.freq === 'daily') f.push('byday');
    else if (r.freq === 'weekly') {
      if (!bd.every(c => (WEEKDAGEN as string[]).includes(c)) || new Set(bd).size !== bd.length) f.push('byday');
      else if (!bd.includes(WEEKDAGEN[isoDag(a) - 1])) f.push('anker_past_niet');
    } else if (bd.length !== 1 || !NTE.test(bd[0])) f.push('byday');
    else {
      const { j, m0 } = delen(anker);
      if (nteWeekdag(j, m0, bd[0]) !== a) f.push('anker_past_niet');
    }
  }
  return f;
}

export const isGeldigeRegel = (anker: Datum, r: Herhaalregel) => controleerRegel(anker, r).length === 0;

/**
 * Alle datums in [van, tot] (inclusief) waarop de reeks voorkomt, oplopend, hoogstens MAX_KEREN.
 * Uitzonderingen worden weggelaten, maar tellen wel mee voor count (RFC 5545). Een ongeldige regel geeft [].
 */
export function datumsTussen(anker: Datum, r: Herhaalregel, van: Datum, tot: Datum, uitzonderingen?: Iterable<Datum>): Datum[] {
  if (!isGeldigeRegel(anker, r) || !geldigeDatum(van) || !geldigeDatum(tot)) return [];
  const a = dagNr(anker);
  const eind = Math.min(dagNr(tot), r.until ? dagNr(r.until) : Infinity);
  const begin = Math.max(a, dagNr(van));
  if (eind < begin) return [];
  const weg = new Set(uitzonderingen ?? []);
  const iv = r.interval ?? 1;
  const metCount = r.count != null;
  const uit: Datum[] = [];
  let geteld = 0;
  /** false = stoppen. */
  const kandidaat = (n: number): boolean => {
    if (n < a) return true;
    if (n > eind) return false;
    if (metCount && geteld >= r.count!) return false;
    geteld++;
    if (n >= begin) {
      const d = vanDagNr(n);
      if (!weg.has(d)) uit.push(d);
    }
    return uit.length < MAX_KEREN;
  };
  const { j: aj, m0: am, t: at } = delen(anker);

  if (r.freq === 'daily') {
    let k = metCount ? 0 : Math.max(0, Math.ceil((begin - a) / iv));
    while (kandidaat(a + k * iv)) k++;
    return uit;
  }
  if (r.freq === 'weekly') {
    const dagen = (r.byday?.length ? r.byday : [WEEKDAGEN[isoDag(a) - 1]])
      .map(c => WEEKDAGEN.indexOf(c as Weekdag)).sort((x, y) => x - y);
    const w0 = weekNr(a);
    let k = metCount ? 0 : Math.max(0, Math.floor((weekNr(begin) - w0) / iv));
    for (; ; k++) {
      const ma = maandagVanWeek(w0 + k * iv);
      if (ma > eind) return uit;
      for (const d of dagen) if (!kandidaat(ma + d)) return uit;
    }
  }
  // monthly en yearly: per periode hoogstens één datum.
  const code = r.byday?.length ? r.byday[0] : null;
  const stapMaanden = r.freq === 'monthly' ? iv : iv * 12;
  const b = delen(vanDagNr(begin));
  const verschil = (b.j - aj) * 12 + (b.m0 - am);
  let k = metCount ? 0 : Math.max(0, Math.floor(verschil / stapMaanden));
  for (; ; k++) {
    const mi = aj * 12 + am + k * stapMaanden;
    const j = Math.floor(mi / 12), m0 = mi % 12;
    if (Date.UTC(j, m0, 1) / 86400000 > eind) return uit;
    if (code) { if (!kandidaat(nteWeekdag(j, m0, code))) return uit; }
    else if (at <= dagenInMaand(j, m0)) { if (!kandidaat(Date.UTC(j, m0, at) / 86400000)) return uit; }
  }
}

/** Komt de reeks op deze dag voor? Zonder uitzonderingen; gelijk aan private.rule_occurs_on. */
export function komtVoorOp(anker: Datum, r: Herhaalregel, dag: Datum): boolean {
  if (!isGeldigeRegel(anker, r) || !geldigeDatum(dag)) return false;
  if (r.count != null) return datumsTussen(anker, r, dag, dag).length > 0;
  const a = dagNr(anker), n = dagNr(dag);
  if (n < a || (r.until && n > dagNr(r.until))) return false;
  const iv = r.interval ?? 1;
  const x = delen(dag), s = delen(anker);
  switch (r.freq) {
    case 'daily': return (n - a) % iv === 0;
    case 'weekly': {
      const dagen = r.byday?.length ? r.byday : [WEEKDAGEN[isoDag(a) - 1]];
      return (weekNr(n) - weekNr(a)) % iv === 0 && dagen.includes(WEEKDAGEN[isoDag(n) - 1]);
    }
    case 'monthly':
    case 'yearly': {
      const maanden = (x.j - s.j) * 12 + (x.m0 - s.m0);
      if (r.freq === 'monthly' ? maanden % iv !== 0 : x.m0 !== s.m0 || (x.j - s.j) % iv !== 0) return false;
      return r.byday?.length ? nteWeekdag(x.j, x.m0, r.byday[0]) === n : x.t === s.t;
    }
  }
}

/** De huidige herhaling van afspraken (herhaling.ts) als regel: dezelfde betekenis, interval 1. */
export function regelUitFrequentie(freq: Frequentie, tot?: Datum | null): Herhaalregel {
  const f: Record<Frequentie, RegelFreq> = { dagelijks: 'daily', wekelijks: 'weekly', maandelijks: 'monthly', jaarlijks: 'yearly' };
  return { freq: f[freq], until: tot ?? null };
}

const opsomming = (w: string[]) => (w.length < 2 ? w.join('') : `${w.slice(0, -1).join(', ')} en ${w.at(-1)}`);
function nteTekst(code: string): string {
  const [, n, wd] = NTE.exec(code)!;
  const naam = DAGNAMEN[WEEKDAGEN.indexOf(wd as Weekdag)];
  return n === '-1' ? `de laatste ${naam}` : `de ${n}e ${naam}`;
}

/**
 * "Elke week op zaterdag", "Om de 2 weken op maandag en woensdag", "Elke maand op de 2e dinsdag",
 * "Elk jaar op de laatste maandag van mei" (+ " · tot en met ..." of " · 10 keer").
 * Voor een regel zonder interval, weekdagen of count gelijk aan herhalingTekst in herhaling.ts.
 */
export function regelTekst(anker: Datum, r: Herhaalregel): string {
  const { m0, t } = delen(anker);
  const iv = r.interval ?? 1;
  const elke = (een: string, meer: string) => (iv === 1 ? een : `Om de ${iv} ${meer}`);
  const code = r.byday?.length && r.freq !== 'weekly' ? r.byday[0] : null;
  let basis: string;
  switch (r.freq) {
    case 'daily': basis = elke('Elke dag', 'dagen'); break;
    case 'weekly': {
      const dagen = (r.byday?.length ? r.byday : [WEEKDAGEN[isoDag(dagNr(anker)) - 1]])
        .map(c => WEEKDAGEN.indexOf(c as Weekdag)).sort((x, y) => x - y).map(i => DAGNAMEN[i]);
      basis = `${elke('Elke week', 'weken')} op ${opsomming(dagen)}`;
      break;
    }
    case 'monthly': basis = `${elke('Elke maand', 'maanden')} op ${code ? nteTekst(code) : `de ${t}e`}`; break;
    case 'yearly': basis = `${elke('Elk jaar', 'jaar')} op ${code ? `${nteTekst(code)} van ${MAANDEN[m0]}` : `${t} ${MAANDEN[m0]}`}`; break;
  }
  // Zeg eerlijk wanneer een reeks een keer overslaat.
  const let_op = !code && r.freq === 'monthly' && t > 28 ? ' · niet in maanden zonder die dag'
    : !code && r.freq === 'yearly' && m0 === 1 && t === 29 ? ' · alleen in schrikkeljaren' : '';
  if (r.count != null) return `${basis}${let_op} · ${r.count} keer`;
  if (!r.until) return basis + let_op;
  const u = delen(r.until);
  return `${basis}${let_op} · tot en met ${u.t} ${MAANDEN[u.m0]} ${u.j}`;
}
