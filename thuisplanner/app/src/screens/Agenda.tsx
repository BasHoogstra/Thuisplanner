import { useState, type CSSProperties } from 'react';
import { useApp, type AgendaWeergave } from '../lib/context';
import {
  langeDatum, langeDatumHoofdletter, maandagVan, plusDagen, vanDatum, weekBereik, weekdagKort, weekNummer,
} from '../lib/datum';
import { taakPast } from '../lib/filter';
import { dagInhoud, drukte, maandBegin, maandRaster, plusMaanden } from '../lib/kalender';
import { titelVoor } from '../lib/rechten';
import { isVoorbij, takenZonderDatum } from '../lib/vandaag';
import type { Datum } from '../lib/types';
import { DagBlok } from '../components/DagBlok';
import { lidKleur, TaakRij, WeekAfspraakRij, WeekTaakRij } from '../components/Rijen';
import { IcLinks, IcPijl, IcPlus } from '../components/Iconen';

const MAANDEN = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september',
  'oktober', 'november', 'december'];
const WEERGAVEN: { id: AgendaWeergave; label: string }[] = [
  { id: 'dag', label: 'Dag' }, { id: 'week', label: 'Week' }, { id: 'maand', label: 'Maand' },
];

export function Agenda() {
  const { agenda, zetAgenda, vandaag, huishouden, staat, lokaal } = useApp();
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
    <div className="scherm scherm-breed agenda">
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
      <p className="demo-noot">{lokaal ? 'Nog niet' : 'Demo'}: delen met mensen buiten het gezin en uitnodigingen komen in een latere fase.</p>
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

/** Eén dag (A4): het dagblok met afspraken en taken, en direct iets toevoegen op die datum. */
function DagWeergave() {
  const { agenda, openToevoegen } = useApp();
  const { datum } = agenda;
  return (
    <div className="dag-weergave" aria-label={`Dagoverzicht ${langeDatum(datum)}`} role="region">
      <DagBlok key={datum} datum={datum} />
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
  // A7: afgeronde taken staan per dag ingeklapt; dit zijn de dagen die de gebruiker heeft opengeklapt.
  const [klaarOpen, zetKlaarOpen] = useState<ReadonlySet<Datum>>(new Set());
  const wisselKlaar = (d: Datum) => zetKlaarOpen(oud => { const s = new Set(oud); if (!s.delete(d)) s.add(d); return s; });
  const maandag = maandagVan(agenda.datum);
  const dagen = Array.from({ length: 7 }, (_, n) => plusDagen(maandag, n));
  const inhoud = dagen.map(datum => ({ datum, ...dagInhoud(staat.items, datum, agenda.filter) }));
  const isLeeg = (i: number) => !inhoud[i].afspraken.length && !inhoud[i].taken.length;
  // Opeenvolgende lege dagen staan op mobiel samen op één regel (D5); op desktop blijft elke dag een eigen kolom (D6).
  const groepVan = (i: number) => {
    if (!isLeeg(i)) return null;
    let a = i; while (a > 0 && isLeeg(a - 1)) a--;
    let b = i; while (b < 6 && isLeeg(b + 1)) b++;
    return b > a ? { a, b } : null;
  };
  return (
    <div className="week">
      {inhoud.map(({ datum, afspraken, taken }, i) => {
        const leeg = isLeeg(i);
        const isVandaag = datum === vandaag;
        const klaar = taken.filter(t => t.klaar);
        const toonKlaar = klaarOpen.has(datum);
        const groep = groepVan(i);
        const groepKop = groep && groep.a === i && (
          <div key={'groep-' + datum} className="week-leeg-groep" aria-label={`${langeDatum(dagen[groep.a])} tot en met ${langeDatum(dagen[groep.b])}: niets gepland`} role="group">
            {dagen.slice(groep.a, groep.b + 1).map(d => (
              <span key={d} className={'leeg-dag' + (d < vandaag ? ' verleden' : '')}>
                <button type="button" className="dag-knop" onClick={() => zetAgenda({ weergave: 'dag', datum: d })} aria-label={`Dagoverzicht ${langeDatum(d)}`}>
                  <span className="week-dag-naam">{weekdagKort(d)}</span> <span className="week-dag-nr">{vanDatum(d).getDate()}</span>
                  {d === vandaag && <span className="week-dag-vandaag">vandaag</span>}
                </button>
                <button type="button" className="icoonknop klein stil-plus" onClick={() => openToevoegen(undefined, d)} aria-label={`Toevoegen op ${langeDatum(d)}`}>
                  <IcPlus width={14} height={14} />
                </button>
              </span>
            ))}
            <span className="week-leeg">niets gepland</span>
          </div>
        );
        return [groepKop, (
          <section key={datum} className={'week-dag' + (isVandaag ? ' vandaag' : '') + (datum < vandaag ? ' verleden' : '') + (leeg ? ' leeg' : '') + (groep ? ' in-groep' : '')}
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
              <button type="button" className="icoonknop klein stil-plus" onClick={() => openToevoegen(undefined, datum)}
                aria-label={`Toevoegen op ${langeDatum(datum)}`}>
                <IcPlus width={16} height={16} />
              </button>
            </div>
            {!leeg && (
              <ul className="lijst week-lijst">
                {afspraken.map(a => <WeekAfspraakRij key={a.id} a={a} voorbij={datum < vandaag || (isVandaag && isVoorbij(a, nu))} />)}
                {taken.filter(t => !t.klaar).map(t => <WeekTaakRij key={t.id} t={t} />)}
                {klaar.length > 0 && (
                  <li className="week-afgerond">
                    <button type="button" className="link afgerond-knop" aria-expanded={toonKlaar} onClick={() => wisselKlaar(datum)}
                      aria-label={`${klaar.length} afgerond op ${langeDatum(datum)}, ${toonKlaar ? 'verbergen' : 'tonen'}`}>
                      {klaar.length} afgerond
                    </button>
                  </li>
                )}
                {toonKlaar && klaar.map(t => <WeekTaakRij key={t.id} t={t} />)}
              </ul>
            )}
          </section>
        )];
      })}
    </div>
  );
}

/**
 * Maand (A5): een rustig raster. Mobiel per dag alleen het getal en één neutraal streepje voor hoe vol de dag is; desktop
 * de eerste twee titels (met een streepje in de lidkleur), "nog n" en "n taken". Geen legenda. Een dag aantikken opent
 * het dagoverzicht.
 */
function MaandWeergave() {
  const { agenda, zetAgenda, staat, vandaag, lid, huishouden } = useApp();
  const maand = vanDatum(agenda.datum).getMonth();
  const dagen = maandRaster(agenda.datum);
  return (
    <div className="maand">
      <div className="maand-raster" role="table" aria-label="Maandkalender">
        <div className="maand-koppen" role="row">
          {['maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag', 'zondag'].map(d => (
            <span key={d} role="columnheader" aria-label={d}>{d.slice(0, 2)}</span>
          ))}
        </div>
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
                <div key={datum} role="cell" className={'maand-dag' + (buiten ? ' buiten' : '') + (datum === vandaag ? ' vandaag' : '')
                  + (datum < vandaag ? ' verleden' : '')}>
                  <button type="button" className="maand-knop" onClick={() => zetAgenda({ weergave: 'dag', datum })}
                    aria-label={`${langeDatum(datum)}${datum === vandaag ? ' (vandaag)' : ''}: ${beschrijving}`}>
                    <span className="maand-nr">{vanDatum(datum).getDate()}</span>
                    <span className={'maand-drukte n' + drukte(afspraken.length + open.length)} aria-hidden="true" />
                    <span className="maand-titels" aria-hidden="true">
                      {afspraken.slice(0, 2).map(a => {
                        const kleur = lidKleur(a.wie, lid);
                        return <span key={a.id} style={kleur ? { '--kleur': kleur } as CSSProperties : undefined}>{titelVoor(a, huishouden.ik)}</span>;
                      })}
                      {afspraken.length > 2 && <span className="nog">nog {afspraken.length - 2}</span>}
                      {open.length > 0 && <span className="nog">{open.length} {open.length === 1 ? 'taak' : 'taken'}</span>}
                    </span>
                  </button>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
