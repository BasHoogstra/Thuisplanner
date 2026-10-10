import { demoItems } from '../src/data/demo';
import { begroeting, dagLabel, naarDatum, plusDagen } from '../src/lib/datum';
import type { Afspraak, Item, Taak } from '../src/lib/types';
import {
  achterstand, binnenkort, isVoorbij, meedenker, openBoodschappen, samenvatting, straks, takenVandaag,
} from '../src/lib/vandaag';
import { splitsBoodschappen } from '../src/lib/boodschappen';

const V = '2026-10-10';

describe('datum', () => {
  it('rekent in lokale dagen, ook over een maandgrens', () => {
    expect(plusDagen('2026-10-31', 1)).toBe('2026-11-01');
    expect(plusDagen('2026-03-28', 1)).toBe('2026-03-29'); // zomertijd
    expect(naarDatum(new Date(2026, 9, 10, 23, 59))).toBe(V);
  });
  it('labels en begroeting', () => {
    expect(dagLabel(V, V)).toBe('Vandaag');
    expect(dagLabel('2026-10-11', V)).toBe('Morgen');
    expect(dagLabel('2026-10-13', V)).toBe('Dinsdag 13 oktober');
    expect([5, 9, 14, 20].map(begroeting)).toEqual(['Goedenacht', 'Goedemorgen', 'Goedemiddag', 'Goedenavond']);
  });
});

describe('Vandaag-selectie', () => {
  const items = demoItems(V, 'gewoon');

  it('straks: de eerstvolgende afspraak die nog niet voorbij is', () => {
    expect(straks(items, V, '08:00')?.titel).toBe('Zwemles');
    expect(straks(items, V, '11:20')?.titel).toBe('Voetbal');
    expect(straks(items, V, '14:00')?.titel).toBe('Voetbal'); // loopt nog
    expect(straks(items, V, '19:00')).toBeUndefined();
  });

  it('een afspraak zonder tijd is nooit voorbij', () => {
    const a: Afspraak = { id: 'x', soort: 'afspraak', titel: 'Hele dag', datum: V, wie: [], eigenaar: 'm-eva', zichtbaarheid: 'huishouden' };
    expect(isVoorbij(a, '23:59')).toBe(false);
  });

  it('taken: alleen open taken tot en met vandaag; "ooit" en morgen niet', () => {
    const extra: Taak[] = [
      { id: 'm', soort: 'taak', titel: 'Morgen', datum: plusDagen(V, 1), voor: null, klaar: false },
      { id: 'k', soort: 'taak', titel: 'Klaar', datum: V, voor: null, klaar: true },
    ];
    const t = takenVandaag([...items, ...extra], V).map(x => x.titel);
    expect(t).toEqual(['Toestemmingsformulier schoolreis', 'Plantenbak water geven', 'Cadeautje voor Noor kopen']);
  });

  it('achterstand in gewone woorden', () => {
    const t = (datum: string): Taak => ({ id: 'a', soort: 'taak', titel: 'x', datum, voor: null, klaar: false });
    expect(achterstand(t(V), V)).toBe('');
    expect(achterstand(t('2026-10-09'), V)).toBe('sinds gisteren');
    expect(achterstand(t('2026-10-07'), V)).toBe('sinds 3 dagen');
  });

  it('binnenkort laat lege dagen weg', () => {
    const b = binnenkort(items, V);
    expect(b.map(d => d.datum)).toEqual(['2026-10-11', '2026-10-13']);
  });

  it('samenvatting zonder oordeel of score', () => {
    expect(samenvatting(0, 0)).toBe('Een rustige dag. Er staat niets voor je klaar.');
    expect(samenvatting(1, 0)).toBe('Vandaag: 1 afspraak.');
    expect(samenvatting(2, 1)).toBe('Vandaag: 2 afspraken en 1 taak.');
  });

  it('boodschappen: alleen wat nog niet is afgevinkt', () => {
    expect(openBoodschappen(items).map(b => b.naam)).not.toContain('Wc-papier');
  });
});

describe('meedenker', () => {
  const items = demoItems(V, 'gewoon');

  it('hooguit één signaal, voor morgen, met de voorbereiding', () => {
    const m = meedenker(items, V, new Set(), 'm-eva');
    expect(m?.afspraak.id).toBe('a-gym');
    expect(m?.voorstel).toBe('Gymtas inpakken');
  });
  it('zwijgt als het al als taak bestaat of is weggeklikt', () => {
    const metTaak: Item[] = [...items, { id: 'g', soort: 'taak', titel: 'gymtas inpakken', datum: V, voor: null, klaar: false }];
    expect(meedenker(metTaak, V, new Set(), 'm-eva')).toBeUndefined();
    expect(meedenker(items, V, new Set(['a-gym']), 'm-eva')).toBeUndefined();
  });
  it('zwijgt over afspraken verder weg dan morgen', () => {
    expect(meedenker(items, '2026-10-08', new Set(), 'm-eva')).toBeUndefined();
  });
});

describe('demogegevens', () => {
  it('privé-afspraak van een ander bevat geen titel of plek', () => {
    const prive = demoItems(V, 'gewoon').filter((i): i is Afspraak => i.soort === 'afspraak' && i.zichtbaarheid === 'prive');
    expect(prive).toHaveLength(1);
    expect(prive[0].eigenaar).not.toBe('m-eva');
    expect(prive[0].titel).toBeUndefined();
    expect(prive[0].plek).toBeUndefined();
  });
  it('de rustige dag heeft vandaag niets', () => {
    const r = demoItems(V, 'rustig');
    expect(takenVandaag(r, V)).toHaveLength(0);
    expect(r.filter(i => i.soort === 'afspraak' && i.datum === V)).toHaveLength(0);
  });
});

describe('splitsBoodschappen', () => {
  it('splitst op komma, nieuwe regel en "en"; hoofdletter; geen lege', () => {
    expect(splitsBoodschappen('eieren, kaas en appels')).toEqual(['Eieren', 'Kaas', 'Appels']);
    expect(splitsBoodschappen(' , \nmelk\n')).toEqual(['Melk']);
    expect(splitsBoodschappen('tenen')).toEqual(['Tenen']); // "en" binnen een woord splitst niet
  });
});
