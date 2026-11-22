// Plannen (besluit 18, docs/thuisplanner-plannen.md): het overzicht en één plan. De taken zijn gewone taken: de rij, het
// afvinken en het venster zijn dezelfde als op Vandaag en in de Agenda. Een klein plan is één lijst; onderdelen verschijnen
// pas als je er zelf een toevoegt, en dan staat er één tegelijk open. Alleen in de demo; niets wordt bewaard.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useApp } from '../lib/context';
import { dagLabel } from '../lib/datum';
import { nieuwId } from '../lib/store';
import { eindTekst, onderdelenVan, openTakenOpVolgorde, planStand, planTaakPast, sorteerPlannen, takenPerOnderdeel, takenVan, voortgang, type PlanFilter } from '../lib/plan';
import { taakMensen } from '../lib/mensen';
import type { Plan, PlanOnderdeel, Taak } from '../lib/types';
import { TaakRij, Wie } from '../components/Rijen';
import { IcLinks, IcPijl, IcPlan, IcPlus, IcPunten } from '../components/Iconen';
import { OnderdeelVenster, PlanVenster } from '../components/PlanVensters';
import { BlokKop, Voortgang } from './Vakanties';

export function Plannen() {
  const { plan, staat } = useApp();
  const p = plan ? staat.plannen.find(x => x.id === plan) : undefined;
  if (p) return <PlanPagina key={p.id} p={p} />;
  return <PlanLijst nietGevonden={!!plan} />;
}

// ---------------------------------------------------------------- Overzicht

function PlanKaart({ p }: { p: Plan }) {
  const { staat, vandaag, openPlan, huishouden } = useApp();
  const taken = takenVan(staat.items, p.id);
  const { klaar, totaal } = voortgang(taken);
  const stand = planStand(p, taken);
  const eind = eindTekst(p, vandaag);
  const voorJou = taken.filter(t => !t.klaar && taakMensen(t).includes(huishouden.ik)).length;
  const regel = [stand, eind].filter(Boolean).join(' · ');
  const naam = [p.titel, stand, totaal ? `${klaar} van ${totaal} klaar` : null, eind].filter(Boolean).join(', ');
  return (
    <li>
      <button type="button" className="vak-kaart plan-kaart" onClick={() => openPlan(p.id)} aria-label={`${naam}. Openen`}>
        <span className="vak-kaart-naam">{p.titel}</span>
        <span className="plan-kaart-stand">{regel}</span>
        {totaal > 0 && (
          <span className="plan-voortgang">
            <Voortgang klaar={klaar} totaal={totaal} label="Taken klaar" klein />
            <span className="plan-tel">{klaar} van {totaal} klaar</span>
          </span>
        )}
        <span className="rij-sub">
          <Wie ids={p.wie} klein />
          {voorJou > 0 && !p.afgerondOp && <span className="plek">{voorJou} voor jou</span>}
        </span>
      </button>
    </li>
  );
}

function PlanLijst({ nietGevonden }: { nietGevonden: boolean }) {
  const { staat, gaNaar } = useApp();
  const [nieuw, zetNieuw] = useState(false);
  const [toonAfgerond, zetToonAfgerond] = useState(false);
  const actief = sorteerPlannen(staat.plannen.filter(p => !p.afgerondOp));
  const afgerond = staat.plannen.filter(p => p.afgerondOp);
  return (
    <div className="scherm plannen">
      <header className="kop">
        <button type="button" className="terug-link" onClick={() => gaNaar('meer')}><IcLinks width={18} height={18} /> Meer</button>
        <div className="kop-regel">
          <h1>Plannen</h1>
          <button type="button" className="icoonknop vak-plus" aria-label="Nieuw plan" onClick={() => zetNieuw(true)}><IcPlus /></button>
        </div>
        {staat.plannen.length > 0 && <p className="kop-samenvatting">Wat pakken jullie samen aan?</p>}
      </header>
      {nietGevonden && <p className="stil-tekst vak-weg" role="status">Dat plan bestaat niet (meer).</p>}

      {!staat.plannen.length ? (
        <section className="rust" aria-label="Nog geen plannen">
          <p className="rust-titel">Nog geen plannen.</p>
          <p className="rust-tekst">Iets groters dat jullie samen willen regelen, zoals de schuur opruimen?</p>
          <button type="button" className="knop vak-eerste" onClick={() => zetNieuw(true)}>Plan maken</button>
        </section>
      ) : (
        <>
          {actief.length > 0 && <ul className="vak-kaarten plan-kaarten">{actief.map(p => <PlanKaart key={p.id} p={p} />)}</ul>}
          {afgerond.length > 0 && (
            <section aria-labelledby="h-plan-afgerond" className="vak-eerder">
              <h2 id="h-plan-afgerond" className="sectie-kop">
                <button type="button" className="link uitklap" aria-expanded={toonAfgerond} onClick={() => zetToonAfgerond(x => !x)}>
                  Afgerond <span className="teller">{afgerond.length}</span> <IcPijl className={'uitklap-pijl' + (toonAfgerond ? ' open' : '')} width={16} height={16} />
                </button>
              </h2>
              {toonAfgerond && <ul className="vak-kaarten plan-kaarten">{afgerond.map(p => <PlanKaart key={p.id} p={p} />)}</ul>}
            </section>
          )}
        </>
      )}
      {nieuw && <PlanVenster sluit={() => zetNieuw(false)} />}
    </div>
  );
}

