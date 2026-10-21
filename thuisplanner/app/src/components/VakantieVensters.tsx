// F8 Vakanties: de kleine vensters (docs/thuisplanner-vakanties.md §4). Eén taak per venster, met dezelfde rustige
// onderdelen als de rest van de app (Venster, keuzes, knoppen).
import { useState } from 'react';
import { useApp } from '../lib/context';
import { isGeldigeDatum } from '../lib/datum';
import type { Groep } from '../lib/store';
import type { Boodschap, LidId, Pakitem, Vakantie, VakantieKoppeling } from '../lib/types';
import { groepNaam, overneemBronnen, pakGroepen, periode } from '../lib/vakantie';
import { Venster } from './Venster';

/** Nieuwe vakantie of naam, datums en bestemming aanpassen; bij een bestaande ook verwijderen. */
export function VakantieVenster({ bestaand, sluit }: { bestaand?: Vakantie; sluit: () => void }) {
  const app = useApp();
  const [naam, zetNaam] = useState(bestaand?.naam ?? '');
  const [vertrek, zetVertrek] = useState(bestaand?.vertrek ?? '');
  const [terug, zetTerug] = useState(bestaand?.terug ?? '');
  const [bestemming, zetBestemming] = useState(bestaand?.bestemming ?? '');
  const [fout, zetFout] = useState<string | null>(null);
  const [verwijderen, zetVerwijderen] = useState(false);
  const [bezig, zetBezig] = useState(false);

  async function bewaar(e: { preventDefault(): void }) {
    e.preventDefault();
    const n = naam.trim().replace(/\s+/g, ' ');
    if (!n) { zetFout('Geef de vakantie een naam.'); return; }
    if (vertrek && !isGeldigeDatum(vertrek)) { zetFout('Kies een geldige vertrekdatum.'); return; }
    if (terug && (!vertrek || !isGeldigeDatum(terug))) { zetFout(vertrek ? 'Kies een geldige terugdatum.' : 'Kies eerst een vertrekdatum.'); return; }
    if (vertrek && terug && terug < vertrek) { zetFout('De terugdatum ligt vóór het vertrek.'); return; }
    const velden = { naam: n, vertrek: vertrek || null, terug: (vertrek && terug) || null, bestemming: bestemming.trim() || undefined };
    if (bestaand) {
      app.vakantieBijwerken({ ...bestaand, ...velden }, `${n} aangepast`);
      sluit();
      return;
    }
    zetBezig(true);
    const id = await app.vakantieToevoegen(velden);
    zetBezig(false);
    sluit();
    if (id) app.openVakantie(id);
  }

  return (
    <Venster titel={bestaand ? 'Vakantie aanpassen' : 'Nieuwe vakantie'} sluit={sluit}>
      <form onSubmit={bewaar} noValidate>
        <label className="veld"><span className="veld-label">Naam</span>
          <input value={naam} maxLength={100} autoComplete="off" placeholder="Bijv. Frankrijk" autoFocus={!bestaand}
            onChange={e => { zetNaam(e.target.value); zetFout(null); }} />
        </label>
        <div className="vak-datums">
          <label className="veld"><span className="veld-label">Vertrek <span className="optioneel">(optioneel)</span></span>
            <input type="date" value={vertrek} onChange={e => { zetVertrek(e.target.value); if (!e.target.value) zetTerug(''); zetFout(null); }} />
          </label>
          <label className="veld"><span className="veld-label">Terug <span className="optioneel">(optioneel)</span></span>
            <input type="date" value={terug} min={vertrek || undefined} disabled={!vertrek}
              aria-describedby={!vertrek ? 'vak-terug-hulp' : undefined} onChange={e => { zetTerug(e.target.value); zetFout(null); }} />
          </label>
        </div>
        {!vertrek && <p id="vak-terug-hulp" className="veld-hulp">Een terugdatum kies je na de vertrekdatum.</p>}
        <label className="veld"><span className="veld-label">Bestemming <span className="optioneel">(optioneel)</span></span>
          <input value={bestemming} maxLength={100} autoComplete="off" placeholder="Bijv. Ardèche" onChange={e => zetBestemming(e.target.value)} />
        </label>
        {fout && <p className="veld-fout" role="alert">{fout}</p>}
        <button type="submit" className="knop breed" disabled={bezig} onClick={bewaar}>{bestaand ? 'Opslaan' : 'Vakantie toevoegen'}</button>
      </form>
      {bestaand && !verwijderen && (
        <button type="button" className="tekstknop vak-verwijder" onClick={() => zetVerwijderen(true)}>Vakantie verwijderen</button>
      )}
      {bestaand && verwijderen && (
        <div className="detail-bevestig" role="group" aria-label="Verwijderen bevestigen">
          <p>{bestaand.naam} verwijderen?</p>
          <p className="stil-tekst">Voorbereidingen en boodschappen blijven bestaan. Je kunt het direct ongedaan maken.</p>
          <button type="button" className="knop breed gevaar" onClick={() => { app.vakantieVerwijderen(bestaand); sluit(); app.openVakantie(null); }}>Ja, verwijderen</button>
          <button type="button" className="knop breed stil" onClick={() => zetVerwijderen(false)}>Nee, terug</button>
        </div>
      )}
    </Venster>
  );
}

