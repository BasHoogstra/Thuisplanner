import { useApp } from '../lib/context';
import { dagLabel, langeDatum, plusDagen } from '../lib/datum';
import { afsprakenOp, isVoorbij } from '../lib/vandaag';
import { AfspraakRij } from '../components/Rijen';

/** Eenvoudige lijst van de komende twee weken. Een volledige agenda volgt in een latere fase. */
export function Agenda() {
  const { staat, vandaag, nu, openToevoegen } = useApp();
  const dagen = Array.from({ length: 14 }, (_, n) => plusDagen(vandaag, n))
    .map(datum => ({ datum, afspraken: afsprakenOp(staat.items, datum) }))
    .filter((d, n) => n === 0 || d.afspraken.length);

  return (
    <div className="scherm">
      <header className="kop">
        <h1>Agenda</h1>
        <p className="kop-samenvatting">De komende twee weken.</p>
      </header>
      {dagen.map(d => (
        <section key={d.datum} className="agenda-dag" aria-label={langeDatum(d.datum)}>
          <h2 className="sectie-kop">
            {dagLabel(d.datum, vandaag)}
            {dagLabel(d.datum, vandaag) !== langeDatum(d.datum) && <span className="kop-sub"> · {langeDatum(d.datum)}</span>}
          </h2>
          {d.afspraken.length ? (
            <ul className="lijst">
              {d.afspraken.map(a => <AfspraakRij key={a.id} a={a} voorbij={d.datum === vandaag && isVoorbij(a, nu)} />)}
            </ul>
          ) : (
            <p className="stil-tekst">Geen afspraken.</p>
          )}
        </section>
      ))}
      <button className="knop stil" onClick={() => openToevoegen('afspraak')}>Afspraak toevoegen</button>
      <p className="demo-noot">Demo: week- en maandweergave, herhaling en delen komen in een latere fase.</p>
    </div>
  );
}
