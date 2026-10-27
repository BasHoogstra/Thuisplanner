import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { Foutgrens, meldLink } from '../src/components/Foutgrens';
import { App } from '../src/App';

// N2 (docs/thuisplanner-beta-voorbereiding.md Q4): een vastgelopen scherm of venster geeft een rustige melding met
// "Opnieuw laden" en "Meld dit", geen wit scherm. De Agenda en het venster lopen hier met opzet vast; de rest is echt.
vi.mock('../src/screens/Agenda', () => ({
  Agenda: () => { throw new TypeError('Geheime afspraak bij de huisarts'); },
}));
vi.mock('../src/components/ItemVenster', () => ({
  ItemVenster: () => { throw new RangeError('Verrassingsfeest Q7Z'); },
}));

const GEHEIM = /Geheime afspraak|huisarts|Verrassingsfeest|Q7Z/;
let stil: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  window.history.replaceState(null, '', '/?nu=2026-10-10T11:20#/vandaag');
  stil = vi.spyOn(console, 'error').mockImplementation(() => {});   // React en de grens melden de fout in de console
});
afterEach(() => stil.mockRestore());

function Gooi({ fout }: { fout: Error }): never { throw fout; }

it('een vastgelopen onderdeel: rustige melding, Opnieuw laden en Meld dit; de melding bevat geen inhoud', () => {
  render(<Foutgrens plek="Agenda" omgeving="staging"><Gooi fout={new TypeError('Geheime afspraak bij de huisarts')} /></Foutgrens>);
  const melding = screen.getByRole('alert');
  expect(within(melding).getByRole('heading', { name: 'Dit scherm liep vast' })).toBeInTheDocument();
  expect(within(melding).getByRole('button', { name: 'Opnieuw laden' })).toBeInTheDocument();
  const meld = within(melding).getByRole('link', { name: 'Meld dit' });
  const href = decodeURIComponent(meld.getAttribute('href')!);
  expect(href.startsWith('mailto:?subject=Thuisplanner: Agenda liep vast&body=')).toBe(true);
  expect(href).toMatch(/Tijdstip: \d{4}-\d\d-\d\d \d\d:\d\d \(tijd van dit toestel\)/);
  expect(href).toContain('Scherm: Agenda');
  expect(href).toContain('Omgeving: staging');
  expect(href).toContain('Soort fout: TypeError');
  // Tegenproef in de test zelf: de foutmelding (met een titel) staat nergens, niet in de link en niet op het scherm.
  expect(href).not.toMatch(GEHEIM);
  expect(document.body.textContent).not.toMatch(GEHEIM);
});

it('meldLink: alleen een korte naam van het soort fout, anders "Error"', () => {
  const m = new Date(2026, 9, 26, 9, 5);
  expect(decodeURIComponent(meldLink({ moment: m, plek: 'Vandaag', soort: 'TypeError' }))).toContain('Tijdstip: 2026-10-26 09:05');
  expect(decodeURIComponent(meldLink({ moment: m, plek: 'Vandaag', soort: 'Fout met Noor erin' }))).toContain('Soort fout: Error\n');
  expect(decodeURIComponent(meldLink({ moment: m, plek: 'Vandaag', soort: 'TypeError' }))).not.toContain('Omgeving:');
});

it('in de app: de Agenda loopt vast, de navigatie blijft werken en een ander scherm begint opnieuw', async () => {
  const user = userEvent.setup();
  render(<App />);
  const nav = screen.getByRole('navigation', { name: 'Hoofdnavigatie' });
  await user.click(within(nav).getByRole('link', { name: 'Agenda' }));
  const melding = screen.getByRole('alert');
  expect(within(melding).getByRole('heading', { name: 'Dit scherm liep vast' })).toBeInTheDocument();
  expect(decodeURIComponent(within(melding).getByRole('link', { name: 'Meld dit' }).getAttribute('href')!)).toContain('Omgeving: demo');
  expect(document.body.textContent).not.toMatch(GEHEIM);
  await user.click(within(nav).getByRole('link', { name: 'Vandaag' }));
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Goedemorgen, Eva');
});

it('in de app: het venster loopt vast; Sluiten brengt je terug en de app werkt verder', async () => {
  const user = userEvent.setup();
  render(<App />);
  await user.click(screen.getByRole('button', { name: 'Toevoegen' }));
  const melding = screen.getByRole('alert');
  expect(within(melding).getByRole('heading', { name: 'Dit venster liep vast' })).toBeInTheDocument();
  expect(decodeURIComponent(within(melding).getByRole('link', { name: 'Meld dit' }).getAttribute('href')!)).toContain('Scherm: Toevoegen of aanpassen');
  expect(document.body.textContent).not.toMatch(GEHEIM);
  await user.click(within(melding).getByRole('button', { name: 'Sluiten' }));
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Goedemorgen, Eva');
});
