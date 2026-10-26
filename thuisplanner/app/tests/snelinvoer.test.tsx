// De centrale + (src/components/SnelInvoer.tsx, docs/thuisplanner-snelinvoer.md §10): een invoerbalk met de verzendknop,
// daarboven één kaart met de betekenis in gewone taal, Aanpassen op verzoek, privé altijd in beeld bij een afspraak, en bij
// twijfel één vraag. "Formulier" opent het formulier met wat er al herkend is.
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
type O = ReturnType<typeof opzet>;
const typ = async (o: O, zin: string) => o.user.type(o.d().getByLabelText('Wat wil je regelen?'), zin);
const knop = (o: O, naam: string | RegExp) => o.d().getByRole('button', { name: naam });
const regel = (_o?: O) => screen.getByRole('dialog').querySelector('.kaart-regel')!;
const aanpassen = (o: O) => o.user.click(knop(o, 'Aanpassen'));

it('rustig: alleen het veld en de verzendknop (uit), geen kaart; Formulier en Sluiten', () => {
  const o = opzet();
  expect(o.d().getByLabelText('Wat wil je regelen?')).toHaveFocus();
  expect(o.d().getByLabelText('Wat wil je regelen?')).toHaveAttribute('placeholder', 'Wat moet er gebeuren?');
  expect(o.d().queryByRole('tab')).not.toBeInTheDocument();
  expect(o.d().queryByRole('button', { name: 'Aanpassen' })).not.toBeInTheDocument();
  expect(knop(o, 'Toevoegen')).toBeDisabled();
  expect(knop(o, 'Formulier')).toBeInTheDocument();
  expect(knop(o, 'Sluiten')).toBeInTheDocument();
});

it('een afspraak uit één zin: de betekenis in gewone taal, en zo bewaard', async () => {
  const o = opzet();
  await typ(o, 'morgen om 15:00 met Lotte naar de tandarts');
  expect(o.d().getByText('Naar de tandarts')).toBeInTheDocument();
  expect(regel(o)).toHaveTextContent('Morgen om 15:00 · met Lotte');
  expect(knop(o, 'Gedeeld met het huishouden')).toBeInTheDocument();
  expect(o.d().queryByRole('button', { name: 'Afspraak' })).not.toBeInTheDocument();   // geen rij losse labels meer
  await o.user.click(knop(o, 'Toevoegen'));
  const [items] = o.toevoegen.mock.calls[0] as [Afspraak[]];
  expect(items[0]).toMatchObject({ soort: 'afspraak', titel: 'Naar de tandarts', datum: '2026-10-21', start: '15:00', wie: [LOTTE], zichtbaarheid: 'huishouden' });
  expect(o.sluit).toHaveBeenCalled();
});

it('Enter ("Gereed") voegt toe, net als de verzendknop', async () => {
  const o = opzet();
  await typ(o, 'band plakken{Enter}');
  expect((o.toevoegen.mock.calls[0][0] as Taak[])[0]).toMatchObject({ soort: 'taak', titel: 'Band plakken' });
});

it('corrigeren via Aanpassen: een andere dag en een andere soort winnen van de zin', async () => {
  const o = opzet();
  await typ(o, 'morgen container aan de weg');
  await aanpassen(o);
  await o.user.click(knop(o, 'Wanneer: Morgen'));
  await o.user.click(within(o.d().getByRole('group', { name: 'Wanneer' })).getByRole('button', { name: 'Overmorgen' }));
  expect(knop(o, 'Wanneer: Overmorgen')).toBeInTheDocument();
  await o.user.click(knop(o, 'Soort: Taak'));
  await o.user.click(within(o.d().getByRole('group', { name: 'Soort' })).getByRole('button', { name: 'Afspraak' }));
  await o.user.click(knop(o, 'Toevoegen'));
  expect((o.toevoegen.mock.calls[0][0] as Afspraak[])[0]).toMatchObject({ soort: 'afspraak', datum: '2026-10-22', titel: 'Container aan de weg' });
});

