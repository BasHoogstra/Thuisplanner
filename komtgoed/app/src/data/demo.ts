// Fictieve voorbeeldgegevens. Er bestaat geen echt gezin De Boer; alle namen, tijden en plekken zijn
// verzonnen. Datums zijn relatief aan "vandaag", zodat de demo altijd actueel oogt.
import { plusDagen } from '../lib/datum';
import type { Datum, Huishouden, Item } from '../lib/types';

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
    { id: 'a-zwem', soort: 'afspraak', titel: 'Zwemles', datum: d(0), start: '09:15', eind: '10:00',
      wie: ['m-daan'], eigenaar: 'm-eva', zichtbaarheid: 'huishouden', plek: 'Sportfondsenbad' },
    { id: 'a-voetbal', soort: 'afspraak', titel: 'Voetbal', datum: d(0), start: '13:00', eind: '14:30',
      wie: ['m-lotte'], eigenaar: 'm-thomas', zichtbaarheid: 'huishouden', plek: 'Sportpark Noord' },
    // Privé-afspraak van Thomas: Eva ziet alleen dat hij bezet is (zie types.ts).
    { id: 'a-bezet', soort: 'afspraak', datum: d(0), start: '15:00', eind: '16:00', wie: ['m-thomas'],
      eigenaar: 'm-thomas', zichtbaarheid: 'prive' },
    { id: 'a-eten', soort: 'afspraak', titel: 'Pizza bakken met de buren', datum: d(0), start: '18:00',
      wie: [], eigenaar: 'm-eva', zichtbaarheid: 'huishouden' },
    { id: 't-plant', soort: 'taak', titel: 'Plantenbak water geven', datum: d(0), voor: 'm-lotte', klaar: false },
    { id: 't-cadeau', soort: 'taak', titel: 'Cadeautje voor Noor kopen', datum: d(0), voor: 'm-eva', klaar: false },
    { id: 't-formulier', soort: 'taak', titel: 'Toestemmingsformulier schoolreis', datum: d(-1), voor: null,
      klaar: false },
    ...vooruit,
    { id: 'b-melk', soort: 'boodschap', naam: 'Melk', afgevinkt: false },
    { id: 'b-pizza', soort: 'boodschap', naam: 'Pizzadeeg', afgevinkt: false },
    { id: 'b-mozz', soort: 'boodschap', naam: 'Mozzarella', afgevinkt: false },
    { id: 'b-tomaat', soort: 'boodschap', naam: 'Tomaten', afgevinkt: false },
    { id: 'b-bananen', soort: 'boodschap', naam: 'Bananen', afgevinkt: false },
    { id: 'b-wc', soort: 'boodschap', naam: 'Wc-papier', afgevinkt: true },
  ];
}
