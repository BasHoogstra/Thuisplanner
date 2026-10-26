// F8 Vakanties (V1.3), lokale modus: de koppeling van de schermen met de sync-module (lib/lokaal/staat.ts), met een
// nagebootste sync-module. Wat de sync-module zelf doet, toetsen tests/integratie/vakanties-sync.test.mjs (V1.2).
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useLokaleStaat } from '../src/lib/lokaal/staat';
import type { Momentopname, Sessie } from '../src/lib/lokaal/sessie';
import type { Huishouden } from '../src/lib/types';

const HH: Huishouden = { naam: 'Test', ik: 'm-eva', leden: [{ id: 'm-eva', naam: 'Eva', soort: 'volwassene', kleur: 'x', heeftAccount: true }] };
const toestand = {
  status: 'verbonden', melding: null, laatstOpgehaald: null, opslagDuurzaam: true, lid: null, leden: [], boodschappen: [], taken: [], afspraken: [], uitzonderingen: [],
  vakanties: [{ id: 'v1', name: 'Frankrijk', start_date: '2026-10-30', end_date: null, destination: null, notes: null, version: 2 }],
  pakitems: [{ id: 'p1', trip_id: 'v1', member_id: 'm-eva', name: 'Sokken', packed_at: null, packed_by_member_id: null, version: 1 },
    { id: 'p2', trip_id: null, member_id: null, name: null, packed_at: null, version: 0, inhoudNietBewaard: true }],
  vakantieKoppelingen: [{ id: 'k1', household_id: 'h', trip_id: 'v1', shopping_item_id: 'b1', settled_at: null, version: 1, created_at: '', updated_at: '' }],
};

function opzet(acties: Record<string, (...a: unknown[]) => unknown>) {
  const sessie = { acties, syncObject: { toestand, vergeten: vi.fn() } } as unknown as Sessie;
  const snap = { toestand } as unknown as Momentopname;
  return renderHook(() => useLokaleStaat(sessie, snap, '2026-10-21', HH));
}
const wacht = () => act(async () => { await new Promise(r => setTimeout(r, 0)); });

