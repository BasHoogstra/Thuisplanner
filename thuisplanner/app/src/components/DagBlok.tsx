import { useState } from 'react';
import { useApp } from '../lib/context';
import { dagInhoud } from '../lib/kalender';
import { isVoorbij } from '../lib/vandaag';
import type { Datum, Taak } from '../lib/types';
import { AfspraakRij, TaakRij } from './Rijen';

/**
 * Eén dag als één blok (Agenda A4/A7, docs/thuisplanner-agenda.md): eerst de afspraken op tijd, een stippellijn, dan de
 * open taken. Afgeronde taken staan ingeklapt onderaan ("n afgerond · tonen"), zoals op Vandaag. Geen zichtbare kopjes;
 * voor schermlezers zijn het de lijsten "Afspraken", "Taken" en "Afgerond". Een lege dag is één rustige zin.
 * Geef `key={datum}` mee, zodat het uitklappen niet meegaat naar een andere dag.
 */
export function DagBlok({ datum }: { datum: Datum }) {
  const { agenda, staat, vandaag, nu } = useApp();
  const { afspraken, taken } = dagInhoud(staat.items, datum, agenda.filter);
  const open = taken.filter(t => !t.klaar);
  if (!afspraken.length && !taken.length) return <p className="stil-tekst dagblok-leeg">Niets gepland.</p>;
  return (
    <div className="dagblok">
      {afspraken.length > 0 && (
        <ul className="lijst" aria-label="Afspraken">
          {afspraken.map(a => <AfspraakRij key={a.id} a={a} voorbij={datum < vandaag || (datum === vandaag && isVoorbij(a, nu))} />)}
        </ul>
      )}
      {afspraken.length > 0 && taken.length > 0 && <div className="dagblok-scheiding" aria-hidden="true" />}
      {open.length > 0 && <ul className="lijst" aria-label="Taken">{open.map(t => <TaakRij key={t.id} t={t} metLidKleur />)}</ul>}
      <Afgerond taken={taken.filter(t => t.klaar)} />
    </div>
  );
}

/** A7: afgeronde taken ingeklapt achter "n afgerond · tonen / verbergen"; standaard dicht. Niets als er geen zijn. */
export function Afgerond({ taken, naam = 'Afgerond' }: { taken: Taak[]; naam?: string }) {
  const [toon, zetToon] = useState(false);
  if (!taken.length) return null;
  return (
    <div className="afgerond">
      <button type="button" className="link afgerond-knop" aria-expanded={toon} onClick={() => zetToon(!toon)}>
        {taken.length} afgerond {toon ? '· verbergen' : '· tonen'}
      </button>
      {toon && <ul className="lijst" aria-label={naam}>{taken.map(t => <TaakRij key={t.id} t={t} metLidKleur />)}</ul>}
    </div>
  );
}
