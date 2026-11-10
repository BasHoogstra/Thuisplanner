// Plannen, stap B (besluit 18): onderdelen, Bezig, de groep in de Agenda en het koppelmodel voor bijlagen.
// Vaste demo-klok: woensdag 21 oktober 2026.
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../src/App';
import { beginStaat, reducer } from '../src/lib/store';
import { onderdelenVan, planStand, statusVelden, takenPerOnderdeel, takenVan, taakStatus } from '../src/lib/plan';
import { alleBijlagenVanPlan, bijlagenVanPlan, bijlagenVanTaak, koppelBijlage, ontkoppelBijlage } from '../src/lib/plan-bijlagen';
import { naarTaakVelden } from '../src/lib/lokaal/omzetten';
import type { Plan, PlanKoppeling, Taak } from '../src/lib/types';

const V = '2026-10-21';
const naar = (hash: string) => window.history.replaceState(null, '', `/?nu=${V}T10:00${hash}`);
beforeEach(() => { naar('#/plannen/plan-zolder'); try { localStorage.clear(); } catch { /* geen opslag */ } });
const taakIn = (s: ReturnType<typeof beginStaat>, id: string) => s.items.find(i => i.id === id) as Taak;
const taak = (t: Partial<Taak> = {}): Taak => ({ id: 't1', soort: 'taak', titel: 'Taak', datum: null, voor: null, klaar: false, klaarOp: null, planId: 'p1', ...t });
const plan: Plan = { id: 'p1', titel: 'Plan', einddatum: null, wie: [] };

describe('status: afgeleid, met één waarheid voor afgerond', () => {
  it('te doen, bezig en afgerond', () => {
    expect(taakStatus(taak())).toBe('Te doen');
    expect(taakStatus(taak({ bezig: true }))).toBe('Bezig');
    expect(taakStatus(taak({ klaar: true, bezig: true }))).toBe('Afgerond');
  });

  it('de velden per status; een al afgeronde taak houdt haar datum', () => {
    expect(statusVelden('Afgerond', taak({ bezig: true }), V)).toEqual({ klaar: true, klaarOp: V, bezig: false });
    expect(statusVelden('Afgerond', taak({ klaar: true, klaarOp: '2026-10-01' }), V).klaarOp).toBe('2026-10-01');
    expect(statusVelden('Bezig', taak({ klaar: true, klaarOp: V }), V)).toEqual({ klaar: false, klaarOp: null, bezig: true });
    expect(statusVelden('Te doen', taak({ bezig: true }), V)).toEqual({ klaar: false, klaarOp: null, bezig: false });
  });

  it('een plan is bezig zodra iemand bezig is, ook als nog niets klaar is', () => {
    expect(planStand(plan, [taak({ bezig: true }), taak()])).toBe('Bezig');
  });

  it('afvinken haalt Bezig weg; weer openzetten begint bij Te doen', () => {
    let s = reducer(beginStaat(V), { type: 'wissel', id: 't-zolder-vergunning', vandaag: V });
    expect(taakIn(s, 't-zolder-vergunning')).toMatchObject({ klaar: true, bezig: false });
    s = reducer(s, { type: 'wissel', id: 't-zolder-vergunning', vandaag: V });
    expect(taakStatus(taakIn(s, 't-zolder-vergunning'))).toBe('Te doen');
  });
});

