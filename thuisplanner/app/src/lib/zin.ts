// Toevoegen in één zin (B1): wat bedoelt de gebruiker? Een pure functie zonder netwerk, zonder AI en zonder klok
// (alles rekent vanaf ctx.vandaag). Zie docs/thuisplanner-snelinvoer.md §4 (de regels) en §5 (besluiten V1 tot en met V6).
//
// Uitgangspunt: niets onzichtbaar aannemen. Alles wat herkend is, komt als onderdeel terug (het scherm toont het als knop);
// wat niet herkend is, blijft in de titel. Twijfel wordt een korte, zichtbare melding, geen stille keuze. Een onderdeel dat
// de gebruiker terugzet ("negeer"), blijft gewoon in de titel staan.
import { splitsBoodschappen } from './boodschappen';
import { isProduct } from './categorie';
import { maandagVan, plusDagen, vanDatum, isGeldigeDatum, naarDatum } from './datum';
import type { Datum, Frequentie, Lid, LidId, Tijd } from './types';

export type Soort = 'afspraak' | 'taak' | 'boodschap';
/** Wat er in een zin herkend kan worden; elk onderdeel kan de gebruiker terugzetten in de titel. */
export type Onderdeel = 'datum' | 'tijd' | 'wie' | 'plek' | 'herhaling' | 'prive' | 'soortwoord' | 'vakantie';

export interface Context {
  vandaag: Datum;
  leden: Lid[];
  /** Namen die al op de boodschappenlijst staan (ook afgevinkt): zo'n hele zin is een boodschap. */
  bekendeBoodschappen?: string[];
  /** Waar de + vandaan komt: een dag in de Agenda, of Boodschappen. */
  standaard?: { soort?: Soort; datum?: Datum };
  /** Vakanties die je kunt kiezen (lopend en komend; zie kiesbareVakanties). Alleen "voor <volledige naam>" telt. */
  vakanties?: { id: string; naam: string }[];
}

export interface Opties {
  /** Door de gebruiker gekozen soort (wint van alles). */
  soort?: Soort;
  /** Onderdelen die de gebruiker terugzette in de titel. */
  negeer?: ReadonlySet<Onderdeel>;
}

export interface Melding {
  soort: 'middag' | 'tijd-of-datum' | 'herhalende-taak' | 'boodschap-dag' | 'prive-geen-afspraak' | 'taak-meer-personen'
    | 'plek-geen-afspraak' | 'geen-titel' | 'onbekende-naam' | 'vakantie-afspraak' | 'vakantie-twijfel' | 'onbekende-vakantie';
  tekst: string;
}

export interface Voorstel {
  soort: Soort;
  /** Titel zoals hij bewaard wordt (met hoofdletter). Bij een boodschap: de namen staan in `boodschappen`. */
  titel: string;
  /** Null: geen datum (een taak "ooit", of een boodschap). */
  datum: Datum | null;
  start?: Tijd;
  eind?: Tijd;
  wie: LidId[];
  plek?: string;
  herhaling?: { freq: Frequentie; tot: Datum | null };
  prive: boolean;
  /** Alleen bij een boodschap: de losse boodschappen. */
  boodschappen: string[];
  /** Wat in de zin herkend is (voor de knoppen en het terugzetten). */
  herkend: Onderdeel[];
  /** Wat niet uit de zin komt maar is aangenomen: zichtbaar anders getoond. */
  aangenomen: ('soort' | 'datum')[];
  meldingen: Melding[];
  /** Een woord na "met" of "voor" dat bijna een lid is ("Lyn" bij Lynn): alleen een voorstel, nooit vanzelf. */
  suggesties: { woord: string; lid: LidId; naam: string }[];
  /** De herkende vakantie (alleen bij een taak of boodschap). */
  vakantie: string | null;
  /** Meer vakanties met dezelfde naam: niets vanzelf koppelen; de gebruiker kiest (of zet het terug in de titel). */
  vakantieKeuze: string[];
  /** Een woord na "voor" dat bijna een vakantienaam is: alleen een voorstel, nooit vanzelf. */
  vakantieSuggestie?: { woord: string; naam: string };
}

