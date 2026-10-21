// F8 Vakanties (V1.3) in de demo: overzicht, vakantiepagina (Regelen, Inpakken, Notities) en de koppelingen met
// Vandaag, Agenda, Boodschappen en het taak-detail. Vaste demo-klok: woensdag 21 oktober 2026; Frankrijk vertrekt over 9 dagen.
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../src/App';

const naar = (hash: string) => window.history.replaceState(null, '', `/?nu=2026-10-21T10:00${hash}`);
beforeEach(() => { naar('#/vakanties'); try { localStorage.clear(); } catch { /* geen opslag */ } });

it('via Meer naar het overzicht: komend, en eerder ingeklapt', async () => {
  naar('#/meer');
  const user = userEvent.setup();
  render(<App />);
  await user.click(screen.getByRole('button', { name: /^Vakanties: Frankrijk · nog 9 dagen/ }));
  expect(screen.getByRole('heading', { level: 1, name: 'Vakanties' })).toBeInTheDocument();
  const komend = screen.getByRole('heading', { name: 'Komend' }).closest('section')!;
  expect(within(komend).getAllByRole('button').map(b => b.getAttribute('aria-label'))).toEqual([
    'Frankrijk, 30 okt – 13 nov, nog 9 dagen. Openen', 'Kerst op Texel, vertrek 24 dec, nog 64 dagen. Openen', 'Noorwegen, nog geen datum. Openen',
  ]);
  expect(screen.queryByRole('button', { name: /Italië/ })).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: /Eerder/ }));
  expect(screen.getByRole('button', { name: /Italië/ })).toBeInTheDocument();
  // Meer blijft in de navigatie gemarkeerd.
  expect(screen.getByRole('link', { name: 'Meer' })).toHaveAttribute('aria-current', 'page');
});

it('een vakantie met alleen een naam; de terugdatum pas na een vertrekdatum en niet vóór het vertrek', async () => {
  const user = userEvent.setup();
  render(<App />);
  await user.click(screen.getByRole('button', { name: 'Nieuwe vakantie' }));
  let v = screen.getByRole('dialog', { name: 'Nieuwe vakantie' });
  expect(within(v).getByLabelText(/^Terug/)).toBeDisabled();
  await user.type(within(v).getByLabelText('Naam'), 'Zweden');
  await user.click(within(v).getByRole('button', { name: 'Vakantie toevoegen' }));
  expect(screen.getByRole('heading', { level: 1, name: 'Zweden' })).toBeInTheDocument();
  expect(screen.getByText('nog geen datum')).toBeInTheDocument();
  // Aanpassen: einde vóór vertrek kan niet.
  await user.click(screen.getByRole('button', { name: 'Zweden aanpassen' }));
  v = screen.getByRole('dialog', { name: 'Vakantie aanpassen' });
  await user.type(within(v).getByLabelText(/^Vertrek/), '2027-07-10');
  await user.type(within(v).getByLabelText(/^Terug/), '2027-07-01');
  await user.click(within(v).getByRole('button', { name: 'Opslaan' }));
  expect(within(v).getByRole('alert')).toHaveTextContent('De terugdatum ligt vóór het vertrek.');
  await user.clear(within(v).getByLabelText(/^Terug/));
  await user.click(within(v).getByRole('button', { name: 'Opslaan' }));
  expect(screen.getByText(/vertrek 10 jul 2027/)).toBeInTheDocument();
});

