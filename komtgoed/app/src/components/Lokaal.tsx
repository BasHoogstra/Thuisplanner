// Onderdelen die alleen in de lokale Supabase-modus verschijnen: inloggen, de statusbalk (verbinding,
// opslag, meldingen van de sync-module), de keuze bij een mogelijk dubbele toevoeging en het label op een
// rij die de server nog niet heeft bevestigd.
import { useState } from 'react';
import { useApp } from '../lib/context';
import type { Keuze } from '../lib/lokaal/staat';
import type { Momentopname, Sessie } from '../lib/lokaal/sessie';
import type { SyncVelden } from '../lib/types';
import { Venster } from './Venster';

const STATUS_TEKST: Record<string, string> = {
  laden: 'Laden…',
  verbonden: 'Verbonden',
  synchroniseren: 'Bijwerken…',
  offline: 'Geen verbinding',
  'geen-toegang': 'Geen toegang',
  gestopt: 'Gestopt',
};

export function Inloggen({ sessie, snap, uitnodiging = false }: { sessie: Sessie; snap: Momentopname; uitnodiging?: boolean }) {
  const { accounts, wachtwoord: lokaalWachtwoord } = sessie.config;
  const [email, zetEmail] = useState(accounts[0]?.email ?? '');
  const [wachtwoord, zetWachtwoord] = useState(lokaalWachtwoord ?? '');
  const bezig = snap.fase === 'bezig' || snap.fase === 'start';
  const staging = sessie.config.omgeving === 'staging';

  const log = (e: { preventDefault(): void }, adres = email) => {
    e.preventDefault();
    void sessie.inloggen(adres, wachtwoord);
  };

  return (
    <div className="schil">
      <OmgevingsBalk omgeving={sessie.config.omgeving} />
      <main className="hoofd" aria-label="Inloggen">
        <div className="scherm">
          <header className="kop">
            <h1>Inloggen</h1>
            <p className="kop-samenvatting">{staging ? 'Log in met het testaccount dat je hebt gekregen.' : 'Kies een fictief gezinslid om mee te testen.'}</p>
          </header>
          {uitnodiging && <p className="stil-tekst" role="status">Je hebt een uitnodiging geopend. Log in om hem te bekijken.</p>}
          {snap.fase === 'geen-huishouden' && (
            <p className="stil-tekst" role="alert">Dit account hoort nog bij geen huishouden.{staging ? ' Vraag de beheerder van de testomgeving om je toe te voegen.' : <> Draai eerst <code>npm run lokaal:seed</code>.</>}</p>
          )}
          {accounts.length > 0 && (
            <section className="blok" aria-labelledby="h-accounts">
              <h2 id="h-accounts" className="sectie-kop">Fictieve accounts</h2>
              <div className="keuzes">
                {accounts.map(a => (
                  <button key={a.email} type="button" className="keuze" disabled={bezig}
                    onClick={e => { zetEmail(a.email); log(e, a.email); }}>
                    Inloggen als {a.naam}
                  </button>
                ))}
              </div>
            </section>
          )}
          <form className="blok" onSubmit={log} noValidate>
            <label className="veld">
              <span className="veld-label">E-mailadres</span>
              <input id="login-email" type="email" value={email} onChange={e => zetEmail(e.target.value)} autoComplete="username" />
            </label>
            <label className="veld">
              <span className="veld-label">Wachtwoord</span>
              <input id="login-wachtwoord" type="password" value={wachtwoord} onChange={e => zetWachtwoord(e.target.value)}
                autoComplete="current-password" />
            </label>
            {snap.fout && <p className="veld-fout" role="alert">{snap.fout}</p>}
            <button type="submit" className="knop breed" disabled={bezig} onClick={log}>{bezig ? 'Even geduld…' : 'Inloggen'}</button>
          </form>
          <p className="stil-tekst">{staging ? 'Testomgeving: gebruik alleen verzonnen gegevens, geen echte afspraken of namen.' : 'Alleen voor de lokale test: deze accounts en dit gezin zijn verzonnen.'}</p>
        </div>
      </main>
    </div>
  );
}

const OMGEVING_LABEL = { lokaal: 'Lokaal', staging: 'Testomgeving' } as const;

/** Vaste markering op het inlogscherm: welke omgeving dit is. */
export function OmgevingsBalk({ omgeving }: { omgeving: 'lokaal' | 'staging' }) {
  return (
    <div className="demobalk" role="note">
      <span className="demo-label">{OMGEVING_LABEL[omgeving]}</span>
      <span className="demobalk-tekst">{omgeving === 'staging' ? 'Alleen om te testen · verzonnen gegevens' : 'Fictief gezin · lokale testdatabase op dit netwerk'}</span>
    </div>
  );
}

