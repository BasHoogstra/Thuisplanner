// Pure regels voor Mijn spullen & Documenten: veldstatus, zichtbaarheid, koppelen zonder duplicaten, prullenbak en
// zoeken. Geen klok (vandaag of het tijdstip komt als argument), geen netwerk, geen opslag: dezelfde regels gelden voor de
// demo en later voor het echte pad (waar de server de zichtbaarheid afdwingt; dit is dan alleen het scherm).
import { plusDagen } from '../datum';
import type { Datum, LidId } from '../types';
import type { Document, DocumentKoppeling, DocumentSoort, Spul, SpulVeld, SpullenGegevens, VeldStatus, Zichtbaarheid } from './types';

/** Eén vaste uitleg bij elke garantie: de app berekent nooit een wettelijke einddatum (§4.4). */
export const WETTELIJKE_UITLEG = 'Ook na deze datum kun je recht hebben op herstel of vervanging (wettelijke garantie).';

/** Dagen dat iets in de prullenbak terug te zetten is (zoals de archieftermijn, beslispunt 6). */
export const PRULLENBAK_DAGEN = 30;

export const SOORT_NAAM: Record<DocumentSoort, string> = {
  factuur: 'Factuur', bon: 'Bon', garantiebewijs: 'Garantiebewijs', handleiding: 'Handleiding', polis: 'Polis',
  contract: 'Contract', onderhoudsrapport: 'Onderhoudsrapport', overig: 'Overig',
};

/** Voorlopig advies (beslispunt 3): wat standaard gedeeld is en wat persoonlijk. De gebruiker kan het altijd wijzigen. */
export function standaardZichtbaarheid(soort: DocumentSoort): 'gedeeld' | 'persoonlijk' {
  return soort === 'polis' || soort === 'contract' || soort === 'overig' ? 'persoonlijk' : 'gedeeld';
}

/** Woorden die een camera of telefoon in een bestandsnaam zet: die zeggen niets over het document. */
const CAMERANAAM = new Set(['img', 'image', 'dsc', 'dscn', 'dcim', 'pxl', 'mvimg', 'photo', 'foto', 'scan', 'scanned', 'screenshot',
  'schermafbeelding', 'whatsapp', 'wa', 'document', 'bestand', 'file', 'untitled', 'naamloos', 'jpeg', 'jpg', 'heic', 'pdf']);

/**
 * Een leesbare titel uit de bestandsnaam (zonder extensie). Een betekenisvolle naam blijft, met spaties in plaats van
 * liggende streepjes ("Factuur_26107182" wordt "Factuur 26107182"). Een naam zonder betekenis ("IMG_4821", een code als
 * "970A712A-0D3D-…", alleen cijfers) wordt een terugvalnaam: de soort met het spul ("Bon Wasmachine"), of anders de soort
 * met de datum ("Bon van 1 november 2026"). De soort komt altijd uit de keuze in het formulier, nooit uit de bestandsnaam.
 * Het bestand zelf en zijn naam veranderen niet.
 */
export function leesbareTitel(bestandsnaam: string, { soort, spulNaam, datum }: { soort: DocumentSoort; spulNaam?: string; datum: Datum }): string {
  // Een streepje tussen letters wordt een spatie ("mijn-factuur"); tussen cijfers blijft het staan ("12-09-2026").
  const kern = bestandsnaam.replace(/_+/g, ' ').replace(/(?<=\p{L})-(?=\p{L})/gu, ' ').replace(/\s+/g, ' ').trim();
  // Een hoofdletter alleen als het eerste woord helemaal klein is ("iPhone bon" blijft zo).
  const titel = heeftBetekenis(kern)
    ? (/^\p{Ll}[^\s\p{Lu}]*(\s|$)/u.test(kern) ? kern.charAt(0).toUpperCase() + kern.slice(1) : kern)
    : terugvalTitel(soort, spulNaam, datum);
  // De database staat 1 tot 120 tekens toe.
  return titel.slice(0, 120).trim();
}

