import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { useApp } from '../lib/context';
import { dagLabel, plusDagen } from '../lib/datum';
import { nieuwId } from '../lib/store';
import type { Item, LidId } from '../lib/types';
import { IcSluit } from './Iconen';

type Soort = 'afspraak' | 'taak' | 'boodschap';
const SOORTEN: { id: Soort; label: string }[] = [
  { id: 'afspraak', label: 'Afspraak' },
  { id: 'taak', label: 'Taak' },
  { id: 'boodschap', label: 'Boodschap' },
];
const PLACEHOLDER: Record<Soort, string> = {
  afspraak: 'Bijvoorbeeld: Kapper',
  taak: 'Bijvoorbeeld: Fietsband plakken',
  boodschap: 'Bijvoorbeeld: Eieren, kaas, appels',
};

/** Splitst "eieren, kaas en appels" in losse boodschappen. */
export function splitsBoodschappen(tekst: string): string[] {
  return tekst.split(/,|\n|\sen\s/i).map(s => s.trim()).filter(Boolean)
    .map(s => s.charAt(0).toUpperCase() + s.slice(1));
}

/**
 * Het centrale invoervenster. Eén veld voor de titel, daarna alleen wat nodig is voor de gekozen soort.
 * Alles wordt lokaal in de demo verwerkt.
 */
