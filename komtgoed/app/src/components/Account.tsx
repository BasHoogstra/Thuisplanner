// Meer → Account (KG-5H deel 2): met welk adres je bent ingelogd (M2), uitloggen op dit toestel of op alle toestellen,
// en je e-mailadres wijzigen. Wijzigen vraagt een code van het oude én van het nieuwe adres (Supabase: secure email
// change, via de codelaag). Daarna gaan de andere sessies en bekende toestellen uit; huishoudens en gegevens blijven,
// want het account blijft hetzelfde.
import { useState } from 'react';
import { useApp } from '../lib/context';
import { geldigAdres, geldigeCode } from '../lib/lokaal/code';

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
        <button type="button" className="knop stil" onClick={lokaal.uitloggen}>Uitloggen</button>
        {!overal
          ? <button type="button" className="knop stil" onClick={() => zetOveral(true)}>Uitloggen op alle toestellen</button>
          : <button type="button" className="knop gevaar" onClick={() => void a.uitloggenOveral()}>Ja, overal uitloggen</button>}
      </div>
      <p className="stil-tekst">
        Uitloggen op alle toestellen werkt direct, ook op een telefoon die je kwijt bent. Je logt daarna overal opnieuw in met een code.
        Wat op dit toestel nog niet is bevestigd, blijft hier bewaard.
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

function AdresBevestigen() {
  const { lokaal } = useApp();
  const a = lokaal!.accountBeheer;
  const nieuw = a.wijziging!.nieuw;
  const [klaar, zetKlaar] = useState<{ oud: boolean; nieuw: boolean }>({ oud: false, nieuw: false });
  const [codes, zetCodes] = useState({ oud: '', nieuw: '' });
  const [fout, zetFout] = useState<string | null>(null);
  const [bezig, zetBezig] = useState(false);
  const [gedaan, zetGedaan] = useState(false);
  const bevestig = async (welk: 'oud' | 'nieuw') => {
    const code = codes[welk];
    if (!geldigeCode(code)) { zetFout('Vul de zes cijfers in.'); return; }
    zetBezig(true); zetFout(null);
    const r = await a.bevestigAdres(welk === 'oud' ? lokaal!.account : nieuw, code);
    zetBezig(false);
    if (!r.ok) { zetFout(r.fout); return; }
    zetKlaar(k => ({ ...k, [welk]: true }));
    if (r.waarde === 'gewijzigd') zetGedaan(true);
  };
  if (gedaan) return <p className="stil-tekst" role="status">Je e-mailadres is gewijzigd. Op andere toestellen log je opnieuw in met een code.</p>;
  const veld = (welk: 'oud' | 'nieuw', adres: string) => (
    <div className="blok">
      <label className="veld">
        <span className="veld-label">Code naar {adres}</span>
        <input id={`adres-code-${welk}`} inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={codes[welk]}
          disabled={klaar[welk] || bezig} onChange={e => zetCodes(c => ({ ...c, [welk]: e.target.value.replace(/\D/g, '').slice(0, 6) }))} />
      </label>
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
