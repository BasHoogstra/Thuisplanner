import { demoItems } from '../src/data/demo';
import { maandagVan, plusDagen } from '../src/lib/datum';
import { afspraakPast, taakPast } from '../src/lib/filter';
import {
  afsprakenTussen, herhalingTekst, leesVoorkomenId, verwijderReeks, verwijderVoorkomen, vindAfspraak,
  voorkomenDatums, wijzigVoorkomen,
} from '../src/lib/herhaling';
import { dagInhoud, maandRaster, plusMaanden } from '../src/lib/kalender';
import { isBezetVanAnder } from '../src/lib/rechten';
import type { Afspraak, Item } from '../src/lib/types';

const V = '2026-10-10'; // zaterdag

describe('datumgrenzen', () => {
  it('maandraster: hele weken van maandag t/m zondag', () => {
    const okt = maandRaster('2026-10-10');
    expect(okt[0]).toBe('2026-09-28');
    expect(okt.at(-1)).toBe('2026-11-01');
    expect(okt).toHaveLength(35);
    expect(maandRaster('2027-02-14')).toHaveLength(28); // 1 feb 2027 is een maandag, 28 dagen
    const maart = maandRaster('2026-03-01'); // 1 maart 2026 is een zondag
    expect(maart[0]).toBe('2026-02-23');
    expect(maart).toHaveLength(42);
  });
  it('maanden verder en terug, ook over de jaargrens en vanaf de 31e', () => {
    expect(plusMaanden('2026-01-31', 1)).toBe('2026-02-01');
    expect(plusMaanden('2026-12-15', 1)).toBe('2027-01-01');
    expect(plusMaanden('2026-01-15', -1)).toBe('2025-12-01');
    expect(plusMaanden('2026-10-10', 12)).toBe('2027-10-01');
  });
  it('week over de jaargrens', () => {
    expect(maandagVan('2027-01-01')).toBe('2026-12-28');
    expect(maandagVan('2027-01-03')).toBe('2026-12-28');
  });
});

describe('herhaling', () => {
  it('dagelijks, met einddatum (inclusief)', () => {
    expect(voorkomenDatums('2026-10-10', { freq: 'dagelijks', tot: '2026-10-12' }, '2026-10-01', '2026-10-31'))
      .toEqual(['2026-10-10', '2026-10-11', '2026-10-12']);
  });
  it('wekelijks: alleen binnen het bereik, niet vóór de eerste keer, over de zomertijd heen', () => {
    expect(voorkomenDatums('2026-03-21', { freq: 'wekelijks' }, '2026-03-22', '2026-04-11'))
      .toEqual(['2026-03-28', '2026-04-04', '2026-04-11']);
    expect(voorkomenDatums('2026-10-10', { freq: 'wekelijks' }, '2026-10-01', '2026-10-09')).toEqual([]);
  });
  it('maandelijks op de 31e slaat korte maanden over', () => {
    expect(voorkomenDatums('2026-01-31', { freq: 'maandelijks' }, '2026-01-01', '2026-06-30'))
      .toEqual(['2026-01-31', '2026-03-31', '2026-05-31']);
  });
  it('jaarlijks op 29 februari alleen in schrikkeljaren', () => {
    expect(voorkomenDatums('2024-02-29', { freq: 'jaarlijks' }, '2024-01-01', '2032-12-31'))
      .toEqual(['2024-02-29', '2028-02-29', '2032-02-29']);
  });
  it('uitzonderingen tellen niet mee', () => {
    expect(voorkomenDatums('2026-10-03', { freq: 'wekelijks', uitzonderingen: ['2026-10-17'] }, '2026-10-01', '2026-10-31'))
      .toEqual(['2026-10-03', '2026-10-10', '2026-10-24', '2026-10-31']);
  });
  it('tekst in gewone woorden', () => {
    expect(herhalingTekst(V, { freq: 'wekelijks' })).toBe('Elke week op zaterdag');
    expect(herhalingTekst(V, { freq: 'maandelijks' })).toBe('Elke maand op de 10e');
    expect(herhalingTekst(V, { freq: 'jaarlijks', tot: '2030-10-10' })).toBe('Elk jaar op 10 oktober · tot en met 10 oktober 2030');
  });
});

