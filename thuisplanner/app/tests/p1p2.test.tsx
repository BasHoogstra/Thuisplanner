// P1 en P2 in de app (besluiten van 19 oktober 2026, docs/thuisplanner-app.md §6):
// - een taak of boodschap zonder bewaarde inhoud verschijnt als "inhoud niet op dit toestel" en wordt opnieuw ingevoerd
//   onder dezelfde opdracht-ID (nooit een nieuwe toevoeging);
// - uitloggen met onbevestigde opdrachten vraagt eerst een keuze; zonder onbevestigde opdrachten logt het meteen uit.
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { BoodschapRij, TaakRij } from '../../sync/thuisplanner-sync.js';
import { ItemVenster } from '../src/components/ItemVenster';
import { UitlogKnop } from '../src/components/Lokaal';
import { Ctx, type AppContext } from '../src/lib/context';
import { naarItems } from '../src/lib/lokaal/omzetten';
import type { Item } from '../src/lib/types';

const EVA = 'm-eva';
const taakZonder: TaakRij = { id: 't-1', title: null, due_date: null, assignee_member_id: null, done_on: null, version: 0, onzeker: true, inhoudNietBewaard: true };
const boodZonder: BoodschapRij = { id: 'b-1', name: null, checked_at: null, version: 0, onzeker: true, inhoudNietBewaard: true };

function opzet(items: Item[]) {
  const herinvoeren = vi.fn(), toevoegen = vi.fn(), voegBoodschappenToe = vi.fn(), bijwerken = vi.fn();
  const ctx = {
    staat: { scenario: 'gewoon', items, weggeklikt: new Set(), vorige: null, melding: null },
    huishouden: { naam: 'Familie De Boer', ik: EVA, leden: [{ id: EVA, naam: 'Eva', soort: 'volwassene', kleur: 'red', heeftAccount: true }] },
    vandaag: '2026-10-13', nu: '09:00', uur: 9,
    lid: (id: string) => ({ id, naam: id, soort: 'volwassene', kleur: 'red', heeftAccount: true }),
    toevoegen, voegBoodschappenToe, bijwerken, meld: vi.fn(),
    lokaal: { herinvoeren },
  } as unknown as AppContext;
  return { ctx, herinvoeren, toevoegen, voegBoodschappenToe, bijwerken };
}

