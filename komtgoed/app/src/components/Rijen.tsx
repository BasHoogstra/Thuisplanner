import { useApp } from '../lib/context';
import { isBezetVanAnder } from '../lib/rechten';
import type { Afspraak, Boodschap, LidId, Taak } from '../lib/types';
import { IcPijl, IcSlot, IcVink } from './Iconen';

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

/** Een afspraak als rij. De hele rij opent de afspraak; een privé-afspraak van een ander toont alleen "Bezet". */
export function AfspraakRij({ a, voorbij, compact }: { a: Afspraak; voorbij?: boolean; compact?: boolean }) {
  const { lid, huishouden, openItem } = useApp();
  const bezet = isBezetVanAnder(a, huishouden.ik);
  const kleur = a.wie.length === 1 ? lid(a.wie[0])?.kleur : undefined;
  const naam = bezet ? `Bezet, ${tijdTekst(a)}` : `${a.titel}, ${tijdTekst(a)}`;
  return (
    <li className={'rij afspraak' + (voorbij ? ' voorbij' : '') + (compact ? ' compact' : '')}>
      <button type="button" className="rij-knop" onClick={() => openItem(a.id)} aria-label={`${naam}. Openen`}>
        <span className="rij-tijd">
          {a.start ?? 'Hele dag'}
          {a.eind && <small aria-hidden="true">{a.eind}</small>}
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
            {a.plek && !bezet && !compact && <span className="plek">{a.plek}</span>}
            {bezet && <span className="plek">privé-afspraak</span>}
            {!bezet && a.zichtbaarheid === 'prive' && <span className="plek prive"><IcSlot /> alleen voor jou</span>}
          </span>
        </span>
      </button>
    </li>
  );
}

export function Vinkje({ aan }: { aan: boolean }) {
  return <span className={'vinkje' + (aan ? ' aan' : '')} aria-hidden="true">{aan && <IcVink />}</span>;
}

/** Afvinken en openen zijn twee aparte knoppen, zodat je niet per ongeluk afvinkt als je wilt aanpassen. */
export function TaakRij({ t, extra }: { t: Taak; extra?: string }) {
  const { wissel, openItem } = useApp();
  return (
    <li className={'rij taak' + (t.klaar ? ' klaar' : '')}>
      <button type="button" className="vink-knop" role="checkbox" aria-checked={t.klaar}
        aria-label={t.titel} onClick={() => wissel(t.id, t.klaar ? `${t.titel} weer open` : `${t.titel} afgerond`)}>
        <Vinkje aan={t.klaar} />
      </button>
      <button type="button" className="rij-open" onClick={() => openItem(t.id)} aria-label={`${t.titel} openen`}>
        <span className="rij-inhoud">
          <span className="rij-titel">{t.titel}</span>
          {(t.voor || extra) && (
            <span className="rij-sub">
              {t.voor && <Wie ids={[t.voor]} klein />}
              {extra && <span className="plek">{extra}</span>}
            </span>
          )}
        </span>
        <IcPijl className="rij-pijl" />
      </button>
    </li>
  );
}

export function BoodschapRij({ b }: { b: Boodschap }) {
  const { wissel, openItem } = useApp();
  return (
    <li className={'rij boodschap' + (b.afgevinkt ? ' klaar' : '')}>
      <button type="button" className="vink-knop" role="checkbox" aria-checked={b.afgevinkt} aria-label={b.naam}
        onClick={() => wissel(b.id)}>
        <Vinkje aan={b.afgevinkt} />
      </button>
      <button type="button" className="rij-open" onClick={() => openItem(b.id)} aria-label={`${b.naam} aanpassen`}>
        <span className="rij-inhoud"><span className="rij-titel">{b.naam}</span></span>
        <IcPijl className="rij-pijl" />
      </button>
    </li>
  );
}