describe('reeks wijzigen zonder dubbelingen', () => {
  const reeks: Afspraak = { id: 'r', soort: 'afspraak', titel: 'Zwemles', datum: '2026-10-03', start: '09:15', wie: ['m-daan'],
    eigenaar: 'm-eva', zichtbaarheid: 'huishouden', herhaling: { freq: 'wekelijks' } };
  const items: Item[] = [reeks];
  const op = (xs: Item[], d: string) => afsprakenTussen(xs, d, d);

  it('één voorkomen wijzigen: precies één afspraak op die dag, de rest van de reeks blijft', () => {
    let xs = wijzigVoorkomen(items, 'r', '2026-10-17', { ...reeks, id: 'los1', datum: '2026-10-17', start: '10:30' });
    expect(op(xs, '2026-10-17')).toHaveLength(1);
    expect(op(xs, '2026-10-17')[0].start).toBe('10:30');
    expect(op(xs, '2026-10-24')[0].start).toBe('09:15');
    // Nog eens hetzelfde voorkomen losmaken mag de uitzondering niet dubbel opslaan.
    xs = verwijderVoorkomen(xs, 'r', '2026-10-17');
    const r = xs.find(i => i.id === 'r') as Afspraak;
    expect(r.herhaling?.uitzonderingen).toEqual(['2026-10-17']);
  });
  it('een voorkomen verplaatsen: weg van de oude dag, één keer op de nieuwe', () => {
    const xs = wijzigVoorkomen(items, 'r', '2026-10-17', { ...reeks, id: 'los2', datum: '2026-10-18' });
    expect(op(xs, '2026-10-17')).toHaveLength(0);
    expect(op(xs, '2026-10-18')).toHaveLength(1);
    expect((xs.find(i => i.id === 'los2') as Afspraak).herhaling).toBeUndefined();
  });
  it('hele reeks verwijderen haalt ook losgemaakte voorkomens weg', () => {
    const xs = wijzigVoorkomen(items, 'r', '2026-10-17', { ...reeks, id: 'los3', datum: '2026-10-17' });
    expect(verwijderReeks(xs, 'r')).toEqual([]);
  });
  it('voorkomens openen: alleen op echte datums van de reeks', () => {
    expect(leesVoorkomenId('r@2026-10-17')).toEqual({ reeksId: 'r', datum: '2026-10-17' });
    expect(vindAfspraak(items, 'r@2026-10-17')?.datum).toBe('2026-10-17');
    expect(vindAfspraak(items, 'r@2026-10-16')).toBeUndefined(); // vrijdag
    expect(vindAfspraak(verwijderVoorkomen(items, 'r', '2026-10-17'), 'r@2026-10-17')).toBeUndefined();
  });
});

describe('privacy en gezinsfilter', () => {
  const items = demoItems(V, 'gewoon');
  const ik = 'm-eva';

  it('elk voorkomen van de privé-reeks van Thomas is "bezet", zonder titel of plek', () => {
    const bezet = afsprakenTussen(items, V, plusDagen(V, 60)).filter(a => a.eigenaar === 'm-thomas' && a.zichtbaarheid === 'prive');
    expect(bezet.length).toBeGreaterThan(5);
    for (const a of bezet) {
      expect(isBezetVanAnder(a, ik)).toBe(true);
      expect(a.titel).toBeUndefined();
      expect(a.plek).toBeUndefined();
    }
  });

  it('filter op een lid: eigen afspraken en die voor iedereen; taken alleen van dat lid', () => {
    const lotte = dagInhoud(items, V, 'm-lotte');
    expect(lotte.afspraken.map(a => a.titel)).toEqual(['Voetbal', 'Pizza bakken met de buren']);
    expect(lotte.taken.map(t => t.titel)).toEqual(['Plantenbak water geven']);
    const thomas = dagInhoud(items, V, 'm-thomas');
    expect(thomas.afspraken.map(a => a.titel ?? 'bezet')).toEqual(['bezet', 'Pizza bakken met de buren']);
    const iedereen = dagInhoud(items, V, null);
    expect(iedereen.afspraken).toHaveLength(4);
  });

  it('filterregels', () => {
    const a = items.find(i => i.id === 'a-eten') as Afspraak;
    expect(afspraakPast(a, 'm-daan')).toBe(true); // voor iedereen
    expect(taakPast({ id: 't', soort: 'taak', titel: 'x', datum: V, voor: null, klaar: false }, 'm-daan')).toBe(false);
    expect(taakPast({ id: 't', soort: 'taak', titel: 'x', datum: V, voor: null, klaar: false }, null)).toBe(true);
  });
});
