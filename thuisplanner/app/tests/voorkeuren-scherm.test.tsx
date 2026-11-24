// Besluit 20: het instellingenscherm en wat het doet (demo), en de online opslag met een nagebootste client.
import { act, render, renderHook, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { SupabaseClient } from '@supabase/supabase-js';
import { App } from '../src/App';
import { useServerVoorkeuren } from '../src/lib/voorkeuren-opslag';
import { bewaarCache, leesCache, metWaarde, STANDAARD } from '../src/lib/voorkeuren';

beforeEach(() => {
  localStorage.clear();
  window.history.replaceState(null, '', '/?nu=2026-10-10T11:20#/vandaag');
});

async function naarInstellingen(user: ReturnType<typeof userEvent.setup>, deel?: string) {
  await user.click(within(screen.getByRole('navigation', { name: 'Hoofdnavigatie' })).getByRole('link', { name: 'Meer' }));
  await user.click(screen.getByRole('button', { name: /Persoonlijke instellingen/ }));
  if (deel) await user.click(screen.getByRole('button', { name: new RegExp(`^${deel}:`) }));
}

describe('demo: persoonlijke instellingen', () => {
  it('Meer → Persoonlijk: drie regels met de huidige waarde, standaard al hersteld', async () => {
    const user = userEvent.setup();
    render(<App />);
    await naarInstellingen(user);
    expect(screen.getByRole('heading', { level: 1, name: 'Persoonlijk' })).toBeInTheDocument();
    expect(window.location.hash).toBe('#/instellingen');
    expect(screen.getByRole('button', { name: 'Startscherm: Overzicht' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Overzicht: 4 van 4' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Agenda en taken: Week' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Standaardinstellingen herstellen' })).toBeDisabled();
    // Nog geen meldingen: die komen met de pushmeldingen (P1).
    expect(screen.queryByText(/Meldingen/)).not.toBeInTheDocument();
  });

  it('onderdelen van het Overzicht verbergen; verborgen blijft in de Agenda; het laatste blijft aan', async () => {
    const user = userEvent.setup();
    render(<App />);
    expect(screen.getByRole('heading', { name: 'Afspraken' })).toBeInTheDocument();
    await naarInstellingen(user, 'Overzicht');
    expect(window.location.hash).toBe('#/instellingen/overzicht');
    await user.click(screen.getByRole('switch', { name: /Afspraken/ }));
    await user.click(screen.getByRole('switch', { name: /Boodschappen/ }));
    await user.click(screen.getByRole('switch', { name: /Vakantie en suggestie/ }));
    // Alleen Te doen staat nog aan: die kan niet uit.
    expect(screen.getByRole('switch', { name: /Te doen/ })).toBeDisabled();
    expect(screen.getByText('Blijft aan: je Overzicht is nooit leeg')).toBeInTheDocument();

    await user.click(within(screen.getByRole('navigation', { name: 'Hoofdnavigatie' })).getByRole('link', { name: 'Overzicht' }));
    expect(screen.queryByRole('heading', { name: 'Afspraken' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Boodschappen' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Meegedacht' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Te doen' })).toBeInTheDocument();
    // De kop blijft, en de Agenda toont alles nog.
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Goedemorgen, Eva');
    await user.click(within(screen.getByRole('navigation', { name: 'Hoofdnavigatie' })).getByRole('link', { name: 'Agenda' }));
    expect(screen.getAllByText(/Zwemles/).length).toBeGreaterThan(0);
  });

  it('standaardweergave en "Ik": de Agenda volgt meteen; herstellen zet alles terug', async () => {
    const user = userEvent.setup();
    render(<App />);
    await naarInstellingen(user, 'Agenda en taken');
    await user.click(screen.getByRole('radio', { name: 'Maand' }));
    await user.click(screen.getByRole('radio', { name: /^Ik/ }));
    expect(screen.getByRole('radio', { name: 'Maand' })).toHaveAttribute('aria-checked', 'true');

    await user.click(within(screen.getByRole('navigation', { name: 'Hoofdnavigatie' })).getByRole('link', { name: 'Agenda' }));
    expect(screen.getByRole('tab', { name: 'Maand' })).toHaveAttribute('aria-selected', 'true');

    await naarInstellingen(user);
    expect(screen.getByRole('button', { name: 'Agenda en taken: Maand' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Standaardinstellingen herstellen' }));
    expect(screen.getByRole('button', { name: 'Agenda en taken: Week' })).toBeInTheDocument();
    expect(screen.getByText('Je gebruikt de standaardinstellingen.')).toBeInTheDocument();
    await user.click(within(screen.getByRole('navigation', { name: 'Hoofdnavigatie' })).getByRole('link', { name: 'Agenda' }));
    expect(screen.getByRole('tab', { name: 'Week' })).toHaveAttribute('aria-selected', 'true');
  });

  it('een adres naar een deel van de instellingen opent dat deel; een onbekend deel het overzicht', () => {
    window.history.replaceState(null, '', '/?nu=2026-10-10T11:20#/instellingen/agenda');
    const { unmount } = render(<App />);
    expect(screen.getByRole('heading', { level: 1, name: 'Agenda en taken' })).toBeInTheDocument();
    unmount();
    window.history.replaceState(null, '', '/?nu=2026-10-10T11:20#/instellingen/geheim');
    render(<App />);
    expect(screen.getByRole('heading', { level: 1, name: 'Persoonlijk' })).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------------------------
// Online: een nagebootste client (alleen de twee aanroepen die de opslag doet).
// ---------------------------------------------------------------------------------------------
function nepClient(opties: { prefs?: Record<string, unknown>; rpcFout?: boolean } = {}) {
  let prefs: Record<string, unknown> = { ...(opties.prefs ?? {}) };
  const rpc = vi.fn(async (naam: string, args: Record<string, unknown>) => {
    if (opties.rpcFout) return { data: null, error: { message: 'kapot' } };
    if (naam === 'set_preference') prefs = { ...prefs, [args.p_key as string]: args.p_value };
    if (naam === 'reset_preferences') prefs = {};
    return { data: [{ prefs, version: 2 }], error: null };
  });
  const haal = vi.fn(async () => ({ data: Object.keys(prefs).length ? { prefs } : null, error: null }));
  const client = { rpc, from: () => ({ select: () => ({ maybeSingle: haal }) }) } as unknown as SupabaseClient;
  return { client, rpc, haal, zetServer: (p: Record<string, unknown>) => { prefs = p; } };
}

describe('online opslag', () => {
  it('zonder de schakelaar: niets (null) en geen enkele aanroep', () => {
    const n = nepClient();
    const { result } = renderHook(() => useServerVoorkeuren(n.client, 'acc', true, () => {}, false));
    expect(result.current).toBeNull();
    expect(n.haal).not.toHaveBeenCalled();
  });

  it('de kopie geldt bij de start; daarna de stand van de server (ook in de kopie)', async () => {
    bewaarCache('acc', metWaarde(STANDAARD, 'startscherm', 'agenda'));
    const n = nepClient({ prefs: { startscherm: 'boodschappen' } });
    const { result } = renderHook(() => useServerVoorkeuren(n.client, 'acc', true, () => {}, true));
    expect(result.current!.bijStart?.startscherm).toBe('agenda');
    expect(result.current!.kanWijzigen).toBe(false);   // nog niet opgehaald
    await waitFor(() => expect(result.current!.voorkeuren.startscherm).toBe('boodschappen'));
    expect(result.current!.kanWijzigen).toBe(true);
    expect(result.current!.bijStart?.startscherm).toBe('agenda');   // de start verandert niet meer
    expect(leesCache('acc')?.startscherm).toBe('boodschappen');
  });

  it('wijzigen gaat per sleutel naar de server; herstellen met de scope weergave', async () => {
    const n = nepClient();
    const { result } = renderHook(() => useServerVoorkeuren(n.client, 'acc', true, () => {}, true));
    await waitFor(() => expect(result.current!.kanWijzigen).toBe(true));
    await act(async () => { await result.current!.zet('agenda.weergave', 'maand'); });
    expect(n.rpc).toHaveBeenCalledWith('set_preference', { p_key: 'agenda.weergave', p_value: 'maand' });
    expect(result.current!.voorkeuren.agendaWeergave).toBe('maand');
    expect(leesCache('acc')?.agendaWeergave).toBe('maand');
    await act(async () => { await result.current!.herstel(); });
    expect(n.rpc).toHaveBeenCalledWith('reset_preferences', { p_scope: 'weergave' });
    expect(result.current!.voorkeuren).toEqual(STANDAARD);
  });

  it('lukt opslaan niet, dan een melding en de oude stand', async () => {
    const meld = vi.fn();
    const n = nepClient({ prefs: { 'agenda.weergave': 'dag' }, rpcFout: true });
    const { result } = renderHook(() => useServerVoorkeuren(n.client, 'acc', true, meld, true));
    await waitFor(() => expect(result.current!.kanWijzigen).toBe(true));
    let ok = true;
    await act(async () => { ok = await result.current!.zet('agenda.weergave', 'maand'); });
    expect(ok).toBe(false);
    expect(meld).toHaveBeenCalledWith('Niet opgeslagen. Probeer het zo nog eens.');
    await waitFor(() => expect(result.current!.voorkeuren.agendaWeergave).toBe('dag'));
  });

  it('zonder verbinding: niet wijzigen, met de reden; de laatst bekende stand blijft gelden', async () => {
    bewaarCache('acc', metWaarde(STANDAARD, 'overzicht.boodschappen', false));
    const n = nepClient();
    const { result, rerender } = renderHook(({ online }) => useServerVoorkeuren(n.client, 'acc', online, () => {}, true),
      { initialProps: { online: false } });
    expect(result.current!.kanWijzigen).toBe(false);
    expect(result.current!.reden).toMatch(/Geen verbinding/);
    expect(result.current!.voorkeuren.overzicht.boodschappen).toBe(false);
    // Verbinding terug: de stand van een ander toestel komt binnen.
    n.zetServer({ 'agenda.wie': 'ik' });
    rerender({ online: true });
    await waitFor(() => expect(result.current!.voorkeuren.agendaWie).toBe('ik'));
    expect(result.current!.kanWijzigen).toBe(true);
  });

  it('terug naar de app haalt de stand van een ander toestel op', async () => {
    const n = nepClient();
    const { result } = renderHook(() => useServerVoorkeuren(n.client, 'acc', true, () => {}, true));
    await waitFor(() => expect(result.current!.kanWijzigen).toBe(true));
    n.zetServer({ startscherm: 'taken' });
    act(() => { document.dispatchEvent(new Event('visibilitychange')); });
    await waitFor(() => expect(result.current!.voorkeuren.startscherm).toBe('taken'));
  });
});