describe('P1: opnieuw invoeren zonder bewaarde inhoud', () => {
  it('een taak en een boodschap zonder inhoud: een vaste naam en het label "inhoud niet op dit toestel"', () => {
    const items = naarItems({ afspraken: [], taken: [taakZonder], boodschappen: [boodZonder], uitzonderingen: [] });
    expect(items.map(i => [i.id, i.sync, i.soort === 'boodschap' ? i.naam : i.titel])).toEqual([
      ['t-1', 'zonder-inhoud', 'Taak'], ['b-1', 'zonder-inhoud', 'Boodschap']]);
  });

  it('een taak opnieuw invoeren: dezelfde opdracht-ID, geen nieuwe toevoeging', async () => {
    const items = naarItems({ afspraken: [], taken: [taakZonder], boodschappen: [], uitzonderingen: [] });
    const { ctx, herinvoeren, toevoegen, bijwerken } = opzet(items);
    const user = userEvent.setup();
    render(<Ctx.Provider value={ctx}><ItemVenster opdracht={{ type: 'bewerk', id: 't-1' }} sluit={() => {}} /></Ctx.Provider>);
    const dialoog = screen.getByRole('dialog');
    expect(within(dialoog).getByText(/Deze taak is/)).toBeInTheDocument();
    expect(within(dialoog).getByText(/niet op dit toestel bewaard/)).toBeInTheDocument();
    expect(within(dialoog).queryByRole('tablist')).not.toBeInTheDocument();   // geen andere soort kiezen
    expect(screen.getByLabelText('Wat?')).toHaveValue('');                      // geen "Taak" als titel
    await user.type(screen.getByLabelText('Wat?'), 'Tandarts bellen');
    await user.click(within(dialoog).getByRole('button', { name: 'Opslaan' }));
    expect(herinvoeren).toHaveBeenCalledTimes(1);
    const [id, item] = herinvoeren.mock.calls[0];
    expect(id).toBe('t-1');
    expect(item).toMatchObject({ id: 't-1', soort: 'taak', titel: 'Tandarts bellen' });
    expect(toevoegen).not.toHaveBeenCalled();
    expect(bijwerken).not.toHaveBeenCalled();
  });

  it('een boodschap opnieuw invoeren: één boodschap met dezelfde ID, niet gesplitst', async () => {
    const items = naarItems({ afspraken: [], taken: [], boodschappen: [boodZonder], uitzonderingen: [] });
    const { ctx, herinvoeren, voegBoodschappenToe } = opzet(items);
    const user = userEvent.setup();
    render(<Ctx.Provider value={ctx}><ItemVenster opdracht={{ type: 'bewerk', id: 'b-1' }} sluit={() => {}} /></Ctx.Provider>);
    await user.type(screen.getByLabelText(/^Naam/), 'melk, eieren');
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Opslaan' }));
    expect(herinvoeren).toHaveBeenCalledTimes(1);
    expect(herinvoeren.mock.calls[0][0]).toBe('b-1');
    expect(herinvoeren.mock.calls[0][1]).toMatchObject({ id: 'b-1', soort: 'boodschap', naam: 'Melk, eieren' });
    expect(voegBoodschappenToe).not.toHaveBeenCalled();
  });
});

describe('P2: uitloggen met onbevestigde opdrachten', () => {
  it('niets onbevestigd: meteen uitloggen, zonder wissen en zonder vraag', async () => {
    const uitloggen = vi.fn();
    render(<UitlogKnop label="Uitloggen" className="knop" aantal={() => 0} uitloggen={uitloggen} nakijken={vi.fn()} />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Uitloggen' }));
    expect(uitloggen).toHaveBeenCalledWith(false);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('wel onbevestigd: eerst een waarschuwing met het aantal; "Eerst laten nakijken" logt niet uit en wist niets', async () => {
    const uitloggen = vi.fn(), nakijken = vi.fn();
    const user = userEvent.setup();
    render(<UitlogKnop label="Uitloggen" className="knop" aantal={() => 3} uitloggen={uitloggen} nakijken={nakijken} />);
    await user.click(screen.getByRole('button', { name: 'Uitloggen' }));
    const dialoog = screen.getByRole('dialog');
    expect(within(dialoog).getByText(/3 toevoegingen zijn op dit toestel nog niet door de server bevestigd/)).toBeInTheDocument();
    await user.click(within(dialoog).getByRole('button', { name: 'Eerst laten nakijken' }));
    expect(nakijken).toHaveBeenCalledTimes(1);
    expect(uitloggen).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('wel onbevestigd: "Van dit toestel wissen en uitloggen" logt uit met wissen', async () => {
    const uitloggen = vi.fn();
    const user = userEvent.setup();
    render(<UitlogKnop label="Ja, overal uitloggen" className="knop" overal aantal={() => 1} uitloggen={uitloggen} />);
    await user.click(screen.getByRole('button', { name: 'Ja, overal uitloggen' }));
    const dialoog = screen.getByRole('dialog');
    expect(within(dialoog).getByText(/Eén toevoeging is/)).toBeInTheDocument();
    // Zonder iets om na te kijken (geen huishouden open): de veilige keuze heet "Niet uitloggen".
    expect(within(dialoog).getByRole('button', { name: 'Niet uitloggen' })).toBeInTheDocument();
    await user.click(within(dialoog).getByRole('button', { name: 'Van dit toestel wissen en overal uitloggen' }));
    expect(uitloggen).toHaveBeenCalledWith(true);
  });
});
