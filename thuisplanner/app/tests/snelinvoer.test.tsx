// B2: de centrale + als één rustige invoer (src/components/SnelInvoer.tsx). Rustig (alleen het veld tot je typt), zichtbaar
// wat herkend is, één tik om te corrigeren, aannames anders getoond, privé altijd in beeld bij een afspraak, en twijfel in
// gewone taal. "Alles invullen" opent het formulier met wat er al herkend is.
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ItemVenster, type VensterOpdracht } from '../src/components/ItemVenster';
import { Ctx, type AppContext } from '../src/lib/context';
import type { Afspraak, Item, Taak } from '../src/lib/types';

const EVA = 'm-eva', LOTTE = 'm-lotte', LYNN = 'm-lynn', V = '2026-10-20';   // dinsdag

function opzet(opdracht: VensterOpdracht = { type: 'nieuw' }, items: Item[] = []) {
  const toevoegen = vi.fn(), voegBoodschappenToe = vi.fn(), sluit = vi.fn();
  const ctx = {
    staat: { scenario: 'gewoon', items, weggeklikt: new Set(), vorige: null, melding: null },
    huishouden: { naam: 'Familie De Boer', ik: EVA, leden: [
      { id: EVA, naam: 'Eva', soort: 'volwassene', kleur: 'red', heeftAccount: true },
      { id: LOTTE, naam: 'Lotte', soort: 'kind', kleur: 'blue', heeftAccount: false },
      { id: LYNN, naam: 'Lynn', soort: 'kind', kleur: 'green', heeftAccount: false }] },
    vandaag: V, nu: '09:00', uur: 9,
    lid: (id: string) => ({ id, naam: id, soort: 'volwassene', kleur: 'red', heeftAccount: true }),
    toevoegen, voegBoodschappenToe, bijwerken: vi.fn(), meld: vi.fn(),
  } as unknown as AppContext;
  render(<Ctx.Provider value={ctx}><ItemVenster opdracht={opdracht} sluit={sluit} /></Ctx.Provider>);
  const dialoog = () => within(screen.getByRole('dialog'));
  return { toevoegen, voegBoodschappenToe, sluit, d: dialoog, user: userEvent.setup() };
}
const typ = async (o: ReturnType<typeof opzet>, zin: string) => o.user.type(o.d().getByLabelText('Wat wil je regelen?'), zin);
const knop = (o: ReturnType<typeof opzet>, naam: string | RegExp) => o.d().getByRole('button', { name: naam });

it('rustig: alleen het veld, geen soortkeuze, geen datum- of tijdknoppen, en Toevoegen staat uit', () => {
  const o = opzet();
  expect(o.d().getByLabelText('Wat wil je regelen?')).toHaveFocus();
  expect(o.d().queryByRole('tab')).not.toBeInTheDocument();
  expect(o.d().queryByRole('group', { name: 'Wat Thuisplanner herkent' })).not.toBeInTheDocument();
  expect(knop(o, 'Toevoegen')).toBeDisabled();
  expect(knop(o, 'Alles invullen')).toBeInTheDocument();
});

it('een afspraak uit één zin: zichtbaar herkend en zo bewaard', async () => {
  const o = opzet();
  await typ(o, 'morgen om 15:00 met Lotte naar de tandarts');
  const herkend = within(o.d().getByRole('group', { name: 'Wat Thuisplanner herkent' }));
  for (const n of ['Afspraak', 'Morgen', '15:00', 'Lotte', 'Gedeeld']) expect(herkend.getByRole('button', { name: n })).toBeInTheDocument();
  expect(o.d().getByText('Naar de tandarts')).toBeInTheDocument();
  await o.user.click(knop(o, 'Toevoegen'));
  const [items] = o.toevoegen.mock.calls[0] as [Afspraak[]];
  expect(items[0]).toMatchObject({ soort: 'afspraak', titel: 'Naar de tandarts', datum: '2026-10-21', start: '15:00', wie: [LOTTE], zichtbaarheid: 'huishouden' });
  expect(o.sluit).toHaveBeenCalled();
});

it('corrigeren is één tik: een andere dag en een andere soort winnen van de zin', async () => {
  const o = opzet();
  await typ(o, 'morgen container aan de weg');
  await o.user.click(knop(o, 'Morgen'));
  await o.user.click(within(o.d().getByRole('group', { name: 'Wanneer' })).getByRole('button', { name: 'Overmorgen' }));
  expect(knop(o, 'Overmorgen')).toBeInTheDocument();
  await o.user.click(knop(o, 'Taak'));
  await o.user.click(within(o.d().getByRole('group', { name: 'Soort' })).getByRole('button', { name: 'Afspraak' }));
  await o.user.click(knop(o, 'Toevoegen'));
  expect((o.toevoegen.mock.calls[0][0] as Afspraak[])[0]).toMatchObject({ soort: 'afspraak', datum: '2026-10-22', titel: 'Container aan de weg' });
});

