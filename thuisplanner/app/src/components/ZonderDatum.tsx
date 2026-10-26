import { useApp } from '../lib/context';
import { taakPast } from '../lib/filter';
import { takenZonderDatum } from '../lib/vandaag';
import { Afgerond } from './DagBlok';
import { TaakRij } from './Rijen';

/**
 * Taken zonder datum in de Agenda (A8, docs/thuisplanner-agenda.md): standaard ingeklapt, met een altijd zichtbare
 * telling ("Zonder datum · 2 open"), zodat ze nooit uit beeld verdwijnen. Open of dicht blijft staan tijdens het
 * navigeren (AgendaStand), niet na herladen. Afgeronde taken zijn apart in te klappen.
 * zij: in de zijkolom van de laptop-Dag; daar staat de lijst altijd open (CSS, vanaf 960 px) en is de knop een kopje.
 */
export function ZonderDatum({ zij }: { zij?: boolean }) {
  const { agenda, zetAgenda, staat } = useApp();
  const taken = takenZonderDatum(staat.items).filter(t => taakPast(t, agenda.filter));
  if (!taken.length) return null;
  const open = taken.filter(t => !t.klaar);
  const isOpen = !!agenda.zonderDatumOpen;
  const telling = open.length ? `· ${open.length} open` : '· niets open';
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
      </div>
    </section>
  );
}
