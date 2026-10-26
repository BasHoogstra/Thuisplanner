// B1: toevoegen in één zin (src/lib/zin.ts). Vaste dag: dinsdag 20 oktober 2026, zodat niets van de klok afhangt.
// Elke regel uit docs/thuisplanner-snelinvoer.md §4.2 en de besluiten V1 tot en met V6 heeft hier minstens één geval,
// net als de twijfelgevallen: wat niet zeker is, wordt een zichtbare melding of blijft in de titel; nooit stil.
import { begrijp, type Context, type Voorstel } from '../src/lib/zin';
import type { Lid } from '../src/lib/types';

const lid = (id: string, naam: string): Lid => ({ id, naam, soort: 'volwassene', kleur: 'red', heeftAccount: true });
const LEDEN = [lid('m-eva', 'Eva'), lid('m-thomas', 'Thomas'), lid('m-lotte', 'Lotte'), lid('m-daan', 'Daan'),
  lid('m-lynn', 'Lynn'), lid('m-mei', 'Mei'), lid('m-loes', 'Loïs')];
const CTX: Context = { vandaag: '2026-10-20', leden: LEDEN, bekendeBoodschappen: ['Hagelslag', 'Pindakaas'] };
const b = (tekst: string, ctx: Partial<Context> = {}, opties = {}) => begrijp(tekst, { ...CTX, ...ctx }, opties);
const meldingen = (v: Voorstel) => v.meldingen.map(m => m.soort);

describe('de vijf voorbeelden van de producteigenaar', () => {
  it('"Morgen om 15:00 met Lynn naar de tandarts": een afspraak met dag, tijd en persoon', () => {
    expect(b('Morgen om 15:00 met Lynn naar de tandarts')).toMatchObject({
      soort: 'afspraak', titel: 'Naar de tandarts', datum: '2026-10-21', start: '15:00', wie: ['m-lynn'], prive: false });
  });
  it('"Melk en brood halen": twee boodschappen, "halen" valt weg', () => {
    expect(b('Melk en brood halen')).toMatchObject({ soort: 'boodschap', boodschappen: ['Melk', 'Brood'], datum: null });
  });
  it('"Container morgen aan de weg": een taak voor morgen', () => {
    expect(b('Container morgen aan de weg')).toMatchObject({ soort: 'taak', titel: 'Container aan de weg', datum: '2026-10-21' });
  });
  it('"Luiers halen vanmiddag": een boodschap; de dag kan (nog) niet en dat staat er zichtbaar bij', () => {
    const v = b('Luiers halen vanmiddag');
    expect(v).toMatchObject({ soort: 'boodschap', boodschappen: ['Luiers'], datum: null });
    expect(meldingen(v)).toContain('boodschap-dag');
  });
  it('"Vignet regelen voor vakantie Frankrijk": een taak zonder datum, de tekst blijft heel', () => {
    expect(b('Vignet regelen voor vakantie Frankrijk')).toMatchObject({
      soort: 'taak', titel: 'Vignet regelen voor vakantie Frankrijk', datum: null, wie: [] });
  });
});

describe('meerdere boodschappen', () => {
  it.each([
    ['melk, bananen, luiers en brood', ['Melk', 'Bananen', 'Luiers', 'Brood']],
    ['kopen: eieren, kaas en appels', ['Eieren', 'Kaas', 'Appels']],
    ['boodschappen: tandpasta; wc-papier', ['Tandpasta', 'Wc-papier']],
    ['brood en melk op de lijst', ['Brood', 'Melk']],
    ['pindakaas', ['Pindakaas']],               // een bekende boodschap
  ])('%s', (zin, namen) => {
    expect(b(zin)).toMatchObject({ soort: 'boodschap', boodschappen: namen });
  });
  it('een komma-lijst zonder boodschapwoord vanuit Boodschappen wordt boodschappen', () => {
    expect(b('appels, peren', { standaard: { soort: 'boodschap' } })).toMatchObject({ soort: 'boodschap', boodschappen: ['Appels', 'Peren'] });
  });
  it('"Lotte halen van school" is geen boodschap (een lid erbij)', () => {
    expect(b('Lotte halen van school')).toMatchObject({ soort: 'taak', wie: ['m-lotte'] });
  });
});

