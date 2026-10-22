// Inloggen en aanmelden met een e-mailcode (KG-5H deel 2). Eén route voor een nieuw en een bestaand adres: e-mailadres,
// zes cijfers, ingelogd. Geen wachtwoord. Zie docs/thuisplanner-deel2-bouwscope.md §4 (mobiel) en de afspraken M1/M2:
// - M1: na "Stuur code" onthoudt dit toestel 10 minuten het adres (nooit de code); wie even naar de mail wisselt en
//   terugkomt, ziet direct het codescherm;
// - M2: het adres staat altijd in beeld, met "Ander adres gebruiken".
// Automatisch invullen: autocomplete="one-time-code" (iOS vult de code vanuit Mail in, waar Apple dat ondersteunt);
// plakken van de hele code werkt; bij zes cijfers gaat het vanzelf verder.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Sessie } from '../lib/lokaal/sessie';
import { geldigAdres, geldigeCode, leesAanvraag, NIEUWE_CODE_NA_S, vergeetAanvraag } from '../lib/lokaal/code';
import { Captcha } from './Captcha';

export function CodeInloggen({ sessie, uitnodiging = false, startFout = null }: { sessie: Sessie; uitnodiging?: boolean; startFout?: string | null }) {
  const aanvraag = useMemo(() => leesAanvraag(), []);
  const [stap, zetStap] = useState<'adres' | 'code'>(aanvraag ? 'code' : 'adres');
  const [email, zetEmail] = useState(aanvraag?.email ?? '');
  const [code, zetCode] = useState('');
  const [fout, zetFout] = useState<string | null>(startFout);
  const [bezig, zetBezig] = useState(false);
  const [wacht, zetWacht] = useState(() => aanvraag ? Math.max(0, NIEUWE_CODE_NA_S - Math.floor((Date.now() - aanvraag.tijd) / 1000)) : 0);
  const [nieuwe, zetNieuwe] = useState(0);
  const [captcha, zetCaptcha] = useState<string | null>(null);
  const [captchaNodig, zetCaptchaNodig] = useState(!!sessie.config.turnstile);
  const codeVeld = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (wacht <= 0) return;
    const t = window.setTimeout(() => zetWacht(w => w - 1), 1000);
    return () => window.clearTimeout(t);
  }, [wacht]);
  useEffect(() => { if (stap === 'code') codeVeld.current?.focus(); }, [stap]);

  const vraag = async (e?: { preventDefault(): void }) => {
    e?.preventDefault();
    if (!geldigAdres(email)) { zetFout('Vul je e-mailadres in, bijvoorbeeld naam@voorbeeld.nl.'); return; }
    if (captchaNodig && !captcha) { zetFout('Bevestig eerst dat je geen robot bent.'); return; }
    zetBezig(true); zetFout(null);
    const r = await sessie.vraagCode(email, captcha);
    zetBezig(false);
    zetCaptcha(null);
    if (!r.ok) { zetFout(r.fout); return; }
    if (stap === 'code') zetNieuwe(n => n + 1);
    zetStap('code'); zetCode(''); zetWacht(NIEUWE_CODE_NA_S);
  };

  const controleer = async (waarde: string) => {
    if (!geldigeCode(waarde) || bezig) return;
    zetBezig(true); zetFout(null);
    const r = await sessie.controleerCode(email, waarde, captcha);
    zetBezig(false);
    if (!r.ok) {
      zetFout(r.fout);
      zetCode('');
      if (r.code === 'TPK06') { zetCaptchaNodig(true); zetCaptcha(null); }
      codeVeld.current?.focus();
    }
  };

  const typ = (v: string) => {
    const cijfers = v.replace(/\D/g, '').slice(0, 6);
    zetCode(cijfers);
    if (cijfers.length === 6) void controleer(cijfers);
  };

  const anderAdres = () => { vergeetAanvraag(); zetStap('adres'); zetCode(''); zetFout(null); zetNieuwe(0); zetWacht(0); };

  if (stap === 'adres') {
    return (
      <form className="blok" onSubmit={vraag} noValidate aria-labelledby="h-inloggen-code">
        <h2 id="h-inloggen-code" className="sectie-kop">{uitnodiging ? 'Bekijk je uitnodiging' : 'Inloggen of aanmelden'}</h2>
        <p className="stil-tekst">
          {uitnodiging ? 'Vul het e-mailadres in waarop je bent uitgenodigd.' : 'Vul je e-mailadres in.'} Je krijgt een code van zes cijfers;
          een wachtwoord is niet nodig. Nieuw bij Thuisplanner? Dan maak je zo meteen je account.
        </p>
        <label className="veld">
          <span className="veld-label">E-mailadres</span>
          <input id="code-email" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck={false}
            value={email} maxLength={254} onChange={e => zetEmail(e.target.value)} />
        </label>
        {captchaNodig && sessie.config.turnstile && <Captcha sitekey={sessie.config.turnstile} opToken={zetCaptcha} />}
        {fout && <p className="veld-fout" role="alert">{fout}</p>}
        <button type="submit" className="knop breed" disabled={bezig}>{bezig ? 'Even geduld…' : 'Stuur code'}</button>
      </form>
    );
  }

  return (
    <form className="blok" onSubmit={e => { e.preventDefault(); void controleer(code); }} noValidate aria-labelledby="h-code">
      <h2 id="h-code" className="sectie-kop">Vul de code in</h2>
      <p>We hebben een code gestuurd naar <strong>{email}</strong>.</p>
      <p className="stil-tekst">De code is 10 minuten geldig. Zie je niets? Kijk ook bij Ongewenst of Spam.</p>
      <label className="veld">
        <span className="veld-label">Code uit de mail</span>
        <input id="code-cijfers" ref={codeVeld} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" maxLength={6}
          value={code} onChange={e => typ(e.target.value)} disabled={bezig} aria-describedby="code-hulp" />
      </label>
      <p id="code-hulp" className="veld-hulp">Zes cijfers. Plakken mag ook.</p>
      {captchaNodig && sessie.config.turnstile && <Captcha sitekey={sessie.config.turnstile} opToken={zetCaptcha} />}
      {fout && <p className="veld-fout" role="alert">{fout}</p>}
      <button type="submit" className="knop breed" disabled={bezig || code.length !== 6}>{bezig ? 'Even geduld…' : 'Inloggen'}</button>
      <div className="keuzes">
        <button type="button" className="keuze" onClick={() => void vraag()} disabled={bezig || wacht > 0}>
          {wacht > 0 ? `Nieuwe code over ${wacht} s` : 'Stuur een nieuwe code'}
        </button>
        <button type="button" className="keuze" onClick={anderAdres} disabled={bezig}>Ander adres gebruiken</button>
      </div>
      {nieuwe >= 2 && (
        <p className="stil-tekst" role="status">
          Komt er niets? Controleer of het adres klopt: <strong>{email}</strong>. Sommige mailproviders houden een bericht een paar minuten
          vast; gebruik dan de nieuwste code. Lukt het niet, probeer het later nog eens.
        </p>
      )}
    </form>
  );
}
