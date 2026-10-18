import { useApp } from '../lib/context';
import { HuishoudenBeheer } from '../components/HuishoudenBeheer';
import type { Scenario } from '../data/demo';
import { HerstelKnoppen } from '../components/Lokaal';
import { Account } from '../components/Account';
import type { Item, SyncVelden } from '../lib/types';

const naamVan = (i: Item) => (i.soort === 'boodschap' ? i.naam
  : i.sync === 'zonder-inhoud' ? 'Privé-afspraak (inhoud niet op dit toestel)' : i.titel ?? 'Afspraak (privé)');

export function Meer() {
  const { huishouden, staat, kiesScenario, gaNaar, lokaal } = useApp();
  if (lokaal) return <MeerLokaal />;

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
        <p className="stil-tekst">Het gezin De Boer is verzonnen.</p>
      </section>
    </div>
  );
}

/** Meer in de lokale modus: account, onbevestigde opdrachten op dit toestel, en wat er al echt werkt. */
function MeerLokaal() {
  const { huishouden, staat, lokaal } = useApp();
  if (!lokaal) return null;
  const onbevestigd = staat.items.filter(i => i.sync && i.sync !== 'wachtend');
  // Bewaard op dit toestel, maar niet (meer) zichtbaar in de lijst (bijvoorbeeld na uitloggen en weer inloggen).
  const zichtbaar = new Set(onbevestigd.map(i => i.id));
  const los = lokaal.openstaand.filter(o => o.staat !== 'verzenden' && !zichtbaar.has(o.id));
  return (
    <div className="scherm">
      <header className="kop">
        <h1>Meer</h1>
        <p className="kop-samenvatting">{huishouden.naam}</p>
      </header>

      <HuishoudenBeheer />

      <Account />

      <section aria-labelledby="h-onbevestigd" className="blok">
        <h2 id="h-onbevestigd" className="sectie-kop">Niet bevestigd</h2>
        {onbevestigd.length === 0 && los.length === 0 ? (
          <p className="stil-tekst">Alles is door de server bevestigd.</p>
        ) : (
          <ul className="lijst">
            {onbevestigd.map(i => (
              <li key={i.id} className="rij herstel-rij">
                <span className="rij-inhoud">
                  <span className="rij-titel">{naamVan(i)}</span>
                  <HerstelKnoppen id={i.id} sync={i.sync as SyncVelden['sync']} />
                </span>
              </li>
            ))}
            {los.map(o => (
              <li key={o.id} className="rij herstel-rij">
                <span className="rij-inhoud">
                  <span className="rij-titel">Een {o.soort} van eerder op dit toestel</span>
                  <HerstelKnoppen id={o.id} sync="onzeker" />
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

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

      <section aria-labelledby="h-wat" className="blok">
        <h2 id="h-wat" className="sectie-kop">Wat werkt er in deze lokale versie?</h2>
        <ul className="uitleg">
          <li><strong>Echt (lokale database):</strong> inloggen met een code uit je mail (of met een fictief account); een huishouden aanmaken; uitnodigen, ook per mail; afspraken, taken en boodschappen toevoegen, aanpassen, afvinken en verwijderen; herhalende afspraken (één keer of de hele reeks); wijzigingen verschijnen op het andere toestel; privé-afspraken van een ander zie je als "bezet" (de server stuurt de details niet mee); een gelijktijdige wijziging wordt geweigerd in plaats van overschreven.</li>
          <li><strong>Nog niet:</strong> ongedaan maken, meldingen, herhalende taken, het meedenk-signaal onthouden (wegklikken geldt alleen voor dit tabblad).</li>
          <li><strong>Alleen lokaal:</strong> een testdatabase op dit netwerk met een verzonnen gezin. Dit is geen productieversie.</li>
        </ul>
      </section>
    </div>
  );
}
