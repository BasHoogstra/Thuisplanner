import { useState } from 'react';
import { useApp } from '../lib/context';
import { plekVoor, titelVoor } from '../lib/rechten';
import { begroeting, korteDag, langeDatum, plusDagen } from '../lib/datum';
import {
  achterstand, afgerondVandaag, afsprakenOp, isVoorbij, komendeAfspraken, loopt, meedenker, openBoodschappen, samenvatting,
  takenOverzicht, takenVandaag, type TaakGroep,
} from '../lib/vandaag';
import { AfspraakRij, TaakRij, Wie, tijdTekst } from '../components/Rijen';
import { IcPijl } from '../components/Iconen';
import { UitnodigingMelding } from '../components/Onboarding';
import { nieuwId } from '../lib/store';
import { isTaak } from '../lib/vandaag';
import { vakantieVoorVandaag, wanneerKort } from '../lib/vakantie';
import { IcKoffer } from '../components/Iconen';
import type { AgendaStand } from '../lib/context';
import type { Datum } from '../lib/types';

/**
 * Overzicht (besluit 19, 23 november 2026), het startscherm. Intern heet het scherm nog "vandaag" (ook het adres), zodat
 * bestaande links blijven werken. Vaste onderdelen met een maximum, elk met een link naar de volledige lijst:
 * - Afspraken: de 3 eerstvolgende met een tijd (vandaag en de komende 7 dagen); de eerste van vandaag als enige nadruk;
 *   afspraken van de hele dag op één eigen regel.
 * - Te doen: 5 open taken in een vaste volgorde (te laat, vandaag, deze week, zonder datum, later); de rest per groep.
 * - Boodschappen in één regel, de vakantie en één suggestie alleen als die spelen. Een leeg onderdeel verdwijnt.
 */
const TAKEN_MAX = 5;

/** "Vandaag", "Morgen", anders "vr 27". */
function dagKort(d: Datum, vandaag: Datum): string {
  return d === vandaag ? 'Vandaag' : d === plusDagen(vandaag, 1) ? 'Morgen' : korteDag(d);
}

/** Het label op een taakrij: te laat (met hoe lang), niets voor vandaag, anders de dag of "geen datum". */
function taakLabel(groep: TaakGroep, datum: Datum | null, vandaag: Datum, achter: string): string | undefined {
  if (groep === 'te-laat') return achter;
  if (groep === 'vandaag') return undefined;
  return datum ? dagKort(datum, vandaag) : 'geen datum';
}

const GROEP_WOORD: Record<TaakGroep, string> = {
  'te-laat': 'te laat', vandaag: 'vandaag', week: 'deze week', 'zonder-datum': 'zonder datum', later: 'later',
};

