// Eigen review van de herstelcommits (PR #54): opnieuw bewaren van een document met een nieuw spul.
//  P1-a  begint de app vers (ander bestand, geweigerd bestand of de rij is weg), dan een nieuwe document-UUID maar
//        hetzelfde nieuwe spul (geen tweede spul), en de oude onvoltooide documentrij gaat naar de prullenbak;
//  P1-b  de volgende poging stuurt de versies mee die de app na de vorige poging kende (een wijziging van de partner
//        tussendoor geeft een conflict, geen stille overschrijving); na een conflict zet opnieuw bewaren bewust door;
//  P2-a  "Niet afgerond" toont alleen de eigen onvoltooide uploads.
// Het gedrag van de opslag zelf (afstemmen met de verwachte versie) staat in tests/integratie/spullen-sync.test.mjs.
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const bewaarDocument = vi.fn();
const ruimOnvoltooidOp = vi.fn();
vi.mock('../../sync/spullen-opslag.js', () => ({ maakSpullenOpslag: () => ({ bewaarDocument, ruimOnvoltooidOp, openBestand: vi.fn(), padVan: (id: string) => id }) }));

import { CONFLICT_IN_VENSTER } from '../src/lib/acties';
import { gegevensUit, useSupabaseSpullen } from '../src/lib/spullen/opslag-supabase';
import type { Sessie } from '../src/lib/lokaal/sessie';
import type { NieuwDocument } from '../src/lib/spullen/opslag';
import type { Toestand } from '../../sync/thuisplanner-sync.js';

type Rij = { id: string; version: number; upload_status?: string; deleted_at?: string | null; wachtend?: boolean; owner_member_id?: string };
const invoer = (o: { poging?: string; bestand?: Blob } = {}): NieuwDocument => ({
  document: { titel: 'Factuur', soort: 'factuur', zichtbaarheid: 'gedeeld', type: 'application/pdf', grootte: 10 },
  bestand: o.bestand ?? new Blob(['%PDF-1.4']), spullen: [], poging: o.poging ?? 'p',
  nieuwSpul: { naam: 'Vaatwasser', zichtbaarheid: 'gedeeld' } as NieuwDocument['nieuwSpul'],
});

/** Een nagebootste sync: `syncToestand` is wat de sync na een poging kent (zoals na vernieuw()). */
function opzet() {
  bewaarDocument.mockReset();
  ruimOnvoltooidOp.mockReset();
  ruimOnvoltooidOp.mockResolvedValue({ ok: true });
  const syncToestand = { lid: { household_id: 'h', member_id: 'm-eva' }, spullen: [] as Rij[], documenten: [] as Rij[], documentKoppelingen: [] };
  const documentVerwijderen = vi.fn(async () => ({ ok: true }));   // hoort niet meer gebruikt te worden (opruimen via de opslag)
  const sessie = { syncObject: { toestand: syncToestand }, acties: { documentVerwijderen }, client: {} } as unknown as Sessie;
  const { result } = renderHook(() => useSupabaseSpullen(sessie, syncToestand as unknown as Toestand, vi.fn()));
  // Een poging die op de server de rijen achterlaat (spul en document met deze versies) en dan mislukt of lukt.
  const server = (uitkomst: Record<string, unknown>, rijen: { spul?: number; document?: number; upload?: string } = {}) =>
    bewaarDocument.mockImplementationOnce(async (a: { documentId: string; nieuwSpul?: { id: string } }) => {
      if (rijen.spul !== undefined && a.nieuwSpul) {
        syncToestand.spullen = [...syncToestand.spullen.filter(x => x.id !== a.nieuwSpul!.id), { id: a.nieuwSpul.id, version: rijen.spul }];
      }
      if (rijen.document !== undefined) {
        syncToestand.documenten = [...syncToestand.documenten.filter(x => x.id !== a.documentId),
          { id: a.documentId, version: rijen.document, upload_status: rijen.upload ?? 'wacht', deleted_at: null, owner_member_id: 'm-eva' }];
      }
      return uitkomst;
    });
  const bewaar = async (n: NieuwDocument) => { let fout: Error | null = null; await act(async () => { try { await result.current.documentBewaren(n); } catch (e) { fout = e as Error; } }); return fout as Error | null; };
  const oproep = (i: number) => bewaarDocument.mock.calls[i][0] as { documentId: string; documentVersie?: number; nieuwSpul: { id: string; versie?: number } };
  return { bewaar, server, oproep, documentVerwijderen, syncToestand };
}

