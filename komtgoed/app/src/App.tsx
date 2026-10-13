import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { huishouden } from './data/demo';
import { naarDatum, naarTijd } from './lib/datum';
import { Ctx, type AgendaStand, type AppContext, type LokaalContext, type Scherm } from './lib/context';
import { useDemoStaat, type DemoActies, type Staat } from './lib/store';
import type { Huishouden } from './lib/types';
import { lokaleConfig, sessieVoor, useSessie, type LokaleConfig, type Momentopname, type Sessie } from './lib/lokaal/sessie';
import { useLokaleStaat } from './lib/lokaal/staat';
import { naarHuishouden } from './lib/lokaal/omzetten';
import { Navigatie } from './components/Navigatie';
import { ItemVenster, type VensterOpdracht } from './components/ItemVenster';
import { DemoBalk } from './components/DemoBalk';
import { Inloggen, KeuzeVenster, LokaleBalk } from './components/Lokaal';
import { Vandaag } from './screens/Vandaag';
import { Agenda } from './screens/Agenda';
import { Boodschappen } from './screens/Boodschappen';
import { Meer } from './screens/Meer';

const SCHERMEN: Scherm[] = ['vandaag', 'agenda', 'boodschappen', 'meer'];
const TITELS: Record<Scherm, string> = { vandaag: 'Vandaag', agenda: 'Agenda', boodschappen: 'Boodschappen', meer: 'Meer' };

function schermUitHash(): Scherm {
  const h = window.location.hash.replace('#/', '').replace('#', '') as Scherm;
  return SCHERMEN.includes(h) ? h : 'vandaag';
}

/**
 * Demo-klok. Met ?nu=2026-10-10T11:20 in de adresbalk zet je de tijd vast (voor tests en screenshots).
 * Zonder parameter loopt de echte klok.
 */
function useKlok(): Date {
  const vast = useMemo(() => {
    const p = new URLSearchParams(window.location.search).get('nu');
    const d = p ? new Date(p) : null;
    return d && !Number.isNaN(d.getTime()) ? d : null;
  }, []);
  const [nu, zetNu] = useState(() => vast ?? new Date());
  useEffect(() => {
    if (vast) return;
    const t = window.setInterval(() => zetNu(new Date()), 30_000);
    return () => window.clearInterval(t);
  }, [vast]);
  return nu;
}

/**
 * Twee modi met dezelfde schermen:
 * - demo (standaard): alles in het geheugen van dit tabblad, fictieve gegevens uit data/demo.ts;
 * - lokaal: een lokale Supabase met fictieve accounts (zie scripts/lokaal.mjs en docs/thuisplanner-app.md).
 * De modus volgt uit de bouwomgeving (VITE_SUPABASE_URL en VITE_SUPABASE_ANON_KEY). Een niet-lokaal adres
 * wordt geweigerd, nooit stil vervangen door de demo.
 */
export function App() {
  const keuze = useMemo(() => {
    try { return { config: lokaleConfig(), fout: null }; } catch (e) { return { config: null, fout: (e as Error).message }; }
  }, []);
  if (keuze.fout) return <div className="schil"><main className="hoofd"><div className="scherm"><p role="alert">{keuze.fout}</p></div></main></div>;
  if (keuze.config) return <LokaleApp config={keuze.config} />;
  return <DemoApp />;
}

function DemoApp() {
  const klok = useKlok();
  const vandaag = naarDatum(klok);
  const demo = useDemoStaat(vandaag);
  return <Schil klok={klok} data={demo} huishouden={huishouden} balk={<DemoBalk />} titelSoort="demo" />;
}

function LokaleApp({ config }: { config: LokaleConfig }) {
  // Eén sessie per pagina, buiten React: unmount of StrictMode stopt de synchronisatie niet.
  const sessie = sessieVoor(config);
  const snap = useSessie(sessie);
  useEffect(() => { void sessie.herstel(); }, [sessie]);
  if (snap.fase !== 'actief' || !snap.toestand || !snap.huishouden) return <Inloggen sessie={sessie} snap={snap} />;
  return <IngelogdeApp sessie={sessie} snap={snap} />;
}

