// Lokale demo-staat. Alles leeft alleen in het geheugen van dit tabblad: niets gaat naar een server
// en niets wordt bewaard. Herladen zet de demo terug.
import { useMemo, useReducer } from 'react';
import { demoItems, demoVakanties, huishouden, type Scenario } from '../data/demo';
import { demoPlannen } from '../data/plannen-demo';
import { zichtbaarVoor } from './rechten';
import { boodschappenMelding, voegBoodschappenToe } from './boodschappen';
import { verwijderReeks, verwijderVoorkomen, wijzigVoorkomen } from './herhaling';
import { alOpPaklijst, doelVan, doelVelden, groepNaam, inDoel, pakSleutel, paklijstNaamFout, zelfdeDoel } from './vakantie';
import type { Acties, DemoExtra, Staat as AppStaat } from './acties';
import { zonderPlan, zonderTaken } from './plan-bijlagen';
import type { Afspraak, Boodschap, Datum, Item, LidId, PakDoel, Pakitem, Paklijst, Plan, PlanKoppeling, PlanOnderdeel, Taak, Vakantie, VakantieKoppeling } from './types';

export interface Melding {
  id: number;
  tekst: string;
  /** Alleen waar: "Ongedaan maken" draait precies de wijziging terug waar deze melding over gaat. */
  ongedaan: boolean;
}

/** Alles wat "Ongedaan maken" terugzet. */
export interface Gegevens {
  items: Item[];
  vakanties: Vakantie[];
  pakitems: Pakitem[];
  /** Extra inpaklijsten (§20), in de volgorde van aanmaken. */
  paklijsten: Paklijst[];
  koppelingen: VakantieKoppeling[];
  /** Besluit 18: alleen in de demo; in lokaal en staging altijd leeg. */
  plannen: Plan[];
  onderdelen: PlanOnderdeel[];
  /** Bijlagen: alleen de koppeling met een document. Nog leeg: er is nog geen upload (docs/thuisplanner-plannen-bijlagen.md). */
  planKoppelingen: PlanKoppeling[];
}

/**
 * De demo-staat: de gedeelde staat van de schermen (Staat in acties.ts) plus wat alleen de demo heeft. Online bestaan
 * scenario en vorige niet (KG-5E licht).
 */
export interface DemoStaat extends AppStaat {
  scenario: Scenario;
  /** Eén stap terug ("fouten moeten goedkoop zijn"). */
  vorige: Gegevens | null;
}
/** De demo-staat onder zijn oude naam (de reducer-tests gebruiken die). De schermen gebruiken Staat uit acties.ts. */
export type Staat = DemoStaat;

/** Voor wie vinkjes of overnemen gelden: één lid, Gezamenlijk (null), een extra lijst ({ lijst }) of iedereen. */
export type Groep = PakDoel | 'iedereen';

/**
 * Elke wijziging van de gegevens zet de vorige stand klaar voor "Ongedaan maken" en vervangt de melding.
 * Een wijziging zonder eigen melding (bijvoorbeeld een boodschap afvinken) haalt een oude melding weg,
 * zodat "Ongedaan maken" nooit iets anders terugdraait dan wat erbij staat.
 */
