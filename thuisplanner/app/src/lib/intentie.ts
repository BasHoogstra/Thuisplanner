// Wat wil iemand met een zin in de +: iets weten of iets regelen? (docs/thuisplanner-spullen-documenten.md §13)
// Een pure functie zonder netwerk, AI of klok, zoals zin.ts. Ze kijkt vóór begrijp() en laat begrijp() ongemoeid.
//
// Uitgangspunt: bij twijfel geldt de bestaande werking. Alleen sterke signalen maken een vraag ("?", een vraagwoord
// vooraan, of een opvraagwerkwoord). Een korte zoekopdracht zonder vraagteken ("factuur vaatwasser") is alleen een
// mogelijke vraag: die wordt pas een vraag als een vraagbron er echt iets bij vindt (zie lib/vraag).

/** Wat er gevraagd wordt. 'document' is laten zien of openen; 'algemeen' is een vraag zonder herkend veld. */
export type Gevraagd = 'aankoopdatum' | 'winkel' | 'prijs' | 'model' | 'merk' | 'serienummer' | 'garantie' | 'document' | 'algemeen';

/** Een vervolgactie na een antwoord. v1: alleen "herinner me N dagen, weken of maanden van tevoren". */
export interface Vervolg {
  soort: 'herinnering';
  aantal: number;
  eenheid: 'dag' | 'week' | 'maand';
  /** Het zinsdeel zoals de gebruiker het schreef. */
  tekst: string;
}

export interface Vraag {
  /** Het vraagdeel van de zin, zoals ingetypt. */
  tekst: string;
  gevraagd: Gevraagd;
  /** De woorden die het onderwerp kunnen zijn (zonder vraagwoorden), in kleine letters. */
  woorden: string[];
  /** Bij een document: welke soort ("factuur", "bon", ...), als die genoemd is. */
  documentSoort?: string;
  /** Eindigt de vraag op een vraagteken? */
  vraagteken: boolean;
  /** Hoe zeker het een vraag is: 'zeker' bij "?", een vraagwoord of een opvraagwerkwoord; 'zoek' bij een korte zoekopdracht. */
  zekerheid: 'zeker' | 'zoek';
}

export type Intentie =
  | { soort: 'actie' }
  | { soort: 'vraag'; vraag: Vraag }
  | { soort: 'vraag-en-actie'; vraag: Vraag; vervolg: Vervolg }
  /** Een duidelijk vraagsignaal, maar zonder onderwerp: één gerichte vervolgvraag. */
  | { soort: 'onduidelijk'; vraag: Vraag; vervolgvraag: string };

const VRAAGWOORDEN = new Set(['wanneer', 'welk', 'welke', 'wat', 'waar', 'hoe', 'hoeveel', 'hoelang', 'wie', 'waarom', 'hoeveelste']);
/** Twee woorden vooraan die een vraag maken ("hebben we", "is er"). */
const VRAAG_PAREN = new Set(['hebben we', 'hebben wij', 'heb ik', 'heb jij', 'is er', 'zijn er', 'staat er', 'ligt er', 'weet jij', 'weet je']);
/** Opvragen: "laat … zien", "toon", "zoek", "open", "geef me". */
const OPVRAGEN = new Set(['toon', 'zoek', 'open', 'vind']);
const DOCUMENTWOORDEN: Record<string, string> = {
  factuur: 'factuur', rekening: 'factuur', bon: 'bon', bonnetje: 'bon', kassabon: 'bon', aankoopbewijs: 'bon',
  garantiebewijs: 'garantiebewijs', handleiding: 'handleiding', gebruiksaanwijzing: 'handleiding', polis: 'polis',
  contract: 'contract', onderhoudsrapport: 'onderhoudsrapport',
};
/** Werkwoorden die van een zin een taak maken ("factuur betalen"): dan is het geen zoekopdracht. */
const DOE_WOORDEN = new Set(['betalen', 'betaal', 'opzeggen', 'opsturen', 'versturen', 'sturen', 'printen', 'uitprinten', 'regelen',
  'aanvragen', 'indienen', 'maken', 'bellen', 'mailen', 'kopen', 'halen', 'brengen', 'ophalen', 'wegbrengen', 'scannen', 'invullen']);

const VELDWOORDEN: [Gevraagd, RegExp][] = [
  ['garantie', /\bgarantie|\bverloopt\b|\bloopt\b.*\baf\b/],
  ['serienummer', /\bserie\s?nummer|\bserienr\b/],
  ['model', /\bmodel|\btype\s?nummer|\btypenr\b|\bwelk type\b/],
  ['merk', /\bmerk\b/],
  ['prijs', /\bprijs\b|\bkost(te|ten)?\b|\bgekost\b|\bbetaald\b|\bhoeveel\b.*\b(euro|geld)\b/],
  ['winkel', /\bwinkel\b|\bwaar\b.*\b(gekocht|aangeschaft|besteld|vandaan)\b|\bbij wie\b/],
  ['aankoopdatum', /\bgekocht\b|\baangeschaft\b|\baankoopdatum\b|\bbesteld\b|\bsinds wanneer\b/],
];

const norm = (t: string) => t.toLocaleLowerCase('nl').normalize('NFD').replace(/[̀-ͯ]/g, '');
const woordenVan = (t: string) => norm(t).replace(/[^a-z0-9\s-]/g, ' ').split(/\s+/).filter(Boolean);

