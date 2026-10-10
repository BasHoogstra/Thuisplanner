import { useApp } from '../lib/context';
import type { Scenario } from '../data/demo';

export function Meer() {
  const { huishouden, staat, kiesScenario, gaNaar } = useApp();

  const kies = (s: Scenario) => {
    kiesScenario(s, s === 'rustig' ? 'Demo: rustige dag' : 'Demo: gewone dag');
    gaNaar('vandaag');
  };

  return (
    <div className="scherm">
      <header className="kop">
        <h1>Meer</h1>
        <p className="kop-samenvatting">{huishouden.naam}</p>
      </header>

      <section aria-labelledby="h-leden" className="blok">
        <h2 id="h-leden" className="sectie-kop">Huishouden</h2>
        <ul className="lijst">
          {huishouden.leden.map(l => (
            <li key={l.id} className="rij lid">
              <span className="lid-avatar" style={{ background: l.kleur }} aria-hidden="true">{l.naam[0]}</span>
              <span className="rij-inhoud">
                <span className="rij-titel">{l.naam}{l.id === huishouden.ik && <span className="kop-sub"> (jij)</span>}</span>
                <span className="rij-sub">
                  <span className="plek">{l.soort === 'kind' ? 'Kind' : 'Volwassene'} · {l.heeftAccount ? 'met account' : 'zonder account'}</span>
                </span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="h-demo" className="blok demo-blok">
        <h2 id="h-demo" className="sectie-kop"><span className="demo-label">Demo</span> Probeer een andere dag</h2>
        <div className="keuzes">
          <button className={'keuze' + (staat.scenario === 'gewoon' ? ' aan' : '')} aria-pressed={staat.scenario === 'gewoon'}
            onClick={() => kies('gewoon')}>Gewone dag</button>
          <button className={'keuze' + (staat.scenario === 'rustig' ? ' aan' : '')} aria-pressed={staat.scenario === 'rustig'}
            onClick={() => kies('rustig')}>Rustige dag</button>
        </div>
        <p className="stil-tekst">Kiezen zet de demo terug naar het begin. Herladen doet dat ook.</p>
      </section>

      <section aria-labelledby="h-wat" className="blok">
        <h2 id="h-wat" className="sectie-kop">Wat werkt er in deze demo?</h2>
        <ul className="uitleg">
          <li><strong>Werkt:</strong> afspraken, taken en boodschappen toevoegen, openen, aanpassen en verwijderen; taken en boodschappen afvinken en weer openzetten; een agenda met dag-, week- en maandweergave en een filter per gezinslid; herhalende afspraken (dagelijks, wekelijks, maandelijks, jaarlijks) waarvan je één keer of de hele reeks wijzigt of verwijdert; ongedaan maken van de laatste wijziging; het meedenk-signaal accepteren of wegklikken.</li>
          <li><strong>Alleen in deze demo:</strong> alles staat in het geheugen van dit tabblad. Er is geen account, geen server en niets wordt opgeslagen of gedeeld.</li>
          <li><strong>Privé:</strong> een privé-afspraak van een ander zie je alleen als "bezet", zonder details, en je kunt hem niet wijzigen. In de echte app regelt de server dat, niet het scherm.</li>
          <li><strong>Nog niet:</strong> inloggen, uitnodigen, synchroniseren, meldingen, herhalende taken.</li>
        </ul>
        <p className="stil-tekst">Het gezin De Boer is verzonnen. KomtGoed is een werknaam.</p>
      </section>
    </div>
  );
}