type Wijziging = { melding?: string };
type Actie =
  | ({ type: 'toevoegen'; items: Item[] } & Wijziging)
  | ({ type: 'vervangAlles'; items: Item[] } & Wijziging)
  | ({ type: 'bijwerken'; item: Item } & Wijziging)
  | ({ type: 'wissel'; id: string; vandaag: Datum } & Wijziging)
  | ({ type: 'verwijder'; ids: string[] } & Wijziging)
  | { type: 'boodschappen'; namen: string[]; vakantieId?: string; later?: boolean }
  | ({ type: 'boodschapLater'; id: string; later: boolean } & Wijziging)
  | ({ type: 'voorkomenWijzigen'; reeksId: string; datum: Datum; afspraak: Afspraak } & Wijziging)
  | ({ type: 'voorkomenVerwijderen'; reeksId: string; datum: Datum } & Wijziging)
  | ({ type: 'reeksVerwijderen'; reeksId: string } & Wijziging)
  | { type: 'ongedaan' }
  | { type: 'wegklikken'; id: string }
  | { type: 'meld'; tekst: string }
  | { type: 'meldingWeg'; id: number }
  | { type: 'scenario'; scenario: Scenario; vandaag: Datum; melding: string }
  // F8 Vakanties
  | ({ type: 'vakantieToevoegen'; vakantie: Vakantie } & Wijziging)
  | ({ type: 'vakantieBijwerken'; vakantie: Vakantie } & Wijziging)
  | ({ type: 'vakantieVerwijderen'; id: string } & Wijziging)
  | { type: 'pakitemToevoegen'; item: Pakitem }
  | { type: 'pakitemWissel'; id: string; door: LidId }
  | { type: 'pakitemBijwerken'; id: string; naam?: string; doel?: PakDoel }
  | ({ type: 'pakitemVerwijderen'; id: string } & Wijziging)
  | { type: 'overnemen'; van: string; naar: string; groep: Groep; lijsten?: string[] }
  | { type: 'paklijstToevoegen'; lijst: Paklijst }
  | { type: 'paklijstHernoemen'; id: string; naam: string }
  | ({ type: 'paklijstVerwijderen'; id: string } & Wijziging)
  | { type: 'vinkjesOpnieuw'; vakantieId: string; groep: Groep }
  | ({ type: 'ontkoppelen'; koppelingId: string } & Wijziging)
  // Besluit 18: Plannen
  | ({ type: 'planToevoegen'; plan: Plan } & Wijziging)
  | ({ type: 'planBijwerken'; plan: Plan } & Wijziging)
  | ({ type: 'planVerwijderen'; id: string; metTaken: boolean } & Wijziging)
  | ({ type: 'onderdeelToevoegen'; onderdeel: Omit<PlanOnderdeel, 'volgorde'> } & Wijziging)
  | ({ type: 'onderdeelHernoemen'; id: string; naam: string } & Wijziging)
  | { type: 'onderdeelVerplaatsen'; id: string; richting: -1 | 1 }
  | ({ type: 'onderdeelVerwijderen'; id: string } & Wijziging);

let meldingTeller = 0;
const melding = (tekst: string | undefined, ongedaan: boolean): Melding | null =>
  tekst ? { id: ++meldingTeller, tekst, ongedaan } : null;

const gegevens = (s: Staat): Gegevens => ({ items: s.items, vakanties: s.vakanties, pakitems: s.pakitems, paklijsten: s.paklijsten, koppelingen: s.koppelingen, plannen: s.plannen, onderdelen: s.onderdelen, planKoppelingen: s.planKoppelingen });

function wijzigAlles(s: Staat, nieuw: Partial<Gegevens>, tekst?: string): Staat {
  return { ...s, vorige: gegevens(s), ...nieuw, melding: melding(tekst, true) };
}
function wijzig(s: Staat, items: Item[], tekst?: string): Staat {
  return wijzigAlles(s, { items }, tekst);
}
/** Alleen een melding, zonder iets te wijzigen (en zonder "Ongedaan maken"). */
const meldAlleen = (s: Staat, tekst: string): Staat => ({ ...s, melding: melding(tekst, false) });

// Iedereen = de leden en Gezamenlijk; een extra lijst alleen als die gekozen is (zoals de server).
const inGroep = (p: Pakitem, groep: Groep) => (groep === 'iedereen' ? !p.lijst : inDoel(p, groep));
const meervoud = (n: number, een: string, meer: string) => `${n} ${n === 1 ? een : meer}`;

