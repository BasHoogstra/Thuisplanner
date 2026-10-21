import { useApp } from '../lib/context';
import { isBezetVanAnder } from '../lib/rechten';
import type { Afspraak, Boodschap, LidId, Taak, Vakantie } from '../lib/types';
import { IcHerhaal, IcKoffer, IcPijl, IcSlot, IcVink } from './Iconen';
import { SyncLabel } from './Lokaal';

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
export function AfspraakRij({ a, voorbij }: { a: Afspraak; voorbij?: boolean }) {
  const { lid, huishouden, openItem } = useApp();
  const bezet = isBezetVanAnder(a, huishouden.ik);
  const kleur = a.wie.length === 1 ? lid(a.wie[0])?.kleur : undefined;
  const naam = (bezet ? `Bezet, ${tijdTekst(a)}` : `${a.titel ?? 'Afspraak'}, ${tijdTekst(a)}`) + (a.herhaling ? ', herhaalt' : '');
  return (
    <li className={'rij afspraak' + (voorbij ? ' voorbij' : '')}>
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
            {a.plek && !bezet && <span className="plek">{a.plek}</span>}
            {bezet && <span className="plek">privé-afspraak</span>}
            {!bezet && a.zichtbaarheid === 'prive' && <span className="plek prive"><IcSlot /> alleen voor jou</span>}
            {a.herhaling && <span className="plek herhaalt" title="Herhalende afspraak"><IcHerhaal /></span>}
            <SyncLabel sync={a.sync} />
          </span>
        </span>
      </button>
    </li>
  );
}

/** F8: een klein label met de vakantie waar een taak of boodschap bij hoort. */
export function VakantieLabel({ vakanties }: { vakanties: Vakantie[] }) {
  if (!vakanties.length) return null;
  return <span className="plek vakantie-label"><IcKoffer width={14} height={14} /> {vakanties.map(v => v.naam).join(' · ')}</span>;
}
/** De vakantie van een taak (als die bestaat). */
function useTaakVakantie(t: Taak): Vakantie[] {
  const { staat } = useApp();
  const v = t.vakantieId ? staat.vakanties.find(x => x.id === t.vakantieId) : undefined;
  return v ? [v] : [];
}

export function Vinkje({ aan }: { aan: boolean }) {
  return <span className={'vinkje' + (aan ? ' aan' : '')} aria-hidden="true">{aan && <IcVink />}</span>;
}

/**
 * Eén compacte persoonsmarkering voor de week (W2, D5/D6): één lid met naam, of het eerste lid met "+n". Geen markering
 * als het voor het hele huishouden is; de volledige lijst staat in het detailvenster.
 */
function WeekWie({ ids }: { ids: LidId[] }) {
  const { lid } = useApp();
  const eerste = ids.length ? lid(ids[0]) : undefined;
  if (!eerste) return null;
  return (
    <span className="week-wie">
      <span className="stip" style={{ background: eerste.kleur }} aria-hidden="true" />
      {eerste.naam}{ids.length > 1 && ` +${ids.length - 1}`}
    </span>
  );
}

/**
 * Een afspraak in de week (W2): alleen de begintijd, de titel (hoogstens twee regels) en één persoonsmarkering. Plek,
 * eindtijd en herhaling staan in het detailvenster; "Bezet", privé en "niet bevestigd" blijven zichtbaar. De naam voor
 * schermlezers is dezelfde als in AfspraakRij.
 */
export function WeekAfspraakRij({ a, voorbij }: { a: Afspraak; voorbij?: boolean }) {
  const { huishouden, openItem } = useApp();
  const bezet = isBezetVanAnder(a, huishouden.ik);
  const naam = (bezet ? `Bezet, ${tijdTekst(a)}` : `${a.titel ?? 'Afspraak'}, ${tijdTekst(a)}`) + (a.herhaling ? ', herhaalt' : '');
  return (
    <li className={'week-rij' + (voorbij ? ' voorbij' : '')}>
      <button type="button" className="week-rij-knop" onClick={() => openItem(a.id)} aria-label={`${naam}. Openen`}>
        <span className="week-tijd">{a.start ?? 'Hele dag'}</span>
        <span className="week-inhoud">
          <span className={'week-rij-titel' + (bezet ? ' bezet' : '')}>
            {(bezet || a.zichtbaarheid === 'prive') && <IcSlot />}{bezet ? 'Bezet' : a.titel}
          </span>
          {(a.wie.length > 0 || a.sync) && <span className="week-sub"><WeekWie ids={a.wie} /><SyncLabel sync={a.sync} /></span>}
        </span>
      </button>
    </li>
  );
}