// ---------------------------------------------------------------- Eén plan

/** De regel om een taak toe te voegen: Enter, en meteen de volgende typen. */
function TaakInvoer({ p, onderdeel, focusBijOpenen }: { p: Plan; onderdeel?: PlanOnderdeel; focusBijOpenen?: boolean }) {
  const app = useApp();
  const [titel, zetTitel] = useState('');
  const veld = useRef<HTMLInputElement>(null);
  const focus = useRef(!!focusBijOpenen);
  useEffect(() => { if (focus.current) veld.current?.focus(); }, []);
  const id = `plan-taak-${onderdeel?.id ?? p.id}`;

  function voegToe(e: { preventDefault(): void }) {
    e.preventDefault();
    const t = titel.trim().replace(/\s+/g, ' ');
    if (!t) return;
    const nieuw: Taak = { id: nieuwId('t'), soort: 'taak', titel: t, datum: null, voor: null, klaar: false, klaarOp: null, planId: p.id,
      ...(onderdeel ? { onderdeelId: onderdeel.id } : {}) };
    app.toevoegen([nieuw], `${t} staat bij ${onderdeel?.naam ?? p.titel}`);
    zetTitel('');
    veld.current?.focus();
  }

  return (
    <form className="snel vak-snel" onSubmit={voegToe}>
      <label className="sr-only" htmlFor={id}>Taak toevoegen</label>
      <input id={id} ref={veld} value={titel} onChange={e => zetTitel(e.target.value)} placeholder="Taak toevoegen…" autoComplete="off" maxLength={200} />
      <button className="knop" type="submit" onClick={voegToe} aria-label="Toevoegen aan plan"><IcPlus width={20} height={20} /></button>
    </form>
  );
}

/** Open taken, en daaronder de afgeronde taken ingeklapt. */
function TaakLijst({ taken, naam }: { taken: Taak[]; naam?: string }) {
  const { vandaag } = useApp();
  const [toon, zetToon] = useState(false);
  const open = openTakenOpVolgorde(taken);
  const klaar = taken.filter(t => t.klaar);
  const rij = (t: Taak) => <TaakRij key={t.id} t={t} extra={!t.klaar && t.datum ? dagLabel(t.datum, vandaag) : undefined} zonderPlan />;
  return (
    <>
      {open.length > 0 && <ul className="lijst vak-lijst" aria-label={naam ? `Open taken van ${naam}` : 'Open taken'}>{open.map(rij)}</ul>}
      {klaar.length > 0 && (
        <div className="afgerond vak-afgerond">
          <button type="button" className="link afgerond-knop" aria-expanded={toon} onClick={() => zetToon(x => !x)}>
            {klaar.length} afgerond {toon ? '· verbergen' : '· tonen'}
          </button>
          {toon && <ul className="lijst vak-lijst" aria-label={naam ? `Afgeronde taken van ${naam}` : 'Afgeronde taken'}>{klaar.map(rij)}</ul>}
        </div>
      )}
    </>
  );
}

