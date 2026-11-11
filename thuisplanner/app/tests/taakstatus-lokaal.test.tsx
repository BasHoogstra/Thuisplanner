// P2 (review PR #54): de status van een taak uit het detailvenster (Te doen, Bezig, Afgerond) gaat online echt naar de
// server: afgerond is done_on (met wie het afrondde), Bezig is started_on, weer open maakt done_on leeg. Elke overgang,
// met een nagebootste sync-module. Het gedrag op een echte stack: tests/acties-contract.test.tsx (KG_CONTRACT=1).
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useLokaleStaat } from '../src/lib/lokaal/staat';
import type { Momentopname, Sessie } from '../src/lib/lokaal/sessie';
import { statusVelden, type TaakStatus } from '../src/lib/plan';
import type { Huishouden, Taak } from '../src/lib/types';

const V = '2026-11-11';
const HH: Huishouden = { naam: 'Test', ik: 'm-eva', leden: [{ id: 'm-eva', naam: 'Eva', soort: 'volwassene', kleur: 'x', heeftAccount: true }] };
const DAG = /^\d{4}-\d{2}-\d{2}$/;

function opzet(stand: TaakStatus, planAf = false) {
  const rij = {
    id: 't1', household_id: 'h', title: 'Vloer leggen', due_date: null, assignee_member_id: null, trip_id: null, plan_id: 'p1', plan_section_id: null,
    done_on: stand === 'Afgerond' ? '2026-11-01' : null, done_by_member_id: stand === 'Afgerond' ? 'm-eva' : null,
    started_on: stand === 'Bezig' ? '2026-11-05' : null, version: 4,
  };
  const toestand = {
    status: 'verbonden', melding: null, laatstOpgehaald: null, opslagDuurzaam: true, lid: null, leden: [], boodschappen: [], afspraken: [], uitzonderingen: [],
    vakanties: [], pakitems: [], paklijsten: [], vakantieKoppelingen: [], taken: [rij],
    plannen: [{ id: 'p1', title: 'Zolder', description: null, due_date: null, member_ids: [], closed_on: planAf ? '2026-11-02' : null, version: 2 }],
    planOnderdelen: [],
  };
  const acties = { taakBijwerken: vi.fn(async (..._a: unknown[]) => ({ ok: true })), planBijwerken: vi.fn(async (..._a: unknown[]) => ({ ok: true })) };
  const sessie = { acties, syncObject: { toestand, vergeten: vi.fn() } } as unknown as Sessie;
  const { result } = renderHook(() => useLokaleStaat(sessie, { toestand } as unknown as Momentopname, V, HH));
  const naar = async (status: TaakStatus) => {
    const t = result.current.staat.items[0] as Taak;
    await act(async () => { await result.current.bijwerken({ ...t, ...statusVelden(status, t, V) }); });
    return (acties.taakBijwerken.mock.calls[0] as unknown[])[1] as Record<string, unknown>;
  };
  return { naar, acties };
}

describe('taakstatus via het detailvenster, online', () => {
  it('Te doen → Bezig: started_on, done_on blijft ongemoeid', async () => {
    const v = await opzet('Te doen').naar('Bezig');
    expect(v.started_on).toMatch(DAG);
    expect(v).not.toHaveProperty('done_on');
  });
  it('Te doen → Afgerond: done_on vandaag, door mij; Bezig leeg', async () => {
    expect(await opzet('Te doen').naar('Afgerond')).toMatchObject({ done_on: V, done_by_member_id: 'm-eva', started_on: null });
  });
  it('Bezig → Afgerond: done_on, en Bezig leeg', async () => {
    expect(await opzet('Bezig').naar('Afgerond')).toMatchObject({ done_on: V, done_by_member_id: 'm-eva', started_on: null });
  });
  it('Bezig → Te doen: Bezig leeg, done_on ongemoeid', async () => {
    const v = await opzet('Bezig').naar('Te doen');
    expect(v.started_on).toBeNull();
    expect(v).not.toHaveProperty('done_on');
  });
  it('Afgerond → Te doen: done_on en wie leeg', async () => {
    expect(await opzet('Afgerond').naar('Te doen')).toMatchObject({ done_on: null, done_by_member_id: null, started_on: null });
  });
  it('Afgerond → Bezig: done_on leeg en started_on gezet', async () => {
    const v = await opzet('Afgerond').naar('Bezig');
    expect(v).toMatchObject({ done_on: null, done_by_member_id: null });
    expect(v.started_on).toMatch(DAG);
  });
  it('heropenen in een afgerond plan heropent het plan; afronden raakt het plan niet', async () => {
    const o = opzet('Afgerond', true);
    await o.naar('Te doen');
    expect(o.acties.planBijwerken).toHaveBeenCalledWith(expect.objectContaining({ id: 'p1' }), { closed_on: null });
    const o2 = opzet('Te doen', true);
    await o2.naar('Afgerond');
    expect(o2.acties.planBijwerken).not.toHaveBeenCalled();
  });
});
