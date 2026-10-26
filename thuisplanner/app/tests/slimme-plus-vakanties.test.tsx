// De slimme + met Vakanties en Boodschappen → Later nodig (docs/thuisplanner-vakanties.md §19), in de demo. Eén onderliggend
// item: de + gebruikt dezelfde handelingen als de Boodschappen- en vakantiepagina. Vaste demo-klok: woensdag 21 oktober 2026.
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../src/App';

const naar = (hash: string) => window.history.replaceState(null, '', `/?nu=2026-10-21T10:00${hash}`);
beforeEach(() => { naar('#/vandaag'); try { localStorage.clear(); } catch { /* geen opslag */ } });

type Gebruiker = ReturnType<typeof userEvent.setup>;
async function plus(user: Gebruiker, zin: string) {
  // De centrale + in de navigatie (de Boodschappen-pagina heeft ook een knop Toevoegen).
  await user.click(document.querySelector<HTMLButtonElement>('.nav-plus')!);
  const d = within(screen.getByRole('dialog'));
  await user.type(d.getByLabelText('Wat wil je regelen?'), zin);
  return d;
}
async function naarFrankrijk(user: Gebruiker) {
  await user.click(screen.getByRole('link', { name: 'Meer' }));
  await user.click(screen.getByRole('button', { name: /^Vakanties:/ }));
  await user.click(screen.getByRole('button', { name: /^Frankrijk,/ }));
}
// De betekenisregel op de kaart, en Aanpassen (docs/thuisplanner-snelinvoer.md §10).
const regel = () => screen.getByRole('dialog').querySelector('.kaart-regel')!;
const nuTeKopen = () => screen.getByRole('heading', { name: /^Nu te kopen/ }).closest('section')!;

it('"Zonnebrand kopen voor Frankrijk": één boodschap, gekoppeld, bij Later nodig; geen "Zonnebrand voor Frankrijk"', async () => {
  naar('#/boodschappen');
  const user = userEvent.setup();
  render(<App />);
  const d = await plus(user, 'Zonnebrand kopen voor Frankrijk');
  expect(regel()).toHaveTextContent('Voor Frankrijk · bij Later nodig');
  await user.click(d.getByRole('button', { name: 'Toevoegen' }));
  expect(screen.getByRole('status')).toHaveTextContent('Zonnebrand bij Later nodig');
  expect(screen.queryByText('Zonnebrand voor Frankrijk')).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: /^Later nodig 5/ }));
  expect(within(screen.getByRole('list', { name: 'Later nodig' })).getByRole('button', { name: 'Zonnebrand aanpassen' })).toHaveTextContent('Frankrijk');
  await naarFrankrijk(user);
  const blok = screen.getByRole('button', { name: /^Boodschappen voor Frankrijk/ });
  if (blok.getAttribute('aria-expanded') === 'false') await user.click(blok);
  expect(screen.getByRole('button', { name: 'Zonnebrand. Meer' })).toHaveTextContent('later nodig');
});

it('vóór opslaan corrigeren: een andere vakantie, Nu te kopen, of Geen vakantie', async () => {
  naar('#/boodschappen');
  const user = userEvent.setup();
  render(<App />);
  let d = await plus(user, 'Pleisters kopen voor Frankrijk');
  await user.click(d.getByRole('button', { name: 'Aanpassen' }));
  await user.click(d.getByRole('button', { name: 'Vakantie: Frankrijk' }));
  await user.click(within(d.getByRole('group', { name: 'Vakantie' })).getByRole('button', { name: 'Kerst op Texel' }));
  expect(d.getByRole('button', { name: 'Vakantie: Kerst op Texel' })).toBeInTheDocument();
  await user.click(d.getByRole('button', { name: 'Lijst: Later nodig' }));
  await user.click(within(d.getByRole('group', { name: 'Lijst' })).getByRole('button', { name: 'Nu te kopen' }));
  expect(regel()).toHaveTextContent('Voor Kerst op Texel · nu te kopen');
  await user.click(d.getByRole('button', { name: 'Toevoegen' }));
  expect(within(nuTeKopen()).getByRole('button', { name: 'Pleisters aanpassen' })).toHaveTextContent('Kerst op Texel');
  // Geen vakantie: een gewone boodschap bij Nu te kopen, zonder label en zonder de vakantienaam in de naam.
  d = await plus(user, 'Batterijen kopen voor Frankrijk');
  await user.click(d.getByRole('button', { name: 'Aanpassen' }));
  await user.click(d.getByRole('button', { name: 'Vakantie: Frankrijk' }));
  await user.click(within(d.getByRole('group', { name: 'Vakantie' })).getByRole('button', { name: 'Geen vakantie' }));
  expect(regel()).toHaveTextContent('Op de boodschappenlijst');
  await user.click(d.getByRole('button', { name: 'Toevoegen' }));
  expect(within(nuTeKopen()).getByRole('button', { name: 'Batterijen aanpassen' })).not.toHaveTextContent('Frankrijk');
  // Niet herkennen: dan blijft de tekst zoals getypt (geen koppeling).
  d = await plus(user, 'Kaarten kopen voor Frankrijk');
  await user.click(d.getByRole('button', { name: 'Aanpassen' }));
  await user.click(d.getByRole('button', { name: 'Vakantie: Frankrijk' }));
  await user.click(d.getByRole('button', { name: 'Niet herkennen' }));
  expect(d.getByRole('button', { name: 'Vakantie: Geen' })).toBeInTheDocument();
  expect(d.getByText('Kaarten voor Frankrijk')).toBeInTheDocument();
});