it('een aanname (niet uit de zin) ziet er anders uit en zegt dat ook', async () => {
  const o = opzet();
  await typ(o, 'tandarts om 9');
  const vandaag = knop(o, /^Vandaag/);
  expect(vandaag).toHaveClass('aanname');
  expect(vandaag).toHaveTextContent('niet uit je zin');
});

it('privé staat bij een afspraak altijd in beeld, en is met één tik te kiezen', async () => {
  const o = opzet();
  await typ(o, 'vrijdag om 14 fysio');
  await o.user.click(knop(o, 'Gedeeld'));
  expect(knop(o, 'Privé')).toHaveAttribute('aria-pressed', 'true');
  await o.user.click(knop(o, 'Toevoegen'));
  expect((o.toevoegen.mock.calls[0][0] as Afspraak[])[0].zichtbaarheid).toBe('prive');
});

it('een taak zonder dag: "Geen datum", zonder privé-knop en zonder tijd', async () => {
  const o = opzet();
  await typ(o, 'band plakken');
  expect(knop(o, 'Geen datum')).toBeInTheDocument();
  expect(o.d().queryByRole('button', { name: 'Gedeeld' })).not.toBeInTheDocument();
  expect(o.d().queryByRole('button', { name: 'Hele dag' })).not.toBeInTheDocument();
  await o.user.click(knop(o, 'Toevoegen'));
  expect((o.toevoegen.mock.calls[0][0] as Taak[])[0]).toMatchObject({ soort: 'taak', titel: 'Band plakken', datum: null, voor: null });
});

it('meerdere boodschappen in één zin, elk met een categorie', async () => {
  const o = opzet();
  await typ(o, 'melk, bananen, luiers en brood');
  expect(o.d().getByText('4 boodschappen')).toBeInTheDocument();
  for (const [naam, cat] of [['Melk', 'Zuivel & eieren'], ['Bananen', 'Groente & fruit'], ['Luiers', 'Baby & kind'], ['Brood', 'Brood & bakkerij']]) {
    expect(within(o.d().getByText(naam).closest('li')!).getByText(cat)).toBeInTheDocument();
  }
  await o.user.click(knop(o, 'Toevoegen'));
  expect(o.voegBoodschappenToe).toHaveBeenCalledWith(['Melk', 'Bananen', 'Luiers', 'Brood']);
});

it('twijfel staat er in gewone taal bij: een dag bij een boodschap kan nog niet', async () => {
  const o = opzet();
  await typ(o, 'luiers halen vanmiddag');
  expect(o.d().getByText(/Een dag bij een boodschap kan nog niet/)).toBeInTheDocument();
});

it('een bijna-naam wordt niet vanzelf gekoppeld; "Bedoel je Lynn?" doet het met één tik', async () => {
  const o = opzet();
  await typ(o, 'morgen om 15:00 met Lyn naar de tandarts');
  expect(o.d().queryByRole('button', { name: 'Lynn' })).toBeInTheDocument();   // de suggestie
  expect(knop(o, 'Iedereen')).toBeInTheDocument();                               // nog niet gekoppeld
  await o.user.click(knop(o, 'Lynn'));
  expect(within(o.d().getByRole('group', { name: 'Wat Thuisplanner herkent' })).getByRole('button', { name: 'Lynn' })).toBeInTheDocument();
  expect(o.d().getByText('Naar de tandarts')).toBeInTheDocument();
});

it('een herkend stuk terug in de titel zetten', async () => {
  const o = opzet();
  await typ(o, 'donderdag zwemles in het bad');
  await o.user.click(knop(o, 'het bad'));
  await o.user.click(knop(o, 'Terug in de titel'));
  expect(o.d().getByText('Zwemles in het bad')).toBeInTheDocument();
  expect(o.d().queryByRole('button', { name: 'het bad' })).not.toBeInTheDocument();
});

it('Alles invullen opent het formulier met wat er al herkend is', async () => {
  const o = opzet();
  await typ(o, 'morgen om 15:00 met Lotte naar de tandarts');
  await o.user.click(knop(o, 'Alles invullen'));
  expect(o.d().getByLabelText('Wat?')).toHaveValue('Naar de tandarts');
  expect(o.d().getByLabelText('Van')).toHaveValue('15:00');   // geen snelle tijd: het tijdveld staat open
  expect(o.d().getByRole('button', { name: 'Morgen' })).toHaveAttribute('aria-pressed', 'true');
});

it('vanuit een dag in de Agenda: die dag, als aanname', async () => {
  const o = opzet({ type: 'nieuw', datum: '2026-11-02' });
  await typ(o, 'kapper om 10');
  expect(knop(o, /^Maandag 2 november/)).toHaveClass('aanname');
});
