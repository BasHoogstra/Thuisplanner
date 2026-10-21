import { useState } from 'react';
import { useApp } from '../lib/context';
import { plekVoor, titelVoor } from '../lib/rechten';
import { begroeting, korteDag, dagLabel, langeDatum } from '../lib/datum';
import {
  achterstand, afgerondVandaag, afsprakenOp, binnenkort, isVoorbij, meedenker, openBoodschappen, samenvatting, straks, takenVandaag,
} from '../lib/vandaag';
import { AfspraakRij, TaakRij, Wie, tijdTekst } from '../components/Rijen';
import { IcPijl } from '../components/Iconen';
import { UitnodigingMelding } from '../components/Onboarding';
import { nieuwId } from '../lib/store';
import { isTaak } from '../lib/vandaag';
import { vakantieVoorVandaag, wanneerKort } from '../lib/vakantie';
import { IcKoffer } from '../components/Iconen';

export function Vandaag() {
  const app = useApp();
  const { staat, vandaag, nu, uur, huishouden, lid } = app;
  const ik = lid(huishouden.ik);
  const afspraken = afsprakenOp(staat.items, vandaag);
  const eerst = straks(staat.items, vandaag, nu);
  const overig = afspraken.filter(a => a !== eerst);
  const taken = takenVandaag(staat.items, vandaag);
  const klaar = afgerondVandaag(staat.items, vandaag);
  const [toonKlaar, zetToonKlaar] = useState(false);
  const boodschappen = openBoodschappen(staat.items);
  const vooruit = binnenkort(staat.items, vandaag);
  const signaal = meedenker(staat.items, vandaag, staat.weggeklikt, huishouden.ik);
  const rustig = !afspraken.length && !taken.length && !klaar.length;
  const vk = vakantieVoorVandaag(staat.vakanties, vandaag);

  return (
    <div className="vandaag">
      <header className="kop">
        <p className="kop-datum">{langeDatum(vandaag)}</p>
        <h1>{begroeting(uur)}, {ik?.naam}</h1>
        <p className="kop-samenvatting">{samenvatting(afspraken.length, taken.length)}</p>
      </header>

      <div className="vandaag-raster">
        <div className="kolom-hoofd">
          {app.lokaal && (
            <UitnodigingMelding lijst={app.lokaal.uitnodigingen.melding} opBekijk={app.lokaal.uitnodigingen.bekijk}
              opAlle={() => app.gaNaar('meer')} opLater={app.lokaal.uitnodigingen.later} />
          )}
          {rustig && (
            <section className="rust" aria-label="Rustige dag">
              <div className="rust-cirkel" aria-hidden="true" />
              <p className="rust-titel">Niets dat vandaag van je vraagt.</p>
              <p className="rust-tekst">Geniet ervan. Wat eraan komt, staat bij Binnenkort.</p>
            </section>
          )}

          {eerst && (
            <section className="straks" aria-label="Straks">
              <button type="button" className="straks-knop" onClick={() => app.openItem(eerst.id)}
                aria-label={`${titelVoor(eerst, huishouden.ik)}, ${tijdTekst(eerst)}. Openen`}>
                <span className="sectie-label">{afspraken.some(a => isVoorbij(a, nu)) ? 'Hierna' : 'Straks'}</span>
                <span className="straks-tijd">{tijdTekst(eerst)}</span>
                <span className="straks-titel">{titelVoor(eerst, huishouden.ik)}</span>
                <span className="straks-sub">
                  <Wie ids={eerst.wie} />
                  {plekVoor(eerst, huishouden.ik) && <span className="plek">{plekVoor(eerst, huishouden.ik)}</span>}
                </span>
              </button>
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

          {(taken.length > 0 || klaar.length > 0) && (
            <section aria-labelledby="h-taken">
              <h2 id="h-taken" className="sectie-kop">Te doen</h2>
              {taken.length > 0 ? (
                <ul className="lijst">
                  {taken.map(t => <TaakRij key={t.id} t={t} extra={achterstand(t, vandaag)} />)}
                </ul>
              ) : (
                <p className="stil-tekst klaar-alles">Alles van vandaag is gedaan.</p>
              )}
              {klaar.length > 0 && (
                <div className="afgerond">
                  <button type="button" className="link afgerond-knop" aria-expanded={toonKlaar}
                    onClick={() => zetToonKlaar(!toonKlaar)}>
                    {klaar.length} afgerond vandaag {toonKlaar ? '· verbergen' : '· tonen'}
                  </button>
                  {toonKlaar && (
                    <ul className="lijst" aria-label="Afgerond vandaag">
                      {klaar.map(t => <TaakRij key={t.id} t={t} />)}
                    </ul>
                  )}
                </div>
              )}
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
                    voor: huishouden.ik, klaar: false }], 'Op je lijst voor vandaag gezet');
                }}>Zet op mijn lijst</button>
                <button className="knop klein stil" onClick={() => app.wegklikken(signaal.afspraak.id)}>Niet nodig</button>
              </div>
            </section>
          )}
        </div>

        <div className="kolom-zij">
          {/* F8: rustig in de zijkolom, zodat "Straks" de enige nadruk blijft. */}
          {vk && <VakantieKaart id={vk.id} />}
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
                        <span key={a.id}>{a.start ? `${a.start} ` : ''}{titelVoor(a, huishouden.ik)}</span>
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

/** F8: één kaart vanaf 14 dagen vóór vertrek tot en met de laatste dag (docs/thuisplanner-vakanties.md §4.5). */
function VakantieKaart({ id }: { id: string }) {
  const { staat, vandaag, openVakantie } = useApp();
  const v = staat.vakanties.find(x => x.id === id);
  if (!v) return null;
  const open = staat.items.filter(isTaak).filter(t => t.vakantieId === v.id && !t.klaar).length;
  const pak = staat.pakitems.filter(p => p.vakantieId === v.id);
  const ingepakt = pak.filter(p => p.ingepakt).length;
  const wanneer = wanneerKort(v, vandaag);
  const delen = [open ? `${open} ${open === 1 ? 'voorbereiding' : 'voorbereidingen'} open` : '', pak.length ? `ingepakt ${ingepakt}/${pak.length}` : ''];
  const sub = delen.filter(Boolean).join(' · ');
  return (
    <section className="vakantie-kaart" aria-label="Vakantie">
      <button type="button" className="vakantie-kaart-knop" onClick={() => openVakantie(v.id)}
        aria-label={`${v.naam}, ${wanneer}${sub ? `, ${sub}` : ''}. Openen`}>
        <span className="vakantie-kaart-titel"><IcKoffer width={18} height={18} /> {v.naam} · {wanneer}</span>
        {sub && <span className="vakantie-kaart-sub">{sub}</span>}
      </button>
    </section>
  );
}