const WEEKDAGEN: Record<string, number> = {
  zondag: 0, maandag: 1, dinsdag: 2, woensdag: 3, donderdag: 4, vrijdag: 5, zaterdag: 6,
  // Afkortingen; "ma" en "zo" bewust niet (gewone woorden: "zo snel", "ma" als moeder).
  di: 2, wo: 3, do: 4, vr: 5, za: 6,
};
const MAANDEN: Record<string, number> = {
  januari: 1, jan: 1, februari: 2, feb: 2, maart: 3, mrt: 3, april: 4, apr: 4, mei: 5, juni: 6, jun: 6, juli: 7, jul: 7,
  augustus: 8, aug: 8, september: 9, sep: 9, sept: 9, oktober: 10, okt: 10, november: 11, nov: 11, december: 12, dec: 12,
};
const FREQ: Record<string, Frequentie> = { dag: 'dagelijks', week: 'wekelijks', maand: 'maandelijks', jaar: 'jaarlijks' };
const FREQ_WOORD: Record<string, Frequentie> = { dagelijks: 'dagelijks', wekelijks: 'wekelijks', maandelijks: 'maandelijks', jaarlijks: 'jaarlijks' };
const VANDAAG_WOORDEN = new Set(['vandaag', 'vanochtend', 'vanmorgen', 'vanmiddag', 'vanavond', 'vannacht']);
const MORGEN_WOORDEN = new Set(['morgen', 'morgenochtend', 'morgenvroeg', 'morgenmiddag', 'morgenavond']);
const BOODSCHAP_WOORDEN = new Set(['boodschap', 'boodschappen', 'kopen', 'halen']);
const IEDEREEN = new Set(['iedereen', 'allemaal']);
/** Woorden die aan het begin of eind van een titel niets betekenen als het herkende stuk eromheen weg is. */
const LOS = new Set(['om', 'op', 'met', 'voor', 'en', 'van', 'tot', 'de', 'het', 'in', 'bij', 'aan']);

interface Token { ruw: string; w: string; gebruikt: boolean }

