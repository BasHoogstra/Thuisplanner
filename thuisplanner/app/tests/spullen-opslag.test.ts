// De echte spullen-opslag: de vertaling tussen de rijen van de sync en de typen van de app (lib/spullen/opslag-supabase.ts),
// en de taken bij een spul (naarTaak, naarTaakVelden). De verwachte waarden staan hier vast.
import { describe, expect, it } from 'vitest';
import { gegevensUit, naarDocument, naarSpul, spulKolommen } from '../src/lib/spullen/opslag-supabase';
import { naarTaak, naarTaakVelden } from '../src/lib/lokaal/omzetten';
import type { DocumentRij, SpulRij, Toestand } from '../../sync/thuisplanner-sync.js';

const rij: SpulRij = {
  id: 's1', household_id: 'h1', name: 'Vaatwasser', category: 'Vaatwasser', brand: 'Merk', model: 'M1', serial: null, purchase_date: '2026-10-28',
  shop: 'Winkel', price_cents: 54900, currency: 'EUR', order_number: null, warranty_commercial_until: '2028-10-28', warranty_extra_until: null,
  warranty_extra_provider: null, notes: null, visibility: 'private', owner_member_id: 'm1', field_status: { model: 'voorstel', brand: 'voorstel' },
  version: 3, deleted_at: null,
};
const doc = (x: Partial<DocumentRij>): DocumentRij => ({ id: 'd1', household_id: 'h1', title: 'Factuur', kind: 'factuur', document_date: null,
  visibility: 'household', owner_member_id: 'm1', upload_status: 'klaar', storage_path: 'h1/d1/origineel', mime: 'application/pdf', size_bytes: 10,
  sha256: null, version: 1, deleted_at: null, ...x });

describe('spul ↔ rij', () => {
  it('rij naar spul: velden, persoonlijk, voorstellen als status', () => {
    const s = naarSpul(rij);
    expect(s).toMatchObject({ id: 's1', naam: 'Vaatwasser', merk: 'Merk', model: 'M1', aankoopdatum: '2026-10-28', prijsCenten: 54900,
      garantieTot: '2028-10-28', zichtbaarheid: 'persoonlijk', eigenaar: 'm1', status: { model: 'voorstel', merk: 'voorstel' }, versie: 3 });
    expect(s.serienummer).toBeUndefined();
  });
  it('spul naar kolommen: leeg wordt null (wissen wist echt), status terug naar de kolomnamen', () => {
    const k = spulKolommen({ ...naarSpul(rij), merk: '', status: { model: 'voorstel' } });
    expect(k).toMatchObject({ name: 'Vaatwasser', brand: null, model: 'M1', visibility: 'private', field_status: { model: 'voorstel' } });
    expect(k).not.toHaveProperty('owner_member_id');
    expect(k).not.toHaveProperty('id');
  });
  it('heen en terug geeft hetzelfde spul', () => {
    const s = naarSpul(rij);
    const terug = naarSpul({ ...rij, ...(spulKolommen(s) as Partial<SpulRij>) });
    expect(terug).toEqual(s);
  });
});

describe('documenten', () => {
  it('alleen bevestigde documenten in de lijst; wachtend of geweigerd apart (niet in de prullenbak)', () => {
    const t = { spullen: [rij], documentKoppelingen: [{ id: 'k1', household_id: 'h1', document_id: 'd1', possession_id: 's1', version: 1 }],
      documenten: [doc({}), doc({ id: 'd2', upload_status: 'wacht' }), doc({ id: 'd3', upload_status: 'mislukt' }),
        doc({ id: 'd4', upload_status: 'wacht', deleted_at: '2026-10-28T00:00:00Z' })] } as unknown as Toestand;
    const { gegevens, onvoltooid } = gegevensUit(t);
    expect(gegevens.documenten.map(d => d.id)).toEqual(['d1']);
    expect(onvoltooid.map(d => d.id)).toEqual(['d2', 'd3']);
    expect(gegevens.koppelingen).toEqual([{ documentId: 'd1', spulId: 's1' }]);
  });
  it('het bestand is altijd een opslagpad, nooit een URL', () => {
    expect(naarDocument(doc({})).bestand).toEqual({ soort: 'opslag', pad: 'h1/d1/origineel' });
  });
});

describe('taken bij een spul', () => {
  const taakRij = { id: 't1', title: 'Filter', due_date: null, assignee_member_id: null, done_on: null, version: 1 };
  it('zonder possession_id in de rij (sync zonder spullen): geen spulId-veld', () => {
    expect(naarTaak(taakRij)).not.toHaveProperty('spulId');
  });
  it('met possession_id: spulId, en terug naar de kolom', () => {
    const t = naarTaak({ ...taakRij, possession_id: 's1' });
    expect(t.spulId).toBe('s1');
    expect(naarTaakVelden(t)).toMatchObject({ possession_id: 's1' });
  });
  it('een formulier zonder spulveld laat de koppeling staan (geen possession_id in de update)', () => {
    expect(naarTaakVelden({ id: 't1', soort: 'taak', titel: 'X', datum: null, voor: null, klaar: false })).not.toHaveProperty('possession_id');
  });
});
