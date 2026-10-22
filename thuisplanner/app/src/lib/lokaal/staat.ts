// Lokale Supabase-modus: dezelfde acties als de demo-store (store.ts), maar uitgevoerd via de sync-module.
// De schermen merken het verschil niet: ze lezen `staat.items` en roepen dezelfde acties aan.
//
// - Lezen: de items komen uit de toestand van de sync-module (wat RLS teruggeeft).
// - Schrijven: elke actie wordt één opdracht van de sync-module, met versiecontrole bij wijzigen en een
//   vaste opdracht-ID bij toevoegen. Conflicten, onbevestigde opdrachten en fouten meldt de sync-module
//   zelf (toestand.melding); hier komt alleen de "gelukt"-melding bij.
// - Niet in deze modus: de demo-scenario's. "Ongedaan maken" alleen bij vakanties (verwijderen, overnemen, vinkjes opnieuw,
//   ontkoppelen): de sync-module geeft daarvoor terug wat nodig is (versie, ID's, vorige vinkjes).
import { useCallback, useMemo, useRef, useState } from 'react';
import type { BoodschapRij, PakitemRij, Resultaat, TaakRij, VakantieKoppelingRij, VakantieRij } from '../../../../sync/thuisplanner-sync.js';
import { boodschappenMelding } from '../boodschappen';
import type { Groep, Melding, Staat } from '../store';
import type { Afspraak, Boodschap, Datum, Huishouden, Item, LidId, Pakitem, Vakantie, VakantieKoppeling } from '../types';
import { groepNaam } from '../vakantie';
import { naarItems, naarNieuweAfspraak, naarTaakVelden, naarVakantieGegevens } from './omzetten';
import type { Momentopname, Sessie } from './sessie';

/** Een keuze die de gebruiker moet maken (mogelijk dubbele toevoeging, zie de sync-module). */
export interface Keuze {
  tekst: string;
  opnieuw: () => void;
  nieuw: () => void;
}

let meldingTeller = 0;

