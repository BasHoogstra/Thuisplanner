import { useApp, type AgendaWeergave } from '../lib/context';
import {
  langeDatum, langeDatumHoofdletter, maandagVan, plusDagen, vanDatum, weekBereik, weekdagKort, weekNummer,
} from '../lib/datum';
import { taakPast } from '../lib/filter';
import { dagInhoud, maandBegin, maandRaster, plusMaanden } from '../lib/kalender';
import { isBezetVanAnder } from '../lib/rechten';
import { isVoorbij, takenZonderDatum } from '../lib/vandaag';
import type { Datum } from '../lib/types';
import { AfspraakRij, TaakRij } from '../components/Rijen';
import { IcLinks, IcPijl, IcPlus } from '../components/Iconen';

const MAANDEN = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september',
  'oktober', 'november', 'december'];
const WEERGAVEN: { id: AgendaWeergave; label: string }[] = [
  { id: 'dag', label: 'Dag' }, { id: 'week', label: 'Week' }, { id: 'maand', label: 'Maand' },
];

export function Agenda() {
  const { agenda, zetAgenda, vandaag, huishouden, staat } = useApp();
  const { weergave, datum, filter } = agenda;
  const stap = (n: number) => zetAgenda({
    datum: weergave === 'dag' ? plusDagen(datum, n) : weergave === 'week' ? plusDagen(datum, 7 * n) : plusMaanden(datum, n),
  });
  const zonderDatum = takenZonderDatum(staat.items).filter(t => taakPast(t, filter));

  const titel = weergave === 'dag' ? dagTitel(datum, vandaag)
    : weergave === 'week' ? weekTitel(datum, vandaag)
      : `${MAANDEN[vanDatum(datum).getMonth()].replace(/^./, c => c.toUpperCase())} ${vanDatum(datum).getFullYear()}`;
  const sub = weergave === 'dag' ? (titel === langeDatumHoofdletter(datum) ? '' : langeDatumHoofdletter(datum))
    : weergave === 'week' ? `${weekBereik(maandagVan(datum))} · week ${weekNummer(datum)}` : '';
  const isNu = weergave === 'dag' ? datum === vandaag
    : weergave === 'week' ? maandagVan(datum) === maandagVan(vandaag) : maandBegin(datum) === maandBegin(vandaag);
  const eenheid = weergave === 'dag' ? 'dag' : weergave === 'week' ? 'week' : 'maand';

  return (
    <div className="scherm scherm-breed">
      <header className="kop agenda-kop">
        <h1>Agenda</h1>
        <div className="agenda-balk">
          <div className="segment klein" role="tablist" aria-label="Weergave">
            {WEERGAVEN.map(w => (
              <button key={w.id} type="button" role="tab" aria-selected={weergave === w.id}
                className={'segment-knop' + (weergave === w.id ? ' aan' : '')} onClick={() => zetAgenda({ weergave: w.id })}>
                {w.label}
              </button>
            ))}
          </div>
          <div className="filter-rij" role="group" aria-label="Wiens agenda">
            <button type="button" className={'keuze klein' + (filter === null ? ' aan' : '')} aria-pressed={filter === null}
              onClick={() => zetAgenda({ filter: null })}>Iedereen</button>
            {huishouden.leden.map(l => (
              <button key={l.id} type="button" className={'keuze klein' + (filter === l.id ? ' aan' : '')} aria-pressed={filter === l.id}
                onClick={() => zetAgenda({ filter: filter === l.id ? null : l.id })}>
                <span className="stip" style={{ background: l.kleur }} aria-hidden="true" />{l.naam}
              </button>
            ))}
          </div>
        </div>
        <div className="week-balk">
          <button type="button" className="icoonknop" onClick={() => stap(-1)} aria-label={`Vorige ${eenheid}`}><IcLinks /></button>
          <p className="week-titel" aria-live="polite">
            <span>{titel}</span>
            {sub && <small>{sub}</small>}
          </p>
          <button type="button" className="icoonknop" onClick={() => stap(1)} aria-label={`Volgende ${eenheid}`}><IcPijl /></button>
          {!isNu && <button type="button" className="link" onClick={() => zetAgenda({ datum: vandaag })}>Naar vandaag</button>}
        </div>
      </header>

      {weergave === 'dag' && <DagWeergave />}
      {weergave === 'week' && <WeekWeergave />}
      {weergave === 'maand' && <MaandWeergave />}

      {weergave !== 'maand' && zonderDatum.length > 0 && (
        <section aria-labelledby="h-ooit" className="blok">
          <h2 id="h-ooit" className="sectie-kop">Taken zonder datum</h2>
          <ul className="lijst">{zonderDatum.map(t => <TaakRij key={t.id} t={t} />)}</ul>
        </section>
      )}
      <p className="demo-noot">Demo: delen met mensen buiten het gezin en uitnodigingen komen in een latere fase.</p>
    </div>
  );
}

