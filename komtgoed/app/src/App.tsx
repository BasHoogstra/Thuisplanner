import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { huishouden } from './data/demo';
import { naarDatum, naarTijd } from './lib/datum';
import { Ctx, type AppContext, type Scherm } from './lib/context';
import { useDemoStaat } from './lib/store';
import { Navigatie } from './components/Navigatie';
import { ItemVenster, type VensterOpdracht } from './components/ItemVenster';
import { DemoBalk } from './components/DemoBalk';
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

export function App() {
  const klok = useKlok();
  const vandaag = naarDatum(klok);
  const demo = useDemoStaat(vandaag);
  const [scherm, zetScherm] = useState<Scherm>(schermUitHash);
  const [venster, zetVenster] = useState<VensterOpdracht | null>(null);
  const hoofd = useRef<HTMLElement>(null);

  useEffect(() => {
    const opHash = () => zetScherm(schermUitHash());
    window.addEventListener('hashchange', opHash);
    return () => window.removeEventListener('hashchange', opHash);
  }, []);

  useEffect(() => { document.title = `${TITELS[scherm]} · KomtGoed (demo)`; }, [scherm]);

  const gaNaar = useCallback((s: Scherm) => {
    if (window.location.hash !== `#/${s}`) window.location.hash = `#/${s}`;
    zetScherm(s);
    window.scrollTo({ top: 0 });
    hoofd.current?.focus({ preventScroll: true });
  }, []);

  // De melding staat in de demo-staat (zie store.ts); hier verdwijnt hij vanzelf na een paar seconden.
  const melding = demo.staat.melding;
  const { meldingWeg } = demo;
  useEffect(() => {
    if (!melding) return;
    const t = window.setTimeout(() => meldingWeg(melding.id), melding.ongedaan ? 6000 : 3500);
    return () => window.clearTimeout(t);
  }, [melding, meldingWeg]);

  const sluitVenster = useCallback(() => zetVenster(null), []);

  const ctx: AppContext = {
    ...demo,
    huishouden,
    vandaag,
    nu: naarTijd(klok),
    uur: klok.getHours(),
    lid: id => huishouden.leden.find(l => l.id === id),
    openToevoegen: (soort, datum) => zetVenster({ type: 'nieuw', soort: soort ?? 'afspraak', datum }),
    openItem: id => zetVenster({ type: 'bewerk', id }),
    gaNaar,
  };

  return (
    <Ctx.Provider value={ctx}>
      <div className="schil">
        <DemoBalk />
        <Navigatie actief={scherm} />
        <main ref={hoofd} tabIndex={-1} className="hoofd" aria-label={TITELS[scherm]}>
          {scherm === 'vandaag' && <Vandaag />}
          {scherm === 'agenda' && <Agenda />}
          {scherm === 'boodschappen' && <Boodschappen />}
          {scherm === 'meer' && <Meer />}
        </main>
        {venster && <ItemVenster opdracht={venster} sluit={sluitVenster} />}
        <div className="melding-plek" aria-live="polite">
          {melding && (
            <div className="melding" key={melding.id} role="status">
              <span>{melding.tekst}</span>
              {melding.ongedaan && (
                <button className="melding-knop" onClick={demo.ongedaan}>
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