it('"Paspoorten controleren voor Frankrijk": een voorbereiding; een gelijknamige geeft een waarschuwing, toevoegen kan toch', async () => {
  const user = userEvent.setup();
  render(<App />);
  let d = await plus(user, 'Paspoorten controleren voor Frankrijk');
  expect(regel()).toHaveTextContent('Voorbereiding voor Frankrijk');
  await user.click(d.getByRole('button', { name: 'Aanpassen' }));
  expect(d.getByRole('button', { name: 'Vakantie: Frankrijk' })).toBeInTheDocument();
  expect(d.queryByRole('button', { name: /^Lijst:/ })).not.toBeInTheDocument();
  await user.click(d.getByRole('button', { name: 'Toevoegen' }));
  expect(screen.getByRole('status')).toHaveTextContent('Paspoorten controleren staat bij de voorbereidingen van Frankrijk');
  d = await plus(user, 'paspoorten controleren voor Frankrijk');
  expect(d.getByText(/staat al bij de voorbereidingen van Frankrijk\. Toevoegen kan toch\./)).toBeInTheDocument();
  expect(d.getByRole('button', { name: 'Toevoegen' })).toBeEnabled();
  await user.click(d.getByRole('button', { name: 'Toevoegen' }));
  await naarFrankrijk(user);
  expect(within(screen.getByRole('list', { name: 'Open voorbereidingen' })).getAllByRole('checkbox', { name: /paspoorten controleren/i })).toHaveLength(2);
});

it('"Muggenspray kopen" terwijl hij bij Later nodig staat: vooraf en na afloop een duidelijke melding, één item', async () => {
  const user = userEvent.setup();
  render(<App />);
  const d = await plus(user, 'Muggenspray kopen');
  expect(d.queryByRole('button', { name: /^Vakantie:/ })).not.toBeInTheDocument();
  expect(d.getByText('Muggenspray staat bij Later nodig voor Frankrijk; hij gaat naar Nu te kopen.')).toBeInTheDocument();
  await user.click(d.getByRole('button', { name: 'Toevoegen' }));
  expect(screen.getByRole('status')).toHaveTextContent('Muggenspray nu te kopen (stond bij Later nodig)');
  await user.click(screen.getByRole('link', { name: 'Boodschappen' }));
  expect(within(nuTeKopen()).getByRole('button', { name: 'Muggenspray aanpassen' })).toHaveTextContent('Frankrijk');
  expect(screen.getAllByRole('checkbox', { name: 'Muggenspray' })).toHaveLength(1);
});

it('meerdere vakanties: een bestaande boodschap krijgt er een koppeling bij en blijft één item', async () => {
  const user = userEvent.setup();
  render(<App />);
  const d = await plus(user, 'Zonnebrand factor 50 kopen voor Kerst op Texel');
  expect(d.getByText('Zonnebrand factor 50 staat al bij Later nodig voor Frankrijk; hij komt er ook voor Kerst op Texel bij.')).toBeInTheDocument();
  await user.click(d.getByRole('button', { name: 'Toevoegen' }));
  await user.click(screen.getByRole('link', { name: 'Boodschappen' }));
  await user.click(screen.getByRole('button', { name: /^Later nodig 4/ }));
  expect(screen.getAllByRole('checkbox', { name: 'Zonnebrand factor 50' })).toHaveLength(1);
  expect(screen.getByRole('button', { name: 'Zonnebrand factor 50 aanpassen' })).toHaveTextContent(/Frankrijk.*Kerst op Texel/);
});

