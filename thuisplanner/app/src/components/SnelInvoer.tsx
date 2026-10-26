// De centrale + (docs/thuisplanner-snelinvoer.md §4 en §10). Een invoerbalk die vlak boven het toetsenbord staat, met de
// verzendknop in de balk: openen en direct typen. Daarboven, pas na het typen, één rustige kaart met wat Thuisplanner
// begrijpt; corrigeren op verzoek. Privé staat bij een afspraak altijd in beeld. "Formulier" opent het bestaande formulier.
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { useApp, type Soort } from '../lib/context';
import { dagLabel } from '../lib/datum';
import { DatumKeuze, TijdKeuze, WieKeuze } from './Keuzepanelen';
import { betekenis } from '../lib/betekenis';
import { FREQUENTIES, herhalingTekst } from '../lib/herhaling';
import { nieuwId } from '../lib/store';
import { isBoodschap, isTaak } from '../lib/vandaag';
import { kiesbareVakanties, periode, vakantiesVoorBoodschap } from '../lib/vakantie';
import type { Afspraak, Datum, Frequentie, LidId, Taak } from '../lib/types';
import { begrijp, type Onderdeel } from '../lib/zin';
import { useZichtbaarScherm } from '../lib/scherm';
import { IcAgenda, IcBoodschappen, IcFormulier, IcPijl, IcSlot, IcVerstuur, IcVink } from './Iconen';
import { useVensterGedrag } from './Venster';

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
  /** F8: de gekozen vakantie (taak of boodschap) en, bij een boodschap, Later nodig of Nu te kopen. */
  vakantieId?: string;
  later?: boolean;
}

