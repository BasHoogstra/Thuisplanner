import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../src/App';

beforeEach(() => {
  window.history.replaceState(null, '', '/?nu=2026-10-10T11:20#/vandaag');
});

it('toont Vandaag met begroeting en demo-markering', () => {
  render(<App />);
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Goedemorgen, Eva');
  expect(screen.getByRole('note')).toHaveTextContent('Demo');
});

it('toevoegen via het centrale venster, met ongedaan maken', async () => {
  const user = userEvent.setup();
  render(<App />);
  await user.click(screen.getByRole('button', { name: 'Toevoegen' }));
  const venster = screen.getByRole('dialog', { name: 'Toevoegen' });
  // De centrale + is één zin (B2): zonder soort vooraf; "ramen lappen vandaag" is een taak voor vandaag (zonder dag
  // zou hij geen datum krijgen, besluit V1, en dus niet op Vandaag staan).
  await user.type(within(venster).getByLabelText('Wat wil je regelen?'), 'ramen lappen vandaag');
  expect(within(venster).getByRole('button', { name: 'Taak' })).toBeInTheDocument();
  await user.click(within(venster).getByRole('button', { name: 'Toevoegen' }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(screen.getByRole('checkbox', { name: /Ramen lappen/ })).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Ongedaan maken' }));
  expect(screen.queryByRole('checkbox', { name: /Ramen lappen/ })).not.toBeInTheDocument();
});

it('lege invoer wordt niet toegevoegd', async () => {
  const user = userEvent.setup();
  render(<App />);
  await user.click(screen.getByRole('button', { name: 'Toevoegen' }));
  const venster = screen.getByRole('dialog');
  // Een lege zin kan niet worden toegevoegd.
  expect(within(venster).getByRole('button', { name: 'Toevoegen' })).toBeDisabled();
  await user.type(within(venster).getByLabelText('Wat wil je regelen?'), '   ');
  expect(within(venster).getByRole('button', { name: 'Toevoegen' })).toBeDisabled();
  // Via "Alles invullen" geldt de bestaande controle van het formulier.
  await user.click(within(venster).getByRole('button', { name: 'Alles invullen' }));
  await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Toevoegen' }));
  expect(within(screen.getByRole('dialog')).getByText('Geef het even een naam.')).toBeInTheDocument();
});
