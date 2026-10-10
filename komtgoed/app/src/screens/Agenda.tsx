import { useState } from 'react';
import { useApp } from '../lib/context';
import { langeDatum, maandagVan, plusDagen, weekBereik, weekdagKort, weekNummer, vanDatum } from '../lib/datum';
import { afsprakenOp, isVoorbij, takenOp, takenZonderDatum } from '../lib/vandaag';
import { AfspraakRij, TaakRij } from '../components/Rijen';
import { IcPijl, IcPlus } from '../components/Iconen';

/**
 * Weekweergave: maandag tot en met zondag, per dag de afspraken en de taken.
 * Mobiel onder elkaar, desktop in zeven kolommen. Een lege dag blijft één rustige regel.
 */
export function Agenda() {
  const { staat, vandaag, nu, openToevoegen } = useApp();
  const [week, zetWeek] = useState(0);
  const maandag = plusDagen(maandagVan(vandaag), week * 7);
  const dagen = Array.from({ length: 7 }, (_, n) => plusDagen(maandag, n));
  const zonderDatum = takenZonderDatum(staat.items);

  return (
    <div className="scherm scherm-breed">
      <header className="kop">
        <h1>Agenda</h1>
        <div className="week-balk">
          <button type="button" className="icoonknop" onClick={() => zetWeek(week - 1)} aria-label="Vorige week">
            <IcPijl style={{ transform: 'rotate(180deg)' }} />
          </button>
          <p className="week-titel" aria-live="polite">
            <span>{week === 0 ? 'Deze week' : week === 1 ? 'Volgende week' : week === -1 ? 'Vorige week' : `Week ${weekNummer(maandag)}`}</span>
            <small>{weekBereik(maandag)} · week {weekNummer(maandag)}</small>
          </p>
          <button type="button" className="icoonknop" onClick={() => zetWeek(week + 1)} aria-label="Volgende week">
            <IcPijl />
          </button>
          {week !== 0 && <button type="button" className="link" onClick={() => zetWeek(0)}>Naar vandaag</button>}
        </div>
      </header>

      <div className="week">
        {dagen.map(datum => {
          const afspraken = afsprakenOp(staat.items, datum);
          const taken = takenOp(staat.items, datum);
          const leeg = !afspraken.length && !taken.length;
          const isVandaag = datum === vandaag;
          return (
            <section key={datum} className={'week-dag' + (isVandaag ? ' vandaag' : '') + (datum < vandaag ? ' verleden' : '') + (leeg ? ' leeg' : '')}
              aria-label={langeDatum(datum) + (isVandaag ? ', vandaag' : '')}>
              <div className="week-dag-kop">
                <h2>
                  <span className="week-dag-naam">{weekdagKort(datum)}</span>
                  <span className="week-dag-nr">{vanDatum(datum).getDate()}</span>
                  {isVandaag && <span className="week-dag-vandaag">vandaag</span>}
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

      {zonderDatum.length > 0 && (
        <section aria-labelledby="h-ooit" className="blok">
          <h2 id="h-ooit" className="sectie-kop">Taken zonder datum</h2>
          <ul className="lijst">{zonderDatum.map(t => <TaakRij key={t.id} t={t} />)}</ul>
        </section>
      )}
      <p className="demo-noot">Demo: herhaling, maandweergave en delen met anderen komen in een latere fase.</p>
    </div>
  );
}
