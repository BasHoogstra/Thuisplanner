import { useApp } from '../lib/context';
import { begroeting, korteDag, dagLabel, langeDatum } from '../lib/datum';
import {
  achterstand, afsprakenOp, binnenkort, isVoorbij, meedenker, openBoodschappen, samenvatting, straks, takenVandaag,
} from '../lib/vandaag';
import { AfspraakRij, TaakRij, Wie, tijdTekst } from '../components/Rijen';
import { IcPijl } from '../components/Iconen';
import { nieuwId } from '../lib/store';

export function Vandaag() {
  const app = useApp();
  const { staat, vandaag, nu, uur, huishouden, lid } = app;
  const ik = lid(huishouden.ik);
  const afspraken = afsprakenOp(staat.items, vandaag);
  const eerst = straks(staat.items, vandaag, nu);
  const overig = afspraken.filter(a => a !== eerst);
  const taken = takenVandaag(staat.items, vandaag);
  const boodschappen = openBoodschappen(staat.items);
  const vooruit = binnenkort(staat.items, vandaag);
  const signaal = meedenker(staat.items, vandaag, staat.weggeklikt);
  const rustig = !afspraken.length && !taken.length;

  return (
    <div className="vandaag">
      <header className="kop">
        <p className="kop-datum">{langeDatum(vandaag)}</p>
        <h1>{begroeting(uur)}, {ik?.naam}</h1>
        <p className="kop-samenvatting">{samenvatting(afspraken.length, taken.length)}</p>
      </header>

      <div className="vandaag-raster">
        <div className="kolom-hoofd">
          {rustig && (
            <section className="rust" aria-label="Rustige dag">
              <div className="rust-cirkel" aria-hidden="true" />
              <p className="rust-titel">Niets dat vandaag van je vraagt.</p>
              <p className="rust-tekst">Geniet ervan. Wat eraan komt, staat bij Binnenkort.</p>
            </section>
          )}

          {eerst && (
            <section className="straks" aria-label="Straks">
              <p className="sectie-label">{afspraken.some(a => isVoorbij(a, nu)) ? 'Hierna' : 'Straks'}</p>
              <p className="straks-tijd">{tijdTekst(eerst)}</p>
              <p className="straks-titel">{eerst.titel ?? 'Bezet'}</p>
              <p className="straks-sub">
                <Wie ids={eerst.wie} />
                {eerst.plek && <span className="plek">{eerst.plek}</span>}
              </p>
            </section>
          )}

          {overig.length > 0 && (
            <section aria-labelledby="h-agenda">
              <h2 id="h-agenda" className="sectie-kop">Agenda vandaag</h2>
              <ul className="lijst">
                {overig.map(a => <AfspraakRij key={a.id} a={a} voorbij={isVoorbij(a, nu)} />)}
              </ul>
            </section>
          )}

          {taken.length > 0 && (
            <section aria-labelledby="h-taken">
              <h2 id="h-taken" className="sectie-kop">Te doen</h2>
              <ul className="lijst">
                {taken.map(t => <TaakRij key={t.id} t={t} extra={achterstand(t, vandaag)} />)}
              </ul>
            </section>
          )}

          {signaal && (
            <section className="meedenker" aria-label="Meegedacht">
              <p>
                <span className="meedenker-wanneer">Morgen {signaal.afspraak.start} · {signaal.afspraak.titel}</span>
                <Wie ids={signaal.afspraak.wie} klein />
              </p>
              <p className="meedenker-vraag">{signaal.voorstel} vanavond?</p>
              <div className="meedenker-knoppen">
                <button className="knop klein" onClick={() => {
                  app.toevoegen([{ id: nieuwId('t'), soort: 'taak', titel: signaal.voorstel, datum: vandaag,
                    voor: huishouden.ik, klaar: false }]);
                  app.meld('Op je lijst voor vandaag gezet', { ongedaan: true });
                }}>Zet op mijn lijst</button>
                <button className="knop klein stil" onClick={() => app.wegklikken(signaal.afspraak.id)}>Niet nodig</button>
              </div>
            </section>
          )}
        </div>

        <div className="kolom-zij">
          <section aria-labelledby="h-boodschappen" className="blok">
            <div className="blok-kop">
              <h2 id="h-boodschappen" className="sectie-kop">Boodschappen</h2>
              <a className="link" href="#/boodschappen" onClick={e => { e.preventDefault(); app.gaNaar('boodschappen'); }}>
                Lijst <IcPijl />
              </a>
            </div>
            {boodschappen.length ? (
              <p className="boodschappen-kort">
                {boodschappen.slice(0, 4).map(b => b.naam).join(', ')}
                {boodschappen.length > 4 && <span className="nog"> en nog {boodschappen.length - 4}</span>}
              </p>
            ) : (
              <p className="stil-tekst">Niets nodig.</p>
            )}
          </section>

          <section aria-labelledby="h-binnenkort" className="blok">
            <h2 id="h-binnenkort" className="sectie-kop">Binnenkort</h2>
            {vooruit.length ? (
              <ul className="vooruit">
                {vooruit.map(d => (
                  <li key={d.datum}>
                    <span className="vooruit-dag" title={dagLabel(d.datum, vandaag)}>
                      {dagLabel(d.datum, vandaag) === 'Morgen' ? 'Morgen' : korteDag(d.datum)}
                    </span>
                    <span className="vooruit-wat">
                      {d.afspraken.slice(0, 2).map(a => (
                        <span key={a.id}>{a.start ? `${a.start} ` : ''}{a.titel ?? 'Bezet'}</span>
                      ))}
                      {d.afspraken.length > 2 && <span className="nog">+{d.afspraken.length - 2}</span>}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="stil-tekst">De komende dagen staat er niets bijzonders.</p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
