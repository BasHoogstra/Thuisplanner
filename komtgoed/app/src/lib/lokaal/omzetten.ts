// Lokale Supabase-modus: rijen van de server (via de sync-module) omzetten naar de typen van de app, en
// terug. Pure functies, los getest (tests/omzetten.test.ts).
//
// Privacy: wat de server niet teruggeeft, kan hier ook niet ontstaan. Een privé-afspraak van een ander
// komt als `is_busy` zonder titel, plek, notities en voorbereiding binnen (RLS, gate 9); de app maakt
// daar een afspraak zonder die velden van, die elk scherm als "Bezet" toont.
import type {
  AfspraakRij, BoodschapRij, LidRij, NieuweAfspraak, TaakRij, Toestand, Uitzondering,
} from '../../../../sync/thuisplanner-sync.js';
import type { Afspraak, Boodschap, Frequentie, Huishouden, Item, Lid, SyncVelden, Taak } from '../types';

const NAAR_FREQ: Record<string, Frequentie> = { daily: 'dagelijks', weekly: 'wekelijks', monthly: 'maandelijks', yearly: 'jaarlijks' };
const VAN_FREQ: Record<Frequentie, string> = { dagelijks: 'daily', wekelijks: 'weekly', maandelijks: 'monthly', jaarlijks: 'yearly' };

const tijd = (t: string | null | undefined) => (t ? t.slice(0, 5) : undefined);

function syncStaat(r: { wachtend?: boolean; onzeker?: boolean; geweigerd?: boolean; inhoudNietBewaard?: boolean }): SyncVelden['sync'] {
  if (r.inhoudNietBewaard) return 'zonder-inhoud';
  if (r.geweigerd) return 'geweigerd';
  if (r.onzeker) return 'onzeker';
  if (r.wachtend) return 'wachtend';
  return undefined;
}

/** Kleuren uit het ontwerp (app.css), op volgorde van de leden; een eigen kleur van de server gaat voor. */
const LIDKLEUREN = ['var(--lid-1)', 'var(--lid-2)', 'var(--lid-3)', 'var(--lid-4)'];

export function naarLeden(rijen: LidRij[]): Lid[] {
  return rijen.filter(l => l.status === 'active').map((l, i) => ({
    id: l.id,
    naam: l.display_name,
    soort: l.kind === 'child' ? 'kind' : 'volwassene',
    kleur: l.color ?? LIDKLEUREN[i % LIDKLEUREN.length],
    heeftAccount: l.has_account,
  }));
}

export function naarAfspraak(r: AfspraakRij, uitzonderingen: Map<string, string[]>): Afspraak {
  const a: Afspraak = {
    id: r.id,
    soort: 'afspraak',
    datum: r.start_date ?? '',
    start: tijd(r.start_time),
    eind: tijd(r.end_time),
    wie: r.participant_ids ?? [],
    eigenaar: r.owner_member_id ?? '',
    zichtbaarheid: r.visibility === 'private' ? 'prive' : 'huishouden',
    versie: r.version,
    sync: syncStaat(r),
  };
  // Alleen wat de server teruggeeft: bij "bezet" zijn deze velden leeg.
  if (!r.is_busy) {
    if (r.title) a.titel = r.title;
    if (r.location) a.plek = r.location;
    if (r.preparation) a.voorbereiding = r.preparation;
  }
  if (r.recurrence_freq && NAAR_FREQ[r.recurrence_freq]) {
    a.herhaling = { freq: NAAR_FREQ[r.recurrence_freq], tot: r.recurrence_until ?? null, uitzonderingen: uitzonderingen.get(r.id) ?? [] };
  }
  if (r.series_id) { a.reeksId = r.series_id; a.origineleDatum = r.original_date ?? undefined; }
  return a;
}

export function naarTaak(r: TaakRij): Taak {
  return {
    id: r.id, soort: 'taak', titel: r.title, datum: r.due_date ?? null, voor: r.assignee_member_id ?? null,
    klaar: !!r.done_on, klaarOp: r.done_on ?? null, versie: r.version, sync: syncStaat(r),
  };
}

export function naarBoodschap(r: BoodschapRij): Boodschap {
  return { id: r.id, soort: 'boodschap', naam: r.name, afgevinkt: !!r.checked_at, versie: r.version, sync: syncStaat(r) };
}

export function uitzonderingenPerReeks(rijen: Uitzondering[]): Map<string, string[]> {
  const m = new Map<string, string[]>();
  for (const u of rijen) m.set(u.series_id, [...(m.get(u.series_id) ?? []), u.occurrence_date]);
  return m;
}

/** Alle items van de app uit de toestand van de sync-module. */
export function naarItems(t: Pick<Toestand, 'afspraken' | 'taken' | 'boodschappen' | 'uitzonderingen'>): Item[] {
  const u = uitzonderingenPerReeks(t.uitzonderingen ?? []);
  return [
    ...t.afspraken.filter(a => a.start_date || a.inhoudNietBewaard).map(a => naarAfspraak(a, u)),
    ...t.taken.map(naarTaak),
    ...t.boodschappen.map(naarBoodschap),
  ];
}

export function naarHuishouden(t: Pick<Toestand, 'leden' | 'lid'>, naam: string): Huishouden {
  return { naam, leden: naarLeden(t.leden), ik: t.lid?.member_id ?? '' };
}

/** Een afspraak uit het venster als invoer voor save_event (nieuw: zonder versie; bijwerken: met versie). */
export function naarNieuweAfspraak(a: Afspraak, versie: number | null): NieuweAfspraak {
  return {
    id: versie === null ? undefined : a.id,
    version: versie,
    start_date: a.datum,
    start_time: a.start ?? null,
    end_time: a.start ? a.eind ?? null : null,
    visibility: a.zichtbaarheid === 'prive' ? 'private' : 'household',
    title: a.titel ?? '',
    location: a.plek ?? null,
    preparation: a.voorbereiding ?? null,
    participant_ids: a.wie,
    recurrence_freq: a.herhaling ? VAN_FREQ[a.herhaling.freq] : null,
    recurrence_until: a.herhaling?.tot ?? null,
  };
}

/** Velden voor een taak (toevoegen of bijwerken). */
export function naarTaakVelden(t: Taak): { title: string; due_date: string | null; assignee_member_id: string | null } {
  return { title: t.titel, due_date: t.datum, assignee_member_id: t.voor };
}