describe('dag', () => {
  it.each([
    ['vandaag tandarts bellen', '2026-10-20'],
    ['morgen tandarts bellen', '2026-10-21'],
    ['overmorgen tandarts bellen', '2026-10-22'],
    ['vanavond tandarts bellen', '2026-10-20'],
    ['morgenochtend tandarts bellen', '2026-10-21'],
    ['donderdag tandarts bellen', '2026-10-22'],
    ['do tandarts bellen', '2026-10-22'],
    ['dinsdag tandarts bellen', '2026-10-27'],         // vandaag is dinsdag: de volgende
    ['aanstaande vrijdag tandarts bellen', '2026-10-23'],
    ['volgende week dinsdag tandarts bellen', '2026-10-27'],
    ['volgende week donderdag tandarts bellen', '2026-10-29'],
    ['25 december cadeaus inpakken', '2026-12-25'],
    ['25 dec cadeaus inpakken', '2026-12-25'],
    ['op 3 november cadeaus inpakken', '2026-11-03'],
    ['3/11 cadeaus inpakken', '2026-11-03'],
    ['18 oktober cadeaus inpakken', '2027-10-18'],      // in het verleden: volgend jaar
    ['18-10 cadeaus inpakken', '2027-10-18'],
    ['29 februari cadeaus inpakken', '2028-02-29'],     // 2027 is geen schrikkeljaar
  ])('%s', (zin, datum) => {
    expect(b(zin).datum).toBe(datum);
  });
  it('de jaargrens: 2 januari vanaf eind december', () => {
    expect(b('2 januari bellen', { vandaag: '2026-12-30' }).datum).toBe('2027-01-02');
  });
  it('de ISO-week: "volgende week maandag" op een zondag', () => {
    expect(b('volgende week maandag bellen', { vandaag: '2026-10-25' }).datum).toBe('2026-10-26');
  });
  it('"zo" en "ma" zijn geen dagen (gewone woorden)', () => {
    expect(b('zo snel mogelijk ma bellen')).toMatchObject({ datum: null, titel: 'Zo snel mogelijk ma bellen' });
  });
  it('een maandnaam alleen naast een getal: Mei blijft een lid', () => {
    expect(b('morgen met Mei naar de bieb om 10')).toMatchObject({ wie: ['m-mei'], datum: '2026-10-21' });
  });
});

describe('tijd', () => {
  it.each([
    ['tandarts om 16:00', '16:00', undefined],
    ['tandarts om 16.30', '16:30', undefined],
    ['tandarts 16u', '16:00', undefined],
    ['tandarts om 16 uur', '16:00', undefined],
    ['tandarts om 9', '09:00', undefined],
    ['tandarts om 12', '12:00', undefined],
    ['overleg van 9 tot 10', '09:00', '10:00'],
    ['overleg 9:30-11', '09:30', '11:00'],
    ['overleg van 3 tot 5', '15:00', '17:00'],
  ])('%s', (zin, start, eind) => {
    const v = b(zin);
    expect(v.soort).toBe('afspraak');
    expect(v.start).toBe(start);
    expect(v.eind).toBe(eind);
  });
  it('V2: "om 4" wordt 16:00, en dat staat er zichtbaar bij', () => {
    const v = b('kapper om 4');
    expect(v.start).toBe('16:00');
    expect(meldingen(v)).toContain('middag');
  });
  it('"om 04:00" blijft 04:00 (met een voorloopnul bedoeld)', () => {
    expect(b('vlucht om 04:00').start).toBe('04:00');
  });
  it('"10-12" wordt een tijd, met een melding dat het geen datum is', () => {
    const v = b('overleg 10-12');
    expect(v).toMatchObject({ start: '10:00', eind: '12:00' });
    expect(meldingen(v)).toContain('tijd-of-datum');
  });
  it('een los getal is geen tijd', () => {
    expect(b('3 kaarsjes kopen')).toMatchObject({ soort: 'boodschap', start: undefined });
  });
  it('een afspraak zonder dag in de zin: vandaag, zichtbaar als aanname', () => {
    const v = b('tandarts om 16:00');
    expect(v.datum).toBe('2026-10-20');
    expect(v.aangenomen).toContain('datum');
  });
});

