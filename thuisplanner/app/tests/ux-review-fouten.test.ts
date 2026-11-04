import { demoItems } from '../src/data/demo';
import { eerstvolgende, afsprakenOp, loopt, straks } from '../src/lib/vandaag';
import { categorie } from '../src/lib/categorie';
import { begrijp } from '../src/lib/zin';
import type { Afspraak, Item, Lid } from '../src/lib/types';

// De fouten uit de UX-review van 4 november 2026.
const V = '2026-11-04';   // een woensdag
const leden = [{ id: 'm-l', naam: 'Lotte', soort: 'kind', kleur: '', heeftAccount: false }] as Lid[];
const b = (t: string) => begrijp(t, { vandaag: V, leden }, {});

describe('een weekdag met een datum erachter', () => {
  it('de datum wint, en staat niet in de titel', () => {
    const v = b('vrijdag 13 november schoolreis Lotte 8:30');
    expect(v).toMatchObject({ soort: 'afspraak', datum: '2026-11-13', start: '08:30', titel: 'Schoolreis', wie: ['m-l'] });
    expect(v.meldingen.map(m => m.soort)).not.toContain('datum-weekdag');
  });
  it('spreken ze elkaar tegen, dan wint de datum en zegt de kaart dat', () => {
    const v = b('vrijdag 14 november schoolreis');
    expect(v.datum).toBe('2026-11-14');
    expect(v.meldingen).toContainEqual({ soort: 'datum-weekdag', tekst: 'Je schreef vrijdag, maar dit is een zaterdag.' });
  });
  it('tegenproeven: wat ernaast staat blijft zoals het was', () => {
    expect(b('vrijdag tandarts 13:00')).toMatchObject({ datum: '2026-11-06', start: '13:00' });
    expect(b('vrijdag 8:30 schoolreis')).toMatchObject({ datum: '2026-11-06', start: '08:30', titel: 'Schoolreis' });
    expect(b('vrijdag 9-10 zwemmen')).toMatchObject({ datum: '2026-11-06', start: '09:00', eind: '10:00' });
    expect(b('vrijdag 13 appels plukken').datum).toBe('2026-11-06');
    expect(b('13 november schoolreis').datum).toBe('2026-11-13');
  });
  it('ook bij "tot" na een herhaling', () => {
    expect(b('elke week zwemles tot vrijdag 13 november').herhaling?.tot).toBe('2026-11-13');
  });
});

describe('wc papier zonder streepje', () => {
  it.each(['wc papier', 'wc-papier', 'wcpapier', 'toilet papier', 'wc rol', 'toiletrol'])('%s is een product', n => {
    expect(categorie(n)).toBe('huishouden');
  });
  it('een lijst met wc papier wordt boodschappen', () => {
    expect(b('melk, eieren en wc papier')).toMatchObject({ soort: 'boodschap', boodschappen: ['Melk', 'Eieren', 'Wc papier'] });
  });
  it('tegenproeven: een lijst zonder producten blijft een taak, en "papier" alleen wordt geen product', () => {
    expect(b('bellen, mailen, opruimen').soort).toBe('taak');
    expect(categorie('papier')).toBe('overig');
  });
});

describe('Vandaag', () => {
  const items: Item[] = demoItems(V, 'gewoon');
  it('een herhalende afspraak in Straks is hetzelfde voorkomen als in de lijst', () => {
    const lijst = afsprakenOp(items, V);
    const eerst = eerstvolgende(lijst, '08:10')!;
    expect(eerst.titel).toBe('Zwemles');
    expect(lijst.filter(a => a !== eerst).map(a => a.titel)).not.toContain('Zwemles');
    // De oude aanpak rekende opnieuw: dat geeft een ander object, en daarom stond hij er twee keer.
    expect(straks(items, V, '08:10')).not.toBe(eerst);
  });
  it('loopt: alleen tussen begin en eind', () => {
    const a = { start: '13:00', eind: '14:30' } as Afspraak;
    expect(['12:59', '13:00', '14:29', '14:30'].map(n => loopt(a, n))).toEqual([false, true, true, false]);
    expect(loopt({ start: '13:00' } as Afspraak, '13:00')).toBe(false);
    expect(loopt({} as Afspraak, '13:00')).toBe(false);
  });
});