describe('onderdelen in de staat', () => {
  it('het voorbeeld: Zolder heeft drie onderdelen op volgorde, Schuur geen', () => {
    const s = beginStaat(V);
    expect(onderdelenVan(s.onderdelen, 'plan-zolder').map(o => o.naam)).toEqual(['Voorbereiding', 'Verbouwing', 'Afwerking']);
    expect(onderdelenVan(s.onderdelen, 'plan-schuur')).toEqual([]);
    expect(takenVan(s.items, 'plan-zolder')).toHaveLength(10);
  });

  it('een nieuw onderdeel komt achteraan; verplaatsen wisselt alleen de volgorde; aan de rand gebeurt niets', () => {
    let s = reducer(beginStaat(V), { type: 'onderdeelToevoegen', onderdeel: { id: 'o-x', planId: 'plan-zolder', naam: 'Opleveren' } });
    expect(onderdelenVan(s.onderdelen, 'plan-zolder').map(o => o.naam).at(-1)).toBe('Opleveren');
    s = reducer(s, { type: 'onderdeelVerplaatsen', id: 'o-x', richting: -1 });
    expect(onderdelenVan(s.onderdelen, 'plan-zolder').map(o => o.naam)).toEqual(['Voorbereiding', 'Verbouwing', 'Opleveren', 'Afwerking']);
    const zelfde = reducer(s, { type: 'onderdeelVerplaatsen', id: 'ond-voorbereiding', richting: -1 });
    expect(zelfde).toBe(s);
  });

  it('onderdeel verwijderen: de taken blijven in het plan; ongedaan maken zet alles terug', () => {
    const begin = beginStaat(V);
    let s = reducer(begin, { type: 'onderdeelVerwijderen', id: 'ond-verbouwing', melding: 'weg' });
    expect(takenVan(s.items, 'plan-zolder')).toHaveLength(10);
    expect(taakIn(s, 't-zolder-dakraam').onderdeelId).toBeNull();
    const { los } = takenPerOnderdeel(takenVan(s.items, 'plan-zolder'), onderdelenVan(s.onderdelen, 'plan-zolder'));
    expect(los.map(t => t.id)).toEqual(['t-zolder-dakraam', 't-zolder-isolatie', 't-zolder-elektra']);
    s = reducer(s, { type: 'ongedaan' });
    expect(s.onderdelen).toEqual(begin.onderdelen);
    expect(taakIn(s, 't-zolder-dakraam').onderdeelId).toBe('ond-verbouwing');
  });

  it('een plan weg: onderdelen weg, de taken blijven los zonder onderdeel', () => {
    const s = reducer(beginStaat(V), { type: 'planVerwijderen', id: 'plan-zolder', metTaken: false, melding: 'weg' });
    expect(onderdelenVan(s.onderdelen, 'plan-zolder')).toEqual([]);
    expect(taakIn(s, 't-zolder-dakraam')).toMatchObject({ planId: null, onderdeelId: null });
  });

  it('een taak met een onbekend onderdeel raakt niet zoek: zij staat bij de losse taken', () => {
    const { los } = takenPerOnderdeel([taak({ onderdeelId: 'weg' })], []);
    expect(los).toHaveLength(1);
  });

  it('een formulier zonder deze velden laat onderdeel en Bezig staan (ook "Alles bewerken")', () => {
    const { planId: _p, onderdeelId: _o, bezig: _b, ...kaal } = taakIn(beginStaat(V), 't-zolder-vergunning');
    const s = reducer(beginStaat(V), { type: 'bijwerken', item: { ...kaal, titel: 'Nieuw' } });
    expect(taakIn(s, 't-zolder-vergunning')).toMatchObject({ titel: 'Nieuw', planId: 'plan-zolder', onderdeelId: 'ond-voorbereiding', bezig: true });
  });

  it('de nieuwe velden gaan niet naar de server', () => {
    expect(Object.keys(naarTaakVelden(taak({ onderdeelId: 'o', bezig: true })))).toEqual(['title', 'due_date', 'assignee_member_id']);
  });
});

describe('bijlagen: alleen de koppeling, geen kopie', () => {
  const k = (id: string, documentId: string, doel: PlanKoppeling['doel']): PlanKoppeling => ({ id, documentId, doel });

  it('meerdere per plan en per taak; hetzelfde document bij meer doelen, maar één keer per doel', () => {
    let l: PlanKoppeling[] = [];
    l = koppelBijlage(l, k('a', 'doc-offerte', { planId: 'p1' }));
    l = koppelBijlage(l, k('b', 'doc-foto', { planId: 'p1' }));
    l = koppelBijlage(l, k('c', 'doc-offerte', { taakId: 't1' }));
    l = koppelBijlage(l, k('d', 'doc-offerte', { planId: 'p1' }));
    expect(bijlagenVanPlan(l, 'p1').map(x => x.id)).toEqual(['a', 'b']);
    expect(bijlagenVanTaak(l, 't1').map(x => x.id)).toEqual(['c']);
    expect(alleBijlagenVanPlan(l, 'p1', ['t1']).map(x => x.id)).toEqual(['a', 'b', 'c']);
    expect(ontkoppelBijlage(l, 'a').map(x => x.id)).toEqual(['b', 'c']);
  });

  it('opruimen: taak weg en plan weg; alleen het plan weg laat de bijlagen van de taak staan; ongedaan zet terug', () => {
    const begin = { ...beginStaat(V), planKoppelingen: [
      k('a', 'd1', { planId: 'plan-zolder' }), k('b', 'd2', { taakId: 't-zolder-muren' }), k('c', 'd3', { taakId: 't-zolder-dakraam' }),
    ] };
    const zonderTaak = reducer(begin, { type: 'verwijder', ids: ['t-zolder-muren'] });
    expect(zonderTaak.planKoppelingen.map(x => x.id)).toEqual(['a', 'c']);
    expect(reducer(zonderTaak, { type: 'ongedaan' }).planKoppelingen).toHaveLength(3);
    const alleenPlan = reducer(begin, { type: 'planVerwijderen', id: 'plan-zolder', metTaken: false });
    expect(alleenPlan.planKoppelingen.map(x => x.id)).toEqual(['b', 'c']);
    const planEnTaken = reducer(begin, { type: 'planVerwijderen', id: 'plan-zolder', metTaken: true });
    expect(planEnTaken.planKoppelingen).toEqual([]);
  });

  it('er is nog geen upload: de demo begint zonder bijlagen, en het scherm toont er niets van', () => {
    expect(beginStaat(V).planKoppelingen).toEqual([]);
    const { container } = render(<App />);
    expect(container.querySelector('input[type="file"]')).toBeNull();
    expect(container.textContent).not.toMatch(/bijlage|foto/i);
  });
});