const zonderAccent = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
const norm = (s: string) => zonderAccent(s.toLowerCase()).replace(/^[("'“‘]+/, '').replace(/[,.;:!?)"'”’]+$/, '');
const twee = (n: number) => String(n).padStart(2, '0');

function afstand(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  }
  return d[a.length][b.length];
}

/** Eerstvolgende weekdag na vandaag (vandaag telt niet mee). */
function volgende(vandaag: Datum, dag: number): Datum {
  const nu = vanDatum(vandaag).getDay();
  return plusDagen(vandaag, ((dag - nu + 7) % 7) || 7);
}

/** Een dag en maand; ligt hij (zonder jaar) in het verleden, dan volgend jaar. */
function maakDatum(vandaag: Datum, d: number, m: number, j?: number): Datum | null {
  const jaar = j ?? Number(vandaag.slice(0, 4));
  let s = `${jaar}-${twee(m)}-${twee(d)}`;
  if (!isGeldigeDatum(s)) {
    if (j !== undefined) return null;
    // 29 februari in een gewoon jaar: het eerstvolgende schrikkeljaar.
    for (let k = 1; k <= 4 && !isGeldigeDatum(s); k++) s = `${jaar + k}-${twee(m)}-${twee(d)}`;
    return isGeldigeDatum(s) ? s : null;
  }
  if (j === undefined && s < vandaag) {
    const verder = `${jaar + 1}-${twee(m)}-${twee(d)}`;
    return isGeldigeDatum(verder) ? verder : maakDatum(vandaag, d, m, jaar + 4 - ((jaar + 1) % 4));
  }
  return s;
}

/** Een tijd als "16", "16:00", "16.30", "16u", "16uur", "9.30u". Geeft uren en minuten, of null. */
function leesTijd(w: string, kaal: boolean): { u: number; m: number; nul: boolean; minuten: boolean } | null {
  const t = w.replace(/u(ur)?$/, '');
  const r = /^(\d{1,2})(?:[:.](\d{2}))?$/.exec(t);
  if (!r) return null;
  if (!kaal && !r[2] && t === w) return null;   // een los getal is geen tijd (zonder "om", "van" of "u")
  const u = Number(r[1]), m = r[2] ? Number(r[2]) : 0;
  if (u > 23 || m > 59) return null;
  return { u, m, nul: r[1].length === 2 && r[1].startsWith('0'), minuten: !!r[2] };
}
const alsTijd = (u: number, m: number) => `${twee(u)}:${twee(m)}`;

export function begrijp(tekst: string, ctx: Context, opties: Opties = {}): Voorstel {
  const negeer = opties.negeer ?? new Set<Onderdeel>();
  const tokens: Token[] = tekst.trim().split(/\s+/).filter(Boolean).map(ruw => ({ ruw, w: norm(ruw), gebruikt: false }));
  const meldingen: Melding[] = [];
  const herkend = new Set<Onderdeel>();
  const meld = (m: Melding) => { if (!meldingen.some(x => x.soort === m.soort)) meldingen.push(m); };
  const neem = (...i: number[]) => { for (const k of i) tokens[k].gebruikt = true; };
  const vrij = (i: number) => i >= 0 && i < tokens.length && !tokens[i].gebruikt;
  const w = (i: number) => (i >= 0 && i < tokens.length ? tokens[i].w : '');

  let datum: Datum | null = null;
  let start: Tijd | undefined, eind: Tijd | undefined;
  let prive = false;
  let herhaling: Voorstel['herhaling'];
  const wie: LidId[] = [];
  let iedereen = false;
  let plek: string | undefined;
  let plekVanaf = -1;
  let soortwoord = false;

  // Een datum op positie i (een of meer woorden); geeft het aantal gebruikte woorden of 0.
  function datumOp(i: number): { d: Datum; n: number } | null {
    const a = w(i), b = w(i + 1);
    if (VANDAAG_WOORDEN.has(a)) return { d: ctx.vandaag, n: 1 };
    if (MORGEN_WOORDEN.has(a)) return { d: plusDagen(ctx.vandaag, 1), n: 1 };
    if (a === 'overmorgen') return { d: plusDagen(ctx.vandaag, 2), n: 1 };
    if ((a === 'aanstaande' || a === 'as' || a === 'a.s') && b in WEEKDAGEN) return { d: volgende(ctx.vandaag, WEEKDAGEN[b]), n: 2 };
    if (a === 'volgende' && b === 'week' && w(i + 2) in WEEKDAGEN) {
      const dag = WEEKDAGEN[w(i + 2)];
      return { d: plusDagen(maandagVan(ctx.vandaag), 7 + ((dag + 6) % 7)), n: 3 };
    }
    if (a in WEEKDAGEN) return { d: volgende(ctx.vandaag, WEEKDAGEN[a]), n: 1 };
    const dm = /^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{4}))?$/.exec(a);
    if (dm) { const d = maakDatum(ctx.vandaag, +dm[1], +dm[2], dm[3] ? +dm[3] : undefined); if (d) return { d, n: 1 }; }
    if (/^\d{1,2}$/.test(a) && b in MAANDEN) {
      const jaar = /^\d{4}$/.test(w(i + 2)) ? +w(i + 2) : undefined;
      const d = maakDatum(ctx.vandaag, +a, MAANDEN[b], jaar);
      if (d) return { d, n: jaar ? 3 : 2 };
    }
    return null;
  }

  // 0. Vakantie: alleen "voor" gevolgd door de volledige naam van een lopende of komende vakantie (langste naam eerst),
  // vóór datum, plek en het splitsen: zo wordt "Kerst op Texel" geen datum of plek en komt de naam niet in de titel.
  // Een eenwoordsnaam die ook een lid is, laat het lid winnen. Twee vakanties met dezelfde naam: niets vanzelf koppelen.
  let vakantie: string | null = null;
  let vakantieKeuze: string[] = [];
  let vakIdx: number[] = [];
  let vakantieSuggestie: Voorstel['vakantieSuggestie'];
  if (!negeer.has('vakantie') && ctx.vakanties?.length) {
    const lidNamen = new Set(ctx.leden.map(l => zonderAccent(l.naam.toLowerCase())));
    const namen = ctx.vakanties.map(v => ({ v, d: v.naam.trim().split(/\s+/).map(norm).filter(Boolean) }))
      .filter(x => x.d.length && !(x.d.length === 1 && lidNamen.has(x.d[0])));
    for (let i = 0; i < tokens.length - 1 && !vakIdx.length; i++) {
      if (w(i) !== 'voor') continue;
      let lengte = 0, treffers: string[] = [];
      for (const { v, d } of namen) {
        if (!d.every((x, k) => w(i + 1 + k) === x)) continue;
        if (d.length > lengte) { lengte = d.length; treffers = [v.id]; } else if (d.length === lengte) treffers.push(v.id);
      }
      if (!lengte) continue;
      vakIdx = Array.from({ length: lengte + 1 }, (_, k) => i + k);
      neem(...vakIdx);
      herkend.add('vakantie');
      if (treffers.length === 1) vakantie = treffers[0];
      else {
        vakantieKeuze = treffers;
        const naam = ctx.vakanties.find(v => v.id === treffers[0])!.naam;
        meld({ soort: 'vakantie-twijfel', tekst: `Er zijn meer vakanties met de naam "${naam}": kies welke.` });
      }
    }
    // Bijna een vakantienaam (één letter anders), direct na "voor": alleen een voorstel.
    if (!vakIdx.length) {
      for (let i = 1; i < tokens.length && !vakantieSuggestie; i++) {
        if (w(i - 1) !== 'voor' || w(i).length < 4 || lidNamen.has(w(i))) continue;
        const bijna = namen.find(x => x.d.length === 1 && x.d[0].length >= 4 && afstand(x.d[0], w(i)) === 1);
        if (!bijna) continue;
        vakantieSuggestie = { woord: tokens[i].ruw.replace(/[,.;:!?]+$/, ''), naam: bijna.v.naam };
        meld({ soort: 'onbekende-vakantie', tekst: `"${vakantieSuggestie.woord}" is geen vakantie; het blijft in de titel.` });
      }
    }
  }

  // 1. Privé.
  if (!negeer.has('prive')) {
    tokens.forEach((t, i) => { if (t.w === 'prive') { prive = true; neem(i); herkend.add('prive'); } });
  }

  // 2. Herhaling (met eventueel "tot <datum>").
  if (!negeer.has('herhaling')) {
    for (let i = 0; i < tokens.length && !herhaling; i++) {
      if (!vrij(i)) continue;
      let freq: Frequentie | undefined, n = 0, dag: number | undefined;
      if ((w(i) === 'elke' || w(i) === 'iedere' || w(i) === 'elk' || w(i) === 'ieder') && vrij(i + 1)) {
        if (w(i + 1) in FREQ) { freq = FREQ[w(i + 1)]; n = 2; }
        else if (w(i + 1) in WEEKDAGEN && w(i + 1).length > 2) { freq = 'wekelijks'; dag = WEEKDAGEN[w(i + 1)]; n = 2; }
      } else if (w(i) in FREQ_WOORD) { freq = FREQ_WOORD[w(i)]; n = 1; }
      if (!freq) continue;
      for (let k = 0; k < n; k++) neem(i + k);
      herhaling = { freq, tot: null };
      herkend.add('herhaling');
      if (dag !== undefined && !negeer.has('datum')) { datum = volgende(ctx.vandaag, dag); herkend.add('datum'); }
    }
  }

  // 3. Tijd (vóór de datum: "9-10" is een tijd, "18-10" een datum).
  const middag = (t: { u: number; m: number; nul: boolean; minuten: boolean }) => {
    // Besluit V2: 1 tot en met 6 uur wordt middag; zichtbaar gemeld.
    if (t.u >= 1 && t.u <= 6 && !t.nul) { meld({ soort: 'middag', tekst: `"${t.u}${t.minuten ? ':' + twee(t.m) : ''} uur" gelezen als ${alsTijd(t.u + 12, t.m)}.` }); return { ...t, u: t.u + 12 }; }
    return t;
  };
  if (!negeer.has('tijd')) {
    for (let i = 0; i < tokens.length && !start; i++) {
      if (!vrij(i)) continue;
      // "van 9 tot 10"
      if (w(i) === 'van' && vrij(i + 1) && w(i + 2) === 'tot' && vrij(i + 3)) {
        const a = leesTijd(w(i + 1), true), b = leesTijd(w(i + 3), true);
        if (a && b) {
          const a2 = middag(a); let b2 = b;
          if (b2.u * 60 + b2.m <= a2.u * 60 + a2.m && b2.u + 12 <= 23) b2 = { ...b2, u: b2.u + 12 };
          start = alsTijd(a2.u, a2.m); eind = alsTijd(b2.u, b2.m); neem(i, i + 1, i + 2, i + 3); break;
        }
      }
      // "9-10" of "9:30-11"
      const reeks = /^(\d{1,2}(?:[:.]\d{2})?)-(\d{1,2}(?:[:.]\d{2})?)$/.exec(w(i));
      if (reeks) {
        const a = leesTijd(reeks[1], true), b = leesTijd(reeks[2], true);
        if (a && b && a.u * 60 + a.m < b.u * 60 + b.m) {
          const a2 = middag(a); let b2 = b;
          if (b2.u * 60 + b2.m <= a2.u * 60 + a2.m && b2.u + 12 <= 23) b2 = { ...b2, u: b2.u + 12 };
          start = alsTijd(a2.u, a2.m); eind = alsTijd(b2.u, b2.m); neem(i);
          const dm = /^(\d{1,2})-(\d{1,2})$/.exec(w(i));
          if (dm && +dm[2] <= 12 && +dm[1] <= 31) meld({ soort: 'tijd-of-datum', tekst: `"${tokens[i].ruw}" gelezen als tijd (${start}–${eind}), niet als datum.` });
          break;
        }
      }
      // "om 16", "om 16:00 uur"
      if (w(i) === 'om' && vrij(i + 1)) {
        const t = leesTijd(w(i + 1), true);
        if (t) { const t2 = middag(t); start = alsTijd(t2.u, t2.m); neem(i, i + 1); if (w(i + 2) === 'uur') neem(i + 2); break; }
      }
      // "16:00", "16.00", "16u"
      const t = leesTijd(w(i), false);
      if (t) { const t2 = middag(t); start = alsTijd(t2.u, t2.m); neem(i); if (w(i + 1) === 'uur') neem(i + 1); break; }
    }
    if (start) herkend.add('tijd');
  }

  // 3b. "tot <datum>" na een herhaling (ergens in de zin): de laatste keer.
  if (herhaling) {
    for (let i = 0; i < tokens.length; i++) {
      if (!vrij(i) || w(i) !== 'tot') continue;
      const d = datumOp(i + 1);
      if (!d) continue;
      herhaling.tot = d.d; neem(i); for (let k = 0; k < d.n; k++) neem(i + 1 + k);
      break;
    }
  }

  // 4. Datum.
  if (!negeer.has('datum') && !datum) {
    for (let i = 0; i < tokens.length; i++) {
      if (!vrij(i)) continue;
      const d = datumOp(i);
      if (!d) continue;
      let vrijAlles = true;
      for (let k = 0; k < d.n; k++) if (!vrij(i + k)) vrijAlles = false;
      if (!vrijAlles) continue;
      datum = d.d; for (let k = 0; k < d.n; k++) neem(i + k);
      if (i > 0 && vrij(i - 1) && w(i - 1) === 'op') neem(i - 1);   // "op 18 oktober"
      herkend.add('datum');
      break;
    }
  }

  // 5. Personen: alleen de precieze naam van een lid (hele woorden; hoofdletters en accenten maken niet uit).
  const leden = ctx.leden.map(l => ({ l, k: zonderAccent(l.naam.toLowerCase()) }));
  const suggesties: Voorstel['suggesties'] = [];
  if (!negeer.has('wie')) {
    for (let i = 0; i < tokens.length; i++) {
      if (!vrij(i)) continue;
      if (IEDEREEN.has(w(i))) { iedereen = true; neem(i); if (vrij(i - 1) && w(i - 1) === 'met') neem(i - 1); continue; }
      if (w(i) === "z'n" && w(i + 1) === 'allen') { iedereen = true; neem(i, i + 1); if (vrij(i - 1) && w(i - 1) === 'met') neem(i - 1); continue; }
      const lid = leden.find(x => x.k === w(i));
      if (lid) {
        if (!wie.includes(lid.l.id)) wie.push(lid.l.id);
        neem(i);
        if (vrij(i - 1) && (w(i - 1) === 'met' || w(i - 1) === 'voor' || (w(i - 1) === 'en' && i >= 2 && tokens[i - 2].gebruikt))) neem(i - 1);
        continue;
      }
      // Bijna een lid, na "met" of "voor": alleen een voorstel.
      if ((w(i - 1) === 'met' || w(i - 1) === 'voor') && w(i).length >= 3) {
        const bijna = leden.find(x => x.k.length >= 3 && afstand(x.k, w(i)) === 1);
        if (bijna && !suggesties.some(s => s.lid === bijna.l.id)) {
          suggesties.push({ woord: tokens[i].ruw.replace(/[,.;:!?]+$/, ''), lid: bijna.l.id, naam: bijna.l.naam });
          meld({ soort: 'onbekende-naam', tekst: `"${tokens[i].ruw.replace(/[,.;:!?]+$/, '')}" is geen lid van het huishouden; het blijft in de titel.` });
        }
      }
    }
    if (wie.length || iedereen) herkend.add('wie');
  }

  // 6. Plek: "in ..." of "bij ..." aan het eind van de zin, als daarna niets herkends meer komt.
  if (!negeer.has('plek')) {
    for (let i = 1; i < tokens.length - 1; i++) {
      if (!vrij(i) || (w(i) !== 'in' && w(i) !== 'bij')) continue;
      let alleenVrij = true;
      for (let k = i + 1; k < tokens.length; k++) if (!vrij(k)) alleenVrij = false;
      if (!alleenVrij) continue;
      plekVanaf = i;
      plek = tokens.slice(i + 1).map(t => t.ruw).join(' ').replace(/[,.;:!?]+$/, '');
      break;
    }
  }

  // 7. Woorden die zeggen dat het een boodschap is.
  const heeftLid = wie.length > 0;
  const soortwoordIdx: number[] = [];
  if (!negeer.has('soortwoord')) {
    tokens.forEach((t, i) => {
      if (!vrij(i)) return;
      if (BOODSCHAP_WOORDEN.has(t.w) || (t.w === 'boodschappen' && t.ruw.endsWith(':'))) soortwoordIdx.push(i);
      if (t.w === 'op' && w(i + 1) === 'de' && w(i + 2) === 'lijst') soortwoordIdx.push(i, i + 1, i + 2);
    });
    // "Lotte halen" is geen boodschap: met een lid erbij telt het woord niet.
    soortwoord = soortwoordIdx.length > 0 && !heeftLid;
  }

  // Wat overblijft, is de titel.
  const titelVan = (uitgezonderd: Set<number>) => {
    const weg = (i: number) => tokens[i].gebruikt || uitgezonderd.has(i);
    const idx = tokens.map((_, i) => i).filter(i => !weg(i));
    // Een los woord ("om", "met", ...) aan de rand valt alleen weg als het aan een herkend stuk vastzat: "met Lyn" blijft.
    while (idx.length && LOS.has(tokens[idx[0]].w) && (idx.length === 1 || weg(idx[0] + 1))) idx.shift();
    while (idx.length && LOS.has(tokens[idx[idx.length - 1]].w) && (idx[idx.length - 1] === tokens.length - 1 || weg(idx[idx.length - 1] + 1) || weg(idx[idx.length - 1] - 1))) idx.pop();
    const delen = idx.map(i => tokens[i].ruw);
    const s = delen.join(' ').replace(/\s+([,.;:!?])/g, '$1').replace(/[,;:]+$/, '').trim();
    return s.charAt(0).toUpperCase() + s.slice(1);
  };
  const metPlek = new Set<number>(plek ? tokens.map((_, i) => i).filter(i => i >= plekVanaf) : []);

  // De soort, in deze volgorde (snelinvoer §4.2): gekozen, boodschapwoord, tijd/plek/herhaling, waar je vandaan komt,
  // een bekende boodschap, anders een taak.
  const aangenomen: Voorstel['aangenomen'] = [];
  const bekend = new Set((ctx.bekendeBoodschappen ?? []).map(b => norm(b.trim())));
  let soort: Soort;
  if (opties.soort) soort = opties.soort;
  else if (soortwoord) soort = 'boodschap';
  else if (start || plek || herhaling) soort = 'afspraak';
  else if (ctx.standaard?.soort) { soort = ctx.standaard.soort; aangenomen.push('soort'); }
  else if (titelVan(new Set()) && bekend.has(norm(titelVan(new Set())))) soort = 'boodschap';
  // Elk deel is een herkend product ("melk, bananen, luiers en brood"), zonder lid erbij: boodschappen.
  else if (!heeftLid && !datum && splitsBoodschappen(titelVan(new Set())).length > 0 && splitsBoodschappen(titelVan(new Set())).every(isProduct)) soort = 'boodschap';
  else soort = 'taak';
  if (soortwoord && soort === 'boodschap') herkend.add('soortwoord');

  // Gevolgen per soort, altijd zichtbaar.
  const uit = new Set<number>(soort === 'boodschap' && soortwoord ? soortwoordIdx : []);
  if (plek && soort === 'afspraak') { herkend.add('plek'); for (const i of metPlek) uit.add(i); } else if (plek) {
    if (soort === 'taak') meld({ soort: 'plek-geen-afspraak', tekst: `"${tokens[plekVanaf].ruw} ${plek}" blijft in de titel: een plek hoort bij een afspraak.` });
    plek = undefined;
  }
  if (herhaling && soort === 'afspraak' && !start && !opties.soort && !plek) {
    meld({ soort: 'herhalende-taak', tekst: 'Herhalende taken kunnen nog niet; dit wordt een afspraak voor de hele dag.' });
  }
  if (herhaling && soort !== 'afspraak') { herhaling = undefined; herkend.delete('herhaling'); }
  if (prive && soort !== 'afspraak') { meld({ soort: 'prive-geen-afspraak', tekst: 'Privé kan alleen bij een afspraak.' }); prive = false; }
  if (soort === 'boodschap' && datum) {
    meld({ soort: 'boodschap-dag', tekst: 'Een dag bij een boodschap kan nog niet: hij komt op de lijst, zonder dag.' });
    datum = null; herkend.delete('datum');
  }
  if (soort !== 'afspraak' && start) { start = undefined; eind = undefined; herkend.delete('tijd'); }
  let wieUit = wie;
  if (soort === 'taak' && wie.length > 1) {
    // Een taak heeft één persoon: bij meer namen blijven ze in de titel.
    meld({ soort: 'taak-meer-personen', tekst: 'Een taak is voor één persoon: de namen blijven in de titel.' });
    tokens.forEach((t, i) => {
      if (vakIdx.includes(i)) return;   // "voor <vakantie>" blijft herkend
      if (leden.some(x => x.k === t.w) || ((t.w === 'met' || t.w === 'voor' || t.w === 'en') && t.gebruikt)) t.gebruikt = false;
    });
    wieUit = []; herkend.delete('wie');
  }
  if (soort === 'boodschap') { wieUit = []; herkend.delete('wie'); }
  if (soort === 'afspraak' && vakIdx.length) {
    // Een afspraak koppelen aan een vakantie kan nog niet (V2, privacy): de woorden blijven in de titel.
    for (const i of vakIdx) tokens[i].gebruikt = false;
    vakantie = null; vakantieKeuze = []; herkend.delete('vakantie');
    const zonderTwijfel = meldingen.filter(m => m.soort !== 'vakantie-twijfel');
    meldingen.splice(0, meldingen.length, ...zonderTwijfel);
    meld({ soort: 'vakantie-afspraak', tekst: 'Een afspraak koppelen aan een vakantie kan nog niet: de vakantie blijft in de titel.' });
  }
  if (soort === 'afspraak' && !datum) { datum = ctx.standaard?.datum ?? ctx.vandaag; aangenomen.push('datum'); }
  if (soort === 'taak' && !datum && ctx.standaard?.datum) { datum = ctx.standaard.datum; aangenomen.push('datum'); }

  const titel = titelVan(uit);
  const boodschappen = soort === 'boodschap' ? splitsBoodschappen(titel) : [];
  if (soort === 'boodschap' ? !boodschappen.length : !titel) meld({ soort: 'geen-titel', tekst: 'Wat wil je regelen?' });

  return {
    soort, titel, datum, start, eind, wie: wieUit, plek, herhaling, prive, boodschappen,
    herkend: [...herkend], aangenomen, meldingen, suggesties, vakantie, vakantieKeuze, vakantieSuggestie,
  };
}

/** Vandaag als ISO-datum, voor wie geen ctx heeft (alleen voor tests en de demo-klok). */
export const datumVan = naarDatum;