/** Een taak in de week (W2): afvinken, de titel (hoogstens twee regels) en één persoonsmarkering. */
export function WeekTaakRij({ t }: { t: Taak }) {
  const { wissel, openItem } = useApp();
  const vak = useTaakVakantie(t);
  return (
    <li className={'week-rij taak' + (t.klaar ? ' klaar' : '')}>
      <button type="button" className="vink-knop" role="checkbox" aria-checked={t.klaar} disabled={!!t.sync}
        aria-label={t.titel} onClick={() => wissel(t.id, t.klaar ? `${t.titel} weer open` : `${t.titel} afgerond`)}>
        <Vinkje aan={t.klaar} />
      </button>
      <button type="button" className="week-rij-knop" onClick={() => openItem(t.id)} aria-label={`${t.titel} openen`}>
        <span className="week-inhoud">
          <span className="week-rij-titel">{t.titel}</span>
          {(t.voor || t.sync || vak.length > 0) && <span className="week-sub">{t.voor && <WeekWie ids={[t.voor]} />}<VakantieLabel vakanties={vak} /><SyncLabel sync={t.sync} /></span>}
        </span>
      </button>
    </li>
  );
}

/** Afvinken en openen zijn twee aparte knoppen, zodat je niet per ongeluk afvinkt als je wilt aanpassen. */
export function TaakRij({ t, extra, zonderVakantie }: { t: Taak; extra?: string; zonderVakantie?: boolean }) {
  const { wissel, openItem } = useApp();
  const taakVak = useTaakVakantie(t);
  const vak = zonderVakantie ? [] : taakVak;
  return (
    <li className={'rij taak' + (t.klaar ? ' klaar' : '')}>
      {/* Afvinken kan pas als de server de taak kent (zie de sync-module); tot dan staat het vinkje stil. */}
      <button type="button" className="vink-knop" role="checkbox" aria-checked={t.klaar} disabled={!!t.sync}
        aria-label={t.titel} onClick={() => wissel(t.id, t.klaar ? `${t.titel} weer open` : `${t.titel} afgerond`)}>
        <Vinkje aan={t.klaar} />
      </button>
      <button type="button" className="rij-open" onClick={() => openItem(t.id)} aria-label={`${t.titel} openen`}>
        <span className="rij-inhoud">
          <span className="rij-titel">{t.titel}</span>
          {(t.voor || extra || t.sync || vak.length > 0) && (
            <span className="rij-sub">
              {t.voor && <Wie ids={[t.voor]} klein />}
              {extra && <span className="plek">{extra}</span>}
              <VakantieLabel vakanties={vak} />
              <SyncLabel sync={t.sync} />
            </span>
          )}
        </span>
        <IcPijl className="rij-pijl" />
      </button>
    </li>
  );
}

/** vakanties: voor welke (niet voorbije) vakanties deze boodschap nu nodig is (F8). */
export function BoodschapRij({ b, vakanties = [] }: { b: Boodschap; vakanties?: Vakantie[] }) {
  const { wissel, openItem } = useApp();
  return (
    <li className={'rij boodschap' + (b.afgevinkt ? ' klaar' : '')}>
      <button type="button" className="vink-knop" role="checkbox" aria-checked={b.afgevinkt} aria-label={b.naam}
        disabled={!!b.sync} onClick={() => wissel(b.id)}>
        <Vinkje aan={b.afgevinkt} />
      </button>
      <button type="button" className="rij-open" onClick={() => openItem(b.id)} aria-label={`${b.naam} aanpassen`}>
        <span className="rij-inhoud">
          <span className="rij-titel">{b.naam}</span>
          {(b.sync || vakanties.length > 0) && <span className="rij-sub"><VakantieLabel vakanties={vakanties} /><SyncLabel sync={b.sync} /></span>}
        </span>
        <IcPijl className="rij-pijl" />
      </button>
    </li>
  );
}
