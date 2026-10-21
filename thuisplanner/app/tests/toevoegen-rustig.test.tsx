// Rustiger Toevoegen-venster (docs/thuisplanner-snelinvoer.md, deel A): snelle tijden, de eindtijd en de
// klokkiezer pas op verzoek, en waar/herhalen/privé achter "Meer opties", behalve als er al iets is ingevuld.
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ItemVenster, type VensterOpdracht } from '../src/components/ItemVenster';
import { Ctx, type AppContext } from '../src/lib/context';
import { voorkomenId } from '../src/lib/herhaling';
import type { Afspraak, Item } from '../src/lib/types';

const EVA = 'm-eva', THOMAS = 'm-thomas', V = '2026-10-10';
const afspraak = (a: Partial<Afspraak>): Afspraak => ({
  id: 'a1', soort: 'afspraak', titel: 'Pizza bakken', datum: V, start: '18:00', wie: [], eigenaar: EVA,
  zichtbaarheid: 'huishouden', ...a,
});

function opzet(opdracht: VensterOpdracht, items: Item[] = []) {
  const toevoegen = vi.fn(), bijwerken = vi.fn();
  const ctx = {
    staat: { scenario: 'gewoon', items, weggeklikt: new Set(), vorige: null, melding: null },
    huishouden: { naam: 'Familie De Boer', ik: EVA, leden: [
      { id: EVA, naam: 'Eva', soort: 'volwassene', kleur: 'red', heeftAccount: true },
      { id: THOMAS, naam: 'Thomas', soort: 'volwassene', kleur: 'blue', heeftAccount: true }] },
    vandaag: V, nu: '09:00', uur: 9,
    lid: (id: string) => ({ id, naam: id, soort: 'volwassene', kleur: 'red', heeftAccount: true }),
    toevoegen, bijwerken, meld: vi.fn(),
  } as unknown as AppContext;
  render(<Ctx.Provider value={ctx}><ItemVenster opdracht={opdracht} sluit={() => {}} /></Ctx.Provider>);
  // Een nieuw item opent eerst de zin (B2); dit bestand toetst het formulier daarachter (Alles invullen).
  if (opdracht.type === 'nieuw') fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Alles invullen' }));
  // Een bestaand item opent eerst het overzicht (W1); dit bestand toetst het formulier daarachter (Meer… → Alles bewerken).
  else if (screen.queryByRole('button', { name: 'Meer…' })) {
    fireEvent.click(screen.getByRole('button', { name: 'Meer…' }));
    fireEvent.click(screen.getByRole('button', { name: 'Alles bewerken' }));
  }
  return { toevoegen, bijwerken, v: within(screen.getByRole('dialog')), user: userEvent.setup() };
}
const nieuw: VensterOpdracht = { type: 'nieuw', soort: 'afspraak' };

it('nieuwe afspraak: alleen de vaste vragen open; waar, herhalen en privé achter Meer opties', () => {
  const { v } = opzet(nieuw);
  expect(v.getByRole('button', { name: 'Hele dag' })).toHaveAttribute('aria-pressed', 'true');
  expect(v.queryByLabelText('Van')).not.toBeInTheDocument();
  expect(v.queryByLabelText('Tot')).not.toBeInTheDocument();
  expect(v.queryByRole('button', { name: '+ Eindtijd' })).not.toBeInTheDocument();
  expect(v.queryByLabelText(/Waar/)).not.toBeInTheDocument();
  expect(v.queryByRole('button', { name: 'Elke week' })).not.toBeInTheDocument();
  expect(v.queryByLabelText(/Privé/)).not.toBeInTheDocument();
  const meer = v.getByRole('button', { name: /^Meer opties/ });
  expect(meer).toHaveAttribute('aria-expanded', 'false');
  expect(meer).toHaveTextContent('Waar · Herhalen · Privé');
});

it('een snelle tijd is één tik; daarna kan een eindtijd, en "Hele dag" haalt beide weg', async () => {
  const { v, user, toevoegen } = opzet(nieuw);
  await user.type(v.getByLabelText('Wat?'), 'Kapper');
  await user.click(v.getByRole('button', { name: '15:30' }));
  expect(v.getByRole('button', { name: '15:30' })).toHaveAttribute('aria-pressed', 'true');
  await user.click(v.getByRole('button', { name: '+ Eindtijd' }));
  expect(v.getByLabelText('Tot')).toHaveFocus();
  await user.type(v.getByLabelText('Tot'), '16:15');
  await user.click(v.getByRole('button', { name: 'Hele dag' }));
  expect(v.queryByLabelText('Tot')).not.toBeInTheDocument();
  await user.click(v.getByRole('button', { name: '18:00' }));
  await user.click(v.getByRole('button', { name: 'Toevoegen' }));
  const [a] = toevoegen.mock.calls[0][0] as Afspraak[];
  expect(a).toMatchObject({ titel: 'Kapper', start: '18:00', eind: undefined, datum: V });
});

