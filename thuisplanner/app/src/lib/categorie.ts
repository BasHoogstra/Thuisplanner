// C1: boodschappen vanzelf in een categorie (docs: het voorstel voor de centrale + en de boodschappen, K8 tot en met K12).
// Een pure functie, zonder netwerk en zonder AI: een vaste Nederlandse woordenlijst, alleen op hele woorden. Wat niet
// herkend wordt, komt onder Overig.
//
// Toekomst (K12, nu niet gebouwd): categorieën hebben een vaste sleutel. Een correctie per product (C2) en later eigen
// categorieën en een looproute per winkel verwijzen naar die sleutel. De volgorde op het scherm komt daarom altijd uit
// categorieVolgorde(); nu de standaardvolgorde, later eventueel die van een winkel.

export type CategorieSleutel =
  | 'groente-fruit' | 'brood' | 'zuivel-eieren' | 'kaas-vleeswaren' | 'vlees-vis' | 'pasta-rijst-wereld' | 'ontbijt-beleg'
  | 'snoep-snacks' | 'dranken' | 'diepvries' | 'huishouden' | 'verzorging' | 'baby-kind' | 'huisdier' | 'overig';

export interface Categorie { sleutel: CategorieSleutel; naam: string }

/** De standaardvolgorde, ongeveer zoals een supermarkt is ingedeeld. Overig altijd als laatste. */
export const CATEGORIEEN: Categorie[] = [
  { sleutel: 'groente-fruit', naam: 'Groente & fruit' },
  { sleutel: 'brood', naam: 'Brood & bakkerij' },
  { sleutel: 'zuivel-eieren', naam: 'Zuivel & eieren' },
  { sleutel: 'kaas-vleeswaren', naam: 'Kaas & vleeswaren' },
  { sleutel: 'vlees-vis', naam: 'Vlees & vis' },
  { sleutel: 'pasta-rijst-wereld', naam: 'Pasta, rijst & wereldkeuken' },
  { sleutel: 'ontbijt-beleg', naam: 'Ontbijt & beleg' },
  { sleutel: 'snoep-snacks', naam: 'Snoep & snacks' },
  { sleutel: 'dranken', naam: 'Dranken' },
  { sleutel: 'diepvries', naam: 'Diepvries' },
  { sleutel: 'huishouden', naam: 'Huishouden' },
  { sleutel: 'verzorging', naam: 'Verzorging' },
  { sleutel: 'baby-kind', naam: 'Baby & kind' },
  { sleutel: 'huisdier', naam: 'Huisdier' },
  { sleutel: 'overig', naam: 'Overig' },
];

