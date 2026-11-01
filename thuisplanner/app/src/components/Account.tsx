// Meer → Account (KG-5H deel 2): met welk adres je bent ingelogd (M2), uitloggen op dit toestel of op alle toestellen,
// en je e-mailadres wijzigen. Wijzigen vraagt een code van het oude én van het nieuwe adres (Supabase: secure email
// change, via de codelaag). Daarna gaan de andere sessies en bekende toestellen uit; huishoudens en gegevens blijven,
// want het account blijft hetzelfde.
import { useCallback, useState } from 'react';
import { useApp } from '../lib/context';
import { geldigAdres, geldigeCode } from '../lib/lokaal/code';
import { UitlogKnop } from './Lokaal';
import { Captcha } from './Captcha';

export function Account() {
  const { lokaal } = useApp();
  const [overal, zetOveral] = useState(false);
  const [wijzigen, zetWijzigen] = useState(false);
  if (!lokaal) return null;
  const { accountBeheer: a } = lokaal;
  return (
    <section aria-labelledby="h-account" className="blok">
      <h2 id="h-account" className="sectie-kop">Account</h2>
      <p>Ingelogd als <strong>{lokaal.account}</strong>.</p>
      <div className="keuzes">
        <UitlogKnop label="Uitloggen" className="knop stil" aantal={lokaal.onbevestigdOpToestel} nakijken={lokaal.nakijken}
          uitloggen={wissen => lokaal.uitloggen({ wissen })} />
        {!overal
          ? <button type="button" className="knop stil" onClick={() => zetOveral(true)}>Uitloggen op alle toestellen</button>
          : <UitlogKnop label="Ja, overal uitloggen" className="knop gevaar" overal aantal={lokaal.onbevestigdOpToestel} nakijken={lokaal.nakijken}
            uitloggen={wissen => void a.uitloggenOveral({ wissen })} />}
      </div>
      <p className="stil-tekst">
        Uitloggen op alle toestellen werkt direct, ook op een telefoon die je kwijt bent. Je logt daarna overal opnieuw in met een code.
        Staat er op dit toestel nog iets dat de server niet heeft bevestigd, dan vraagt uitloggen eerst wat je ermee wilt.
      </p>
      {a.wijziging ? <AdresBevestigen /> : !wijzigen
        ? <button type="button" className="knop stil" onClick={() => zetWijzigen(true)}>E-mailadres wijzigen</button>
        : <AdresWijzigen sluit={() => zetWijzigen(false)} />}
    </section>
  );
}

function AdresWijzigen({ sluit }: { sluit: () => void }) {
  const a = useApp().lokaal!.accountBeheer;
  const [nieuw, zetNieuw] = useState('');
  const [fout, zetFout] = useState<string | null>(null);
  const [bezig, zetBezig] = useState(false);
  const verstuur = async (e: { preventDefault(): void }) => {
    e.preventDefault();
    if (!geldigAdres(nieuw)) { zetFout('Vul een geldig e-mailadres in.'); return; }
    zetBezig(true); zetFout(null);
    const r = await a.wijzigAdres(nieuw);
    zetBezig(false);
    if (!r.ok) zetFout(r.fout);
  };
  return (
    <form className="blok" onSubmit={verstuur} noValidate aria-labelledby="h-adres">
      <h3 id="h-adres" className="sectie-kop">E-mailadres wijzigen</h3>
      <label className="veld">
        <span className="veld-label">Nieuw e-mailadres</span>
        <input id="adres-nieuw" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck={false}
          value={nieuw} maxLength={254} onChange={e => zetNieuw(e.target.value)} />
      </label>
      <p className="stil-tekst">Je krijgt een code op je huidige én op je nieuwe adres. Pas als beide kloppen, verandert je adres.</p>
      {fout && <p className="veld-fout" role="alert">{fout}</p>}
      <button type="submit" className="knop breed" disabled={bezig}>{bezig ? 'Even geduld…' : 'Stuur codes'}</button>
      <button type="button" className="knop breed stil" onClick={sluit} disabled={bezig}>Annuleren</button>
      <p className="stil-tekst">
        Geen toegang meer tot je huidige adres? Vraag dan iemand die beheerder is van je huishouden om je opnieuw uit te nodigen op
        je nieuwe adres. Je komt dan als nieuw account in dat huishouden; privé-afspraken van je oude account gaan niet mee.
      </p>
    </form>
  );
}

type Welk = 'oud' | 'nieuw';