/** Bovenaan, klein: welke omgeving, wie je bent, de verbinding, en wat de gebruiker moet weten. */
export function LokaleBalk() {
  const { lokaal, gaNaar } = useApp();
  if (!lokaal) return null;
  const { status, opslagDuurzaam, syncMelding, openstaand } = lokaal;
  return (
    <>
      <div className="demobalk" role="note">
        <span className="demo-label">{OMGEVING_LABEL[lokaal.omgeving]}</span>
        <span className="demobalk-tekst">
          {lokaal.account} · <span className={'sync-status ' + status} data-status={status}>{STATUS_TEKST[status] ?? status}</span>
          {openstaand.length > 0 && <> · {openstaand.length} niet bevestigd</>}
        </span>
        <a href="#/meer" onClick={e => { e.preventDefault(); gaNaar('meer'); }}>Account</a>
      </div>
      {opslagDuurzaam === false && (
        <p className="sync-waarschuwing" role="alert">
          Deze browser bewaart niets op dit toestel. Wat nog niet is bevestigd, gaat verloren als je dit venster sluit.
        </p>
      )}
      {syncMelding && (
        <div className="sync-waarschuwing" role="alert" data-soort={syncMelding.soort}>
          <span>{syncMelding.tekst}</span>
          <button type="button" className="melding-knop" onClick={lokaal.syncMeldingWeg}>Sluiten</button>
        </div>
      )}
    </>
  );
}

/** De sync-module verstuurt een toevoeging niet twee keer zonder dat je kiest. */
export function KeuzeVenster({ keuze, sluit }: { keuze: Keuze; sluit: () => void }) {
  return (
    <Venster titel="Al eerder toegevoegd?" sluit={sluit}>
      <p>{keuze.tekst}</p>
      <button type="button" className="knop breed" onClick={keuze.opnieuw}>Eerdere opnieuw versturen</button>
      <button type="button" className="knop breed stil" onClick={keuze.nieuw}>Toch nog een keer toevoegen</button>
    </Venster>
  );
}

const SYNC_LABEL: Record<NonNullable<SyncVelden['sync']>, string> = {
  wachtend: 'wordt bewaard…',
  onzeker: 'niet bevestigd',
  geweigerd: 'niet bewaard',
  'zonder-inhoud': 'inhoud niet op dit toestel',
};

/** Een klein label op een rij die de server (nog) niet heeft bevestigd. */
export function SyncLabel({ sync }: { sync: SyncVelden['sync'] }) {
  if (!sync) return null;
  return <span className={'plek sync-label ' + sync}>{SYNC_LABEL[sync]}</span>;
}

/** Herstelkeuzes voor een onbevestigde opdracht (in het venster van dat item en in Meer). */
export function HerstelKnoppen({ id, sync, na }: { id: string; sync: SyncVelden['sync']; na?: () => void }) {
  const { lokaal, openItem } = useApp();
  if (!lokaal || !sync || sync === 'wachtend') return null;
  return (
    <div className="keuzes herstel">
      {sync === 'zonder-inhoud' ? (
        // Inhoud niet op dit toestel: opnieuw invoeren onder dezelfde opdracht-ID (zie ItemVenster).
        <button type="button" className="knop klein" onClick={() => { na?.(); openItem(id); }}>Opnieuw invoeren</button>
      ) : (
        <button type="button" className="knop klein" onClick={() => { lokaal.opnieuwProberen(id); na?.(); }}>Opnieuw proberen</button>
      )}
      <button type="button" className="knop klein stil" onClick={() => { lokaal.vergeten(id); na?.(); }}>Vergeten op dit toestel</button>
    </div>
  );
}

export function OnbevestigdVenster({ id, naam, sync, sluit }: { id: string; naam: string; sync: SyncVelden['sync']; sluit: () => void }) {
  const uitleg = sync === 'wachtend'
    ? 'Dit wordt nu naar de server gestuurd. Even geduld; daarna kun je het aanpassen.'
    : sync === 'geweigerd'
      ? 'De server heeft dit niet bewaard. Je kunt het opnieuw proberen of van dit toestel halen.'
      : 'Het is niet zeker of de server dit heeft ontvangen. Opnieuw proberen maakt geen dubbele: het is dezelfde opdracht.';
  return (
    <Venster titel={naam || 'Niet bevestigd'} sluit={sluit}>
      <p>{uitleg}</p>
      <HerstelKnoppen id={id} sync={sync} na={sluit} />
      <button type="button" className="knop breed stil" onClick={sluit}>Sluiten</button>
    </Venster>
  );
}
