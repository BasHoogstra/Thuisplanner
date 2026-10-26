// De betekenis in gewone taal voor de kaart van de + (src/lib/betekenis.ts). Vaste dag: dinsdag 20 oktober 2026.
import { betekenis, opsomming, type BetekenisInvoer } from '../src/lib/betekenis';

const V = '2026-10-20';
const basis: BetekenisInvoer = { soort: 'taak', titel: 'X', boodschappen: [], datum: null, datumAangenomen: false, wie: [], later: false, vandaag: V };
const b = (x: Partial<BetekenisInvoer>) => betekenis({ ...basis, ...x });

it('opsomming: één, twee, drie, en vanaf vier "en N meer"', () => {
  expect(opsomming(['Melk'])).toBe('Melk');
  expect(opsomming(['Melk', 'Brood'])).toBe('Melk en Brood');
  expect(opsomming(['Melk', 'Brood', 'Kaas'])).toBe('Melk, Brood en Kaas');
  expect(opsomming(['Melk', 'Brood', 'Kaas', 'Eieren'])).toBe('Melk, Brood en 2 meer');
});

it('afspraak: dag en tijd, met wie, plek; hele dag; aanname in woorden; herhaling', () => {
  expect(b({ soort: 'afspraak', titel: 'Tandarts', datum: '2026-10-21', start: '15:00', wie: ['Lotte'] }))
    .toEqual({ titel: 'Tandarts', regel: 'Morgen om 15:00 · met Lotte' });
  expect(b({ soort: 'afspraak', datum: '2026-10-21', start: '09:00', eind: '10:00', wie: ['Lotte', 'Daan'], plek: 'het bad' }).regel)
    .toBe('Morgen om 09:00–10:00 · met Lotte en Daan · het bad');
  expect(b({ soort: 'afspraak', datum: '2026-10-21' }).regel).toBe('Morgen, hele dag');
  expect(b({ soort: 'afspraak', datum: V, datumAangenomen: true, start: '09:00' }).regel).toBe('Vandaag om 09:00 (geen dag genoemd)');
  expect(b({ soort: 'afspraak', datum: '2026-10-22', start: '16:00', herhaling: { freq: 'wekelijks', tot: null } }).regel)
    .toBe('Elke week op donderdag om 16:00');
});

it('taak: zonder datum, met dag, voor wie, en als voorbereiding van een vakantie', () => {
  expect(b({}).regel).toBe('Zonder datum');
  expect(b({ datum: '2026-10-21', wie: ['Thomas'] }).regel).toBe('Morgen · voor Thomas');
  expect(b({ vakantie: 'Frankrijk' }).regel).toBe('Voorbereiding voor Frankrijk');
  expect(b({ datum: '2026-10-23', vakantie: 'Frankrijk' }).regel).toBe('Vrijdag 23 oktober · voorbereiding voor Frankrijk');
});

it('boodschap: de namen als titel; op de lijst, bij Later nodig, of voor een vakantie (later of nu)', () => {
  expect(b({ soort: 'boodschap', boodschappen: ['Melk', 'Brood'] })).toEqual({ titel: 'Melk en Brood', regel: 'Op de boodschappenlijst' });
  expect(b({ soort: 'boodschap', boodschappen: ['Cadeaupapier'], later: true }).regel).toBe('Bij Later nodig');
  expect(b({ soort: 'boodschap', boodschappen: ['Zonnebrand'], vakantie: 'Frankrijk', later: true }).regel).toBe('Voor Frankrijk · bij Later nodig');
  expect(b({ soort: 'boodschap', boodschappen: ['Zonnebrand'], vakantie: 'Frankrijk', later: false }).regel).toBe('Voor Frankrijk · nu te kopen');
});