it('Aanpassen toont alleen de regels die bij de soort horen; Klaar klapt in', async () => {
  const o = opzet();
  await typ(o, 'melk en brood');
  await aanpassen(o);
  expect(knop(o, 'Soort: Boodschap')).toBeInTheDocument();
  expect(knop(o, 'Lijst: Nu te kopen')).toBeInTheDocument();
  expect(o.d().queryByRole('button', { name: /^Wanneer:/ })).not.toBeInTheDocument();
  expect(o.d().queryByRole('button', { name: /^Hoe laat:/ })).not.toBeInTheDocument();
  await o.user.click(knop(o, 'Klaar'));
  expect(o.d().queryByRole('button', { name: /^Soort:/ })).not.toBeInTheDocument();
});

it('een aanname (niet uit de zin) staat er in woorden bij', async () => {
  const o = opzet();
  await typ(o, 'tandarts om 9');
  expect(regel(o)).toHaveTextContent('Vandaag om 09:00 (geen dag genoemd)');
});

it('privé staat bij een afspraak altijd in beeld, en is met één tik te kiezen', async () => {
  const o = opzet();
  await typ(o, 'vrijdag om 14 fysio');
  await o.user.click(knop(o, 'Gedeeld met het huishouden'));
  expect(knop(o, 'Alleen voor jou (privé)')).toHaveAttribute('aria-pressed', 'true');
  await o.user.click(knop(o, 'Toevoegen'));
  expect((o.toevoegen.mock.calls[0][0] as Afspraak[])[0].zichtbaarheid).toBe('prive');
});

it('een taak zonder dag: "Zonder datum", zonder privé en zonder tijd', async () => {
  const o = opzet();
  await typ(o, 'band plakken');
  expect(regel(o)).toHaveTextContent('Zonder datum');
  expect(o.d().queryByRole('button', { name: 'Gedeeld met het huishouden' })).not.toBeInTheDocument();
  await aanpassen(o);
  expect(o.d().queryByRole('button', { name: /^Hoe laat:/ })).not.toBeInTheDocument();
  await o.user.click(knop(o, 'Toevoegen'));
  expect((o.toevoegen.mock.calls[0][0] as Taak[])[0]).toMatchObject({ soort: 'taak', titel: 'Band plakken', datum: null, voor: null });
});

it('meerdere boodschappen in één zin: één regel met de namen, zonder categorieën', async () => {
  const o = opzet();
  await typ(o, 'melk, bananen, luiers en brood');
  expect(o.d().getByText('Melk, Bananen en 2 meer')).toBeInTheDocument();
  expect(regel(o)).toHaveTextContent('Op de boodschappenlijst');
  expect(o.d().queryByText('Zuivel & eieren')).not.toBeInTheDocument();
  await o.user.click(knop(o, 'Toevoegen'));
  expect(o.voegBoodschappenToe).toHaveBeenCalledWith(['Melk', 'Bananen', 'Luiers', 'Brood']);
});

it('een toelichting staat er in gewone taal bij: een dag bij een boodschap kan nog niet', async () => {
  const o = opzet();
  await typ(o, 'luiers halen vanmiddag');
  expect(o.d().getByText(/Een dag bij een boodschap kan nog niet/)).toBeInTheDocument();
});

it('een bijna-naam: één vraag ("Bedoel je Lynn?"), niets vanzelf; Lynn koppelt', async () => {
  const o = opzet();
  await typ(o, 'morgen om 15:00 met Lyn naar de tandarts');
  const vraag = within(o.d().getByRole('group', { name: 'Bedoel je Lynn?' }));
  expect(regel(o)).not.toHaveTextContent('met Lynn');                       // nog niet gekoppeld
  await o.user.click(vraag.getByRole('button', { name: 'Lynn' }));
  expect(regel(o)).toHaveTextContent('met Lynn');
  expect(o.d().getByText('Naar de tandarts')).toBeInTheDocument();
});