/** Wat de gebruiker met een knop koos (wint van de zin). `null` bij datum, tijd of vakantie: bewust leeg. */
interface Keuze { soort?: Soort; datum?: Datum | null; start?: string | null; wie?: LidId[]; prive?: boolean; vakantie?: string | null; later?: boolean }
type Paneel = 'soort' | 'datum' | 'tijd' | 'wie' | 'plek' | 'herhaling' | 'vakantie' | 'lijst' | null;

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
  // Aanpassen: de regels om te corrigeren, pas op verzoek. Afgewezen: een vraag die met Nee is beantwoord.
  const [aanpassen, zetAanpassen] = useState(false);
  const [afgewezen, zetAfgewezen] = useState<Set<string>>(new Set());
  const [toonAlleVakanties, zetToonAlleVakanties] = useState(false);
  const veld = useRef<HTMLTextAreaElement>(null);
  const vel = useRef<HTMLDivElement>(null);
  useVensterGedrag(vel, sluit, terugNaar);
  const zichtbaar = useZichtbaarScherm();
  useEffect(() => { veld.current?.focus(); }, []);
  // Een melding van een vorige toevoeging mag een nieuwe invoer nooit hinderen: weg zodra de + opent.
  const openMelding = useRef(staat.melding?.id);
  useEffect(() => { if (openMelding.current != null) app.meldingWeg(openMelding.current); }, [app]);
  // Het veld groeit mee tot drie regels, zodat je je hele zin ziet.
  useEffect(() => {
    const el = veld.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight + 2}px`;
  }, [tekst]);

  const bekend = useMemo(() => staat.items.filter(isBoodschap).map(b => b.naam), [staat.items]);
  // F8: alleen lopende en komende vakanties zijn te kiezen (en te herkennen).
  const kiesbaar = useMemo(() => kiesbareVakanties(staat.vakanties ?? [], vandaag), [staat.vakanties, vandaag]);
  const vakanties = useMemo(() => kiesbaar.map(x => ({ id: x.id, naam: x.naam })), [kiesbaar]);
  const v = useMemo(() => begrijp(tekst, { vandaag, leden: huishouden.leden, bekendeBoodschappen: bekend, standaard, vakanties },
    { soort: keuze.soort, negeer }), [tekst, vandaag, huishouden.leden, bekend, standaard, vakanties, keuze.soort, negeer]);

  // Wat er bewaard wordt: de zin, met daarboven wat de gebruiker koos.
  const soort = v.soort;
  const datum = keuze.datum !== undefined ? keuze.datum : v.datum;
  const start = keuze.start !== undefined ? keuze.start ?? undefined : v.start;
  const eind = keuze.start !== undefined ? undefined : v.eind;
  const wie = keuze.wie ?? v.wie;
  const prive = soort === 'afspraak' && (keuze.prive ?? v.prive);
  // Vakantie: alleen bij een taak of boodschap; een eigen keuze wint van de zin. Bij twijfel (twee vakanties met
  // dezelfde naam) wordt niets vanzelf gekoppeld: eerst kiezen, of terugzetten in de titel.
  const kanVakantie = soort !== 'afspraak';
  const vakantieId = kanVakantie ? (keuze.vakantie !== undefined ? keuze.vakantie : v.vakantie) : null;
  const vakantie = vakantieId ? kiesbaar.find(x => x.id === vakantieId) : undefined;
  const twijfel = kanVakantie && keuze.vakantie === undefined && v.vakantieKeuze.length > 0;
  // Boodschap: standaard Later nodig met een vakantie, anders Nu te kopen; de knop wint.
  const later = soort === 'boodschap' && (keuze.later ?? !!vakantieId);
  const leeg = !tekst.trim();
  const geenTitel = v.meldingen.some(m => m.soort === 'geen-titel');
  const meldingen = v.meldingen.filter(m => m.soort !== 'geen-titel' && (m.soort !== 'vakantie-twijfel' || twijfel));
  // Wat er met bestaande items gebeurt, vooraf in gewone taal (één item: niets dubbel).
  const sleutel = (s: string) => s.trim().toLocaleLowerCase('nl');
  const vooraf: string[] = [];
  if (!leeg && soort === 'boodschap') {
    for (const naam of v.boodschappen) {
      const b = staat.items.filter(isBoodschap).find(x => sleutel(x.naam) === sleutel(naam) && !x.afgevinkt);
      if (!b) continue;
      const voor = vakantiesVoorBoodschap(b.id, staat.koppelingen ?? [], staat.vakanties ?? [], vandaag).map(x => x.naam);
      const bij = voor.length ? ` voor ${voor.join(' en ')}` : '';
      if (b.later && !later) vooraf.push(`${b.naam} staat bij Later nodig${bij}; hij gaat naar Nu te kopen.`);
      else if (b.later) vooraf.push(`${b.naam} staat al bij Later nodig${bij}${vakantie && !voor.includes(vakantie.naam) ? `; hij komt er ook voor ${vakantie.naam} bij` : ''}.`);
      else if (later) vooraf.push(`${b.naam} staat al bij Nu te kopen en blijft daar${vakantie ? `; hij komt er ook voor ${vakantie.naam} bij` : ''}.`);
    }
  }
  if (!leeg && soort === 'taak' && vakantie && staat.items.filter(isTaak).some(t => !t.klaar && t.vakantieId === vakantie.id && sleutel(t.titel) === sleutel(v.titel))) {
    vooraf.push(`"${v.titel}" staat al bij de voorbereidingen van ${vakantie.naam}. Toevoegen kan toch.`);
  }
  const aanname = (o: 'soort' | 'datum') => v.aangenomen.includes(o) && (o === 'soort' ? keuze.soort === undefined : keuze.datum === undefined);
  const lid = (id: LidId) => huishouden.leden.find(l => l.id === id);
  const kies = (k: Keuze) => { zetKeuze(x => ({ ...x, ...k })); zetPaneel(null); };
  const terugInTitel = (o: Onderdeel) => {
    zetNegeer(n => new Set([...n, o]));
    if (o === 'datum') zetKeuze(x => ({ ...x, datum: undefined }));
    if (o === 'tijd') zetKeuze(x => ({ ...x, start: undefined }));
    if (o === 'wie') zetKeuze(x => ({ ...x, wie: undefined }));
    if (o === 'vakantie') zetKeuze(x => ({ ...x, vakantie: undefined }));
    zetPaneel(null);
  };

  function voorinvulling(): Voorinvulling {
    // Leeg veld: het formulier zoals het was (een afspraak, of wat de knop in de Agenda meegaf); je kiest daar zelf de soort.
    if (leeg) return { soort: standaard?.soort ?? 'afspraak', titel: '', datum: standaard?.datum ?? null, wie: [], prive: false };
    return { soort, titel: soort === 'boodschap' ? v.boodschappen.join(', ') : v.titel, datum, start, eind, wie, plek: v.plek, prive, herhaling: v.herhaling,
      // Alleen als er iets te bewaren is: een gewone boodschap of taak opent het formulier zoals altijd.
      ...(vakantieId ? { vakantieId } : {}), ...(soort === 'boodschap' && (vakantieId || later) ? { later } : {}) };
  }

  function toevoegen(e: { preventDefault(): void }) {
    e.preventDefault();
    if (leeg || geenTitel || twijfel) { veld.current?.focus(); return; }
    if (soort === 'boodschap') {
      // Dezelfde handeling als op de Boodschappen- en vakantiepagina: één item, eventueel gekoppeld.
      if (vakantieId || later) app.voegBoodschappenToe(v.boodschappen, vakantieId ?? undefined, later);
      else app.voegBoodschappenToe(v.boodschappen);   // een gewone boodschap: precies zoals altijd
    } else if (soort === 'taak') {
      const t: Taak = { id: nieuwId('t'), soort: 'taak', titel: v.titel, datum, voor: wie[0] ?? null, klaar: false, klaarOp: null,
        ...(vakantie ? { vakantieId: vakantie.id } : {}) };
      app.toevoegen([t], vakantie ? `${v.titel} staat bij de voorbereidingen van ${vakantie.naam}`
        : datum ? `${v.titel} staat op de takenlijst` : `${v.titel} staat op de lijst voor later`);
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

  // ---- De kaart: wat Thuisplanner begrijpt, in gewone taal (lib/betekenis.ts). ----
  const b = betekenis({
    soort, titel: v.titel, boodschappen: v.boodschappen, datum, datumAangenomen: aanname('datum'), start, eind,
    wie: wie.map(id => lid(id)?.naam ?? '?'), plek: v.plek, herhaling: v.herhaling, vakantie: vakantie?.naam, later, vandaag,
  });
  const wieLabel = wie.length ? wie.map(id => lid(id)?.naam ?? '?').join(', ') : soort === 'afspraak' ? 'Iedereen' : 'Niemand gekozen';
  const tijdLabel = start ? (eind ? `${start}–${eind}` : start) : 'Hele dag';
  const herhaalLabel = v.herhaling ? FREQUENTIES.find(f => f.id === v.herhaling!.freq)?.label ?? 'Herhaalt' : '';

  // Eén vraag tegelijk, alleen bij twijfel; de standaard blijft wat de zin zegt (behalve bij twee gelijke vakanties).
  const middag = v.meldingen.find(m => m.soort === 'middag');
  const vraag: { tekst: string; keuzes: { label: string; aan?: boolean; kies: () => void }[] } | null =
    twijfel ? {
      tekst: 'Voor welke vakantie?',
      keuzes: [
        ...kiesbaar.filter(x => v.vakantieKeuze.includes(x.id)).map(x => ({ label: `${x.naam} (${periode(x, vandaag)})`, kies: () => kies({ vakantie: x.id }) })),
        { label: 'Geen vakantie', kies: () => kies({ vakantie: null }) },
      ],
    }
    : v.suggesties.length && !afgewezen.has(`lid:${v.suggesties[0].woord}`) ? {
      tekst: `Bedoel je ${v.suggesties[0].naam}?`,
      keuzes: [
        { label: v.suggesties[0].naam, kies: () => zetTekst(t => t.replace(v.suggesties[0].woord, v.suggesties[0].naam)) },
        { label: 'Nee', kies: () => zetAfgewezen(a => new Set([...a, `lid:${v.suggesties[0].woord}`])) },
      ],
    }
    : v.vakantieSuggestie && !afgewezen.has(`vak:${v.vakantieSuggestie.woord}`) ? {
      tekst: `Bedoel je ${v.vakantieSuggestie.naam}?`,
      keuzes: [
        { label: v.vakantieSuggestie.naam, kies: () => zetTekst(t => t.replace(v.vakantieSuggestie!.woord, v.vakantieSuggestie!.naam)) },
        { label: 'Nee', kies: () => zetAfgewezen(a => new Set([...a, `vak:${v.vakantieSuggestie!.woord}`])) },
      ],
    }
    : middag && soort === 'afspraak' && start && keuze.start === undefined && !afgewezen.has('middag') ? {
      tekst: `Bedoel je ${start}?`,
      keuzes: [
        { label: start, aan: true, kies: () => zetAfgewezen(a => new Set([...a, 'middag'])) },
        { label: `${String(Number(start.slice(0, 2)) - 12).padStart(2, '0')}${start.slice(2)}`,
          kies: () => kies({ start: `${String(Number(start.slice(0, 2)) - 12).padStart(2, '0')}${start.slice(2)}` }) },
      ],
    }
    : null;
  // Toelichting: hooguit één regel op de kaart; de rest staat onder Aanpassen. Niets gaat verloren.
  const alsVraag = new Set(['geen-titel', 'vakantie-twijfel', 'middag', ...(v.suggesties.length ? ['onbekende-naam'] : []), ...(v.vakantieSuggestie ? ['onbekende-vakantie'] : [])]);
  const toelichting = [...meldingen.filter(m => !alsVraag.has(m.soort)).map(m => m.tekst), ...vooraf];

  const opener = (p: Exclude<Paneel, null>) => { zetPaneel(paneel === p ? null : p); };
  const rij = (p: Exclude<Paneel, null>, label: string, waarde: string, inhoud: ReactNode) => (
    <div key={p} className="kaart-rij-blok">
      <button type="button" className="kaart-rij" aria-expanded={paneel === p} aria-label={`${label}: ${waarde}`} onClick={() => opener(p)}>
        <span className="kaart-rij-label">{label}</span>
        <span className="kaart-rij-waarde">{waarde}</span>
        <IcPijl className={'uitklap-pijl' + (paneel === p ? ' open' : '')} />
      </button>
      {paneel === p && <div className="kaart-paneel" ref={el => el?.scrollIntoView?.({ block: 'nearest' })}>{inhoud}</div>}
    </div>
  );
  const nietHerkennen = (o: Onderdeel) => v.herkend.includes(o) && (
    <button type="button" className="tekstknop" onClick={() => terugInTitel(o)}>Niet herkennen</button>
  );
  const [meerVakanties, zetMeerVakanties] = [toonAlleVakanties, zetToonAlleVakanties];
  const vakantieKeuzes = meerVakanties ? kiesbaar : kiesbaar.slice(0, 4);
  const Icoon = soort === 'afspraak' ? IcAgenda : soort === 'taak' ? IcVink : IcBoodschappen;

  const kaart = !leeg && (
    <div className="snel-kaart" aria-live="polite">
      <div className="kaart-hoofd">
        <span className={'kaart-icoon ' + soort} aria-hidden="true"><Icoon width={20} height={20} /></span>
        <div className="kaart-tekst">
          {geenTitel
            ? <p className="kaart-regel">{soort === 'boodschap' ? 'Wat moet er gekocht worden?' : 'Wat moet er gebeuren?'}</p>
            : <>
              <p className="kaart-titel">{b.titel}</p>
              <p className="kaart-regel">{b.regel}</p>
            </>}
          {soort === 'afspraak' && !geenTitel && (
            // Privé of gedeeld: bij een afspraak altijd in beeld en met één tik te wisselen (snelinvoer §4.4).
            <button type="button" className={'kaart-delen' + (prive ? ' prive' : '')} aria-pressed={prive}
              onClick={() => kies({ prive: !prive })}>
              {prive ? <><IcSlot /> Alleen voor jou (privé)</> : 'Gedeeld met het huishouden'}
            </button>
          )}
        </div>
      </div>
      {toelichting.length > 0 && !aanpassen && <p className="kaart-extra">{toelichting[0]}</p>}
      {vraag && (
        <div className="kaart-vraag" role="group" aria-label={vraag.tekst}>
          <p>{vraag.tekst}</p>
          <div className="keuzes">
            {vraag.keuzes.map(k => <button key={k.label} type="button" className={'keuze' + (k.aan ? ' aan' : '')} onClick={k.kies}>{k.label}</button>)}
          </div>
        </div>
      )}
      {!geenTitel && (
        <button type="button" className="tekstknop kaart-aanpassen" aria-expanded={aanpassen}
          onClick={() => { const nu = !aanpassen; zetAanpassen(nu); zetPaneel(null); if (nu) veld.current?.blur(); }}>
          {aanpassen ? 'Klaar' : 'Aanpassen'}
        </button>
      )}
      {aanpassen && (
        <div className="kaart-rijen">
          {toelichting.length > 0 && <div className="kaart-toelichting">{toelichting.map(t => <p key={t}>{t}</p>)}</div>}
          {rij('soort', 'Soort', NAAM[soort], (
            <div className="keuzes" role="group" aria-label="Soort">
              {(['afspraak', 'taak', 'boodschap'] as Soort[]).map(x => (
                <button key={x} type="button" className={'keuze' + (x === soort ? ' aan' : '')} aria-pressed={x === soort} onClick={() => kies({ soort: x })}>{NAAM[x]}</button>
              ))}
            </div>
          ))}
          {soort !== 'boodschap' && rij('datum', 'Wanneer', datum ? dagLabel(datum, vandaag) : 'Geen datum', (
            <><DatumKeuze vandaag={vandaag} datum={datum} geenDatum={soort === 'taak'} kies={d => kies({ datum: d })} />{nietHerkennen('datum')}</>
          ))}
          {soort === 'afspraak' && rij('tijd', 'Hoe laat', tijdLabel, (
            <><TijdKeuze start={start ?? ''} kies={(st, _e, viaVeld) => viaVeld ? zetKeuze(x => ({ ...x, start: st || null })) : kies({ start: st || null })} />{nietHerkennen('tijd')}</>
          ))}
          {soort !== 'boodschap' && rij('wie', soort === 'taak' ? 'Wie' : 'Met wie', wieLabel, (
            <><WieKeuze leden={huishouden.leden} wie={wie} enkel={soort === 'taak'}
              kies={w => soort === 'taak' || !w.length ? kies({ wie: w }) : zetKeuze(x => ({ ...x, wie: w }))} />{nietHerkennen('wie')}</>
          ))}
          {soort === 'afspraak' && v.plek && rij('plek', 'Waar', v.plek, nietHerkennen('plek'))}
          {soort === 'afspraak' && v.herhaling && rij('herhaling', 'Herhalen', herhaalLabel, (
            <><p className="stil-tekst">{herhalingTekst(datum ?? vandaag, { freq: v.herhaling.freq, tot: v.herhaling.tot })}</p>{nietHerkennen('herhaling')}</>
          ))}
          {kanVakantie && kiesbaar.length > 0 && rij('vakantie', 'Vakantie', vakantie ? vakantie.naam : twijfel ? 'Kies welke' : 'Geen', (
            <>
              <div className="keuzes" role="group" aria-label="Vakantie">
                {vakantieKeuzes.map(x => {
                  // Bij dezelfde naam: de periode erbij, zodat duidelijk is welke.
                  const dubbel = kiesbaar.filter(y => y.naam.trim().toLowerCase() === x.naam.trim().toLowerCase()).length > 1;
                  return (
                    <button key={x.id} type="button" className={'keuze' + (x.id === vakantieId ? ' aan' : '')} aria-pressed={x.id === vakantieId}
                      onClick={() => kies({ vakantie: x.id })}>{x.naam}{dubbel ? ` (${periode(x, vandaag)})` : ''}</button>
                  );
                })}
                {kiesbaar.length > 4 && !meerVakanties && <button type="button" className="keuze" onClick={() => zetMeerVakanties(true)}>Meer…</button>}
                <button type="button" className={'keuze' + (!vakantieId && !twijfel ? ' aan' : '')} aria-pressed={!vakantieId && !twijfel}
                  onClick={() => kies({ vakantie: null })}>Geen vakantie</button>
              </div>
              {nietHerkennen('vakantie')}
            </>
          ))}
          {soort === 'boodschap' && rij('lijst', 'Lijst', later ? 'Later nodig' : 'Nu te kopen', (
            <div className="keuzes" role="group" aria-label="Lijst">
              <button type="button" className={'keuze' + (!later ? ' aan' : '')} aria-pressed={!later} onClick={() => kies({ later: false })}>Nu te kopen</button>
              <button type="button" className={'keuze' + (later ? ' aan' : '')} aria-pressed={later} onClick={() => kies({ later: true })}>Later nodig</button>
            </div>
          ))}
          <button type="button" className="tekstknop kaart-formulier" onClick={() => allesInvullen(voorinvulling())}>Meer in het formulier</button>
        </div>
      )}
    </div>
  );

  // Enter ("Gereed" op de telefoon) voegt toe; een nieuwe regel is niet nodig.
  const opToets = (e: KeyboardEvent<HTMLTextAreaElement>) => { if (e.key === 'Enter' && !e.shiftKey) toevoegen(e); };
  const kanToevoegen = !leeg && !geenTitel && !twijfel;
  const plekStijl = zichtbaar ? { top: zichtbaar.top, height: zichtbaar.hoogte, bottom: 'auto' } : undefined;

  return (
    <div className={'laag snel-laag' + (zichtbaar?.toetsenbord ? ' met-toetsenbord' : '')} style={plekStijl}
      onMouseDown={e => { if (e.target === e.currentTarget) sluit(); }}>
      <div className="snel-vel" role="dialog" aria-modal="true" aria-label="Toevoegen" ref={vel} tabIndex={-1}>
        {/* Geen kopregel: de invoer staat centraal. Sluiten = buiten tikken of Escape; deze knop is er voor schermlezers. */}
        <button type="button" className="sr-only" onClick={sluit}>Sluiten</button>
        {kaart}
        <form className="snel-balk" onSubmit={toevoegen} noValidate>
          {/* Het formulier: klein en rustig links in de balk (zoals de knop naast het veld in Berichten). */}
          <button type="button" className="snel-formulier" aria-label="Formulier" title="Formulier" onClick={() => allesInvullen(voorinvulling())}>
            <IcFormulier />
          </button>
          <label className="sr-only" htmlFor="snel-zin">Wat wil je regelen?</label>
          <textarea ref={veld} id="snel-zin" rows={1} value={tekst} onChange={e => zetTekst(e.target.value)} onKeyDown={opToets}
            onFocus={() => { zetAanpassen(false); zetPaneel(null); }}
            autoComplete="off" maxLength={200} enterKeyHint="done"
            placeholder={standaard?.soort === 'boodschap' ? 'Wat moet er gekocht worden?' : 'Wat moet er gebeuren?'} />
          <button type="submit" className="snel-verstuur" aria-label="Toevoegen" disabled={!kanToevoegen} onClick={toevoegen}>
            <IcVerstuur />
          </button>
        </form>
      </div>
    </div>
  );
}