/** Wie doet wat: de taken van één persoon, uit alle onderdelen onder elkaar. Geen tellingen per persoon (principe 9). */
function PerPersoon({ p, filter }: { p: Plan; filter: Exclude<PlanFilter, null> }) {
  const { staat, lid } = useApp();
  const onderdelen = onderdelenVan(staat.onderdelen, p.id);
  const { los, per } = takenPerOnderdeel(takenVan(staat.items, p.id).filter(t => planTaakPast(t, filter)), onderdelen);
  const groepen = onderdelen.filter(o => per.get(o.id)!.length);
  if (!los.length && !groepen.length) {
    return <p className="stil-tekst vak-leeg">{filter === 'niemand' ? 'Elke taak heeft iemand die haar oppakt.' : `${lid(filter)?.naam ?? 'Deze persoon'} heeft nog niets in dit plan.`}</p>;
  }
  return (
    <>
      <TaakLijst taken={los} />
      {groepen.map(o => (
        <section key={o.id} className="plan-per-persoon" aria-labelledby={`h-pp-${o.id}`}>
          <h2 id={`h-pp-${o.id}`} className="sectie-kop">{o.naam}</h2>
          <TaakLijst taken={per.get(o.id)!} naam={o.naam} />
        </section>
      ))}
    </>
  );
}

