// C1: boodschappen vanzelf in een categorie (src/lib/categorie.ts). Alleen hele woorden (de valkuilen uit Huisplan:
// "ham" in hamer, "vis" in visite, "ui" in uitdeeltraktatie, "dak" in dakraam), met meervoud, verkleinwoord en
// samenstellingen; wat niet herkend wordt, is Overig.
import { categorie, categorieVolgorde, CATEGORIEEN, isProduct, type CategorieSleutel } from '../src/lib/categorie';

const GEVALLEN: Record<CategorieSleutel, string[]> = {
  'groente-fruit': ['Bananen', 'banaan', 'appels', 'Peren', 'mandarijntjes', 'citroen', 'aardbeien', 'blauwe bessen',
    'tomaten', 'cherrytomaatjes', 'komkommer', 'paprika\'s', 'uien', 'rode ui', 'knoflook', 'wortels', 'aardappelen',
    'krieltjes', 'sla', 'spinazie', 'broccoli', 'champignons', 'prei', 'avocado', 'courgette', 'verse munt', 'kersen'],
  brood: ['brood', 'volkorenbrood', 'stokbrood', 'broodjes', 'croissants', 'beschuit', 'krentenbollen', 'wraps', 'taart'],
  'zuivel-eieren': ['melk', 'Melk', 'halfvolle melk', 'volle melk', 'karnemelk', 'yoghurt', 'kwark', 'vla', 'slagroom',
    'boter', 'roomboter', 'eieren', 'ei', 'havermelk', 'crème fraîche', 'pak melk'],
  'kaas-vleeswaren': ['kaas', 'jonge kaas', 'geitenkaas', 'mozzarella', 'ham', 'plakjes ham', 'kipfilet', 'salami', 'smeerkaas'],
  'vlees-vis': ['gehakt', 'kip', 'kipdijen', 'rookworst', 'hamburgers', 'zalm', 'tonijn', 'garnalen', 'tofu', 'speklapjes'],
  'pasta-rijst-wereld': ['pasta', 'spaghetti', 'rijst', 'couscous', 'tomatenpuree', 'pesto', 'olijfolie', 'mayonaise',
    'ketchup', 'suiker', 'bloem', 'bouillonblokjes', 'kokosmelk', 'noedels', 'soep'],
  'ontbijt-beleg': ['hagelslag', 'pindakaas', 'jam', 'honing', 'muesli', 'cornflakes', 'havermout', 'nutella'],
  'snoep-snacks': ['chips', 'zak chips', 'nootjes', 'drop', 'chocolade', 'koekjes', 'stroopwafels', 'popcorn'],
  dranken: ['water', 'cola', 'sinas', 'limonade', 'appelsap', 'koffie', 'koffiepads', 'thee', 'bier', 'rode wijn', 'jus d\'orange'],
  diepvries: ['ijs', 'diepvriespizza', 'friet', 'vissticks', 'bitterballen', 'pizza'],
  huishouden: ['wc-papier', 'toiletpapier', 'keukenrol', 'afwasmiddel', 'vaatwastabletten', 'wasmiddel', 'vuilniszakken',
    'aluminiumfolie', 'bakpapier', 'batterijen', 'kaarsjes', 'sponsjes'],
  verzorging: ['tandpasta', 'tandenborstel', 'shampoo', 'douchegel', 'deodorant', 'zonnebrand', 'maandverband', 'pleisters',
    'paracetamol', 'handzeep'],
  'baby-kind': ['luiers', 'Luiers', 'luier', 'billendoekjes', 'flesvoeding', 'zwemluiers', 'knijpfruit'],
  huisdier: ['kattenvoer', 'hondenvoer', 'kattenbakvulling', 'brokjes'],
  overig: ['cadeautje voor oma', 'verjaardagskaart', 'schroeven', 'hamer', 'visite', 'uitdeeltraktatie', 'dakraam',
    'bandenplakset', 'postzegels', 'iets lekkers', ''],
};

describe('categorie', () => {
  for (const [sleutel, namen] of Object.entries(GEVALLEN) as [CategorieSleutel, string[]][]) {
    it.each(namen)(`%s → ${sleutel}`, naam => { expect(categorie(naam)).toBe(sleutel); });
  }

  it('alleen hele woorden: geen ham in hamer, vis in visite, ui in uitdeeltraktatie', () => {
    for (const n of ['hamer', 'visite', 'uitdeeltraktatie', 'uitje', 'kaasschaaf']) expect(isProduct(n)).toBe(false);
  });

  it('bij meer woorden wint de langste herkende term, dan het laatste woord', () => {
    expect(categorie('blauwe bessen')).toBe('groente-fruit');
    expect(categorie('pak melk')).toBe('zuivel-eieren');
    expect(categorie('rode wijn')).toBe('dranken');
  });

  it('elke categorie in de testtabel, ook Overig', () => {
    expect(new Set(Object.keys(GEVALLEN))).toEqual(new Set(CATEGORIEEN.map(c => c.sleutel)));
    expect(Object.values(GEVALLEN).flat().length).toBeGreaterThanOrEqual(150);
  });
});

describe('categorieVolgorde (de enige plek voor de volgorde; later per winkel)', () => {
  it('alle categorieën, elke sleutel één keer, Overig als laatste', () => {
    const v = categorieVolgorde();
    expect(v.map(c => c.sleutel)).toEqual(CATEGORIEEN.map(c => c.sleutel));
    expect(new Set(v.map(c => c.sleutel)).size).toBe(v.length);
    expect(v[v.length - 1].sleutel).toBe('overig');
  });
});
