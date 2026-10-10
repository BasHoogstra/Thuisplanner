import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useApp, type Soort } from '../lib/context';
import { dagLabel, isGeldigeDatum, langeDatumHoofdletter, plusDagen } from '../lib/datum';
import { boodschappenMelding, splitsBoodschappen, voegBoodschappenToe } from '../lib/boodschappen';
import { isBezetVanAnder, magZichtbaarheidKiezen } from '../lib/rechten';
import { nieuwId } from '../lib/store';
import type { Afspraak, Datum, Item, LidId } from '../lib/types';
import { tijdTekst, Wie } from './Rijen';
import { IcSlot } from './Iconen';
import { Venster } from './Venster';

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
const NAAM: Record<Soort, string> = { afspraak: 'Afspraak', taak: 'Taak', boodschap: 'Boodschap' };

export type VensterOpdracht =
  | { type: 'nieuw'; soort: Soort; datum?: Datum }
  | { type: 'bewerk'; id: string };

/** Kiest het juiste venster: nieuw, bewerken, of alleen-lezen voor een privé-afspraak van een ander. */
export function ItemVenster({ opdracht, sluit }: { opdracht: VensterOpdracht; sluit: () => void }) {
  const { staat, huishouden } = useApp();
  if (opdracht.type === 'nieuw') return <Formulier soortBegin={opdracht.soort} datumBegin={opdracht.datum} sluit={sluit} />;
  const item = staat.items.find(i => i.id === opdracht.id);
  if (!item) return null;
  if (item.soort === 'afspraak' && isBezetVanAnder(item, huishouden.ik)) return <BezetVenster a={item} sluit={sluit} />;
  return <Formulier bestaand={item} sluit={sluit} />;
}

function BezetVenster({ a, sluit }: { a: Afspraak; sluit: () => void }) {
  const { lid } = useApp();
  const eigenaar = lid(a.eigenaar)?.naam ?? 'Iemand';
  return (
    <Venster titel="Bezet" sluit={sluit}>
      <div className="bezet-info">
        <p className="bezet-regel">{langeDatumHoofdletter(a.datum)} · {tijdTekst(a)}</p>
        <p className="bezet-regel"><Wie ids={a.wie} /></p>
        <p className="stil-tekst"><IcSlot /> Dit is een privé-afspraak van {eigenaar}. Je ziet alleen dat {eigenaar} dan bezet is;
          alleen {eigenaar} kan de details zien en wijzigen.</p>
      </div>
      <button type="button" className="knop breed stil" onClick={sluit}>Sluiten</button>
    </Venster>
  );
}

