// Lokale Supabase-modus: dezelfde acties als de demo-store (store.ts), maar uitgevoerd via de sync-module.
// De schermen merken het verschil niet: ze lezen `staat.items` en roepen dezelfde acties aan.
//
// - Lezen: de items komen uit de toestand van de sync-module (wat RLS teruggeeft).
// - Schrijven: elke actie wordt één opdracht van de sync-module, met versiecontrole bij wijzigen en een
//   vaste opdracht-ID bij toevoegen. Conflicten, onbevestigde opdrachten en fouten meldt de sync-module
//   zelf (toestand.melding); hier komt alleen de "gelukt"-melding bij.
// - Niet in deze modus: "Ongedaan maken" en de demo-scenario's.
import { useCallback, useMemo, useState } from 'react';
import type { BoodschapRij, Resultaat, TaakRij } from '../../../../sync/thuisplanner-sync.js';
import { boodschappenMelding } from '../boodschappen';
import type { Melding, Staat } from '../store';
import type { Afspraak, Datum, Item } from '../types';
import { naarItems, naarNieuweAfspraak, naarTaakVelden } from './omzetten';
import type { Momentopname, Sessie } from './sessie';

/** Een keuze die de gebruiker moet maken (mogelijk dubbele toevoeging, zie de sync-module). */
export interface Keuze {
  tekst: string;
  opnieuw: () => void;
  nieuw: () => void;
}

let meldingTeller = 0;