/** Eén pakitem: tekst aanpassen, naar een andere persoon of Gezamenlijk, of verwijderen. */
export function PakitemVenster({ p, sluit }: { p: Pakitem; sluit: () => void }) {
  const app = useApp();
  const [naam, zetNaam] = useState(p.naam);
  const [lid, zetLid] = useState<LidId | null>(p.lid);
  const schoon = naam.trim().replace(/\s+/g, ' ');
  const gewijzigd = (schoon && schoon !== p.naam) || lid !== p.lid;
  function bewaar(e: { preventDefault(): void }) {
    e.preventDefault();
    if (!schoon) return;
    app.pakitemBijwerken(p, { ...(schoon !== p.naam ? { naam: schoon } : {}), ...(lid !== p.lid ? { lid } : {}) });
    sluit();
  }
  return (
    <Venster titel="Pakitem" sluit={sluit}>
      <form onSubmit={bewaar} noValidate>
        <label className="sr-only" htmlFor="pak-naam">Wat</label>
        <input id="pak-naam" className="detail-titel" value={naam} maxLength={100} autoComplete="off" onChange={e => zetNaam(e.target.value)} />
        <p className="veld-label pak-bij">Bij wie</p>
        <div className="keuzes" role="group" aria-label="Bij wie">
          {pakGroepen(app.huishouden).map(g => (
            <button key={g.id ?? 'gezamenlijk'} type="button" className={'keuze' + (lid === g.id ? ' aan' : '')} aria-pressed={lid === g.id} onClick={() => zetLid(g.id)}>
              {g.kleur && <span className="stip" style={{ background: g.kleur }} aria-hidden="true" />}{g.naam}
            </button>
          ))}
        </div>
        {gewijzigd && <button type="submit" className="knop breed" onClick={bewaar}>Opslaan</button>}
      </form>
      <div className="detail-acties">
        <button type="button" className="tekstknop vak-verwijder" onClick={() => { app.pakitemVerwijderen(p); sluit(); }}>Verwijderen</button>
      </div>
    </Venster>
  );
}