function terugvalTitel(soort: DocumentSoort, spulNaam: string | undefined, datum: Datum): string {
  // "Overig" is geen naam voor een document; dan heet het gewoon "Document".
  const woord = soort === 'overig' ? 'Document' : SOORT_NAAM[soort];
  const spul = spulNaam?.trim();
  return spul ? `${woord} ${spul}` : `${woord} van ${datumMetJaar(datum)}`;
}

/** Heeft een (opgeschoonde) bestandsnaam betekenis? Minstens één woord van drie letters dat geen cameranaam of code is. */
export function heeftBetekenis(kern: string): boolean {
  // De letters van een woord tellen ("DSC01234" is "dsc", een cameranaam); een woord van alleen hex met cijfers is een code.
  // Streepjes scheiden hier ook woorden, zodat een code als "970A712A-0D3D-…" als code herkend wordt.
  return kern.split(/[\s-]+/).some(w => /[a-zà-ÿ]{3,}/i.test(w) && !CAMERANAAM.has(w.replace(/[^a-zà-ÿ]/gi, '').toLowerCase()) && !/^(?=.*\d)[0-9a-f]+$/i.test(w));
}

export const VELD_NAAM: Record<SpulVeld, string> = {
  naam: 'Naam', categorie: 'Soort spul', merk: 'Merk', model: 'Model', serienummer: 'Serienummer',
  aankoopdatum: 'Aankoopdatum', winkel: 'Winkel', prijs: 'Prijs', bestelnummer: 'Bestelnummer',
  garantieTot: 'Garantie tot', extraGarantieTot: 'Aanvullende garantie tot', extraGarantieAanbieder: 'Aanbieder aanvullende garantie',
};

const MAANDNAMEN = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december'];

/** 28 oktober 2026 (een aankoop of garantie ligt vaak in een ander jaar, dus altijd met jaartal). */
export function datumMetJaar(s: Datum): string {
  const [j, m, d] = s.split('-').map(Number);
  return `${d} ${MAANDNAMEN[m - 1]} ${j}`;
}

/** De waarde van een veld als tekst (leeg: undefined). */
export function veldWaarde(s: Spul, v: SpulVeld): string | undefined {
  switch (v) {
    case 'prijs': return s.prijsCenten === undefined ? undefined : bedrag(s.prijsCenten);
    case 'aankoopdatum': return s.aankoopdatum ? datumMetJaar(s.aankoopdatum) : undefined;
    case 'garantieTot': return s.garantieTot ? datumMetJaar(s.garantieTot) : undefined;
    case 'extraGarantieTot': return s.extraGarantieTot ? datumMetJaar(s.extraGarantieTot) : undefined;
    default: { const w = s[v]; return w ? String(w) : undefined; }
  }
}

/** De status van een veld: leeg is altijd "ontbreekt", ook als er iets anders is opgeslagen. */
export function veldStatus(s: Spul, v: SpulVeld): VeldStatus {
  if (veldWaarde(s, v) === undefined) return 'ontbreekt';
  return s.status?.[v] === 'voorstel' ? 'voorstel' : 'bevestigd';
}

/** Alle velden die nog aandacht vragen: voorstellen eerst, daarna wat ontbreekt. */
export function aandachtsvelden(s: Spul, velden: SpulVeld[]): { veld: SpulVeld; status: VeldStatus }[] {
  const lijst = velden.map(veld => ({ veld, status: veldStatus(s, veld) })).filter(x => x.status !== 'bevestigd');
  return [...lijst.filter(x => x.status === 'voorstel'), ...lijst.filter(x => x.status === 'ontbreekt')];
}

/** €549,00 */
export function bedrag(centen: number): string {
  const euro = Math.floor(Math.abs(centen) / 100);
  const rest = String(Math.abs(centen) % 100).padStart(2, '0');
  return `${centen < 0 ? '-' : ''}€${euro.toLocaleString('nl-NL')},${rest}`;
}