it('"Andere tijd" opent de klokkiezer met de cursor erin', async () => {
  const { v, user, toevoegen } = opzet(nieuw);
  await user.type(v.getByLabelText('Wat?'), 'Oudergesprek');
  await user.click(v.getByRole('button', { name: 'Andere tijd' }));
  expect(v.getByLabelText('Van')).toHaveFocus();
  await user.type(v.getByLabelText('Van'), '15:45');
  await user.click(v.getByRole('button', { name: 'Toevoegen' }));
  expect((toevoegen.mock.calls[0][0] as Afspraak[])[0].start).toBe('15:45');
});

it('Meer opties openen zet de cursor in "Waar?" en blijft daarna open', async () => {
  const { v, user, toevoegen } = opzet(nieuw);
  await user.type(v.getByLabelText('Wat?'), 'Huisarts');
  await user.click(v.getByRole('button', { name: /^Meer opties/ }));
  expect(v.getByLabelText(/Waar/)).toHaveFocus();
  expect(v.queryByRole('button', { name: /^Meer opties/ })).not.toBeInTheDocument();
  await user.type(v.getByLabelText(/Waar/), 'Gezondheidscentrum');
  await user.click(v.getByLabelText(/Privé/));
  await user.click(v.getByRole('button', { name: 'Elke maand' }));
  await user.click(v.getByRole('button', { name: 'Toevoegen' }));
  expect((toevoegen.mock.calls[0][0] as Afspraak[])[0]).toMatchObject({
    plek: 'Gezondheidscentrum', zichtbaarheid: 'prive', herhaling: { freq: 'maandelijks' },
  });
});

it.each([
  ['een plek', { plek: 'Sportpark Noord' }],
  ['privé', { zichtbaarheid: 'prive' as const }],
  ['een herhaling', { herhaling: { freq: 'wekelijks' as const } }],
])('bewerken met %s: Meer opties staat al open, zodat niets ingevuld onzichtbaar is', (_, extra) => {
  const { v } = opzet({ type: 'bewerk', id: 'a1' }, [afspraak(extra)]);
  expect(v.queryByRole('button', { name: /^Meer opties/ })).not.toBeInTheDocument();
  expect(v.getByLabelText(/Waar/)).toBeInTheDocument();
});

it('bewerken met een tijd die geen snelle tijd is: de klokkiezer en de eindtijd staan open', () => {
  const { v } = opzet({ type: 'bewerk', id: 'a1' }, [afspraak({ start: '09:15', eind: '10:00' })]);
  expect(v.getByRole('button', { name: 'Andere tijd' })).toHaveAttribute('aria-pressed', 'true');
  expect(v.getByLabelText('Van')).toHaveValue('09:15');
  expect(v.getByLabelText('Tot')).toHaveValue('10:00');
});

it('bewerken met een snelle tijd zonder plek, privé of herhaling: rustig dicht', () => {
  const { v, user, bijwerken } = opzet({ type: 'bewerk', id: 'a1' }, [afspraak({})]);
  expect(v.getByRole('button', { name: '18:00' })).toHaveAttribute('aria-pressed', 'true');
  expect(v.queryByLabelText('Van')).not.toBeInTheDocument();
  expect(v.getByRole('button', { name: /^Meer opties/ })).toBeInTheDocument();
  return user.click(v.getByRole('button', { name: 'Opslaan' })).then(() => {
    expect(bijwerken.mock.calls[0][0]).toMatchObject({ start: '18:00', eind: undefined, plek: undefined, zichtbaarheid: 'huishouden' });
  });
});

it('één voorkomen van een reeks: de herhaling staat in de reekskop, Meer opties blijft dicht', () => {
  const reeks = afspraak({ id: 'r1', start: '09:00', herhaling: { freq: 'wekelijks' } });
  const { v } = opzet({ type: 'bewerk', id: voorkomenId('r1', '2026-10-17') }, [reeks]);
  expect(v.getByText('Elke week op zaterdag')).toBeInTheDocument();
  expect(v.getByRole('button', { name: /^Meer opties/ })).toHaveTextContent('Waar · Privé');
});

it('gedeelde afspraak van een ander: Meer opties zonder privé', () => {
  const { v } = opzet({ type: 'bewerk', id: 'a1' }, [afspraak({ eigenaar: THOMAS })]);
  expect(v.getByRole('button', { name: /^Meer opties/ })).toHaveTextContent('Waar · Herhalen');
});

it('een taak heeft geen tijd en geen Meer opties', async () => {
  const { v } = opzet({ type: 'nieuw', soort: 'taak' });
  expect(v.queryByText('Hoe laat?')).not.toBeInTheDocument();
  expect(v.queryByRole('button', { name: /^Meer opties/ })).not.toBeInTheDocument();
  expect(v.getByText(/Wie pakt het op/)).toBeInTheDocument();
});
