// Fictieve voorbeeldgegevens. Er bestaat geen echt gezin De Boer; alle namen, tijden en plekken zijn
// verzonnen. Datums zijn relatief aan "vandaag", zodat de demo altijd actueel oogt.
import { plusDagen } from '../lib/datum';
import type { Datum, Huishouden, Item, Pakitem, Paklijst, Vakantie, VakantieKoppeling } from '../lib/types';

export const huishouden: Huishouden = {
  naam: 'Familie De Boer',
  ik: 'm-eva',
  leden: [
    { id: 'm-eva', naam: 'Eva', soort: 'volwassene', kleur: 'var(--lid-1)', heeftAccount: true },
    { id: 'm-thomas', naam: 'Thomas', soort: 'volwassene', kleur: 'var(--lid-2)', heeftAccount: true },
    { id: 'm-lotte', naam: 'Lotte', soort: 'kind', kleur: 'var(--lid-3)', heeftAccount: false },
    { id: 'm-daan', naam: 'Daan', soort: 'kind', kleur: 'var(--lid-4)', heeftAccount: false },
  ],
};

export type Scenario = 'gewoon' | 'rustig';

export function demoItems(vandaag: Datum, scenario: Scenario): Item[] {
  const d = (n: number) => plusDagen(vandaag, n);
  const vooruit: Item[] = [
    { id: 'a-gym', soort: 'afspraak', titel: 'Gym', datum: d(1), start: '08:30', wie: ['m-lotte'],
      eigenaar: 'm-eva', zichtbaarheid: 'huishouden', plek: 'School', voorbereiding: 'Gymtas inpakken' },
    { id: 'a-oma', soort: 'afspraak', titel: 'Eten bij oma', datum: d(1), start: '17:30', wie: [],
      eigenaar: 'm-thomas', zichtbaarheid: 'huishouden' },
    { id: 'a-ouderavond', soort: 'afspraak', titel: 'Ouderavond groep 4', datum: d(3), start: '19:30',
      wie: ['m-eva', 'm-thomas'], eigenaar: 'm-eva', zichtbaarheid: 'huishouden', plek: 'De Regenboog' },
    { id: 'a-verjaardag', soort: 'afspraak', titel: 'Verjaardag Noor', datum: d(5), wie: ['m-lotte'],
      eigenaar: 'm-eva', zichtbaarheid: 'huishouden' },
    { id: 'a-tandarts', soort: 'afspraak', titel: 'Tandarts', datum: d(8), start: '10:15', wie: ['m-daan'],
      eigenaar: 'm-thomas', zichtbaarheid: 'huishouden', plek: 'Tandartspraktijk Centrum' },
    // Herhalende afspraken (KG-4). Ze vallen bewust niet op "vandaag", zodat de rustige dag rustig blijft.
    { id: 'a-papier', soort: 'afspraak', titel: 'Oud papier aan de straat', datum: d(5), wie: [],
      eigenaar: 'm-thomas', zichtbaarheid: 'huishouden', herhaling: { freq: 'maandelijks' } },
    { id: 'a-oma-jarig', soort: 'afspraak', titel: 'Oma Ria jarig', datum: d(23), wie: [],
      eigenaar: 'm-eva', zichtbaarheid: 'huishouden', herhaling: { freq: 'jaarlijks' } },
    { id: 't-belasting', soort: 'taak', titel: 'Aanslag gemeentebelasting nakijken', datum: null, voor: null,
      klaar: false },
  ];

  if (scenario === 'rustig') {
    return [
      ...vooruit,
      { id: 'b-melk', soort: 'boodschap', naam: 'Melk', afgevinkt: false },
      { id: 'b-brood', soort: 'boodschap', naam: 'Brood', afgevinkt: false },
    ];
  }

  return [
    // Wekelijkse zwemles, al een paar weken bezig.
    { id: 'a-zwem', soort: 'afspraak', titel: 'Zwemles', datum: d(-21), start: '09:15', eind: '10:00',
      wie: ['m-daan'], eigenaar: 'm-eva', zichtbaarheid: 'huishouden', plek: 'Sportfondsenbad',
      herhaling: { freq: 'wekelijks' } },
    { id: 'a-voetbal', soort: 'afspraak', titel: 'Voetbal', datum: d(0), start: '13:00', eind: '14:30',
      wie: ['m-lotte'], eigenaar: 'm-thomas', zichtbaarheid: 'huishouden', plek: 'Sportpark Noord' },
    // Privé-afspraak van Thomas: Eva ziet alleen dat hij bezet is (zie types.ts).
    { id: 'a-bezet', soort: 'afspraak', datum: d(-7), start: '15:00', eind: '16:00', wie: ['m-thomas'],
      eigenaar: 'm-thomas', zichtbaarheid: 'prive', herhaling: { freq: 'wekelijks' } },
    { id: 'a-eten', soort: 'afspraak', titel: 'Pizza bakken met de buren', datum: d(0), start: '18:00',
      wie: [], eigenaar: 'm-eva', zichtbaarheid: 'huishouden' },
    { id: 't-plant', soort: 'taak', titel: 'Plantenbak water geven', datum: d(0), voor: 'm-lotte', klaar: false },
    { id: 't-cadeau', soort: 'taak', titel: 'Cadeautje voor Noor kopen', datum: d(0), voor: 'm-eva', klaar: false },
    { id: 't-formulier', soort: 'taak', titel: 'Toestemmingsformulier schoolreis', datum: d(-1), voor: null,
      klaar: false },
    { id: 't-vuilnis', soort: 'taak', titel: 'Groene container buiten zetten', datum: d(0), voor: 'm-thomas',
      klaar: true, klaarOp: d(0) },
    { id: 't-band', soort: 'taak', titel: 'Fietsband Lotte plakken', datum: d(2), voor: 'm-thomas', klaar: false },
    ...vooruit,
    { id: 'b-melk', soort: 'boodschap', naam: 'Melk', afgevinkt: false },
    { id: 'b-pizza', soort: 'boodschap', naam: 'Pizzadeeg', afgevinkt: false },
    { id: 'b-mozz', soort: 'boodschap', naam: 'Mozzarella', afgevinkt: false },
    { id: 'b-tomaat', soort: 'boodschap', naam: 'Tomaten', afgevinkt: false },
    { id: 'b-bananen', soort: 'boodschap', naam: 'Bananen', afgevinkt: false },
    { id: 'b-wc', soort: 'boodschap', naam: 'Wc-papier', afgevinkt: true },
  ];
}