describe('lokale modus: vakanties via de sync-module', () => {
  it('leest vakanties, pakitems (zonder de pakitems zonder inhoud) en koppelingen uit de toestand', () => {
    const { result } = opzet({});
    expect(result.current.staat.vakanties.map(v => v.naam)).toEqual(['Frankrijk']);
    expect(result.current.staat.pakitems.map(p => p.naam)).toEqual(['Sokken']);
    expect(result.current.staat.koppelingen[0]).toMatchObject({ vakantieId: 'v1', boodschapId: 'b1', afgehandeld: false });
  });

  it('dubbel pakitem: "Staat al op de lijst van Eva", en de algemene syncmelding weg', async () => {
    const meldingWeg = vi.fn();
    const { result } = opzet({ pakitemToevoegen: vi.fn(async () => ({ ok: false, melding: { soort: 'dubbel', tekst: 'Dat staat er al.' } })), meldingWeg });
    act(() => result.current.pakitemToevoegen('v1', 'm-eva', '  sokken '));
    await wacht();
    expect(result.current.staat.melding?.tekst).toBe('Staat al op de lijst van Eva');
    expect(meldingWeg).toHaveBeenCalled();
  });

  it('verwijderen en ongedaan maken: herstellen met de nieuwe versie; U1 geeft de dubbel-melding', async () => {
    const pakitemVerwijderen = vi.fn(async () => ({ ok: true, data: [{ id: 'p1', version: 2 }] }));
    const pakitemHerstellen = vi.fn(async () => ({ ok: false, melding: { soort: 'dubbel', tekst: 'Dat staat er al.' } }));
    const { result } = opzet({ pakitemVerwijderen, pakitemHerstellen, meldingWeg: vi.fn() });
    act(() => result.current.pakitemVerwijderen(result.current.staat.pakitems[0]));
    await wacht();
    expect(result.current.staat.melding).toMatchObject({ tekst: 'Sokken verwijderd', ongedaan: true });
    act(() => result.current.ongedaan());
    await wacht();
    expect(pakitemHerstellen).toHaveBeenCalledWith(expect.objectContaining({ id: 'p1' }), 2);
    expect(result.current.staat.melding?.tekst).toBe('Staat al op de lijst van Eva');
  });

  it('overnemen: onzeker → één keer dezelfde opdracht opnieuw; ongedaan maken alleen die items', async () => {
    const paklijstOvernemen = vi.fn()
      .mockResolvedValueOnce({ ok: false, opdracht: 'o1', melding: { soort: 'onzeker', tekst: '…' } })
      .mockResolvedValueOnce({ ok: true, opdracht: 'o1', items: [{ id: 'n1' }, { id: 'n2' }] });
    const overnemenOngedaanMaken = vi.fn(async () => ({ ok: true, verwijderd: 2, gebleven: 0 }));
    const { result } = opzet({ paklijstOvernemen, overnemenOngedaanMaken });
    act(() => result.current.paklijstOvernemen('v-oud', 'v1', null));
    await wacht();
    expect(paklijstOvernemen).toHaveBeenNthCalledWith(1, { van: 'v-oud', naar: 'v1', lid: null, gezamenlijk: true, lijsten: [] });
    expect(paklijstOvernemen).toHaveBeenNthCalledWith(2, { van: 'v-oud', naar: 'v1', lid: null, gezamenlijk: true, lijsten: [], opdracht: 'o1' });
    expect(result.current.staat.melding).toMatchObject({ tekst: '2 items overgenomen', ongedaan: true });
    act(() => result.current.ongedaan());
    await wacht();
    expect(overnemenOngedaanMaken).toHaveBeenCalledWith(['n1', 'n2'], []);
  });

  it('vinkjes opnieuw en terugzetten; boodschap met vakantie; vakantie toevoegen geeft het id', async () => {
    const terug = [{ id: 'p1', version: 3, packed: true, packed_at: 'x', packed_by: 'm-eva' }];
    const vinkjesOpnieuw = vi.fn(async () => ({ ok: true, terug, overgeslagen: 0 }));
    const vinkjesTerugzetten = vi.fn(async () => ({ ok: true, overgeslagen: 0 }));
    const boodschapToevoegen = vi.fn(async () => ({ ok: true, data: [{ name: 'Muggenspray', outcome: 'nieuw' }] }));
    const vakantieToevoegen = vi.fn(async () => ({ ok: true, id: 'v-nieuw' }));
    const { result } = opzet({ vinkjesOpnieuw, vinkjesTerugzetten, boodschapToevoegen, vakantieToevoegen });
    act(() => result.current.vinkjesOpnieuw('v1', 'iedereen'));
    await wacht();
    act(() => result.current.ongedaan());
    await wacht();
    expect(vinkjesTerugzetten).toHaveBeenCalledWith('v1', terug);
    act(() => result.current.voegBoodschappenToe(['Muggenspray'], 'v1'));
    await wacht();
    expect(boodschapToevoegen).toHaveBeenCalledWith('Muggenspray', { vakantie: 'v1' });
    // De slimme +: een eigen keuze voor Nu te kopen (met vakantie) of Later nodig (zonder) gaat mee naar de sync.
    act(() => result.current.voegBoodschappenToe(['Pleisters'], 'v1', false));
    await wacht();
    expect(boodschapToevoegen).toHaveBeenCalledWith('Pleisters', { vakantie: 'v1', later: false });
    act(() => result.current.voegBoodschappenToe(['Cadeaupapier'], undefined, true));
    await wacht();
    expect(boodschapToevoegen).toHaveBeenCalledWith('Cadeaupapier', { later: true });
    // Een gewone boodschap: precies de oude aanroep.
    act(() => result.current.voegBoodschappenToe(['Brood']));
    await wacht();
    expect(boodschapToevoegen).toHaveBeenCalledWith('Brood', undefined);
    let id: string | null = null;
    await act(async () => { id = await result.current.vakantieToevoegen({ naam: 'Zweden', vertrek: null, terug: null }); });
    expect(id).toBe('v-nieuw');
    expect(vakantieToevoegen).toHaveBeenCalledWith({ name: 'Zweden', start_date: null, end_date: null, destination: null, notes: null });
  });
});

