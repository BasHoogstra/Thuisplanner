import { useApp } from '../lib/context';
import { langeDatum, langeDatumHoofdletter, vanDatum, weekdagKort } from '../lib/datum';
import { beschrijfDag, dagInhoud, drukte } from '../lib/kalender';
import { titelVoor } from '../lib/rechten';
import { vakantiesOp } from '../lib/vakantie';
import type { Datum, Vakantie } from '../lib/types';

/** F8: de vakanties op een dag als korte tekst ("Vakantie Frankrijk"); de regel zelf staat bij de gekozen dag. */
const vakantieTekst = (vakanties: Vakantie[], d: Datum) => vakantiesOp(vakanties, d).map(({ v }) => `Vakantie ${v.naam}`);

/**
 * De weekstrip op iPhone en tablet (Agenda A2, docs/thuisplanner-agenda.md): zeven dagen, per dag het nummer en één
 * neutraal streepje voor hoe vol de dag is. Vandaag heeft een ring, de gekozen dag (agenda.datum) is gevuld. Een tik
 * kiest de dag; de inhoud staat eronder.
 */
export function Weekstrip({ dagen }: { dagen: Datum[] }) {
  const { agenda, zetAgenda, staat, vandaag } = useApp();
  return (
    <div className="weekstrip-houder">
      <div className="weekstrip" role="group" aria-label="Kies een dag">
        {dagen.map(d => {
          const { afspraken, taken } = dagInhoud(staat.items, d, agenda.filter);
          const open = taken.filter(t => !t.klaar).length;
          return (
            <button key={d} type="button" aria-pressed={d === agenda.datum} onClick={() => zetAgenda({ datum: d })}
              className={'strip-dag' + (d === vandaag ? ' vandaag' : '') + (d < vandaag ? ' verleden' : '')}
              aria-label={`${langeDatum(d)}${d === vandaag ? ', vandaag' : ''}: ${[...vakantieTekst(staat.vakanties, d), beschrijfDag(afspraken.length, open)].join(', ')}`}>
              <span className="strip-naam" aria-hidden="true">{weekdagKort(d)}</span>
              <span className="strip-nr" aria-hidden="true">{vanDatum(d).getDate()}</span>
              <span className={'strip-drukte n' + drukte(afspraken.length + open)} aria-hidden="true" />
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Rest van de week (A3): de andere dagen van de week, elk op één regel met de vakantie (F8), de afspraaktitels en het
 * aantal open taken.
 * Voorbije dagen zijn rustiger. Een tik kiest die dag.
 */
export function RestVanDeWeek({ dagen }: { dagen: Datum[] }) {
  const { agenda, zetAgenda, staat, vandaag, huishouden } = useApp();
  return (
    <section className="rest-week" aria-labelledby="h-rest-week">
      <h2 id="h-rest-week" className="sectie-kop">Rest van de week</h2>
      <ul className="lijst rest-lijst">
        {dagen.filter(d => d !== agenda.datum).map(d => {
          const { afspraken, taken } = dagInhoud(staat.items, d, agenda.filter);
          const open = taken.filter(t => !t.klaar).length;
          const tekst = [...vakantieTekst(staat.vakanties, d), ...afspraken.map(a => titelVoor(a, huishouden.ik))];
          return (
            <li key={d}>
              <button type="button" onClick={() => zetAgenda({ datum: d })}
                className={'rest-dag' + (d === vandaag ? ' vandaag' : '') + (d < vandaag ? ' verleden' : '')}>
                <span className="rest-naam">{langeDatumHoofdletter(d).split(' ').slice(0, 2).join(' ')}</span>
                <span className="rest-tekst">
                  {tekst.length ? tekst.join(', ') : open ? '' : 'niets gepland'}
                </span>
                {open > 0 && <span className="rest-taken">{open} {open === 1 ? 'taak' : 'taken'}</span>}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
