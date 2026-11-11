// P2 (review PR #54): opnieuw bewaren van een document na een fout of een verloren antwoord maakt geen tweede spul of
// document. Per invoer ("poging") dezelfde document- en spul-UUID; de sync en de opslag maken van een herhaling met
// dezelfde UUID niets dubbel (tests/integratie/spullen-sync.test.mjs, "opnieuw bewaren na een verloren antwoord").
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const bewaarDocument = vi.fn();
vi.mock('../../sync/spullen-opslag.js', () => ({ maakSpullenOpslag: () => ({ bewaarDocument, openBestand: vi.fn(), padVan: (id: string) => id }) }));

import { useSupabaseSpullen } from '../src/lib/spullen/opslag-supabase';
import type { Sessie } from '../src/lib/lokaal/sessie';
import type { NieuwDocument } from '../src/lib/spullen/opslag';
import type { Toestand } from '../../sync/thuisplanner-sync.js';

const toestand = { lid: { household_id: 'h', member_id: 'm-eva' }, spullen: [], documenten: [], documentKoppelingen: [] } as unknown as Toestand;
const invoer = (poging?: string): NieuwDocument => ({
  document: { titel: 'Factuur', soort: 'factuur', zichtbaarheid: 'gedeeld', type: 'application/pdf', grootte: 10 },
  bestand: new Blob(['%PDF-1.4']), spullen: [], nieuwSpul: { naam: 'Vaatwasser', zichtbaarheid: 'gedeeld' } as NieuwDocument['nieuwSpul'], poging,
});

function opzet() {
  bewaarDocument.mockReset();
  const sessie = { syncObject: {}, acties: {}, client: {} } as unknown as Sessie;
  return renderHook(() => useSupabaseSpullen(sessie, toestand, vi.fn())).result;
}
const ids = (n: number) => { const a = bewaarDocument.mock.calls[n][0]; return { document: a.documentId, spul: a.nieuwSpul?.id }; };

describe('document bewaren: opnieuw proberen gebruikt dezelfde UUID\x27s', () => {
  it('na een fout: tweede poging met dezelfde sleutel → zelfde document en spul', async () => {
    const r = opzet();
    bewaarDocument.mockResolvedValueOnce({ ok: false, fase: 'begin', opnieuw: true, tekst: 'Geen verbinding' }).mockResolvedValueOnce({ ok: true });
    await act(async () => { await expect(r.current.documentBewaren(invoer('p1'))).rejects.toThrow('Geen verbinding'); });
    await act(async () => { await r.current.documentBewaren(invoer('p1')); });
    expect(ids(1)).toEqual(ids(0));
  });
  it('voor elke fase (spul, begin, upload, bevestigen, koppelen) dezelfde UUID\x27s bij opnieuw proberen', async () => {
    const r = opzet();
    for (const fase of ['spul', 'begin', 'upload', 'bevestigen', 'koppelen']) bewaarDocument.mockResolvedValueOnce({ ok: false, fase, opnieuw: true, tekst: 'Mislukt' });
    bewaarDocument.mockResolvedValueOnce({ ok: true });
    for (let i = 0; i < 5; i++) await act(async () => { await expect(r.current.documentBewaren(invoer('p2'))).rejects.toThrow(); });
    await act(async () => { await r.current.documentBewaren(invoer('p2')); });
    for (let i = 1; i < 6; i++) expect(ids(i)).toEqual(ids(0));
  });
  it('tegenproef: een nieuwe invoer (andere sleutel) krijgt nieuwe UUID\x27s', async () => {
    const r = opzet();
    bewaarDocument.mockResolvedValue({ ok: true });
    await act(async () => { await r.current.documentBewaren(invoer('a')); });
    await act(async () => { await r.current.documentBewaren(invoer('b')); });
    expect(ids(1).document).not.toBe(ids(0).document);
    expect(ids(1).spul).not.toBe(ids(0).spul);
  });
});
