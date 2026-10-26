import { useState, type CSSProperties } from 'react';
import { useApp, type AgendaWeergave } from '../lib/context';
import {
  langeDatum, langeDatumHoofdletter, maandagVan, plusDagen, vanDatum, weekBereik, weekdagKort, weekNummer,
} from '../lib/datum';
import { useBreed } from '../lib/breedte';
import { beschrijfDag, dagInhoud, drukte, maandBegin, maandRaster, plusMaanden } from '../lib/kalender';
import { titelVoor } from '../lib/rechten';
import { isVoorbij } from '../lib/vandaag';
import type { Datum } from '../lib/types';
import { DagBlok } from '../components/DagBlok';
import { lidKleur, WeekAfspraakRij, WeekTaakRij } from '../components/Rijen';
import { RestVanDeWeek, Weekstrip } from '../components/Weekstrip';
import { ZonderDatum } from '../components/ZonderDatum';
import { IcKoffer, IcLinks, IcPijl, IcPlus } from '../components/Iconen';
import { vakantiesOp } from '../lib/vakantie';

/**
 * F8: een dunne regel met de vakantie op deze dag (zonder terugdatum alleen op de vertrekdag). Tik opent de vakantie.
 * Staat boven het dagblok (Dag) en onder de dagkop (Week, op iPhone ook bij de gekozen dag); de weekstrip en "Rest van
 * de week" noemen de vakantie in tekst.
 */
function VakantieRegel({ datum }: { datum: Datum }) {
  const { staat, openVakantie } = useApp();
  const op = vakantiesOp(staat.vakanties, datum);
  if (!op.length) return null;
  return (
    <>
      {op.map(({ v, vertrek }) => (
        <button key={v.id} type="button" className="week-vakantie" onClick={() => openVakantie(v.id)} aria-label={`Vakantie ${v.naam}${vertrek ? ', vertrek' : ''}. Openen`}>
          <IcKoffer width={14} height={14} /> {v.naam}{vertrek && ' · vertrek'}
        </button>
      ))}
    </>
  );
}

const MAANDEN = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september',
  'oktober', 'november', 'december'];
const WEERGAVEN: { id: AgendaWeergave; label: string }[] = [
  { id: 'dag', label: 'Dag' }, { id: 'week', label: 'Week' }, { id: 'maand', label: 'Maand' },
];