export function reducer(s: Staat, a: Actie): Staat {
  switch (a.type) {
    case 'toevoegen':
      return wijzig(s, [...s.items, ...a.items], a.melding);
    case 'vervangAlles':
      return wijzig(s, a.items, a.melding);
    case 'bijwerken': {
      const items = s.items.map(i => (i.id === a.item.id ? behoudKoppeling(i, a.item) : i));
      return wijzigAlles(s, { items, plannen: heropendPlan(s, a.item.id, items) }, a.melding);
    }
    case 'wissel': {
      const items = s.items.map(i => {
        if (i.id !== a.id) return i;
        // Afvinken is af: een stand "Bezig" blijft niet achter (ook niet bij weer openzetten).
        if (i.soort === 'taak') return { ...i, klaar: !i.klaar, klaarOp: i.klaar ? null : a.vandaag, ...(i.bezig ? { bezig: false } : {}) };
        if (i.soort === 'boodschap') return { ...i, afgevinkt: !i.afgevinkt };
        return i;
      });
      return wijzigAlles(s, { items, plannen: heropendPlan(s, a.id, items) }, a.melding);
    }
    case 'verwijder':
      return wijzigAlles(s, { items: s.items.filter(i => !a.ids.includes(i.id)), planKoppelingen: zonderTaken(s.planKoppelingen, a.ids) }, a.melding);
    case 'boodschappen': {
      // Vanuit een vakantie: standaard bij "Later nodig" (zelfde regels als add_shopping_items met p_later).
      const later = a.later ?? !!a.vakantieId;
      const r = voegBoodschappenToe(s.items, a.namen, () => nieuwId('b'), later);
      const sleutel = (n: string) => n.trim().toLocaleLowerCase('nl');
      const idVan = (naam: string) => (r.items.find(i => i.soort === 'boodschap' && sleutel(i.naam) === sleutel(naam)) as Boodschap | undefined)?.id;
      // Hergebruik (afgevinkt komt terug): de oude koppelingen zijn afgehandeld en worden niet opnieuw actueel (§6.2).
      const terugIds = new Set(r.terug.map(idVan).filter(Boolean) as string[]);
      let koppelingen = s.koppelingen.map(k => (terugIds.has(k.boodschapId) && !k.afgehandeld ? { ...k, afgehandeld: true } : k));
      if (a.vakantieId) {
        for (const naam of [...r.nieuw, ...r.alOpLijst, ...r.terug, ...(r.naarNu ?? [])]) {
          const id = idVan(naam);
          if (id && !koppelingen.some(k => k.boodschapId === id && k.vakantieId === a.vakantieId && !k.afgehandeld)) {
            koppelingen = [...koppelingen, { id: nieuwId('k'), vakantieId: a.vakantieId, boodschapId: id, afgehandeld: false }];
          }
        }
      }
      return wijzigAlles(s, { items: r.items, koppelingen }, boodschappenMelding(r, later));
    }
    case 'boodschapLater':
      return wijzig(s, s.items.map(i => {
        if (i.id !== a.id || i.soort !== 'boodschap') return i;
        const { later: _, ...rest } = i;
        return a.later ? { ...rest, later: true } : rest;
      }), a.melding);
    case 'voorkomenWijzigen':
      return wijzig(s, wijzigVoorkomen(s.items, a.reeksId, a.datum, a.afspraak), a.melding);
    case 'voorkomenVerwijderen':
      return wijzig(s, verwijderVoorkomen(s.items, a.reeksId, a.datum), a.melding);
    case 'reeksVerwijderen':
      return wijzig(s, verwijderReeks(s.items, a.reeksId), a.melding);
    case 'ongedaan':
      return s.vorige ? { ...s, ...s.vorige, vorige: null, melding: melding('Teruggezet', false) } : s;
    case 'wegklikken':
      return { ...s, weggeklikt: new Set([...s.weggeklikt, a.id]) };
    case 'meld':
      return { ...s, melding: melding(a.tekst, false) };
    case 'meldingWeg':
      return s.melding?.id === a.id ? { ...s, melding: null } : s;
    case 'scenario':
      return { ...beginStaat(a.vandaag, a.scenario), melding: melding(a.melding, false) };

    // ---- Vakanties ----
    case 'vakantieToevoegen':
      return wijzigAlles(s, { vakanties: [...s.vakanties, a.vakantie] }, a.melding);
    case 'vakantieBijwerken':
      return wijzigAlles(s, { vakanties: s.vakanties.map(v => (v.id === a.vakantie.id ? a.vakantie : v)) }, a.melding);
    case 'vakantieVerwijderen':
      // Taken en boodschappen blijven bestaan; zonder vakantie verdwijnt alleen het label.
      return wijzigAlles(s, { vakanties: s.vakanties.filter(v => v.id !== a.id) }, a.melding);
    case 'pakitemToevoegen': {
      const p = a.item;
      if (p.lijst && !s.paklijsten.some(l => l.id === p.lijst)) return meldAlleen(s, 'Deze inpaklijst bestaat niet meer.');
      if (alOpPaklijst(s.pakitems, p.vakantieId, doelVan(p), p.naam)) return meldAlleen(s, `Staat al op de lijst van ${groepNaam(huishouden, doelVan(p), s.paklijsten)}`);
      return { ...wijzigAlles(s, { pakitems: [...s.pakitems, p] }), melding: null };
    }
    case 'pakitemWissel':
      return { ...wijzigAlles(s, { pakitems: s.pakitems.map(p => (p.id !== a.id ? p
        : p.ingepakt ? { ...p, ingepakt: false, ingepaktOp: null, ingepaktDoor: null }
          : { ...p, ingepakt: true, ingepaktOp: new Date().toISOString(), ingepaktDoor: a.door })) }), melding: null };
    case 'pakitemBijwerken': {
      const p = s.pakitems.find(x => x.id === a.id);
      if (!p) return s;
      const nieuw = { ...p, ...(a.naam !== undefined ? { naam: a.naam } : {}), ...(a.doel !== undefined ? doelVelden(a.doel) : {}) };
      const doel = doelVan(nieuw);
      if (alOpPaklijst(s.pakitems, nieuw.vakantieId, doel, nieuw.naam, p.id)) return meldAlleen(s, `Staat al op de lijst van ${groepNaam(huishouden, doel, s.paklijsten)}`);
      const tekst = a.doel !== undefined && !zelfdeDoel(a.doel, doelVan(p)) ? `${nieuw.naam} staat nu bij ${groepNaam(huishouden, doel, s.paklijsten)}` : `${nieuw.naam} aangepast`;
      return wijzigAlles(s, { pakitems: s.pakitems.map(x => (x.id === a.id ? nieuw : x)) }, tekst);
    }
    case 'pakitemVerwijderen':
      return wijzigAlles(s, { pakitems: s.pakitems.filter(p => p.id !== a.id) }, a.melding);
    case 'overnemen': {
      // Aanvullend: wat er al staat (zelfde persoon en tekst), wordt overgeslagen; overgenomen items zijn niet afgevinkt.
      // Extra lijsten (alleen bij iedereen): een lijst met dezelfde naam aanvullen, anders een nieuwe lijst.
      let paklijsten = s.paklijsten;
      const naarLijst = new Map<string, string>();
      if (a.groep === 'iedereen') {
        for (const bron of s.paklijsten.filter(l => l.vakantieId === a.van && a.lijsten?.includes(l.id))) {
          if (pakSleutel(bron.naam) === 'gezamenlijk' || huishouden.leden.some(l => pakSleutel(l.naam) === pakSleutel(bron.naam))) continue;
          let doel = paklijsten.find(l => l.vakantieId === a.naar && pakSleutel(l.naam) === pakSleutel(bron.naam));
          if (!doel) { doel = { id: nieuwId('l'), vakantieId: a.naar, naam: bron.naam }; paklijsten = [...paklijsten, doel]; }
          naarLijst.set(bron.id, doel.id);
        }
      }
      const nieuw: Pakitem[] = [];
      for (const p of s.pakitems.filter(x => x.vakantieId === a.van && (inGroep(x, a.groep) || (!!x.lijst && naarLijst.has(x.lijst))))) {
        const velden = p.lijst ? { lid: null, lijst: naarLijst.get(p.lijst)! } : { lid: p.lid, lijst: null };
        if (alOpPaklijst([...s.pakitems, ...nieuw], a.naar, doelVan(velden), p.naam)) continue;
        nieuw.push({ id: nieuwId('p'), vakantieId: a.naar, ...velden, naam: p.naam, ingepakt: false, ingepaktOp: null, ingepaktDoor: null });
      }
      if (!nieuw.length) return paklijsten === s.paklijsten ? meldAlleen(s, 'Alles stond er al') : wijzigAlles(s, { paklijsten }, 'Alles stond er al');
      return wijzigAlles(s, { pakitems: [...s.pakitems, ...nieuw], paklijsten }, `${meervoud(nieuw.length, 'item', 'items')} overgenomen`);
    }
    case 'vinkjesOpnieuw': {
      const weg = s.pakitems.filter(p => p.vakantieId === a.vakantieId && p.ingepakt && inGroep(p, a.groep));
      if (!weg.length) return meldAlleen(s, 'Er stond nog niets afgevinkt');
      const ids = new Set(weg.map(p => p.id));
      return wijzigAlles(s, { pakitems: s.pakitems.map(p => (ids.has(p.id) ? { ...p, ingepakt: false, ingepaktOp: null, ingepaktDoor: null } : p)) },
        `${meervoud(weg.length, 'vinkje', 'vinkjes')} weggehaald`);
    }
    case 'ontkoppelen':
      return wijzigAlles(s, { koppelingen: s.koppelingen.filter(k => k.id !== a.koppelingId) }, a.melding);
    // ---- Plannen (besluit 18): de taken zijn gewone items; "Ongedaan maken" zet plan en taken samen terug. ----
    case 'planToevoegen':
      return wijzigAlles(s, { plannen: [...s.plannen, a.plan] }, a.melding);
    case 'planBijwerken':
      return wijzigAlles(s, { plannen: s.plannen.map(p => (p.id === a.plan.id ? a.plan : p)) }, a.melding);
    case 'planVerwijderen': {
      const hoortErbij = (i: Item) => i.soort === 'taak' && i.planId === a.id;
      const items = a.metTaken ? s.items.filter(i => !hoortErbij(i))
        : s.items.map(i => (hoortErbij(i) ? { ...i, planId: null, onderdeelId: null } as Taak : i));
      const koppelingen = zonderPlan(s.planKoppelingen, a.id);
      return wijzigAlles(s, {
        items, plannen: s.plannen.filter(p => p.id !== a.id), onderdelen: s.onderdelen.filter(o => o.planId !== a.id),
        planKoppelingen: a.metTaken ? zonderTaken(koppelingen, s.items.filter(hoortErbij).map(i => i.id)) : koppelingen,
      }, a.melding);
    }
    case 'onderdeelToevoegen': {
      const volgorde = Math.max(0, ...s.onderdelen.filter(o => o.planId === a.onderdeel.planId).map(o => o.volgorde)) + 1;
      return wijzigAlles(s, { onderdelen: [...s.onderdelen, { ...a.onderdeel, volgorde }] }, a.melding);
    }
    case 'onderdeelHernoemen':
      return wijzigAlles(s, { onderdelen: s.onderdelen.map(o => (o.id === a.id ? { ...o, naam: a.naam } : o)) }, a.melding);
    case 'onderdeelVerplaatsen': {
      const o = s.onderdelen.find(x => x.id === a.id);
      if (!o) return s;
      const rij = s.onderdelen.filter(x => x.planId === o.planId).sort((x, y) => x.volgorde - y.volgorde);
      const buur = rij[rij.findIndex(x => x.id === a.id) + a.richting];
      if (!buur) return s;
      return { ...wijzigAlles(s, { onderdelen: s.onderdelen.map(x => (x.id === o.id ? { ...x, volgorde: buur.volgorde } : x.id === buur.id ? { ...x, volgorde: o.volgorde } : x)) }), melding: null };
    }
    case 'onderdeelVerwijderen':
      // De taken blijven in het plan, zonder onderdeel.
      return wijzigAlles(s, {
        onderdelen: s.onderdelen.filter(o => o.id !== a.id),
        items: s.items.map(i => (i.soort === 'taak' && i.onderdeelId === a.id ? { ...i, onderdeelId: null } : i)),
      }, a.melding);
    // ---- Extra inpaklijsten (§20) ----
    case 'paklijstToevoegen': {
      const fout = paklijstNaamFout(a.lijst.naam, huishouden, s.paklijsten, a.lijst.vakantieId);
      if (fout) return meldAlleen(s, fout);
      return { ...wijzigAlles(s, { paklijsten: [...s.paklijsten, a.lijst] }), melding: null };
    }
    case 'paklijstHernoemen': {
      const l = s.paklijsten.find(x => x.id === a.id);
      if (!l || l.naam === a.naam) return s;
      const fout = paklijstNaamFout(a.naam, huishouden, s.paklijsten, l.vakantieId, l.id);
      if (fout) return meldAlleen(s, fout);
      return wijzigAlles(s, { paklijsten: s.paklijsten.map(x => (x.id === a.id ? { ...x, naam: a.naam } : x)) }, `Lijst heet nu ${a.naam}`);
    }
    case 'paklijstVerwijderen':
      // De lijst en haar items samen; "Ongedaan maken" zet beide terug.
      return wijzigAlles(s, { paklijsten: s.paklijsten.filter(l => l.id !== a.id), pakitems: s.pakitems.filter(p => p.lijst !== a.id) }, a.melding);
  }
}

