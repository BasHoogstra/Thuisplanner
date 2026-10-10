import { demoItems } from '../src/data/demo';
import { maandagVan, plusDagen } from '../src/lib/datum';
import { afspraakPast, taakPast } from '../src/lib/filter';
import {
  afsprakenTussen, herhalingTekst, leesVoorkomenId, verwijderReeks, verwijderVoorkomen, vindAfspraak,
  voorkomenDatums, wijzigVoorkomen, wordtDubbel,
} from '../src/lib/herhaling';
import { dagInhoud, maandRaster, plusMaanden } from '../src/lib/kalender';
import { isBezetVanAnder, plekVoor, titelVoor, zichtbaarVoor } from '../src/lib/rechten';
import { beginStaat } from '../src/lib/store';
import { binnenkort, meedenker, straks } from '../src/lib/vandaag';
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
  it('tekst zegt eerlijk wanneer een reeks overslaat', () => {
    expect(herhalingTekst('2026-01-31', { freq: 'maandelijks' })).toBe('Elke maand op de 31e · niet in maanden zonder die dag');
    expect(herhalingTekst('2026-01-28', { freq: 'maandelijks' })).toBe('Elke maand op de 28e');
    expect(herhalingTekst('2028-02-29', { freq: 'jaarlijks' })).toBe('Elk jaar op 29 februari · alleen in schrikkeljaren');
  });
  it('maandelijks op de 30e en 29e rond februari, ook in een schrikkeljaar', () => {
    expect(voorkomenDatums('2027-01-30', { freq: 'maandelijks' }, '2027-01-01', '2027-03-31')).toEqual(['2027-01-30', '2027-03-30']);
    expect(voorkomenDatums('2028-01-29', { freq: 'maandelijks' }, '2028-01-01', '2028-03-31'))
      .toEqual(['2028-01-29', '2028-02-29', '2028-03-29']);
    expect(voorkomenDatums('2027-01-29', { freq: 'maandelijks' }, '2027-02-01', '2027-02-28')).toEqual([]);
  });
  it('jaarlijks over de jaargrens en vanaf een bereik midden in het jaar', () => {
    expect(voorkomenDatums('2025-12-31', { freq: 'jaarlijks' }, '2026-06-01', '2027-12-31')).toEqual(['2026-12-31', '2027-12-31']);
    expect(voorkomenDatums('2026-10-10', { freq: 'dagelijks' }, '2026-12-30', '2027-01-02'))
      .toEqual(['2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02']);
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
  it('verplaatsen naar een dag waarop de reeks al staat telt als dubbel; naar een vrije dag niet', () => {
    expect(wordtDubbel(items, 'r', '2026-10-17', '2026-10-24')).toBe(true);
    expect(wordtDubbel(items, 'r', '2026-10-17', '2026-10-18')).toBe(false);
    expect(wordtDubbel(items, 'r', '2026-10-17', '2026-10-17')).toBe(false); // tijd wijzigen op dezelfde dag
    const xs = wijzigVoorkomen(items, 'r', '2026-10-17', { ...reeks, id: 'los4', datum: '2026-10-18' });
    expect(wordtDubbel(xs, 'r', '2026-10-24', '2026-10-18')).toBe(true); // daar staat al een losgemaakt voorkomen
    // Een verwijderd voorkomen maakt de dag weer vrij.
    expect(wordtDubbel(verwijderVoorkomen(items, 'r', '2026-10-24'), 'r', '2026-10-17', '2026-10-24')).toBe(false);
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

  // Regressie: Vandaag (straks, binnenkort, meedenken) mocht nooit details van andermans privé-afspraak tonen,
  // ook niet als die details in de gegevens zouden zitten.
  const geheim: Afspraak = { id: 'g', soort: 'afspraak', titel: 'Geheim gesprek', plek: 'Geheime plek', datum: V,
    start: '12:00', wie: ['m-thomas'], eigenaar: 'm-thomas', zichtbaarheid: 'prive', voorbereiding: 'Geheime voorbereiding' };

  it('bij het laden verdwijnen titel, plek en voorbereiding van andermans privé-afspraak', () => {
    const [uit] = zichtbaarVoor([geheim], ik) as Afspraak[];
    expect(JSON.stringify(uit)).not.toMatch(/Geheim/);
    expect(uit.start).toBe('12:00');
    expect(zichtbaarVoor([geheim], 'm-thomas')[0]).toEqual(geheim); // de eigenaar ziet alles
    for (const i of beginStaat(V).items) expect(i.soort === 'afspraak' && isBezetVanAnder(i, ik) && (i.titel || i.plek)).toBeFalsy();
  });

  it('ook met details in de gegevens toont het scherm alleen "Bezet"', () => {
    expect(titelVoor(geheim, ik)).toBe('Bezet');
    expect(plekVoor(geheim, ik)).toBeUndefined();
    expect(titelVoor(geheim, 'm-thomas')).toBe('Geheim gesprek');
    expect(straks([geheim], V, '11:00')?.id).toBe('g'); // de afspraak telt mee, maar...
    const morgen = { ...geheim, datum: plusDagen(V, 1) };
    expect(meedenker([morgen], V, new Set(), ik)).toBeUndefined(); // ...meedenken verraadt niets
    expect(meedenker([morgen], V, new Set(), 'm-thomas')?.voorstel).toBe('Geheime voorbereiding');
    expect(binnenkort([morgen], V)[0].afspraken.map(a => titelVoor(a, ik))).toEqual(['Bezet']);
  });

  it('filterregels', () => {
    const a = items.find(i => i.id === 'a-eten') as Afspraak;
    expect(afspraakPast(a, 'm-daan')).toBe(true); // voor iedereen
    expect(taakPast({ id: 't', soort: 'taak', titel: 'x', datum: V, voor: null, klaar: false }, 'm-daan')).toBe(false);
    expect(taakPast({ id: 't', soort: 'taak', titel: 'x', datum: V, voor: null, klaar: false }, null)).toBe(true);
  });
});