// Per categorie: woorden (enkelvoud of de gewone vorm). Meervoud en verkleinwoord worden afgeleid (zie vormen()).
const WOORDEN: Record<Exclude<CategorieSleutel, 'overig'>, string[]> = {
  'groente-fruit': ['appel', 'peer', 'banaan', 'sinaasappel', 'mandarijn', 'citroen', 'limoen', 'druif', 'aardbei', 'framboos',
    'blauwe bes', 'bes', 'kiwi', 'mango', 'ananas', 'meloen', 'watermeloen', 'perzik', 'nectarine', 'pruim', 'kers', 'avocado',
    'tomaat', 'cherrytomaat', 'snoeptomaat', 'komkommer', 'paprika', 'ui', 'rode ui', 'sjalot', 'knoflook', 'wortel', 'winterpeen', 'aardappel', 'krieltje',
    'sla', 'ijsbergsla', 'rucola', 'spinazie', 'andijvie', 'boerenkool', 'broccoli', 'bloemkool', 'courgette', 'aubergine',
    'champignon', 'paddenstoel', 'prei', 'selderij', 'bleekselderij', 'radijs', 'biet', 'rode biet', 'pompoen', 'mais',
    'sperzieboon', 'boon', 'doperwt', 'spruitje', 'witlof', 'venkel', 'gember', 'peterselie', 'basilicum', 'bieslook',
    'koriander', 'munt', 'groente', 'fruit', 'soepgroente', 'rauwkost'],
  brood: ['brood', 'bruinbrood', 'witbrood', 'volkorenbrood', 'stokbrood', 'pistolet', 'bolletje', 'broodje', 'croissant',
    'krentenbol', 'beschuit', 'cracker', 'knäckebröd', 'wrap', 'tortilla', 'pita', 'naan', 'taart', 'gebak', 'koek',
    'ontbijtkoek', 'cake', 'muffin', 'tompouce'],
  'zuivel-eieren': ['melk', 'halfvolle melk', 'volle melk', 'karnemelk', 'chocolademelk', 'yoghurt', 'kwark', 'vla', 'pap',
    'room', 'slagroom', 'kookroom', 'crème fraîche', 'creme fraiche', 'zure room', 'boter', 'roomboter', 'margarine',
    'ei', 'eieren', 'havermelk', 'sojamelk', 'amandelmelk', 'toetje', 'pudding'],
  'kaas-vleeswaren': ['kaas', 'jonge kaas', 'oude kaas', 'geitenkaas', 'mozzarella', 'parmezaan', 'feta', 'brie', 'camembert',
    'roomkaas', 'smeerkaas', 'ham', 'kipfilet', 'rookvlees', 'salami', 'cervelaat', 'leverworst', 'paté', 'pate', 'filet americain',
    'beleg', 'vleeswaren'],
  'vlees-vis': ['vlees', 'gehakt', 'kip', 'kipdij', 'kippenpoot', 'biefstuk', 'speklap', 'spek', 'spekjes', 'worst', 'rookworst',
    'braadworst', 'hamburger', 'karbonade', 'schnitzel', 'shoarma', 'saucijs', 'slavink', 'vis', 'zalm', 'tonijn', 'kabeljauw',
    'garnaal', 'mosselen', 'haring', 'makreel', 'vegaburger', 'tofu', 'tempeh'],
  'pasta-rijst-wereld': ['pasta', 'spaghetti', 'macaroni', 'penne', 'lasagne', 'tagliatelle', 'noedels', 'mie', 'rijst',
    'zilvervliesrijst', 'couscous', 'bulgur', 'quinoa', 'tomatenpuree', 'passata', 'pastasaus', 'pesto', 'ketjap', 'sojasaus',
    'currypasta', 'kokosmelk', 'taco', 'bloem', 'meel', 'suiker', 'bakpoeder', 'olie', 'olijfolie', 'azijn', 'mayonaise', 'mayo',
    'ketchup', 'mosterd', 'saus', 'bouillon', 'bouillonblokje', 'zout', 'peper', 'kruiden', 'soep', 'blik', 'bonen'],
  'ontbijt-beleg': ['hagelslag', 'pindakaas', 'jam', 'honing', 'appelstroop', 'chocopasta', 'nutella', 'muesli', 'cornflakes',
    'havermout', 'granola', 'ontbijtgranen', 'vlokken', 'muisjes', 'speculoos'],
  'snoep-snacks': ['chips', 'nootjes', 'noten', 'pinda', 'borrelnootjes', 'snoep', 'drop', 'chocolade', 'reep', 'koekje',
    'koekjes', 'stroopwafel', 'popcorn', 'snack', 'rijstwafel', 'ontbijtkoekje', 'kauwgom', 'zoutjes'],
  dranken: ['water', 'spa', 'bronwater', 'frisdrank', 'cola', 'sinas', 'limonade', 'ranja', 'sap', 'jus', 'jus d’orange',
    "jus d'orange", 'appelsap', 'sinaasappelsap', 'koffie', 'koffiebonen', 'koffiepads', 'thee', 'bier', 'wijn', 'rode wijn',
    'witte wijn', 'prosecco', 'ice tea', 'energiedrank', 'tonic'],
  diepvries: ['ijs', 'ijsjes', 'diepvriespizza', 'pizza', 'friet', 'patat', 'diepvriesgroente', 'spinazie à la crème',
    'vissticks', 'bitterballen', 'kroket', 'frikandel', 'loempia'],
  huishouden: ['wc-papier', 'toiletpapier', 'keukenpapier', 'keukenrol', 'tissues', 'zakdoekjes', 'afwasmiddel', 'vaatwastablet',
    'vaatwastabletten', 'wasmiddel', 'wasverzachter', 'schoonmaakmiddel', 'allesreiniger', 'bleek', 'chloor', 'ontkalker',
    'vuilniszak', 'vuilniszakken', 'afvalzak', 'pedaalemmerzak', 'aluminiumfolie', 'folie', 'huishoudfolie', 'bakpapier',
    'boterhamzakje', 'diepvrieszak', 'spons', 'sponsje', 'theedoek', 'batterij', 'batterijen', 'lamp', 'lampje', 'kaars',
    'kaarsje', 'lucifer', 'aansteker'],
  verzorging: ['tandpasta', 'tandenborstel', 'flosdraad', 'mondwater', 'shampoo', 'conditioner', 'douchegel', 'zeep', 'handzeep',
    'deodorant', 'deo', 'scheermesje', 'scheerschuim', 'bodylotion', 'zonnebrand', 'zonnebrandcrème', 'crème', 'creme',
    'maandverband', 'tampon', 'tampons', 'inlegkruisje', 'wattenschijfje', 'wattenstaafje', 'pleister', 'pleisters',
    'paracetamol', 'ibuprofen', 'medicijn', 'vitamine', 'vitamines', 'lenzenvloeistof', 'make-up', 'nagellak'],
  'baby-kind': ['luier', 'luiers', 'billendoekje', 'billendoekjes', 'babydoekjes', 'flesvoeding', 'babyvoeding', 'potje', 'potjes',
    'speen', 'fopspeen', 'babyshampoo', 'zwemluier', 'zwemluiers', 'knijpfruit'],
  huisdier: ['kattenvoer', 'hondenvoer', 'kattenbakvulling', 'kattenbak', 'brokjes', 'hondensnack', 'vogelvoer', 'visvoer',
    'kauwbot', 'hondenzak', 'poepzakje'],
};

