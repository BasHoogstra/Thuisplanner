// Herhalende afspraken. Een reeks wordt één keer opgeslagen (de eerste afspraak met `herhaling`);
// voorkomens worden per periode berekend. Zo kan een reeks nooit dubbel in de agenda staan:
// een verwijderd of losgemaakt voorkomen is een uitzondering op de reeks, geen tweede kopie.
import { plusDagen, vanDatum, verschilInDagen } from './datum';
import type { Afspraak, Datum, Frequentie, Herhaling, Item } from './types';

export const FREQUENTIES: { id: Frequentie; label: string }[] = [
  { id: 'dagelijks', label: 'Elke dag' },
  { id: 'wekelijks', label: 'Elke week' },
  { id: 'maandelijks', label: 'Elke maand' },
  { id: 'jaarlijks', label: 'Elk jaar' },
];

const DAGEN = ['zondag', 'maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag'];
const MAANDEN = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september',
  'oktober', 'november', 'december'];

/** Hoogstens zoveel voorkomens per berekening; een week, maand of jaar haalt dat nooit. */
const MAX_VOORKOMENS = 1000;

const dagenInMaand = (jaar: number, maand0: number) => new Date(jaar, maand0 + 1, 0).getDate();
const twee = (n: number) => String(n).padStart(2, '0');
const maak = (jaar: number, maand0: number, dag: number): Datum => `${jaar}-${twee(maand0 + 1)}-${twee(dag)}`;

/**
 * Alle datums in [van, tot] (inclusief) waarop een reeks voorkomt die op `start` begint.
 * - Maandelijks op de 31e: maanden zonder 31e worden overgeslagen (niet naar de 30e verschoven).
 * - Jaarlijks op 29 februari: alleen in schrikkeljaren.
 * - Uitzonderingen en de einddatum van de reeks tellen mee.
 */
export function voorkomenDatums(start: Datum, h: Herhaling, van: Datum, tot: Datum): Datum[] {
  const eind = h.tot && h.tot < tot ? h.tot : tot;
  const begin = start > van ? start : van;
  if (eind < begin) return [];
  const weg = new Set(h.uitzonderingen ?? []);
  const uit: Datum[] = [];
  const voeg = (d: Datum) => { if (d >= begin && d <= eind && !weg.has(d)) uit.push(d); };

  if (h.freq === 'dagelijks' || h.freq === 'wekelijks') {
    const stap = h.freq === 'dagelijks' ? 1 : 7;
    const achter = verschilInDagen(start, begin);
    let d = plusDagen(start, Math.ceil(achter / stap) * stap);
    for (let i = 0; d <= eind && i < MAX_VOORKOMENS; i++, d = plusDagen(d, stap)) voeg(d);
    return uit;
  }

  const s = vanDatum(start), b = vanDatum(begin), e = vanDatum(eind);
  if (h.freq === 'maandelijks') {
    let k = Math.max(0, (b.getFullYear() - s.getFullYear()) * 12 + b.getMonth() - s.getMonth());
    const laatste = (e.getFullYear() - s.getFullYear()) * 12 + e.getMonth() - s.getMonth();
    for (; k <= laatste && uit.length < MAX_VOORKOMENS; k++) {
      const jaar = s.getFullYear() + Math.floor((s.getMonth() + k) / 12);
      const maand0 = (s.getMonth() + k) % 12;
      if (s.getDate() <= dagenInMaand(jaar, maand0)) voeg(maak(jaar, maand0, s.getDate()));
    }
    return uit;
  }

  // jaarlijks
  for (let jaar = Math.max(s.getFullYear(), b.getFullYear()); jaar <= e.getFullYear() && uit.length < MAX_VOORKOMENS; jaar++) {
    if (s.getDate() <= dagenInMaand(jaar, s.getMonth())) voeg(maak(jaar, s.getMonth(), s.getDate()));
  }
  return uit;
}

export const voorkomenId = (reeksId: string, datum: Datum) => `${reeksId}@${datum}`;