describe('P1-a: vers beginnen maakt geen tweede spul en laat geen oude rij staan', () => {
  it('geweigerd bestand (opnieuw: false): nieuwe document-UUID, hetzelfde spul, de oude onvoltooide rij naar de prullenbak', async () => {
    const o = opzet();
    o.server({ ok: false, fase: 'controle', opnieuw: false, tekst: 'Geweigerd' }, { spul: 1, document: 1, upload: 'mislukt' });
    o.server({ ok: true }, { spul: 1, document: 1, upload: 'klaar' });
    expect((await o.bewaar(invoer()))?.message).toBe('Geweigerd');
    expect(await o.bewaar(invoer({ bestand: new Blob(['%PDF-1.4 ander']) }))).toBeNull();
    expect(o.oproep(1).nieuwSpul.id).toBe(o.oproep(0).nieuwSpul.id);
    expect(o.oproep(1).documentId).not.toBe(o.oproep(0).documentId);
    expect(ruimOnvoltooidOp).toHaveBeenCalledWith(o.oproep(0).documentId);
  });
  it('ander bestand na een mislukte upload: eerst de oude rij opruimen (afgewacht), dan hetzelfde spul met een nieuw document', async () => {
    const o = opzet();
    const volgorde: string[] = [];
    ruimOnvoltooidOp.mockImplementation(async (id: string) => { volgorde.push('opruimen ' + id); return { ok: true }; });
    o.server({ ok: false, fase: 'upload', opnieuw: true, tekst: 'Mislukt' }, { spul: 1, document: 1 });
    await o.bewaar(invoer());
    bewaarDocument.mockImplementationOnce(async (a: { documentId: string }) => { volgorde.push('bewaren ' + a.documentId); return { ok: true }; });
    await o.bewaar(invoer({ bestand: new Blob(['%PDF-1.4 een ander bestand']) }));
    expect(o.oproep(1).nieuwSpul.id).toBe(o.oproep(0).nieuwSpul.id);
    expect(o.oproep(1).documentId).not.toBe(o.oproep(0).documentId);
    expect(volgorde).toEqual(['opruimen ' + o.oproep(0).documentId, 'bewaren ' + o.oproep(1).documentId]);
  });
  it('opruimen mislukt: niets bewaard, dezelfde UUID\x27s; de volgende poging ruimt eerst opnieuw op', async () => {
    const o = opzet();
    o.server({ ok: false, fase: 'upload', opnieuw: true, tekst: 'Mislukt' }, { spul: 1, document: 1 });
    await o.bewaar(invoer());
    ruimOnvoltooidOp.mockResolvedValueOnce({ ok: false, tekst: 'Geen verbinding' });
    expect((await o.bewaar(invoer({ bestand: new Blob(['%PDF-1.4 ander']) })))?.message).toBe('Geen verbinding');
    expect(bewaarDocument).toHaveBeenCalledTimes(1);
    o.server({ ok: true });
    await o.bewaar(invoer({ bestand: new Blob(['%PDF-1.4 ander']) }));
    expect(ruimOnvoltooidOp).toHaveBeenCalledTimes(2);
    expect(ruimOnvoltooidOp.mock.calls[1][0]).toBe(o.oproep(0).documentId);
    expect(o.oproep(1).documentId).not.toBe(o.oproep(0).documentId);
  });
  it('ook als de app de oude rij nooit terugzag (verloren antwoord), vraagt ze de opslag op te ruimen; zonder vers begin niet', async () => {
    const o = opzet();
    o.server({ ok: false, fase: 'begin', opnieuw: true, tekst: 'Geen verbinding' });   // geen rij in de toestand
    o.server({ ok: true });
    o.server({ ok: true });
    await o.bewaar(invoer());
    await o.bewaar(invoer());                                                          // zelfde bestand: niets op te ruimen
    expect(ruimOnvoltooidOp).not.toHaveBeenCalled();
    await o.bewaar(invoer({ bestand: new Blob(['%PDF-1.4 ander']) }));
    expect(ruimOnvoltooidOp).toHaveBeenCalledWith(o.oproep(0).documentId);
  });
  it('het spul is weg (opnieuw: false in de fase spul): dan wel een nieuw spul', async () => {
    const o = opzet();
    o.server({ ok: false, fase: 'spul', opnieuw: false, tekst: 'Weg' });
    o.server({ ok: true });
    await o.bewaar(invoer());
    await o.bewaar(invoer());
    expect(o.oproep(1).nieuwSpul.id).not.toBe(o.oproep(0).nieuwSpul.id);
  });
});