function IngelogdeApp({ sessie, snap }: { sessie: Sessie; snap: Momentopname }) {
  const klok = useKlok();
  const vandaag = naarDatum(klok);
  const { keuze, sluitKeuze, opnieuwProberen, vergeten, herinvoeren, syncMeldingWeg, ...data } = useLokaleStaat(sessie, snap, vandaag);
  const t = snap.toestand!;
  const hh = useMemo(() => naarHuishouden(t, snap.huishouden!.naam), [t, snap.huishouden]);
  const lokaal: LokaalContext = {
    account: snap.account?.email ?? '',
    status: t.status,
    opslagDuurzaam: t.opslagDuurzaam,
    syncMelding: t.melding,
    syncMeldingWeg,
    openstaand: sessie.syncObject?.openstaand ?? [],
    opnieuwProberen,
    vergeten,
    herinvoeren,
    uitloggen: () => { void sessie.uitloggen(); },
  };
  return (
    <Schil klok={klok} data={data} huishouden={hh} lokaal={lokaal} balk={<LokaleBalk />} titelSoort="lokaal">
      {keuze && <KeuzeVenster keuze={keuze} sluit={sluitKeuze} />}
    </Schil>
  );
}

function Schil({ klok, data, huishouden: hh, balk, lokaal, titelSoort, children }: {
  klok: Date; data: DemoActies & { staat: Staat }; huishouden: Huishouden; balk: ReactNode;
  lokaal?: LokaalContext; titelSoort: string; children?: ReactNode;
}) {
  const vandaag = naarDatum(klok);
  const [scherm, zetScherm] = useState<Scherm>(schermUitHash);
  const [venster, zetVenster] = useState<VensterOpdracht | null>(null);
  const [agenda, zetAgendaStand] = useState<AgendaStand>({ weergave: 'week', datum: vandaag, filter: null });
  const zetAgenda = useCallback((s: Partial<AgendaStand>) => zetAgendaStand(a => ({ ...a, ...s })), []);
  const hoofd = useRef<HTMLElement>(null);

  useEffect(() => {
    const opHash = () => zetScherm(schermUitHash());
    window.addEventListener('hashchange', opHash);
    return () => window.removeEventListener('hashchange', opHash);
  }, []);

  useEffect(() => { document.title = `${TITELS[scherm]} · KomtGoed (${titelSoort})`; }, [scherm, titelSoort]);

  const gaNaar = useCallback((s: Scherm) => {
    if (window.location.hash !== `#/${s}`) window.location.hash = `#/${s}`;
    zetScherm(s);
    window.scrollTo({ top: 0 });
    hoofd.current?.focus({ preventScroll: true });
  }, []);

  // De melding staat in de staat (zie store.ts); hier verdwijnt hij vanzelf na een paar seconden.
  const melding = data.staat.melding;
  const { meldingWeg } = data;
  useEffect(() => {
    if (!melding) return;
    const t = window.setTimeout(() => meldingWeg(melding.id), melding.ongedaan ? 6000 : 3500);
    return () => window.clearTimeout(t);
  }, [melding, meldingWeg]);

  const sluitVenster = useCallback(() => zetVenster(null), []);

  const ctx: AppContext = {
    ...data,
    huishouden: hh,
    vandaag,
    nu: naarTijd(klok),
    uur: klok.getHours(),
    lid: id => hh.leden.find(l => l.id === id),
    openToevoegen: (soort, datum) => zetVenster({ type: 'nieuw', soort: soort ?? 'afspraak', datum }),
    openItem: id => zetVenster({ type: 'bewerk', id }),
    gaNaar,
    agenda,
    zetAgenda,
    lokaal,
  };

  return (
    <Ctx.Provider value={ctx}>
      <div className="schil">
        {balk}
        <Navigatie actief={scherm} />
        <main ref={hoofd} tabIndex={-1} className="hoofd" aria-label={TITELS[scherm]}>
          {scherm === 'vandaag' && <Vandaag />}
          {scherm === 'agenda' && <Agenda />}
          {scherm === 'boodschappen' && <Boodschappen />}
          {scherm === 'meer' && <Meer />}
        </main>
        {venster && <ItemVenster opdracht={venster} sluit={sluitVenster} />}
        {children}
        <div className="melding-plek" aria-live="polite">
          {melding && (
            <div className="melding" key={melding.id} role="status">
              <span>{melding.tekst}</span>
              {melding.ongedaan && (
                <button className="melding-knop" onClick={data.ongedaan}>
                  Ongedaan maken
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </Ctx.Provider>
  );
}