it('inpakken: per persoon, snel achter elkaar, geen dubbele, en overnemen met ongedaan maken', async () => {
  naar('#/vakanties/v-texel');
  const user = userEvent.setup();
  render(<App />);
  await user.click(screen.getByRole('tab', { name: 'Inpakken' }));
  const personen = screen.getByRole('radiogroup', { name: 'Paklijst van' });
  expect(within(personen).getAllByRole('radio').map(r => r.textContent)).toEqual(['Eva0/0', 'Thomas0/0', 'Lotte0/0', 'Daan0/0', 'Gezamenlijk0/0']);
  expect(within(personen).getByRole('radio', { name: 'Eva, 0 van 0 ingepakt' })).toHaveAttribute('aria-checked', 'true');
  // Lege lijst: één rustige suggestie.
  expect(screen.getByText('Begin met de paklijst van Italië?')).toBeInTheDocument();
  const invoer = screen.getByRole('textbox', { name: 'Toevoegen voor Eva' });
  await user.type(invoer, 'Sokken{Enter}');
  await user.type(invoer, 'Shirts{Enter}');
  expect(invoer).toHaveFocus();
  expect(screen.getByRole('list', { name: 'Nog in te pakken voor Eva' }).textContent).toContain('Sokken');
  await user.type(invoer, '  sokken {Enter}');
  expect(screen.getByRole('status')).toHaveTextContent('Staat al op de lijst van Eva');
  // Andere persoon.
  await user.click(within(personen).getByRole('radio', { name: /^Daan/ }));
  expect(screen.getByRole('textbox', { name: 'Toevoegen voor Daan' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Daan · 0 van 0 ingepakt' })).toBeInTheDocument();
  // Overnemen van Italië: Eva's Sokken stonden er al.
  await user.click(screen.getByRole('button', { name: 'Overnemen van een eerdere vakantie' }));
  const venster = screen.getByRole('dialog', { name: 'Paklijst overnemen' });
  expect(within(venster).getByRole('radio', { name: /Italië/ })).toHaveAttribute('aria-checked', 'true');
  await user.click(within(venster).getByRole('button', { name: 'Overnemen' }));
  expect(screen.getByRole('status')).toHaveTextContent('23 items overgenomen');
  expect(within(personen).getByRole('radio', { name: 'Daan, 0 van 4 ingepakt' })).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Ongedaan maken' }));
  expect(within(personen).getByRole('radio', { name: 'Daan, 0 van 0 ingepakt' })).toBeInTheDocument();
  expect(within(personen).getByRole('radio', { name: 'Eva, 0 van 2 ingepakt' })).toBeInTheDocument();
});

it('afvinken, aanpassen, verplaatsen en verwijderen van een pakitem', async () => {
  naar('#/vakanties/v-frankrijk');
  const user = userEvent.setup();
  render(<App />);
  await user.click(screen.getByRole('tab', { name: 'Inpakken' }));
  await user.click(screen.getByRole('checkbox', { name: 'Korte broeken' }));
  expect(screen.getByRole('radio', { name: 'Eva, 5 van 10 ingepakt' })).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Vest aanpassen' }));
  const v = screen.getByRole('dialog', { name: 'Pakitem' });
  await user.click(within(v).getByRole('button', { name: 'Gezamenlijk' }));
  await user.click(within(v).getByRole('button', { name: 'Opslaan' }));
  expect(screen.getByRole('status')).toHaveTextContent('Vest staat nu bij Gezamenlijk');
  await user.click(screen.getByRole('button', { name: 'Sandalen aanpassen' }));
  await user.click(within(screen.getByRole('dialog', { name: 'Pakitem' })).getByRole('button', { name: 'Verwijderen' }));
  expect(screen.queryByRole('checkbox', { name: 'Sandalen' })).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Ongedaan maken' }));
  expect(screen.getByRole('checkbox', { name: 'Sandalen' })).toBeInTheDocument();
});

it('afvinken opnieuw beginnen voor één persoon, met ongedaan maken', async () => {
  naar('#/vakanties/v-frankrijk');
  const user = userEvent.setup();
  render(<App />);
  await user.click(screen.getByRole('tab', { name: 'Inpakken' }));
  await user.click(screen.getByRole('button', { name: 'Afvinken opnieuw beginnen' }));
  await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Voor Eva' }));
  expect(screen.getByRole('radio', { name: 'Eva, 0 van 10 ingepakt' })).toBeInTheDocument();
  expect(screen.getByRole('radio', { name: 'Lotte, 2 van 7 ingepakt' })).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Ongedaan maken' }));
  expect(screen.getByRole('radio', { name: 'Eva, 4 van 10 ingepakt' })).toBeInTheDocument();
});

it('een voorbereiding is een gewone taak: in de Agenda (zonder datum) met het vakantielabel', async () => {
  naar('#/vakanties/v-frankrijk');
  const user = userEvent.setup();
  render(<App />);
  expect(screen.getByRole('checkbox', { name: 'Vignet regelen' })).toBeInTheDocument();
  await user.type(screen.getByRole('textbox', { name: 'Voorbereiding toevoegen' }), 'Auto laten nakijken{Enter}');
  expect(screen.getByRole('checkbox', { name: 'Auto laten nakijken' })).toBeInTheDocument();
  await user.click(screen.getByRole('link', { name: 'Agenda' }));
  const ooit = screen.getByRole('heading', { name: 'Taken zonder datum' }).closest('section')!;
  const rij = within(ooit).getByRole('button', { name: 'Auto laten nakijken openen' });
  expect(rij).toHaveTextContent('Frankrijk');
  // Het taak-detail: de vakantie wijzigen naar "Geen".
  await user.click(rij);
  const d = screen.getByRole('dialog', { name: 'Taak' });
  await user.click(within(d).getByRole('button', { name: /Vakantie Frankrijk/ }));
  await user.click(within(d).getByRole('button', { name: 'Geen' }));
  await user.click(within(d).getByRole('button', { name: 'Opslaan' }));
  expect(within(ooit).getByRole('button', { name: 'Auto laten nakijken openen' })).not.toHaveTextContent('Frankrijk');
});

it('te kopen voor de vakantie staat op de gewone boodschappenlijst, met het label', async () => {
  naar('#/vakanties/v-frankrijk');
  const user = userEvent.setup();
  render(<App />);
  await user.click(screen.getByRole('button', { name: /^Boodschappen voor Frankrijk/ }));
  await user.type(screen.getByRole('textbox', { name: 'Boodschap voor deze vakantie' }), 'Muggenspray{Enter}');
  expect(screen.getByRole('checkbox', { name: 'Muggenspray' })).toBeInTheDocument();
  await user.click(screen.getByRole('link', { name: 'Boodschappen' }));
  expect(screen.getByRole('button', { name: 'Muggenspray aanpassen' })).toHaveTextContent('Frankrijk');
  // Afvinken in de winkel = afgevinkt bij de vakantie (één boodschap).
  await user.click(screen.getByRole('checkbox', { name: 'Muggenspray' }));
  await user.click(screen.getByRole('link', { name: 'Meer' }));
  await user.click(screen.getByRole('button', { name: /^Vakanties:/ }));
  await user.click(screen.getByRole('button', { name: /^Frankrijk,/ }));
  expect(screen.getByRole('button', { name: /^Boodschappen voor Frankrijk/ })).toHaveAttribute('aria-expanded', 'true');
  await user.click(screen.getByRole('button', { name: '1 gekocht · tonen' }));
  expect(within(screen.getByRole('list', { name: 'Gekocht voor Frankrijk' })).getByRole('checkbox', { name: 'Muggenspray' })).toHaveAttribute('aria-checked', 'true');
});

it('Vandaag toont de vakantiekaart (de regels voor 14 dagen vooraf staan in vakantie.test.ts) en die opent de vakantie', async () => {
  naar('#/vandaag');
  const user = userEvent.setup();
  render(<App />);
  await user.click(screen.getByRole('button', { name: 'Frankrijk, over 9 dagen, 3 voorbereidingen open · ingepakt 7/37. Openen' }));
  expect(screen.getByRole('heading', { level: 1, name: 'Frankrijk' })).toBeInTheDocument();
});

it('een boodschap bij de vakantie is hetzelfde item als op de gewone lijst: aanpassen en afvinken gelden overal', async () => {
  naar('#/vakanties/v-frankrijk');
  const user = userEvent.setup();
  render(<App />);
  await user.click(screen.getByRole('button', { name: /^Boodschappen voor Frankrijk/ }));
  await user.type(screen.getByRole('textbox', { name: 'Boodschap voor deze vakantie' }), 'Muggenspray{Enter}');
  expect(screen.getByText('0 van 1 gekocht')).toBeInTheDocument();
  // Aanpassen via de vakantie opent het gewone boodschappenvenster.
  await user.click(screen.getByRole('button', { name: 'Muggenspray. Meer' }));
  await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Naam aanpassen' }));
  const venster = screen.getByRole('dialog');
  const veld = within(venster).getAllByRole('textbox')[0];
  await user.clear(veld);
  await user.type(veld, 'Muggenspray deet');
  await user.click(within(venster).getByRole('button', { name: /Opslaan|Bewaren/ }));
  expect(screen.getByRole('checkbox', { name: 'Muggenspray deet' })).toBeInTheDocument();
  await user.click(screen.getByRole('checkbox', { name: 'Muggenspray deet' }));
  expect(screen.getByText('1 van 1 gekocht')).toBeInTheDocument();
  // Op de gewone lijst: dezelfde naam, en afgevinkt (in het mandje), met het vakantielabel.
  await user.click(screen.getByRole('link', { name: 'Boodschappen' }));
  expect(screen.getByRole('checkbox', { name: 'Muggenspray deet' })).toHaveAttribute('aria-checked', 'true');
  expect(screen.getAllByRole('checkbox', { name: /Muggenspray/ })).toHaveLength(1);
  expect(screen.getByRole('button', { name: 'Muggenspray deet aanpassen' })).toHaveTextContent('Frankrijk');
});

it('Regelen: één blok tegelijk open, de kop met voortgang blijft zichtbaar, en de keuze wordt onthouden', async () => {
  naar('#/vakanties/v-frankrijk');
  const user = userEvent.setup();
  const { unmount } = render(<App />);
  const taken = screen.getByRole('button', { name: /^Voorbereidingen/ });
  const kopen = screen.getByRole('button', { name: /^Boodschappen voor Frankrijk/ });
  expect(taken).toHaveAttribute('aria-expanded', 'true');
  expect(kopen).toHaveAttribute('aria-expanded', 'false');
  expect(screen.queryByRole('textbox', { name: 'Boodschap voor deze vakantie' })).not.toBeInTheDocument();
  await user.click(kopen);
  expect(kopen).toHaveAttribute('aria-expanded', 'true');
  expect(taken).toHaveAttribute('aria-expanded', 'false');
  expect(screen.queryByRole('textbox', { name: 'Voorbereiding toevoegen' })).not.toBeInTheDocument();
  expect(taken).toHaveTextContent('1 van 4 klaar');
  expect(screen.getByRole('progressbar', { name: 'Voorbereidingen klaar' })).toBeInTheDocument();
  // Wegnavigeren en terugkomen: Boodschappen is nog open.
  unmount();
  render(<App />);
  expect(screen.getByRole('button', { name: /^Boodschappen voor Frankrijk/ })).toHaveAttribute('aria-expanded', 'true');
  // Beide dicht kan ook.
  await user.click(screen.getByRole('button', { name: /^Boodschappen voor Frankrijk/ }));
  expect(screen.getByRole('button', { name: /^Voorbereidingen/ })).toHaveAttribute('aria-expanded', 'false');
});

it('afgeronde voorbereidingen compact: tonen, terugzetten naar open, en afvinken verbergt weer', async () => {
  naar('#/vakanties/v-frankrijk');
  const user = userEvent.setup();
  render(<App />);
  const open = screen.getByRole('list', { name: 'Open voorbereidingen' });
  expect(within(open).getAllByRole('checkbox')).toHaveLength(3);
  await user.click(screen.getByRole('button', { name: '1 afgerond · tonen' }));
  const afgerond = screen.getByRole('list', { name: 'Afgeronde voorbereidingen' });
  const klaar = within(afgerond).getByRole('checkbox');
  const naam = klaar.getAttribute('aria-label')!;
  await user.click(klaar);   // terugzetten
  expect(within(screen.getByRole('list', { name: 'Open voorbereidingen' })).getByRole('checkbox', { name: naam })).toHaveAttribute('aria-checked', 'false');
  expect(screen.getByRole('button', { name: /^Voorbereidingen/ })).toHaveTextContent('0 van 4 klaar');
  await user.click(screen.getByRole('checkbox', { name: 'Kattenoppas vragen' }));
  expect(screen.getByRole('button', { name: /^Voorbereidingen/ })).toHaveTextContent('1 van 4 klaar');
  expect(within(screen.getByRole('list', { name: 'Open voorbereidingen' })).queryByRole('checkbox', { name: 'Kattenoppas vragen' })).not.toBeInTheDocument();
});

it('inpakken: ingepakte items compact, terugzetten, en per persoon opnieuw ingeklapt', async () => {
  naar('#/vakanties/v-frankrijk');
  const user = userEvent.setup();
  render(<App />);
  await user.click(screen.getByRole('tab', { name: 'Inpakken' }));
  expect(screen.queryByRole('list', { name: 'Ingepakt voor Eva' })).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: '4 ingepakt · tonen' }));
  const lijst = screen.getByRole('list', { name: 'Ingepakt voor Eva' });
  await user.click(within(lijst).getAllByRole('checkbox')[0]);   // terugzetten
  expect(screen.getByRole('radio', { name: 'Eva, 3 van 10 ingepakt' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '3 ingepakt · verbergen' })).toBeInTheDocument();
  await user.click(screen.getByRole('radio', { name: /^Lotte/ }));
  expect(screen.getByRole('button', { name: '2 ingepakt · tonen' })).toBeInTheDocument();
  expect(screen.getAllByRole('progressbar')).toHaveLength(1);   // alleen de gekozen persoon
});