describe('lokale modus: extra inpaklijsten (§20)', () => {
  const metLijst = { ...toestand,
    paklijsten: [{ id: 'l1', trip_id: 'v1', name: 'Oma', version: 3 }],
    pakitems: [...toestand.pakitems, { id: 'p3', trip_id: 'v1', member_id: null, list_id: 'l1', name: 'Leesbril', packed_at: null, version: 1 },
      { id: 'p4', trip_id: 'v1', member_id: null, list_id: 'weg', name: 'Spook', packed_at: null, version: 1 }] };
  const opzetLijst = (acties: Record<string, (...a: unknown[]) => unknown>) => {
    const sessie = { acties, syncObject: { toestand: metLijst, vergeten: vi.fn() } } as unknown as Sessie;
    return renderHook(() => useLokaleStaat(sessie, { toestand: metLijst } as unknown as Momentopname, '2026-10-21', HH));
  };
  it('een item van een lijst hoort bij die lijst (nooit Gezamenlijk); een item van een onbekende lijst verschijnt niet', () => {
    const { result } = opzetLijst({});
    expect(result.current.staat.paklijsten).toEqual([expect.objectContaining({ id: 'l1', naam: 'Oma', vakantieId: 'v1' })]);
    expect(result.current.staat.pakitems.find(p => p.id === 'p3')).toMatchObject({ lid: null, lijst: 'l1' });
    expect(result.current.staat.pakitems.some(p => p.id === 'p4')).toBe(false);
  });
  it('toevoegen (naam gecontroleerd), item in een lijst, hernoemen en verwijderen met ongedaan maken', async () => {
    const paklijstToevoegen = vi.fn(async () => ({ ok: true, id: 'l2' }));
    const pakitemToevoegen = vi.fn(async () => ({ ok: true }));
    const paklijstHernoemen = vi.fn(async () => ({ ok: true }));
    const paklijstVerwijderen = vi.fn(async () => ({ ok: true, data: [{ version: 4, items: 1, outcome: 'verwijderd' }] }));
    const paklijstHerstellen = vi.fn(async () => ({ ok: true }));
    const { result } = opzetLijst({ paklijstToevoegen, pakitemToevoegen, paklijstHernoemen, paklijstVerwijderen, paklijstHerstellen, meldingWeg: vi.fn() });
    let id: string | null = null;
    await act(async () => { id = await result.current.paklijstToevoegen('v1', 'eva'); });
    expect(id).toBeNull();
    expect(paklijstToevoegen).not.toHaveBeenCalled();
    expect(result.current.staat.melding?.tekst).toBe('Die naam hoort al bij iemand uit het huishouden of bij Gezamenlijk.');
    await act(async () => { id = await result.current.paklijstToevoegen('v1', ' Paard '); });
    expect(id).toBe('l2');
    expect(paklijstToevoegen).toHaveBeenCalledWith('v1', 'Paard');
    act(() => result.current.pakitemToevoegen('v1', { lijst: 'l1' }, 'Pillen'));
    await wacht();
    expect(pakitemToevoegen).toHaveBeenCalledWith('v1', null, 'Pillen', { lijst: 'l1' });
    const oma = result.current.staat.paklijsten[0];
    act(() => result.current.paklijstHernoemen(oma, 'Opa'));
    await wacht();
    expect(paklijstHernoemen).toHaveBeenCalledWith(expect.objectContaining({ id: 'l1' }), 'Opa', 3);
    act(() => result.current.paklijstVerwijderen(oma));
    await wacht();
    expect(result.current.staat.melding).toMatchObject({ tekst: 'Oma verwijderd', ongedaan: true });
    act(() => result.current.ongedaan());
    await wacht();
    expect(paklijstHerstellen).toHaveBeenCalledWith(expect.objectContaining({ id: 'l1' }), 4);
  });
  it('verplaatsen naar een lijst en terug naar een lid gaat met member_id én list_id', async () => {
    const pakitemBijwerken = vi.fn(async () => ({ ok: true }));
    const { result } = opzetLijst({ pakitemBijwerken });
    const sokken = result.current.staat.pakitems.find(p => p.id === 'p1')!;
    act(() => result.current.pakitemBijwerken(sokken, { doel: { lijst: 'l1' } }));
    await wacht();
    expect(pakitemBijwerken).toHaveBeenCalledWith(expect.objectContaining({ id: 'p1' }), { member_id: null, list_id: 'l1' }, 1);
    expect(result.current.staat.melding?.tekst).toBe('Sokken staat nu bij Oma');
  });
});
