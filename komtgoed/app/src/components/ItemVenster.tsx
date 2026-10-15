import { useEffect, useRef, useState } from 'react';
import { useApp, type Soort } from '../lib/context';
import { dagLabel, isGeldigeDatum, langeDatum, langeDatumHoofdletter, plusDagen } from '../lib/datum';
import {
  FREQUENTIES, herhalingTekst, verwijderReeks, verwijderVoorkomen, vindAfspraak, wijzigVoorkomen, wordtDubbel,
} from '../lib/herhaling';
import { boodschappenMelding, splitsBoodschappen, voegBoodschappenToe } from '../lib/boodschappen';
import { isBezetVanAnder, magZichtbaarheidKiezen } from '../lib/rechten';
import { nieuwId } from '../lib/store';
import type { Afspraak, Datum, Frequentie, Herhaling, Item, LidId } from '../lib/types';
import { tijdTekst, Wie } from './Rijen';
import { IcHerhaal, IcSlot } from './Iconen';
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
  // Een voorkomen van een herhalende afspraak heeft een berekend id ("reeks@datum").
  const item = staat.items.find(i => i.id === opdracht.id && i.soort !== 'afspraak') ?? vindAfspraak(staat.items, opdracht.id);
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
  // Herhaling. Bij een voorkomen van een reeks kies je eerst: alleen deze afspraak, of de hele reeks.
  const voorkomen = bestaand?.soort === 'afspraak' ? bestaand : undefined;
  const reeks = voorkomen?.voorkomenVan
    ? staat.items.find((i): i is Afspraak => i.id === voorkomen.voorkomenVan && i.soort === 'afspraak') : undefined;
  const losgemaakt = !!voorkomen?.reeksId;
  const [bereik, zetBereik] = useState<'deze' | 'reeks'>('deze');
  const [freq, zetFreq] = useState<Frequentie | 'geen'>(voorkomen?.herhaling?.freq ?? 'geen');
  const [herhaalTot, zetHerhaalTot] = useState(voorkomen?.herhaling?.tot ?? '');
  const [fout, zetFout] = useState<{ veld: 'titel' | 'tijd' | 'dag' | 'herhaling'; tekst: string } | null>(null);
  const veld = useRef<HTMLInputElement>(null);

  useEffect(() => { if (!bestaand) veld.current?.focus(); }, [soort, bestaand]);

  const snelDagen = [0, 1, 2].map(n => plusDagen(vandaag, n));
  const andereDag = dag !== 'ooit' && !snelDagen.includes(dag);
  const [toonDatum, zetToonDatum] = useState(andereDag);
  const kanPriveKiezen = soort === 'afspraak'
    && magZichtbaarheidKiezen(bestaand?.soort === 'afspraak' ? bestaand : null, huishouden.ik);
  const toonHerhaling = soort === 'afspraak' && !losgemaakt && (!reeks || bereik === 'reeks');

  function kiesBereik(b: 'deze' | 'reeks') {
    if (!reeks || !voorkomen) return;
    zetBereik(b);
    zetFout(null);
    // De hele reeks begint op de eerste keer; één voorkomen staat op zijn eigen dag.
    zetDag(b === 'reeks' ? reeks.datum : voorkomen.datum);
    zetToonDatum(false);
  }

  // Via de klik op de knop (ook Enter in een veld "klikt" die knop), niet via het verzenden van het formulier:
  // zo werkt het ook in een afgeschermd frame waar formulieren verzenden niet mag.
  function bewaar(e: { preventDefault(): void }) {
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
      if (toonHerhaling && freq !== 'geen' && herhaalTot && (!isGeldigeDatum(herhaalTot) || herhaalTot < datum)) {
        zetFout({ veld: 'herhaling', tekst: 'De laatste keer ligt vóór de eerste keer.' });
        return;
      }
      const vorig = voorkomen;
      if (reeks && vorig && bereik === 'deze' && wordtDubbel(staat.items, reeks.id, vorig.datum, datum)) {
        zetFout({ veld: 'dag', tekst: 'Op die dag staat deze herhalende afspraak al. Kies een andere dag.' });
        return;
      }
      const herhaling: Herhaling | undefined = toonHerhaling && freq !== 'geen'
        ? { freq, tot: herhaalTot || null, uitzonderingen: reeks && bereik === 'reeks' ? reeks.herhaling?.uitzonderingen : vorig?.herhaling?.uitzonderingen }
        : undefined;
      const a: Afspraak = {
        id: vorig?.id ?? nieuwId('a'), soort: 'afspraak', titel: t, datum,
        start: start || undefined, eind: (start && eind) || undefined, plek: plek.trim() || undefined, wie,
        eigenaar: vorig?.eigenaar ?? huishouden.ik,
        zichtbaarheid: kanPriveKiezen ? (prive ? 'prive' : 'huishouden') : vorig?.zichtbaarheid ?? 'huishouden',
        voorbereiding: vorig?.voorbereiding,
        herhaling,
        reeksId: vorig?.reeksId, origineleDatum: vorig?.origineleDatum,
      };
      const wanneer = `${dagLabel(datum, vandaag).toLowerCase()}${a.start ? ' ' + a.start : ''}`;
      if (reeks && vorig && bereik === 'deze') {
        app.vervangAlles(wijzigVoorkomen(staat.items, reeks.id, vorig.datum, { ...a, id: nieuwId('a') }), `${t} aangepast (${wanneer})`);
      } else if (reeks && bereik === 'reeks') {
        app.bijwerken({ ...a, id: reeks.id }, herhaling ? `Hele reeks ${t} aangepast` : `${t} herhaalt niet meer`);
      } else if (vorig) {
        app.bijwerken(a, `${t} aangepast (${wanneer})`);
      } else {
        app.toevoegen([a], herhaling ? `${t} staat in de agenda (${herhalingTekst(datum, herhaling).toLowerCase()})`
          : `${t} staat in de agenda (${wanneer})`);
      }
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
    if (reeks && voorkomen && bereik === 'deze') {
      app.vervangAlles(verwijderVoorkomen(staat.items, reeks.id, voorkomen.datum), `${naam} op ${langeDatum(voorkomen.datum)} verwijderd`);
    } else if (reeks) {
      app.vervangAlles(verwijderReeks(staat.items, reeks.id), `Hele reeks ${naam} verwijderd`);
    } else {
      app.verwijder([bestaand.id], `${naam} verwijderd`);
    }
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
        {reeks?.herhaling && (
          <div className="reeks-info">
            <p className="reeks-regel"><IcHerhaal /> {herhalingTekst(reeks.datum, reeks.herhaling)}</p>
            <div className="segment klein" role="radiogroup" aria-label="Wat wil je wijzigen?">
              {(['deze', 'reeks'] as const).map(b => (
                <button key={b} type="button" role="radio" aria-checked={bereik === b}
                  className={'segment-knop' + (bereik === b ? ' aan' : '')} onClick={() => kiesBereik(b)}>
                  {b === 'deze' ? 'Alleen deze' : 'Hele reeks'}
                </button>
              ))}
            </div>
          </div>
        )}
        {losgemaakt && <p className="reeks-regel stil-tekst"><IcHerhaal /> Losgemaakt uit een herhalende afspraak</p>}
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
            <span className="veld-label" id="wanneer-label">{reeks && bereik === 'reeks' ? 'Eerste keer' : 'Wanneer?'}</span>
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

        {toonHerhaling && (
          <div className="veld">
            <span className="veld-label" id="herhaal-label">Herhalen?</span>
            <div className="keuzes" role="group" aria-labelledby="herhaal-label">
              {[{ id: 'geen' as const, label: 'Niet' }, ...FREQUENTIES].map(f => (
                <button type="button" key={f.id} className={'keuze' + (freq === f.id ? ' aan' : '')} aria-pressed={freq === f.id}
                  onClick={() => { zetFreq(f.id); setFoutWeg(); }}>{f.label}</button>
              ))}
            </div>
            {freq !== 'geen' && (
              <label className="veld-sub tot-veld">
                <span className="tijd-label">Tot en met <span className="optioneel">(leeg = zonder einde)</span></span>
                <input type="date" id="item-herhaal-tot" value={herhaalTot} aria-label="Tot en met"
                  onChange={e => { zetHerhaalTot(e.target.value); setFoutWeg(); }} aria-invalid={fout?.veld === 'herhaling'} />
              </label>
            )}
            {fout?.veld === 'herhaling' && <span className="veld-fout">{fout.tekst}</span>}
          </div>
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

        <button type="submit" className="knop breed" onClick={bewaar}>
          {!bestaand ? 'Toevoegen' : reeks ? (bereik === 'reeks' ? 'Hele reeks opslaan' : 'Alleen deze opslaan') : 'Opslaan'}
        </button>
        {bestaand && (
          <button type="button" className="knop breed gevaar" onClick={verwijder}>
            {reeks ? (bereik === 'reeks' ? 'Hele reeks verwijderen' : 'Alleen deze verwijderen') : 'Verwijderen'}
          </button>
        )}
      </form>
    </Venster>
  );
}