describe('personen', () => {
  it('meer leden bij een afspraak', () => {
    expect(b('morgen met Lotte en Daan naar de film om 19')).toMatchObject({ soort: 'afspraak', wie: ['m-lotte', 'm-daan'], titel: 'Naar de film' });
  });
  it('hoofdletters en accenten maken niet uit', () => {
    expect(b('morgen om 10 met lois zwemmen').wie).toEqual(['m-loes']);
  });
  it('"Daantje" is geen Daan (hele woorden)', () => {
    expect(b('Daantje ophalen').wie).toEqual([]);
  });
  it('een bijna-naam ("Lyn") wordt niet vanzelf Lynn: een voorstel en een melding, het woord blijft in de titel', () => {
    const v = b('morgen om 15:00 met Lyn naar de tandarts');
    expect(v.wie).toEqual([]);
    expect(v.titel).toBe('Met Lyn naar de tandarts');
    expect(v.suggesties).toEqual([{ woord: 'Lyn', lid: 'm-lynn', naam: 'Lynn' }]);
    expect(meldingen(v)).toContain('onbekende-naam');
  });
  it('een taak met één persoon', () => {
    expect(b('voor Thomas: band plakken')).toMatchObject({ soort: 'taak', wie: ['m-thomas'], titel: 'Band plakken' });
  });
  it('een taak met twee personen: de namen blijven in de titel, met een melding', () => {
    const v = b('Lotte en Daan kamer opruimen');
    expect(v).toMatchObject({ soort: 'taak', wie: [], titel: 'Lotte en Daan kamer opruimen' });
    expect(meldingen(v)).toContain('taak-meer-personen');
  });
  it('"iedereen" bij een afspraak: het hele huishouden', () => {
    expect(b('zaterdag om 18 met z\'n allen uit eten')).toMatchObject({ soort: 'afspraak', wie: [], titel: 'Uit eten' });
  });
});

describe('soort, plek, herhaling en privé', () => {
  it('een plek aan het eind maakt er een afspraak van', () => {
    expect(b('donderdag zwemles in het Sportfondsenbad')).toMatchObject({ soort: 'afspraak', plek: 'het Sportfondsenbad', titel: 'Zwemles' });
  });
  it('"bij" midden in de zin is geen plek', () => {
    expect(b('bij oma langs morgen')).toMatchObject({ soort: 'taak', plek: undefined, titel: 'Bij oma langs' });
    // Na "bij oma" komt nog een herkend stuk (de tijd): dan is het geen plek, en blijft het in de titel.
    expect(b('zwemles bij oma om 16')).toMatchObject({ soort: 'afspraak', plek: undefined, titel: 'Zwemles bij oma', start: '16:00' });
  });
  it('een herhaling op een weekdag', () => {
    expect(b('elke donderdag zwemles om 16')).toMatchObject({ soort: 'afspraak', herhaling: { freq: 'wekelijks', tot: null }, datum: '2026-10-22', start: '16:00' });
  });
  it('een herhaling met een einde', () => {
    expect(b('elke week pianoles om 17 tot 18 december').herhaling).toEqual({ freq: 'wekelijks', tot: '2026-12-18' });
  });
  it('V3: "stofzuigen elke vrijdag" wordt een afspraak voor de hele dag, met een eerlijke melding', () => {
    const v = b('stofzuigen elke vrijdag');
    expect(v).toMatchObject({ soort: 'afspraak', titel: 'Stofzuigen', datum: '2026-10-23', start: undefined });
    expect(meldingen(v)).toContain('herhalende-taak');
  });
  it('privé (met en zonder accent)', () => {
    expect(b('morgen om 14 privé fysio')).toMatchObject({ soort: 'afspraak', prive: true, titel: 'Fysio' });
    expect(b('morgen om 14 prive fysio').prive).toBe(true);
  });
  it('privé bij een taak kan niet: zichtbaar gemeld, niet stil toegepast', () => {
    const v = b('privé cadeau regelen');
    expect(v).toMatchObject({ soort: 'taak', prive: false });
    expect(meldingen(v)).toContain('prive-geen-afspraak');
  });
  it('zonder privé-woord is een afspraak gedeeld (de knop staat altijd in beeld)', () => {
    expect(b('morgen om 14 fysio').prive).toBe(false);
  });
  it('V1: een taak zonder dag krijgt geen datum', () => {
    expect(b('band plakken')).toMatchObject({ soort: 'taak', datum: null });
  });
});

