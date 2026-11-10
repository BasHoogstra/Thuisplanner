// Plannen, stap A (besluit 18, docs/thuisplanner-plannen.md): een plan-taak is een gewone taak. Afvinken op Vandaag werkt
// door in de voortgang, bewerken laat de koppeling staan, en buiten de demo bestaat Plannen niet.
// Vaste demo-klok: woensdag 21 oktober 2026.
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../src/App';
import { beginStaat, reducer, type Staat } from '../src/lib/store';
import { naarTaakVelden } from '../src/lib/lokaal/omzetten';
import { eindTekst, planStand, schermVoor, sorteerPlannen, takenVan, voortgang } from '../src/lib/plan';
import type { Plan, Taak } from '../src/lib/types';

const V = '2026-10-21';
const naar = (hash: string) => window.history.replaceState(null, '', `/?nu=${V}T10:00${hash}`);
beforeEach(() => { naar('#/plannen'); try { localStorage.clear(); } catch { /* geen opslag */ } });

const plan = (p: Partial<Plan> = {}): Plan => ({ id: 'p1', titel: 'Plan', einddatum: null, wie: [], ...p });
const taak = (t: Partial<Taak> = {}): Taak => ({ id: 't1', soort: 'taak', titel: 'Taak', datum: null, voor: null, klaar: false, klaarOp: null, planId: 'p1', ...t });
const schuurTaken = (s: Staat) => takenVan(s.items, 'plan-schuur');

describe('berekeningen', () => {
  it('voortgang telt afgeronde taken, en is nooit opgeslagen', () => {
    expect(voortgang([])).toEqual({ klaar: 0, totaal: 0 });
    expect(voortgang([taak({ klaar: true }), taak(), taak()])).toEqual({ klaar: 1, totaal: 3 });
  });

  it('de stand van een plan volgt uit de taken', () => {
    expect(planStand(plan(), [])).toBe('Nog geen taken');
    expect(planStand(plan(), [taak()])).toBe('Nog niet begonnen');
    expect(planStand(plan(), [taak({ klaar: true }), taak()])).toBe('Bezig');
    expect(planStand(plan(), [taak({ klaar: true })])).toBe('Alles klaar');
    expect(planStand(plan({ afgerondOp: V }), [taak({ klaar: true })])).toBe('Afgerond');
  });

  it('een einddatum is een gewone zin, ook als die voorbij is', () => {
    expect(eindTekst(plan(), V)).toBeNull();
    expect(eindTekst(plan({ einddatum: '2027-01-18' }), V)).toBe('vóór 18 januari');
    expect(eindTekst(plan({ einddatum: '2026-10-12' }), V)).toBe('was vóór 12 oktober');
    expect(eindTekst(plan({ einddatum: '2026-10-12', afgerondOp: V }), V)).toBeNull();
  });

  it('volgorde: eerst de dichtstbijzijnde einddatum, daarna het nieuwste plan', () => {
    const lijst = [plan({ id: 'oud' }), plan({ id: 'laat', einddatum: '2027-03-01' }), plan({ id: 'vroeg', einddatum: '2026-12-01' }), plan({ id: 'nieuw' })];
    expect(sorteerPlannen(lijst).map(p => p.id)).toEqual(['vroeg', 'laat', 'nieuw', 'oud']);
  });
});

describe('scheiding demo en echt', () => {
  it('in lokaal en staging bestaat het scherm niet: terug naar Vandaag', () => {
    expect(schermVoor('plannen', true)).toBe('vandaag');
    expect(schermVoor('plannen', false)).toBe('plannen');
    expect(schermVoor('agenda', true)).toBe('agenda');
  });

  it('de koppeling met een plan gaat nooit mee naar de server', () => {
    expect(naarTaakVelden(taak())).toEqual({ title: 'Taak', due_date: null, assignee_member_id: null });
  });
});