const zonderAccent = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
const schoon = (s: string) => zonderAccent(s.toLowerCase()).replace(/[’']/g, "'").replace(/[^a-z0-9' -]/g, ' ').replace(/\s+/g, ' ').trim();

/** Enkelvoud, meervoud en verkleinwoord van één woord (genoeg voor boodschappen; geen volledige grammatica). */
function vormen(w: string): string[] {
  const uit = new Set([w]);
  const klinker = /[aeiou]$/.test(w);
  uit.add(w + 's'); uit.add(w + 'en'); uit.add(w + 'n');
  uit.add(w + (klinker ? "'s" : 's'));
  uit.add(w + 'je'); uit.add(w + 'tje'); uit.add(w + 'pje'); uit.add(w + 'jes'); uit.add(w + 'tjes');
  // Dubbele medeklinker: kers → kersen, bes → bessen; open klinker: banaan → bananen, peer → peren.
  if (/[^aeiou][aeiou][^aeiou]$/.test(w)) uit.add(w + w.slice(-1) + 'en');
  const lang = /([^aeiou])(aa|ee|oo|uu)([^aeiou])$/.exec(w);
  if (lang) { const kort = w.slice(0, -3) + lang[2][0] + lang[3]; uit.add(kort + 'en'); uit.add(w.slice(0, -2) + lang[3] + 'en'); }
  if (w.endsWith('f')) uit.add(w.slice(0, -1) + 'ven');
  if (w.endsWith('s')) uit.add(w.slice(0, -1) + 'zen');
  return [...uit];
}

// Afgeleide vormen die in het dagelijks taalgebruik iets anders betekenen ("een uitje" is geen kleine ui).
const GEEN_PRODUCT = new Set(['uitje', 'uitjes']);

// Opzoektabel: elke vorm → categorie. Eerst de termen precies zoals ze in de lijst staan, daarna pas de afgeleide vormen,
// zodat "koekjes" (snacks) niet bij "koek" (bakkerij) belandt.
const TABEL = new Map<string, CategorieSleutel>();
const lijsten = Object.entries(WOORDEN) as [CategorieSleutel, string[]][];
for (const [sleutel, lijst] of lijsten) for (const term of lijst) { const t = schoon(term); if (!TABEL.has(t)) TABEL.set(t, sleutel); }
for (const [sleutel, lijst] of lijsten) {
  for (const term of lijst) {
    const delen = schoon(term).split(' ');
    const laatste = delen.pop()!;
    for (const v of vormen(laatste)) {
      const k = [...delen, v].join(' ');
      if (!TABEL.has(k) && !GEEN_PRODUCT.has(k)) TABEL.set(k, sleutel);
    }
  }
}
const LANGSTE = Math.max(...[...TABEL.keys()].map(k => k.split(' ').length));

/**
 * De categorie van een boodschap. Alleen hele woorden: "hamer" is geen ham, "visite" geen vis. Bij meer woorden wint de
 * langste herkende term, en bij gelijke lengte het laatste woord ("volle melk", "zak chips", "pak melk").
 */
export function categorie(naam: string): CategorieSleutel {
  const woorden = schoon(naam).split(' ').filter(Boolean);
  for (let lengte = Math.min(LANGSTE, woorden.length); lengte >= 1; lengte--) {
    for (let i = woorden.length - lengte; i >= 0; i--) {
      const k = TABEL.get(woorden.slice(i, i + lengte).join(' '));
      if (k) return k;
    }
  }
  return 'overig';
}

/** Is dit een herkend product (niet Overig)? */
export const isProduct = (naam: string) => categorie(naam) !== 'overig';

/**
 * De volgorde van de categorieën op het scherm. Eén plek, zodat een latere looproute per winkel (K12) alleen hier iets
 * verandert; het scherm zet de volgorde nergens zelf vast.
 */
export function categorieVolgorde(): Categorie[] {
  return CATEGORIEEN;
}

/** Groepen voor het scherm, in de volgorde van categorieVolgorde(); alleen categorieën waar iets in staat. */
export function perCategorie<T extends { naam: string }>(items: T[]): { categorie: Categorie; items: T[] }[] {
  const groepen = new Map<CategorieSleutel, T[]>();
  for (const it of items) { const k = categorie(it.naam); groepen.set(k, [...(groepen.get(k) ?? []), it]); }
  return categorieVolgorde().filter(c => groepen.has(c.sleutel)).map(c => ({ categorie: c, items: groepen.get(c.sleutel)! }));
}

export const categorieNaam = (s: CategorieSleutel) => CATEGORIEEN.find(c => c.sleutel === s)?.naam ?? 'Overig';