// ---- F8 Vakanties: fictieve vakanties (docs/thuisplanner-vakanties.md). Frankrijk begint over negen dagen (de kaart op
// Vandaag), Kerst op Texel heeft alleen een vertrekdatum, Noorwegen nog geen datum, en Italië is voorbij: daarvan kun je
// de paklijst overnemen. ----
export interface DemoVakanties {
  vakanties: Vakantie[];
  pakitems: Pakitem[];
  koppelingen: VakantieKoppeling[];
  /** Extra inpaklijsten (§20): Oma gaat mee naar Frankrijk; in Italië was er een lijst Strandspullen. */
  paklijsten: Paklijst[];
  /** Voorbereidingen (taken) en boodschappen voor de vakanties. */
  items: Item[];
}

export function demoVakanties(vandaag: Datum): DemoVakanties {
  const d = (n: number) => plusDagen(vandaag, n);
  const vakanties: Vakantie[] = [
    { id: 'v-frankrijk', naam: 'Frankrijk', vertrek: d(9), terug: d(23), bestemming: 'Ardèche',
      notities: 'Camping Les Peupliers, plek 14. Inchecken vanaf 15:00. Reserveringsnummer staat in de mail van maart.' },
    { id: 'v-texel', naam: 'Kerst op Texel', vertrek: d(64), terug: null, bestemming: 'De Koog' },
    { id: 'v-noorwegen', naam: 'Noorwegen', vertrek: null, terug: null },
    { id: 'v-italie', naam: 'Italië', vertrek: d(-120), terug: d(-106), bestemming: 'Gardameer' },
  ];
  let n = 0;
  const pak = (vakantieId: string, lid: string | null, namen: string[], ingepakt = 0): Pakitem[] =>
    namen.map((naam, i) => ({ id: `p-${vakantieId.slice(2)}-${++n}`, vakantieId, lid, naam, ingepakt: i < ingepakt,
      ingepaktOp: i < ingepakt ? `${d(-1)}T20:00:00.000Z` : null, ingepaktDoor: i < ingepakt ? lid ?? 'm-eva' : null }));
  const pakitems: Pakitem[] = [
    ...pak('v-frankrijk', 'm-eva', ['Zwemkleding', 'Sokken', 'Onderbroeken', 'Shirts korte mouw', 'Korte broeken', 'Vest', 'Sandalen', 'Leesboek', 'Zonnebril', 'Oplader telefoon'], 4),
    ...pak('v-frankrijk', 'm-thomas', ['Zwembroek', 'Sokken', 'Onderbroeken', 'Shirts', 'Wandelschoenen', 'Pet', 'Oplader telefoon']),
    ...pak('v-frankrijk', 'm-lotte', ['Zwempak', 'Sokken', 'Onderbroeken', 'Shirts', 'Knuffel', 'Tekenspullen', 'Waterschoenen'], 2),
    ...pak('v-frankrijk', 'm-daan', ['Zwembroek', 'Sokken', 'Onderbroeken', 'Shirts', 'Speen voor de nacht', 'Lievelingsboek']),
    ...pak('v-frankrijk', null, ['Paspoorten', 'Zonnebrand', 'EHBO-doos', 'Tent', 'Luchtbedden', 'Campingkookstel', 'Wasknijpers'], 1),
    ...pak('v-italie', 'm-eva', ['Zwemkleding', 'Sokken', 'Onderbroeken', 'Shirts korte mouw', 'Zonnehoed', 'Leesboek'], 6),
    ...pak('v-italie', 'm-thomas', ['Zwembroek', 'Sokken', 'Onderbroeken', 'Shirts', 'Wandelschoenen'], 5),
    ...pak('v-italie', 'm-lotte', ['Zwempak', 'Sokken', 'Onderbroeken', 'Knuffel', 'Duikbril'], 5),
    ...pak('v-italie', 'm-daan', ['Zwembroek', 'Sokken', 'Onderbroeken', 'Zwembandjes'], 4),
    ...pak('v-italie', null, ['Paspoorten', 'Zonnebrand', 'EHBO-doos', 'Strandlaken'], 4),
  ];
  const items: Item[] = [
    { id: 't-vignet', soort: 'taak', titel: 'Vignet regelen', datum: d(3), voor: 'm-thomas', klaar: false, vakantieId: 'v-frankrijk' },
    { id: 't-paspoort', soort: 'taak', titel: 'Paspoort Lotte ophalen', datum: d(5), voor: 'm-eva', klaar: false, vakantieId: 'v-frankrijk' },
    { id: 't-oppas', soort: 'taak', titel: 'Kattenoppas vragen', datum: null, voor: null, klaar: false, vakantieId: 'v-frankrijk' },
    { id: 't-camping', soort: 'taak', titel: 'Camping bevestigen', datum: null, voor: 'm-eva', klaar: true, klaarOp: d(-3), vakantieId: 'v-frankrijk' },
  ];
  // Boodschappen voor de vakanties staan bij "Later nodig": ze tellen niet mee in "Nu te kopen" (en dus ook niet in de
  // bestaande tellingen van de demo). Reisziektetabletten zijn voor twee vakanties: één boodschap, twee koppelingen.
  const later = (id: string, naam: string): Item => ({ id, soort: 'boodschap', naam, afgevinkt: false, later: true });
  items.push(
    later('b-zonnebrand-50', 'Zonnebrand factor 50'),
    later('b-muggenspray', 'Muggenspray'),
    later('b-reisziekte', 'Reisziektetabletten'),
    later('b-kerstkransjes', 'Kerstkransjes'),
  );
  const koppel = (vakantieId: string, boodschapId: string): VakantieKoppeling =>
    ({ id: `k-${vakantieId.slice(2)}-${boodschapId.slice(2)}`, vakantieId, boodschapId, afgehandeld: false });
  const koppelingen: VakantieKoppeling[] = [
    koppel('v-frankrijk', 'b-zonnebrand-50'), koppel('v-frankrijk', 'b-muggenspray'), koppel('v-frankrijk', 'b-reisziekte'),
    koppel('v-texel', 'b-reisziekte'), koppel('v-texel', 'b-kerstkransjes'),
  ];
  const paklijsten: Paklijst[] = [
    { id: 'l-frankrijk-oma', vakantieId: 'v-frankrijk', naam: 'Oma' },
    { id: 'l-italie-strand', vakantieId: 'v-italie', naam: 'Strandspullen' },
  ];
  const inLijst = (lijst: string, vakantieId: string, namen: string[], ingepakt = 0): Pakitem[] =>
    namen.map((naam, i) => ({ id: `p-${lijst.slice(2)}-${i + 1}`, vakantieId, lid: null, lijst, naam, ingepakt: i < ingepakt,
      ingepaktOp: i < ingepakt ? `${d(-1)}T20:00:00.000Z` : null, ingepaktDoor: i < ingepakt ? 'm-eva' : null }));
  pakitems.push(
    ...inLijst('l-frankrijk-oma', 'v-frankrijk', ['Medicijnen', 'Leesbril', 'Vest']),
    ...inLijst('l-italie-strand', 'v-italie', ['Parasol', 'Schepjes', 'Strandstoel'], 3),
  );
  return { vakanties, pakitems, paklijsten, koppelingen, items };
}