export function Vandaag() {
  const app = useApp();
  const { staat, vandaag, nu, uur, huishouden, lid } = app;
  const ik = lid(huishouden.ik);
  const afsprakenVandaag = afsprakenOp(staat.items, vandaag);
  const voorbij = afsprakenVandaag.filter(a => isVoorbij(a, nu));
  const komend = komendeAfspraken(staat.items, vandaag, nu);
  const [eersteKomend, ...verderKomend] = komend.eerst;
  const nadruk = eersteKomend && eersteKomend.datum === vandaag ? eersteKomend.afspraak : undefined;
  const rijen = nadruk ? verderKomend : komend.eerst;
  const taken = takenVandaag(staat.items, vandaag);
  const overzicht = takenOverzicht(staat.items, vandaag, TAKEN_MAX);
  const dringendOpen = overzicht.zichtbaar.some(z => z.groep === 'te-laat' || z.groep === 'vandaag');
  const klaar = afgerondVandaag(staat.items, vandaag);
  const [toonKlaar, zetToonKlaar] = useState(false);
  const boodschappen = openBoodschappen(staat.items);
  const signaal = meedenker(staat.items, vandaag, staat.weggeklikt, huishouden.ik);
  const vk = vakantieVoorVandaag(staat.vakanties, vandaag);
  // Elke doorklik vanaf het Overzicht (de koppen, de telregels en de regel "Hele dag") toont het hele gezin, zoals het
  // Overzicht zelf: een eerder gekozen persoonsfilter in de Agenda wordt gewist (review PR #55/#56). Gewone navigatie via
  // de navigatiebalk laat het filter staan.
  const naarAgenda = (stand: Partial<AgendaStand>) => { app.zetAgenda({ ...stand, filter: null }); app.gaNaar('agenda'); };
  const restDelen = (Object.entries(overzicht.rest) as [TaakGroep, number][]).filter(([, n]) => n > 0);
  const heeftAfspraken = komend.eerst.length > 0 || komend.heleDag.length > 0;
  const heleDagNamen = komend.heleDag.map(a => titelVoor(a, huishouden.ik));

  return (
    <div className="vandaag overzicht">
      <header className="kop">
        <p className="kop-datum">{langeDatum(vandaag)}</p>
        <h1>{begroeting(uur)}, {ik?.naam}</h1>
        <p className="kop-samenvatting">{samenvatting(afsprakenVandaag.length, taken.length, voorbij.length)}</p>
      </header>

      <div className="vandaag-raster">
        <div className="kolom-hoofd">
          {app.lokaal && (
            <UitnodigingMelding lijst={app.lokaal.uitnodigingen.melding} opBekijk={app.lokaal.uitnodigingen.bekijk}
              opAlle={() => app.gaNaar('meer')} opLater={app.lokaal.uitnodigingen.later} />
          )}

          {heeftAfspraken && (
            <section aria-labelledby="h-afspraken" className="overzicht-blok">
              <div className="blok-kop">
                <h2 id="h-afspraken" className="sectie-kop">Afspraken</h2>
                <button type="button" className="link blok-link" onClick={() => naarAgenda({ weergave: 'week', datum: vandaag })}>
                  Agenda <IcPijl />
                </button>
              </div>
              {nadruk && (
                <div className="straks" role="group" aria-label="Straks">
                  <button type="button" className="straks-knop" onClick={() => app.openItem(nadruk.id)}
                    aria-label={`${titelVoor(nadruk, huishouden.ik)}, ${tijdTekst(nadruk)}. Openen`}>
                    <span className="straks-label">{loopt(nadruk, nu) ? 'Nu' : 'Straks'} · {tijdTekst(nadruk)}</span>
                    <span className="straks-titel">{titelVoor(nadruk, huishouden.ik)}</span>
                    <span className="straks-sub">
                      <Wie ids={nadruk.wie} />
                      {plekVoor(nadruk, huishouden.ik) && <span className="plek">{plekVoor(nadruk, huishouden.ik)}</span>}
                    </span>
                  </button>
                </div>
              )}
              {rijen.length > 0 && (
                <ul className="lijst compact">
                  {rijen.map(k => <AfspraakRij key={`${k.datum}-${k.afspraak.id}`} a={k.afspraak} compact dag={dagKort(k.datum, vandaag)} />)}
                </ul>
              )}
              {komend.heleDag.length > 0 && (
                // Review PR #56 (P2): één compacte regel, hoe veel afspraken van de hele dag er ook zijn: de eerste titel
                // (afgekapt als die lang is), een telling, en een tik opent de hele dag in de Agenda. Een privé-afspraak van
                // een ander heet ook hier alleen "Bezet".
                <button type="button" className="hele-dag-regel" onClick={() => naarAgenda({ weergave: 'dag', datum: vandaag })}
                  aria-label={`Hele dag, ${heleDagNamen.length === 1 ? '1 afspraak' : `${heleDagNamen.length} afspraken`}: ${heleDagNamen.join(', ')}. Naar de dag in de Agenda`}>
                  <span className="hele-dag-label">Hele dag</span>
                  <span className="hele-dag-titel">{heleDagNamen[0]}</span>
                  {heleDagNamen.length > 1 && <span className="hele-dag-meer">+{heleDagNamen.length - 1}</span>}
                  <IcPijl className="hele-dag-pijl" />
                </button>
              )}
              {komend.nogVandaag > 0 && (
                <button type="button" className="link uitklap-regel" onClick={() => naarAgenda({ weergave: 'dag', datum: vandaag })}>
                  <span>Nog {komend.nogVandaag} vandaag · <span className="regel-link">hele dag</span></span>
                </button>
              )}
            </section>
          )}

          {(overzicht.zichtbaar.length > 0 || klaar.length > 0) && (
            <section aria-labelledby="h-taken" className="overzicht-blok">
              <div className="blok-kop">
                <h2 id="h-taken" className="sectie-kop">Te doen</h2>
                <button type="button" className="link blok-link" onClick={() => naarAgenda({ weergave: 'taken' })}>
                  Alle taken <IcPijl />
                </button>
              </div>
              {!dringendOpen && klaar.length > 0 && <p className="stil-tekst klaar-alles">Alles van vandaag is gedaan.</p>}
              {overzicht.zichtbaar.length > 0 && (
                <ul className="lijst compact">
                  {overzicht.zichtbaar.map(({ taak, groep }) => (
                    <TaakRij key={taak.id} t={taak} teLaat={groep === 'te-laat'}
                      extra={taakLabel(groep, taak.datum, vandaag, achterstand(taak, vandaag))} />
                  ))}
                </ul>
              )}
              {restDelen.length > 0 && (
                <button type="button" className="link uitklap-regel" onClick={() => naarAgenda({ weergave: 'taken' })}>
                  <span>
                    Nog{' '}
                    {restDelen.map(([groep, n], i) => (
                      <span key={groep} className={groep === 'te-laat' ? 'te-laat' : undefined}>
                        {i > 0 && ', '}{n} {GROEP_WOORD[groep]}
                      </span>
                    ))}
                    {' · '}<span className="regel-link">alle taken</span>
                  </span>
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

        {/* Boodschappen en de vakantie: korte regels; een leeg onderdeel verdwijnt. */}
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