function dagTitel(d: Datum, vandaag: Datum): string {
  const n = Math.round((vanDatum(d).getTime() - vanDatum(vandaag).getTime()) / 86400000);
  return n === 0 ? 'Vandaag' : n === 1 ? 'Morgen' : n === -1 ? 'Gisteren' : langeDatumHoofdletter(d);
}

function weekTitel(d: Datum, vandaag: Datum): string {
  const n = Math.round((vanDatum(maandagVan(d)).getTime() - vanDatum(maandagVan(vandaag)).getTime()) / (7 * 86400000));
  return n === 0 ? 'Deze week' : n === 1 ? 'Volgende week' : n === -1 ? 'Vorige week' : `Week ${weekNummer(d)}`;
}

/** Eén dag: afspraken op tijd, taken van die dag, en direct iets toevoegen op die datum. */
function DagWeergave() {
  const { agenda, staat, vandaag, nu, openToevoegen } = useApp();
  const { datum, filter } = agenda;
  const { afspraken, taken } = dagInhoud(staat.items, datum, filter);
  return (
    <div className="dag-weergave" aria-label={`Dagoverzicht ${langeDatum(datum)}`} role="region">
      <section aria-labelledby="h-dag-afspraken">
        <h2 id="h-dag-afspraken" className="sectie-kop">Afspraken</h2>
        {afspraken.length
          ? <ul className="lijst">{afspraken.map(a => <AfspraakRij key={a.id} a={a} voorbij={datum < vandaag || (datum === vandaag && isVoorbij(a, nu))} />)}</ul>
          : <p className="stil-tekst">Geen afspraken.</p>}
      </section>
      <section aria-labelledby="h-dag-taken">
        <h2 id="h-dag-taken" className="sectie-kop">Taken</h2>
        {taken.length
          ? <ul className="lijst">{taken.map(t => <TaakRij key={t.id} t={t} />)}</ul>
          : <p className="stil-tekst">Geen taken.</p>}
      </section>
      <div className="dag-acties">
        <button type="button" className="knop stil" onClick={() => openToevoegen('afspraak', datum)}
          aria-label={`Afspraak toevoegen op ${langeDatum(datum)}`}>
          <IcPlus width={18} height={18} /> Afspraak
        </button>
        <button type="button" className="knop stil" onClick={() => openToevoegen('taak', datum)}
          aria-label={`Taak toevoegen op ${langeDatum(datum)}`}>
          <IcPlus width={18} height={18} /> Taak
        </button>
      </div>
    </div>
  );
}