describe('waar je vandaan komt, en wat de gebruiker kiest', () => {
  it('vanuit een dag in de Agenda: die dag, zichtbaar als aanname', () => {
    const v = b('tandarts om 9', { standaard: { datum: '2026-11-02' } });
    expect(v.datum).toBe('2026-11-02');
    expect(v.aangenomen).toContain('datum');
  });
  it('een gekozen soort wint van de zin', () => {
    expect(b('melk halen', {}, { soort: 'taak' })).toMatchObject({ soort: 'taak', titel: 'Melk halen' });
  });
  it('een onderdeel terugzetten: het woord staat weer in de titel', () => {
    expect(b('morgen tandarts bellen', {}, { negeer: new Set(['datum']) })).toMatchObject({ datum: null, titel: 'Morgen tandarts bellen' });
    expect(b('donderdag zwemles in het bad', {}, { negeer: new Set(['plek']) })).toMatchObject({ plek: undefined, titel: 'Zwemles in het bad' });
    expect(b('morgen met Lynn naar de dokter om 9', {}, { negeer: new Set(['wie']) })).toMatchObject({ wie: [], titel: 'Met Lynn naar de dokter' });
  });
  it('een lege of alleen-spaties-zin: geen titel, een melding', () => {
    for (const z of ['', '   ']) expect(meldingen(b(z))).toContain('geen-titel');
  });
  it('alleen een dag, zonder iets te regelen: geen titel', () => {
    expect(meldingen(b('morgen'))).toContain('geen-titel');
  });
});

