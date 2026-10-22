// B2: de centrale + als één rustige invoer (docs/thuisplanner-snelinvoer.md §4, besluiten V1–V6 en K1–K7).
// Eén veld. Pas na het typen verschijnt rustig wat Thuisplanner begrijpt: de titel en kleine knoppen. Een tik op een knop
// opent een kleine keuze; wat je kiest, wint van de zin. Een aanname (niet uit je zin) ziet er anders uit, twijfel staat er
// in gewone taal bij, en privé staat bij een afspraak altijd in beeld. "Alles invullen" opent het bestaande formulier.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useApp, type Soort } from '../lib/context';
import { dagLabel } from '../lib/datum';
import { DatumKeuze, TijdKeuze, WieKeuze } from './Keuzepanelen';
import { categorie, categorieNaam } from '../lib/categorie';
import { FREQUENTIES, herhalingTekst } from '../lib/herhaling';
import { nieuwId } from '../lib/store';
import { isBoodschap } from '../lib/vandaag';
import type { Afspraak, Datum, Frequentie, LidId, Taak } from '../lib/types';
import { begrijp, type Onderdeel } from '../lib/zin';
import { Venster } from './Venster';

const NAAM: Record<Soort, string> = { afspraak: 'Afspraak', taak: 'Taak', boodschap: 'Boodschap' };

/** Wat "Alles invullen" aan het formulier meegeeft. */
export interface Voorinvulling {
  soort: Soort;
  titel: string;
  datum: Datum | null;
  start?: string;
  eind?: string;
  wie: LidId[];
  plek?: string;
  prive: boolean;
  herhaling?: { freq: Frequentie; tot: Datum | null };
}

/** Wat de gebruiker met een knop koos (wint van de zin). `null` bij datum of tijd: bewust leeg. */
interface Keuze { soort?: Soort; datum?: Datum | null; start?: string | null; wie?: LidId[]; prive?: boolean }
type Paneel = 'soort' | 'datum' | 'tijd' | 'wie' | 'plek' | 'herhaling' | null;

