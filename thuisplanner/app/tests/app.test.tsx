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
  await user.click(within(venster).getByRole('tab', { name: 'Taak' }));
  await user.type(within(venster).getByLabelText('Wat?'), 'Ramen lappen');
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
  await user.click(within(venster).getByRole('button', { name: 'Toevoegen' }));
  expect(within(venster).getByText('Geef het even een naam.')).toBeInTheDocument();
});
