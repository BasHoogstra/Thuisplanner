// F8 Vakanties: de kleine vensters (docs/thuisplanner-vakanties.md §4). Eén taak per venster, met dezelfde rustige
// onderdelen als de rest van de app (Venster, keuzes, knoppen).
import { useEffect, useRef, useState } from 'react';
import { useApp } from '../lib/context';
import { isGeldigeDatum } from '../lib/datum';
import type { Groep } from '../lib/store';
import type { Boodschap, PakDoel, Pakitem, Paklijst, Vakantie, VakantieKoppeling } from '../lib/types';
import { doelVan, groepNaam, overneemBronnen, pakGroepen, paklijstNaamFout, periode, zelfdeDoel } from '../lib/vakantie';
import { IcLabel, IcVink } from './Iconen';
import { Venster } from './Venster';

/**
 * Een melding (onderaan, boven de vensterlaag) mag geen knop van een venster bedekken, zoals "Ja, verwijderen" op een
 * kleine iPhone: bij het openen van een paklijstvenster gaat de melding van dat moment weg.
 */
function useMeldingWegBijOpenen() {
  const app = useApp();
  const bijOpenen = useRef(app.staat.melding?.id ?? null);
  useEffect(() => { if (bijOpenen.current != null) app.meldingWeg(bijOpenen.current); }, [app]);
}

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