export function useLokaleStaat(sessie: Sessie, snap: Momentopname, vandaag: Datum) {
  const toestand = snap.toestand;
  const items = useMemo<Item[]>(() => (toestand ? naarItems(toestand) : []), [toestand]);
  const [weggeklikt, zetWeggeklikt] = useState<Set<string>>(new Set());
  const [melding, zetMelding] = useState<Melding | null>(null);
  const [keuze, zetKeuze] = useState<Keuze | null>(null);

  const meld = useCallback((tekst: string) => zetMelding({ id: ++meldingTeller, tekst, ongedaan: false }), []);
  const rij = useCallback(<T extends { id: string }>(lijst: T[] | undefined, id: string) => lijst?.find(x => x.id === id), []);

  // Na een actie: gelukt → onze melding; mogelijk dubbel → een keuze; anders meldt de sync-module het.
  const na = useCallback(async (p: Promise<Resultaat> | undefined, gelukt?: string, herhaal?: (bewustNieuw: boolean) => void) => {
    if (!p) return;
    const r = await p;
    if (r.ok) { if (gelukt) meld(gelukt); return; }
    if (r.mogelijkDubbel && herhaal) {
      const id = r.mogelijkDubbel;
      zetKeuze({
        tekst: r.melding?.tekst ?? 'Dit staat al klaar maar is nog niet bevestigd.',
        opnieuw: () => { zetKeuze(null); void sessie.acties?.opnieuwProberen(id); },
        nieuw: () => { zetKeuze(null); herhaal(true); },
      });
    }
  }, [meld, sessie]);

  const acties = useMemo(() => {
    const a = () => sessie.acties;
    const t = () => sessie.syncObject?.toestand;

    const voegToe = (item: Item, melding?: string, bewustNieuw = false) => {
      if (item.soort === 'afspraak') {
        void na(a()?.afspraakBewaren(naarNieuweAfspraak(item, null), { bewustNieuw }), melding, b => voegToe(item, melding, b));
      } else if (item.soort === 'taak') {
        const v = naarTaakVelden(item);
        void na(a()?.taakToevoegen(v.title, { due_date: v.due_date, assignee_member_id: v.assignee_member_id }, { bewustNieuw }),
          melding, b => voegToe(item, melding, b));
      } else {
        void na(a()?.boodschapToevoegen(item.naam, { bewustNieuw }), melding, b => voegToe(item, melding, b));
      }
    };

    return {
      toevoegen: (nieuw: Item[], melding?: string) => { for (const i of nieuw) voegToe(i, melding); },
      vervangAlles: () => meld('Dat kan in deze versie nog niet.'),
      bijwerken: (item: Item, melding?: string) => {
        const versie = item.versie;
        if (item.soort === 'afspraak') {
          void na(a()?.afspraakBewaren(naarNieuweAfspraak(item, versie ?? 0)), melding);
        } else if (item.soort === 'taak') {
          const r = rij(t()?.taken, item.id);
          if (r) void na(a()?.taakBijwerken(r, naarTaakVelden(item), versie), melding);
        } else {
          const r = rij(t()?.boodschappen, item.id);
          if (r) void na(a()?.boodschapHernoemen(r, item.naam, versie), melding);
        }
      },
      wissel: (id: string, melding?: string) => {
        const taak = rij<TaakRij>(t()?.taken, id);
        if (taak) { void na(a()?.taakAfvinken(taak), melding); return; }
        const b = rij<BoodschapRij>(t()?.boodschappen, id);
        if (b) void na(a()?.boodschapAfvinken(b), melding);
      },
      verwijder: (ids: string[], melding?: string) => {
        void (async () => {
          let alles = true;
          for (const id of ids) {
            const taak = rij(t()?.taken, id);
            const b = rij(t()?.boodschappen, id);
            const af = rij(t()?.afspraken, id);
            const r = taak ? await a()?.taakVerwijderen(taak) : b ? await a()?.boodschapVerwijderen(b)
              : af ? await a()?.afspraakVerwijderen(af) : undefined;
            if (r && !r.ok) alles = false;
          }
          if (alles && melding) meld(melding);
        })();
      },
      voegBoodschappenToe: (namen: string[]) => {
        void (async () => {
          const uitkomst = { nieuw: [] as string[], alOpLijst: [] as string[], terug: [] as string[] };
          for (const naam of namen) {
            const r = await a()?.boodschapToevoegen(naam);
            if (!r) continue;
            if (!r.ok) { if (r.mogelijkDubbel) void na(Promise.resolve(r), undefined, () => void a()?.boodschapToevoegen(naam, { bewustNieuw: true })); continue; }
            const rijen = (r.data as { name: string; outcome: string }[] | undefined) ?? [];
            for (const x of rijen) {
              if (x.outcome === 'terug') uitkomst.terug.push(x.name);
              else if (x.outcome === 'al_op_lijst') uitkomst.alOpLijst.push(x.name);
              else uitkomst.nieuw.push(x.name);
            }
          }
          if (uitkomst.nieuw.length + uitkomst.alOpLijst.length + uitkomst.terug.length) meld(boodschappenMelding(uitkomst));
        })();
      },
      wijzigVoorkomen: (reeksId: string, datum: Datum, afspraak: Afspraak, melding?: string) => {
        const n = naarNieuweAfspraak(afspraak, null);
        void na(a()?.afspraakVoorkomenWijzigen(reeksId, datum, { ...n, id: undefined }), melding);
      },
      verwijderVoorkomen: (reeksId: string, datum: Datum, melding?: string) => {
        void na(a()?.afspraakVoorkomenVerwijderen(reeksId, datum), melding);
      },
      verwijderReeks: (reeksId: string, melding?: string) => {
        const r = rij(t()?.afspraken, reeksId);
        if (r) void na(a()?.afspraakVerwijderen(r), melding);
      },
      ongedaan: () => {},
      wegklikken: (id: string) => zetWeggeklikt(w => new Set([...w, id])),
      meld,
      meldingWeg: (id: number) => zetMelding(m => (m?.id === id ? null : m)),
      kiesScenario: () => {},
      opnieuwProberen: (id: string) => { void na(a()?.opnieuwProberen(id), 'Opnieuw verstuurd'); },
      vergeten: (id: string) => { if (sessie.syncObject?.vergeten(id)) meld('Van dit toestel gehaald'); },
      syncMeldingWeg: () => a()?.meldingWeg(),
    };
  }, [sessie, na, meld, rij]);

  const staat: Staat = { scenario: 'gewoon', items, weggeklikt, vorige: null, melding };
  void vandaag;
  return { staat, ...acties, keuze, sluitKeuze: () => zetKeuze(null) };
}

export type LokaleActies = Omit<ReturnType<typeof useLokaleStaat>, 'staat'>;
