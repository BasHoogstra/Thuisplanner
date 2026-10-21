// Onderdelen die alleen in de lokale Supabase-modus verschijnen: inloggen, de statusbalk (verbinding,
// opslag, meldingen van de sync-module), de keuze bij een mogelijk dubbele toevoeging en het label op een
// rij die de server nog niet heeft bevestigd.
import { useState } from 'react';
import { useApp } from '../lib/context';
import type { Keuze } from '../lib/lokaal/staat';
import type { Momentopname, Sessie } from '../lib/lokaal/sessie';
import type { SyncVelden } from '../lib/types';
import { Venster } from './Venster';
import { CodeInloggen } from './CodeInloggen';

const STATUS_TEKST: Record<string, string> = {
  laden: 'Laden…',
  verbonden: 'Verbonden',
  synchroniseren: 'Bijwerken…',
  offline: 'Geen verbinding',
  'geen-toegang': 'Geen toegang',
  gestopt: 'Gestopt',
};

/**
 * Inloggen en aanmelden: e-mailadres, zes cijfers, ingelogd (CodeInloggen). Lokaal staan daarnaast de fictieve accounts
 * klaar (die loggen met het lokale testwachtwoord in; dat kan alleen in de lokale ontwikkelmodus van de database).
 */
export function Inloggen({ sessie, snap, uitnodiging = false }: { sessie: Sessie; snap: Momentopname; uitnodiging?: boolean }) {
  const { accounts, wachtwoord: lokaalWachtwoord } = sessie.config;
  const bezig = snap.fase === 'bezig' || snap.fase === 'start';
  const staging = sessie.config.omgeving === 'staging';

  return (
    <div className="schil">
      <OmgevingsBalk omgeving={sessie.config.omgeving} />
      <main className="hoofd" aria-label="Inloggen">
        <div className="scherm">
          <header className="kop">
            <h1>Thuisplanner</h1>
            <p className="kop-samenvatting">De planning van je huishouden, samen bijgehouden.</p>
          </header>
          {uitnodiging && <p className="stil-tekst" role="status">Je hebt een uitnodiging geopend. Log in om hem te bekijken.</p>}
          {accounts.length > 0 && lokaalWachtwoord && (
            <section className="blok" aria-labelledby="h-accounts">
              <h2 id="h-accounts" className="sectie-kop">Fictieve accounts (alleen lokaal)</h2>
              <div className="keuzes">
                {accounts.map(a => (
                  <button key={a.email} type="button" className="keuze" disabled={bezig}
                    onClick={() => { void sessie.inloggen(a.email, lokaalWachtwoord); }}>
                    Inloggen als {a.naam}
                  </button>
                ))}
              </div>
            </section>
          )}
          <CodeInloggen key={snap.fout ?? 'start'} sessie={sessie} uitnodiging={uitnodiging} startFout={snap.fout} />
          <p className="stil-tekst">{staging ? 'Testomgeving: Thuisplanner is nog in ontwikkeling.' : 'Alleen voor de lokale test: deze accounts en dit gezin zijn verzonnen.'}</p>
        </div>
      </main>
    </div>
  );
}

/** Geen netwerk (er is wel een opgeslagen inlogsessie), of de noodstop "onderhoud": nooit uitloggen, wel uitleggen. */
export function Wachten({ sessie, snap }: { sessie: Sessie; snap: Momentopname }) {
  const verbinding = snap.fase === 'verbinding';
  return (
    <div className="schil">
      <OmgevingsBalk omgeving={sessie.config.omgeving} />
      <main className="hoofd" aria-label={verbinding ? 'Geen verbinding' : 'Even niet beschikbaar'}>
        <div className="scherm">
          <header className="kop">
            <h1>{verbinding ? 'Geen verbinding' : 'Even niet beschikbaar'}</h1>
            <p className="kop-samenvatting" role="status">
              {verbinding ? 'Je bent nog ingelogd. Zodra er weer verbinding is, gaat Thuisplanner vanzelf verder.' : snap.fout}
            </p>
          </header>
          {verbinding && <button type="button" className="knop breed" onClick={() => void sessie.opnieuwVerbinden()}>Opnieuw proberen</button>}
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

/**
 * Uitloggen met de waarschuwing van besluit P2. Staan er op dit toestel nog opdrachten die de server niet heeft
 * bevestigd (van dit account, in elk huishouden), dan eerst een keuze: laten nakijken (je blijft ingelogd), of van dit
 * toestel wissen en uitloggen. Wat de server al heeft, blijft daar. Zonder onbevestigde opdrachten: meteen uitloggen.
 * Nooit stil wissen (P4).
 */
export function UitlogKnop({ label, className, aantal, uitloggen, nakijken, overal = false }: {
  label: string;
  className: string;
  aantal: () => number;
  uitloggen: (wissen: boolean) => void;
  /** Ontbreekt als er niets na te kijken valt (geen huishouden open): dan heet de knop "Niet uitloggen". */
  nakijken?: () => void;
  overal?: boolean;
}) {
  const [open, zetOpen] = useState<number | null>(null);
  const klik = () => {
    const n = aantal();
    if (n > 0) zetOpen(n); else uitloggen(false);
  };
  return (
    <>
      <button type="button" className={className} onClick={klik}>{label}</button>
      {open !== null && (
        <Venster titel="Nog niet alles is bevestigd" sluit={() => zetOpen(null)}>
          <p>{open === 1 ? 'Eén toevoeging is' : `${open} toevoegingen zijn`} op dit toestel nog niet door de server bevestigd.</p>
          <p className="stil-tekst">
            Laat ze eerst nakijken als je verbinding hebt: wat de server al heeft, wordt dan bevestigd, en de rest kun je opnieuw
            invoeren. Of wis ze van dit toestel; wat de server al heeft, blijft daar gewoon bewaard.
          </p>
          <button type="button" className="knop breed" onClick={() => { zetOpen(null); nakijken?.(); }}>
            {nakijken ? 'Eerst laten nakijken' : 'Niet uitloggen'}
          </button>
          <button type="button" className="knop breed gevaar" onClick={() => { zetOpen(null); uitloggen(true); }}>
            {overal ? 'Van dit toestel wissen en overal uitloggen' : 'Van dit toestel wissen en uitloggen'}
          </button>
        </Venster>
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
export function HerstelKnoppen({ id, sync, na, alleenVergeten = false }: {
  id: string; sync: SyncVelden['sync']; na?: () => void;
  /** Een vakantie of pakitem zonder inhoud voer je opnieuw in bij de vakantie zelf; hier alleen vergeten (F8). */
  alleenVergeten?: boolean;
}) {
  const { lokaal, openItem } = useApp();
  if (!lokaal || !sync || sync === 'wachtend') return null;
  return (
    <div className="keuzes herstel">
      {alleenVergeten ? null : sync === 'zonder-inhoud' ? (
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
