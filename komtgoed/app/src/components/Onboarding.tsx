// Onboarding (KG-5H deel 1, docs/thuisplanner-onboarding.md): het eerste huishouden aanmaken (S1) en een uitnodiging
// accepteren (S2). Alleen via de bestaande databasefuncties; de database maakt de maker eigenaar en dwingt alle
// regels van uitnodigingen af. Werkt lokaal en op staging (dezelfde sessie).
import { useState } from 'react';
import type { Momentopname, Sessie } from '../lib/lokaal/sessie';
import { bewaarUitnodiging, tokenUit, vergeetUitnodiging } from '../lib/uitnodiging';
import { OmgevingsBalk } from './Lokaal';

const geldigeNaam = (s: string) => s.trim().length >= 1 && s.trim().length <= 80;

function Pagina({ sessie, label, children }: { sessie: Sessie; label: string; children: React.ReactNode }) {
  return (
    <div className="schil">
      <OmgevingsBalk omgeving={sessie.config.omgeving} />
      <main className="hoofd" aria-label={label}>
        <div className="scherm">{children}</div>
      </main>
    </div>
  );
}

export function EvenGeduld({ sessie }: { sessie: Sessie }) {
  return (
    <Pagina sessie={sessie} label="Laden">
      <p className="stil-tekst" role="status">Even geduld…</p>
    </Pagina>
  );
}

/** S1: ingelogd, nog geen huishouden. Een nieuw huishouden aanmaken, of een uitnodiging plakken. */
export function Welkom({ sessie, snap, opUitnodiging }: { sessie: Sessie; snap: Momentopname; opUitnodiging: (token: string) => void }) {
  const [naam, zetNaam] = useState('');
  const [eigenNaam, zetEigenNaam] = useState('');
  const [link, zetLink] = useState('');
  const [fout, zetFout] = useState<string | null>(null);
  const [linkFout, zetLinkFout] = useState<string | null>(null);
  const [bezig, zetBezig] = useState(false);

  const maak = async (e: { preventDefault(): void }) => {
    e.preventDefault();
    if (!geldigeNaam(naam) || !geldigeNaam(eigenNaam)) { zetFout('Vul een naam voor het huishouden en je eigen naam in (1 tot 80 tekens).'); return; }
    zetBezig(true); zetFout(null);
    const r = await sessie.maakHuishouden(naam.trim(), eigenNaam.trim());
    if (!r.ok) { zetFout(r.fout); zetBezig(false); }
  };
  const plak = (e: { preventDefault(): void }) => {
    e.preventDefault();
    const t = tokenUit(link);
    if (!t) { zetLinkFout('Dit is geen geldige uitnodigingslink. Plak de hele link die je hebt gekregen.'); return; }
    bewaarUitnodiging(t);
    zetLink('');
    opUitnodiging(t);
  };

  return (
    <Pagina sessie={sessie} label="Welkom">
      <header className="kop">
        <h1>Welkom</h1>
        <p className="kop-samenvatting">Ingelogd als {snap.account?.email}. Je hoort nog bij geen huishouden.</p>
      </header>

      <form className="blok" onSubmit={maak} noValidate aria-labelledby="h-nieuw">
        <h2 id="h-nieuw" className="sectie-kop">Nieuw huishouden</h2>
        <label className="veld">
          <span className="veld-label">Naam van het huishouden</span>
          <input id="hh-naam" value={naam} maxLength={80} placeholder="Bijvoorbeeld: Familie Jansen" onChange={e => zetNaam(e.target.value)} autoComplete="off" />
        </label>
        <label className="veld">
          <span className="veld-label">Jouw naam</span>
          <input id="hh-eigen-naam" value={eigenNaam} maxLength={80} onChange={e => zetEigenNaam(e.target.value)} autoComplete="given-name" />
        </label>
        {fout && <p className="veld-fout" role="alert">{fout}</p>}
        <button type="submit" className="knop breed" disabled={bezig}>{bezig ? 'Even geduld…' : 'Huishouden aanmaken'}</button>
        <p className="stil-tekst">Je wordt beheerder van dit huishouden. Daarna kun je in Meer je partner of andere gezinsleden toevoegen.</p>
      </form>

      <form className="blok" onSubmit={plak} noValidate aria-labelledby="h-uitnodiging">
        <h2 id="h-uitnodiging" className="sectie-kop">Ik heb een uitnodiging</h2>
        <label className="veld">
          <span className="veld-label">Uitnodigingslink</span>
          <input id="uitnodiging-link" value={link} onChange={e => zetLink(e.target.value)} autoComplete="off" spellCheck={false} inputMode="url" />
        </label>
        {linkFout && <p className="veld-fout" role="alert">{linkFout}</p>}
        <button type="submit" className="knop breed stil">Verder</button>
      </form>

      <button type="button" className="knop stil" onClick={() => void sessie.uitloggen()}>Uitloggen</button>
    </Pagina>
  );
}

