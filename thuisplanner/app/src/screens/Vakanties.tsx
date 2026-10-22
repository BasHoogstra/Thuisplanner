// F8 Vakanties (V1.3, vormgeving ronde 2): het overzicht en één vakantie met Regelen, Inpakken en Notities
// (docs/thuisplanner-vakanties.md §4 en §16). Rustig en verzorgd: kaarten met een duidelijke hiërarchie, voortgang waar
// het helpt, grote tikvlakken; alleen de bestaande ontwerptokens. Gedrag, koppelingen en ongedaan maken ongewijzigd.
import { useEffect, useRef, useState, type ReactNode, type TouchEvent } from 'react';
import { useApp } from '../lib/context';
import { dagLabel, verschilInDagen } from '../lib/datum';
import { splitsBoodschappen } from '../lib/boodschappen';
import { nieuwId } from '../lib/store';
import { isBoodschap, isTaak } from '../lib/vandaag';
import type { Boodschap, LidId, Pakitem, Taak, Vakantie, VakantieKoppeling } from '../lib/types';
import {
  aftelling, fase, groepNaam, groepen, isVoorbij, leesVoorkeur, overneemBronnen, pakGroepen, periode, zetVoorkeur,
} from '../lib/vakantie';
import { NuKopenKnop, TaakRij, Vinkje } from '../components/Rijen';
import { SyncLabel } from '../components/Lokaal';
import { IcKoffer, IcLinks, IcPijl, IcPlus, IcPunten } from '../components/Iconen';
import {
  OpnieuwVenster, OvernemenVenster, PakitemVenster, VakantieBoodschapVenster, VakantieVenster,
} from '../components/VakantieVensters';

export function Vakanties() {
  const { vakantie, staat } = useApp();
  const v = vakantie ? staat.vakanties.find(x => x.id === vakantie) : undefined;
  if (v) return <VakantiePagina key={v.id} v={v} />;
  return <VakantieLijst nietGevonden={!!vakantie} />;
}

/** Een rustige voortgangsbalk (alleen tokens; de breedte is het enige vaste gegeven). */
function Voortgang({ klaar, totaal, label, klein }: { klaar: number; totaal: number; label: string; klein?: boolean }) {
  const pct = totaal ? Math.round((klaar / totaal) * 100) : 0;
  return (
    <span className={'voortgang' + (klein ? ' klein' : '') + (totaal && klaar === totaal ? ' vol' : '')} role="progressbar"
      aria-label={label} aria-valuemin={0} aria-valuemax={totaal} aria-valuenow={klaar}>
      <span className="voortgang-balk" style={{ width: `${pct}%` }} />
    </span>
  );
}

/** Een klein, rustig beeld per vakantie: een landschap van zon en heuvels in de tokens. Geen externe afbeelding. */
function VakantieBeeld({ groot }: { groot?: boolean }) {
  return <span className={'vak-beeld' + (groot ? ' groot' : '')} aria-hidden="true"><span className="vak-beeld-zon" /><span className="vak-beeld-heuvel" /></span>;
}

/** De aftelling als groot getal ("9 dagen") of als korte tekst ("morgen", "dag 3 van 15"). */
function Teller({ v }: { v: Vakantie }) {
  const { vandaag } = useApp();
  const f = fase(v, vandaag);
  if (!v.vertrek) return <span className="vak-teller-tekst stil">geen datum</span>;
  const n = verschilInDagen(vandaag, v.vertrek);
  if (f === 'komend' && n > 1) return <span className="vak-teller" aria-hidden="true"><strong>{n}</strong><small>dagen</small></span>;
  const a = aftelling(v, vandaag)!;
  return <span className={'vak-teller-tekst' + (f === 'nu' ? ' nu' : '')}>{a.charAt(0).toLowerCase() + a.slice(1)}</span>;
}

// ---------------------------------------------------------------- Overzicht

