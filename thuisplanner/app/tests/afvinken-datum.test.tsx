// K1 (architectuurcontrole, 15 oktober 2026): een afgevinkte taak krijgt de dag die de app als "vandaag"
// toont, niet de UTC-datum. Anders telt een taak die in Nederland tussen 00:00 en 02:00 wordt afgevinkt
// voor gisteren en valt hij verkeerd van Vandaag.
import { act, renderHook } from '@testing-library/react';
import { lokaleDatum, type TaakRij } from '../../sync/thuisplanner-sync.js';
import { useLokaleStaat } from '../src/lib/lokaal/staat';
import type { Momentopname, Sessie } from '../src/lib/lokaal/sessie';

const taak: TaakRij = {
  id: 't1', household_id: 'h1', title: 'Gymtas', due_date: '2026-10-16', assignee_member_id: null,
  done_on: null, done_by_member_id: null, version: 1, created_at: '', updated_at: '',
} as TaakRij;

function nepSessie() {
  const taakAfvinken = vi.fn(async () => ({ ok: true }));
  const sessie = {
    acties: { taakAfvinken },
    syncObject: { toestand: { taken: [taak], boodschappen: [], afspraken: [] } },
  } as unknown as Sessie;
  return { sessie, taakAfvinken };
}

const SNAP = { fase: 'actief', fout: null, account: null, huishouden: null, toestand: null } as Momentopname;

describe('afvinken: de dag van de app, nooit UTC', () => {
  it('lokaleDatum geeft de kalenderdag van dit toestel, ook kort na middernacht', () => {
    // 00:30 lokale tijd. Met toISOString() zou dit in Nederland nog de vorige dag zijn.
    expect(lokaleDatum(new Date(2026, 9, 16, 0, 30))).toBe('2026-10-16');
    expect(lokaleDatum(new Date(2026, 0, 1, 0, 5))).toBe('2026-01-01');
    expect(lokaleDatum(new Date(2026, 11, 31, 23, 59))).toBe('2026-12-31');
  });

  it('de app geeft bij afvinken haar eigen "vandaag" mee, ook na een dagwissel', () => {
    const { sessie, taakAfvinken } = nepSessie();
    const { result, rerender } = renderHook(({ vandaag }) => useLokaleStaat(sessie, SNAP, vandaag),
      { initialProps: { vandaag: '2026-10-16' } });
    act(() => result.current.wissel('t1'));
    expect(taakAfvinken).toHaveBeenLastCalledWith(taak, '2026-10-16');

    rerender({ vandaag: '2026-10-17' });
    act(() => result.current.wissel('t1'));
    expect(taakAfvinken).toHaveBeenLastCalledWith(taak, '2026-10-17');
  });
});
