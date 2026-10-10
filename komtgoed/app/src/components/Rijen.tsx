import { useApp } from '../lib/context';
import type { Afspraak, Boodschap, LidId, Taak } from '../lib/types';
import { IcSlot, IcVink } from './Iconen';

export function Wie({ ids, klein }: { ids: LidId[]; klein?: boolean }) {
  const { lid } = useApp();
  if (!ids.length) return <span className={'wie' + (klein ? ' klein' : '')}>Iedereen</span>;
  return (
    <span className={'wie' + (klein ? ' klein' : '')}>
      {ids.map(id => {
        const l = lid(id);
        return l ? (
          <span key={id} className="wie-lid">
            <span className="stip" style={{ background: l.kleur }} aria-hidden="true" />{l.naam}
          </span>
        ) : null;
      })}
    </span>
  );
}

export function tijdTekst(a: Afspraak): string {
  if (!a.start) return 'Hele dag';
  return a.eind ? `${a.start} – ${a.eind}` : a.start;
}

export function AfspraakRij({ a, voorbij }: { a: Afspraak; voorbij?: boolean }) {
  const { lid } = useApp();
  const bezet = a.titel === undefined;
  const kleur = a.wie.length === 1 ? lid(a.wie[0])?.kleur : undefined;
  return (
    <li className={'rij afspraak' + (voorbij ? ' voorbij' : '')}>
      <span className="rij-tijd">
        {a.start ?? 'Hele dag'}
        {a.eind && <small aria-label={`tot ${a.eind}`}>{a.eind}</small>}
      </span>
      <span className="rij-streep" style={{ background: kleur ?? 'var(--lijn-sterk)' }} aria-hidden="true" />
      <span className="rij-inhoud">
        {bezet ? (
          <span className="rij-titel bezet"><IcSlot /> Bezet</span>
        ) : (
          <span className="rij-titel">{a.titel}</span>
        )}
        <span className="rij-sub">
          <Wie ids={a.wie} klein />
          {a.plek && <span className="plek">{a.plek}</span>}
          {bezet && <span className="plek">privé-afspraak</span>}
          {!bezet && a.zichtbaarheid === 'prive' && <span className="plek prive"><IcSlot /> alleen voor jou</span>}
        </span>
      </span>
    </li>
  );
}

export function Vinkje({ aan }: { aan: boolean }) {
  return <span className={'vinkje' + (aan ? ' aan' : '')} aria-hidden="true">{aan && <IcVink />}</span>;
}

export function TaakRij({ t, extra }: { t: Taak; extra?: string }) {
  const { wissel, meld } = useApp();
  return (
    <li className={'rij taak' + (t.klaar ? ' klaar' : '')}>
      <button className="rij-knop" role="checkbox" aria-checked={t.klaar}
        onClick={() => { wissel(t.id); meld(t.klaar ? 'Weer open gezet' : 'Afgerond', { ongedaan: true }); }}>
        <Vinkje aan={t.klaar} />
        <span className="rij-inhoud">
          <span className="rij-titel">{t.titel}</span>
          {(t.voor || extra) && (
            <span className="rij-sub">
              {t.voor && <Wie ids={[t.voor]} klein />}
              {extra && <span className="plek">{extra}</span>}
            </span>
          )}
        </span>
      </button>
    </li>
  );
}

export function BoodschapRij({ b }: { b: Boodschap }) {
  const { wissel } = useApp();
  return (
    <li className={'rij boodschap' + (b.afgevinkt ? ' klaar' : '')}>
      <button className="rij-knop" role="checkbox" aria-checked={b.afgevinkt} onClick={() => wissel(b.id)}>
        <Vinkje aan={b.afgevinkt} />
        <span className="rij-inhoud"><span className="rij-titel">{b.naam}</span></span>
      </button>
    </li>
  );
}