it('"Formulier" houdt de vakantie en Later nodig vast, en ze zijn daar te wijzigen', async () => {
  const user = userEvent.setup();
  render(<App />);
  let d = await plus(user, 'Kerstkransjes en glühwein kopen voor Kerst op Texel');
  await user.click(d.getByRole('button', { name: 'Formulier' }));
  d = within(screen.getByRole('dialog'));
  expect(within(d.getByRole('group', { name: 'Vakantie' })).getByRole('button', { name: 'Kerst op Texel' })).toHaveAttribute('aria-pressed', 'true');
  expect(within(d.getByRole('group', { name: 'Op de lijst' })).getByRole('button', { name: 'Later nodig' })).toHaveAttribute('aria-pressed', 'true');
  await user.click(d.getByRole('button', { name: 'Toevoegen' }));
  await user.click(screen.getByRole('link', { name: 'Boodschappen' }));
  await user.click(screen.getByRole('button', { name: /^Later nodig/ }));
  expect(screen.getByRole('button', { name: 'Glühwein aanpassen' })).toHaveTextContent('Kerst op Texel');
  // Een taak: de vakantie gaat mee; geen lijstkeuze.
  d = await plus(user, 'Fietsen nakijken voor Frankrijk');
  await user.click(d.getByRole('button', { name: 'Formulier' }));
  d = within(screen.getByRole('dialog'));
  expect(within(d.getByRole('group', { name: 'Vakantie' })).getByRole('button', { name: 'Frankrijk' })).toHaveAttribute('aria-pressed', 'true');
  expect(d.queryByRole('group', { name: 'Op de lijst' })).not.toBeInTheDocument();
  await user.click(d.getByRole('button', { name: 'Toevoegen' }));
  expect(screen.getByRole('status')).toHaveTextContent('Fietsen nakijken staat bij de voorbereidingen van Frankrijk');
});

it('een gewone boodschap of taak via Formulier: het formulier zoals altijd (geen vakantie- of lijstkeuze)', async () => {
  const user = userEvent.setup();
  render(<App />);
  for (const zin of ['Wc-papier kopen', 'Fietsband plakken']) {
    const d = await plus(user, zin);
    await user.click(d.getByRole('button', { name: 'Formulier' }));
    const f = within(screen.getByRole('dialog'));
    expect(f.queryByRole('group', { name: 'Vakantie' })).not.toBeInTheDocument();
    expect(f.queryByRole('group', { name: 'Op de lijst' })).not.toBeInTheDocument();
    await user.keyboard('{Escape}');
  }
});

it('een afspraak met "voor Frankrijk": niet gekoppeld, de tekst blijft in de titel, met uitleg', async () => {
  const user = userEvent.setup();
  render(<App />);
  const d = await plus(user, 'Ferry boeken om 10:00 voor Frankrijk');
  expect(d.queryByRole('button', { name: /^Vakantie:/ })).not.toBeInTheDocument();
  expect(d.getByText('Ferry boeken voor Frankrijk')).toBeInTheDocument();
  expect(d.getByText('Een afspraak koppelen aan een vakantie kan nog niet: de vakantie blijft in de titel.')).toBeInTheDocument();
});

it('twee vakanties met dezelfde naam: niets vanzelf koppelen; eerst kiezen', async () => {
  naar('#/vakanties');
  const user = userEvent.setup();
  render(<App />);
  await user.click(screen.getByRole('button', { name: 'Nieuwe vakantie' }));
  const v = within(screen.getByRole('dialog', { name: 'Nieuwe vakantie' }));
  await user.type(v.getByLabelText('Naam'), 'Frankrijk');
  await user.click(v.getByRole('button', { name: 'Vakantie toevoegen' }));
  const d = await plus(user, 'Zonnebrand kopen voor Frankrijk');
  // Eén vraag in de kaart; Toevoegen staat uit tot er gekozen is.
  const vraag = within(d.getByRole('group', { name: 'Voor welke vakantie?' }));
  expect(d.getByRole('button', { name: 'Toevoegen' })).toBeDisabled();
  expect(regel()).toHaveTextContent('Op de boodschappenlijst');   // nog geen vakantie: niet vanzelf Later nodig
  const keuzes = vraag.getAllByRole('button', { name: /^Frankrijk \(/ });
  expect(keuzes).toHaveLength(2);   // met de periode erbij, zodat duidelijk is welke
  expect(vraag.getByRole('button', { name: 'Geen vakantie' })).toBeInTheDocument();
  await user.click(keuzes[0]);
  expect(d.getByRole('button', { name: 'Toevoegen' })).toBeEnabled();
  expect(regel()).toHaveTextContent('Voor Frankrijk · bij Later nodig');
});