function Formulier({ bestaand, soortBegin, datumBegin, sluit }: {
  bestaand?: Item; soortBegin?: Soort; datumBegin?: Datum; sluit: () => void;
}) {
  const app = useApp();
  const { vandaag, huishouden, staat } = app;
  const [soort, zetSoort] = useState<Soort>(bestaand?.soort ?? soortBegin ?? 'afspraak');
  const [titel, zetTitel] = useState(bestaand ? (bestaand.soort === 'boodschap' ? bestaand.naam : bestaand.titel ?? '') : '');
  const [dag, zetDag] = useState<Datum | 'ooit'>(() => {
    if (bestaand?.soort === 'afspraak') return bestaand.datum;
    if (bestaand?.soort === 'taak') return bestaand.datum ?? 'ooit';
    return datumBegin ?? vandaag;
  });
  const [start, zetStart] = useState(bestaand?.soort === 'afspraak' ? bestaand.start ?? '' : '');
  const [eind, zetEind] = useState(bestaand?.soort === 'afspraak' ? bestaand.eind ?? '' : '');
  const [plek, zetPlek] = useState(bestaand?.soort === 'afspraak' ? bestaand.plek ?? '' : '');
  const [wie, zetWie] = useState<LidId[]>(
    bestaand?.soort === 'afspraak' ? bestaand.wie : bestaand?.soort === 'taak' && bestaand.voor ? [bestaand.voor] : []);
  const [prive, zetPrive] = useState(bestaand?.soort === 'afspraak' && bestaand.zichtbaarheid === 'prive');
  const [fout, zetFout] = useState<{ veld: 'titel' | 'tijd' | 'dag'; tekst: string } | null>(null);
  const veld = useRef<HTMLInputElement>(null);

  useEffect(() => { if (!bestaand) veld.current?.focus(); }, [soort, bestaand]);

  const snelDagen = [0, 1, 2].map(n => plusDagen(vandaag, n));
  const andereDag = dag !== 'ooit' && !snelDagen.includes(dag);
  const [toonDatum, zetToonDatum] = useState(andereDag);
  const kanPriveKiezen = soort === 'afspraak'
    && magZichtbaarheidKiezen(bestaand?.soort === 'afspraak' ? bestaand : null, huishouden.ik);

  function bewaar(e: FormEvent) {
    e.preventDefault();
    const t = titel.trim().replace(/\s+/g, ' ');
    if (!t) {
      zetFout({ veld: 'titel', tekst: soort === 'boodschap' ? 'Wat moet er gehaald worden?' : 'Geef het even een naam.' });
      veld.current?.focus();
      return;
    }
    if (soort !== 'boodschap' && dag !== 'ooit' && !isGeldigeDatum(dag)) {
      zetFout({ veld: 'dag', tekst: 'Kies een geldige datum.' });
      return;
    }
    if (soort === 'afspraak' && eind && (!start || eind <= start)) {
      zetFout({ veld: 'tijd', tekst: start ? 'De eindtijd ligt vóór of op de begintijd.' : 'Vul eerst een begintijd in.' });
      return;
    }

    if (soort === 'afspraak') {
      const datum = dag as Datum;
      const vorig = bestaand?.soort === 'afspraak' ? bestaand : undefined;
      const a: Afspraak = {
        id: vorig?.id ?? nieuwId('a'), soort: 'afspraak', titel: t, datum,
        start: start || undefined, eind: (start && eind) || undefined, plek: plek.trim() || undefined, wie,
        eigenaar: vorig?.eigenaar ?? huishouden.ik,
        zichtbaarheid: kanPriveKiezen ? (prive ? 'prive' : 'huishouden') : vorig?.zichtbaarheid ?? 'huishouden',
        voorbereiding: vorig?.voorbereiding,
      };
      const wanneer = `${dagLabel(datum, vandaag).toLowerCase()}${a.start ? ' ' + a.start : ''}`;
      if (vorig) app.bijwerken(a, `${t} aangepast (${wanneer})`);
      else app.toevoegen([a], `${t} staat in de agenda (${wanneer})`);
    } else if (soort === 'taak') {
      const vorig = bestaand?.soort === 'taak' ? bestaand : undefined;
      const taak = {
        id: vorig?.id ?? nieuwId('t'), soort: 'taak' as const, titel: t, datum: dag === 'ooit' ? null : dag,
        voor: wie[0] ?? null, klaar: vorig?.klaar ?? false, klaarOp: vorig?.klaarOp ?? null,
      };
      if (vorig) app.bijwerken(taak, `${t} aangepast`);
      else app.toevoegen([taak], dag === 'ooit' ? `${t} staat op de lijst voor later` : `${t} staat op de takenlijst`);
    } else if (bestaand?.soort === 'boodschap') {
      app.bijwerken({ ...bestaand, naam: t.charAt(0).toUpperCase() + t.slice(1) }, `${t} aangepast`);
    } else {
      const r = voegBoodschappenToe(staat.items, splitsBoodschappen(t), () => nieuwId('b'));
      app.vervangAlles(r.items, boodschappenMelding(r));
    }
    sluit();
  }

  function verwijder() {
    if (!bestaand) return;
    const naam = bestaand.soort === 'boodschap' ? bestaand.naam : bestaand.titel ?? 'Afspraak';
    app.verwijder([bestaand.id], `${naam} verwijderd`);
    sluit();
  }

  const keuzeWie = (enkel: boolean) => (
    <div className="keuzes" role="group" aria-label={enkel ? 'Wie pakt het op' : 'Voor wie'}>
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

  const kies = (d: Datum | 'ooit') => { zetDag(d); zetToonDatum(false); setFoutWeg(); };
  const setFoutWeg = () => zetFout(null);

  return (
    <Venster titel={bestaand ? NAAM[soort] : 'Toevoegen'} sluit={sluit}>
      {!bestaand && (
        <div className="segment" role="tablist" aria-label="Soort">
          {SOORTEN.map(s => (
            <button key={s.id} type="button" role="tab" aria-selected={soort === s.id}
              className={'segment-knop' + (soort === s.id ? ' aan' : '')}
              onClick={() => { zetSoort(s.id); setFoutWeg(); zetWie([]); if (s.id === 'afspraak' && dag === 'ooit') zetDag(vandaag); }}>
              {s.label}
            </button>
          ))}
        </div>
      )}

      <form onSubmit={bewaar} noValidate>
        <label className="veld">
          <span className="veld-label">{soort === 'boodschap' ? (bestaand ? 'Naam' : 'Wat is er nodig?') : 'Wat?'}</span>
          <input ref={veld} id="item-titel" value={titel} onChange={e => { zetTitel(e.target.value); setFoutWeg(); }}
            placeholder={PLACEHOLDER[soort]} autoComplete="off" maxLength={soort === 'boodschap' && !bestaand ? 200 : 80}
            aria-invalid={fout?.veld === 'titel'} aria-describedby={fout?.veld === 'titel' ? 'item-fout' : undefined} />
          {soort === 'boodschap' && !bestaand && <span className="veld-hulp">Meerdere tegelijk? Scheid ze met komma's.</span>}
          {fout?.veld === 'titel' && <span className="veld-fout" id="item-fout">{fout.tekst}</span>}
        </label>

        {soort !== 'boodschap' && (
          <div className="veld">
            <span className="veld-label" id="wanneer-label">Wanneer?</span>
            <div className="keuzes" role="group" aria-labelledby="wanneer-label">
              {snelDagen.map(d => (
                <button type="button" key={d} className={'keuze' + (dag === d && !toonDatum ? ' aan' : '')}
                  aria-pressed={dag === d && !toonDatum} onClick={() => kies(d)}>{dagLabel(d, vandaag)}</button>
              ))}
              <button type="button" className={'keuze' + (toonDatum || andereDag ? ' aan' : '')} aria-pressed={toonDatum || andereDag}
                onClick={() => { zetToonDatum(true); if (dag === 'ooit') zetDag(plusDagen(vandaag, 3)); }}>
                {andereDag && !toonDatum ? dagLabel(dag as Datum, vandaag) : 'Andere dag'}
              </button>
              {soort === 'taak' && (
                <button type="button" className={'keuze' + (dag === 'ooit' ? ' aan' : '')} aria-pressed={dag === 'ooit'}
                  onClick={() => kies('ooit')}>Ooit</button>
              )}
            </div>
            {(toonDatum || andereDag) && dag !== 'ooit' && (
              <label className="veld-sub">
                <span className="sr-only">Datum</span>
                <input type="date" id="item-datum" value={dag} onChange={e => { zetDag(e.target.value); setFoutWeg(); }}
                  aria-label="Datum" aria-invalid={fout?.veld === 'dag'} />
              </label>
            )}
            {fout?.veld === 'dag' && <span className="veld-fout">{fout.tekst}</span>}
          </div>
        )}

        {soort === 'afspraak' && (
          <>
            <div className="veld">
              <span className="veld-label">Hoe laat? <span className="optioneel">(leeg = hele dag)</span></span>
              <div className="tijden">
                <label><span className="tijd-label">Van</span>
                  <input type="time" id="item-start" value={start} onChange={e => { zetStart(e.target.value); setFoutWeg(); }} />
                </label>
                <label><span className="tijd-label">Tot</span>
                  <input type="time" id="item-eind" value={eind} onChange={e => { zetEind(e.target.value); setFoutWeg(); }}
                    aria-invalid={fout?.veld === 'tijd'} />
                </label>
              </div>
              {fout?.veld === 'tijd' && <span className="veld-fout">{fout.tekst}</span>}
            </div>
            <label className="veld">
              <span className="veld-label">Waar? <span className="optioneel">(optioneel)</span></span>
              <input id="item-plek" value={plek} onChange={e => zetPlek(e.target.value)} autoComplete="off" maxLength={80} />
            </label>
          </>
        )}

        {soort !== 'boodschap' && (
          <div className="veld">
            <span className="veld-label">{soort === 'afspraak' ? 'Voor wie?' : 'Wie pakt het op?'} <span className="optioneel">(optioneel)</span></span>
            {keuzeWie(soort === 'taak')}
          </div>
        )}

        {kanPriveKiezen && (
          <label className="schakel">
            <input type="checkbox" id="item-prive" checked={prive} onChange={e => zetPrive(e.target.checked)} />
            <span>
              Privé
              <small>Anderen zien alleen dat je bezet bent.</small>
            </span>
          </label>
        )}

        <button type="submit" className="knop breed">{bestaand ? 'Opslaan' : 'Toevoegen'}</button>
        {bestaand && (
          <button type="button" className="knop breed gevaar" onClick={verwijder}>Verwijderen</button>
        )}
      </form>
    </Venster>
  );
}
