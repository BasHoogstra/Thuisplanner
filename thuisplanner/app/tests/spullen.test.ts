// Mijn spullen & Documenten: de pure regels en de vraagbron. De verwachte waarden staan hier vast.
import { describe, expect, it } from 'vitest';
import { DEMO_AANKOOP, FACTUUR_REGELS, demoSpullen, maakVoorbeeldPdf } from '../src/data/spullen-demo';
import { herkenIntentie } from '../src/lib/intentie';
import { controleer, nieuweMaat, typeUitBytes } from '../src/lib/spullen/bestand';
import {
  WETTELIJKE_UITLEG, aandachtsvelden, bedrag, documentenVan, dubbelDocument, inPrullenbak, koppel, leesBedrag, ontkoppel,
  spullenVan, terugzettenTot, veldStatus, woordPast, zichtbaarVoorLid, zoekDocumenten, zoekSpullen,
} from '../src/lib/spullen/logica';
import type { Spul, SpullenGegevens } from '../src/lib/spullen/types';
import { beantwoordSpullen, eerder } from '../src/lib/vraag/spullen';

const VANDAAG = '2026-10-28';
const eva = () => zichtbaarVoorLid(demoSpullen(VANDAAG), 'm-eva');
const vraag = (zin: string, g: SpullenGegevens = eva(), opties = {}) => beantwoordSpullen(herkenIntentie(zin), g, VANDAAG, opties);

describe('veldstatus', () => {
  const s: Spul = { id: 'x', naam: 'Test', zichtbaarheid: 'gedeeld', eigenaar: 'm-eva', merk: 'A', model: 'B', status: { model: 'voorstel', winkel: 'voorstel' } };
  it('ingevuld is bevestigd, een voorstel blijft een voorstel, leeg is ontbreekt (ook met een status)', () => {
    expect(veldStatus(s, 'merk')).toBe('bevestigd');
    expect(veldStatus(s, 'model')).toBe('voorstel');
    expect(veldStatus(s, 'winkel')).toBe('ontbreekt');
  });
  it('aandacht: eerst voorstellen, dan wat ontbreekt', () => {
    expect(aandachtsvelden(s, ['merk', 'winkel', 'model'])).toEqual([{ veld: 'model', status: 'voorstel' }, { veld: 'winkel', status: 'ontbreekt' }]);
  });
});

describe('bedragen in centen', () => {
  it.each([['549', 54900], ['549,00', 54900], ['€ 549,-', 54900], ['1.299,95', 129995], ['12,5', 1250], ['abc', null], ['', null], ['1,999', null]])(
    '%s → %s', (t, c) => expect(leesBedrag(t)).toBe(c));
  it('weergave', () => { expect(bedrag(54900)).toBe('€549,00'); expect(bedrag(129995)).toBe('€1.299,95'); });
});

describe('zichtbaarheid (besluit 14)', () => {
  it('een persoonlijk document van een ander bestaat niet, ook zijn koppeling niet', () => {
    const g = eva();
    expect(g.documenten.map(d => d.id)).not.toContain('d-polis-thomas');
    expect(g.koppelingen.some(k => k.documentId === 'd-polis-thomas')).toBe(false);
  });
  it('de eigenaar ziet het wel', () => {
    expect(zichtbaarVoorLid(demoSpullen(VANDAAG), 'm-thomas').documenten.map(d => d.id)).toContain('d-polis-thomas');
  });
  it('tegenproef: zonder filter zou de + de polis van Thomas vinden', () => {
    const r = vraag('Laat de polis van de fiets zien', demoSpullen(VANDAAG));
    expect(r?.soort).toBe('antwoord');
    const r2 = vraag('Laat de polis van de fiets zien');
    expect(r2?.soort).toBe('ontbreekt');
    expect(JSON.stringify(r2)).not.toContain('Polis fietsverzekering');
  });
});

