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
vi.mock('../../sync/spullen-opslag.js', () => ({ maakSpullenOpslag: () => ({ bewaarDocument, openBestand: vi.fn(), padVan: (id: string) => id }) }));

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
  const syncToestand = { lid: { household_id: 'h', member_id: 'm-eva' }, spullen: [] as Rij[], documenten: [] as Rij[], documentKoppelingen: [] };
  const documentVerwijderen = vi.fn(async () => ({ ok: true }));
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
    expect(o.documentVerwijderen).toHaveBeenCalledWith(expect.objectContaining({ id: o.oproep(0).documentId }));
  });
  it('ander bestand na een mislukte upload: hetzelfde spul, nieuw document, oude rij weg', async () => {
    const o = opzet();
    o.server({ ok: false, fase: 'upload', opnieuw: true, tekst: 'Mislukt' }, { spul: 1, document: 1 });
    o.server({ ok: true }, { spul: 1, document: 1, upload: 'klaar' });
    await o.bewaar(invoer());
    await o.bewaar(invoer({ bestand: new Blob(['%PDF-1.4 een ander bestand']) }));
    expect(o.oproep(1).nieuwSpul.id).toBe(o.oproep(0).nieuwSpul.id);
    expect(o.oproep(1).documentId).not.toBe(o.oproep(0).documentId);
    expect(o.documentVerwijderen).toHaveBeenCalledWith(expect.objectContaining({ id: o.oproep(0).documentId }));
  });
  it('een al bewaard (klaar) document wordt nooit weggegooid; een rij die nooit aankwam evenmin', async () => {
    const o = opzet();
    o.server({ ok: false, fase: 'koppelen', opnieuw: true, tekst: 'Koppelen mislukt', bewaard: true }, { spul: 1, document: 2, upload: 'klaar' });
    o.server({ ok: false, fase: 'begin', opnieuw: true, tekst: 'Geen verbinding' });
    o.server({ ok: true });
    await o.bewaar(invoer());
    await o.bewaar(invoer({ bestand: new Blob(['%PDF-1.4 ander']) }));     // klaar-document blijft staan
    await o.bewaar(invoer({ bestand: new Blob(['%PDF-1.4 derde']) }));     // de vorige rij bestaat niet
    expect(o.documentVerwijderen).not.toHaveBeenCalled();
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

describe('P1-b: de volgende poging stuurt de versies van na de vorige poging mee', () => {
  it('na een mislukte upload: versie van spul en document zoals de app ze toen kende', async () => {
    const o = opzet();
    o.server({ ok: false, fase: 'upload', opnieuw: true, tekst: 'Mislukt' }, { spul: 1, document: 1 });
    o.server({ ok: true });
    await o.bewaar(invoer());
    // Intussen paste de partner het spul aan; de app kent (via realtime) versie 2, maar de poging verwacht 1.
    o.syncToestand.spullen = o.syncToestand.spullen.map(s => ({ ...s, version: 2 }));
    await o.bewaar(invoer());
    expect(o.oproep(0).nieuwSpul.versie).toBeUndefined();
    expect(o.oproep(1).nieuwSpul.versie).toBe(1);
    expect(o.oproep(1).documentVersie).toBe(1);
  });
  it('conflict: de melding van het venster; opnieuw bewaren gebruikt de versie van nu (bewust doorzetten)', async () => {
    const o = opzet();
    o.server({ ok: false, fase: 'upload', opnieuw: true, tekst: 'Mislukt' }, { spul: 1, document: 1 });
    o.server({ ok: false, fase: 'spul', opnieuw: true, conflict: true, versie: 3, tekst: 'conflict' });
    o.server({ ok: true });
    await o.bewaar(invoer());
    expect((await o.bewaar(invoer()))?.message).toBe(CONFLICT_IN_VENSTER);
    expect(await o.bewaar(invoer())).toBeNull();
    expect(o.oproep(2).nieuwSpul.versie).toBe(3);
    expect(o.oproep(2).nieuwSpul.id).toBe(o.oproep(0).nieuwSpul.id);
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