export function useLokaleStaat(sessie: Sessie, snap: Momentopname, vandaag: Datum, huishouden?: Huishouden) {
  const toestand = snap.toestand;
  const items = useMemo<Item[]>(() => (toestand ? naarItems(toestand) : []), [toestand]);
  const vak = useMemo(() => (toestand ? naarVakantieGegevens(toestand) : { vakanties: [], pakitems: [], koppelingen: [] }), [toestand]);
  // Wat "Ongedaan maken" bij de huidige melding terugdraait (alleen vakantiehandelingen).
  const terug = useRef<(() => void) | null>(null);
  const hhRef = useRef(huishouden);
  hhRef.current = huishouden;
  const [weggeklikt, zetWeggeklikt] = useState<Set<string>>(new Set());
  const [melding, zetMelding] = useState<Melding | null>(null);
  const [keuze, zetKeuze] = useState<Keuze | null>(null);
  // Afvinken legt de dag vast die de app als "vandaag" toont (ook met de testklok ?nu=), niet de UTC-datum.
  // Via een ref, zodat de acties niet bij elke dagwissel opnieuw worden gemaakt.
  const vandaagRef = useRef(vandaag);
  vandaagRef.current = vandaag;

  const meld = useCallback((tekst: string) => { terug.current = null; zetMelding({ id: ++meldingTeller, tekst, ongedaan: false }); }, []);
  const meldMetTerug = useCallback((tekst: string, f: () => void) => { terug.current = f; zetMelding({ id: ++meldingTeller, tekst, ongedaan: true }); }, []);
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
    const hh = (): Huishouden => hhRef.current ?? { naam: '', ik: '', leden: [] };

    const voegToe = (item: Item, melding?: string, bewustNieuw = false) => {
      if (item.soort === 'afspraak') {
        void na(a()?.afspraakBewaren(naarNieuweAfspraak(item, null), { bewustNieuw }), melding, b => voegToe(item, melding, b));
      } else if (item.soort === 'taak') {
        const { title, ...velden } = naarTaakVelden(item);
        void na(a()?.taakToevoegen(title, velden, { bewustNieuw }), melding, b => voegToe(item, melding, b));
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
        if (taak) { void na(a()?.taakAfvinken(taak, vandaagRef.current), melding); return; }
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
      voegBoodschappenToe: (namen: string[], vakantieId?: string) => {
        void (async () => {
          const uitkomst = { nieuw: [] as string[], alOpLijst: [] as string[], terug: [] as string[], naarNu: [] as string[] };
          // Vanuit een vakantie standaard bij "Later nodig" (de sync-module geeft p_later mee; zelfde regels als de demo).
          const opties = vakantieId ? { vakantie: vakantieId } : undefined;
          for (const naam of namen) {
            // Stond hij bij "Later nodig" en voeg je hem op de gewone lijst toe, dan zet de server hem op "Nu te kopen".
            const wasLater = !vakantieId && !!t()?.boodschappen.some(b => b.deferred && !b.checked_at && b.name?.trim().toLocaleLowerCase('nl') === naam.trim().toLocaleLowerCase('nl'));
            const r = await a()?.boodschapToevoegen(naam, opties);
            if (!r) continue;
            if (!r.ok) { if (r.mogelijkDubbel) void na(Promise.resolve(r), undefined, () => void a()?.boodschapToevoegen(naam, { ...opties, bewustNieuw: true })); continue; }
            const rijen = (r.data as { name: string; outcome: string }[] | undefined) ?? [];
            for (const x of rijen) {
              if (x.outcome === 'terug') uitkomst.terug.push(x.name);
              else if (x.outcome === 'al_op_lijst') (wasLater ? uitkomst.naarNu : uitkomst.alOpLijst).push(x.name);
              else uitkomst.nieuw.push(x.name);
            }
          }
          if (uitkomst.nieuw.length + uitkomst.alOpLijst.length + uitkomst.terug.length + uitkomst.naarNu.length) meld(boodschappenMelding(uitkomst, !!vakantieId));
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
      ongedaan: () => { const f = terug.current; terug.current = null; zetMelding(null); f?.(); },
      wegklikken: (id: string) => zetWeggeklikt(w => new Set([...w, id])),
      meld,
      meldingWeg: (id: number) => zetMelding(m => (m?.id === id ? null : m)),
      kiesScenario: () => {},
      opnieuwProberen: (id: string) => { void na(a()?.opnieuwProberen(id), 'Opnieuw verstuurd'); },
      // Zelfde opdracht-ID als de oorspronkelijke toevoeging (P1: de inhoud stond niet op dit toestel): de sync-module
      // zet de inhoud op die opdracht en verstuurt hem opnieuw. Staat hij intussen al op de server, dan blijft het bij
      // die ene afspraak, taak of boodschap.
      herinvoeren: (id: string, item: Item, melding?: string) => {
        if (item.soort === 'afspraak') {
          void na(a()?.opnieuwInvoeren(id, { soort: 'afspraak', afspraak: { ...naarNieuweAfspraak(item, null), id } }), melding);
        } else if (item.soort === 'taak') {
          const { title, ...velden } = naarTaakVelden(item);
          void na(a()?.opnieuwInvoeren(id, { soort: 'taak', titel: title, velden }), melding);
        } else {
          void na(a()?.opnieuwInvoeren(id, { soort: 'boodschap', naam: item.naam }), melding);
        }
      },
      vergeten: (id: string) => { if (sessie.syncObject?.vergeten(id)) meld('Van dit toestel gehaald'); },
      syncMeldingWeg: () => a()?.meldingWeg(),

      // ---- Vakanties (F8): de acties van de sync-module (docs/thuisplanner-vakanties.md §14) ----
      vakantieToevoegen: async (v: Omit<Vakantie, 'id'>): Promise<string | null> => {
        const r = await a()?.vakantieToevoegen({ name: v.naam, start_date: v.vertrek, end_date: v.terug, destination: v.bestemming ?? null, notes: v.notities ?? null });
        if (!r) return null;
        if (r.ok) meld(`${v.naam} toegevoegd`);
        // Ook onzeker: de vakantie staat (niet bevestigd) in de lijst, onder deze UUID.
        return r.ok || r.onzeker ? r.id ?? null : null;
      },
      vakantieBijwerken: (v: Vakantie, melding?: string) => {
        const r = rij<VakantieRij>(t()?.vakanties, v.id);
        if (r) void na(a()?.vakantieBijwerken(r, { name: v.naam, start_date: v.vertrek, end_date: v.terug,
          destination: v.bestemming ?? null, notes: v.notities ?? null }, v.versie), melding);
      },
      vakantieVerwijderen: (v: Vakantie) => {
        const r = rij<VakantieRij>(t()?.vakanties, v.id);
        if (!r) return;
        void (async () => {
          const u = await a()?.vakantieVerwijderen(r);
          const versie = (u?.data as { version: number }[] | undefined)?.[0]?.version;
          if (u?.ok && versie != null) meldMetTerug(`${v.naam} verwijderd`, () => { void na(a()?.vakantieHerstellen(r, versie), `${v.naam} teruggezet`); });
        })();
      },
      pakitemToevoegen: (vakantieId: string, lid: LidId | null, naam: string) => {
        void (async () => {
          const schoon = naam.trim().replace(/\s+/g, ' ');
          const r = await a()?.pakitemToevoegen(vakantieId, lid, schoon);
          if (r && !r.ok && r.melding?.soort === 'dubbel') { a()?.meldingWeg(); meld(`Staat al op de lijst van ${groepNaam(hh(), lid)}`); }
          else if (r && !r.ok && r.mogelijkDubbel) void na(Promise.resolve(r), undefined, () => void a()?.pakitemToevoegen(vakantieId, lid, schoon, { bewustNieuw: true }));
        })();
      },
      pakitemWissel: (p: Pakitem) => {
        const r = rij<PakitemRij>(t()?.pakitems, p.id);
        if (r) void na(a()?.pakitemAfvinken(r));
      },
      pakitemBijwerken: (p: Pakitem, w: { naam?: string; lid?: LidId | null }) => {
        const r = rij<PakitemRij>(t()?.pakitems, p.id);
        if (!r) return;
        void (async () => {
          const naam = w.naam !== undefined ? w.naam.trim().replace(/\s+/g, ' ') : undefined;
          const u = await a()?.pakitemBijwerken(r, { ...(naam !== undefined ? { name: naam } : {}), ...(w.lid !== undefined ? { member_id: w.lid } : {}) }, p.versie);
          const doel = w.lid !== undefined ? w.lid : p.lid;
          if (u?.ok) meld(w.lid !== undefined && w.lid !== p.lid ? `${naam ?? p.naam} staat nu bij ${groepNaam(hh(), doel)}` : `${naam ?? p.naam} aangepast`);
          else if (u?.melding?.soort === 'dubbel') { a()?.meldingWeg(); meld(`Staat al op de lijst van ${groepNaam(hh(), doel)}`); }
        })();
      },
      pakitemVerwijderen: (p: Pakitem) => {
        const r = rij<PakitemRij>(t()?.pakitems, p.id);
        if (!r) return;
        void (async () => {
          const u = await a()?.pakitemVerwijderen(r);
          const versie = (u?.data as { version: number }[] | undefined)?.[0]?.version;
          if (u?.ok && versie != null) meldMetTerug(`${p.naam} verwijderd`, () => {
            void (async () => {
              const h = await a()?.pakitemHerstellen(r, versie);
              // U1: intussen staat er al een gelijk item.
              if (h && !h.ok && h.melding?.soort === 'dubbel') { a()?.meldingWeg(); meld(`Staat al op de lijst van ${groepNaam(hh(), p.lid)}`); }
              else if (h?.ok) meld(`${p.naam} teruggezet`);
            })();
          });
        })();
      },
      paklijstOvernemen: (van: string, naar: string, groep: Groep) => {
        void (async () => {
          const o = { van, naar, lid: groep === 'iedereen' || groep === null ? null : groep, gezamenlijk: groep === null };
          let r = await a()?.paklijstOvernemen(o);
          // Onzeker (antwoord verloren): één keer dezelfde opdracht opnieuw; die geeft dezelfde items (U2).
          if (r && !r.ok && r.melding?.soort === 'onzeker') r = await a()?.paklijstOvernemen({ ...o, opdracht: r.opdracht });
          if (!r?.ok) return;
          const ids = (r.items ?? []).map(x => x.id);
          if (!ids.length) { meld('Alles stond er al'); return; }
          meldMetTerug(`${ids.length} ${ids.length === 1 ? 'item' : 'items'} overgenomen`, () => {
            void (async () => {
              const u = await a()?.overnemenOngedaanMaken(ids);
              if (u?.ok && !u.gebleven) meld('Teruggezet');
            })();
          });
        })();
      },
      vinkjesOpnieuw: (vakantieId: string, groep: Groep) => {
        void (async () => {
          const r = await a()?.vinkjesOpnieuw(vakantieId, groep);
          if (!r?.ok) return;
          const lijst = r.terug ?? [];
          if (!lijst.length) { meld('Er stond nog niets afgevinkt'); return; }
          meldMetTerug(`${lijst.length} ${lijst.length === 1 ? 'vinkje' : 'vinkjes'} weggehaald`, () => {
            void (async () => { const u = await a()?.vinkjesTerugzetten(vakantieId, lijst); if (u?.ok && !u.overgeslagen) meld('Teruggezet'); })();
          });
        })();
      },
      boodschapOntkoppelen: (k: VakantieKoppeling, naam: string) => {
        const r = rij<VakantieKoppelingRij>(t()?.vakantieKoppelingen, k.id);
        if (!r) return;
        void (async () => {
          const u = await a()?.boodschapOntkoppelen(r);
          const versie = (u?.data as { version: number }[] | undefined)?.[0]?.version;
          if (u?.ok && versie != null) meldMetTerug(`${naam} niet meer voor deze vakantie`, () => { void na(a()?.boodschapKoppelingHerstellen(r, versie), 'Teruggezet'); });
        })();
      },
      // Tussen "Nu te kopen" en "Later nodig": dezelfde boodschap; ongedaan maken zet hem terug (met de nieuwe versie).
      boodschapLater: (b: Boodschap, later: boolean) => {
        const r = rij<BoodschapRij>(t()?.boodschappen, b.id);
        if (!r) return;
        void (async () => {
          const u = await a()?.boodschapLater(r, later);
          const versie = (u?.data as { version: number }[] | undefined)?.[0]?.version;
          if (u?.ok && versie != null) {
            meldMetTerug(later ? `${b.naam} bij Later nodig` : `${b.naam} nu te kopen`,
              () => { void na(a()?.boodschapLater({ ...r, deferred: later }, !later, versie), 'Teruggezet'); });
          }
        })();
      },
      vakantieOpenen: (id: string) => { void a()?.vakantieOpenen(id); },
      vakantieSluiten: (id: string) => { a()?.vakantieSluiten(id); },
    };
  }, [sessie, na, meld, meldMetTerug, rij]);

  const staat: Staat = { scenario: 'gewoon', items, ...vak, weggeklikt, vorige: null, melding };
  return { staat, ...acties, keuze, sluitKeuze: () => zetKeuze(null) };
}

export type LokaleActies = Omit<ReturnType<typeof useLokaleStaat>, 'staat'>;
