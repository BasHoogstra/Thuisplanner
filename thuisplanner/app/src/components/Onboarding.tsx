// Onboarding (KG-5H deel 1 en 1b, docs/thuisplanner-onboarding.md en docs/thuisplanner-uitnodiging-email.md): het
// eerste huishouden aanmaken (S1) en een uitnodiging bekijken en accepteren (S2). Een uitnodiging komt uit de lijst
// "Uitnodigingen voor jou" (op het bevestigde e-mailadres van dit account, zonder link) of uit een link. Alleen via de
// bestaande databasefuncties; de database maakt de maker eigenaar en dwingt alle regels van uitnodigingen af, ook dat
// een uitnodiging op e-mailadres alleen voor dat bevestigde adres geldt. Werkt lokaal en op staging (dezelfde sessie).
import { useEffect, useState } from 'react';
import type { Momentopname, Sessie, UitnodigingVoorMij } from '../lib/lokaal/sessie';
import { bewaarUitnodiging, tokenUit, vergeetUitnodiging } from '../lib/uitnodiging';
import { OmgevingsBalk } from './Lokaal';

const geldigeNaam = (s: string) => s.trim().length >= 1 && s.trim().length <= 80;
const datumTekst = (d: string) => new Date(d).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long' });
const ALS: Record<UitnodigingVoorMij['rol'], string> = { admin: 'als beheerder', member: 'als lid' };

/** Waar een uitnodiging vandaan komt: een link (token in dit tabblad) of de lijst voor dit account. */
export type UitnodigingBron = { soort: 'link'; token: string } | { soort: 'lijst'; u: UitnodigingVoorMij };

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

