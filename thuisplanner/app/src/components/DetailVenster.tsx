// W1: een rustig detailvenster voor een bestaande afspraak of taak (besluiten D1–D4). Eerst overzicht: de titel, de dag,
// de tijd, wie, en (als ingevuld) waar, herhaling en privé. Een tik op een regel opent alleen dát onderdeel, met dezelfde
// kleine keuzes als de centrale +. "Opslaan" verschijnt pas na een wijziging; bij een reeks wordt dan pas gevraagd: alleen
// deze, of de hele reeks (D3). Verwijderen en "Alles bewerken" (het volledige formulier) staan onder "Meer…" (D2).
//
// Gegevensbehoud: opslaan bouwt de afspraak op dezelfde manier als het formulier (ItemVenster): notities, voorbereiding,
// de duur van een meerdaagse afspraak, herhaling en de reeksgegevens gaan mee, en de versie bij het openen voorkomt dat
// een gelijktijdige wijziging van een ander stil wordt overschreven.
import { useState, type ReactNode } from 'react';
import { useApp } from '../lib/context';
import { dagLabel, isGeldigeDatum, langeDatum, langeDatumHoofdletter, plusDagen, verschilInDagen } from '../lib/datum';
import { herhalingTekst, wordtDubbel } from '../lib/herhaling';
import { magZichtbaarheidKiezen } from '../lib/rechten';
import { nieuwId } from '../lib/store';
import { kiesbareVakanties } from '../lib/vakantie';
import type { Afspraak, Datum, Herhaling, LidId, Taak } from '../lib/types';
import { DatumKeuze, TijdKeuze, WieKeuze } from './Keuzepanelen';
import { IcHerhaal, IcSlot } from './Iconen';
import { Venster } from './Venster';

const minuten = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
/** De eindtijd bij een nieuwe begintijd: dezelfde duur, of leeg als die niet meer op dezelfde dag past. */
function schuif(oudStart: string, oudEind: string, nieuwStart: string): string {
  if (!oudStart || !oudEind) return '';
  const e = minuten(nieuwStart) + minuten(oudEind) - minuten(oudStart);
  return e > minuten(nieuwStart) && e < 24 * 60 ? `${String(Math.floor(e / 60)).padStart(2, '0')}:${String(e % 60).padStart(2, '0')}` : '';
}

type Paneel = 'dag' | 'tijd' | 'wie' | 'plek' | 'herhaling' | 'vakantie' | null;

