// Herstelronde 1, bevinding 1: een afspraak mag bij aanpassen geen gegevens verliezen. Een serverrij met
// notities en een einddatum op een volgende dag gaat door de echte keten (omzetten → venster → omzetten);
// alleen de titel wijzigen moet alle andere velden die save_event/edit_occurrence schrijven exact behouden.
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AfspraakRij } from '../../sync/thuisplanner-sync.js';
import { ItemVenster } from '../src/components/ItemVenster';
import { Ctx, type AppContext } from '../src/lib/context';
import { naarItems, naarNieuweAfspraak } from '../src/lib/lokaal/omzetten';
import { voorkomenId } from '../src/lib/herhaling';
import type { Afspraak, Item } from '../src/lib/types';

const EVA = 'm-eva', DAAN = 'm-daan';
const rij = (r: Partial<AfspraakRij>): AfspraakRij => ({
  id: 'e-kamp', owner_member_id: EVA, visibility: 'household', start_date: '2026-10-14', start_time: '20:00:00',
  end_date: '2026-10-16', end_time: '10:00:00', recurrence_freq: null, recurrence_until: null, series_id: null,
  original_date: null, version: 4, is_busy: false, title: 'Kamp Daan', location: 'Scoutinggebouw',
  notes: 'Slaapzak en zaklamp mee. Ophalen bij de achteringang.', preparation: 'Tas inpakken', participant_ids: [DAAN], ...r,
});

function opzet(items: Item[]) {
  const bijwerken = vi.fn(), wijzigVoorkomen = vi.fn(), toevoegen = vi.fn();
  const ctx = {
    staat: { scenario: 'gewoon', items, weggeklikt: new Set(), vorige: null, melding: null },
    huishouden: { naam: 'Familie De Boer', ik: EVA, leden: [
      { id: EVA, naam: 'Eva', soort: 'volwassene', kleur: 'red', heeftAccount: true },
      { id: DAAN, naam: 'Daan', soort: 'kind', kleur: 'blue', heeftAccount: false }] },
    vandaag: '2026-10-13', nu: '09:00', uur: 9,
    lid: (id: string) => ({ id, naam: id, soort: 'volwassene', kleur: 'red', heeftAccount: true }),
    bijwerken, wijzigVoorkomen, toevoegen, meld: vi.fn(),
  } as unknown as AppContext;
  return { ctx, bijwerken, wijzigVoorkomen };
}

// Wat save_event van deze afspraak zou schrijven (zonder id/versie, die apart worden vergeleken).
const opslag = (a: Afspraak, versie: number | null) => naarNieuweAfspraak(a, versie);

it('alleen de titel van een meerdaagse afspraak met notities aanpassen: notities, einddatum en de rest blijven exact', async () => {
  const items = naarItems({ afspraken: [rij({})], taken: [], boodschappen: [], uitzonderingen: [] });
  const { ctx, bijwerken } = opzet(items);
  const user = userEvent.setup();
  render(<Ctx.Provider value={ctx}><ItemVenster opdracht={{ type: 'bewerk', id: 'e-kamp' }} sluit={() => {}} /></Ctx.Provider>);
  const titel = screen.getByLabelText('Wat?');
  await user.clear(titel);
  await user.type(titel, 'Kamp Daan (groep 4)');
  await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Opslaan' }));

  // Geen foutmelding over de eindtijd (10:00 op een latere dag is na 20:00 op de eerste dag).
  expect(screen.queryByText(/eindtijd/)).not.toBeInTheDocument();
  expect(bijwerken).toHaveBeenCalledTimes(1);
  const bewaard = bijwerken.mock.calls[0][0] as Afspraak;
  expect(bewaard.versie).toBe(4);
  expect(opslag(bewaard, 4)).toEqual({
    id: 'e-kamp', version: 4, start_date: '2026-10-14', start_time: '20:00', end_date: '2026-10-16', end_time: '10:00',
    visibility: 'household', title: 'Kamp Daan (groep 4)', location: 'Scoutinggebouw',
    preparation: 'Tas inpakken', notes: 'Slaapzak en zaklamp mee. Ophalen bij de achteringang.',
    participant_ids: [DAAN], recurrence_freq: null, recurrence_until: null,
  });
});

