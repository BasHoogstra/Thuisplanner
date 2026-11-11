import { useApp } from '../lib/context';
import { taakPast } from '../lib/filter';
import { plannenMetTaken } from '../lib/plan';
import { takenZonderDatum } from '../lib/vandaag';
import { Afgerond } from './DagBlok';
import { IcPijl } from './Iconen';
import { TaakRij } from './Rijen';

/**
 * Taken zonder datum in de Agenda (A8, docs/thuisplanner-agenda.md): standaard ingeklapt, met een altijd zichtbare
 * telling ("Zonder datum · 2 open"), zodat ze nooit uit beeld verdwijnen. Open of dicht blijft staan tijdens het
 * navigeren (AgendaStand), niet na herladen. Afgeronde taken zijn apart in te klappen.
 * zij: in de zijkolom van de laptop-Dag; daar staat de lijst altijd open (CSS, vanaf 960 px) en is de knop een kopje.
 * Plan-taken (besluit 18, docs/thuisplanner-plannen.md §4.9) staan apart in de inklapbare groep "Taken uit plannen", zodat
 * ze vindbaar blijven zonder de lijst over te nemen. Afgeronde plan-taken staan alleen bij hun plan.
 */
export function ZonderDatum({ zij }: { zij?: boolean }) {
  const { agenda, zetAgenda, staat, openPlan } = useApp();
  const alle = takenZonderDatum(staat.items).filter(t => taakPast(t, agenda.filter));
  const taken = alle.filter(t => !t.planId);
  const uitPlannen = alle.filter(t => t.planId && !t.klaar);
  if (!taken.length && !uitPlannen.length) return null;
  const open = taken.filter(t => !t.klaar);
  const isOpen = !!agenda.zonderDatumOpen;
  const delen = [open.length ? `${open.length} open` : null, uitPlannen.length ? `${uitPlannen.length} uit plannen` : null].filter(Boolean);
  const telling = `· ${delen.length ? delen.join(' · ') : 'niets open'}`;
  const groepOpen = !!agenda.planTakenOpen;
  return (
    <section className={'zonder-datum' + (zij ? ' zij' : '') + (isOpen ? ' open' : '')} aria-labelledby="h-zonder-datum">
      <h2 id="h-zonder-datum" className="sectie-kop zd-kop">
        <button type="button" className="zd-knop" aria-expanded={isOpen} aria-controls="zd-inhoud"
          onClick={() => zetAgenda({ zonderDatumOpen: !isOpen })}>
          Zonder datum <span className="zd-telling">{telling}</span>
        </button>
        {zij && <span className="zd-titel">Zonder datum <span className="zd-telling">{telling}</span></span>}
      </h2>
      <div id="zd-inhoud" className="zd-inhoud">
        {open.length > 0 && <ul className="lijst" aria-label="Taken zonder datum">{open.map(t => <TaakRij key={t.id} t={t} metLidKleur />)}</ul>}
        <Afgerond taken={taken.filter(t => t.klaar)} naam="Afgerond zonder datum" />
        {uitPlannen.length > 0 && (
          <div className="zd-plannen">
            <button type="button" className="link uitklap zd-plannen-knop" aria-expanded={groepOpen} onClick={() => zetAgenda({ planTakenOpen: !groepOpen })}>
              Taken uit plannen <span className="zd-telling">· {uitPlannen.length} open</span> <IcPijl className={'uitklap-pijl' + (groepOpen ? ' open' : '')} width={16} height={16} />
            </button>
            {groepOpen && plannenMetTaken(staat.plannen, uitPlannen).map(({ plan, taken: vanPlan }) => (
              <div key={plan.id} className="zd-plan">
                <button type="button" className="zd-plan-kop" onClick={() => openPlan(plan.id)} aria-label={`Naar ${plan.titel}`}>
                  <span>{plan.titel} <span className="zd-telling">· {vanPlan.length} open</span></span>
                  <IcPijl width={16} height={16} />
                </button>
                <ul className="lijst" aria-label={`Taken uit ${plan.titel}`}>{vanPlan.map(t => <TaakRij key={t.id} t={t} metLidKleur zonderPlan />)}</ul>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
