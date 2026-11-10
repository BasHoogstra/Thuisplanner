import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { huishouden } from './data/demo';
import { naarDatum, naarTijd } from './lib/datum';
import { Ctx, type AgendaStand, type AppContext, type LokaalContext, type Scherm } from './lib/context';
import { useDemoStaat, type DemoActies, type Staat } from './lib/store';
import type { Huishouden } from './lib/types';
import { appConfig, sessieVoor, useSessie, type LokaleConfig, type Momentopname, type Sessie, type UitnodigingVoorMij } from './lib/lokaal/sessie';
import { useLokaleStaat } from './lib/lokaal/staat';
import { naarHuishouden } from './lib/lokaal/omzetten';
import { Navigatie } from './components/Navigatie';
import { Foutgrens } from './components/Foutgrens';
import { ItemVenster, type VensterOpdracht } from './components/ItemVenster';
import { DemoBalk } from './components/DemoBalk';
import { Inloggen, KeuzeVenster, LokaleBalk, Wachten } from './components/Lokaal';
import { EvenGeduld, UitnodigingAccepteren, Welkom } from './components/Onboarding';
import { leesUitnodiging, vangUitnodiging, vergeetUitnodiging } from './lib/uitnodiging';
import { Vandaag } from './screens/Vandaag';
import { Agenda } from './screens/Agenda';
import { Boodschappen } from './screens/Boodschappen';
import { Meer } from './screens/Meer';
import { Vakanties } from './screens/Vakanties';
import { Spullen } from './screens/Spullen';
import { SpullenCtx, useDemoSpullen } from './lib/spullen/opslag';
import { SpullenLaag, useSpullenInvoer } from './components/SpullenVensters';
import { useSupabaseSpullen } from './lib/spullen/opslag-supabase';
import type { Toestand } from '../../sync/thuisplanner-sync.js';

const SCHERMEN: Scherm[] = ['vandaag', 'agenda', 'boodschappen', 'meer', 'vakanties', 'spullen'];
const TITELS: Record<Scherm, string> = { vandaag: 'Vandaag', agenda: 'Agenda', boodschappen: 'Boodschappen', meer: 'Meer', vakanties: 'Vakanties', spullen: 'Spullen & documenten' };

/** "#/agenda" → agenda; "#/vakanties/<id>" → vakanties met die vakantie open (F8); "#/spullen/<pad>" → Spullen & documenten. */
function uitHash(): { scherm: Scherm; vakantie: string | null; spullen: string } {
  const [h, id, ...rest] = window.location.hash.replace('#/', '').replace('#', '').split('/') as [Scherm, string | undefined, ...string[]];
  if (!SCHERMEN.includes(h)) return { scherm: 'vandaag', vakantie: null, spullen: '' };
  return { scherm: h, vakantie: h === 'vakanties' && id ? decodeURIComponent(id) : null, spullen: h === 'spullen' ? [id, ...rest].filter(Boolean).join('/') : '' };
}
function schermUitHash(): Scherm { return uitHash().scherm; }

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
 * De modus volgt uit de bouwomgeving (VITE_SUPABASE_URL en VITE_SUPABASE_ANON_KEY; staging alleen met
 * VITE_OMGEVING=staging, zie lib/omgeving.ts). Een niet-toegestaan adres wordt geweigerd, nooit stil vervangen door de demo.
 */
export function App() {
  const keuze = useMemo(() => {
    try { return { config: appConfig(), fout: null }; } catch (e) { return { config: null, fout: (e as Error).message }; }
  }, []);
  if (keuze.fout) return <div className="schil"><main className="hoofd"><div className="scherm"><p role="alert">{keuze.fout}</p></div></main></div>;
  if (keuze.config) return <LokaleApp config={keuze.config} />;
  return <DemoApp />;
}

