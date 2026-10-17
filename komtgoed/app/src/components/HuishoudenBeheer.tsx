// Meer → Huishouden (KG-5H deel 1 en 1b, S3 en S4): uitnodigingen voor jou, leden, lid toevoegen, uitnodigen (optioneel op
// e-mailadres), open uitnodigingen, wisselen. Eigenaar en beheerder zien dezelfde knoppen; alleen "als beheerder
// uitnodigen" is voor de eigenaar (de database dwingt dat af). Gewone leden zien de ledenlijst.
import { useCallback, useEffect, useState } from 'react';
import { useApp } from '../lib/context';
import { UitnodigingenVoorJou } from './Onboarding';
import { magBeheerderUitnodigen, magBeheren, mailOpnieuw, mailStatussen, mailTekst, magOpnieuwMailen, nodigUit, openUitnodigingen, ROL_TEKST,
  trekIn, verstuurMails, voegLidToe, type MailStatus, type NieuweUitnodiging, type OpenUitnodiging } from '../lib/lokaal/beheer';
import type { Rol } from '../lib/lokaal/sessie';

const datumTekst = (d: Date | string) => new Date(d).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long' });

export function HuishoudenBeheer() {
  const { lokaal } = useApp();
  const beheer = lokaal?.beheer;
  const rol = beheer?.huishouden.rol as Rol | undefined;
  const beheren = magBeheren(rol);
  const [open, zetOpen] = useState<OpenUitnodiging[]>([]);
  const [melding, zetMelding] = useState<string | null>(null);
  const [mails, zetMails] = useState<Map<string, MailStatus>>(new Map());

  const ververs = useCallback(async (versturen = true) => {
    if (!beheer || !beheren) return;
    const [r, m] = await Promise.all([openUitnodigingen(beheer.client, beheer.huishouden.id), mailStatussen(beheer.client, beheer.huishouden.id)]);
    if (r.ok) zetOpen(r.waarde);
    zetMails(m);
    // Wacht er nog een mail (net gemaakt, of een eerdere poging lukte niet), dan nu versturen en opnieuw kijken.
    if (versturen && [...m.values()].some(x => x.status === 'wacht')) {
      await verstuurMails(beheer.client, beheer.huishouden.id);
      zetMails(await mailStatussen(beheer.client, beheer.huishouden.id));
    }
  }, [beheer, beheren]);
  useEffect(() => { void ververs(); }, [ververs]);

  if (!beheer) return null;
  const leden = beheer.leden.filter(l => l.status === 'active');
  const naamVan = (id: string | null) => (id ? leden.find(l => l.id === id)?.display_name ?? 'een lid' : 'iemand nieuw');

  return (
    <section aria-labelledby="h-huishouden" className="blok">
      <h2 id="h-huishouden" className="sectie-kop">Huishouden</h2>
      <p><strong>{beheer.huishouden.naam}</strong> · jij bent {ROL_TEKST[rol ?? 'member'].toLowerCase()}</p>

      {lokaal?.uitnodigingen && <UitnodigingenVoorJou lijst={lokaal.uitnodigingen.lijst} opBekijk={lokaal.uitnodigingen.bekijk} kop="h3" />}

      {beheer.huishoudens.length > 1 && (
        <div className="blok" aria-labelledby="h-wisselen">
          <h3 id="h-wisselen" className="sectie-kop">Wisselen</h3>
          <div className="keuzes">
            {beheer.huishoudens.filter(h => h.id !== beheer.huishouden.id).map(h => (
              <button key={h.id} type="button" className="keuze" onClick={() => beheer.kies(h.id)}>Naar {h.naam}</button>
            ))}
          </div>
        </div>
      )}

      <h3 className="sectie-kop">Leden</h3>
      <ul className="lijst" aria-label="Leden">
        {leden.map(l => (
          <li key={l.id} className="rij">
            <span className="rij-inhoud">
              <span className="rij-titel">{l.display_name}</span>
              <span className="rij-sub">
                {l.kind === 'child' ? 'Kind' : 'Volwassene'} · {l.has_account ? ROL_TEKST[(l.role as Rol) ?? 'member'] : 'nog geen account'}
              </span>
            </span>
          </li>
        ))}
      </ul>

      {melding && <p className="stil-tekst" role="status">{melding}</p>}
      {beheren && (
        <>
          <LidToevoegen opKlaar={naam => zetMelding(`${naam} is toegevoegd.`)} />
          <Uitnodigen rol={rol} opNieuw={() => void ververs()} />
          {open.length > 0 && (
            <div className="blok" aria-labelledby="h-open">
              <h3 id="h-open" className="sectie-kop">Open uitnodigingen</h3>
              <ul className="lijst">
                {open.map(u => <OpenRij key={u.id} u={u} naam={naamVan(u.lidId)} mail={mails.get(u.id)} opNieuw={() => void ververs()}
                  opIngetrokken={() => { zetMelding('Uitnodiging ingetrokken.'); void ververs(false); }} />)}
              </ul>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function LidToevoegen({ opKlaar }: { opKlaar: (naam: string) => void }) {
  const beheer = useApp().lokaal!.beheer;
  const [naam, zetNaam] = useState('');
  const [soort, zetSoort] = useState<'adult' | 'child'>('adult');
  const [fout, zetFout] = useState<string | null>(null);
  const [bezig, zetBezig] = useState(false);
  const voegToe = async (e: { preventDefault(): void }) => {
    e.preventDefault();
    if (!naam.trim() || naam.trim().length > 80) { zetFout('Vul een naam in (1 tot 80 tekens).'); return; }
    zetBezig(true); zetFout(null);
    const r = await voegLidToe(beheer.client, beheer.huishouden.id, naam.trim(), soort);
    zetBezig(false);
    if (!r.ok) { zetFout(r.fout); return; }
    opKlaar(naam.trim());
    zetNaam('');
  };
  return (
    <form className="blok" onSubmit={voegToe} noValidate aria-labelledby="h-lid">
      <h3 id="h-lid" className="sectie-kop">Lid toevoegen</h3>
      <p className="stil-tekst">Ook voor kinderen, of voor je partner voordat die een account heeft.</p>
      <label className="veld">
        <span className="veld-label">Naam</span>
        <input id="lid-naam" value={naam} maxLength={80} onChange={e => zetNaam(e.target.value)} autoComplete="off" />
      </label>
      <div className="segment twee" role="radiogroup" aria-label="Soort lid">
        {(['adult', 'child'] as const).map(s => (
          <button key={s} type="button" role="radio" aria-checked={soort === s} className={'segment-knop' + (soort === s ? ' aan' : '')} onClick={() => zetSoort(s)}>
            {s === 'adult' ? 'Volwassene' : 'Kind'}
          </button>
        ))}
      </div>
      {fout && <p className="veld-fout" role="alert">{fout}</p>}
      <button type="submit" className="knop breed stil" disabled={bezig}>Toevoegen</button>
    </form>
  );
}

function Uitnodigen({ rol, opNieuw }: { rol: Rol | undefined; opNieuw: () => void }) {
  const beheer = useApp().lokaal!.beheer;
  // Uit te nodigen profielen: volwassenen zonder account (de database weigert kinderen en gekoppelde leden).
  const profielen = beheer.leden.filter(l => l.status === 'active' && l.kind === 'adult' && !l.has_account);
  const mag = magBeheerderUitnodigen(rol);
  const [voor, zetVoor] = useState<string>('nieuw');
  const [email, zetEmail] = useState('');
  const [nieuweRol, zetNieuweRol] = useState<'admin' | 'member'>(mag ? 'admin' : 'member');
  const [fout, zetFout] = useState<string | null>(null);
  const [bezig, zetBezig] = useState(false);
  const [link, zetLink] = useState<NieuweUitnodiging | null>(null);
  const [gekopieerd, zetGekopieerd] = useState(false);

  const maak = async (e: { preventDefault(): void }) => {
    e.preventDefault();
    zetBezig(true); zetFout(null); zetGekopieerd(false);
    const r = await nodigUit(beheer.client, beheer.huishouden.id, voor === 'nieuw' ? null : voor, mag ? nieuweRol : 'member', { email });
    zetBezig(false);
    if (!r.ok) { zetFout(r.fout); return; }
    zetLink(r.waarde);
    zetEmail('');
    opNieuw();
  };
  const deel = async () => {
    if (!link) return;
    try { await navigator.share({ title: 'Uitnodiging voor Thuisplanner', url: link.link }); } catch { /* geannuleerd */ }
  };
  const kopieer = async () => {
    if (!link) return;
    try { await navigator.clipboard.writeText(link.link); zetGekopieerd(true); } catch { zetFout('Kopiëren lukte niet. Selecteer de link en kopieer hem zelf.'); }
  };

  return (
    <form className="blok" onSubmit={maak} noValidate aria-labelledby="h-uitnodigen">
      <h3 id="h-uitnodigen" className="sectie-kop">Uitnodigen</h3>
      <label className="veld">
        <span className="veld-label">Voor wie</span>
        <select id="uitnodiging-voor" value={voor} onChange={e => zetVoor(e.target.value)}>
          <option value="nieuw">Iemand nieuw</option>
          {profielen.map(l => <option key={l.id} value={l.id}>{l.display_name}</option>)}
        </select>
      </label>
      <label className="veld">
        <span className="veld-label">E-mailadres (optioneel)</span>
        <input id="uitnodiging-email" type="email" inputMode="email" value={email} maxLength={254} onChange={e => zetEmail(e.target.value)}
          autoComplete="off" autoCapitalize="none" spellCheck={false} aria-describedby="uitnodiging-email-hulp" />
      </label>
      <p id="uitnodiging-email-hulp" className="veld-hulp">Dan kan alleen iemand met dit adres accepteren. Die ziet de uitnodiging na het inloggen ook zonder link.</p>
      {mag ? (
        <div className="segment twee" role="radiogroup" aria-label="Rol">
          {(['admin', 'member'] as const).map(r => (
            <button key={r} type="button" role="radio" aria-checked={nieuweRol === r} className={'segment-knop' + (nieuweRol === r ? ' aan' : '')} onClick={() => zetNieuweRol(r)}>
              {r === 'admin' ? 'Beheerder' : 'Lid'}
            </button>
          ))}
        </div>
      ) : (
        <p className="stil-tekst">Je nodigt uit als lid. Iemand als beheerder uitnodigen doet de eigenaar.</p>
      )}
      <p className="stil-tekst">Een beheerder kan alles wat jij kunt in het dagelijks gebruik, ook leden toevoegen en uitnodigen.</p>
      {fout && <p className="veld-fout" role="alert">{fout}</p>}
      <button type="submit" className="knop breed stil" disabled={bezig}>{bezig ? 'Even geduld…' : 'Uitnodiging maken'}</button>
      {link && (
        <div className="blok" aria-live="polite">
          <label className="veld">
            <span className="veld-label">Uitnodigingslink</span>
            <input id="uitnodiging-gemaakt" readOnly value={link.link} onFocus={e => e.target.select()} spellCheck={false} />
          </label>
          {link.email ? (
            <p className="stil-tekst">We mailen <strong>{link.email}</strong> dat er een uitnodiging klaarstaat (zonder link). Geldig tot {datumTekst(link.verloopt)},
              één keer te gebruiken, en alleen door wie inlogt met dat adres. Die ziet de uitnodiging na het inloggen; de link kun je ook zelf delen.</p>
          ) : (
            <p className="stil-tekst">Geldig tot {datumTekst(link.verloopt)} en één keer te gebruiken. Stuur hem alleen naar degene die je uitnodigt.</p>
          )}
          <div className="keuzes">
            {typeof navigator.share === 'function' && <button type="button" className="keuze" onClick={() => void deel()}>Delen</button>}
            <button type="button" className="keuze" onClick={() => void kopieer()}>{gekopieerd ? 'Gekopieerd' : 'Kopiëren'}</button>
          </div>
        </div>
      )}
    </form>
  );
}

function OpenRij({ u, naam, mail, opNieuw, opIngetrokken }: { u: OpenUitnodiging; naam: string; mail: MailStatus | undefined; opNieuw: () => void; opIngetrokken: () => void }) {
  const beheer = useApp().lokaal!.beheer;
  const [zeker, zetZeker] = useState(false);
  const [fout, zetFout] = useState<string | null>(null);
  const [bezig, zetBezig] = useState(false);
  const nogEens = async () => {
    zetBezig(true); zetFout(null);
    const r = await mailOpnieuw(beheer.client, u.id);
    zetBezig(false);
    if (!r.ok) { zetFout(r.fout); return; }
    opNieuw();
  };
  const trek = async () => {
    const r = await trekIn(beheer.client, u.id);
    if (!r.ok) { zetFout(r.fout); return; }
    opIngetrokken();
  };
  return (
    <li className="rij">
      <span className="rij-inhoud">
        <span className="rij-titel">Voor {naam}{u.email ? ` · ${u.email}` : ''}</span>
        <span className="rij-sub">
          {u.rol === 'admin' ? 'Beheerder' : 'Lid'} · {u.geweigerd ? 'geweigerd' : `geldig tot ${datumTekst(u.verloopt)}`}
        </span>
        {mail && !u.geweigerd && <span className="rij-sub">{mailTekst(mail)}</span>}
        {mail && !u.geweigerd && magOpnieuwMailen(mail) && (
          <button type="button" className="keuze" disabled={bezig} onClick={() => void nogEens()}>Mail nog eens sturen</button>
        )}
        {fout && <span className="veld-fout" role="alert">{fout}</span>}
      </span>
      {u.geweigerd ? null : !zeker
        ? <button type="button" className="knop stil klein" onClick={() => zetZeker(true)}>Intrekken</button>
        : <button type="button" className="knop gevaar klein" onClick={() => void trek()}>Zeker intrekken</button>}
    </li>
  );
}