describe('de staat', () => {
  it('het voorbeeld: Schuur opruimen zonder onderdelen, met vijf gewone taken', () => {
    const s = beginStaat(V);
    expect(s.plannen.map(p => p.titel)).toEqual(['Schuur opruimen', 'Zolder verbouwen']);
    expect(schuurTaken(s)).toHaveLength(5);
    expect(voortgang(schuurTaken(s))).toEqual({ klaar: 1, totaal: 5 });
  });

  it('de gewone dag heeft één plan-taak op vandaag; de rustige dag blijft rustig', () => {
    const opVandaag = (s: Staat) => schuurTaken(s).filter(t => t.datum === V).map(t => t.titel);
    expect(opVandaag(beginStaat(V, 'gewoon'))).toEqual(['Spullen naar de kringloop']);
    expect(opVandaag(beginStaat(V, 'rustig'))).toEqual([]);
  });

  it('een formulier zonder planveld laat de koppeling staan; een expliciete keuze wijzigt haar', () => {
    let s = reducer(beginStaat(V), { type: 'toevoegen', items: [taak({ id: 't-x' })] });
    const { planId: _weg, ...zonder } = taak({ id: 't-x', titel: 'Nieuw' });
    s = reducer(s, { type: 'bijwerken', item: zonder });
    expect((s.items.find(i => i.id === 't-x') as Taak).planId).toBe('p1');
    s = reducer(s, { type: 'bijwerken', item: { ...zonder, planId: null } });
    expect((s.items.find(i => i.id === 't-x') as Taak).planId).toBeNull();
  });

  it('plan verwijderen: de taken blijven als losse taken, en ongedaan maken zet alles terug', () => {
    const begin = beginStaat(V);
    let s = reducer(begin, { type: 'planVerwijderen', id: 'plan-schuur', metTaken: false, melding: 'weg' });
    expect(s.plannen.map(p => p.id)).toEqual(['plan-zolder']);
    expect(s.items).toHaveLength(begin.items.length);
    expect(takenVan(s.items, 'plan-schuur')).toEqual([]);
    s = reducer(s, { type: 'ongedaan' });
    expect(s.plannen).toEqual(begin.plannen);
    expect(schuurTaken(s)).toHaveLength(5);
  });

  it('plan en taken verwijderen: ongedaan maken zet ook de taken terug', () => {
    const begin = beginStaat(V);
    let s = reducer(begin, { type: 'planVerwijderen', id: 'plan-schuur', metTaken: true, melding: 'weg' });
    expect(s.items).toHaveLength(begin.items.length - 5);
    s = reducer(s, { type: 'ongedaan' });
    expect(s.items).toHaveLength(begin.items.length);
    expect(s.plannen).toEqual(begin.plannen);
  });

  it('een taak van een afgerond plan weer openzetten, opent ook het plan', () => {
    let s = beginStaat(V);
    s = reducer(s, { type: 'planBijwerken', plan: { ...s.plannen[0], afgerondOp: V } });
    const klaar = schuurTaken(s).find(t => t.klaar)!;
    s = reducer(s, { type: 'wissel', id: klaar.id, vandaag: V });
    expect(s.plannen[0].afgerondOp).toBeNull();
    s = reducer(s, { type: 'ongedaan' });
    expect(s.plannen[0].afgerondOp).toBe(V);
  });
});