it('één voorkomen van een meerdaagse reeks met notities aanpassen: notities en duur gaan mee naar het losse voorkomen', async () => {
  const reeks = rij({ id: 'r-weekend', title: 'Weekend opa', start_date: '2026-10-02', end_date: '2026-10-04', recurrence_freq: 'weekly', notes: 'Medicijnen opa meenemen' });
  const items = naarItems({ afspraken: [reeks], taken: [], boodschappen: [], uitzonderingen: [] });
  const { ctx, wijzigVoorkomen } = opzet(items);
  const user = userEvent.setup();
  render(<Ctx.Provider value={ctx}><ItemVenster opdracht={{ type: 'bewerk', id: voorkomenId('r-weekend', '2026-10-16') }} sluit={() => {}} /></Ctx.Provider>);
  const titel = screen.getByLabelText('Wat?');
  await user.clear(titel);
  await user.type(titel, 'Weekend opa en oma');
  await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Alleen deze opslaan' }));
  expect(wijzigVoorkomen).toHaveBeenCalledTimes(1);
  const [reeksId, datum, los] = wijzigVoorkomen.mock.calls[0] as [string, string, Afspraak];
  expect([reeksId, datum]).toEqual(['r-weekend', '2026-10-16']);
  expect(opslag(los, null)).toMatchObject({
    start_date: '2026-10-16', end_date: '2026-10-18', start_time: '20:00', end_time: '10:00',
    title: 'Weekend opa en oma', notes: 'Medicijnen opa meenemen', location: 'Scoutinggebouw', preparation: 'Tas inpakken',
  });
});

it('detailvenster: de hele reeks aanpassen vanaf een later voorkomen; de einddatum blijft die van de eerste keer', async () => {
  const reeks = rij({ id: 'r-weekend', title: 'Weekend opa', start_date: '2026-10-02', end_date: '2026-10-04', recurrence_freq: 'weekly', notes: 'Medicijnen' });
  const items = naarItems({ afspraken: [reeks], taken: [], boodschappen: [], uitzonderingen: [] });
  const { ctx, bijwerken } = opzet(items);
  const user = userEvent.setup();
  render(<Ctx.Provider value={ctx}><ItemVenster opdracht={{ type: 'bewerk', id: voorkomenId('r-weekend', '2026-10-16') }} sluit={() => {}} /></Ctx.Provider>);
  // Pas bij opslaan de vraag: alleen deze of de hele reeks (D3).
  await user.type(screen.getByLabelText('Wat?'), ' en oma');
  await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Hele reeks opslaan' }));
  const a = bijwerken.mock.calls[0][0] as Afspraak;
  expect(opslag(a, a.versie ?? null)).toMatchObject({ id: 'r-weekend', version: 4, title: 'Weekend opa en oma', start_date: '2026-10-02', end_date: '2026-10-04', notes: 'Medicijnen', recurrence_freq: 'weekly' });
});

it('formulier (Alles bewerken): de hele reeks aanpassen vanaf een later voorkomen; de einddatum blijft die van de eerste keer', async () => {
  const reeks = rij({ id: 'r-weekend', title: 'Weekend opa', start_date: '2026-10-02', end_date: '2026-10-04', recurrence_freq: 'weekly', notes: 'Medicijnen' });
  const items = naarItems({ afspraken: [reeks], taken: [], boodschappen: [], uitzonderingen: [] });
  const { ctx, bijwerken } = opzet(items);
  const user = userEvent.setup();
  render(<Ctx.Provider value={ctx}><ItemVenster opdracht={{ type: 'bewerk', id: voorkomenId('r-weekend', '2026-10-16') }} sluit={() => {}} /></Ctx.Provider>);
  await user.click(screen.getByRole('button', { name: 'Meer…' }));
  await user.click(screen.getByRole('button', { name: 'Alles bewerken' }));
  await user.click(screen.getByRole('radio', { name: 'Hele reeks' }));
  await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Hele reeks opslaan' }));
  const a = bijwerken.mock.calls[0][0] as Afspraak;
  expect(opslag(a, a.versie ?? null)).toMatchObject({ id: 'r-weekend', version: 4, start_date: '2026-10-02', end_date: '2026-10-04', notes: 'Medicijnen', recurrence_freq: 'weekly' });
});

it('een eendaagse afspraak krijgt geen einddatum; een privé-afspraak van een ander houdt geen notities', () => {
  const [eendaags] = naarItems({ afspraken: [rij({ end_date: '2026-10-14', end_time: '21:00:00' })], taken: [], boodschappen: [], uitzonderingen: [] }) as Afspraak[];
  expect(eendaags.eindDatum).toBeUndefined();
  expect(opslag(eendaags, 4).end_date).toBeNull();
  const [bezet] = naarItems({ afspraken: [rij({ is_busy: true, visibility: 'private', title: null, notes: null, location: null })], taken: [], boodschappen: [], uitzonderingen: [] }) as Afspraak[];
  expect(bezet.notities).toBeUndefined();
});