function VakantieLijst({ nietGevonden }: { nietGevonden: boolean }) {
  const { staat, vandaag, gaNaar, openVakantie } = useApp();
  const [nieuw, zetNieuw] = useState(false);
  const [toonEerder, zetToonEerder] = useState(false);
  const { nu, komend, eerder } = groepen(staat.vakanties, vandaag);
  const naam = (v: Vakantie) => {
    const a = aftelling(v, vandaag);
    return `${v.naam}, ${periode(v, vandaag)}${a ? `, ${a.toLowerCase()}` : ''}. Openen`;
  };
  const kaart = (v: Vakantie, isNu = false) => (
    <li key={v.id}>
      <button type="button" className={'vak-kaart' + (isNu ? ' nu' : '')} onClick={() => openVakantie(v.id)} aria-label={naam(v)}>
        <VakantieBeeld />
        <span className="vak-kaart-tekst">
          {isNu && <span className="vak-kaart-label">Nu op vakantie</span>}
          <span className="vak-kaart-naam">{v.naam}</span>
          {v.bestemming && <span className="vak-kaart-bestemming">{v.bestemming}</span>}
          <span className="vak-kaart-periode">{periode(v, vandaag)}<SyncLabel sync={v.sync} /></span>
        </span>
        <Teller v={v} />
      </button>
    </li>
  );
  return (
    <div className="scherm vakanties">
      <header className="kop">
        <button type="button" className="terug-link" onClick={() => gaNaar('meer')}><IcLinks width={18} height={18} /> Meer</button>
        <div className="kop-regel">
          <h1>Vakanties</h1>
          <button type="button" className="icoonknop vak-plus" aria-label="Nieuwe vakantie" onClick={() => zetNieuw(true)}><IcPlus /></button>
        </div>
      </header>
      {nietGevonden && <p className="stil-tekst vak-weg" role="status">Die vakantie bestaat niet (meer).</p>}

      {!staat.vakanties.length ? (
        <section className="rust" aria-label="Nog geen vakanties">
          <VakantieBeeld groot />
          <p className="rust-titel">Nog geen vakanties.</p>
          <p className="rust-tekst">Plan je eerste vakantie: de paklijst kun je daarna steeds hergebruiken.</p>
          <button type="button" className="knop vak-eerste" onClick={() => zetNieuw(true)}>Vakantie toevoegen</button>
        </section>
      ) : (
        <>
          {nu.length > 0 && (
            <section aria-labelledby="h-vak-nu">
              <h2 id="h-vak-nu" className="sectie-kop">Nu</h2>
              <ul className="vak-kaarten">{nu.map(v => kaart(v, true))}</ul>
            </section>
          )}
          {komend.length > 0 && (
            <section aria-labelledby="h-vak-komend">
              <h2 id="h-vak-komend" className="sectie-kop">Komend</h2>
              <ul className="vak-kaarten">{komend.map(v => kaart(v))}</ul>
            </section>
          )}
          {eerder.length > 0 && (
            <section aria-labelledby="h-vak-eerder" className="vak-eerder">
              <h2 id="h-vak-eerder" className="sectie-kop">
                <button type="button" className="link uitklap" aria-expanded={toonEerder} onClick={() => zetToonEerder(x => !x)}>
                  Eerder <span className="teller">{eerder.length}</span> <IcPijl className={'uitklap-pijl' + (toonEerder ? ' open' : '')} width={16} height={16} />
                </button>
              </h2>
              {toonEerder && (
                <ul className="lijst vak-eerder-lijst">
                  {eerder.map(v => (
                    <li key={v.id} className="rij">
                      <button type="button" className="rij-knop" onClick={() => openVakantie(v.id)} aria-label={naam(v)}>
                        <span className="rij-inhoud">
                          <span className="rij-titel">{v.naam}</span>
                          <span className="rij-sub"><span>{periode(v, vandaag)}</span>{v.bestemming && <span className="plek">{v.bestemming}</span>}</span>
                        </span>
                        <IcPijl className="rij-pijl" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </>
      )}
      {nieuw && <VakantieVenster sluit={() => zetNieuw(false)} />}
    </div>
  );
}

// ---------------------------------------------------------------- Eén vakantie

type Onderdeel = 'regelen' | 'inpakken' | 'notities';
const ONDERDELEN: { id: Onderdeel; label: string }[] = [
  { id: 'regelen', label: 'Regelen' }, { id: 'inpakken', label: 'Inpakken' }, { id: 'notities', label: 'Notities' },
];

function VakantiePagina({ v }: { v: Vakantie }) {
  const app = useApp();
  const { vandaag, openVakantie, vakantieOpenen, vakantieSluiten } = app;
  const [onderdeel, zetOnderdeel] = useState<Onderdeel>(() => {
    const o = leesVoorkeur('onderdeel');
    return o === 'inpakken' || o === 'notities' ? o : 'regelen';
  });
  const [aanpassen, zetAanpassen] = useState(false);
  const kies = (o: Onderdeel) => { zetOnderdeel(o); zetVoorkeur('onderdeel', o); };
  const voorbij = isVoorbij(v, vandaag);
  // Een afgelopen vakantie: de paklijst gaat pas mee zolang je hem bekijkt (lokale modus; §14.3).
  useEffect(() => {
    if (!voorbij) return;
    vakantieOpenen(v.id);
    return () => vakantieSluiten(v.id);
  }, [voorbij, v.id, vakantieOpenen, vakantieSluiten]);
  const a = aftelling(v, vandaag);
  return (
    <div className="scherm vakantie">
      <div className="vak-navigatie">
        <button type="button" className="terug-link" onClick={() => openVakantie(null)}><IcLinks width={18} height={18} /> Vakanties</button>
        <button type="button" className="icoonknop" aria-label={`${v.naam} aanpassen`} onClick={() => zetAanpassen(true)}><IcPunten /></button>
      </div>
      <header className="vak-held">
        <VakantieBeeld groot />
        <div className="vak-held-tekst">
          <h1>{v.naam}</h1>
          {v.bestemming && <p className="vak-held-bestemming">{v.bestemming}</p>}
          <p className="vak-held-sub"><span>{periode(v, vandaag)}</span><SyncLabel sync={v.sync} /></p>
          {a && <p className={'vak-aftelling' + (voorbij ? ' voorbij' : '') + (fase(v, vandaag) === 'nu' ? ' nu' : '')}>{a}</p>}
        </div>
      </header>

      <div className="vak-tabs" role="tablist" aria-label="Onderdelen">
        {ONDERDELEN.map(o => (
          <button key={o.id} type="button" role="tab" id={`tab-${o.id}`} aria-selected={onderdeel === o.id} aria-controls={`paneel-${o.id}`}
            className={'vak-tab' + (onderdeel === o.id ? ' aan' : '')} onClick={() => kies(o.id)}>{o.label}</button>
        ))}
      </div>
      <div role="tabpanel" id={`paneel-${onderdeel}`} aria-labelledby={`tab-${onderdeel}`} className="vak-paneel">
        {onderdeel === 'regelen' && <Regelen v={v} />}
        {onderdeel === 'inpakken' && <Inpakken v={v} />}
        {onderdeel === 'notities' && <Notities v={v} />}
      </div>
      {aanpassen && <VakantieVenster bestaand={v} sluit={() => zetAanpassen(false)} />}
    </div>
  );
}

// ---------------------------------------------------------------- Regelen: voorbereidingen (taken) en boodschappen

/** De kop van een inklapbaar blok: titel en voortgang blijven altijd zichtbaar; de hele kop is de knop. */
function BlokKop({ id, titel, tel, open, wissel }: { id: string; titel: string; tel?: string; open: boolean; wissel: () => void }) {
  return (
    <div className="vak-blok-kop">
      <h2 id={id}>
        <button type="button" className="vak-blok-knop" aria-expanded={open} aria-controls={`${id}-inhoud`} onClick={wissel}>
          <span className="vak-blok-tekst"><span className="vak-blok-titel">{titel}</span>{tel && <span className="vak-blok-tel">{tel}</span>}</span>
          <IcPijl className={'uitklap-pijl' + (open ? ' open' : '')} width={18} height={18} />
        </button>
      </h2>
    </div>
  );
}

/** Afgeronde items compact onder één regel ("3 afgerond · tonen"); terugzetten kan in de uitgeklapte lijst. */
function Afgerond({ aantal, woord, lijstNaam, children }: { aantal: number; woord: string; lijstNaam: string; children: ReactNode }) {
  const [toon, zetToon] = useState(false);
  if (!aantal) return null;
  return (
    <div className="afgerond vak-afgerond">
      <button type="button" className="link afgerond-knop" aria-expanded={toon} onClick={() => zetToon(x => !x)}>
        {aantal} {woord} {toon ? '· verbergen' : '· tonen'}
      </button>
      {toon && <ul className="lijst vak-lijst" aria-label={lijstNaam}>{children}</ul>}
    </div>
  );
}

type RegelBlok = 'voorbereiding' | 'boodschappen';

function Regelen({ v }: { v: Vakantie }) {
  const app = useApp();
  const { staat, vandaag } = app;
  const [taak, zetTaak] = useState('');
  const [kopen, zetKopen] = useState('');
  const [boodschap, zetBoodschap] = useState<{ b: Boodschap; k?: VakantieKoppeling } | null>(null);
  // Eén blok tegelijk open; standaard Voorbereidingen. De laatste keuze blijft bewaard (ook na wegnavigeren).
  const [openBlok, zetOpenBlok] = useState<RegelBlok | null>(() => {
    const o = leesVoorkeur('regelen');
    return o === 'boodschappen' ? 'boodschappen' : o === 'geen' ? null : 'voorbereiding';
  });
  const wisselBlok = (b: RegelBlok) => {
    const n = openBlok === b ? null : b;
    zetOpenBlok(n); zetVoorkeur('regelen', n ?? 'geen');
  };
  // Voorbereidingen: open eerst (met datum op datum), daarna wat klaar is.
  const taken = staat.items.filter(isTaak).filter(t => t.vakantieId === v.id);
  const open = taken.filter(t => !t.klaar).sort((x, y) => (x.datum ?? '9999') < (y.datum ?? '9999') ? -1 : (x.datum ?? '9999') > (y.datum ?? '9999') ? 1 : 0);
  const klaar = taken.filter(t => t.klaar);
  const voorbij = isVoorbij(v, vandaag);

  // Boodschappen: dezelfde items als op de gewone lijst (koppelingen, geen kopie). Actuele koppelingen met de stand van
  // de boodschap; afgehandelde als "gekocht" (als er voor die boodschap geen actuele is).
  const boodschappen = staat.items.filter(isBoodschap);
  const eigen = staat.koppelingen.filter(k => k.vakantieId === v.id);
  const actueel = eigen.filter(k => !k.afgehandeld);
  const rijen = [
    ...actueel.map(k => ({ k, b: boodschappen.find(b => b.id === k.boodschapId), gekocht: false })),
    ...eigen.filter(k => k.afgehandeld && !actueel.some(x => x.boodschapId === k.boodschapId))
      .filter((k, i, l) => l.findIndex(x => x.boodschapId === k.boodschapId) === i)
      .map(k => ({ k, b: boodschappen.find(b => b.id === k.boodschapId), gekocht: true })),
  ].filter((r): r is { k: VakantieKoppeling; b: Boodschap; gekocht: boolean } => !!r.b)
    .sort((x, y) => Number(x.b.afgevinkt || x.gekocht) - Number(y.b.afgevinkt || y.gekocht));
  const gekocht = rijen.filter(r => r.b.afgevinkt || r.gekocht).length;

  function voegTaakToe(e: { preventDefault(): void }) {
    e.preventDefault();
    const titel = taak.trim().replace(/\s+/g, ' ');
    if (!titel) return;
    const t: Taak = { id: nieuwId('t'), soort: 'taak', titel, datum: null, voor: null, klaar: false, klaarOp: null, vakantieId: v.id };
    app.toevoegen([t], `${titel} staat bij de voorbereidingen`);
    zetTaak('');
  }
  function voegKopenToe(e: { preventDefault(): void }) {
    e.preventDefault();
    const namen = splitsBoodschappen(kopen);
    if (!namen.length) return;
    app.voegBoodschappenToe(namen, v.id);
    zetKopen('');
  }

  const taakRij = (t: Taak) => <TaakRij key={t.id} t={t} extra={!t.klaar && t.datum ? dagLabel(t.datum, vandaag) : undefined} zonderVakantie />;
  // Eén boodschap: hetzelfde item als op de gewone lijst; afvinken is gewoon wissel (geldt dus overal).
  const boodschapRij = ({ k, b, gekocht: afgehandeld }: { k: VakantieKoppeling; b: Boodschap; gekocht: boolean }) => {
    const aan = b.afgevinkt || afgehandeld;
    // Alle gekoppelde boodschappen staan hier, of ze nu bij "Nu te kopen" of "Later nodig" staan; de status als klein label.
    const later = !aan && !!b.later;
    return (
      <li key={k.id} className={'rij boodschap' + (aan ? ' klaar' : '')}>
        <button type="button" className="vink-knop" role="checkbox" aria-checked={aan} aria-label={b.naam}
          disabled={afgehandeld || !!b.sync} onClick={() => app.wissel(b.id)}>
          <Vinkje aan={aan} />
        </button>
        <button type="button" className="rij-open" onClick={() => zetBoodschap({ b, k: afgehandeld ? undefined : k })} aria-label={`${b.naam}${afgehandeld ? ', gekocht' : ''}. Meer`}>
          <span className="rij-inhoud">
            <span className="rij-titel">{b.naam}</span>
            <span className="rij-sub">
              {afgehandeld ? <span className="plek">gekocht</span> : !aan && <span className={'plek vak-status' + (later ? '' : ' nu')}>{later ? 'later nodig' : 'nu te kopen'}</span>}
              <SyncLabel sync={b.sync} />
            </span>
          </span>
          {!later && <IcPijl className="rij-pijl" />}
        </button>
        {later && <NuKopenKnop b={b} />}
      </li>
    );
  };
  const nogKopen = rijen.filter(r => !(r.b.afgevinkt || r.gekocht));
  const alGekocht = rijen.filter(r => r.b.afgevinkt || r.gekocht);
  const taakOpen = openBlok === 'voorbereiding';
  const kopenOpen = openBlok === 'boodschappen';

  return (
    <>
      <section className={'vak-blok' + (taakOpen ? '' : ' dicht')} aria-labelledby="h-vak-voorbereiding">
        <BlokKop id="h-vak-voorbereiding" titel="Voorbereidingen" open={taakOpen} wissel={() => wisselBlok('voorbereiding')}
          tel={taken.length ? `${klaar.length} van ${taken.length} klaar` : undefined} />
        {taken.length > 0 && <Voortgang klaar={klaar.length} totaal={taken.length} label="Voorbereidingen klaar" />}
        {taakOpen && (
          <div id="h-vak-voorbereiding-inhoud">
            <form className="snel vak-snel" onSubmit={voegTaakToe}>
              <label className="sr-only" htmlFor="vak-taak">Voorbereiding toevoegen</label>
              <input id="vak-taak" value={taak} onChange={e => zetTaak(e.target.value)} placeholder="Voorbereiding toevoegen…" autoComplete="off" maxLength={200} />
              <button className="knop" type="submit" onClick={voegTaakToe} aria-label="Voorbereiding toevoegen"><IcPlus width={20} height={20} /></button>
            </form>
            {!taken.length && <p className="stil-tekst vak-leeg">Wat moet er vóór vertrek gebeuren? Het verschijnt ook in de Agenda.</p>}
            {open.length > 0 && <ul className="lijst vak-lijst" aria-label="Open voorbereidingen">{open.map(taakRij)}</ul>}
            {taken.length > 0 && !open.length && <p className="stil-tekst vak-leeg">Alle voorbereidingen zijn klaar.</p>}
            <Afgerond aantal={klaar.length} woord="afgerond" lijstNaam="Afgeronde voorbereidingen">{klaar.map(taakRij)}</Afgerond>
          </div>
        )}
      </section>

      <section className={'vak-blok' + (kopenOpen ? '' : ' dicht')} aria-labelledby="h-vak-kopen">
        <BlokKop id="h-vak-kopen" titel={`Boodschappen voor ${v.naam}`} open={kopenOpen} wissel={() => wisselBlok('boodschappen')}
          tel={rijen.length && !voorbij ? `${gekocht} van ${rijen.length} gekocht` : undefined} />
        {!voorbij && rijen.length > 0 && <Voortgang klaar={gekocht} totaal={rijen.length} label="Boodschappen gekocht" />}
        {kopenOpen && (
          <div id="h-vak-kopen-inhoud">
            {voorbij ? (
              <p className="stil-tekst vak-leeg">Deze vakantie is voorbij.</p>
            ) : (
              <>
                <form className="snel vak-snel" onSubmit={voegKopenToe}>
                  <label className="sr-only" htmlFor="vak-kopen">Boodschap voor deze vakantie</label>
                  <input id="vak-kopen" value={kopen} onChange={e => zetKopen(e.target.value)} placeholder="Boodschap toevoegen…" autoComplete="off" maxLength={200} />
                  <button className="knop" type="submit" onClick={voegKopenToe} aria-label="Boodschap toevoegen"><IcPlus width={20} height={20} /></button>
                </form>
                {!rijen.length && <p className="stil-tekst vak-leeg">Wat je hier toevoegt, staat ook op de gewone boodschappenlijst, met het label {v.naam}.</p>}
                {nogKopen.length > 0 && <ul className="lijst vak-lijst" aria-label={`Nog te kopen voor ${v.naam}`}>{nogKopen.map(boodschapRij)}</ul>}
                {rijen.length > 0 && !nogKopen.length && <p className="stil-tekst vak-leeg">Alles is gekocht.</p>}
                <Afgerond aantal={alGekocht.length} woord="gekocht" lijstNaam={`Gekocht voor ${v.naam}`}>{alGekocht.map(boodschapRij)}</Afgerond>
                {rijen.length > 0 && <p className="vak-noot">Dezelfde boodschappen als op de gewone lijst: afvinken in de winkel geldt ook hier.</p>}
              </>
            )}
          </div>
        )}
      </section>
      {boodschap && <VakantieBoodschapVenster b={boodschap.b} k={boodschap.k} vakantie={v} sluit={() => zetBoodschap(null)} />}
    </>
  );
}

// ---------------------------------------------------------------- Inpakken

function Inpakken({ v }: { v: Vakantie }) {
  const app = useApp();
  const { staat, huishouden, vandaag } = app;
  const lijstGroepen = pakGroepen(huishouden);
  const [groep, zetGroep] = useState<LidId | null>(() => {
    const g = leesVoorkeur(`persoon:${v.id}`);
    if (g === 'gezamenlijk') return null;
    return g && huishouden.leden.some(l => l.id === g) ? g : huishouden.leden.some(l => l.id === huishouden.ik) ? huishouden.ik : null;
  });
  const kiesGroep = (g: LidId | null) => { zetGroep(g); zetVoorkeur(`persoon:${v.id}`, g ?? 'gezamenlijk'); };
  const [tekst, zetTekst] = useState('');
  const [open, zetOpen] = useState<Pakitem | null>(null);
  const [venster, zetVenster] = useState<'overnemen' | 'opnieuw' | null>(null);
  const invoer = useRef<HTMLInputElement>(null);

  const alle = staat.pakitems.filter(p => p.vakantieId === v.id);
  const van = (g: LidId | null) => alle.filter(p => (p.lid ?? null) === g);
  const hier = van(groep);
  const nogTe = hier.filter(p => !p.ingepakt);
  const ingepakt = hier.filter(p => p.ingepakt);
  const naam = groepNaam(huishouden, groep);
  // Een rustige suggestie bij een lege paklijst: de laatste vakantie waar je geweest bent.
  const bron = !alle.length ? overneemBronnen(staat.vakanties, v.id, vandaag, id => staat.pakitems.some(p => p.vakantieId === id))[0] : undefined;

  function voegToe(e: { preventDefault(): void }) {
    e.preventDefault();
    const t = tekst.trim().replace(/\s+/g, ' ');
    if (!t) { invoer.current?.focus(); return; }
    app.pakitemToevoegen(v.id, groep, t);
    zetTekst('');
    invoer.current?.focus();   // snel achter elkaar invoeren (D6)
  }

  return (
    <>
      <div className="pak-personen" role="radiogroup" aria-label="Paklijst van">
        {lijstGroepen.map(g => {
          const lijst = van(g.id);
          const klaar = lijst.filter(p => p.ingepakt).length;
          const aan = groep === g.id;
          return (
            <button key={g.id ?? 'gezamenlijk'} type="button" role="radio" aria-checked={aan} className={'pak-persoon' + (aan ? ' aan' : '')}
              onClick={() => kiesGroep(g.id)} aria-label={`${g.naam}, ${klaar} van ${lijst.length} ingepakt`}>
              {g.kleur ? <span className="stip" style={{ background: g.kleur }} aria-hidden="true" /> : <IcKoffer width={14} height={14} />}
              <span className="pak-persoon-naam">{g.naam}</span>
              <span className="pak-persoon-tel" aria-hidden="true">{klaar}/{lijst.length}</span>
            </button>
          );
        })}
      </div>

      <section className="vak-blok pak-blok" aria-label={`Paklijst van ${naam}`}>
        <div className="vak-blok-kop">
          <h2 className="pak-kop" aria-label={`${naam} · ${ingepakt.length} van ${hier.length} ingepakt`}>
            <span className="pak-kop-naam">{naam}</span><span className="pak-kop-tel">{ingepakt.length} van {hier.length} ingepakt</span>
          </h2>
        </div>
        <Voortgang klaar={ingepakt.length} totaal={hier.length} label={`Ingepakt voor ${naam}`} />

        {bron && (
          <div className="pak-voorstel">
            <p>Begin met de paklijst van {bron.naam}?</p>
            <button type="button" className="knop klein" onClick={() => app.paklijstOvernemen(bron.id, v.id, 'iedereen')}>Overnemen</button>
          </div>
        )}

        <form className="snel vak-snel" onSubmit={voegToe}>
          <label className="sr-only" htmlFor="pak-nieuw">Toevoegen voor {naam}</label>
          <input id="pak-nieuw" ref={invoer} value={tekst} onChange={e => zetTekst(e.target.value)} placeholder={`Toevoegen voor ${naam}…`}
            autoComplete="off" maxLength={100} enterKeyHint="done" />
          <button className="knop" type="submit" onClick={voegToe} aria-label={`Toevoegen voor ${naam}`}><IcPlus width={20} height={20} /></button>
        </form>

        {nogTe.length > 0
          ? <ul className="lijst vak-lijst" aria-label={`Nog in te pakken voor ${naam}`}>{nogTe.map(p => <PakRij key={p.id} p={p} openen={() => zetOpen(p)} />)}</ul>
          : <p className="stil-tekst vak-leeg">{hier.length ? `Alles van ${naam} is ingepakt.` : `Nog niets voor ${naam}.`}</p>}

        <Afgerond key={groep ?? 'gezamenlijk'} aantal={ingepakt.length} woord="ingepakt" lijstNaam={`Ingepakt voor ${naam}`}>
          {ingepakt.map(p => <PakRij key={p.id} p={p} openen={() => zetOpen(p)} />)}
        </Afgerond>
      </section>

      <div className="pak-meer">
        <button type="button" className="tekstknop" onClick={() => zetVenster('overnemen')}>Overnemen van een eerdere vakantie</button>
        <button type="button" className="tekstknop" onClick={() => zetVenster('opnieuw')}>Afvinken opnieuw beginnen</button>
      </div>

      {open && <PakitemVenster p={open} sluit={() => zetOpen(null)} />}
      {venster === 'overnemen' && <OvernemenVenster naar={v} sluit={() => zetVenster(null)} />}
      {venster === 'opnieuw' && <OpnieuwVenster vakantie={v} groep={groep} sluit={() => zetVenster(null)} />}
    </>
  );
}

/** Eén pakitem: tik op het rondje = afvinken; tik op de tekst = aanpassen; naar links vegen = verwijderen. */
function PakRij({ p, openen }: { p: Pakitem; openen: () => void }) {
  const app = useApp();
  const [dx, zetDx] = useState(0);
  // De afstand staat ook in de ref: bij loslaten telt de echte afstand, ook als het scherm nog niet bijgewerkt is.
  const begin = useRef<{ x: number; y: number; vegen: boolean; dx: number } | null>(null);
  const opStart = (e: TouchEvent) => { const t = e.touches[0]; begin.current = { x: t.clientX, y: t.clientY, vegen: false, dx: 0 }; };
  const opBeweeg = (e: TouchEvent) => {
    const b = begin.current; if (!b) return;
    const t = e.touches[0]; const x = t.clientX - b.x, y = t.clientY - b.y;
    if (!b.vegen && Math.abs(x) > 12 && Math.abs(x) > Math.abs(y) * 1.5) b.vegen = true;
    if (b.vegen) { b.dx = Math.min(0, x); zetDx(b.dx); }
  };
  const opEinde = () => {
    const weg = !!begin.current?.vegen && begin.current.dx < -90;
    begin.current = null; zetDx(0);
    if (weg) app.pakitemVerwijderen(p);
  };
  return (
    <li className={'rij pakitem' + (p.ingepakt ? ' klaar' : '')} style={dx ? { transform: `translateX(${dx}px)` } : undefined}
      onTouchStart={opStart} onTouchMove={opBeweeg} onTouchEnd={opEinde} onTouchCancel={() => { begin.current = null; zetDx(0); }}>
      <button type="button" className="vink-knop" role="checkbox" aria-checked={p.ingepakt} aria-label={p.naam} disabled={!!p.sync}
        onClick={() => app.pakitemWissel(p)}>
        <Vinkje aan={p.ingepakt} />
      </button>
      <button type="button" className="rij-open" onClick={openen} aria-label={`${p.naam} aanpassen`}>
        <span className="rij-inhoud">
          <span className="rij-titel">{p.naam}</span>
          {p.sync && <span className="rij-sub"><SyncLabel sync={p.sync} /></span>}
        </span>
      </button>
    </li>
  );
}

// ---------------------------------------------------------------- Notities

function Notities({ v }: { v: Vakantie }) {
  const app = useApp();
  const [tekst, zetTekst] = useState(v.notities ?? '');
  const laatst = useRef(v.notities ?? '');
  const [bewaard, zetBewaard] = useState(true);
  const bewaar = () => {
    const t = tekst.trim() ? tekst : '';
    if (t === laatst.current) { zetBewaard(true); return; }
    laatst.current = t;
    app.vakantieBijwerken({ ...v, notities: t || undefined });
    zetBewaard(true);
  };
  // Na even niets typen vanzelf bewaren; bij weggaan ook.
  useEffect(() => {
    const t = window.setTimeout(bewaar, 1200);
    return () => window.clearTimeout(t);
  });
  return (
    <section className="vak-blok vak-notitieblok" aria-labelledby="h-vak-notities">
      <div className="vak-blok-kop">
        <h2 id="h-vak-notities">Notities</h2>
        <span className="vak-blok-tel" aria-live="polite">{bewaard ? 'Bewaard' : 'Wordt bewaard…'}</span>
      </div>
      <label className="sr-only" htmlFor="vak-notities">Notities voor {v.naam}</label>
      <textarea id="vak-notities" className="vak-notities" value={tekst} maxLength={4000} rows={10}
        placeholder="Adres, inchecktijd, reserveringsnummer, telefoonnummer van de camping…"
        onChange={e => { zetTekst(e.target.value); zetBewaard(false); }} onBlur={bewaar} />
      <p className="vak-noot">Iedereen in het huishouden ziet deze notities. Ze worden vanzelf bewaard.</p>
    </section>
  );
}

/** Voor Meer: één rij naar Vakanties, met de eerstvolgende of lopende vakantie. */
export function VakantiesRij() {
  const { staat, vandaag, openVakantie } = useApp();
  const { nu, komend } = groepen(staat.vakanties, vandaag);
  const eerst = nu[0] ?? komend.find(v => v.vertrek);
  const a = eerst ? aftelling(eerst, vandaag) : null;
  const sub = eerst && a ? `${eerst.naam} · ${a.toLowerCase()}` : 'Paklijsten en voorbereidingen';
  return (
    <section aria-label="Vakanties" className="blok meer-vakanties">
      <ul className="lijst">
        <li className="rij">
          <button type="button" className="rij-knop" onClick={() => openVakantie(null)} aria-label={`Vakanties: ${sub}`}>
            <span className="lid-avatar vak-icoon" aria-hidden="true"><IcKoffer width={20} height={20} /></span>
            <span className="rij-inhoud">
              <span className="rij-titel">Vakanties</span>
              <span className="rij-sub"><span className="plek">{sub}</span></span>
            </span>
            <IcPijl className="rij-pijl" />
          </button>
        </li>
      </ul>
    </section>
  );
}
