// Besluit 19 (23 november 2026): het Overzicht toont hoogstens 3 komende afspraken en 5 open taken. Wat te laat is of
// vandaag moet, wordt nooit weggedrukt door latere taken; taken uit plannen zonder datum horen er niet op.
import { describe, expect, it } from 'vitest';
import { komendeAfspraken, takenOverzicht, taakGroep } from '../src/lib/vandaag';
import type { Afspraak, Item, Taak } from '../src/lib/types';

const VANDAAG = '2026-11-24';
const afspraak = (id: string, datum: string, start?: string, eind?: string, extra: Partial<Afspraak> = {}): Afspraak =>
  ({ id, soort: 'afspraak', titel: id, datum, start, eind, wie: [], eigenaar: 'm-eva', zichtbaarheid: 'huishouden', ...extra });
const taak = (id: string, datum: string | null, extra: Partial<Taak> = {}): Taak =>
  ({ id, soort: 'taak', titel: id, datum, voor: null, klaar: false, ...extra });

describe('komende afspraken', () => {
  it('de 3 eerstvolgende met een tijd, vanaf nu en over de dagen heen; voorbij en hele dag tellen niet mee', () => {
    const items: Item[] = [
      afspraak('ochtend', VANDAAG, '08:00', '09:00'), afspraak('studiedag', VANDAAG), afspraak('lunch', VANDAAG, '12:00'),
      afspraak('morgen', '2026-11-25', '08:30'), afspraak('vrijdag', '2026-11-27', '19:30'), afspraak('ver', '2026-12-10', '10:00'),
    ];
    const k = komendeAfspraken(items, VANDAAG, '10:00');
    expect(k.eerst.map(x => x.afspraak.id)).toEqual(['lunch', 'morgen', 'vrijdag']);
    expect(k.eerst.map(x => x.datum)).toEqual([VANDAAG, '2026-11-25', '2026-11-27']);
    expect(k.heleDag.map(a => a.id)).toEqual(['studiedag']);
    expect(k.nogVandaag).toBe(0);
  });

  it('een drukke dag: de rest van vandaag wordt geteld; niets van na 7 dagen', () => {
    const items: Item[] = ['09', '10', '11', '12', '13'].map(u => afspraak(`a${u}`, VANDAAG, `${u}:00`));
    const k = komendeAfspraken(items, VANDAAG, '08:10');
    expect(k.eerst).toHaveLength(3);
    expect(k.nogVandaag).toBe(2);
    expect(komendeAfspraken([afspraak('ver', '2026-12-02', '10:00')], VANDAAG, '08:00').eerst).toHaveLength(0);
  });

  it('een privé-afspraak van een ander telt mee (het scherm toont "Bezet")', () => {
    const bezet = afspraak('fysio', VANDAAG, '15:00', '16:00', { eigenaar: 'm-thomas', zichtbaarheid: 'prive', wie: ['m-thomas'] });
    expect(komendeAfspraken([bezet], VANDAAG, '08:00').eerst.map(x => x.afspraak.id)).toEqual(['fysio']);
  });
});

describe('taken op het Overzicht', () => {
  it('vaste volgorde: te laat (oudste eerst), vandaag, deze week, zonder datum, later', () => {
    const items: Item[] = [
      taak('later', '2026-12-20'), taak('zonder', null), taak('week', '2026-11-27'), taak('vandaag', VANDAAG),
      taak('laat-1', '2026-11-23'), taak('laat-2', '2026-11-20'),
    ];
    const o = takenOverzicht(items, VANDAAG, 10);
    expect(o.zichtbaar.map(z => z.taak.id)).toEqual(['laat-2', 'laat-1', 'vandaag', 'week', 'zonder', 'later']);
  });

  it('te laat en vandaag worden nooit weggedrukt door latere taken; de rest wordt per groep geteld', () => {
    const items: Item[] = [
      ...Array.from({ length: 4 }, (_, i) => taak(`toekomst-${i}`, '2026-11-26')), taak('zonder', null),
      taak('laat', '2026-11-22'), taak('vandaag-1', VANDAAG), taak('vandaag-2', VANDAAG),
    ];
    const o = takenOverzicht(items, VANDAAG, 5);
    expect(o.zichtbaar.slice(0, 3).map(z => z.taak.id)).toEqual(['laat', 'vandaag-1', 'vandaag-2']);
    expect(o.zichtbaar).toHaveLength(5);
    expect(o.rest).toEqual({ 'te-laat': 0, vandaag: 0, week: 2, 'zonder-datum': 1, later: 0 });
  });

  it('meer dringende taken dan plekken: alleen dringende in beeld, de telling noemt de rest van te laat', () => {
    const items: Item[] = [...Array.from({ length: 4 }, (_, i) => taak(`laat-${i}`, '2026-11-2' + i)),
      ...Array.from({ length: 3 }, (_, i) => taak(`vandaag-${i}`, VANDAAG)), taak('week', '2026-11-26')];
    const o = takenOverzicht(items, VANDAAG, 5);
    expect(o.zichtbaar.every(z => z.groep === 'te-laat' || z.groep === 'vandaag')).toBe(true);
    expect(o.rest).toEqual({ 'te-laat': 0, vandaag: 2, week: 1, 'zonder-datum': 0, later: 0 });
  });

  it('afgerond telt niet mee; een plan-taak zonder datum hoort niet op het Overzicht, mét datum wel', () => {
    expect(taakGroep(taak('p', null, { planId: 'plan-1' }), VANDAAG)).toBeNull();
    expect(taakGroep(taak('p', '2026-11-25', { planId: 'plan-1' }), VANDAAG)).toBe('week');
    const o = takenOverzicht([taak('klaar', VANDAAG, { klaar: true }), taak('p', null, { planId: 'plan-1' })], VANDAAG);
    expect(o.zichtbaar).toHaveLength(0);
  });
});