describe('koppelen zonder duplicaten', () => {
  it('één document, twee spullen; nogmaals koppelen maakt geen tweede rij', () => {
    let k = koppel([], 'd1', 's1');
    k = koppel(k, 'd1', 's2');
    k = koppel(k, 'd1', 's1');
    expect(k).toEqual([{ documentId: 'd1', spulId: 's1' }, { documentId: 'd1', spulId: 's2' }]);
    expect(ontkoppel(k, 'd1', 's1')).toEqual([{ documentId: 'd1', spulId: 's2' }]);
  });
  it('een document verschijnt bij het spul via de koppeling, niet als kopie', () => {
    const g = eva();
    expect(documentenVan(g, 's-afwasser').map(d => d.id)).toEqual(['d-factuur', 'd-bon', 'd-handleiding']);
    expect(spullenVan(g, 'd-factuur').map(s => s.id)).toEqual(['s-afwasser']);
    expect(g.documenten.filter(d => d.id === 'd-factuur')).toHaveLength(1);
  });
});

describe('prullenbak en dubbele uploads', () => {
  it('30 dagen terug te zetten', () => {
    const x = { verwijderdOp: '2026-10-01T10:00:00.000Z' };
    expect(inPrullenbak(x, new Date('2026-10-30T10:00:00.000Z'))).toBe(true);
    expect(inPrullenbak(x, new Date('2026-10-31T10:00:01.000Z'))).toBe(false);
    expect(terugzettenTot(x.verwijderdOp)).toBe('2026-10-31');
  });
  it('dezelfde SHA-256 is "staat er al", behalve in de prullenbak', () => {
    const docs = [{ ...eva().documenten[0], sha256: 'abc' }];
    expect(dubbelDocument(docs, 'abc')?.id).toBe('d-factuur');
    expect(dubbelDocument([{ ...docs[0], verwijderdOp: '2026-10-01T00:00:00Z' }], 'abc')).toBeUndefined();
    expect(dubbelDocument(docs, undefined)).toBeUndefined();
  });
});

describe('zoeken', () => {
  it('op naam, soort, merk, model en winkel; synoniemen; geen stukjes midden in een woord', () => {
    const s = eva().spullen;
    expect(zoekSpullen(s, 'vaatwasser').map(x => x.id)).toEqual(['s-afwasser']);
    expect(zoekSpullen(s, 'afwasmachine').map(x => x.id)).toEqual(['s-afwasser']);
    expect(zoekSpullen(s, 'AW-3000').map(x => x.id)).toEqual(['s-afwasser']);
    expect(zoekSpullen(s, 'voorbeeldwinkel').map(x => x.id)).toEqual(['s-afwasser']);
    expect(zoekSpullen(s, 'fiets').map(x => x.id)).toEqual(['s-fiets']);
    expect(zoekSpullen(s, 'was')).toEqual([]);
    expect(woordPast('dak', 'afdak')).toBe(false);
    expect(woordPast('vaat', 'vaatwasser')).toBe(true);
  });
  it('documenten op soort, jaar en het gekoppelde spul', () => {
    const g = eva();
    expect(zoekDocumenten(g, 'factuur vaatwasser').map(d => d.id)).toEqual(['d-factuur']);
    expect(zoekDocumenten(g, '2026').map(d => d.id)).toEqual(['d-factuur', 'd-bon']);
    expect(zoekDocumenten(g, 'handleiding').map(d => d.id)).toEqual(['d-handleiding']);
  });
});