function DemoApp() {
  const klok = useKlok();
  const vandaag = naarDatum(klok);
  const demo = useDemoStaat(vandaag);
  // Mijn spullen & Documenten: alleen in de demo. Het echte pad volgt na de migratie, met een eigen akkoord.
  // Een spul dat persoonlijk wordt, verliest zijn taken (zoals online): de taken blijven, zonder koppeling.
  const items = useRef(demo.staat.items);
  items.current = demo.staat.items;
  const { bijwerken } = demo;
  const takenLos = useCallback((spulId: string) => {
    for (const t of items.current) if (t.soort === 'taak' && t.spulId === spulId) bijwerken({ ...t, spulId: null });
  }, [bijwerken]);
  const opslag = useDemoSpullen(vandaag, huishouden.ik, demo.meld, takenLos);
  const { invoer, startInvoer, sluitInvoer } = useSpullenInvoer();
  const spullen = useMemo(() => ({ ...opslag, startInvoer }), [opslag, startInvoer]);
  return (
    <SpullenCtx.Provider value={spullen}>
      <Schil klok={klok} data={demo} huishouden={huishouden} balk={<DemoBalk />} titelSoort="demo">
        <SpullenLaag invoer={invoer} sluit={sluitInvoer} />
      </Schil>
    </SpullenCtx.Provider>
  );
}

function LokaleApp({ config }: { config: LokaleConfig }) {
  // Eén sessie per pagina, buiten React: unmount of StrictMode stopt de synchronisatie niet.
  const sessie = sessieVoor(config);
  const snap = useSessie(sessie);
  useEffect(() => { void sessie.herstel(); }, [sessie]);
  // Een uitnodiging uit de link (zie lib/uitnodiging.ts): bij het openen al uit de adresbalk gehaald; ook als de link
  // wordt geopend terwijl de app al draait.
  const [uitnodiging, zetUitnodiging] = useState<string | null>(() => leesUitnodiging());
  useEffect(() => {
    const opHash = () => { const t = vangUitnodiging(); if (t) zetUitnodiging(t); };
    window.addEventListener('hashchange', opHash);
    return () => window.removeEventListener('hashchange', opHash);
  }, []);
  const sluitUitnodiging = useCallback(() => { vergeetUitnodiging(); zetUitnodiging(null); }, []);
  // Een uitnodiging uit "Uitnodigingen voor jou" die je bekijkt (het hele object: na accepteren staat hij niet meer in de lijst).
  const [bekijk, zetBekijk] = useState<UitnodigingVoorMij | null>(null);
  // "Later" op Vandaag: de melding blijft weg tot de app opnieuw opent; de lijst in Meer blijft.
  const [later, zetLater] = useState<ReadonlySet<string>>(() => new Set());
  // Terug in de app (ander tabblad, telefoon weer aan): is er intussen een uitnodiging bijgekomen of vervallen?
  useEffect(() => {
    const opZicht = () => { if (document.visibilityState === 'visible') { void sessie.opnieuwVerbinden(); void sessie.verversUitnodigingen(); } };
    // Netwerk terug: direct opnieuw proberen (nooit uitloggen door een netwerkstoring; zie Sessie.wachtOpVerbinding).
    const opOnline = () => { void sessie.opnieuwVerbinden(); };
    document.addEventListener('visibilitychange', opZicht);
    window.addEventListener('online', opOnline);
    return () => { document.removeEventListener('visibilitychange', opZicht); window.removeEventListener('online', opOnline); };
  }, [sessie]);

  if (snap.fase === 'verbinding' || snap.fase === 'onderhoud') return <Wachten sessie={sessie} snap={snap} />;

  if (!snap.account) return <Inloggen sessie={sessie} snap={snap} uitnodiging={uitnodiging !== null} />;
  // Ingelogd met een uitnodiging: eerst die (ook als je al in een ander huishouden zit). Accepteren gebeurt nooit vanzelf.
  if (uitnodiging) return <UitnodigingAccepteren sessie={sessie} snap={snap} bron={{ soort: 'link', token: uitnodiging }} sluit={sluitUitnodiging} />;
  if (bekijk) return <UitnodigingAccepteren key={bekijk.id} sessie={sessie} snap={snap} bron={{ soort: 'lijst', u: bekijk }} sluit={() => zetBekijk(null)} />;
  if (snap.fase === 'geen-huishouden') return <Welkom sessie={sessie} snap={snap} opUitnodiging={zetUitnodiging} opBekijk={zetBekijk} />;
  if (snap.fase !== 'actief' || !snap.toestand || !snap.huishouden) return <EvenGeduld sessie={sessie} />;
  const uitnodigingen: LokaalContext['uitnodigingen'] = {
    lijst: snap.uitnodigingen,
    melding: snap.uitnodigingen.filter(u => !later.has(u.id)),
    bekijk: zetBekijk,
    later: () => zetLater(new Set([...later, ...snap.uitnodigingen.map(u => u.id)])),
  };
  return <IngelogdeApp sessie={sessie} snap={snap} uitnodigingen={uitnodigingen} />;
}