/** "Uitnodigingen voor jou": in S1 en in Meer. Bekijken opent S2; accepteren gebeurt nooit vanzelf. */
export function UitnodigingenVoorJou({ lijst, opBekijk, kop: Kop = 'h2' }: { lijst: UitnodigingVoorMij[]; opBekijk: (u: UitnodigingVoorMij) => void; kop?: 'h2' | 'h3' }) {
  if (!lijst.length) return null;
  return (
    <section className="blok" aria-labelledby="h-voor-jou">
      <Kop id="h-voor-jou" className="sectie-kop">Uitnodigingen voor jou</Kop>
      <ul className="lijst">
        {lijst.map(u => (
          <li key={u.id} className="rij">
            <span className="rij-inhoud">
              <span className="rij-titel">{u.huishouden}</span>
              <span className="rij-sub">
                {u.doorWie ? `Van ${u.doorWie} · ` : ''}{ALS[u.rol]} · geldig tot {datumTekst(u.geldigTot)}
              </span>
            </span>
            <button type="button" className="knop klein" onClick={() => opBekijk(u)} aria-label={`Uitnodiging voor ${u.huishouden} bekijken`}>Bekijken</button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** S1: ingelogd, nog geen huishouden. Een uitnodiging voor jou bekijken, een nieuw huishouden aanmaken, of een link plakken. */
export function Welkom({ sessie, snap, opUitnodiging, opBekijk }: {
  sessie: Sessie; snap: Momentopname; opUitnodiging: (token: string) => void; opBekijk: (u: UitnodigingVoorMij) => void;
}) {
  const [naam, zetNaam] = useState('');
  const [eigenNaam, zetEigenNaam] = useState('');
  const [link, zetLink] = useState('');
  const [fout, zetFout] = useState<string | null>(null);
  const [linkFout, zetLinkFout] = useState<string | null>(null);
  const [bezig, zetBezig] = useState(false);
  const uitnodigingen = snap.uitnodigingen ?? [];
  useNaamVoorstel(sessie, zetEigenNaam);

  const maak = async (e: { preventDefault(): void }) => {
    e.preventDefault();
    if (!geldigeNaam(naam) || !geldigeNaam(eigenNaam)) { zetFout('Vul een naam voor het huishouden en je eigen naam in (1 tot 80 tekens).'); return; }
    zetBezig(true); zetFout(null);
    void sessie.bewaarNaam?.(eigenNaam.trim());
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

      <UitnodigingenVoorJou lijst={uitnodigingen} opBekijk={opBekijk} />

      {snap.magHuishouden === false ? (
        <section className="blok" aria-labelledby="h-besloten">
          <h2 id="h-besloten" className="sectie-kop">Besloten test</h2>
          <p>Thuisplanner is nog in een besloten test. Je kunt meedoen met een uitnodiging van iemand die al meedoet.</p>
          <p className="stil-tekst">Ben je uitgenodigd op een ander e-mailadres? Log dan uit en log in met dat adres.</p>
        </section>
      ) : (
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
      )}

      {uitnodigingen.length === 0 && (
        <p className="stil-tekst">Ben je uitgenodigd op je e-mailadres? Dan verschijnt de uitnodiging hier vanzelf, zodra je bent
          ingelogd met dat adres. Je bent nu ingelogd als <strong>{snap.account?.email}</strong>.</p>
      )}

      <form className="blok" onSubmit={plak} noValidate aria-labelledby="h-uitnodiging">
        <h2 id="h-uitnodiging" className="sectie-kop">Ik heb een uitnodigingslink</h2>
        <label className="veld">
          <span className="veld-label">Uitnodigingslink</span>
          <input id="uitnodiging-link" value={link} onChange={e => zetLink(e.target.value)} autoComplete="off" spellCheck={false} inputMode="url" />
        </label>
        {linkFout && <p className="veld-fout" role="alert">{linkFout}</p>}
        <button type="submit" className="knop breed stil">Verder</button>
      </form>

      <button type="button" className="knop stil" onClick={() => void sessie.uitloggen()}>Uitloggen en ander adres gebruiken</button>
    </Pagina>
  );
}

/** De naam uit het eigen profiel voorstellen (D5: één keer vragen), zonder iets te overschrijven wat al is ingevuld. */
function useNaamVoorstel(sessie: Sessie, zet: (f: (oud: string) => string) => void) {
  useEffect(() => {
    let weg = false;
    void sessie.leesNaam?.().then(n => { if (!weg && n) zet(oud => oud || n); });
    return () => { weg = true; };
  }, [sessie, zet]);
}

/** S2: een uitnodiging bekijken en (alleen op verzoek) accepteren, uit de lijst of uit een link. */
export function UitnodigingAccepteren({ sessie, snap, bron, sluit }: { sessie: Sessie; snap: Momentopname; bron: UitnodigingBron; sluit: () => void }) {
  const [eigenNaam, zetEigenNaam] = useState('');
  const [fout, zetFout] = useState<{ tekst: string; code?: string } | null>(null);
  const [bezig, zetBezig] = useState(false);
  const [lid, zetLid] = useState<string | null>(null);   // het huishouden waar je nu lid van bent
  const [verlaten, zetVerlaten] = useState(false);
  const [weigeren, zetWeigeren] = useState(false);
  const u = bron.soort === 'lijst' ? bron.u : null;
  const naamNodig = !u?.profiel;
  useNaamVoorstel(sessie, zetEigenNaam);

  const accepteer = async (e: { preventDefault(): void }) => {
    e.preventDefault();
    if (eigenNaam.trim().length > 80) { zetFout({ tekst: 'Je naam is te lang (hoogstens 80 tekens).' }); return; }
    zetBezig(true); zetFout(null);
    const naam = naamNodig ? eigenNaam.trim() || null : null;
    if (naam) void sessie.bewaarNaam?.(naam);
    const r = bron.soort === 'link' ? await sessie.accepteerUitnodiging(bron.token, naam) : await sessie.accepteerUitnodigingOpId(bron.u.id, naam);
    zetBezig(false);
    if (!r.ok) { zetFout({ tekst: r.fout, code: r.code }); return; }
    if (bron.soort === 'link') vergeetUitnodiging();   // eenmalig: hoe dan ook niet meer bewaren
    zetLid(r.waarde);
  };
  const nietNu = () => { if (bron.soort === 'link') vergeetUitnodiging(); sluit(); };
  const weiger = async () => {
    if (!u) return;
    zetBezig(true);
    const r = await sessie.weigerUitnodiging(u.id);
    zetBezig(false);
    if (!r.ok) { zetFout({ tekst: r.fout, code: r.code }); return; }
    sluit();
  };
  const verlaat = async () => {
    if (!lid) return;
    zetBezig(true);
    const r = await sessie.verlaatHuishouden(lid);
    zetBezig(false);
    if (!r.ok) { zetFout({ tekst: r.fout, code: r.code }); return; }
    sluit();
  };

  if (lid) {
    const huidig = sessie.momentopname().huishouden;
    const naam = huidig?.id === lid ? huidig.naam : u?.huishouden ?? null;
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
        {fout && <p className="veld-fout" role="alert">{fout.tekst}</p>}
      </Pagina>
    );
  }

  return (
    <Pagina sessie={sessie} label="Uitnodiging">
      <header className="kop">
        <h1>Uitnodiging</h1>
        {u ? (
          <p className="kop-samenvatting">{u.doorWie ?? 'Iemand'} nodigt je uit voor <strong>{u.huishouden}</strong>, {ALS[u.rol]}.
            Geldig tot {datumTekst(u.geldigTot)}.</p>
        ) : (
          <p className="kop-samenvatting">Je bent uitgenodigd voor een huishouden in Thuisplanner.</p>
        )}
      </header>
      <form className="blok" onSubmit={accepteer} noValidate>
        <p>Je accepteert als <strong>{snap.account?.email}</strong>. Accepteer alleen een uitnodiging van iemand die je kent.</p>
        {naamNodig ? (
          <label className="veld">
            <span className="veld-label">Jouw naam</span>
            <input id="uitnodiging-naam" value={eigenNaam} maxLength={80} onChange={e => zetEigenNaam(e.target.value)} autoComplete="given-name" />
            {!u && <span className="veld-hulp">Niet nodig als degene die je uitnodigde je naam al heeft ingevuld.</span>}
          </label>
        ) : (
          <p className="stil-tekst">Je wordt gekoppeld aan <strong>{u!.profiel}</strong> in dit huishouden.</p>
        )}
        {fout && <p className="veld-fout" role="alert">{fout.tekst}</p>}
        {fout?.code === 'TPU06' && (
          <button type="button" className="knop breed stil" onClick={() => { void sessie.uitloggen(); }}>Uitloggen en met een ander adres inloggen</button>
        )}
        <button type="submit" className="knop breed" disabled={bezig}>{bezig ? 'Even geduld…' : 'Accepteren'}</button>
        {u ? (
          !weigeren ? (
            <div className="keuzes">
              <button type="button" className="keuze" onClick={sluit} disabled={bezig}>Later</button>
              <button type="button" className="keuze" onClick={() => zetWeigeren(true)} disabled={bezig}>Weigeren</button>
            </div>
          ) : (
            <div className="blok">
              <p>Weigeren? De uitnodiging vervalt; {u.doorWie ?? 'degene die je uitnodigde'} ziet dat je hebt geweigerd.</p>
              <button type="button" className="knop breed gevaar" onClick={() => void weiger()} disabled={bezig}>Ja, weigeren</button>
              <button type="button" className="knop breed stil" onClick={() => zetWeigeren(false)} disabled={bezig}>Nee, terug</button>
            </div>
          )
        ) : (
          <button type="button" className="knop breed stil" onClick={nietNu} disabled={bezig}>Niet accepteren</button>
        )}
      </form>
      {bron.soort === 'link' && (
        <p className="stil-tekst">Niet jouw account? <button type="button" className="knop stil klein" onClick={() => { void sessie.uitloggen(); }}>Uitloggen</button>; de uitnodiging blijft in dit tabblad bewaard.</p>
      )}
    </Pagina>
  );
}

/** Eén rustige melding op Vandaag zolang er een uitnodiging voor jou openstaat (besluit c). */
export function UitnodigingMelding({ lijst, opBekijk, opAlle, opLater }: {
  lijst: UitnodigingVoorMij[]; opBekijk: (u: UitnodigingVoorMij) => void; opAlle: () => void; opLater: () => void;
}) {
  if (!lijst.length) return null;
  const een = lijst.length === 1 ? lijst[0] : null;
  return (
    <section className="meedenker uitnodiging-melding" aria-label="Uitnodiging">
      <p className="meedenker-vraag">
        {een ? <>Je bent uitgenodigd voor <strong>{een.huishouden}</strong>.</> : <>Je hebt {lijst.length} uitnodigingen.</>}
      </p>
      <div className="meedenker-knoppen">
        <button type="button" className="knop klein" onClick={() => (een ? opBekijk(een) : opAlle())}>Bekijken</button>
        <button type="button" className="knop stil klein" onClick={opLater}>Later</button>
      </div>
    </section>
  );
}