/** Een taak van een afgerond plan weer openzetten: dan is het plan niet meer af. */
function heropendPlan(s: Staat, taakId: string, items: Item[]): Plan[] {
  const oud = s.items.find((i): i is Taak => i.id === taakId && i.soort === 'taak');
  const nieuw = items.find((i): i is Taak => i.id === taakId && i.soort === 'taak');
  if (!oud?.klaar || nieuw?.klaar || !nieuw?.planId) return s.plannen;
  return s.plannen.map(p => (p.id === nieuw.planId && p.afgerondOp ? { ...p, afgerondOp: null } : p));
}

/** Een taak uit een formulier zonder vakantie-, plan-, onderdeel- of Bezig-veld houdt die (het veld ontbreekt = niet gewijzigd). */
function behoudKoppeling(oud: Item, nieuw: Item): Item {
  if (oud.soort === 'taak' && nieuw.soort === 'taak') {
    return {
      ...nieuw,
      ...(nieuw.vakantieId === undefined && oud.vakantieId !== undefined ? { vakantieId: oud.vakantieId } : {}),
      ...(nieuw.planId === undefined && oud.planId !== undefined ? { planId: oud.planId } : {}),
      ...(nieuw.onderdeelId === undefined && oud.onderdeelId !== undefined ? { onderdeelId: oud.onderdeelId } : {}),
      ...(nieuw.bezig === undefined && oud.bezig !== undefined ? { bezig: oud.bezig } : {}),
      ...(nieuw.spulId === undefined && oud.spulId !== undefined ? { spulId: oud.spulId } : {}),
      ...(nieuw.ookVoor === undefined && oud.ookVoor !== undefined ? { ookVoor: oud.ookVoor } : {}),
    };
  }
  // Een boodschap aanpassen (naam) laat "Later nodig" staan.
  if (oud.soort === 'boodschap' && nieuw.soort === 'boodschap' && nieuw.later === undefined && oud.later) {
    return { ...nieuw, later: true };
  }
  return nieuw;
}

