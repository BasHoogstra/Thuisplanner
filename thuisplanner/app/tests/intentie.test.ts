// De intentie van een zin in de +: vraag, actie, vraag en actie, of onduidelijk (docs/thuisplanner-spullen-documenten.md §13).
// De verwachte uitkomsten staan hier vast; ze komen niet uit de code zelf.
import { describe, expect, it } from 'vitest';
import { herkenIntentie } from '../src/lib/intentie';
import { begrijp } from '../src/lib/zin';

const soort = (z: string) => herkenIntentie(z).soort;
const gevraagd = (z: string) => { const i = herkenIntentie(z); return i.soort === 'actie' ? null : i.vraag.gevraagd; };

describe('vragen', () => {
  it.each([
    ['Welk modelnummer heeft onze vaatwasser?', 'model'],
    ['Wanneer hebben we de vaatwasser gekocht?', 'aankoopdatum'],
    ['Laat de factuur van de vaatwasser zien', 'document'],
    ['Waar hebben we de vaatwasser gekocht?', 'winkel'],
    ['Hoeveel kostte de vaatwasser?', 'prijs'],
    ['Wat is het serienummer van de vaatwasser?', 'serienummer'],
    ['Van welk merk is de vaatwasser?', 'merk'],
    ['Tot wanneer loopt de garantie van de vaatwasser?', 'garantie'],
    ['Toon de bon van de vaatwasser', 'document'],
    ['Hebben we een handleiding van de vaatwasser?', 'document'],
    ['Zoek de factuur van de fiets', 'document'],
    ['Wanneer hebben we de vaatwasser gekocht', 'aankoopdatum'],
    ['Hebben we een bon van de fiets', 'document'],
  ])('%s → vraag (%s)', (zin, veld) => {
    expect(soort(zin)).toBe('vraag');
    expect(gevraagd(zin)).toBe(veld);
  });

  it('een korte zoekopdracht zonder vraagteken is alleen een mogelijke vraag', () => {
    const i = herkenIntentie('factuur vaatwasser');
    expect(i.soort).toBe('vraag');
    if (i.soort === 'vraag') { expect(i.vraag.zekerheid).toBe('zoek'); expect(i.vraag.documentSoort).toBe('factuur'); }
  });

  it('een vraag met een vraagteken is zeker', () => {
    const i = herkenIntentie('Wanneer hebben we de vaatwasser gekocht?');
    if (i.soort !== 'vraag') throw new Error('geen vraag');
    expect(i.vraag.zekerheid).toBe('zeker');
    expect(i.vraag.woorden).toContain('vaatwasser');
  });
});

describe('acties blijven acties (de bestaande + verandert niet)', () => {
  it.each([
    'Zet zwemles donderdag om 16:00 in de agenda',
    'Morgen 15:00 tandarts met Lotte',
    'Melk, brood en kaas',
    'Factuur betalen',
    'Factuur vaatwasser betalen vrijdag',
    'Bon inleveren bij de winkel om 10:00',
    'Fietsband plakken',
    'Elke vrijdag stofzuigen',
    'Handleiding printen',
    'Polis opzeggen voor 1 december',
    '',
  ])('%s → actie', zin => {
    expect(soort(zin)).toBe('actie');
  });

  it('begrijp() geeft voor een actie precies hetzelfde als zonder intentielaag', () => {
    // De intentielaag leest alleen; begrijp() wordt niet aangeroepen of gewijzigd.
    const ctx = { vandaag: '2026-10-28', leden: [] };
    const zin = 'Zet zwemles donderdag om 16:00 in de agenda';
    const voor = begrijp(zin, ctx);
    herkenIntentie(zin);
    expect(begrijp(zin, ctx)).toEqual(voor);
  });
});

describe('vraag en actie', () => {
  it('Wanneer verloopt de garantie? Herinner me een maand van tevoren', () => {
    const i = herkenIntentie('Wanneer verloopt de garantie? Herinner me een maand van tevoren');
    expect(i.soort).toBe('vraag-en-actie');
    if (i.soort !== 'vraag-en-actie') return;
    expect(i.vraag.gevraagd).toBe('garantie');
    expect(i.vervolg).toMatchObject({ soort: 'herinnering', aantal: 1, eenheid: 'maand' });
  });

  it.each([
    ['Wanneer verloopt de garantie van de vaatwasser? Herinner mij 2 weken eerder', 2, 'week'],
    ['Tot wanneer loopt de garantie? Herinner me tien dagen van tevoren', 10, 'dag'],
    ['Wanneer verloopt de garantie? Herinner me op tijd', 1, 'maand'],
  ])('%s', (zin, aantal, eenheid) => {
    const i = herkenIntentie(zin);
    expect(i.soort).toBe('vraag-en-actie');
    if (i.soort === 'vraag-en-actie') expect(i.vervolg).toMatchObject({ aantal, eenheid });
  });

  it('een tweede zinsdeel dat geen herinnering is: de bestaande werking', () => {
    expect(soort('Wanneer is de tandarts? Zet het in de agenda')).toBe('actie');
  });
});

describe('onduidelijk: één gerichte vervolgvraag', () => {
  it.each(['Wanneer is het?', 'Wat?', 'Waar is dat?'])('%s', zin => {
    const i = herkenIntentie(zin);
    expect(i.soort).toBe('onduidelijk');
    if (i.soort === 'onduidelijk') expect(i.vervolgvraag).toBe('Waar gaat je vraag over?');
  });

  it('zonder vraagteken is een losse zin niet onduidelijk maar een actie of een gewone vraag', () => {
    expect(soort('Wat is het')).not.toBe('onduidelijk');
  });
});