/** De paklijst van een eerdere vakantie overnemen: aanvullend, wat er al staat blijft staan. */
export function OvernemenVenster({ naar, sluit }: { naar: Vakantie; sluit: () => void }) {
  const app = useApp();
  const { staat, vandaag, huishouden } = app;
  // De laatste vakantie waar je geweest bent eerst; het aantal alleen als de paklijst hier bekend is.
  const aantal = (id: string) => staat.pakitems.filter(p => p.vakantieId === id).length;
  const bronnen = overneemBronnen(staat.vakanties, naar.id, vandaag, id => aantal(id) > 0);
  const [bron, zetBron] = useState<string | null>(() => bronnen[0]?.id ?? null);
  const [groep, zetGroep] = useState<Groep>('iedereen');
  if (!bronnen.length) {
    return (
      <Venster titel="Overnemen" sluit={sluit}>
        <p className="stil-tekst">Er is nog geen andere vakantie om een paklijst van over te nemen.</p>
        <button type="button" className="knop breed stil" onClick={sluit}>Sluiten</button>
      </Venster>
    );
  }
  return (
    <Venster titel="Paklijst overnemen" sluit={sluit}>
      <p className="stil-tekst">Wat er al op de lijst staat, blijft staan. Overgenomen items zijn nog niet afgevinkt.</p>
      <p className="veld-label pak-bij">Van welke vakantie</p>
      <ul className="lijst keuze-lijst" role="radiogroup" aria-label="Van welke vakantie">
        {bronnen.map(v => {
          const n = aantal(v.id);
          return (
            <li key={v.id} className="rij">
              <button type="button" role="radio" aria-checked={bron === v.id} className={'rij-knop' + (bron === v.id ? ' gekozen' : '')} onClick={() => zetBron(v.id)}>
                <span className={'keuze-rondje' + (bron === v.id ? ' aan' : '')} aria-hidden="true" />
                <span className="rij-inhoud">
                  <span className="rij-titel">{v.naam}</span>
                  <span className="rij-sub"><span>{periode(v, vandaag)}</span>{n > 0 && <span className="plek">{n} {n === 1 ? 'item' : 'items'}</span>}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <p className="veld-label pak-bij">Voor wie</p>
      <div className="keuzes" role="group" aria-label="Voor wie">
        <button type="button" className={'keuze' + (groep === 'iedereen' ? ' aan' : '')} aria-pressed={groep === 'iedereen'} onClick={() => zetGroep('iedereen')}>Iedereen</button>
        {pakGroepen(huishouden).map(g => (
          <button key={g.id ?? 'gezamenlijk'} type="button" className={'keuze' + (groep === g.id ? ' aan' : '')} aria-pressed={groep === g.id} onClick={() => zetGroep(g.id)}>
            {g.kleur && <span className="stip" style={{ background: g.kleur }} aria-hidden="true" />}{g.naam}
          </button>
        ))}
      </div>
      <button type="button" className="knop breed" disabled={!bron} onClick={() => { if (bron) app.paklijstOvernemen(bron, naar.id, groep); sluit(); }}>
        Overnemen
      </button>
    </Venster>
  );
}

/** Afvinken opnieuw beginnen (bijvoorbeeld voor de terugreis): voor de gekozen persoon of voor iedereen. */
export function OpnieuwVenster({ vakantie, groep, sluit }: { vakantie: Vakantie; groep: LidId | null; sluit: () => void }) {
  const app = useApp();
  return (
    <Venster titel="Afvinken opnieuw beginnen" sluit={sluit}>
      <p className="stil-tekst">Bijvoorbeeld voor de terugreis. De items blijven staan; alleen de vinkjes gaan weg. Je kunt het direct ongedaan maken.</p>
      <button type="button" className="knop breed" onClick={() => { app.vinkjesOpnieuw(vakantie.id, groep); sluit(); }}>
        Voor {groepNaam(app.huishouden, groep)}
      </button>
      <button type="button" className="knop breed stil" onClick={() => { app.vinkjesOpnieuw(vakantie.id, 'iedereen'); sluit(); }}>Voor iedereen</button>
    </Venster>
  );
}

/** Een boodschap voor deze vakantie: hij staat op de gewone lijst; hier alleen ontkoppelen of naar de lijst. */
export function VakantieBoodschapVenster({ b, k, vakantie, sluit }: { b: Boodschap; k?: VakantieKoppeling; vakantie: Vakantie; sluit: () => void }) {
  const app = useApp();
  return (
    <Venster titel={b.naam} sluit={sluit}>
      <p className="stil-tekst">
        {b.afgevinkt ? 'Gekocht.' : 'Staat op de boodschappenlijst.'} Afvinken in de winkel geldt ook hier: het is dezelfde boodschap.
      </p>
      {/* Hetzelfde venster als op de boodschappenlijst: één item, dus aanpassen geldt overal. */}
      <button type="button" className="knop breed" onClick={() => { sluit(); app.openItem(b.id); }}>Naam aanpassen</button>
      {k && !k.afgehandeld && (
        <button type="button" className="knop breed stil" onClick={() => { app.boodschapOntkoppelen(k, b.naam); sluit(); }}>
          Niet meer voor {vakantie.naam}
        </button>
      )}
      <button type="button" className="knop breed stil" onClick={() => { sluit(); app.gaNaar('boodschappen'); }}>Naar de boodschappenlijst</button>
    </Venster>
  );
}