function PlanPagina({ p }: { p: Plan }) {
  const app = useApp();
  const { staat, vandaag, openPlan } = app;
  const [aanpassen, zetAanpassen] = useState(false);
  const [nieuwOnderdeel, zetNieuwOnderdeel] = useState(false);
  const [wijzig, zetWijzig] = useState<string | null>(null);
  const taken = takenVan(staat.items, p.id);
  const onderdelen = onderdelenVan(staat.onderdelen, p.id);
  const { los, per } = takenPerOnderdeel(taken, onderdelen);
  const { klaar, totaal } = voortgang(taken);
  const stand = planStand(p, taken);
  const eind = eindTekst(p, vandaag);
  const actief = !p.afgerondOp;
  // Eén onderdeel tegelijk open: bij het openen het eerste met open taken. Daarna bepaal jij het; afvinken klapt niets dicht.
  const [open, zetOpen] = useState<string | null>(() => onderdelen.find(o => per.get(o.id)!.some(t => !t.klaar))?.id ?? null);
  const leegBijOpenen = useRef(!totaal && !onderdelen.length && actief);
  const teWijzigen = wijzig ? onderdelen.find(o => o.id === wijzig) : undefined;
  const [filter, zetFilter] = useState<PlanFilter>(null);
  // Pas nodig als een plan groter wordt; een klein plan blijft één lijst.
  const metFilter = onderdelen.length > 0 || totaal >= 6;
  const keuze = (waarde: PlanFilter, inhoud: ReactNode, sleutel: string) => (
    <button key={sleutel} type="button" className={'keuze' + (filter === waarde ? ' aan' : '')} aria-pressed={filter === waarde} onClick={() => zetFilter(waarde)}>{inhoud}</button>
  );

  return (
    <div className="scherm plan">
      <div className="vak-navigatie">
        <button type="button" className="terug-link" onClick={() => openPlan(null)}><IcLinks width={18} height={18} /> Plannen</button>
        <button type="button" className="icoonknop" aria-label={`${p.titel} aanpassen`} onClick={() => zetAanpassen(true)}><IcPunten /></button>
      </div>
      <header className="plan-kop">
        <h1>{p.titel}</h1>
        {p.omschrijving && <p className="plan-omschrijving">{p.omschrijving}</p>}
        <p className="rij-sub plan-sub">
          <span className="plan-stand">{stand}</span>
          {eind && <span className="plek">{eind}</span>}
          <Wie ids={p.wie} klein />
        </p>
        {totaal > 0 && (
          <div className="plan-voortgang">
            <Voortgang klaar={klaar} totaal={totaal} label="Taken klaar" />
            <span className="plan-tel">{klaar} van {totaal} klaar</span>
          </div>
        )}
      </header>

      {stand === 'Alles klaar' && (
        <section className="plan-af" aria-label="Plan afronden">
          <p>Alles is klaar. Plan afronden?</p>
          <button type="button" className="knop" onClick={() => app.planBijwerken({ ...p, afgerondOp: vandaag }, `${p.titel} afgerond`)}>Plan afronden</button>
        </section>
      )}

      {metFilter && (
        <div className="keuzes plan-filter" role="group" aria-label="Wie doet wat">
          {keuze(null, 'Iedereen', 'iedereen')}
          {app.huishouden.leden.map(l => keuze(l.id, <><span className="stip" style={{ background: l.kleur }} aria-hidden="true" />{l.naam}</>, l.id))}
          {keuze('niemand', 'Nog niemand', 'niemand')}
        </div>
      )}

      {filter !== null ? <PerPersoon p={p} filter={filter} /> : <>
      {/* Met onderdelen voeg je een taak toe in het onderdeel; losse taken blijven zonder kop bovenaan staan. */}
      {actief && !onderdelen.length && <TaakInvoer p={p} focusBijOpenen={leegBijOpenen.current} />}
      {!totaal && !onderdelen.length && <p className="stil-tekst vak-leeg">Wat moet er gebeuren? Een taak met een datum verschijnt vanzelf op Vandaag en in de Agenda.</p>}
      <TaakLijst taken={los} />

      {onderdelen.map(o => {
        const vanOnderdeel = per.get(o.id)!;
        const v = voortgang(vanOnderdeel);
        const isOpen = open === o.id;
        return (
          <section key={o.id} className={'vak-blok plan-onderdeel' + (isOpen ? '' : ' dicht')} aria-labelledby={`h-ond-${o.id}`}>
            <BlokKop id={`h-ond-${o.id}`} titel={o.naam} tel={v.totaal ? `${v.klaar} van ${v.totaal}` : undefined} open={isOpen} wissel={() => zetOpen(isOpen ? null : o.id)} />
            {isOpen && (
              <div id={`h-ond-${o.id}-inhoud`}>
                {actief && <TaakInvoer p={p} onderdeel={o} />}
                {!v.totaal && <p className="stil-tekst vak-leeg">Nog geen taken in dit onderdeel.</p>}
                <TaakLijst taken={vanOnderdeel} naam={o.naam} />
                {actief && <button type="button" className="tekstknop plan-onderdeel-aanpassen" onClick={() => zetWijzig(o.id)}>Onderdeel aanpassen</button>}
              </div>
            )}
          </section>
        );
      })}

      </>}
      {actief && filter === null && <button type="button" className="tekstknop plan-onderdeel-nieuw" onClick={() => zetNieuwOnderdeel(true)}><IcPlus width={16} height={16} /> Onderdeel toevoegen</button>}
      {p.afgerondOp && (
        <button type="button" className="tekstknop plan-heropen" onClick={() => app.planBijwerken({ ...p, afgerondOp: null }, `${p.titel} weer open`)}>Plan weer openen</button>
      )}
      {aanpassen && <PlanVenster bestaand={p} sluit={() => zetAanpassen(false)} />}
      {nieuwOnderdeel && <OnderdeelVenster planId={p.id} sluit={() => zetNieuwOnderdeel(false)} gemaakt={zetOpen} />}
      {teWijzigen && <OnderdeelVenster planId={p.id} bestaand={teWijzigen} sluit={() => zetWijzig(null)} />}
    </div>
  );
}

// ---------------------------------------------------------------- Ingang in Meer

/** Voor Meer: één rij naar Plannen. Voorlopige plek (besluit 18): na gebruikerstesten opnieuw beoordelen. */
export function PlannenRij() {
  const { staat, openPlan } = useApp();
  const actief = sorteerPlannen(staat.plannen.filter(p => !p.afgerondOp));
  const sub = !actief.length ? 'Wat jullie samen aanpakken'
    : actief.length === 1 ? actief[0].titel : `${actief[0].titel} en nog ${actief.length - 1}`;
  return (
    <section aria-label="Plannen" className="blok meer-vakanties">
      <ul className="lijst">
        <li className="rij">
          <button type="button" className="rij-knop" onClick={() => openPlan(null)} aria-label={`Plannen: ${sub}`}>
            <span className="lid-avatar vak-icoon" aria-hidden="true"><IcPlan width={20} height={20} /></span>
            <span className="rij-inhoud">
              <span className="rij-titel">Plannen</span>
              <span className="rij-sub"><span className="plek">{sub}</span></span>
            </span>
            <IcPijl className="rij-pijl" />
          </button>
        </li>
      </ul>
    </section>
  );
}
