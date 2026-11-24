import { useState } from 'react';
import { useApp } from '../lib/context';
import { plekVoor, titelVoor } from '../lib/rechten';
import { begroeting, korteDag, dagLabel, langeDatum } from '../lib/datum';
import {
  achterstand, afgerondVandaag, afsprakenOp, binnenkort, eerstvolgende, isVoorbij, loopt, meedenker, openBoodschappen, samenvatting, takenVandaag,
} from '../lib/vandaag';
import { AfspraakRij, TaakRij, Wie, afspraakNaam, tijdTekst } from '../components/Rijen';
import { IcPijl } from '../components/Iconen';
import { UitnodigingMelding } from '../components/Onboarding';
import { nieuwId } from '../lib/store';
import { isTaak } from '../lib/vandaag';
import { vakantieVoorVandaag, wanneerKort } from '../lib/vakantie';
import { IcKoffer } from '../components/Iconen';
import type { AgendaStand } from '../lib/context';

/**
 * Hoeveel rijen een blok op Vandaag hoogstens toont (voorstel "rust vóór informatiedichtheid", 23 november 2026). Is het
 * er meer, dan staan er vier en klapt de rest in achter één regel, zodat er nooit één rij achter een knop verdwijnt.
 */
const ZICHTBAAR = 5;
function eerste<T>(lijst: T[]): T[] {
  return lijst.length > ZICHTBAAR ? lijst.slice(0, ZICHTBAAR - 1) : lijst;
}