describe('R1: geen stille overschrijving van de partner; een versie alleen om na een conflict bewust door te zetten', () => {
  it('na een mislukte poging stuurt de app geen versie uit de toestand mee, ook niet als Realtime daar een nieuwere versie bracht', async () => {
    const o = opzet();
    o.server({ ok: false, fase: 'upload', opnieuw: true, tekst: 'Mislukt' }, { spul: 1, document: 1 });
    o.server({ ok: true });
    await o.bewaar(invoer());
    // Intussen paste de partner het spul aan, en de app kreeg dat via Realtime binnen (versie 2 in de toestand).
    o.syncToestand.spullen = o.syncToestand.spullen.map(s => ({ ...s, version: 2 }));
    await o.bewaar(invoer());
    const a = bewaarDocument.mock.calls[1][0] as { documentVersie?: number; documentEigen: unknown[]; nieuwSpul: { versie?: number; eigen: unknown[] } };
    expect(a.nieuwSpul.versie).toBeUndefined();               // de opslag beslist op de eerder ingestuurde velden
    expect(a.documentVersie).toBeUndefined();
    expect(a.nieuwSpul.eigen).toHaveLength(1);
    expect(a.documentEigen).toHaveLength(1);
  });
  it('conflict: de melding van het venster; alleen de volgende poging zet door met de versie van de melding, daarna niet meer', async () => {
    const o = opzet();
    o.server({ ok: false, fase: 'upload', opnieuw: true, tekst: 'Mislukt' }, { spul: 1, document: 1 });
    o.server({ ok: false, fase: 'spul', opnieuw: true, conflict: true, versie: 3, tekst: 'conflict' });
    o.server({ ok: false, fase: 'upload', opnieuw: true, tekst: 'Mislukt' });
    o.server({ ok: true });
    await o.bewaar(invoer());
    expect((await o.bewaar(invoer()))?.message).toBe(CONFLICT_IN_VENSTER);
    await o.bewaar(invoer());
    await o.bewaar(invoer());
    expect(o.oproep(2).nieuwSpul.versie).toBe(3);
    expect(o.oproep(2).nieuwSpul.id).toBe(o.oproep(0).nieuwSpul.id);
    expect(o.oproep(3).nieuwSpul.versie).toBeUndefined();
  });
});

describe('P2-3: zonder bekende versie stuurt de app de velden mee die deze invoer eerder instuurde', () => {
  it('een verloren antwoord (geen rij gezien): de tweede poging kent de velden van de eerste; een vers document begint zonder', async () => {
    const o = opzet();
    o.server({ ok: false, fase: 'spul', opnieuw: true, tekst: 'Geen antwoord' });           // de app ziet de rijen nooit terug
    o.server({ ok: true });
    o.server({ ok: true });
    await o.bewaar(invoer());
    const prive = invoer();
    prive.document.zichtbaarheid = 'persoonlijk';
    await o.bewaar(prive);
    const a = bewaarDocument.mock.calls[1][0] as { documentVersie?: number; documentEigen: Record<string, unknown>[]; nieuwSpul: { versie?: number; eigen: Record<string, unknown>[] } };
    expect(a.documentVersie).toBeUndefined();
    expect(a.nieuwSpul.versie).toBeUndefined();
    expect(a.documentEigen).toEqual([expect.objectContaining({ visibility: 'household' })]);
    expect(a.nieuwSpul.eigen).toEqual([expect.objectContaining({ name: 'Vaatwasser' })]);
    // Een ander bestand: een nieuw document zonder geschiedenis, het spul houdt de zijne.
    await o.bewaar(invoer({ bestand: new Blob(['%PDF-1.4 ander']) }));
    const b = bewaarDocument.mock.calls[2][0] as { documentEigen: unknown[]; nieuwSpul: { eigen: unknown[] } };
    expect(b.documentEigen).toEqual([]);
    expect(b.nieuwSpul.eigen).toHaveLength(2);
  });
});

describe('P2-a: "Niet afgerond" alleen voor de eigenaar', () => {
  it('een onvoltooid document van de partner staat er niet in, een eigen wel', () => {
    const rij = (id: string, eigenaar: string, upload: string) => ({ id, household_id: 'h', title: 'T ' + id, kind: 'factuur', document_date: null,
      visibility: 'household', owner_member_id: eigenaar, upload_status: upload, mime: 'application/pdf', size_bytes: 10, sha256: null, version: 1, deleted_at: null });
    const t = { lid: { household_id: 'h', member_id: 'm-eva' }, spullen: [], documentKoppelingen: [],
      documenten: [rij('eigen', 'm-eva', 'wacht'), rij('partner', 'm-thomas', 'wacht'), rij('klaar', 'm-thomas', 'klaar')] } as unknown as Toestand;
    const { gegevens, onvoltooid } = gegevensUit(t);
    expect(onvoltooid.map(d => d.id)).toEqual(['eigen']);
    expect(gegevens.documenten.map(d => d.id)).toEqual(['klaar']);
  });
});