export function beginStaat(vandaag: Datum, scenario: Scenario = 'gewoon'): Staat {
  // Zoals een server het zou teruggeven: privé-afspraken van anderen zonder details.
  const v = demoVakanties(vandaag);
  const pl = demoPlannen(vandaag, scenario);
  return {
    scenario, items: zichtbaarVoor([...demoItems(vandaag, scenario), ...v.items, ...pl.items], huishouden.ik),
    plannen: pl.plannen, onderdelen: pl.onderdelen, planKoppelingen: [],
    vakanties: v.vakanties, pakitems: v.pakitems, paklijsten: v.paklijsten, koppelingen: v.koppelingen,
    weggeklikt: new Set(), vorige: null, melding: null,
  };
}

let teller = 0;
export const nieuwId = (prefix: string) => `${prefix}-nieuw-${Date.now().toString(36)}-${++teller}`;

export function useDemoStaat(vandaag: Datum) {
  const [staat, dispatch] = useReducer(reducer, undefined, () => beginStaat(vandaag));
  // Hetzelfde contract als online (acties.ts), plus alleen de demo-extra's. Een handeling buiten het contract is een
  // typefout: geen verborgen demo-pad.
  const acties = useMemo((): Acties & Omit<DemoExtra, 'scenario'> & { ongedaan: () => void } => ({
    toevoegen: (items: Item[], melding?: string) => dispatch({ type: 'toevoegen', items, melding }),
    vervangAlles: (items: Item[], melding?: string) => dispatch({ type: 'vervangAlles', items, melding }),
    bijwerken: (item: Item, melding?: string) => dispatch({ type: 'bijwerken', item, melding }),
    wissel: (id: string, melding?: string) => dispatch({ type: 'wissel', id, vandaag, melding }),
    verwijder: (ids: string[], melding?: string) => dispatch({ type: 'verwijder', ids, melding }),
    // Expliciete handelingen (in plaats van "vervang alles"): zo kan de lokale Supabase-modus precies
    // dezelfde handeling op de server uitvoeren (zie lokaal/staat.ts).
    voegBoodschappenToe: (namen: string[], vakantieId?: string, later?: boolean) => dispatch({ type: 'boodschappen', namen, vakantieId, later }),
    /** Tussen "Nu te kopen" en "Later nodig"; dezelfde boodschap, met ongedaan maken. */
    boodschapLater: (b: Boodschap, later: boolean) =>
      dispatch({ type: 'boodschapLater', id: b.id, later, melding: later ? `${b.naam} bij Later nodig` : `${b.naam} nu te kopen` }),
    wijzigVoorkomen: (reeksId: string, datum: Datum, afspraak: Afspraak, melding?: string) =>
      dispatch({ type: 'voorkomenWijzigen', reeksId, datum, afspraak, melding }),
    verwijderVoorkomen: (reeksId: string, datum: Datum, melding?: string) =>
      dispatch({ type: 'voorkomenVerwijderen', reeksId, datum, melding }),
    verwijderReeks: (reeksId: string, melding?: string) => dispatch({ type: 'reeksVerwijderen', reeksId, melding }),
    ongedaan: () => dispatch({ type: 'ongedaan' }),
    wegklikken: (id: string) => dispatch({ type: 'wegklikken', id }),
    meld: (tekst: string) => dispatch({ type: 'meld', tekst }),
    meldingWeg: (id: number) => dispatch({ type: 'meldingWeg', id }),
    kiesScenario: (scenario: Scenario, melding: string) => dispatch({ type: 'scenario', scenario, vandaag, melding }),

    // ---- Vakanties (dezelfde handelingen als de sync-module, zie lokaal/staat.ts) ----
    /** Geeft het id van de nieuwe vakantie (om haar meteen te openen). */
    vakantieToevoegen: async (v: Omit<Vakantie, 'id'>): Promise<string | null> => {
      const id = nieuwId('v');
      dispatch({ type: 'vakantieToevoegen', vakantie: { ...v, id }, melding: `${v.naam} toegevoegd` });
      return id;
    },
    vakantieBijwerken: (v: Vakantie, melding?: string) => dispatch({ type: 'vakantieBijwerken', vakantie: v, melding }),
    vakantieVerwijderen: (v: Vakantie) => dispatch({ type: 'vakantieVerwijderen', id: v.id, melding: `${v.naam} verwijderd` }),
    pakitemToevoegen: (vakantieId: string, doel: PakDoel, naam: string) => dispatch({ type: 'pakitemToevoegen',
      item: { id: nieuwId('p'), vakantieId, ...doelVelden(doel), naam: naam.trim().replace(/\s+/g, ' '), ingepakt: false, ingepaktOp: null, ingepaktDoor: null } }),
    pakitemWissel: (p: Pakitem) => dispatch({ type: 'pakitemWissel', id: p.id, door: huishouden.ik }),
    pakitemBijwerken: (p: Pakitem, wijziging: { naam?: string; doel?: PakDoel }) => dispatch({ type: 'pakitemBijwerken', id: p.id,
      naam: wijziging.naam !== undefined ? wijziging.naam.trim().replace(/\s+/g, ' ') : undefined, doel: wijziging.doel }),
    pakitemVerwijderen: (p: Pakitem) => dispatch({ type: 'pakitemVerwijderen', id: p.id, melding: `${p.naam} verwijderd` }),
    /** lijsten: extra lijsten van de bron die mee moeten (alleen bij iedereen). */
    paklijstOvernemen: (van: string, naar: string, groep: Groep, lijsten?: string[]) => dispatch({ type: 'overnemen', van, naar, groep, lijsten }),
    /** Geeft het id van de nieuwe lijst (om haar meteen te kiezen). Een naam die niet kan, geeft een melding (en geen lijst). */
    paklijstToevoegen: async (vakantieId: string, naam: string): Promise<string | null> => {
      const id = nieuwId('l');
      dispatch({ type: 'paklijstToevoegen', lijst: { id, vakantieId, naam: naam.trim().replace(/\s+/g, ' ') } });
      return id;
    },
    paklijstHernoemen: (l: Paklijst, naam: string) => dispatch({ type: 'paklijstHernoemen', id: l.id, naam: naam.trim().replace(/\s+/g, ' ') }),
    paklijstVerwijderen: (l: Paklijst) => dispatch({ type: 'paklijstVerwijderen', id: l.id, melding: `${l.naam} verwijderd` }),
    vinkjesOpnieuw: (vakantieId: string, groep: Groep) => dispatch({ type: 'vinkjesOpnieuw', vakantieId, groep }),
    boodschapOntkoppelen: (k: VakantieKoppeling, naam: string) => dispatch({ type: 'ontkoppelen', koppelingId: k.id, melding: `${naam} niet meer voor deze vakantie` }),
    // ---- Plannen (besluit 18): alleen in de demo ----
    /** Geeft het id van het nieuwe plan (om het meteen te openen). */
    planToevoegen: async (p: Omit<Plan, 'id'>): Promise<string | null> => {
      const id = nieuwId('plan');
      dispatch({ type: 'planToevoegen', plan: { ...p, id }, melding: `${p.titel} toegevoegd` });
      return id;
    },
    planBijwerken: (p: Plan, melding?: string): void => dispatch({ type: 'planBijwerken', plan: p, melding }),
    planVerwijderen: (p: Plan, metTaken: boolean): void => dispatch({ type: 'planVerwijderen', id: p.id, metTaken, melding: `${p.titel} verwijderd` }),
    /** Geeft het id van het nieuwe onderdeel (om het meteen open te zetten). */
    onderdeelToevoegen: async (planId: string, naam: string): Promise<string | null> => {
      const id = nieuwId('ond');
      dispatch({ type: 'onderdeelToevoegen', onderdeel: { id, planId, naam }, melding: `${naam} toegevoegd` });
      return id;
    },
    onderdeelHernoemen: (o: PlanOnderdeel, naam: string): void => dispatch({ type: 'onderdeelHernoemen', id: o.id, naam, melding: `Onderdeel heet nu ${naam}` }),
    onderdeelVerplaatsen: (o: PlanOnderdeel, richting: -1 | 1): void => dispatch({ type: 'onderdeelVerplaatsen', id: o.id, richting }),
    onderdeelVerwijderen: (o: PlanOnderdeel): void => dispatch({ type: 'onderdeelVerwijderen', id: o.id, melding: `${o.naam} verwijderd` }),
    /** Een afgelopen vakantie tonen (lokaal: haar paklijst ophalen). In de demo staat alles al klaar. */
    vakantieOpenen: (_id: string): Promise<void> => Promise.resolve(),
    vakantieSluiten: (_id: string) => {},
  }), [vandaag]);
  return { staat, ...acties };
}

/** Alles wat de demo levert behalve de staat: het contract plus de demo-extra's (kiesScenario, vervangAlles). */
export type DemoActies = Omit<ReturnType<typeof useDemoStaat>, 'staat'>;