describe('in de app', () => {
  it('een klein plan blijft één lijst: geen onderdelen, één rustige knop om er een toe te voegen', () => {
    naar('#/plannen/plan-schuur');
    render(<App />);
    expect(screen.getAllByRole('list', { name: 'Open taken' })).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Onderdeel toevoegen' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Onderdeel aanpassen' })).not.toBeInTheDocument();
  });

  it('een groot plan: het eerste onderdeel met open taken staat open, de andere dicht, met voortgang', async () => {
    const user = userEvent.setup();
    render(<App />);
    const knop = (naam: RegExp) => screen.getByRole('button', { name: naam });
    expect(knop(/^Voorbereiding.*2 van 4/)).toHaveAttribute('aria-expanded', 'true');
    expect(knop(/^Verbouwing.*0 van 3/)).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('checkbox', { name: 'Vergunning nakijken' })).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: 'Elektra leggen' })).not.toBeInTheDocument();
    await user.click(knop(/^Verbouwing/));
    expect(screen.getByRole('checkbox', { name: 'Elektra leggen' })).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: 'Vergunning nakijken' })).not.toBeInTheDocument();   // één tegelijk
    expect(screen.getByText('2 van 10 klaar')).toBeInTheDocument();
  });

  it('een taak toevoegen in het open onderdeel; afvinken klapt niets dicht', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.type(screen.getByLabelText('Taak toevoegen'), 'Bouwtekening maken{Enter}');
    expect(screen.getByRole('button', { name: /^Voorbereiding.*2 van 5/ })).toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: 'Budget afspreken' }));
    await user.click(screen.getByRole('checkbox', { name: 'Vergunning nakijken' }));
    await user.click(screen.getByRole('checkbox', { name: 'Bouwtekening maken' }));
    expect(screen.getByRole('button', { name: /^Voorbereiding.*5 van 5/ })).toHaveAttribute('aria-expanded', 'true');
  });

  it('het eerste onderdeel maken: bestaande taken blijven los bovenaan, het nieuwe staat open', async () => {
    naar('#/plannen/plan-schuur');
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Onderdeel toevoegen' }));
    const v = screen.getByRole('dialog', { name: 'Nieuw onderdeel' });
    await user.type(within(v).getByLabelText('Naam'), 'Afvoeren');
    await user.click(within(v).getByRole('button', { name: 'Onderdeel toevoegen' }));
    expect(screen.getByRole('button', { name: /^Afvoeren/ })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('checkbox', { name: 'Vegen' })).toBeInTheDocument();
    expect(screen.getByText('Nog geen taken in dit onderdeel.')).toBeInTheDocument();
  });

  it('dezelfde naam kan niet twee keer in één plan', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Onderdeel toevoegen' }));
    const v = screen.getByRole('dialog', { name: 'Nieuw onderdeel' });
    await user.type(within(v).getByLabelText('Naam'), ' voorbereiding ');
    await user.click(within(v).getByRole('button', { name: 'Onderdeel toevoegen' }));
    expect(within(v).getByRole('alert')).toHaveTextContent('al een onderdeel');
  });

  it('aanpassen: hernoemen, verplaatsen en verwijderen, met de taken die blijven', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Onderdeel aanpassen' }));
    let v = screen.getByRole('dialog', { name: 'Onderdeel aanpassen' });
    expect(within(v).getByRole('button', { name: 'Omhoog' })).toBeDisabled();
    await user.click(within(v).getByRole('button', { name: 'Omlaag' }));
    await user.clear(within(v).getByLabelText('Naam'));
    await user.type(within(v).getByLabelText('Naam'), 'Eerst regelen');
    await user.click(within(v).getByRole('button', { name: 'Opslaan' }));
    const koppen = screen.getAllByRole('button', { name: /^(Eerst regelen|Verbouwing|Afwerking)/ }).map(b => b.textContent);
    expect(koppen[0]).toMatch(/^Verbouwing/);
    expect(koppen[1]).toMatch(/^Eerst regelen/);
    await user.click(screen.getByRole('button', { name: 'Onderdeel aanpassen' }));
    v = screen.getByRole('dialog', { name: 'Onderdeel aanpassen' });
    await user.click(within(v).getByRole('button', { name: 'Onderdeel verwijderen' }));
    expect(within(v).getByText(/De 4 taken blijven in het plan/)).toBeInTheDocument();
    await user.click(within(v).getByRole('button', { name: 'Ja, verwijderen' }));
    expect(screen.getByRole('checkbox', { name: 'Vergunning nakijken' })).toBeInTheDocument();
    expect(screen.getByText('2 van 10 klaar')).toBeInTheDocument();
  });

  it('een taak openen: status en onderdeel kiezen; de andere velden blijven; Bezig is zichtbaar op de rij', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Budget afspreken openen' }));
    const d = screen.getByRole('dialog', { name: 'Taak' });
    await user.click(within(d).getByRole('button', { name: /^Status / }));
    await user.click(within(within(d).getByRole('group', { name: 'Status van de taak' })).getByRole('button', { name: 'Bezig' }));
    await user.click(within(d).getByRole('button', { name: /^Onderdeel / }));
    await user.click(within(within(d).getByRole('group', { name: 'Hoort bij onderdeel' })).getByRole('button', { name: 'Afwerking' }));
    await user.click(within(d).getByRole('button', { name: 'Opslaan' }));
    expect(screen.getByRole('button', { name: /^Voorbereiding.*2 van 3/ })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^Afwerking/ }));
    const vink = screen.getByRole('checkbox', { name: 'Budget afspreken' });
    expect(vink).toHaveAttribute('aria-checked', 'mixed');
    expect(within(vink.closest('li')!).getByText('Bezig')).toBeInTheDocument();
  });

  it('"Alles bewerken" laat plan, onderdeel en Bezig staan', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Vergunning nakijken openen' }));
    let d = screen.getByRole('dialog', { name: 'Taak' });
    await user.click(within(d).getByRole('button', { name: 'Meer…' }));
    await user.click(within(d).getByRole('button', { name: 'Alles bewerken' }));
    d = screen.getByRole('dialog', { name: 'Taak' });
    await user.clear(within(d).getByLabelText(/^Wat/));
    await user.type(within(d).getByLabelText(/^Wat/), 'Vergunning goed nakijken');
    await user.click(within(d).getByRole('button', { name: 'Opslaan' }));
    const vink = screen.getByRole('checkbox', { name: 'Vergunning goed nakijken' });
    expect(vink).toHaveAttribute('aria-checked', 'mixed');
    expect(screen.getByRole('button', { name: /^Voorbereiding.*2 van 4/ })).toBeInTheDocument();
  });

  it('een plan-taak op Vandaag of in de Agenda is dezelfde taak: Bezig staat er ook, en afvinken kan overal', async () => {
    naar('#/agenda');
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: /^Zonder datum/ }));
    await user.click(screen.getByRole('button', { name: /Taken uit plannen/ }));
    const vink = screen.getByRole('checkbox', { name: 'Oud gereedschap uitzoeken' });
    expect(vink).toHaveAttribute('aria-checked', 'mixed');
    await user.click(vink);
    window.location.hash = '#/plannen/plan-schuur';
    expect(await screen.findByText('2 van 5 klaar')).toBeInTheDocument();
  });

  it('de Agenda: plan-taken zonder datum in een eigen groep, standaard dicht, per plan, en vindbaar met het filter', async () => {
    naar('#/agenda');
    const user = userEvent.setup();
    render(<App />);
    const kop = screen.getByRole('button', { name: /^Zonder datum/ });
    expect(kop).toHaveTextContent('Zonder datum · 2 open · 9 uit plannen');
    await user.click(kop);
    expect(screen.getByRole('list', { name: 'Taken zonder datum' })).toBeInTheDocument();
    expect(within(screen.getByRole('list', { name: 'Taken zonder datum' })).queryByText('Vegen')).not.toBeInTheDocument();
    const groep = screen.getByRole('button', { name: /Taken uit plannen/ });
    expect(groep).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('checkbox', { name: 'Vegen' })).not.toBeInTheDocument();
    await user.click(groep);
    expect(within(screen.getByRole('list', { name: 'Taken uit Zolder verbouwen' })).getAllByRole('checkbox')).toHaveLength(6);
    expect(within(screen.getByRole('list', { name: 'Taken uit Schuur opruimen' })).getAllByRole('checkbox')).toHaveLength(3);
    await user.click(screen.getByRole('button', { name: 'Naar Schuur opruimen' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Schuur opruimen' })).toBeInTheDocument();
  });
});