function AdresBevestigen() {
  const { lokaal } = useApp();
  const a = lokaal!.accountBeheer;
  const nieuw = a.wijziging!.nieuw;
  const [klaar, zetKlaar] = useState<{ oud: boolean; nieuw: boolean }>({ oud: false, nieuw: false });
  const [codes, zetCodes] = useState({ oud: '', nieuw: '' });
  const [fout, zetFout] = useState<string | null>(null);
  const [bezig, zetBezig] = useState(false);
  const [gedaan, zetGedaan] = useState(false);
  // TPK06 (eerst een captcha) geldt per adres: dat adres krijgt een eigen widget. Een Turnstile-token werkt één keer,
  // dus na elke poging een nieuwe widget (nieuwe key) en een leeg token, zodat de volgende poging een vers token heeft.
  const [captchaNodig, zetCaptchaNodig] = useState<Record<Welk, boolean>>({ oud: false, nieuw: false });
  const [tokens, zetTokens] = useState<Record<Welk, string | null>>({ oud: null, nieuw: null });
  const [rondes, zetRondes] = useState<Record<Welk, number>>({ oud: 0, nieuw: 0 });
  const verbruikt = (welk: Welk) => { zetTokens(t => ({ ...t, [welk]: null })); zetRondes(r => ({ ...r, [welk]: r[welk] + 1 })); };
  // Stabiele callbacks: Captcha gebruikt opToken als effectafhankelijkheid. Een nieuwe functie bij elke render zou de widget
  // bij elk token, elke toetsaanslag en elke wijziging aan het andere adres verwijderen en opnieuw maken.
  const tokenOud = useCallback((t: string | null) => zetTokens(x => ({ ...x, oud: t })), []);
  const tokenNieuw = useCallback((t: string | null) => zetTokens(x => ({ ...x, nieuw: t })), []);
  const bevestig = async (welk: Welk) => {
    const code = codes[welk];
    if (!geldigeCode(code)) { zetFout('Vul de zes cijfers in.'); return; }
    if (captchaNodig[welk] && a.captchaSitekey && !tokens[welk]) { zetFout('Bevestig eerst dat je geen robot bent.'); return; }
    zetBezig(true); zetFout(null);
    const token = captchaNodig[welk] ? tokens[welk] : null;
    const r = await a.bevestigAdres(welk === 'oud' ? lokaal!.account : nieuw, code, token);
    zetBezig(false);
    if (token) verbruikt(welk);
    if (!r.ok) {
      zetFout(r.fout);
      if (r.code === 'TPK06') { zetCaptchaNodig(n => ({ ...n, [welk]: true })); if (!token) verbruikt(welk); }
      return;
    }
    zetKlaar(k => ({ ...k, [welk]: true }));
    if (r.waarde === 'gewijzigd') zetGedaan(true);
  };
  if (gedaan) return <p className="stil-tekst" role="status">Je e-mailadres is gewijzigd. Op andere toestellen log je opnieuw in met een code.</p>;
  const veld = (welk: Welk, adres: string) => (
    <div className="blok">
      <label className="veld">
        <span className="veld-label">Code naar {adres}</span>
        <input id={`adres-code-${welk}`} inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={codes[welk]}
          disabled={klaar[welk] || bezig} onChange={e => zetCodes(c => ({ ...c, [welk]: e.target.value.replace(/\D/g, '').slice(0, 6) }))} />
      </label>
      {!klaar[welk] && captchaNodig[welk] && a.captchaSitekey && (
        <Captcha key={`${welk}-${rondes[welk]}`} sitekey={a.captchaSitekey} heeftToken={!!tokens[welk]} opnieuwTonen
          opToken={welk === 'oud' ? tokenOud : tokenNieuw} />
      )}
      {klaar[welk]
        ? <p className="stil-tekst">Bevestigd.</p>
        : <button type="button" className="knop stil" disabled={bezig} onClick={() => void bevestig(welk)}>Bevestigen</button>}
    </div>
  );
  return (
    <div className="blok" aria-labelledby="h-adres-codes">
      <h3 id="h-adres-codes" className="sectie-kop">Bevestig je nieuwe adres</h3>
      <p className="stil-tekst">Vul beide codes in. Ze zijn 10 minuten geldig.</p>
      {veld('nieuw', nieuw)}
      {veld('oud', lokaal!.account)}
      {fout && <p className="veld-fout" role="alert">{fout}</p>}
    </div>
  );
}