export function Agenda() {
  const { agenda, zetAgenda, vandaag, huishouden, lokaal } = useApp();
  const { weergave, datum, filter } = agenda;
  // A6 (stap 4b): op iPhone en tablet staat het gezinsfilter achter één knop; op de laptop blijven de keuzes zichtbaar.
  const breed = useBreed();
  const [filterOpen, zetFilterOpen] = useState(false);
  const gekozen = filter ? huishouden.leden.find(l => l.id === filter) : undefined;
  const kiesFilter = (f: string | null) => { zetAgenda({ filter: f }); if (!breed) zetFilterOpen(false); };
  const stap = (n: number) => zetAgenda({
    datum: weergave === 'dag' ? plusDagen(datum, n) : weergave === 'week' ? plusDagen(datum, 7 * n) : plusMaanden(datum, n),
  });

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
        <div className="agenda-titelrij">
          <h1>Agenda</h1>
          {!breed && (
            <button type="button" className={'keuze klein filter-knop' + (gekozen ? ' aan' : '')} aria-expanded={filterOpen}
              aria-controls="agenda-filter" aria-label={`Wiens agenda: ${gekozen?.naam ?? 'Iedereen'}`} onClick={() => zetFilterOpen(!filterOpen)}>
              {gekozen && <span className="stip" style={{ background: gekozen.kleur }} aria-hidden="true" />}
              {gekozen?.naam ?? 'Iedereen'}
              <IcPijl className="filter-pijl" width={16} height={16} />
            </button>
          )}
        </div>
        <div className="agenda-balk">
          <div className="segment klein" role="tablist" aria-label="Weergave">
            {WEERGAVEN.map(w => (
              <button key={w.id} type="button" role="tab" aria-selected={weergave === w.id}
                className={'segment-knop' + (weergave === w.id ? ' aan' : '')} onClick={() => zetAgenda({ weergave: w.id })}>
                {w.label}
              </button>
            ))}
          </div>
          {(breed || filterOpen) && (
            <div id="agenda-filter" className="filter-rij" role="group" aria-label="Wiens agenda">
              <button type="button" className={'keuze klein' + (filter === null ? ' aan' : '')} aria-pressed={filter === null}
                onClick={() => kiesFilter(null)}>Iedereen</button>
              {huishouden.leden.map(l => (
                <button key={l.id} type="button" className={'keuze klein' + (filter === l.id ? ' aan' : '')} aria-pressed={filter === l.id}
                  onClick={() => kiesFilter(filter === l.id ? null : l.id)}>
                  <span className="stip" style={{ background: l.kleur }} aria-hidden="true" />{l.naam}
                </button>
              ))}
            </div>
          )}
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

      {weergave === 'dag' && <div className="dag-raster"><DagWeergave /><ZonderDatum zij /></div>}
      {weergave === 'week' && <><WeekWeergave /><ZonderDatum /></>}
      {weergave === 'maand' && <MaandWeergave />}
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
      <div className="dag-vakantie"><VakantieRegel datum={datum} /></div>
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

/**
 * Week (KG-3). Laptop: maandag t/m zondag naast elkaar (D6, tot stap 5). iPhone en tablet (A2/A3): de weekstrip, daaronder
 * de gekozen dag (agenda.datum) en de rest van de week. Een dag ziet er in beide hetzelfde uit (WeekDag).
 */
function WeekWeergave() {
  const breed = useBreed();
  const { agenda } = useApp();
  // A7: afgeronde taken staan per dag ingeklapt; dit zijn de dagen die de gebruiker heeft opengeklapt.
  const [klaarOpen, zetKlaarOpen] = useState<ReadonlySet<Datum>>(new Set());
  const wisselKlaar = (d: Datum) => zetKlaarOpen(oud => { const s = new Set(oud); if (!s.delete(d)) s.add(d); return s; });
  const maandag = maandagVan(agenda.datum);
  const dagen = Array.from({ length: 7 }, (_, n) => plusDagen(maandag, n));
  if (breed) {
    return <div className="week">{dagen.map(d => <WeekDag key={d} datum={d} klaarOpen={klaarOpen.has(d)} wisselKlaar={wisselKlaar} />)}</div>;
  }
  return (
    <div className="week-mobiel">
      <Weekstrip dagen={dagen} />
      <div className="week">
        <WeekDag datum={agenda.datum} klaarOpen={klaarOpen.has(agenda.datum)} wisselKlaar={wisselKlaar} />
      </div>
      <RestVanDeWeek dagen={dagen} />
    </div>
  );
}

/** Eén dag in de week: de dagkop (opent het dagoverzicht), de + van die dag, en compacte rijen met afgerond ingeklapt. */
function WeekDag({ datum, klaarOpen, wisselKlaar }: { datum: Datum; klaarOpen: boolean; wisselKlaar: (d: Datum) => void }) {
  const { agenda, zetAgenda, staat, vandaag, nu, openToevoegen } = useApp();
  const { afspraken, taken } = dagInhoud(staat.items, datum, agenda.filter);
  // Een dag met (alleen) een vakantie is niet "Niets gepland": de vakantieregel staat onder de dagkop.
  const vakantie = vakantiesOp(staat.vakanties, datum).length > 0;
  const leeg = !afspraken.length && !taken.length && !vakantie;
  const isVandaag = datum === vandaag;
  const klaar = taken.filter(t => t.klaar);
  return (
    <section className={'week-dag' + (isVandaag ? ' vandaag' : '') + (datum < vandaag ? ' verleden' : '') + (leeg ? ' leeg' : '')}
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
      <VakantieRegel datum={datum} />
      {(afspraken.length > 0 || taken.length > 0) && (
        <ul className="lijst week-lijst">
          {afspraken.map(a => <WeekAfspraakRij key={a.id} a={a} voorbij={datum < vandaag || (isVandaag && isVoorbij(a, nu))} />)}
          {taken.filter(t => !t.klaar).map(t => <WeekTaakRij key={t.id} t={t} />)}
          {klaar.length > 0 && (
            <li className="week-afgerond">
              <button type="button" className="link afgerond-knop" aria-expanded={klaarOpen} onClick={() => wisselKlaar(datum)}
                aria-label={`${klaar.length} afgerond op ${langeDatum(datum)}, ${klaarOpen ? 'verbergen' : 'tonen'}`}>
                {klaar.length} afgerond
              </button>
            </li>
          )}
          {klaarOpen && klaar.map(t => <WeekTaakRij key={t.id} t={t} />)}
        </ul>
      )}
    </section>
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
              const beschrijving = beschrijfDag(afspraken.length, open.length);
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
