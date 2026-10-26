// Kruistests na de integratie van Agenda (stap 0–4) en Vakanties (F8): een vakantie staat in de nieuwe Agenda op de
// vertrekdag, in het dagoverzicht boven het dagblok, in de laptopweek als eigen regel (een dag met alleen een vakantie
// is niet "niets gepland"), en op iPhone/tablet in "Rest van de week". Vaste demo-klok: woensdag 21 oktober 2026;
// Frankrijk vertrekt vrijdag 30 oktober (over 9 dagen) en heeft voorbereidingen als gewone taken.
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../src/App';

const naar = (hash: string) => window.history.replaceState(null, '', `/?nu=2026-10-21T10:00${hash}`);
beforeEach(() => { naar('#/agenda'); try { localStorage.clear(); } catch { /* geen opslag */ } });

/** Een smal scherm (iPhone): matchMedia zegt "niet breed". Zonder matchMedia geldt jsdom als breed (laptop). */
function smalScherm() {
  window.matchMedia = ((query: string) => ({
    matches: false, media: query, onchange: null,
    addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}
afterEach(() => { delete (window as { matchMedia?: unknown }).matchMedia; });

async function naarWeekVanVertrek(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('tab', { name: 'Week' }));
  await user.click(screen.getByRole('button', { name: 'Volgende week' }));
}

it('laptopweek: de vakantie staat op de vertrekdag als eigen regel, en die dag is niet "niets gepland"', async () => {
  const user = userEvent.setup();
  render(<App />);
  await naarWeekVanVertrek(user);
  const vrijdag = screen.getByRole('region', { name: /vrijdag 30 oktober/ });
  expect(within(vrijdag).getByRole('button', { name: 'Vakantie Frankrijk. Openen' })).toBeInTheDocument();
  expect(within(vrijdag).queryByText('Niets gepland')).not.toBeInTheDocument();
  // Een tik op de vakantieregel opent de vakantie.
  await user.click(within(vrijdag).getByRole('button', { name: 'Vakantie Frankrijk. Openen' }));
  expect(screen.getByRole('heading', { level: 1, name: 'Frankrijk' })).toBeInTheDocument();
});

it('dagoverzicht: de vakantieregel staat boven het dagblok', async () => {
  const user = userEvent.setup();
  render(<App />);
  await naarWeekVanVertrek(user);
  await user.click(screen.getByRole('button', { name: /^Dagoverzicht vrijdag 30 oktober/ }));
  const dag = screen.getByRole('region', { name: /^Dagoverzicht vrijdag 30 oktober/ });
  expect(within(dag).getByRole('button', { name: 'Vakantie Frankrijk. Openen' })).toBeInTheDocument();
});

it('een voorbereiding met datum staat in het dagblok met het vakantielabel', async () => {
  const user = userEvent.setup();
  render(<App />);
  // "Vignet regelen" valt over 3 dagen (zaterdag 24 oktober) en hoort bij Frankrijk.
  await user.click(screen.getByRole('tab', { name: 'Week' }));
  await user.click(screen.getByRole('button', { name: /^Dagoverzicht zaterdag 24 oktober/ }));
  const dag = screen.getByRole('region', { name: /^Dagoverzicht zaterdag 24 oktober/ });
  const taken = within(dag).getByRole('list', { name: 'Taken' });
  expect(within(taken).getByRole('button', { name: 'Vignet regelen openen' })).toHaveTextContent('Frankrijk');
});

it('iPhone: in "Rest van de week" staat de vakantie bij de vertrekdag in plaats van "niets gepland"', async () => {
  smalScherm();
  const user = userEvent.setup();
  render(<App />);
  await naarWeekVanVertrek(user);
  const rest = screen.getByRole('heading', { name: 'Rest van de week' }).closest('section')!;
  const vrijdag = within(rest).getByRole('button', { name: /^Vrijdag 30/ });
  expect(vrijdag).toHaveTextContent('Frankrijk');
  expect(vrijdag).not.toHaveTextContent('niets gepland');
});
