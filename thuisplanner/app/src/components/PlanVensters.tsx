// Plannen (besluit 18): de vensters om een plan of een onderdeel te maken, aan te passen of te verwijderen. Alleen de naam is
// nodig; de rest staat achter "Meer invullen".
import { useState } from 'react';
import { useApp } from '../lib/context';
import { CONFLICT_IN_VENSTER } from '../lib/acties';
import { isGeldigeDatum } from '../lib/datum';
import { onderdelenVan, takenVan } from '../lib/plan';
import type { LidId, Plan, PlanOnderdeel } from '../lib/types';
import { WieKeuze } from './Keuzepanelen';
import { useMeldingWegBijOpenen } from './VakantieVensters';
import { Venster } from './Venster';

export function PlanVenster({ bestaand, sluit }: { bestaand?: Plan; sluit: () => void }) {
  const app = useApp();
  useMeldingWegBijOpenen();
  const [naam, zetNaam] = useState(bestaand?.titel ?? '');
  const [omschrijving, zetOmschrijving] = useState(bestaand?.omschrijving ?? '');
  const [einddatum, zetEinddatum] = useState(bestaand?.einddatum ?? '');
  const [wie, zetWie] = useState<LidId[]>(bestaand?.wie ?? []);
  const [meer, zetMeer] = useState(!!bestaand);
  const [fout, zetFout] = useState<string | null>(null);
  const [verwijderen, zetVerwijderen] = useState(false);
  const aantalTaken = bestaand ? takenVan(app.staat.items, bestaand.id).length : 0;
  // De versie bij het openen: wijzigde iemand anders het plan intussen, dan geen stille overschrijving maar een conflict,
  // en het venster blijft open met je invoer; opnieuw opslaan zet dan bewust jouw waarden door (P1, review PR #54).
  const [beginVersie] = useState(() => bestaand?.versie);
  const [conflict, zetConflict] = useState(false);

  async function bewaar(e: { preventDefault(): void }) {
    e.preventDefault();
    const n = naam.trim().replace(/\s+/g, ' ');
    if (!n) { zetFout('Geef het plan een naam.'); return; }
    if (einddatum && !isGeldigeDatum(einddatum)) { zetFout('Kies een geldige einddatum.'); return; }
    const velden = { titel: n, omschrijving: omschrijving.trim() || undefined, einddatum: einddatum || null, wie };
    if (bestaand) {
      const u = await app.planBijwerken({ ...bestaand, ...velden, versie: conflict ? bestaand.versie : beginVersie }, `${n} aangepast`);
      if (u === 'conflict') { zetConflict(true); return; }
      sluit();
      return;
    }
    sluit();
    void app.planToevoegen(velden).then(id => { if (id) app.openPlan(id); });
  }
  function weg(metTaken: boolean) {
    app.planVerwijderen(bestaand!, metTaken);
    sluit();
    app.openPlan(null);
  }

  return (
    <Venster titel={bestaand ? 'Plan aanpassen' : 'Nieuw plan'} sluit={sluit}>
      <form onSubmit={bewaar} noValidate>
        <label className="veld"><span className="veld-label">Naam</span>
          <input value={naam} maxLength={80} autoComplete="off" placeholder="Bijv. Schuur opruimen" autoFocus={!bestaand}
            onChange={e => { zetNaam(e.target.value); zetFout(null); }} />
        </label>
        {!meer && (
          <button type="button" className="meer-knop" aria-expanded={false} onClick={() => zetMeer(true)}>
            <span>Meer invullen</span>
            <small>Omschrijving · Einddatum · Voor wie</small>
          </button>
        )}
        {meer && (
          <>
            <label className="veld"><span className="veld-label">Omschrijving <span className="optioneel">(optioneel)</span></span>
              <input value={omschrijving} maxLength={200} autoComplete="off" onChange={e => zetOmschrijving(e.target.value)} />
            </label>
            <label className="veld"><span className="veld-label">Einddatum <span className="optioneel">(optioneel)</span></span>
              <input type="date" value={einddatum} onChange={e => { zetEinddatum(e.target.value); zetFout(null); }} />
            </label>
            <div className="veld">
              <span className="veld-label">Voor wie? <span className="optioneel">(optioneel)</span></span>
              <WieKeuze leden={app.huishouden.leden} wie={wie} enkel={false} kies={zetWie} />
            </div>
          </>
        )}
        <p className="stil-tekst plan-gedeeld">Iedereen in het huishouden ziet dit plan.</p>
        {fout && <p className="veld-fout" role="alert">{fout}</p>}
        {conflict && <p className="veld-fout" role="alert">{CONFLICT_IN_VENSTER}</p>}
        <button type="submit" className="knop breed" onClick={bewaar}>{bestaand ? 'Opslaan' : 'Plan maken'}</button>
      </form>
      {bestaand && !verwijderen && (
        <button type="button" className="tekstknop vak-verwijder" onClick={() => zetVerwijderen(true)}>Plan verwijderen</button>
      )}
      {bestaand && verwijderen && (
        <div className="detail-bevestig" role="group" aria-label="Verwijderen bevestigen">
          <p>{bestaand.titel} verwijderen?</p>
          {aantalTaken > 0 ? (
            <>
              <p className="stil-tekst">{aantalTaken === 1 ? 'De taak blijft als losse taak bestaan' : `De ${aantalTaken} taken blijven als losse taken bestaan`}, tenzij je kiest voor plan en taken. Je kunt het direct ongedaan maken.</p>
              <button type="button" className="knop breed gevaar" onClick={() => weg(false)}>Alleen het plan</button>
              <button type="button" className="knop breed gevaar stil-gevaar" onClick={() => weg(true)}>Plan en taken</button>
            </>
          ) : (
            <button type="button" className="knop breed gevaar" onClick={() => weg(false)}>Ja, verwijderen</button>
          )}
          <button type="button" className="knop breed stil" onClick={() => zetVerwijderen(false)}>Nee, terug</button>
        </div>
      )}
    </Venster>
  );
}