/** S2: een uitnodiging bekijken en (alleen op verzoek) accepteren. */
export function UitnodigingAccepteren({ sessie, snap, token, sluit }: { sessie: Sessie; snap: Momentopname; token: string; sluit: () => void }) {
  const [eigenNaam, zetEigenNaam] = useState('');
  const [fout, zetFout] = useState<string | null>(null);
  const [bezig, zetBezig] = useState(false);
  const [lid, zetLid] = useState<string | null>(null);   // het huishouden waar je nu lid van bent
  const [verlaten, zetVerlaten] = useState(false);

  const accepteer = async (e: { preventDefault(): void }) => {
    e.preventDefault();
    if (eigenNaam.trim().length > 80) { zetFout('Je naam is te lang (hoogstens 80 tekens).'); return; }
    zetBezig(true); zetFout(null);
    const r = await sessie.accepteerUitnodiging(token, eigenNaam.trim() || null);
    zetBezig(false);
    if (!r.ok) { zetFout(r.fout); return; }
    vergeetUitnodiging();   // eenmalig: hoe dan ook niet meer bewaren
    zetLid(r.waarde);
  };
  const weiger = () => { vergeetUitnodiging(); sluit(); };
  const verlaat = async () => {
    if (!lid) return;
    zetBezig(true);
    const r = await sessie.verlaatHuishouden(lid);
    zetBezig(false);
    if (!r.ok) { zetFout(r.fout); return; }
    sluit();
  };

  if (lid) {
    const naam = sessie.momentopname().huishouden?.id === lid ? sessie.momentopname().huishouden?.naam : null;
    return (
      <Pagina sessie={sessie} label="Uitnodiging geaccepteerd">
        <header className="kop">
          <h1>Welkom{naam ? ` bij ${naam}` : ''}</h1>
          <p className="kop-samenvatting">Je bent nu lid van dit huishouden.</p>
        </header>
        <button type="button" className="knop breed" onClick={sluit} disabled={bezig}>Naar Vandaag</button>
        {!verlaten ? (
          <button type="button" className="knop breed stil" onClick={() => zetVerlaten(true)} disabled={bezig}>Toch niet: dit huishouden verlaten</button>
        ) : (
          <div className="blok">
            <p>Weet je het zeker? Je account wordt losgekoppeld van dit huishouden.</p>
            <button type="button" className="knop breed gevaar" onClick={() => void verlaat()} disabled={bezig}>Ja, verlaten</button>
            <button type="button" className="knop breed stil" onClick={() => zetVerlaten(false)} disabled={bezig}>Nee, blijven</button>
          </div>
        )}
        {fout && <p className="veld-fout" role="alert">{fout}</p>}
      </Pagina>
    );
  }

  return (
    <Pagina sessie={sessie} label="Uitnodiging">
      <header className="kop">
        <h1>Uitnodiging</h1>
        <p className="kop-samenvatting">Je bent uitgenodigd voor een huishouden in Thuisplanner.</p>
      </header>
      <form className="blok" onSubmit={accepteer} noValidate>
        <p>Je accepteert als <strong>{snap.account?.email}</strong>. Accepteer alleen een uitnodiging van iemand die je kent.</p>
        <label className="veld">
          <span className="veld-label">Jouw naam</span>
          <input id="uitnodiging-naam" value={eigenNaam} maxLength={80} onChange={e => zetEigenNaam(e.target.value)} autoComplete="given-name" />
          <span className="veld-hulp">Niet nodig als degene die je uitnodigde je naam al heeft ingevuld.</span>
        </label>
        {fout && <p className="veld-fout" role="alert">{fout}</p>}
        <button type="submit" className="knop breed" disabled={bezig}>{bezig ? 'Even geduld…' : 'Accepteren'}</button>
        <button type="button" className="knop breed stil" onClick={weiger} disabled={bezig}>Niet accepteren</button>
      </form>
      <p className="stil-tekst">Niet jouw account? <button type="button" className="knop stil klein" onClick={() => { void sessie.uitloggen(); }}>Uitloggen</button>; de uitnodiging blijft in dit tabblad bewaard.</p>
    </Pagina>
  );
}
