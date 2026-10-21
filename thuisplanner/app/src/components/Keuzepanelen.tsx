// Kleine keuzes die pas verschijnen als je één onderdeel wilt wijzigen: de dag, de tijd, wie. Gedeeld door de centrale +
// (SnelInvoer) en het detailvenster (DetailVenster), zodat ze overal hetzelfde werken en eruitzien.
import { dagLabel, isGeldigeDatum, plusDagen } from '../lib/datum';
import type { Datum, Lid, LidId } from '../lib/types';

export const SNELLE_TIJDEN = ['09:00', '12:00', '15:30', '18:00'];

/** Vandaag, morgen, overmorgen, een andere datum, en (bij een taak) "Geen datum". */
export function DatumKeuze({ vandaag, datum, geenDatum, kies, kop = 'Wanneer' }: {
  vandaag: Datum; datum: Datum | null; geenDatum: boolean; kies: (d: Datum | null) => void; kop?: string;
}) {
  const snel = [0, 1, 2].map(n => plusDagen(vandaag, n));
  return (
    <>
      <div className="keuzes" role="group" aria-label={kop}>
        {snel.map(d => (
          <button key={d} type="button" className={'keuze' + (datum === d ? ' aan' : '')} aria-pressed={datum === d} onClick={() => kies(d)}>{dagLabel(d, vandaag)}</button>
        ))}
        {geenDatum && (
          <button type="button" className={'keuze' + (!datum ? ' aan' : '')} aria-pressed={!datum} onClick={() => kies(null)}>Geen datum</button>
        )}
      </div>
      <label className="veld-sub"><span className="sr-only">Andere datum</span>
        <input type="date" aria-label="Andere datum" value={datum ?? ''} onChange={e => { if (isGeldigeDatum(e.target.value)) kies(e.target.value); }} />
      </label>
    </>
  );
}

/** Hele dag, een snelle tijd of een eigen tijd; met eind (optioneel). */
export function TijdKeuze({ start, eind, kies, metEind = false }: {
  /** viaVeld: getypt in een tijdveld (het paneel blijft dan open). */
  start: string; eind?: string; kies: (start: string, eind?: string, viaVeld?: boolean) => void; metEind?: boolean;
}) {
  return (
    <>
      <div className="keuzes" role="group" aria-label="Hoe laat">
        <button type="button" className={'keuze' + (!start ? ' aan' : '')} aria-pressed={!start} onClick={() => kies('')}>Hele dag</button>
        {SNELLE_TIJDEN.map(t => (
          <button key={t} type="button" className={'keuze' + (start === t ? ' aan' : '')} aria-pressed={start === t} onClick={() => kies(t, eind)}>{t}</button>
        ))}
      </div>
      <div className="tijden">
        <label><span className="tijd-label">Van</span>
          <input type="time" aria-label="Andere tijd" value={start} onChange={e => kies(e.target.value, eind, true)} />
        </label>
        {metEind && start && (
          <label><span className="tijd-label">Tot</span>
            <input type="time" aria-label="Eindtijd" value={eind ?? ''} onChange={e => kies(start, e.target.value || undefined, true)} />
          </label>
        )}
      </div>
    </>
  );
}

/** Wie: bij een taak één persoon, bij een afspraak meer (of iedereen). */
export function WieKeuze({ leden, wie, enkel, kies }: { leden: Lid[]; wie: LidId[]; enkel: boolean; kies: (wie: LidId[]) => void }) {
  return (
    <div className="keuzes" role="group" aria-label={enkel ? 'Wie pakt het op' : 'Voor wie'}>
      {!enkel && (
        <button type="button" className={'keuze' + (!wie.length ? ' aan' : '')} aria-pressed={!wie.length} onClick={() => kies([])}>Iedereen</button>
      )}
      {leden.map(l => {
        const aan = wie.includes(l.id);
        const nieuw = enkel ? (aan ? [] : [l.id]) : aan ? wie.filter(x => x !== l.id) : [...wie, l.id];
        return (
          <button key={l.id} type="button" className={'keuze' + (aan ? ' aan' : '')} aria-pressed={aan} onClick={() => kies(nieuw)}>
            <span className="stip" style={{ background: l.kleur }} aria-hidden="true" />{l.naam}
          </button>
        );
      })}
    </div>
  );
}