describe('F8: "voor <vakantie>" (alleen de volledige naam van een lopende of komende vakantie)', () => {
  const VAK = { vakanties: [{ id: 'v-fr', naam: 'Frankrijk' }, { id: 'v-texel', naam: 'Kerst op Texel' }, { id: 'v-noorwegen', naam: 'Noorwegen' }] };
  it('de drie voorbeelden: boodschap en taak gekoppeld, zonder vakantie geen koppeling', () => {
    expect(b('Zonnebrand kopen voor Frankrijk', VAK)).toMatchObject({ soort: 'boodschap', boodschappen: ['Zonnebrand'], vakantie: 'v-fr' });
    expect(b('Paspoorten controleren voor Frankrijk', VAK)).toMatchObject({ soort: 'taak', titel: 'Paspoorten controleren', vakantie: 'v-fr' });
    expect(b('Muggenspray kopen', VAK)).toMatchObject({ soort: 'boodschap', boodschappen: ['Muggenspray'], vakantie: null });
  });
  it('een naam van meer woorden wordt geen datum of plek; meerdere boodschappen in één zin', () => {
    expect(b('Kerstkransjes kopen voor Kerst op Texel', VAK)).toMatchObject({ boodschappen: ['Kerstkransjes'], vakantie: 'v-texel', datum: null, plek: undefined });
    expect(b('Zonnebrand, muggenspray en pleisters kopen voor Frankrijk', VAK)).toMatchObject({ boodschappen: ['Zonnebrand', 'Muggenspray', 'Pleisters'], vakantie: 'v-fr' });
  });
  it('hoofdletters en accenten maken niet uit; met een datum erbij blijft die herkend', () => {
    expect(b('vignet regelen VOOR frankrijk vrijdag', VAK)).toMatchObject({ soort: 'taak', titel: 'Vignet regelen', vakantie: 'v-fr', datum: '2026-10-23' });
    expect(b('Zonnebrand kopen voor Italie', { vakanties: [{ id: 'v-it', naam: 'Italië' }] })).toMatchObject({ vakantie: 'v-it', boodschappen: ['Zonnebrand'] });
  });
  it('geen koppeling bij twijfel: zonder "voor", een voorbije vakantie (niet in de lijst), alleen een deel van de naam, "in …"', () => {
    expect(b('Zonnebrand Frankrijk kopen', VAK).vakantie).toBeNull();
    expect(b('Zonnebrand kopen voor Italië', VAK)).toMatchObject({ vakantie: null, boodschappen: ['Zonnebrand voor Italië'] });
    expect(b('Kransjes kopen voor Kerst', VAK)).toMatchObject({ vakantie: null, boodschappen: ['Kransjes voor Kerst'] });
    expect(b('Paspoorten controleren in Frankrijk', VAK)).toMatchObject({ soort: 'afspraak', plek: 'Frankrijk', vakantie: null });
    expect(b('Zonnebrand voor de vakantie', VAK).vakantie).toBeNull();
    expect(b('Muggenspray kopen voor later', VAK)).toMatchObject({ vakantie: null, boodschappen: ['Muggenspray voor later'] });
  });
  it('twee vakanties met dezelfde naam: niets vanzelf, wel een keuze en een melding', () => {
    const v = b('Zonnebrand kopen voor Frankrijk', { vakanties: [{ id: 'v-fr1', naam: 'Frankrijk' }, { id: 'v-fr2', naam: 'frankrijk' }] });
    expect(v).toMatchObject({ vakantie: null, vakantieKeuze: ['v-fr1', 'v-fr2'], boodschappen: ['Zonnebrand'] });
    expect(meldingen(v)).toContain('vakantie-twijfel');
  });
  it('een lid wint van een vakantie met dezelfde naam; een bijna-naam is alleen een voorstel', () => {
    expect(b('Zonnebrand kopen voor Lotte', { vakanties: [{ id: 'v-l', naam: 'Lotte' }] })).toMatchObject({ soort: 'taak', wie: ['m-lotte'], vakantie: null });
    const v = b('Zonnebrand kopen voor Frankrik', VAK);
    expect(v).toMatchObject({ vakantie: null, vakantieSuggestie: { woord: 'Frankrik', naam: 'Frankrijk' }, boodschappen: ['Zonnebrand voor Frankrik'] });
    expect(meldingen(v)).toContain('onbekende-vakantie');
  });
  it('een afspraak koppelen kan nog niet: de vakantie blijft in de titel, met een melding', () => {
    const v = b('Ferry boeken om 10:00 voor Frankrijk', VAK);
    expect(v).toMatchObject({ soort: 'afspraak', titel: 'Ferry boeken voor Frankrijk', vakantie: null, start: '10:00' });
    expect(meldingen(v)).toContain('vakantie-afspraak');
    // Ook als de gebruiker zelf Afspraak kiest.
    expect(b('Zonnebrand kopen voor Frankrijk', VAK, { soort: 'afspraak' })).toMatchObject({ vakantie: null, titel: 'Zonnebrand kopen voor Frankrijk' });
  });
  it('terug in de titel (negeer), meer personen bij een taak, en een lege titel', () => {
    expect(b('Zonnebrand kopen voor Frankrijk', VAK, { negeer: new Set(['vakantie']) })).toMatchObject({ vakantie: null, boodschappen: ['Zonnebrand voor Frankrijk'] });
    expect(b('Paspoorten controleren voor Frankrijk met Eva en Thomas', VAK)).toMatchObject({ soort: 'taak', vakantie: 'v-fr', wie: [] });
    expect(meldingen(b('kopen voor Frankrijk', VAK))).toContain('geen-titel');
  });
  it('zonder vakanties in de context: alles zoals het was', () => {
    expect(b('Zonnebrand kopen voor Frankrijk')).toMatchObject({ boodschappen: ['Zonnebrand voor Frankrijk'], vakantie: null, vakantieKeuze: [] });
  });
});