it('een bijna-naam: Nee laat de vraag verdwijnen en de zin staan', async () => {
  const o = opzet();
  await typ(o, 'morgen om 15:00 met Lyn naar de tandarts');
  await o.user.click(within(o.d().getByRole('group', { name: 'Bedoel je Lynn?' })).getByRole('button', { name: 'Nee' }));
  expect(o.d().queryByRole('group', { name: 'Bedoel je Lynn?' })).not.toBeInTheDocument();
  expect(knop(o, 'Toevoegen')).toBeEnabled();
});

it('"om 4": de vraag laat 16:00 staan, of zet met één tik 04:00', async () => {
  const o = opzet();
  await typ(o, 'zwemles om 4');
  const vraag = within(o.d().getByRole('group', { name: 'Bedoel je 16:00?' }));
  expect(knop(o, 'Toevoegen')).toBeEnabled();                                // de zin geldt; geen extra stap nodig
  await o.user.click(vraag.getByRole('button', { name: '04:00' }));
  expect(regel(o)).toHaveTextContent('om 04:00');
  await o.user.click(knop(o, 'Toevoegen'));
  expect((o.toevoegen.mock.calls[0][0] as Afspraak[])[0].start).toBe('04:00');
});

it('een herkend stuk niet herkennen: het blijft in de titel', async () => {
  const o = opzet();
  await typ(o, 'donderdag zwemles in het bad');
  await aanpassen(o);
  await o.user.click(knop(o, 'Waar: het bad'));
  await o.user.click(knop(o, 'Niet herkennen'));
  expect(o.d().getByText('Zwemles in het bad')).toBeInTheDocument();
  expect(o.d().queryByRole('button', { name: /^Waar:/ })).not.toBeInTheDocument();
});

it.each(['Formulier', 'Meer in het formulier'])('%s opent het formulier met wat er al herkend is', async naam => {
  const o = opzet();
  await typ(o, 'morgen om 15:00 met Lotte naar de tandarts');
  if (naam !== 'Formulier') await aanpassen(o);
  await o.user.click(knop(o, naam));
  expect(o.d().getByLabelText('Wat?')).toHaveValue('Naar de tandarts');
  expect(o.d().getByLabelText('Van')).toHaveValue('15:00');   // geen snelle tijd: het tijdveld staat open
  expect(o.d().getByRole('button', { name: 'Morgen' })).toHaveAttribute('aria-pressed', 'true');
});

it('vanuit een dag in de Agenda: die dag, als aanname in woorden', async () => {
  const o = opzet({ type: 'nieuw', datum: '2026-11-02' });
  await typ(o, 'kapper om 10');
  expect(regel(o)).toHaveTextContent('Maandag 2 november om 10:00 (geen dag genoemd)');
});

it('vanuit Boodschappen: de vraag gaat over kopen', () => {
  const o = opzet({ type: 'nieuw', soort: 'boodschap' });
  expect(o.d().getByLabelText('Wat wil je regelen?')).toHaveAttribute('placeholder', 'Wat moet er gekocht worden?');
});

it('een open melding van een vorige toevoeging verdwijnt zodra de + opent (hij mag niets blokkeren)', () => {
  const meldingWeg = vi.fn();
  const ctx = {
    staat: { scenario: 'gewoon', items: [], weggeklikt: new Set(), vorige: null, melding: { id: 7, tekst: 'Melk op de lijst', ongedaan: true } },
    huishouden: { naam: 'X', ik: EVA, leden: [] }, vandaag: V, nu: '09:00', uur: 9, lid: () => undefined, meldingWeg,
  } as unknown as AppContext;
  render(<Ctx.Provider value={ctx}><ItemVenster opdracht={{ type: 'nieuw' }} sluit={vi.fn()} /></Ctx.Provider>);
  expect(meldingWeg).toHaveBeenCalledWith(7);
  expect(screen.getByRole('dialog')).toBeInTheDocument();
});
