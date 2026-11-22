// P1 (review PR #54): een venster bewaart met de versie van het moment waarop het openging. Bij een versieconflict blijft
// het venster open met je invoer en een uitleg; opnieuw opslaan gebruikt dan de versie die nu bekend is. De twee-accounttest
// staat in e2e-lokaal/sync.spec.ts; hier de vensters zelf (taak, afspraak, plan).
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ItemVenster } from '../src/components/ItemVenster';
import { PlanVenster } from '../src/components/PlanVensters';
import { Ctx, type AppContext } from '../src/lib/context';
import type { Item, Plan, Taak } from '../src/lib/types';

const EVA = 'm-eva';
const leden = [{ id: EVA, naam: 'Eva', soort: 'volwassene', kleur: 'red', heeftAccount: true }];
const taak = (t: Partial<Taak> = {}): Taak => ({ id: 't1', soort: 'taak', titel: 'Lampen vervangen', datum: null, voor: null, klaar: false, klaarOp: null, versie: 3, ...t });
const plan = (p: Partial<Plan> = {}): Plan => ({ id: 'p1', titel: 'Zolder', einddatum: null, wie: [], versie: 5, ...p });

function context(items: Item[], plannen: Plan[], extra: Record<string, unknown>) {
  return {
    staat: { items, vakanties: [], pakitems: [], paklijsten: [], koppelingen: [], plannen, onderdelen: [], planKoppelingen: [], weggeklikt: new Set(), melding: null },
    huishouden: { naam: 'Gezin', ik: EVA, leden }, vandaag: '2026-11-11', nu: '09:00', uur: 9,
    lid: (id: string) => leden.find(l => l.id === id), meld: vi.fn(), openPlan: vi.fn(), ...extra,
  } as unknown as AppContext;
}

describe('taak in het detailvenster', () => {
  it('conflict: het venster blijft open met je tekst en een uitleg; opnieuw opslaan gebruikt de nieuwe versie', async () => {
    const bijwerken = vi.fn().mockResolvedValueOnce('conflict').mockResolvedValueOnce('ok');
    const sluit = vi.fn();
    let ctx = context([taak()], [], { bijwerken });
    const { rerender } = render(<Ctx.Provider value={ctx}><ItemVenster opdracht={{ type: 'bewerk', id: 't1' }} sluit={sluit} /></Ctx.Provider>);
    const user = userEvent.setup();
    const d = () => within(screen.getByRole('dialog'));
    await user.clear(d().getByLabelText('Wat?'));
    await user.type(d().getByLabelText('Wat?'), 'Lampen vervangen in de gang');
    await user.click(d().getByRole('button', { name: 'Opslaan' }));
    expect(bijwerken.mock.calls[0][0]).toMatchObject({ titel: 'Lampen vervangen in de gang', versie: 3 });
    expect(sluit).not.toHaveBeenCalled();
    expect(d().getByRole('alert')).toHaveTextContent('Iemand anders heeft dit net aangepast');
    expect(d().getByLabelText('Wat?')).toHaveValue('Lampen vervangen in de gang');
    // Intussen komt de nieuwe versie van de partner binnen; je tekst blijft staan.
    ctx = context([taak({ titel: 'Lampen vervangen (LED)', versie: 4 })], [], { bijwerken });
    rerender(<Ctx.Provider value={ctx}><ItemVenster opdracht={{ type: 'bewerk', id: 't1' }} sluit={sluit} /></Ctx.Provider>);
    expect(d().getByLabelText('Wat?')).toHaveValue('Lampen vervangen in de gang');
    await user.click(d().getByRole('button', { name: 'Opslaan' }));
    expect(bijwerken.mock.calls[1][0]).toMatchObject({ titel: 'Lampen vervangen in de gang', versie: 4 });
    expect(sluit).toHaveBeenCalled();
  });

  it('tegenproef: zonder conflict sluit het venster na opslaan, met de versie van het openen', async () => {
    const bijwerken = vi.fn().mockResolvedValue('ok');
    const sluit = vi.fn();
    render(<Ctx.Provider value={context([taak()], [], { bijwerken })}><ItemVenster opdracht={{ type: 'bewerk', id: 't1' }} sluit={sluit} /></Ctx.Provider>);
    const user = userEvent.setup();
    const d = within(screen.getByRole('dialog'));
    await user.type(d.getByLabelText('Wat?'), '!');
    await user.click(d.getByRole('button', { name: 'Opslaan' }));
    expect(bijwerken.mock.calls[0][0]).toMatchObject({ versie: 3 });
    expect(sluit).toHaveBeenCalled();
  });

  it('terwijl het bijwerken loopt ("wachtend") blijft het bewerkvenster staan, met je invoer', async () => {
    const bijwerken = vi.fn(() => new Promise(() => {}));
    let ctx = context([taak()], [], { bijwerken });
    const { rerender } = render(<Ctx.Provider value={ctx}><ItemVenster opdracht={{ type: 'bewerk', id: 't1' }} sluit={vi.fn()} /></Ctx.Provider>);
    const user = userEvent.setup();
    await user.type(within(screen.getByRole('dialog')).getByLabelText('Wat?'), ' nu');
    ctx = context([taak({ titel: 'Lampen vervangen nu', sync: 'wachtend' })], [], { bijwerken });
    await act(async () => { rerender(<Ctx.Provider value={ctx}><ItemVenster opdracht={{ type: 'bewerk', id: 't1' }} sluit={vi.fn()} /></Ctx.Provider>); });
    expect(within(screen.getByRole('dialog')).getByLabelText('Wat?')).toHaveValue('Lampen vervangen nu');
  });
});

describe('plan aanpassen', () => {
  it('bewaart met de versie van het openen, niet die van nu; bij een conflict blijft het venster open met je invoer', async () => {
    const planBijwerken = vi.fn().mockResolvedValueOnce('conflict').mockResolvedValueOnce('ok');
    const sluit = vi.fn();
    let ctx = context([], [plan()], { planBijwerken });
    const { rerender } = render(<Ctx.Provider value={ctx}><PlanVenster bestaand={plan()} sluit={sluit} /></Ctx.Provider>);
    const user = userEvent.setup();
    const d = () => within(screen.getByRole('dialog'));
    // Intussen is het plan bij de partner al naar versie 6 gegaan (het venster krijgt dat nieuwe plan binnen).
    ctx = context([], [plan({ titel: 'Zolder (partner)', versie: 6 })], { planBijwerken });
    rerender(<Ctx.Provider value={ctx}><PlanVenster bestaand={plan({ titel: 'Zolder (partner)', versie: 6 })} sluit={sluit} /></Ctx.Provider>);
    await user.clear(d().getByLabelText('Naam'));
    await user.type(d().getByLabelText('Naam'), 'Zolder verbouwen');
    await user.click(d().getByRole('button', { name: 'Opslaan' }));
    expect(planBijwerken.mock.calls[0][0]).toMatchObject({ titel: 'Zolder verbouwen', versie: 5 });
    expect(sluit).not.toHaveBeenCalled();
    expect(d().getByRole('alert')).toHaveTextContent('Iemand anders heeft dit net aangepast');
    expect(d().getByLabelText('Naam')).toHaveValue('Zolder verbouwen');
    await user.click(d().getByRole('button', { name: 'Opslaan' }));
    expect(planBijwerken.mock.calls[1][0]).toMatchObject({ titel: 'Zolder verbouwen', versie: 6 });
    expect(sluit).toHaveBeenCalled();
  });
});