function IngelogdeApp({ sessie, snap, uitnodigingen }: { sessie: Sessie; snap: Momentopname; uitnodigingen: LokaalContext['uitnodigingen'] }) {
  const klok = useKlok();
  const vandaag = naarDatum(klok);
  const t = snap.toestand!;
  const hh = useMemo(() => naarHuishouden(t, snap.huishouden!.naam), [t, snap.huishouden]);
  const { keuze, sluitKeuze, opnieuwProberen, vergeten, herinvoeren, syncMeldingWeg, ...data } = useLokaleStaat(sessie, snap, vandaag, hh);
  const lokaal: LokaalContext = {
    omgeving: sessie.config.omgeving,
    beheer: {
      client: sessie.client,
      huishouden: snap.huishouden!,
      huishoudens: snap.huishoudens,
      leden: t.leden,
      kies: (id: string) => { void sessie.kiesHuishouden(id); },
    },
    uitnodigingen,
    account: snap.account?.email ?? '',
    accountBeheer: {
      uitloggenOveral: (o?: { wissen?: boolean }) => sessie.uitloggenOveral(o),
      wijzigAdres: (n: string) => sessie.wijzigAdres(n),
      bevestigAdres: (e: string, c: string, t?: string | null) => sessie.bevestigAdres(e, c, t),
      wijziging: snap.adreswijziging,
      captchaSitekey: sessie.config.turnstile ?? null,
    },
    status: t.status,
    opslagDuurzaam: t.opslagDuurzaam,
    syncMelding: t.melding,
    syncMeldingWeg,
    openstaand: sessie.syncObject?.openstaand ?? [],
    opnieuwProberen,
    vergeten,
    herinvoeren,
    onbevestigdOpToestel: () => sessie.onbevestigdAantal(),
    nakijken: () => sessie.nakijken(),
    uitloggen: (o?: { wissen?: boolean }) => { void sessie.uitloggen(o); },
  };
  const schil = (extra?: ReactNode) => (
    <Schil klok={klok} data={data} huishouden={hh} lokaal={lokaal} balk={<LokaleBalk />} titelSoort={sessie.config.omgeving === 'staging' ? 'testomgeving' : 'lokaal'}>
      {keuze && <KeuzeVenster keuze={keuze} sluit={sluitKeuze} />}
      {extra}
    </Schil>
  );
  // Mijn spullen & Documenten alleen met VITE_SPULLEN=aan (en migratie 29): anders precies de app van daarvoor.
  if (!sessie.config.spullen) return schil();
  return <EchteSpullen sessie={sessie} toestand={t} meld={data.meld}>{schil}</EchteSpullen>;
}

/** De echte spullen-opslag als context, met de invoerlaag (dezelfde schermen als de demo). */
function EchteSpullen({ sessie, toestand, meld, children }: { sessie: Sessie; toestand: Toestand; meld: (tekst: string) => void;
  children: (extra: ReactNode) => ReactNode }) {
  const opslag = useSupabaseSpullen(sessie, toestand, meld);
  const { invoer, startInvoer, sluitInvoer } = useSpullenInvoer();
  const spullen = useMemo(() => ({ ...opslag, startInvoer }), [opslag, startInvoer]);
  return <SpullenCtx.Provider value={spullen}>{children(<SpullenLaag invoer={invoer} sluit={sluitInvoer} />)}</SpullenCtx.Provider>;
}

