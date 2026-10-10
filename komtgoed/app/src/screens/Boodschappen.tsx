import { useState, type FormEvent } from 'react';
import { useApp } from '../lib/context';
import { boodschappenMelding, splitsBoodschappen, voegBoodschappenToe } from '../lib/boodschappen';
import { isBoodschap } from '../lib/vandaag';
import { nieuwId } from '../lib/store';
import { BoodschapRij } from '../components/Rijen';

export function Boodschappen() {
  const { staat, vervangAlles, verwijder } = useApp();
  const [tekst, zetTekst] = useState('');
  const alle = staat.items.filter(isBoodschap);
  const open = alle.filter(b => !b.afgevinkt);
  const klaar = alle.filter(b => b.afgevinkt);

  function voegToe(e: FormEvent) {
    e.preventDefault();
    const namen = splitsBoodschappen(tekst);
    if (!namen.length) return;
    const r = voegBoodschappenToe(staat.items, namen, () => nieuwId('b'));
    vervangAlles(r.items, boodschappenMelding(r));
    zetTekst('');
  }

  return (
    <div className="scherm">
      <header className="kop">
        <h1>Boodschappen</h1>
        <p className="kop-samenvatting">
          {open.length ? `${open.length} ${open.length === 1 ? 'ding' : 'dingen'} nog nodig.` : 'Alles is in huis.'}
        </p>
      </header>
      <form className="snel" onSubmit={voegToe}>
        <label className="sr-only" htmlFor="snel-boodschap">Boodschappen toevoegen</label>
        <input id="snel-boodschap" value={tekst} onChange={e => zetTekst(e.target.value)}
          placeholder="Bijv. kaas, appels" autoComplete="off" maxLength={200} />
        <button className="knop" type="submit">Toevoegen</button>
      </form>

      <section aria-labelledby="h-nodig">
        <h2 id="h-nodig" className="sectie-kop">Nog nodig <span className="teller">{open.length}</span></h2>
        {open.length > 0
          ? <ul className="lijst">{open.map(b => <BoodschapRij key={b.id} b={b} />)}</ul>
          : <p className="stil-tekst">Niets meer nodig.</p>}
      </section>

      {klaar.length > 0 && (
        <section aria-labelledby="h-klaar" className="afgevinkt">
          <div className="blok-kop">
            <h2 id="h-klaar" className="sectie-kop">In het mandje <span className="teller">{klaar.length}</span></h2>
            <button type="button" className="link" onClick={() => verwijder(klaar.map(b => b.id), 'Mandje leeggemaakt')}>
              Mandje leegmaken
            </button>
          </div>
          <ul className="lijst">{klaar.map(b => <BoodschapRij key={b.id} b={b} />)}</ul>
        </section>
      )}
      <p className="demo-noot">Tik op het rondje om af te vinken, op de naam om aan te passen of te verwijderen.
        Demo: synchroniseren tussen telefoons en winkelvolgorde komen in een latere fase.</p>
    </div>
  );
}