/** Week (KG-3): maandag t/m zondag; de dagkop opent het dagoverzicht. */
function WeekWeergave() {
  const { agenda, zetAgenda, staat, vandaag, nu, openToevoegen } = useApp();
  const maandag = maandagVan(agenda.datum);
  const dagen = Array.from({ length: 7 }, (_, n) => plusDagen(maandag, n));
  return (
    <div className="week">
      {dagen.map(datum => {
        const { afspraken, taken } = dagInhoud(staat.items, datum, agenda.filter);
        const leeg = !afspraken.length && !taken.length;
        const isVandaag = datum === vandaag;
        return (
          <section key={datum} className={'week-dag' + (isVandaag ? ' vandaag' : '') + (datum < vandaag ? ' verleden' : '') + (leeg ? ' leeg' : '')}
            aria-label={langeDatum(datum) + (isVandaag ? ', vandaag' : '')}>
            <div className="week-dag-kop">
              <h2>
                <button type="button" className="dag-knop" onClick={() => zetAgenda({ weergave: 'dag', datum })}
                  aria-label={`Dagoverzicht ${langeDatum(datum)}`}>
                  <span className="week-dag-naam">{weekdagKort(datum)}</span>
                  <span className="week-dag-nr">{vanDatum(datum).getDate()}</span>
                  {isVandaag && <span className="week-dag-vandaag">vandaag</span>}
                </button>
              </h2>
              {leeg && <span className="week-leeg">Niets gepland</span>}
              <button type="button" className="icoonknop klein" onClick={() => openToevoegen('afspraak', datum)}
                aria-label={`Toevoegen op ${langeDatum(datum)}`}>
                <IcPlus width={16} height={16} />
              </button>
            </div>
            {!leeg && (
              <ul className="lijst week-lijst">
                {afspraken.map(a => <AfspraakRij key={a.id} a={a} compact voorbij={datum < vandaag || (isVandaag && isVoorbij(a, nu))} />)}
                {taken.map(t => <TaakRij key={t.id} t={t} />)}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}

/**
 * Maand: een rustig raster. Per dag subtiele stippen (afspraken, in de kleur van het lid) en een streepje
 * voor open taken; op desktop ook de eerste titels. Een dag aantikken opent het dagoverzicht.
 */
function MaandWeergave() {
  const { agenda, zetAgenda, staat, vandaag, lid, huishouden } = useApp();
  const maand = vanDatum(agenda.datum).getMonth();
  const dagen = maandRaster(agenda.datum);
  return (
    <div className="maand">
      <div className="maand-koppen" aria-hidden="true">
        {['ma', 'di', 'wo', 'do', 'vr', 'za', 'zo'].map(d => <span key={d}>{d}</span>)}
      </div>
      <div className="maand-raster" role="grid" aria-label="Maandkalender">
        {Array.from({ length: dagen.length / 7 }, (_, w) => (
          <div key={w} role="row" className="maand-week">
            {dagen.slice(w * 7, w * 7 + 7).map(datum => {
              const { afspraken, taken } = dagInhoud(staat.items, datum, agenda.filter);
              const open = taken.filter(t => !t.klaar);
              const buiten = vanDatum(datum).getMonth() !== maand;
              const beschrijving = [
                afspraken.length ? `${afspraken.length} ${afspraken.length === 1 ? 'afspraak' : 'afspraken'}` : '',
                open.length ? `${open.length} ${open.length === 1 ? 'taak' : 'taken'}` : '',
              ].filter(Boolean).join(', ') || 'niets gepland';
              return (
                <div key={datum} role="gridcell" className={'maand-dag' + (buiten ? ' buiten' : '') + (datum === vandaag ? ' vandaag' : '')
                  + (datum < vandaag ? ' verleden' : '')}>
                  <button type="button" className="maand-knop" onClick={() => zetAgenda({ weergave: 'dag', datum })}
                    aria-label={`${langeDatum(datum)}${datum === vandaag ? ' (vandaag)' : ''}: ${beschrijving}`}>
                    <span className="maand-nr">{vanDatum(datum).getDate()}</span>
                    <span className="maand-stippen" aria-hidden="true">
                      {afspraken.slice(0, 3).map(a => (
                        <span key={a.id} className="maand-stip"
                          style={{ background: a.wie.length === 1 ? lid(a.wie[0])?.kleur : 'var(--inkt-3)' }} />
                      ))}
                      {afspraken.length > 3 && <span className="maand-meer">+{afspraken.length - 3}</span>}
                      {open.length > 0 && <span className="maand-taak" />}
                    </span>
                    <span className="maand-titels" aria-hidden="true">
                      {afspraken.slice(0, 2).map(a => (
                        <span key={a.id}>{isBezetVanAnder(a, huishouden.ik) ? 'Bezet' : a.titel}</span>
                      ))}
                      {afspraken.length > 2 && <span className="nog">+{afspraken.length - 2}</span>}
                    </span>
                  </button>
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <p className="maand-legenda" aria-hidden="true">
        <span><span className="maand-stip" style={{ background: 'var(--inkt-3)' }} /> afspraak</span>
        <span><span className="maand-taak" /> open taak</span>
      </p>
    </div>
  );
}