export function SnelInvoer({ standaard, sluit, allesInvullen, terugNaar }: {
  standaard?: { soort?: Soort; datum?: Datum };
  terugNaar?: HTMLElement | null;
  sluit: () => void;
  allesInvullen: (v: Voorinvulling) => void;
}) {
  const app = useApp();
  const { vandaag, huishouden, staat } = app;
  const [tekst, zetTekst] = useState('');
  const [keuze, zetKeuze] = useState<Keuze>({});
  const [negeer, zetNegeer] = useState<Set<Onderdeel>>(new Set());
  const [paneel, zetPaneel] = useState<Paneel>(null);
  const veld = useRef<HTMLInputElement>(null);
  useEffect(() => { veld.current?.focus(); }, []);

  const bekend = useMemo(() => staat.items.filter(isBoodschap).map(b => b.naam), [staat.items]);
  const v = useMemo(() => begrijp(tekst, { vandaag, leden: huishouden.leden, bekendeBoodschappen: bekend, standaard },
    { soort: keuze.soort, negeer }), [tekst, vandaag, huishouden.leden, bekend, standaard, keuze.soort, negeer]);

  // Wat er bewaard wordt: de zin, met daarboven wat de gebruiker koos.
  const soort = v.soort;
  const datum = keuze.datum !== undefined ? keuze.datum : v.datum;
  const start = keuze.start !== undefined ? keuze.start ?? undefined : v.start;
  const eind = keuze.start !== undefined ? undefined : v.eind;
  const wie = keuze.wie ?? v.wie;
  const prive = soort === 'afspraak' && (keuze.prive ?? v.prive);
  const leeg = !tekst.trim();
  const geenTitel = v.meldingen.some(m => m.soort === 'geen-titel');
  const meldingen = v.meldingen.filter(m => m.soort !== 'geen-titel');
  const aanname = (o: 'soort' | 'datum') => v.aangenomen.includes(o) && (o === 'soort' ? keuze.soort === undefined : keuze.datum === undefined);
  const lid = (id: LidId) => huishouden.leden.find(l => l.id === id);
  const kies = (k: Keuze) => { zetKeuze(x => ({ ...x, ...k })); zetPaneel(null); };
  const terugInTitel = (o: Onderdeel) => {
    zetNegeer(n => new Set([...n, o]));
    if (o === 'datum') zetKeuze(x => ({ ...x, datum: undefined }));
    if (o === 'tijd') zetKeuze(x => ({ ...x, start: undefined }));
    if (o === 'wie') zetKeuze(x => ({ ...x, wie: undefined }));
    zetPaneel(null);
  };

  function voorinvulling(): Voorinvulling {
    // Leeg veld: het formulier zoals het was (een afspraak, of wat de knop in de Agenda meegaf); je kiest daar zelf de soort.
    if (leeg) return { soort: standaard?.soort ?? 'afspraak', titel: '', datum: standaard?.datum ?? null, wie: [], prive: false };
    return { soort, titel: soort === 'boodschap' ? v.boodschappen.join(', ') : v.titel, datum, start, eind, wie, plek: v.plek, prive, herhaling: v.herhaling };
  }

  function toevoegen(e: { preventDefault(): void }) {
    e.preventDefault();
    if (leeg || geenTitel) { veld.current?.focus(); return; }
    if (soort === 'boodschap') {
      app.voegBoodschappenToe(v.boodschappen);
    } else if (soort === 'taak') {
      const t: Taak = { id: nieuwId('t'), soort: 'taak', titel: v.titel, datum, voor: wie[0] ?? null, klaar: false, klaarOp: null };
      app.toevoegen([t], datum ? `${v.titel} staat op de takenlijst` : `${v.titel} staat op de lijst voor later`);
    } else {
      const d = datum ?? vandaag;
      const a: Afspraak = {
        id: nieuwId('a'), soort: 'afspraak', titel: v.titel, datum: d, start, eind: start ? eind : undefined, plek: v.plek, wie,
        eigenaar: huishouden.ik, zichtbaarheid: prive ? 'prive' : 'huishouden',
        herhaling: v.herhaling ? { freq: v.herhaling.freq, tot: v.herhaling.tot, uitzonderingen: [] } : undefined,
      };
      const wanneer = `${dagLabel(d, vandaag).toLowerCase()}${start ? ' ' + start : ''}`;
      app.toevoegen([a], a.herhaling ? `${v.titel} staat in de agenda (${herhalingTekst(d, a.herhaling).toLowerCase()})` : `${v.titel} staat in de agenda (${wanneer})`);
    }
    sluit();
  }

  const knop = (p: Exclude<Paneel, null>, label: string, opties: { aanname?: boolean; leeg?: boolean } = {}) => (
    <button type="button" className={'keuze chip' + (opties.aanname ? ' aanname' : '') + (opties.leeg ? ' leeg' : '') + (paneel === p ? ' aan' : '')}
      aria-expanded={paneel === p} onClick={() => zetPaneel(paneel === p ? null : p)}>
      {label}{opties.aanname && <span className="sr-only"> (niet uit je zin; tik om te wijzigen)</span>}
    </button>
  );
  const terugKnop = (o: Onderdeel) => v.herkend.includes(o) && (
    <button type="button" className="tekstknop" onClick={() => terugInTitel(o)}>Terug in de titel</button>
  );
  const wieLabel = wie.length ? wie.map(id => lid(id)?.naam ?? '?').join(', ') : soort === 'afspraak' ? 'Iedereen' : 'Voor wie?';
  const tijdLabel = start ? (eind ? `${start}–${eind}` : start) : 'Hele dag';

  return (
    <Venster titel="Toevoegen" sluit={sluit} terugNaar={terugNaar}>
      <form className="snelinvoer" onSubmit={toevoegen} noValidate>
        <label className="veld">
          <span className="veld-label">Wat wil je regelen?</span>
          <input ref={veld} id="snel-zin" value={tekst} onChange={e => zetTekst(e.target.value)} autoComplete="off"
            maxLength={200} enterKeyHint="done" placeholder="Bijv. morgen om 15:00 naar de tandarts" />
        </label>

        {!leeg && (
          <div className="voorstel" aria-live="polite">
            <p className="voorstel-titel">
              {soort === 'boodschap'
                ? (v.boodschappen.length ? `${v.boodschappen.length === 1 ? '1 boodschap' : `${v.boodschappen.length} boodschappen`}` : '—')
                : v.titel || '—'}
            </p>
            {soort === 'boodschap' && v.boodschappen.length > 0 && (
              <ul className="voorstel-boodschappen">
                {v.boodschappen.map(n => <li key={n}><span>{n}</span> <span className="plek">{categorieNaam(categorie(n))}</span></li>)}
              </ul>
            )}
            <div className="keuzes chips" role="group" aria-label="Wat Thuisplanner herkent">
              {knop('soort', NAAM[soort], { aanname: aanname('soort') })}
              {soort !== 'boodschap' && knop('datum', datum ? dagLabel(datum, vandaag) : 'Geen datum', { aanname: aanname('datum'), leeg: !datum })}
              {soort === 'afspraak' && knop('tijd', tijdLabel)}
              {soort !== 'boodschap' && knop('wie', wieLabel, { leeg: !wie.length && soort === 'taak' })}
              {soort === 'afspraak' && v.plek && knop('plek', v.plek)}
              {soort === 'afspraak' && v.herhaling && knop('herhaling', FREQUENTIES.find(f => f.id === v.herhaling!.freq)?.label ?? 'Herhaalt')}
              {soort === 'afspraak' && (
                <button type="button" className={'keuze chip' + (prive ? ' aan' : '')} aria-pressed={prive}
                  onClick={() => kies({ prive: !prive })}>{prive ? 'Privé' : 'Gedeeld'}</button>
              )}
            </div>

            {paneel === 'soort' && (
              <div className="paneel keuzes" role="group" aria-label="Soort">
                {(['afspraak', 'taak', 'boodschap'] as Soort[]).map(s => (
                  <button key={s} type="button" className={'keuze' + (s === soort ? ' aan' : '')} aria-pressed={s === soort} onClick={() => kies({ soort: s })}>{NAAM[s]}</button>
                ))}
              </div>
            )}
            {paneel === 'datum' && (
              <div className="paneel">
                <DatumKeuze vandaag={vandaag} datum={datum} geenDatum={soort === 'taak'} kies={d => kies({ datum: d })} />
                {terugKnop('datum')}
              </div>
            )}
            {paneel === 'tijd' && (
              <div className="paneel">
                <TijdKeuze start={start ?? ''} kies={(s, _e, viaVeld) => viaVeld ? zetKeuze(x => ({ ...x, start: s || null })) : kies({ start: s || null })} />
                {terugKnop('tijd')}
              </div>
            )}
            {paneel === 'wie' && (
              <div className="paneel">
                <WieKeuze leden={huishouden.leden} wie={wie} enkel={soort === 'taak'}
                  kies={w => soort === 'taak' || !w.length ? kies({ wie: w }) : zetKeuze(x => ({ ...x, wie: w }))} />
                {terugKnop('wie')}
              </div>
            )}
            {(paneel === 'plek' || paneel === 'herhaling') && (
              <div className="paneel">
                <p className="stil-tekst">{paneel === 'plek' ? `Waar: ${v.plek}` : herhalingTekst(datum ?? vandaag, { freq: v.herhaling!.freq, tot: v.herhaling!.tot })}</p>
                {terugKnop(paneel)}
              </div>
            )}

            {v.suggesties.map(s => (
              <p key={s.lid} className="voorstel-melding">
                Bedoel je <button type="button" className="tekstknop" onClick={() => zetTekst(t => t.replace(s.woord, s.naam))}>{s.naam}</button>?
              </p>
            ))}
            {meldingen.filter(m => m.soort !== 'onbekende-naam' || !v.suggesties.length).map(m => (
              <p key={m.soort} className="voorstel-melding">{m.tekst}</p>
            ))}
          </div>
        )}

        <button type="submit" className="knop breed" onClick={toevoegen} disabled={leeg || geenTitel}>Toevoegen</button>
        <button type="button" className="tekstknop alles-invullen" onClick={() => allesInvullen(voorinvulling())}>Alles invullen</button>
      </form>
    </Venster>
  );
}