describe('in de app', () => {
  it('via Meer naar het overzicht, met naam, status en voortgang; Meer blijft gemarkeerd', async () => {
    naar('#/meer');
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: /^Plannen: Zolder verbouwen en nog 1/ }));
    expect(screen.getByRole('heading', { level: 1, name: 'Plannen' })).toBeInTheDocument();
    const kaart = screen.getByRole('button', { name: /^Schuur opruimen, Bezig, 1 van 5 klaar/ });
    expect(within(kaart).getByRole('progressbar')).toHaveAttribute('aria-valuenow', '1');
    expect(within(kaart).getByText('1 voor jou')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Meer' })).toHaveAttribute('aria-current', 'page');
  });

  it('afvinken op Vandaag is dezelfde taak: de voortgang van het plan loopt mee', async () => {
    naar('#/vandaag');
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('checkbox', { name: 'Spullen naar de kringloop' }));
    window.location.hash = '#/plannen';
    expect(await screen.findByRole('button', { name: /^Schuur opruimen, Bezig, 2 van 5 klaar/ })).toBeInTheDocument();
  });

  it('afvinken in het plan werkt door naar Vandaag', async () => {
    naar('#/plannen/plan-schuur');
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('checkbox', { name: 'Spullen naar de kringloop' }));
    expect(screen.getByText('2 van 5 klaar')).toBeInTheDocument();
    window.location.hash = '#/vandaag';
    await screen.findByRole('heading', { level: 1, name: /Goedemorgen/ });
    await user.click(screen.getByRole('button', { name: /afgerond vandaag · tonen/ }));
    expect(screen.getByRole('checkbox', { name: 'Spullen naar de kringloop' })).toBeChecked();
  });

  it('een plan-taak op Vandaag toont bij welk plan zij hoort', () => {
    naar('#/vandaag');
    render(<App />);
    const rij = screen.getByRole('checkbox', { name: 'Spullen naar de kringloop' }).closest('li')!;
    expect(within(rij).getByText('Schuur opruimen')).toBeInTheDocument();
  });

  it('een plan met alleen een naam, en dan meteen taken toevoegen', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Nieuw plan' }));
    const v = screen.getByRole('dialog', { name: 'Nieuw plan' });
    expect(within(v).getByText(/Iedereen in het huishouden ziet dit plan/)).toBeInTheDocument();
    await user.click(within(v).getByRole('button', { name: 'Plan maken' }));
    expect(within(v).getByRole('alert')).toHaveTextContent('naam');
    await user.type(within(v).getByLabelText('Naam'), '  Verjaardag   organiseren ');
    await user.click(within(v).getByRole('button', { name: 'Plan maken' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Verjaardag organiseren' })).toBeInTheDocument();
    expect(screen.getByText('Nog geen taken')).toBeInTheDocument();
    const veld = screen.getByLabelText('Taak toevoegen');
    expect(veld).toHaveFocus();
    await user.type(veld, 'Slingers kopen{Enter}');
    await user.type(veld, 'Taart bestellen{Enter}');
    expect(veld).toHaveValue('');
    expect(veld).toHaveFocus();
    expect(screen.getByText('0 van 2 klaar')).toBeInTheDocument();
  });

  it('omschrijving, einddatum en wie zijn optioneel, en te wijzigen', async () => {
    naar('#/plannen/plan-schuur');
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Schuur opruimen aanpassen' }));
    const v = screen.getByRole('dialog', { name: 'Plan aanpassen' });
    expect(within(v).getByLabelText(/^Omschrijving/)).toHaveValue('Eindelijk weer ruimte voor de fietsen.');
    await user.type(within(v).getByLabelText(/^Einddatum/), '2027-01-18');
    await user.click(within(within(v).getByRole('group', { name: 'Voor wie' })).getByRole('button', { name: 'Thomas' }));
    await user.click(within(v).getByRole('button', { name: 'Opslaan' }));
    expect(screen.getByText('vóór 18 januari')).toBeInTheDocument();
    expect(within(screen.getByRole('main')).getAllByText('Thomas').length).toBeGreaterThan(0);
  });

  it('"Alles bewerken" en het detailvenster laten de koppeling met het plan staan', async () => {
    naar('#/plannen/plan-schuur');
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Vegen openen' }));
    let d = screen.getByRole('dialog', { name: 'Taak' });
    await user.clear(within(d).getByLabelText('Wat?'));
    await user.type(within(d).getByLabelText('Wat?'), 'Goed vegen');
    await user.click(within(d).getByRole('button', { name: 'Opslaan' }));
    await user.click(screen.getByRole('button', { name: 'Goed vegen openen' }));
    d = screen.getByRole('dialog', { name: 'Taak' });
    await user.click(within(d).getByRole('button', { name: 'Meer…' }));
    await user.click(within(d).getByRole('button', { name: 'Alles bewerken' }));
    d = screen.getByRole('dialog', { name: 'Taak' });
    await user.clear(within(d).getByLabelText(/^Wat/));
    await user.type(within(d).getByLabelText(/^Wat/), 'Heel goed vegen');
    await user.click(within(d).getByRole('button', { name: 'Opslaan' }));
    expect(screen.getByRole('checkbox', { name: 'Heel goed vegen' })).toBeInTheDocument();   // nog steeds in dit plan
    expect(screen.getByText('1 van 5 klaar')).toBeInTheDocument();
  });

  it('een taak aan een plan toevoegen via het detailvenster; een vakantie valt dan weg (één context)', async () => {
    naar('#/agenda');
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: /^Zonder datum/ }));
    await user.click(screen.getByRole('button', { name: 'Kattenoppas vragen openen' }));
    const d = screen.getByRole('dialog', { name: 'Taak' });
    await user.click(within(d).getByRole('button', { name: /^Plan / }));
    await user.click(within(within(d).getByRole('group', { name: 'Hoort bij plan' })).getByRole('button', { name: 'Schuur opruimen' }));
    expect(within(d).queryByRole('button', { name: /^Vakantie / })).not.toBeInTheDocument();
    await user.click(within(d).getByRole('button', { name: 'Opslaan' }));
    window.location.hash = '#/plannen';
    expect(await screen.findByRole('button', { name: /^Schuur opruimen, Bezig, 1 van 6 klaar/ })).toBeInTheDocument();
  });

  it('alles klaar: er wordt rustig gevraagd of het plan af is, en het gaat niet vanzelf', async () => {
    naar('#/plannen/plan-schuur');
    const user = userEvent.setup();
    render(<App />);
    expect(screen.queryByRole('button', { name: 'Plan afronden' })).not.toBeInTheDocument();
    for (const naam of ['Oud gereedschap uitzoeken', 'Spullen naar de kringloop', 'Planken ophangen', 'Vegen']) {
      await user.click(screen.getByRole('checkbox', { name: naam }));
    }
    expect(screen.getByText('Alles klaar')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Plan afronden' }));
    expect(screen.queryByLabelText('Taak toevoegen')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Plannen' }));
    expect(screen.getByRole('button', { name: /^Afgerond/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Schuur opruimen,/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^Afgerond/ }));
    expect(screen.getByRole('button', { name: /^Schuur opruimen, Afgerond/ })).toBeInTheDocument();
  });

  it('verwijderen: alleen het plan laat de taken staan, met ongedaan maken', async () => {
    naar('#/plannen/plan-schuur');
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Schuur opruimen aanpassen' }));
    const v = screen.getByRole('dialog', { name: 'Plan aanpassen' });
    await user.click(within(v).getByRole('button', { name: 'Plan verwijderen' }));
    expect(within(v).getByText(/5 taken blijven als losse taken bestaan/)).toBeInTheDocument();
    await user.click(within(v).getByRole('button', { name: 'Alleen het plan' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Plannen' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Schuur opruimen,/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Ongedaan maken' }));
    expect(screen.getByRole('button', { name: /^Schuur opruimen, Bezig/ })).toBeInTheDocument();
  });

  it('een plan dat niet bestaat: het overzicht, met een rustige zin', () => {
    naar('#/plannen/bestaat-niet');
    render(<App />);
    expect(screen.getByRole('status')).toHaveTextContent('Dat plan bestaat niet (meer).');
    expect(screen.getByRole('heading', { level: 1, name: 'Plannen' })).toBeInTheDocument();
  });

  it('geen vergelijking tussen leden: nergens een score of percentage', () => {
    naar('#/plannen/plan-schuur');
    const { container } = render(<App />);
    expect(container.textContent).not.toMatch(/%|score|meer gedaan/i);
  });
});
