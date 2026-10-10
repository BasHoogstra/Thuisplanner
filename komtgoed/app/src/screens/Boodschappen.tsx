import { useState, type FormEvent } from 'react';
import { useApp } from '../lib/context';
import { isBoodschap } from '../lib/vandaag';
import { nieuwId } from '../lib/store';
import { BoodschapRij } from '../components/Rijen';
import { splitsBoodschappen } from '../components/Toevoegen';

export function Boodschappen() {
  const { staat, toevoegen, verwijder, meld } = useApp();
  const [tekst, zetTekst] = useState('');
  const alle = staat.items.filter(isBoodschap);
  const open = alle.filter(b => !b.afgevinkt);
  const klaar = alle.filter(b => b.afgevinkt);

  function voegToe(e: FormEvent) {
    e.preventDefault();
    const namen = splitsBoodschappen(tekst);
    if (!namen.length) return;
    toevoegen(namen.map(naam => ({ id: nieuwId('b'), soort: 'boodschap' as const, naam, afgevinkt: false })));
    zetTekst('');
  }

  return (
    <div className="scherm">
      <header className="kop">
        <h1>Boodschappen</h1>
        <p className="kop-samenvatting">
          {open.length ? `${open.length} ${open.length === 1 ? 'ding' : 'dingen'} op de lijst.` : 'Alles is in huis.'}
        </p>
      </header>
      <form className="snel" onSubmit={voegToe}>
        <label className="sr-only" htmlFor="snel-boodschap">Boodschap toevoegen</label>
        <input id="snel-boodschap" value={tekst} onChange={e => zetTekst(e.target.value)}
          placeholder="Toevoegen, bijv. kaas, appels" autoComplete="off" maxLength={120} />
        <button className="knop" type="submit">Toevoegen</button>
      </form>
      {open.length > 0 && <ul className="lijst">{open.map(b => <BoodschapRij key={b.id} b={b} />)}</ul>}
      {klaar.length > 0 && (
        <section aria-labelledby="h-klaar" className="afgevinkt">
          <div className="blok-kop">
            <h2 id="h-klaar" className="sectie-kop">In het mandje</h2>
            <button className="link" onClick={() => {
              verwijder(klaar.map(b => b.id));
              meld('Afgevinkte boodschappen opgeruimd', { ongedaan: true });
            }}>Opruimen</button>
          </div>
          <ul className="lijst">{klaar.map(b => <BoodschapRij key={b.id} b={b} />)}</ul>
        </section>
      )}
      <p className="demo-noot">Demo: synchroniseren tussen telefoons en categorieën komen in een latere fase.</p>
    </div>
  );
}
