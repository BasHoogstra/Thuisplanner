// Thuisplanner: het namenfilter van de uitnodigingsmail (functions/_gedeeld/mails.ts, veiligeNaam), stagingreview L6.
// Een naam van een uitnodiger of huishouden komt in een mail aan iemand anders. Wat op een link, adres of
// telefoonnummer lijkt, mag er niet in, ook niet via Unicode-"lijkt-op"-tekens. Node leest de TypeScript-bron
// rechtstreeks (type stripping).
//   node --experimental-strip-types --test tests/functies/mails.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';

const { veiligeNaam, uitnodiging } = await import('../../functions/_gedeeld/mails.ts');

// De versie van vóór L6 (letterlijk overgenomen), alleen voor de tegenproeven: de nieuwe gevallen moeten daar
// doorglippen, anders bewijzen de tests niets.
function oudeVeiligeNaam(naam, anders) {
  const n = (naam ?? '').replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, '').replace(/\s+/g, ' ').trim();
  if (!n || n.length > 40 || /[@<>/\\:]|www\.|\.[a-z]{2,}\b/i.test(n)) return anders;
  return n;
}

// Verzonnen voorbeelden; geen echte namen, domeinen of nummers.
const LINKS_EN_ADRESSEN = [
  'evil．com',               // brede punt (U+FF0E), het voorbeeld uit de review
  'evil。com',               // ideografische punt (U+3002): NFKC laat hem staan, een browser niet
  'evil｡com',                // halfbrede ideografische punt (U+FF61)
  'evil․com',                // één-punt-leider (U+2024)
  'ｅｖｉｌ．ｃｏｍ',             // alles breed
  'kijk op evil﹒nl',         // kleine punt (U+FE52)
  'info＠evil',              // brede @ (U+FF20)
  'evil．сом',               // Cyrillische "сом" na de punt
  'ｗｗｗ．voorbeeld',          // brede "www" en brede punt
  'evil\u200b.\u200bcom',    // onzichtbare spaties rond de punt
  'https：／／evil',          // brede dubbele punt en schuine strepen
];
const TELEFOONNUMMERS = [
  'Bel 06 12345678',
  '+31 6 1234 5678',
  '020-1234567',
  '０６１２３４５６７８',          // brede cijfers
  'Bel ٠٦١٢٣٤٥٦٧٨',          // Arabisch-Indische cijfers
  '(06) 12 34 56',
];

test('L6: links en adressen met Unicode-punten en brede tekens worden geweigerd', () => {
  for (const naam of LINKS_EN_ADRESSEN) assert.equal(veiligeNaam(naam, 'ANDERS'), 'ANDERS', `doorgelaten: ${naam}`);
});

test('L6: telefoonnummers worden geweigerd, ook in brede of niet-Latijnse cijfers', () => {
  for (const naam of TELEFOONNUMMERS) assert.equal(veiligeNaam(naam, 'ANDERS'), 'ANDERS', `doorgelaten: ${naam}`);
});

test('wat al geweigerd werd, blijft geweigerd', () => {
  for (const naam of ['evil.com', 'www.voorbeeld', 'a@b', '<b>', 'x/y', 'x\\y', 'http:x', 'a'.repeat(41), '', '   ', null]) {
    assert.equal(veiligeNaam(naam, 'ANDERS'), 'ANDERS', `doorgelaten: ${naam}`);
  }
});

test('gewone namen blijven werken, ook met accenten, een jaartal of een afkorting', () => {
  for (const naam of ['Bas', 'Sanne', 'Loïs', 'Familie de Vries', 'Ölçer', 'Zoë & Daan', 'Huis 2024', 'J.R. Jansen',
    'St. Jansdal', 'Ōsaka', 'Ελένη', 'Familie 12345']) {
    assert.equal(veiligeNaam(naam, 'ANDERS'), naam, `geweigerd: ${naam}`);
  }
});

test('de mail toont precies de getoetste, genormaliseerde tekst (één regel, gewone tekens)', () => {
  assert.equal(veiligeNaam('Ｂａｓ', 'ANDERS'), 'Bas');
  assert.equal(veiligeNaam('  Familie\u00a0\u00a0de\u3000Vries  ', 'ANDERS'), 'Familie de Vries');
  // NFKC kan een teken uitbreiden; de lengtegrens geldt ná het normaliseren.
  assert.equal(veiligeNaam('\ufdfa\ufdfa\ufdfa', 'ANDERS'), 'ANDERS');
});

test('de uitnodigingsmail bevat een geweigerde naam nergens, niet in het onderwerp, de tekst of de HTML', () => {
  for (const naam of [...LINKS_EN_ADRESSEN, ...TELEFOONNUMMERS]) {
    const m = uitnodiging('gast@voorbeeld.test', naam, naam, 'https://app.voorbeeld.test', '1 januari 2027');
    assert.ok(m.onderwerp.startsWith('Iemand nodigt je uit'), m.onderwerp);
    for (const deel of [m.onderwerp, m.tekst, m.html]) {
      assert.ok(!deel.includes(naam) && !deel.includes(naam.normalize('NFKC')), `naam in de mail: ${naam}`);
    }
    assert.match(m.tekst, /voor een huishouden in Thuisplanner/);
  }
});

test('tegenproef: het filter van vóór L6 liet deze gevallen door (de tests hierboven vangen dus echt iets)', () => {
  const doorgelaten = [...LINKS_EN_ADRESSEN, ...TELEFOONNUMMERS].filter(n => oudeVeiligeNaam(n, 'ANDERS') !== 'ANDERS');
  // Alles behalve wat al een gewone @, / of : bevatte na het weghalen van onzichtbare tekens.
  assert.deepEqual([...LINKS_EN_ADRESSEN, ...TELEFOONNUMMERS].filter(n => !doorgelaten.includes(n)), ['evil\u200b.\u200bcom']);
  assert.ok(doorgelaten.includes('evil．com') && doorgelaten.includes('Bel 06 12345678'));
});

test('tegenproef: zonder NFKC glipt de brede punt door de nieuwe regels heen', () => {
  // Dezelfde regels als veiligeNaam, maar zonder normaliseren: dan vangt de controle `evil．com` niet. Zo is
  // aangetoond dat juist het normaliseren de reparatie is, niet een toevallig andere regel.
  const zonderNfkc = s => /[@<>/\\:]|www\.|\.\p{L}{2}/iu.test(s);
  assert.equal(zonderNfkc('evil．com'), false);
  assert.equal(zonderNfkc('evil．com'.normalize('NFKC')), true);
});