export function Vandaag() {
  const app = useApp();
  const { staat, vandaag, nu, uur, huishouden, lid } = app;
  const ik = lid(huishouden.ik);
  const afspraken = afsprakenOp(staat.items, vandaag);
  const eerst = eerstvolgende(afspraken, nu);
  const overig = afspraken.filter(a => a !== eerst);
  // Wat voorbij is klapt in. "Daarna" (de volgende afspraak met een tijd) staat in de Straks-kaart en niet nog eens in de
  // lijst. Van wat nog komt staan er hoogstens vijf in beeld.
  const voorbij = overig.filter(a => isVoorbij(a, nu));
  const daarna = eerst ? overig.find(a => a.start !== undefined && !isVoorbij(a, nu)) : undefined;
  const komend = overig.filter(a => !isVoorbij(a, nu) && a !== daarna);
  const taken = takenVandaag(staat.items, vandaag);
  const klaar = afgerondVandaag(staat.items, vandaag);
  const [toonKlaar, zetToonKlaar] = useState(false);
  const [toonVoorbij, zetToonVoorbij] = useState(false);
  const [toonLater, zetToonLater] = useState(false);
  const [toonTaken, zetToonTaken] = useState(false);
  const boodschappen = openBoodschappen(staat.items);
  const vooruit = binnenkort(staat.items, vandaag).slice(0, 3);
  const signaal = meedenker(staat.items, vandaag, staat.weggeklikt, huishouden.ik);
  const vk = vakantieVoorVandaag(staat.vakanties, vandaag);
  const komendZichtbaar = toonLater ? komend : eerste(komend);
  const komendVerborgen = komend.slice(komendZichtbaar.length);
  const takenZichtbaar = toonTaken ? taken : eerste(taken);
  const takenVerborgen = taken.length - takenZichtbaar.length;
  // Een doorklik vanaf Vandaag toont het hele gezin, zoals Vandaag zelf: een eerder gekozen persoonsfilter in de Agenda wordt
  // gewist (review PR #55). Gewone navigatie via de navigatiebalk laat het filter staan.
  const naarAgenda = (stand: Partial<AgendaStand>) => { app.zetAgenda({ ...stand, filter: null }); app.gaNaar('agenda'); };

  return (
    <div className="vandaag">
      <header className="kop">
        <p className="kop-datum">{langeDatum(vandaag)}</p>
        <h1>{begroeting(uur)}, {ik?.naam}</h1>
        <p className="kop-samenvatting">{samenvatting(afspraken.length, taken.length, voorbij.length)}</p>
      </header>

      <div className="vandaag-raster">
        <div className="kolom-hoofd">
          {app.lokaal && (
            <UitnodigingMelding lijst={app.lokaal.uitnodigingen.melding} opBekijk={app.lokaal.uitnodigingen.bekijk}
              opAlle={() => app.gaNaar('meer')} opLater={app.lokaal.uitnodigingen.later} />
          )}

          {eerst && (
            <section className="straks" aria-label="Straks">
              <button type="button" className="straks-knop" onClick={() => app.openItem(eerst.id)}
                aria-label={`${titelVoor(eerst, huishouden.ik)}, ${tijdTekst(eerst)}. Openen`}>
                <span className="straks-label">{loopt(eerst, nu) ? 'Nu' : 'Straks'} · {tijdTekst(eerst)}</span>
                <span className="straks-titel">{titelVoor(eerst, huishouden.ik)}</span>
                <span className="straks-sub">
                  <Wie ids={eerst.wie} />
                  {plekVoor(eerst, huishouden.ik) && <span className="plek">{plekVoor(eerst, huishouden.ik)}</span>}
                </span>
              </button>
              {daarna && (
                <div role="group" aria-label="Daarna">
                  <button type="button" className="straks-daarna" onClick={() => app.openItem(daarna.id)}
                    aria-label={`${afspraakNaam(daarna, huishouden.ik)}. Openen`}>
                    Daarna <strong>{daarna.start} {titelVoor(daarna, huishouden.ik)}</strong>
                  </button>
                </div>
              )}
            </section>
          )}

          {(komend.length > 0 || voorbij.length > 0) && (
            <section aria-labelledby="h-agenda">
              <div className="blok-kop">
                <h2 id="h-agenda" className="sectie-kop">Agenda vandaag</h2>
                <button type="button" className="link blok-link" onClick={() => naarAgenda({ weergave: 'dag', datum: vandaag })}>
                  Naar Agenda <IcPijl />
                </button>
              </div>
              {voorbij.length > 0 && (
                <button type="button" className="link uitklap-regel" aria-expanded={toonVoorbij} onClick={() => zetToonVoorbij(!toonVoorbij)}>
                  {voorbij.length} voorbij {toonVoorbij ? '· verbergen' : '· tonen'}
                </button>
              )}
              {(komendZichtbaar.length > 0 || toonVoorbij) && (
                <ul className="lijst compact">
                  {toonVoorbij && voorbij.map(a => <AfspraakRij key={a.id} a={a} voorbij compact />)}
                  {komendZichtbaar.map(a => <AfspraakRij key={a.id} a={a} compact />)}
                </ul>
              )}
              {komendVerborgen.length > 0 && (
                <button type="button" className="link uitklap-regel" aria-expanded={false} onClick={() => zetToonLater(true)}>
                  Nog {komendVerborgen.length} later: {komendVerborgen.map(a => titelVoor(a, huishouden.ik)).join(', ')}
                </button>
              )}
            </section>
          )}

          {(taken.length > 0 || klaar.length > 0) && (
            <section aria-labelledby="h-taken">
              <div className="blok-kop">
                <h2 id="h-taken" className="sectie-kop">Te doen</h2>
                <button type="button" className="link blok-link" onClick={() => naarAgenda({ weergave: 'taken' })}>
                  Alle taken <IcPijl />
                </button>
              </div>
              {taken.length > 0 ? (
                <ul className="lijst compact">
                  {takenZichtbaar.map(t => <TaakRij key={t.id} t={t} extra={achterstand(t, vandaag)} teLaat={!!achterstand(t, vandaag)} />)}
                </ul>
              ) : (
                <p className="stil-tekst klaar-alles">Alles van vandaag is gedaan.</p>
              )}
              {takenVerborgen > 0 && (
                <button type="button" className="link uitklap-regel" aria-expanded={false} onClick={() => zetToonTaken(true)}>
                  Nog {takenVerborgen} {takenVerborgen === 1 ? 'taak' : 'taken'} · tonen
                </button>
              )}
              {klaar.length > 0 && (
                <div className="afgerond">
                  <button type="button" className="link afgerond-knop" aria-expanded={toonKlaar}
                    onClick={() => zetToonKlaar(!toonKlaar)}>
                    {klaar.length} afgerond vandaag {toonKlaar ? '· verbergen' : '· tonen'}
                  </button>
                  {toonKlaar && (
                    <ul className="lijst compact" aria-label="Afgerond vandaag">
                      {klaar.map(t => <TaakRij key={t.id} t={t} />)}
                    </ul>
                  )}
                </div>
              )}
            </section>
          )}

          {signaal && (
            <section className="meedenker" aria-label="Meegedacht">
              <div className="meedenker-tekst">
                <p className="meedenker-vraag">{signaal.voorstel} vanavond?</p>
                <p>
                  <span className="meedenker-wanneer">Morgen {signaal.afspraak.start} · {signaal.afspraak.titel}</span>
                  <Wie ids={signaal.afspraak.wie} klein />
                </p>
              </div>
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

        {/* F8 en het voorstel van 23 november: één rustige strook met korte regels; een leeg onderdeel verdwijnt. */}
        <div className="kolom-zij verder">
          {boodschappen.length > 0 && (
            <section aria-labelledby="h-boodschappen" className="blok verder-blok">
              <div className="blok-kop">
                <h2 id="h-boodschappen" className="sectie-kop">Boodschappen</h2>
                <a className="link blok-link" href="#/boodschappen" onClick={e => { e.preventDefault(); app.gaNaar('boodschappen'); }}>
                  Lijst <IcPijl />
                </a>
              </div>
              <p className="boodschappen-kort">
                {boodschappen.slice(0, 4).map(b => b.naam).join(', ')}
                {boodschappen.length > 4 && <span className="nog"> en nog {boodschappen.length - 4}</span>}
              </p>
            </section>
          )}

          {vooruit.length > 0 && (
            <section aria-labelledby="h-binnenkort" className="blok verder-blok">
              <h2 id="h-binnenkort" className="sectie-kop">Binnenkort</h2>
              <ul className="vooruit">
                {vooruit.map(d => (
                  <li key={d.datum}>
                    <span className="vooruit-dag" title={dagLabel(d.datum, vandaag)}>
                      {dagLabel(d.datum, vandaag) === 'Morgen' ? 'Morgen' : korteDag(d.datum)}
                    </span>
                    <span className="vooruit-wat">
                      {d.afspraken.slice(0, 2).map(a => `${a.start ? `${a.start} ` : ''}${titelVoor(a, huishouden.ik)}`).join(' · ')}
                      {d.afspraken.length > 2 && <span className="nog"> · +{d.afspraken.length - 2}</span>}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {vk && <VakantieKaart id={vk.id} />}
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