/** "a-zwem@2026-10-17" → { reeksId: "a-zwem", datum: "2026-10-17" }; een gewoon id → null. */
export function leesVoorkomenId(id: string): { reeksId: string; datum: Datum } | null {
  const i = id.lastIndexOf('@');
  return i > 0 ? { reeksId: id.slice(0, i), datum: id.slice(i + 1) } : null;
}

export function maakVoorkomen(reeks: Afspraak, datum: Datum): Afspraak {
  return { ...reeks, id: voorkomenId(reeks.id, datum), datum, voorkomenVan: reeks.id };
}

/** Alle afspraken in [van, tot]: losse afspraken en de berekende voorkomens van reeksen. */
export function afsprakenTussen(items: Item[], van: Datum, tot: Datum): Afspraak[] {
  const uit: Afspraak[] = [];
  for (const i of items) {
    if (i.soort !== 'afspraak') continue;
    if (!i.herhaling) {
      if (i.datum >= van && i.datum <= tot) uit.push(i);
      continue;
    }
    for (const d of voorkomenDatums(i.datum, i.herhaling, van, tot)) uit.push(maakVoorkomen(i, d));
  }
  return uit;
}

/** Zoekt een afspraak op id; ook een berekend voorkomen ("reeks@datum") als die datum echt in de reeks valt. */
export function vindAfspraak(items: Item[], id: string): Afspraak | undefined {
  const los = items.find(i => i.id === id);
  if (los?.soort === 'afspraak') return los;
  const v = leesVoorkomenId(id);
  if (!v) return undefined;
  const reeks = items.find(i => i.id === v.reeksId);
  if (reeks?.soort !== 'afspraak' || !reeks.herhaling) return undefined;
  return voorkomenDatums(reeks.datum, reeks.herhaling, v.datum, v.datum).length ? maakVoorkomen(reeks, v.datum) : undefined;
}

function metUitzondering(reeks: Afspraak, datum: Datum): Afspraak {
  const h = reeks.herhaling!;
  return { ...reeks, herhaling: { ...h, uitzonderingen: [...new Set([...(h.uitzonderingen ?? []), datum])].sort() } };
}

/** Eén voorkomen verwijderen: wordt een uitzondering op de reeks. */
export function verwijderVoorkomen(items: Item[], reeksId: string, datum: Datum): Item[] {
  return items.map(i => (i.id === reeksId && i.soort === 'afspraak' && i.herhaling ? metUitzondering(i, datum) : i));
}

/** Eén voorkomen wijzigen: de reeks krijgt een uitzondering en het voorkomen wordt een losse afspraak. */
export function wijzigVoorkomen(items: Item[], reeksId: string, datum: Datum, los: Afspraak): Item[] {
  const zonder = verwijderVoorkomen(items, reeksId, datum);
  const losgemaakt: Afspraak = { ...los, herhaling: undefined, voorkomenVan: undefined, reeksId, origineleDatum: datum };
  return [...zonder, losgemaakt];
}

/** De hele reeks verwijderen, inclusief losgemaakte voorkomens. */
export function verwijderReeks(items: Item[], reeksId: string): Item[] {
  return items.filter(i => i.id !== reeksId && !(i.soort === 'afspraak' && i.reeksId === reeksId));
}

/** "Elke week op zaterdag", "Elke maand op de 6e", "Elk jaar op 30 oktober" (+ " · tot en met ..."). */
export function herhalingTekst(start: Datum, h: Herhaling): string {
  const d = vanDatum(start);
  const basis = h.freq === 'dagelijks' ? 'Elke dag'
    : h.freq === 'wekelijks' ? `Elke week op ${DAGEN[d.getDay()]}`
      : h.freq === 'maandelijks' ? `Elke maand op de ${d.getDate()}e`
        : `Elk jaar op ${d.getDate()} ${MAANDEN[d.getMonth()]}`;
  if (!h.tot) return basis;
  const t = vanDatum(h.tot);
  return `${basis} · tot en met ${t.getDate()} ${MAANDEN[t.getMonth()]} ${t.getFullYear()}`;
}