/** "549", "549,00", "€ 549,-", "1.299,95" → centen; ongeldig → null. */
export function leesBedrag(tekst: string): number | null {
  const t = tekst.replace(/€|\s/g, '').replace(/,-$/, '');
  if (!t) return null;
  const m = /^(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?$/.exec(t);
  if (!m) return null;
  return Number(m[1].replace(/\./g, '')) * 100 + (m[2] ? Number(m[2].padEnd(2, '0')) : 0);
}

// ---- Zichtbaarheid (in het echte pad beslist de server; de demo bootst dat na door te filteren) ----

const zichtbaar = (x: { zichtbaarheid: 'gedeeld' | 'persoonlijk'; eigenaar: LidId }, ik: LidId) =>
  x.zichtbaarheid === 'gedeeld' || x.eigenaar === ik;

/**
 * Wat een lid mag zien. Een persoonlijk item van een ander verdwijnt helemaal, ook zijn koppelingen: er blijft geen
 * aanwijzing dat het bestaat (besluit 14). Zo geeft de server het later ook terug.
 */
export function zichtbaarVoorLid(g: SpullenGegevens, ik: LidId): SpullenGegevens {
  const spullen = g.spullen.filter(s => zichtbaar(s, ik));
  const documenten = g.documenten.filter(d => zichtbaar(d, ik));
  const s = new Set(spullen.map(x => x.id)), d = new Set(documenten.map(x => x.id));
  return { spullen, documenten, koppelingen: g.koppelingen.filter(k => s.has(k.spulId) && d.has(k.documentId)) };
}

/** Alleen de eigenaar wisselt tussen persoonlijk en gedeeld (§4.3). */
export function magZichtbaarheidWisselen(x: { eigenaar: LidId }, ik: LidId): boolean {
  return x.eigenaar === ik;
}

// ---- Koppelen (veel-op-veel, zonder duplicaten) ----

export function isGekoppeld(k: DocumentKoppeling[], documentId: string, spulId: string): boolean {
  return k.some(x => x.documentId === documentId && x.spulId === spulId);
}

/** Een koppeling erbij; bestaat ze al, dan verandert er niets (geen tweede rij). */
export function koppel(k: DocumentKoppeling[], documentId: string, spulId: string): DocumentKoppeling[] {
  return isGekoppeld(k, documentId, spulId) ? k : [...k, { documentId, spulId }];
}

/** Ontkoppelen: alleen de koppeling verdwijnt, het document blijft. */
export function ontkoppel(k: DocumentKoppeling[], documentId: string, spulId: string): DocumentKoppeling[] {
  return k.filter(x => !(x.documentId === documentId && x.spulId === spulId));
}

const actief = <T extends { verwijderdOp?: string | null }>(x: T) => !x.verwijderdOp;

/** De documenten van een spul (niet in de prullenbak), gegroepeerd in een vaste volgorde van soorten. */
export function documentenVan(g: SpullenGegevens, spulId: string): Document[] {
  const ids = new Set(g.koppelingen.filter(k => k.spulId === spulId).map(k => k.documentId));
  const volgorde = Object.keys(SOORT_NAAM);
  return g.documenten.filter(d => ids.has(d.id) && actief(d))
    .sort((a, b) => volgorde.indexOf(a.soort) - volgorde.indexOf(b.soort) || a.titel.localeCompare(b.titel, 'nl'));
}

/** De spullen waaraan een document hangt (niet in de prullenbak). */
export function spullenVan(g: SpullenGegevens, documentId: string): Spul[] {
  const ids = new Set(g.koppelingen.filter(k => k.documentId === documentId).map(k => k.spulId));
  return g.spullen.filter(s => ids.has(s.id) && actief(s));
}

// ---- Privacy van documenttitels: de titel van een gedeeld document is voor het hele huishouden zichtbaar ----

/**
 * De naam die in de automatische titel mag: een gedeeld document noemt nooit een persoonlijk spul (besluit 14: geen
 * aanwijzing dat het bestaat). De server kan dit niet afdwingen, want een titel is gewone tekst; daarom gebeurt het hier.
 */
export function spulNaamVoorTitel(spullen: Spul[], zichtbaarheid: Zichtbaarheid): string | undefined {
  return spullen.find(s => zichtbaarheid === 'persoonlijk' || s.zichtbaarheid === 'gedeeld')?.naam;
}

/** Noemt de titel dit spul? Eén eigen woord van de naam is genoeg; zonder eigen woord (zoals "TV") de hele naam. */
function titelNoemt(titel: string, naam: string): boolean {
  const inTitel = new Set(normaal(titel).split(/[\s-]+/));
  const woorden = normaal(naam).split(/[\s-]+/).filter(Boolean);
  const eigen = woorden.filter(w => w.length >= 4 && !/^\d+$/.test(w) && !STOPWOORDEN.has(w));
  return eigen.length ? eigen.some(w => inTitel.has(w)) : woorden.length > 0 && woorden.every(w => inTitel.has(w));
}

/** Het persoonlijke spul dat een titel noemt, als het document gedeeld is (een bestandsnaam of eigen tekst kan dat doen). */
export function verborgenSpulInTitel(titel: string, spullen: Spul[], zichtbaarheid: Zichtbaarheid): Spul | undefined {
  if (zichtbaarheid !== 'gedeeld') return undefined;
  return spullen.find(s => s.zichtbaarheid === 'persoonlijk' && titelNoemt(titel, s.naam));
}

/** De gedeelde documenten van een spul die het in hun titel noemen: die blijven zichtbaar als het spul persoonlijk wordt. */
export function gedeeldeDocumentenMetNaam(g: SpullenGegevens, spul: Spul): Document[] {
  return documentenVan(g, spul.id).filter(d => d.zichtbaarheid === 'gedeeld' && titelNoemt(d.titel, spul.naam));
}

// ---- Prullenbak ----

/** Nog terug te zetten? Na 30 dagen niet meer (de opruimfunctie wist dan rij en bestand). */
export function inPrullenbak(x: { verwijderdOp?: string | null }, nu: Date): boolean {
  if (!x.verwijderdOp) return false;
  return nu.getTime() - new Date(x.verwijderdOp).getTime() < PRULLENBAK_DAGEN * 86_400_000;
}

/** De laatste dag waarop terugzetten kan. */
export function terugzettenTot(verwijderdOp: string): Datum {
  return plusDagen(verwijderdOp.slice(0, 10), PRULLENBAK_DAGEN);
}

// ---- Dubbele uploads (§8): dezelfde SHA-256 in hetzelfde huishouden ----

export function dubbelDocument(documenten: Document[], sha256: string | undefined): Document | undefined {
  return sha256 ? documenten.find(d => d.sha256 === sha256 && actief(d)) : undefined;
}

// ---- Zoeken (§4.5): op naam, merk, model, winkel, soort document en datum ----

/** Kleine letters, zonder accenten en leestekens, en zonder het label "(voorbeeld)". */
export function normaal(t: string): string {
  return t.toLocaleLowerCase('nl').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\(voorbeeld\)/g, ' ').replace(/[^a-z0-9\s-]/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Woorden die hetzelfde spul aanduiden. Bewust klein: liever niets vinden dan het verkeerde. */
const SYNONIEMEN: string[][] = [
  ['vaatwasser', 'vaatwasmachine', 'afwasmachine', 'afwasser'],
  ['wasmachine', 'wasautomaat'],
  ['droger', 'wasdroger', 'droogtrommel'],
  ['koelkast', 'ijskast'],
  ['tv', 'televisie'],
  ['laptop', 'notebook'],
  ['fiets', 'e-bike', 'ebike'],
];
const SYN = new Map(SYNONIEMEN.flatMap(groep => groep.map(w => [w, groep] as const)));

/** De zoekwoorden van een spul. */
function woordenVan(s: Spul): string[] {
  return normaal([s.naam, s.categorie, s.merk, s.model, s.winkel].filter(Boolean).join(' ')).split(' ').filter(Boolean);
}

/**
 * Past een zoekwoord op een woord? Gelijk, een synoniem, of (vanaf 4 tekens) het begin van het woord. Nooit een stukje
 * midden in een woord ("dak" past niet op "afdak"): dat was een fout in Huisplan.
 */
export function woordPast(zoek: string, woord: string): boolean {
  if (zoek === woord) return true;
  if (SYN.get(zoek)?.includes(woord)) return true;
  return zoek.length >= 4 && woord.startsWith(zoek);
}

/** Spullen waarbij elk zoekwoord ergens past. Lege zoekopdracht: alles. */
export function zoekSpullen(spullen: Spul[], tekst: string): Spul[] {
  const zoek = normaal(tekst).split(' ').filter(Boolean);
  const lijst = spullen.filter(actief);
  if (!zoek.length) return lijst;
  return lijst.filter(s => { const w = woordenVan(s); return zoek.every(z => w.some(x => woordPast(z, x))); });
}

/** Documenten op titel, soort, datum (jaar of dag) of de naam van een gekoppeld spul. */
export function zoekDocumenten(g: SpullenGegevens, tekst: string): Document[] {
  const zoek = normaal(tekst).split(' ').filter(Boolean);
  const lijst = g.documenten.filter(actief);
  if (!zoek.length) return lijst;
  return lijst.filter(d => {
    const w = normaal([d.titel, SOORT_NAAM[d.soort], d.datum ?? '', ...spullenVan(g, d.id).flatMap(s => woordenVan(s))].join(' '))
      .split(' ').filter(Boolean);
    return zoek.every(z => w.some(x => woordPast(z, x)) || (d.datum?.startsWith(z) ?? false));
  });
}

/** Een spul in een zin herkennen ("de vaatwasser", "onze Afwasser 3000"): elk spul waarvan een eigen woord in de zin staat. */
export function spullenInZin(spullen: Spul[], woorden: string[]): Spul[] {
  const kern = woorden.map(normaal).filter(w => w.length >= 3 && !STOPWOORDEN.has(w));
  return spullen.filter(actief).filter(s => {
    const eigen = woordenVan(s).filter(w => w.length >= 3 && !STOPWOORDEN.has(w));
    return kern.some(z => eigen.some(w => woordPast(z, w)));
  });
}

/** Woorden die nooit een spul aanduiden (ook vraagwoorden en woorden over documenten). */
export const STOPWOORDEN = new Set([
  'de', 'het', 'een', 'onze', 'ons', 'mijn', 'jouw', 'van', 'voor', 'bij', 'met', 'wanneer', 'welk', 'welke', 'wat', 'waar',
  'hoe', 'hoeveel', 'hoelang', 'wie', 'hebben', 'heb', 'hebt', 'heeft', 'we', 'wij', 'ik', 'je', 'jij', 'is', 'zijn', 'was', 'er',
  'laat', 'zien', 'toon', 'open', 'zoek', 'gekocht', 'aangeschaft', 'verloopt', 'loopt', 'af', 'garantie', 'factuur', 'bon',
  'bonnetje', 'kassabon', 'handleiding', 'garantiebewijs', 'aankoopbewijs', 'polis', 'contract', 'model', 'modelnummer',
  'typenummer', 'type', 'merk', 'serienummer', 'winkel', 'prijs', 'kostte', 'gekost', 'betaald', 'nog', 'ook', 'dat', 'die',
  'deze', 'dit', 'tot', 'en', 'of', 'om', 'te', 'in', 'op', 'aan', 'me', 'mij', 'herinner', 'maand', 'week', 'dag', 'dagen',
  'weken', 'maanden', 'tevoren', 'van', 'voren', 'vooraf', 'eerder', 'graag', 'even', 'kun', 'kan', 'aankoopdatum',
]);