describe('vragen beantwoorden uit het dossier, met bron', () => {
  it('Welk modelnummer heeft onze vaatwasser?', () => {
    const r = vraag('Welk modelnummer heeft onze vaatwasser?');
    expect(r).toMatchObject({ soort: 'antwoord', spulId: 's-afwasser', regel: 'Model: AW-3000-VB', voorstel: false });
    if (r?.soort !== 'antwoord') return;
    expect(r.bronnen[0]).toEqual({ soort: 'spul', id: 's-afwasser', label: 'Afwasser 3000 (voorbeeld)' });
    expect(r.bronnen.map(b => b.id)).toContain('d-factuur');
  });
  it('Wanneer hebben we de vaatwasser gekocht?', () => {
    expect(vraag('Wanneer hebben we de vaatwasser gekocht?')).toMatchObject({ soort: 'antwoord', regel: 'Gekocht op 28 oktober 2026 bij Voorbeeldwinkel' });
  });
  it('Laat de factuur van de vaatwasser zien: het document zelf', () => {
    const r = vraag('Laat de factuur van de vaatwasser zien');
    expect(r?.soort).toBe('antwoord');
    if (r?.soort === 'antwoord') expect(r.documenten?.map(d => d.id)).toEqual(['d-factuur']);
  });
  it('factuur vaatwasser (zonder vraagteken) vindt de factuur', () => {
    expect(vraag('factuur vaatwasser')?.soort).toBe('antwoord');
  });
  it('de garantie, met de vaste uitleg en zonder berekende wettelijke datum', () => {
    const r = vraag('Tot wanneer loopt de garantie van de vaatwasser?');
    expect(r).toMatchObject({ soort: 'antwoord', regel: 'Garantie tot 28 oktober 2028', uitleg: WETTELIJKE_UITLEG });
  });

  it('niets verzinnen: een ontbrekend veld zegt dat', () => {
    expect(vraag('Welk modelnummer heeft de fiets?')).toMatchObject({ soort: 'ontbreekt', regel: 'Bij Stadsfiets Lotte (voorbeeld) staat geen modelnummer.' });
    expect(vraag('Tot wanneer loopt de garantie van de fiets?')).toMatchObject({ soort: 'ontbreekt', regel: 'Bij Stadsfiets Lotte (voorbeeld) staat geen garantiedatum.' });
  });
  it('een voorstel telt niet als zeker antwoord', () => {
    const g = eva();
    g.spullen[0] = { ...g.spullen[0], status: { model: 'voorstel' } };
    expect(vraag('Welk modelnummer heeft onze vaatwasser?', g)).toMatchObject({ regel: 'Model: AW-3000-VB (nog niet bevestigd)', voorstel: true });
  });
  it('een onbekend spul: zeggen dat er niets is, niet gokken', () => {
    expect(vraag('Wanneer hebben we de wasmachine gekocht?')).toEqual({ soort: 'niets', regel: 'Ik vind geen spul dat past bij "wasmachine".' });
  });
  it('geen spul genoemd: één vraag welk spul', () => {
    const r = vraag('Wanneer verloopt de garantie?');
    expect(r).toMatchObject({ soort: 'kies', regel: 'Over welk spul gaat het?' });
    expect(vraag('Wanneer verloopt de garantie?', eva(), { gekozen: 's-afwasser' })).toMatchObject({ soort: 'antwoord' });
  });
  it('geen vraag over spullen: null (de bestaande werking of een andere bron)', () => {
    expect(vraag('Wanneer is de tandarts?')).toBeNull();
    expect(vraag('Wat moeten we nog kopen?')).toBeNull();
    expect(vraag('Zet zwemles donderdag om 16:00 in de agenda')).toBeNull();
    expect(vraag('Factuur betalen')).toBeNull();
  });
  it('een zoekopdracht die niets vindt, valt terug op de bestaande werking', () => {
    expect(vraag('factuur wasmachine')).toBeNull();
  });
  it('verwijderde spullen tellen niet mee', () => {
    const g = eva();
    g.spullen[0] = { ...g.spullen[0], verwijderdOp: '2026-10-27T00:00:00Z' };
    expect(vraag('Welk modelnummer heeft onze vaatwasser?', g)?.soort).toBe('niets');
  });
});