export function Toevoegen({ beginSoort, sluit }: { beginSoort: Soort; sluit: () => void }) {
  const app = useApp();
  const { vandaag, huishouden } = app;
  const [soort, zetSoort] = useState<Soort>(beginSoort);
  const [titel, zetTitel] = useState('');
  const [dag, zetDag] = useState<string>(vandaag);
  const [tijd, zetTijd] = useState('');
  const [wie, zetWie] = useState<LidId[]>([]);
  const [prive, zetPrive] = useState(false);
  const [fout, zetFout] = useState('');
  const veld = useRef<HTMLInputElement>(null);
  const kopId = useId();
  const venster = useRef<HTMLDivElement>(null);
  // Bij sluiten gaat de focus terug naar wat het venster opende (meestal de toevoegknop).
  const terug = useRef(document.activeElement as HTMLElement | null);

  useEffect(() => { veld.current?.focus(); }, [soort]);

  useEffect(() => {
    const vorige = terug.current;
    const opToets = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); sluit(); }
      if (e.key === 'Tab' && venster.current) {
        // Focus blijft binnen het venster.
        const f = venster.current.querySelectorAll<HTMLElement>('button, input, select, [tabindex="0"]');
        const eerste = f[0], laatste = f[f.length - 1];
        if (e.shiftKey && document.activeElement === eerste) { e.preventDefault(); laatste.focus(); }
        else if (!e.shiftKey && document.activeElement === laatste) { e.preventDefault(); eerste.focus(); }
      }
    };
    document.addEventListener('keydown', opToets);
    document.body.classList.add('geen-scroll');
    return () => {
      document.removeEventListener('keydown', opToets);
      document.body.classList.remove('geen-scroll');
      vorige?.focus?.();
    };
  }, [sluit]);

  const dagen = [0, 1, 2].map(n => plusDagen(vandaag, n));

  function bewaar(e: FormEvent) {
    e.preventDefault();
    const t = titel.trim();
    if (!t) { zetFout(soort === 'boodschap' ? 'Wat moet er gehaald worden?' : 'Geef het even een naam.'); veld.current?.focus(); return; }
    let items: Item[];
    let tekst: string;
    if (soort === 'afspraak') {
      items = [{ id: nieuwId('a'), soort: 'afspraak', titel: t, datum: dag, start: tijd || undefined, wie,
        eigenaar: huishouden.ik, zichtbaarheid: prive ? 'prive' : 'huishouden' }];
      tekst = `${t} staat in de agenda (${dagLabel(dag, vandaag).toLowerCase()}${tijd ? ' ' + tijd : ''})`;
    } else if (soort === 'taak') {
      items = [{ id: nieuwId('t'), soort: 'taak', titel: t, datum: dag === 'ooit' ? null : dag,
        voor: wie[0] ?? null, klaar: false }];
      tekst = dag === 'ooit' ? `${t} staat op de lijst voor later` : `${t} staat op de takenlijst`;
    } else {
      const namen = splitsBoodschappen(t);
      items = namen.map(naam => ({ id: nieuwId('b'), soort: 'boodschap' as const, naam, afgevinkt: false }));
      tekst = namen.length === 1 ? `${namen[0]} op de boodschappenlijst` : `${namen.length} boodschappen toegevoegd`;
    }
    app.toevoegen(items);
    app.meld(tekst, { ongedaan: true });
    sluit();
  }

  const wieKnoppen = (enkel: boolean) => (
    <div className="keuzes" role="group" aria-label={enkel ? 'Voor wie' : 'Wie'}>
      {huishouden.leden.map(l => {
        const aan = wie.includes(l.id);
        return (
          <button type="button" key={l.id} className={'keuze' + (aan ? ' aan' : '')} aria-pressed={aan}
            onClick={() => zetWie(enkel ? (aan ? [] : [l.id]) : aan ? wie.filter(x => x !== l.id) : [...wie, l.id])}>
            <span className="stip" style={{ background: l.kleur }} aria-hidden="true" />{l.naam}
          </button>
        );
      })}
    </div>
  );

  return (
    <div className="laag" onMouseDown={e => { if (e.target === e.currentTarget) sluit(); }}>
      <div className="venster" role="dialog" aria-modal="true" aria-labelledby={kopId} ref={venster}>
        <div className="venster-kop">
          <h2 id={kopId}>Toevoegen</h2>
          <button className="icoonknop" onClick={sluit} aria-label="Sluiten"><IcSluit /></button>
        </div>

        <div className="segment" role="tablist" aria-label="Soort">
          {SOORTEN.map(s => (
            <button key={s.id} type="button" role="tab" aria-selected={soort === s.id}
              className={'segment-knop' + (soort === s.id ? ' aan' : '')}
              onClick={() => { zetSoort(s.id); zetFout(''); zetWie([]); if (s.id === 'afspraak' && dag === 'ooit') zetDag(vandaag); }}>
              {s.label}
            </button>
          ))}
        </div>

        <form onSubmit={bewaar} noValidate>
          <label className="veld">
            <span className="veld-label">{soort === 'boodschap' ? 'Wat is er nodig?' : 'Wat?'}</span>
            <input ref={veld} value={titel} onChange={e => { zetTitel(e.target.value); zetFout(''); }}
              placeholder={PLACEHOLDER[soort]} autoComplete="off" maxLength={80}
              aria-invalid={!!fout} aria-describedby={fout ? 'toevoegen-fout' : undefined} />
            {soort === 'boodschap' && <span className="veld-hulp">Meerdere tegelijk? Scheid ze met komma's.</span>}
            {fout && <span className="veld-fout" id="toevoegen-fout">{fout}</span>}
          </label>

          {soort !== 'boodschap' && (
            <>
              <div className="veld">
                <span className="veld-label">Wanneer?</span>
                <div className="keuzes" role="group" aria-label="Wanneer">
                  {dagen.map(d => (
                    <button type="button" key={d} className={'keuze' + (dag === d ? ' aan' : '')} aria-pressed={dag === d}
                      onClick={() => zetDag(d)}>{dagLabel(d, vandaag)}</button>
                  ))}
                  {soort === 'taak' && (
                    <button type="button" className={'keuze' + (dag === 'ooit' ? ' aan' : '')} aria-pressed={dag === 'ooit'}
                      onClick={() => zetDag('ooit')}>Ooit</button>
                  )}
                </div>
              </div>
              {soort === 'afspraak' && (
                <label className="veld veld-tijd">
                  <span className="veld-label">Hoe laat? <span className="optioneel">(leeg = hele dag)</span></span>
                  <input type="time" value={tijd} onChange={e => zetTijd(e.target.value)} />
                </label>
              )}
              <div className="veld">
                <span className="veld-label">{soort === 'afspraak' ? 'Voor wie?' : 'Wie pakt het op?'} <span className="optioneel">(optioneel)</span></span>
                {wieKnoppen(soort === 'taak')}
              </div>
              {soort === 'afspraak' && (
                <label className="schakel">
                  <input type="checkbox" checked={prive} onChange={e => zetPrive(e.target.checked)} />
                  <span>
                    Privé
                    <small>Anderen zien alleen dat je bezet bent.</small>
                  </span>
                </label>
              )}
            </>
          )}

          <button type="submit" className="knop breed">Toevoegen</button>
        </form>
      </div>
    </div>
  );
}