export function DetailVenster({ item, reeks, sluit, allesBewerken, terugNaar }: {
  item: Afspraak | Taak;
  /** Bij een voorkomen van een herhalende afspraak: de reeks. */
  reeks?: Afspraak;
  sluit: () => void;
  allesBewerken: () => void;
  terugNaar?: HTMLElement | null;
}) {
  const app = useApp();
  const { vandaag, huishouden, staat, lid } = app;
  const afspraak = item.soort === 'afspraak' ? item : undefined;
  const taak = item.soort === 'taak' ? item : undefined;
  const begin = {
    titel: item.titel ?? '',
    dag: (afspraak ? afspraak.datum : taak!.datum) as Datum | null,
    start: afspraak?.start ?? '',
    eind: afspraak?.eind ?? '',
    wie: afspraak ? afspraak.wie : taak!.voor ? [taak!.voor] : [],
    plek: afspraak?.plek ?? '',
    prive: afspraak?.zichtbaarheid === 'prive',
    vakantie: taak?.vakantieId ?? null,
  };
  const [titel, zetTitel] = useState(begin.titel);
  const [dag, zetDag] = useState<Datum | null>(begin.dag);
  const [start, zetStart] = useState(begin.start);
  const [eind, zetEind] = useState(begin.eind);
  const [wie, zetWie] = useState<LidId[]>(begin.wie);
  const [plek, zetPlek] = useState(begin.plek);
  const [prive, zetPrive] = useState(begin.prive);
  const [vakantie, zetVakantie] = useState<string | null>(begin.vakantie);
  const vakanties = taak ? kiesbareVakanties(staat.vakanties, vandaag, begin.vakantie) : [];
  const [paneel, zetPaneel] = useState<Paneel>(null);
  const [meer, zetMeer] = useState(false);
  const [verwijderen, zetVerwijderen] = useState(false);
  const [fout, zetFout] = useState<string | null>(null);
  // De versies bij het openen (versiecontrole; in de demo ongebruikt).
  const [beginVersie] = useState(() => item.versie);
  const [reeksVersie] = useState(() => reeks?.versie);

  const losgemaakt = !!afspraak?.reeksId;
  const kanPrive = !!afspraak && magZichtbaarheidKiezen(afspraak, huishouden.ik);
  const herhaling = reeks?.herhaling ?? afspraak?.herhaling;
  const gewijzigd = titel.trim().replace(/\s+/g, ' ') !== begin.titel || dag !== begin.dag || start !== begin.start || eind !== begin.eind
    || wie.join() !== begin.wie.join() || plek.trim() !== begin.plek || prive !== begin.prive || vakantie !== begin.vakantie;
  const open = (p: Exclude<Paneel, null>) => zetPaneel(x => (x === p ? null : p));
  const tijd = start ? (eind ? `${start} – ${eind}` : start) : 'Hele dag';
  const wieTekst = wie.length ? wie.map(id => lid(id)?.naam ?? '?').join(', ') : afspraak ? 'Iedereen' : 'Nog niemand';

  function weggooien() {
    zetTitel(begin.titel); zetDag(begin.dag); zetStart(begin.start); zetEind(begin.eind); zetWie(begin.wie);
    zetPlek(begin.plek); zetPrive(begin.prive); zetVakantie(begin.vakantie); zetPaneel(null); zetFout(null);
  }

  function opslaan(bereik?: 'deze' | 'reeks') {
    const t = titel.trim().replace(/\s+/g, ' ');
    if (!t) { zetFout('Geef het even een naam.'); return; }
    if (taak) {
      // De vakantie alleen meegeven als die is gewijzigd; anders blijft het veld zoals het was (F8).
      const nieuw: Taak = { ...taak, titel: t, datum: dag, voor: wie[0] ?? null, ...(vakantie !== begin.vakantie ? { vakantieId: vakantie } : {}), versie: beginVersie };
      app.bijwerken(nieuw, `${t} aangepast`);
      sluit();
      return;
    }
    const vorig = afspraak!;
    const datum = dag ?? vorig.datum;
    if (!isGeldigeDatum(datum)) { zetFout('Kies een geldige datum.'); return; }
    const meerdaags = !!vorig.eindDatum;
    if (eind && (!start || (!meerdaags && eind <= start))) { zetFout(start ? 'De eindtijd ligt vóór of op de begintijd.' : 'Vul eerst een begintijd in.'); return; }
    if (reeks && bereik === 'deze' && wordtDubbel(staat.items, reeks.id, vorig.datum, datum)) {
      zetFout('Op die dag staat deze herhalende afspraak al. Kies een andere dag.'); return;
    }
    // Hele reeks vanaf een voorkomen: de reeks schuift even ver op als de dag die je koos.
    const reeksDatum = reeks && bereik === 'reeks' ? plusDagen(reeks.datum, verschilInDagen(vorig.datum, datum)) : datum;
    const doel = reeks && bereik === 'reeks' ? reeksDatum : datum;
    const nieuweHerhaling: Herhaling | undefined = losgemaakt || (reeks && bereik === 'deze') ? undefined
      : reeks ? reeks.herhaling : vorig.herhaling;
    const a: Afspraak = {
      id: vorig.id, soort: 'afspraak', titel: t, datum: doel,
      start: start || undefined, eind: (start && eind) || undefined, plek: plek.trim() || undefined, wie,
      eigenaar: vorig.eigenaar,
      zichtbaarheid: kanPrive ? (prive ? 'prive' : 'huishouden') : vorig.zichtbaarheid,
      // Niet in dit venster, wel bewaren: voorbereiding, notities en de duur van een meerdaagse afspraak (schuift mee).
      voorbereiding: vorig.voorbereiding,
      notities: vorig.notities,
      eindDatum: vorig.eindDatum ? plusDagen(vorig.eindDatum, verschilInDagen(vorig.datum, doel)) : undefined,
      herhaling: nieuweHerhaling,
      reeksId: vorig.reeksId, origineleDatum: vorig.origineleDatum,
    };
    const wanneer = `${dagLabel(doel, vandaag).toLowerCase()}${a.start ? ' ' + a.start : ''}`;
    if (reeks && bereik === 'deze') app.wijzigVoorkomen(reeks.id, vorig.datum, { ...a, id: nieuwId('a') }, `${t} aangepast (${wanneer})`);
    else if (reeks) app.bijwerken({ ...a, id: reeks.id, versie: reeksVersie }, `Hele reeks ${t} aangepast`);
    else app.bijwerken({ ...a, versie: beginVersie }, `${t} aangepast (${wanneer})`);
    sluit();
  }

  function verwijder(bereik?: 'deze' | 'reeks') {
    const naam = item.titel ?? 'Afspraak';
    if (reeks && bereik === 'deze') app.verwijderVoorkomen(reeks.id, afspraak!.datum, `${naam} op ${langeDatum(afspraak!.datum)} verwijderd`);
    else if (reeks) app.verwijderReeks(reeks.id, `Hele reeks ${naam} verwijderd`);
    else app.verwijder([item.id], `${naam} verwijderd`);
    sluit();
  }

  const rij = (p: Exclude<Paneel, null>, label: string, waarde: string, extra?: ReactNode) => (
    <button type="button" className="detail-rij" aria-expanded={paneel === p} onClick={() => open(p)}>
      <span className="detail-label">{label}</span>{' '}
      <span className="detail-waarde">{extra}{waarde}</span>
    </button>
  );

  return (
    <Venster titel={afspraak ? 'Afspraak' : 'Taak'} sluit={sluit} terugNaar={terugNaar}>
      <div className="detail">
        <label className="sr-only" htmlFor="detail-titel">Wat?</label>
        <input id="detail-titel" className="detail-titel" value={titel} maxLength={80} autoComplete="off"
          onChange={e => { zetTitel(e.target.value); zetFout(null); }} />

        <div className="detail-rijen">
          {rij('dag', 'Dag', dag ? langeDatumHoofdletter(dag) : 'Geen datum')}
          {paneel === 'dag' && (
            <div className="paneel">
              <DatumKeuze vandaag={vandaag} datum={dag} geenDatum={!!taak} kop={reeks ? 'Wanneer (deze keer)' : 'Wanneer'}
                kies={d => { zetDag(d); zetPaneel(null); zetFout(null); }} />
            </div>
          )}
          {afspraak && rij('tijd', 'Tijd', tijd)}
          {afspraak && paneel === 'tijd' && (
            <div className="paneel">
              <TijdKeuze start={start} eind={eind} metEind kies={(s, e, viaVeld) => {
                // Een andere begintijd met een knop: de eindtijd schuift mee (dezelfde duur), of vervalt als hij niet meer past.
                const nieuwEind = !s ? '' : viaVeld ? e ?? '' : schuif(start, eind, s);
                zetStart(s); zetEind(nieuwEind); zetFout(null); if (!viaVeld) zetPaneel(null);
              }} />
            </div>
          )}
          {rij('wie', afspraak ? 'Voor wie' : 'Wie pakt het op', wieTekst)}
          {paneel === 'wie' && (
            <div className="paneel">
              <WieKeuze leden={huishouden.leden} wie={wie} enkel={!!taak} kies={w => { zetWie(w); if (taak) zetPaneel(null); }} />
            </div>
          )}
          {afspraak && (begin.plek || plek) && rij('plek', 'Waar', plek || '—')}
          {afspraak && paneel === 'plek' && (
            <div className="paneel">
              <label className="veld"><span className="sr-only">Waar</span>
                <input id="detail-plek" aria-label="Waar" value={plek} maxLength={80} autoComplete="off" onChange={e => zetPlek(e.target.value)} />
              </label>
            </div>
          )}
          {afspraak && herhaling && !losgemaakt && rij('herhaling', 'Herhaalt', herhalingTekst((reeks ?? afspraak).datum, herhaling), <IcHerhaal />)}
          {afspraak && paneel === 'herhaling' && (
            <div className="paneel">
              <p className="stil-tekst">De herhaling zelf wijzig je via Meer… → Alles bewerken.</p>
            </div>
          )}
          {losgemaakt && <p className="detail-noot"><IcHerhaal /> Losgemaakt uit een herhalende afspraak</p>}
          {kanPrive && (
            <button type="button" className="detail-rij" aria-pressed={prive} onClick={() => zetPrive(p => !p)}>
              <span className="detail-label">Zichtbaar</span>{' '}
              <span className="detail-waarde">{prive ? <><IcSlot /> Alleen voor jou</> : 'Voor het hele huishouden'}</span>
            </button>
          )}
          {taak && vakanties.length > 0 && rij('vakantie', 'Vakantie', vakanties.find(v => v.id === vakantie)?.naam ?? 'Geen')}
          {taak && paneel === 'vakantie' && (
            <div className="paneel">
              <div className="keuzes" role="group" aria-label="Hoort bij vakantie">
                {vakanties.map(v => (
                  <button key={v.id} type="button" className={'keuze' + (vakantie === v.id ? ' aan' : '')} aria-pressed={vakantie === v.id}
                    onClick={() => { zetVakantie(v.id); zetPaneel(null); }}>{v.naam}</button>
                ))}
                <button type="button" className={'keuze' + (!vakantie ? ' aan' : '')} aria-pressed={!vakantie} onClick={() => { zetVakantie(null); zetPaneel(null); }}>Geen</button>
              </div>
            </div>
          )}
          {taak && (
            <div className="detail-rij statisch">
              <span className="detail-label">Status</span>{' '}
              <span className="detail-waarde">{taak.klaar ? 'Afgerond' : 'Nog te doen'}</span>
            </div>
          )}
          {afspraak?.notities && <p className="detail-noot">{afspraak.notities}</p>}
        </div>

        {fout && <p className="veld-fout" role="alert">{fout}</p>}

        {gewijzigd ? (
          <div className="detail-acties">
            {reeks ? (
              <>
                <button type="button" className="knop breed" onClick={() => opslaan('deze')}>Alleen deze opslaan</button>
                <button type="button" className="knop breed stil" onClick={() => opslaan('reeks')}>Hele reeks opslaan</button>
              </>
            ) : (
              <button type="button" className="knop breed" onClick={() => opslaan()}>Opslaan</button>
            )}
            <button type="button" className="tekstknop" onClick={weggooien}>Wijzigingen weggooien</button>
          </div>
        ) : (
          <div className="detail-acties">
            {taak && (
              <button type="button" className="knop breed" onClick={() => { app.wissel(taak.id, taak.klaar ? `${taak.titel} weer open` : `${taak.titel} afgerond`); sluit(); }}>
                {taak.klaar ? 'Weer openzetten' : 'Afgerond'}
              </button>
            )}
            {!verwijderen && (
              <button type="button" className="tekstknop detail-meer" aria-expanded={meer} onClick={() => zetMeer(m => !m)}>Meer…</button>
            )}
            {meer && !verwijderen && (
              <div className="keuzes detail-meer-keuzes">
                <button type="button" className="keuze" onClick={allesBewerken}>Alles bewerken</button>
                <button type="button" className="keuze gevaar-stil" onClick={() => zetVerwijderen(true)}>Verwijderen</button>
              </div>
            )}
            {verwijderen && (
              <div className="detail-bevestig" role="group" aria-label="Verwijderen bevestigen">
                <p>{reeks ? 'Wat wil je verwijderen?' : `${item.titel ?? 'Dit'} verwijderen?`}</p>
                {reeks ? (
                  <>
                    <button type="button" className="knop breed gevaar" onClick={() => verwijder('deze')}>Alleen deze verwijderen</button>
                    <button type="button" className="knop breed gevaar stil-gevaar" onClick={() => verwijder('reeks')}>Hele reeks verwijderen</button>
                  </>
                ) : (
                  <button type="button" className="knop breed gevaar" onClick={() => verwijder()}>Ja, verwijderen</button>
                )}
                <button type="button" className="knop breed stil" onClick={() => { zetVerwijderen(false); zetMeer(false); }}>Nee, terug</button>
              </div>
            )}
          </div>
        )}
      </div>
    </Venster>
  );
}