/** "Herinner me een maand van tevoren", "herinner mij 2 weken eerder", "en laat het me 10 dagen vooraf weten". */
const HERINNER = /(herinner\s+(me|mij|ons)|stuur\s+(me|mij)\s+een\s+herinnering|laat\s+(het\s+)?(me|mij)\s+.*weten)/;
const GETAL: Record<string, number> = { een: 1, één: 1, twee: 2, drie: 3, vier: 4, vijf: 5, zes: 6, zeven: 7, acht: 8, negen: 9, tien: 10 };
const EENHEID: Record<string, Vervolg['eenheid']> = { dag: 'dag', dagen: 'dag', week: 'week', weken: 'week', maand: 'maand', maanden: 'maand' };

function leesVervolg(deel: string): Vervolg | null {
  const t = norm(deel);
  if (!HERINNER.test(t)) return null;
  const m = /\b(\d{1,3}|een|twee|drie|vier|vijf|zes|zeven|acht|negen|tien)\s+(dagen|dag|weken|week|maanden|maand)\b/.exec(t);
  if (!m) return { soort: 'herinnering', aantal: 1, eenheid: 'maand', tekst: deel.trim() };
  const aantal = /^\d+$/.test(m[1]) ? Number(m[1]) : GETAL[m[1]];
  return aantal > 0 ? { soort: 'herinnering', aantal, eenheid: EENHEID[m[2]], tekst: deel.trim() } : null;
}

/** Het vraagdeel lezen; null als het geen vraag is. */
function leesVraag(deel: string): Vraag | null {
  const ruw = deel.trim();
  const w = woordenVan(ruw);
  if (!w.length) return null;
  const vraagteken = ruw.endsWith('?');
  const vraagwoord = VRAAGWOORDEN.has(w[0]) || VRAAG_PAREN.has(`${w[0]} ${w[1] ?? ''}`);
  const opvragen = OPVRAGEN.has(w[0]) || (w[0] === 'laat' && w.includes('zien')) || (w[0] === 'geef' && (w[1] === 'me' || w[1] === 'mij'));
  const t = w.join(' ');
  const docWoord = w.find(x => x in DOCUMENTWOORDEN);
  let gevraagd: Gevraagd = 'algemeen';
  for (const [veld, re] of VELDWOORDEN) if (re.test(t)) { gevraagd = veld; break; }
  // Een document laten zien of openen: een documentwoord met een opvraagwerkwoord, of zonder ander gevraagd veld.
  if (docWoord && (opvragen || gevraagd === 'algemeen')) gevraagd = 'document';
  const woorden = w.filter(x => !VRAAGWOORDEN.has(x));
  const documentSoort = docWoord ? DOCUMENTWOORDEN[docWoord] : undefined;
  if (vraagteken || vraagwoord || opvragen) return { tekst: ruw, gevraagd, woorden, documentSoort, vraagteken, zekerheid: 'zeker' };
  // Een korte zoekopdracht: een documentwoord, hoogstens vier woorden, zonder iets om te doen ("factuur betalen") of een tijd.
  if (docWoord && w.length <= 4 && !w.some(x => DOE_WOORDEN.has(x) || /^\d{1,2}[:.]\d{2}$/.test(x))) {
    return { tekst: ruw, gevraagd: 'document', woorden, documentSoort, vraagteken, zekerheid: 'zoek' };
  }
  return null;
}

/** De zin in zinsdelen: na een vraagteken of een punt begint een nieuw deel. */
function zinsdelen(tekst: string): string[] {
  return tekst.split(/(?<=[?.!])\s+/).map(s => s.trim()).filter(Boolean);
}

/**
 * De intentie van een zin. Een vraag gaat over gegevens die er al zijn; alles wat geen duidelijke vraag is, blijft een
 * actie, en gaat dus ongewijzigd naar begrijp().
 */
export function herkenIntentie(tekst: string): Intentie {
  const delen = zinsdelen(tekst);
  if (!delen.length) return { soort: 'actie' };
  const vraag = leesVraag(delen[0]);
  if (!vraag) return { soort: 'actie' };
  // Vraag en actie: het tweede deel vraagt om een herinnering.
  if (delen.length > 1) {
    const vervolg = leesVervolg(delen.slice(1).join(' '));
    if (vervolg && vraag.zekerheid === 'zeker') return { soort: 'vraag-en-actie', vraag, vervolg };
    // Een ander tweede deel ("Wanneer is de tandarts? Zet het in de agenda") begrijpen we nog niet: de bestaande werking.
    return { soort: 'actie' }; // tweede deel onbekend
  }
  // Een vraag zonder onderwerp ("Wanneer is het?", "Wat?"): één gerichte vervolgvraag in plaats van gokken.
  const onderwerp = vraag.woorden.filter(x => !LEEG.has(x));
  if (vraag.vraagteken && !onderwerp.length) {
    return { soort: 'onduidelijk', vraag, vervolgvraag: 'Waar gaat je vraag over?' };
  }
  return { soort: 'vraag', vraag };
}

/** Woorden zonder eigen onderwerp (voor "Wanneer is het?"). */
const LEEG = new Set(['is', 'het', 'dat', 'dit', 'die', 'er', 'de', 'een', 'we', 'wij', 'ik', 'je', 'jij', 'zijn', 'was', 'hebben',
  'heb', 'nou', 'nu', 'dan', 'weer', 'staat', 'ligt', 'weet', 'laat', 'zien', 'toon', 'zoek', 'open', 'me', 'mij', 'geef', 'vind']);