function Schil({ klok, data, huishouden: hh, balk, lokaal, titelSoort, children }: {
  klok: Date; data: DemoActies & { staat: Staat }; huishouden: Huishouden; balk: ReactNode;
  lokaal?: LokaalContext; titelSoort: string; children?: ReactNode;
}) {
  const vandaag = naarDatum(klok);
  const [scherm, zetScherm] = useState<Scherm>(schermUitHash);
  const [vakantie, zetVakantie] = useState<string | null>(() => uitHash().vakantie);
  const [spullenPad, zetSpullenPad] = useState<string>(() => uitHash().spullen);
  const [venster, zetVenster] = useState<VensterOpdracht | null>(null);
  const [agenda, zetAgendaStand] = useState<AgendaStand>({ weergave: 'week', datum: vandaag, filter: null });
  const zetAgenda = useCallback((s: Partial<AgendaStand>) => zetAgendaStand(a => ({ ...a, ...s })), []);
  const hoofd = useRef<HTMLElement>(null);

  useEffect(() => {
    const opHash = () => { const u = uitHash(); zetScherm(u.scherm); zetVakantie(u.vakantie); zetSpullenPad(u.spullen); };
    window.addEventListener('hashchange', opHash);
    return () => window.removeEventListener('hashchange', opHash);
  }, []);

  useEffect(() => { document.title = `${TITELS[scherm]} · Thuisplanner (${titelSoort})`; }, [scherm, titelSoort]);

  const gaNaar = useCallback((s: Scherm) => {
    if (window.location.hash !== `#/${s}`) window.location.hash = `#/${s}`;
    zetScherm(s);
    zetVakantie(null);
    zetSpullenPad('');
    window.scrollTo({ top: 0 });
    hoofd.current?.focus({ preventScroll: true });
  }, []);
  const openVakantie = useCallback((id: string | null) => {
    const doel = id ? `#/vakanties/${encodeURIComponent(id)}` : '#/vakanties';
    if (window.location.hash !== doel) window.location.hash = doel;
    zetScherm('vakanties');
    zetVakantie(id);
    window.scrollTo({ top: 0 });
    hoofd.current?.focus({ preventScroll: true });
  }, []);

  const openSpullen = useCallback((pad = '') => {
    const doel = pad ? `#/spullen/${pad}` : '#/spullen';
    if (window.location.hash !== doel) window.location.hash = doel;
    zetScherm('spullen');
    zetSpullenPad(pad);
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
    // Zonder soort: de zin bepaalt het (K1). De knoppen Afspraak en Taak in het dagoverzicht geven er wel een mee.
    openToevoegen: (soort, datum) => zetVenster({ type: 'nieuw', soort, datum }),
    openItem: id => zetVenster({ type: 'bewerk', id }),
    gaNaar,
    vakantie,
    openVakantie,
    spullenPad,
    openSpullen,
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
          {/* N2: loopt een scherm vast, dan een rustige melding; de navigatie blijft werken en een ander scherm begint opnieuw. */}
          <Foutgrens key={scherm} plek={TITELS[scherm]} omgeving={lokaal?.omgeving ?? 'demo'}>
            {scherm === 'vandaag' && <Vandaag />}
            {scherm === 'agenda' && <Agenda />}
            {scherm === 'boodschappen' && <Boodschappen />}
            {scherm === 'meer' && <Meer />}
            {scherm === 'vakanties' && <Vakanties />}
            {scherm === 'spullen' && <Spullen />}
          </Foutgrens>
        </main>
        {venster && (
          <Foutgrens plek="Toevoegen of aanpassen" omgeving={lokaal?.omgeving ?? 'demo'} sluit={sluitVenster}>
            <ItemVenster opdracht={venster} sluit={sluitVenster} />
          </Foutgrens>
        )}
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