/** Eén pakitem: tekst aanpassen, naar een andere persoon, Gezamenlijk of een extra lijst, of verwijderen. */
export function PakitemVenster({ p, sluit }: { p: Pakitem; sluit: () => void }) {
  const app = useApp();
  useMeldingWegBijOpenen();
  const [naam, zetNaam] = useState(p.naam);
  const [doel, zetDoel] = useState<PakDoel>(doelVan(p));
  const schoon = naam.trim().replace(/\s+/g, ' ');
  const verplaatst = !zelfdeDoel(doel, doelVan(p));
  const gewijzigd = (schoon && schoon !== p.naam) || verplaatst;
  function bewaar(e: { preventDefault(): void }) {
    e.preventDefault();
    if (!schoon) return;
    app.pakitemBijwerken(p, { ...(schoon !== p.naam ? { naam: schoon } : {}), ...(verplaatst ? { doel } : {}) });
    sluit();
  }
  return (
    <Venster titel="Pakitem" sluit={sluit}>
      <form onSubmit={bewaar} noValidate>
        <label className="sr-only" htmlFor="pak-naam">Wat</label>
        <input id="pak-naam" className="detail-titel" value={naam} maxLength={100} autoComplete="off" onChange={e => zetNaam(e.target.value)} />
        <p className="veld-label pak-bij">Bij wie</p>
        <div className="keuzes" role="group" aria-label="Bij wie">
          {pakGroepen(app.huishouden, app.staat.paklijsten, p.vakantieId).map(g => (
            <button key={g.sleutel} type="button" className={'keuze' + (zelfdeDoel(doel, g.doel) ? ' aan' : '')} aria-pressed={zelfdeDoel(doel, g.doel)} onClick={() => zetDoel(g.doel)}>
              {g.kleur && <span className="stip" style={{ background: g.kleur }} aria-hidden="true" />}
              {g.lijst && <IcLabel width={13} height={13} aria-hidden="true" />}{g.naam}
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
  // Extra lijsten van de gekozen bron: standaard allemaal mee (besluit 22 oktober 2026), elk uit te zetten.
  const bronLijsten = staat.paklijsten.filter(l => l.vakantieId === bron);
  const [uit, zetUit] = useState<Set<string>>(new Set());
  const mee = bronLijsten.filter(l => !uit.has(l.id)).map(l => l.id);
  const wissel = (id: string) => zetUit(u => { const n = new Set(u); if (n.has(id)) n.delete(id); else n.add(id); return n; });
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
          <button key={g.sleutel} type="button" className={'keuze' + (groep !== 'iedereen' && zelfdeDoel(groep, g.doel) ? ' aan' : '')}
            aria-pressed={groep !== 'iedereen' && zelfdeDoel(groep, g.doel)} onClick={() => zetGroep(g.doel)}>
            {g.kleur && <span className="stip" style={{ background: g.kleur }} aria-hidden="true" />}{g.naam}
          </button>
        ))}
      </div>
      {groep === 'iedereen' && bronLijsten.length > 0 && (
        <>
          <p className="veld-label pak-bij" id="ook-mee">Ook meenemen</p>
          <ul className="lijst keuze-lijst" aria-labelledby="ook-mee">
            {bronLijsten.map(l => {
              const n = staat.pakitems.filter(x => x.lijst === l.id).length;
              const aan = !uit.has(l.id);
              return (
                <li key={l.id} className="rij">
                  <button type="button" role="checkbox" aria-checked={aan} className="rij-knop" onClick={() => wissel(l.id)}>
                    <span className={'keuze-vinkje' + (aan ? ' aan' : '')} aria-hidden="true">{aan && <IcVink width={14} height={14} />}</span>
                    <span className="rij-inhoud">
                      <span className="rij-titel">{l.naam}</span>
                      <span className="rij-sub"><span className="plek">{n} {n === 1 ? 'item' : 'items'}</span></span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="stil-tekst pak-uitleg">Bestaat zo'n lijst hier al, dan wordt hij aangevuld.</p>
        </>
      )}
      <button type="button" className="knop breed" disabled={!bron} onClick={() => { if (bron) app.paklijstOvernemen(bron, naar.id, groep, groep === 'iedereen' ? mee : []); sluit(); }}>
        Overnemen
      </button>
    </Venster>
  );
}

/** Afvinken opnieuw beginnen (bijvoorbeeld voor de terugreis): voor de gekozen persoon of voor iedereen. */
export function OpnieuwVenster({ vakantie, groep, sluit }: { vakantie: Vakantie; groep: PakDoel; sluit: () => void }) {
  const app = useApp();
  return (
    <Venster titel="Afvinken opnieuw beginnen" sluit={sluit}>
      <p className="stil-tekst">Bijvoorbeeld voor de terugreis. De items blijven staan; alleen de vinkjes gaan weg. Je kunt het direct ongedaan maken.</p>
      <button type="button" className="knop breed" onClick={() => { app.vinkjesOpnieuw(vakantie.id, groep); sluit(); }}>
        Voor {groepNaam(app.huishouden, groep, app.staat.paklijsten)}
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
        {b.afgevinkt ? 'Gekocht.' : b.later ? 'Staat op de boodschappenlijst bij Later nodig.' : 'Staat op de boodschappenlijst bij Nu te kopen.'}
        {' '}Afvinken in de winkel geldt ook hier: het is dezelfde boodschap.
      </p>
      {!b.afgevinkt && (
        <button type="button" className="knop breed" disabled={!!b.sync} onClick={() => { app.boodschapLater(b, !b.later); sluit(); }}>
          {b.later ? 'Nu te kopen' : 'Terug naar Later nodig'}
        </button>
      )}
      {/* Hetzelfde venster als op de boodschappenlijst: één item, dus aanpassen geldt overal. */}
      <button type="button" className={'knop breed' + (b.afgevinkt ? '' : ' stil')} onClick={() => { sluit(); app.openItem(b.id); }}>Naam aanpassen</button>
      {k && !k.afgehandeld && (
        <button type="button" className="knop breed stil" onClick={() => { app.boodschapOntkoppelen(k, b.naam); sluit(); }}>
          Niet meer voor {vakantie.naam}
        </button>
      )}
      <button type="button" className="knop breed stil" onClick={() => { sluit(); app.gaNaar('boodschappen'); }}>Naar de boodschappenlijst</button>
    </Venster>
  );
}

/**
 * Een extra inpaklijst (§20): een nieuwe maken, of een bestaande hernoemen of verwijderen. Het naamveld en de knop staan
 * bovenaan, zodat het toetsenbord ze op een kleine iPhone niet bedekt. Verwijderen met items vraagt eerst bevestiging;
 * daarna kan het nog ongedaan gemaakt worden.
 */
export function PaklijstVenster({ vakantie, bestaand, aantal = 0, gemaakt, sluit }: {
  vakantie: Vakantie; bestaand?: Paklijst; aantal?: number; gemaakt?: (id: string) => void; sluit: () => void;
}) {
  const app = useApp();
  useMeldingWegBijOpenen();
  const [naam, zetNaam] = useState(bestaand?.naam ?? '');
  const [fout, zetFout] = useState<string | null>(null);
  const [verwijderen, zetVerwijderen] = useState(false);
  const schoon = naam.trim().replace(/\s+/g, ' ');
  async function bewaar(e: { preventDefault(): void }) {
    e.preventDefault();
    const f = paklijstNaamFout(schoon, app.huishouden, app.staat.paklijsten, vakantie.id, bestaand?.id);
    if (f) { zetFout(f); return; }
    if (bestaand) { if (schoon !== bestaand.naam) app.paklijstHernoemen(bestaand, schoon); sluit(); return; }
    const id = await app.paklijstToevoegen(vakantie.id, schoon);
    if (id) gemaakt?.(id);
    sluit();
  }
  function weg() {
    if (!bestaand) return;
    if (aantal > 0 && !verwijderen) { zetVerwijderen(true); return; }
    app.paklijstVerwijderen(bestaand);
    sluit();
  }
  return (
    <Venster titel={bestaand ? 'Inpaklijst' : 'Nieuwe inpaklijst'} sluit={sluit}>
      {!verwijderen && (
        <form onSubmit={bewaar} noValidate className="paklijst-form">
          <label className="veld">
            <span className="veld-label">Naam</span>
            <input value={naam} onChange={e => { zetNaam(e.target.value); zetFout(null); }} maxLength={40} autoComplete="off" autoFocus
              enterKeyHint="done" placeholder="Bijv. Oma, Paard, Strandspullen" aria-invalid={!!fout} aria-describedby={fout ? 'paklijst-fout' : undefined} />
            {fout && <span className="veld-fout" id="paklijst-fout">{fout}</span>}
          </label>
          <button type="submit" className="knop breed" onClick={bewaar}>{bestaand ? 'Opslaan' : 'Lijst toevoegen'}</button>
          {!bestaand && <p className="stil-tekst pak-uitleg">Een lijst voor deze vakantie, naast die van het gezin en Gezamenlijk. Geen account nodig.</p>}
        </form>
      )}
      {bestaand && !verwijderen && (
        <div className="detail-acties">
          <button type="button" className="tekstknop vak-verwijder" onClick={weg}>Lijst verwijderen</button>
        </div>
      )}
      {bestaand && verwijderen && (
        <div className="detail-bevestig" role="group" aria-label="Verwijderen bevestigen">
          <p>{bestaand.naam} met {aantal} {aantal === 1 ? 'item' : 'items'} verwijderen?</p>
          <p className="stil-tekst">De items gaan mee. Je kunt het direct ongedaan maken.</p>
          <button type="button" className="knop breed gevaar" onClick={weg}>Ja, verwijderen</button>
          <button type="button" className="knop breed stil" onClick={() => zetVerwijderen(false)}>Nee, terug</button>
        </div>
      )}
    </Venster>
  );
}