describe('vraag en actie: herinnering als voorstel voor een taak', () => {
  it('een maand voor de garantiedatum, pas na bevestiging', () => {
    const r = vraag('Wanneer verloopt de garantie van de vaatwasser? Herinner me een maand van tevoren');
    expect(r?.soort).toBe('antwoord');
    if (r?.soort !== 'antwoord') return;
    expect(r.vervolg).toEqual({ soort: 'taak', titel: 'Garantie Afwasser 3000 loopt af op 28 oktober 2028', datum: '2028-09-28', spulId: 's-afwasser', bestaat: false });
  });
  it('bestaat de taak al, dan geen tweede', () => {
    const taken = [{ id: 't', soort: 'taak' as const, titel: 'Garantie Afwasser 3000 loopt af op 28 oktober 2028', datum: '2028-09-28', voor: null, klaar: false }];
    const r = vraag('Wanneer verloopt de garantie van de vaatwasser? Herinner me een maand van tevoren', eva(), { taken });
    expect(r?.soort === 'antwoord' && r.vervolg).toMatchObject({ bestaat: true });
  });
  it('zonder garantiedatum wordt niets ingepland', () => {
    const r = vraag('Wanneer verloopt de garantie van de fiets? Herinner me een maand van tevoren');
    expect(r).toMatchObject({ soort: 'ontbreekt', vervolg: { soort: 'kan-niet' } });
  });
  it('maanden terugrekenen', () => {
    expect(eerder('2028-10-28', 1, 'maand')).toBe('2028-09-28');
    expect(eerder('2027-03-31', 1, 'maand')).toBe('2027-02-28');
    expect(eerder('2028-03-31', 1, 'maand')).toBe('2028-02-29');
    expect(eerder('2027-01-15', 2, 'maand')).toBe('2026-11-15');
    expect(eerder('2027-01-15', 2, 'week')).toBe('2027-01-01');
  });
});

describe('bestanden: type uit de bytes, niet uit de naam', () => {
  const b = (...x: number[]) => Uint8Array.from(x);
  it.each([
    [b(0x25, 0x50, 0x44, 0x46, 0x2d, 0x31), 'application/pdf'],
    [b(0xff, 0xd8, 0xff, 0xe0), 'image/jpeg'],
    [b(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a), 'image/png'],
    [b(0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50), 'image/webp'],
    [new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg">'), null],
    [new TextEncoder().encode('<!doctype html><html>'), null],
    [b(0x50, 0x4b, 0x03, 0x04), null],
    [b(), null],
  ])('%#', (bytes, type) => expect(typeUitBytes(bytes)).toBe(type));
  it('leeg, te groot of een vermomd bestand wordt geweigerd', () => {
    expect(controleer(new Uint8Array(), 0)).toMatchObject({ ok: false, reden: 'Dit bestand is leeg.' });
    expect(controleer(b(0x25, 0x50, 0x44, 0x46, 0x2d), 11 * 1024 * 1024)).toMatchObject({ ok: false });
    expect(controleer(new TextEncoder().encode('<html>'), 10)).toMatchObject({ ok: false });
  });
  it('de voorbeeld-PDF is een echte PDF met het watermerk', () => {
    const pdf = maakVoorbeeldPdf(FACTUUR_REGELS);
    expect(typeUitBytes(pdf)).toBe('application/pdf');
    const tekst = new TextDecoder().decode(pdf);
    expect(tekst).toContain('(VOORBEELD) Tj');
    expect(tekst.trimEnd().endsWith('%%EOF')).toBe(true);
    // De xref-verwijzing klopt: op die plek begint het woord xref.
    const xref = Number(/startxref\n(\d+)/.exec(tekst)![1]);
    expect(tekst.slice(xref, xref + 4)).toBe('xref');
  });
  it('foto verkleinen: langste zijde 2000, nooit groter', () => {
    expect(nieuweMaat(4032, 3024)).toEqual({ breedte: 2000, hoogte: 1500 });
    expect(nieuweMaat(3024, 4032)).toEqual({ breedte: 1500, hoogte: 2000 });
    expect(nieuweMaat(800, 600)).toEqual({ breedte: 800, hoogte: 600 });
  });
  it('de demodatum', () => expect(DEMO_AANKOOP).toBe('2026-10-28'));
});