/** Een onderdeel maken, of hernoemen, verplaatsen en verwijderen. De taken van een verwijderd onderdeel blijven in het plan. */
export function OnderdeelVenster({ planId, bestaand, sluit, gemaakt }: { planId: string; bestaand?: PlanOnderdeel; sluit: () => void; gemaakt?: (id: string) => void }) {
  const app = useApp();
  useMeldingWegBijOpenen();
  const [naam, zetNaam] = useState(bestaand?.naam ?? '');
  const [fout, zetFout] = useState<string | null>(null);
  const [verwijderen, zetVerwijderen] = useState(false);
  const alle = onderdelenVan(app.staat.onderdelen, planId);
  const plek = bestaand ? alle.findIndex(o => o.id === bestaand.id) : -1;
  const aantalTaken = bestaand ? app.staat.items.filter(i => i.soort === 'taak' && i.onderdeelId === bestaand.id).length : 0;
  const [beginVersie] = useState(() => bestaand?.versie);
  const [conflict, zetConflict] = useState(false);

  async function bewaar(e: { preventDefault(): void }) {
    e.preventDefault();
    const n = naam.trim().replace(/\s+/g, ' ');
    if (!n) { zetFout('Geef het onderdeel een naam.'); return; }
    if (alle.some(o => o.id !== bestaand?.id && o.naam.toLocaleLowerCase('nl') === n.toLocaleLowerCase('nl'))) { zetFout('Dit plan heeft al een onderdeel met deze naam.'); return; }
    if (bestaand) {
      if (n !== bestaand.naam) {
        const u = await app.onderdeelHernoemen({ ...bestaand, versie: conflict ? bestaand.versie : beginVersie }, n);
        if (u === 'conflict') { zetConflict(true); return; }
      }
    } else void app.onderdeelToevoegen(planId, n).then(id => { if (id) gemaakt?.(id); });
    sluit();
  }

  return (
    <Venster titel={bestaand ? 'Onderdeel aanpassen' : 'Nieuw onderdeel'} sluit={sluit}>
      <form onSubmit={bewaar} noValidate>
        <label className="veld"><span className="veld-label">Naam</span>
          <input value={naam} maxLength={60} autoComplete="off" placeholder="Bijv. Voorbereiding" autoFocus={!bestaand}
            onChange={e => { zetNaam(e.target.value); zetFout(null); }} />
        </label>
        {fout && <p className="veld-fout" role="alert">{fout}</p>}
        {conflict && <p className="veld-fout" role="alert">{CONFLICT_IN_VENSTER}</p>}
        <button type="submit" className="knop breed" onClick={bewaar}>{bestaand ? 'Opslaan' : 'Onderdeel toevoegen'}</button>
      </form>
      {bestaand && alle.length > 1 && (
        <div className="keuzes plan-volgorde" role="group" aria-label="Volgorde">
          <button type="button" className="keuze" disabled={plek === 0} onClick={() => app.onderdeelVerplaatsen(bestaand, -1)}>Omhoog</button>
          <button type="button" className="keuze" disabled={plek === alle.length - 1} onClick={() => app.onderdeelVerplaatsen(bestaand, 1)}>Omlaag</button>
        </div>
      )}
      {bestaand && !verwijderen && (
        <button type="button" className="tekstknop vak-verwijder" onClick={() => zetVerwijderen(true)}>Onderdeel verwijderen</button>
      )}
      {bestaand && verwijderen && (
        <div className="detail-bevestig" role="group" aria-label="Verwijderen bevestigen">
          <p>{bestaand.naam} verwijderen?</p>
          {aantalTaken > 0 && <p className="stil-tekst">{aantalTaken === 1 ? 'De taak blijft' : `De ${aantalTaken} taken blijven`} in het plan, zonder onderdeel. Je kunt het direct ongedaan maken.</p>}
          <button type="button" className="knop breed gevaar" onClick={() => { app.onderdeelVerwijderen(bestaand); sluit(); }}>Ja, verwijderen</button>
          <button type="button" className="knop breed stil" onClick={() => zetVerwijderen(false)}>Nee, terug</button>
        </div>
      )}
    </Venster>
  );
}
