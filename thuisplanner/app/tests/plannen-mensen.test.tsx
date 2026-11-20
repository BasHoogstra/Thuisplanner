// UITGESCHAKELD voor Plannen v1 (besluit Bas, 10 november 2026): één verantwoordelijke per taak, in de demo én online, zodat
// beide hetzelfde doen (KG-5E licht, geen tweede datapad). Deze tests horen bij stap C (meer verantwoordelijken) en komen
// terug als die stap na de gezinsbèta alsnog wordt gekozen; de code in lib/mensen.ts blijft daarom staan.
// Plannen, stap C (besluit 18, gate "Meerdere verantwoordelijken", docs/thuisplanner-plannen.md §5.1): geen enkele bewerkingsroute
// mag stil een verantwoordelijke of ander taakveld verliezen. Waar de server één persoon kent, kies je er ook maar één.
// Vaste demo-klok: woensdag 21 oktober 2026. "Muren schilderen" is voor Eva en Lotte.
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../src/App';
import { ItemVenster } from '../src/components/ItemVenster';
import { Ctx, type AppContext } from '../src/lib/context';
import { beginStaat, reducer } from '../src/lib/store';
import { taakPast } from '../src/lib/filter';
import { metMensen, taakMensen } from '../src/lib/mensen';
import { naarTaakVelden } from '../src/lib/lokaal/omzetten';
import type { Taak } from '../src/lib/types';

const V = '2026-10-21', EVA = 'm-eva', LOTTE = 'm-lotte', THOMAS = 'm-thomas';
const naar = (hash: string) => window.history.replaceState(null, '', `/?nu=${V}T10:00${hash}`);
beforeEach(() => { naar('#/plannen/plan-zolder'); try { localStorage.clear(); } catch { /* geen opslag */ } });
const taak = (t: Partial<Taak> = {}): Taak => ({ id: 't1', soort: 'taak', titel: 'Taak', datum: null, voor: EVA, klaar: false, klaarOp: null, ...t });

/** Vanuit het plan: Afwerking open, en dan de rij van een taak. */
async function naarAfwerking(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /^Afwerking/ }));
}
const rijVan = (naam: string | RegExp) => screen.getByRole('checkbox', { name: naam }).closest('li')!;
const venster = () => screen.getByRole('dialog', { name: 'Taak' });
async function openWie(user: ReturnType<typeof userEvent.setup>) {
  await user.click(within(venster()).getByRole('button', { name: /^Wie pakt het op / }));
  return within(within(venster()).getByRole('group', { name: 'Wie pakt het op' }));
}
async function naarFormulier(user: ReturnType<typeof userEvent.setup>) {
  await user.click(within(venster()).getByRole('button', { name: 'Meer…' }));
  await user.click(within(venster()).getByRole('button', { name: 'Alles bewerken' }));
}
async function nieuweTitel(user: ReturnType<typeof userEvent.setup>, label: RegExp, titel: string) {
  const veld = within(venster()).getByLabelText(label);
  await user.clear(veld);
  await user.type(veld, titel);
}

describe.skip('de centrale regels', () => {
  it('taakMensen: eerst voor, dan de rest', () => {
    expect(taakMensen(taak({ ookVoor: [LOTTE] }))).toEqual([EVA, LOTTE]);
    expect(taakMensen(taak({ voor: null }))).toEqual([]);
    expect(taakMensen(taak())).toEqual([EVA]);
  });

  it('metMensen: de eerste is voor; een taak zonder extra personen krijgt geen nieuw veld', () => {
    expect(metMensen(taak(), [THOMAS])).toEqual({ voor: THOMAS });
    expect(metMensen(taak(), [EVA, LOTTE])).toEqual({ voor: EVA, ookVoor: [LOTTE] });
    expect(metMensen(taak(), [])).toEqual({ voor: null });
  });

  it('metMensen: leeg en ontbrekend zijn verschillend, zodat een tweede persoon echt weg kan', () => {
    expect(metMensen(taak({ ookVoor: [LOTTE] }), [EVA])).toEqual({ voor: EVA, ookVoor: [] });
  });

  it('het vangnet: ontbreekt ookVoor, dan blijft het; is het leeg, dan is het leeg', () => {
    const begin = beginStaat(V);
    const muren = begin.items.find(i => i.id === 't-zolder-muren') as Taak;
    const { ookVoor: _weg, ...zonder } = muren;
    let s = reducer(begin, { type: 'bijwerken', item: { ...zonder, titel: 'Nieuw' } });
    expect((s.items.find(i => i.id === muren.id) as Taak).ookVoor).toEqual([LOTTE]);
    s = reducer(s, { type: 'bijwerken', item: { ...muren, ookVoor: [] } });
    expect((s.items.find(i => i.id === muren.id) as Taak).ookVoor).toEqual([]);
  });

  it('het filter vindt een taak ook bij de tweede persoon', () => {
    expect(taakPast(taak({ ookVoor: [LOTTE] }), LOTTE)).toBe(true);
    expect(taakPast(taak({ ookVoor: [LOTTE] }), THOMAS)).toBe(false);
    expect(taakPast(taak(), LOTTE)).toBe(false);
  });

  it('T11: de extra personen gaan niet naar de server', () => {
    expect(naarTaakVelden(taak({ ookVoor: [LOTTE] }))).toEqual({ title: 'Taak', due_date: null, assignee_member_id: EVA });
  });
});

describe.skip('alle routes in de app', () => {
  it('T1: alleen de titel wijzigen in het detailvenster: beide personen blijven', async () => {
    const user = userEvent.setup();
    render(<App />);
    await naarAfwerking(user);
    await user.click(screen.getByRole('button', { name: 'Muren schilderen openen' }));
    await nieuweTitel(user, /^Wat/, 'Muren verven');
    await user.click(within(venster()).getByRole('button', { name: 'Opslaan' }));
    expect(within(rijVan('Muren verven')).getByText('Eva')).toBeInTheDocument();
    expect(within(rijVan('Muren verven')).getByText('Lotte')).toBeInTheDocument();
  });

  it('T2: "Alles bewerken" laat personen, plan, onderdeel, Bezig en afgerond staan', async () => {
    const user = userEvent.setup();
    render(<App />);
    await naarAfwerking(user);
    await user.click(screen.getByRole('button', { name: 'Muren schilderen openen' }));
    await user.click(within(venster()).getByRole('button', { name: /^Status / }));
    await user.click(within(within(venster()).getByRole('group', { name: 'Status van de taak' })).getByRole('button', { name: 'Bezig' }));
    await user.click(within(venster()).getByRole('button', { name: 'Opslaan' }));
    await user.click(screen.getByRole('button', { name: 'Muren schilderen openen' }));
    await naarFormulier(user);
    await nieuweTitel(user, /^Wat/, 'Muren verven');
    await user.click(within(venster()).getByRole('button', { name: 'Opslaan' }));
    const vink = screen.getByRole('checkbox', { name: 'Muren verven' });
    expect(vink).toHaveAttribute('aria-checked', 'mixed');
    expect(within(rijVan('Muren verven')).getByText('Lotte')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Afwerking.*0 van 3/ })).toBeInTheDocument();
  });

  it('T2b: een afgeronde taak bewerken via "Alles bewerken" blijft afgerond, met dezelfde personen', async () => {
    const user = userEvent.setup();
    render(<App />);
    await naarAfwerking(user);
    await user.click(screen.getByRole('checkbox', { name: 'Muren schilderen' }));
    await user.click(screen.getByRole('button', { name: /afgerond · tonen/ }));
    await user.click(screen.getByRole('button', { name: 'Muren schilderen openen' }));
    await naarFormulier(user);
    await nieuweTitel(user, /^Wat/, 'Muren verven');
    await user.click(within(venster()).getByRole('button', { name: 'Opslaan' }));
    expect(screen.getByRole('checkbox', { name: 'Muren verven' })).toBeChecked();
    expect(within(rijVan('Muren verven')).getByText('Lotte')).toBeInTheDocument();
  });

  it('T3: alleen de datum wijzigen, in beide vensters: de personen blijven', async () => {
    const user = userEvent.setup();
    render(<App />);
    await naarAfwerking(user);
    await user.click(screen.getByRole('button', { name: 'Muren schilderen openen' }));
    await user.click(within(venster()).getByRole('button', { name: /^Dag / }));
    await user.click(within(within(venster()).getByRole('group', { name: 'Wanneer' })).getByRole('button', { name: 'Morgen' }));
    await user.click(within(venster()).getByRole('button', { name: 'Opslaan' }));
    expect(within(rijVan('Muren schilderen')).getByText('Lotte')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Muren schilderen openen' }));
    await naarFormulier(user);
    await user.click(within(venster()).getByRole('button', { name: /Vandaag/ }));
    await user.click(within(venster()).getByRole('button', { name: 'Opslaan' }));
    expect(within(rijVan('Muren schilderen')).getByText('Lotte')).toBeInTheDocument();
  });

  it('T4 en T6: de eerste uitzetten maakt de tweede de eerste; allebei uit is "Nog niemand"', async () => {
    const user = userEvent.setup();
    render(<App />);
    await naarAfwerking(user);
    await user.click(screen.getByRole('button', { name: 'Muren schilderen openen' }));
    let keuze = await openWie(user);
    expect(keuze.getByRole('button', { name: 'Eva' })).toHaveAttribute('aria-pressed', 'true');
    expect(keuze.getByRole('button', { name: 'Lotte' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(keuze.getByRole('button', { name: 'Eva' }));
    await user.click(within(venster()).getByRole('button', { name: 'Opslaan' }));
    expect(within(rijVan('Muren schilderen')).queryByText('Eva')).not.toBeInTheDocument();
    expect(within(rijVan('Muren schilderen')).getByText('Lotte')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Muren schilderen openen' }));
    keuze = await openWie(user);
    await user.click(keuze.getByRole('button', { name: 'Lotte' }));
    await user.click(within(venster()).getByRole('button', { name: 'Opslaan' }));
    expect(within(rijVan('Muren schilderen')).queryByText('Lotte')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Muren schilderen openen' }));
    expect(within(venster()).getByRole('button', { name: /^Wie pakt het op / })).toHaveTextContent('Nog niemand');
  });

  it('T5: de tweede uitzetten blijft uit, ook na nog een bewerking via het formulier', async () => {
    const user = userEvent.setup();
    render(<App />);
    await naarAfwerking(user);
    await user.click(screen.getByRole('button', { name: 'Muren schilderen openen' }));
    const keuze = await openWie(user);
    await user.click(keuze.getByRole('button', { name: 'Lotte' }));
    await user.click(within(venster()).getByRole('button', { name: 'Opslaan' }));
    await user.click(screen.getByRole('button', { name: 'Muren schilderen openen' }));
    await naarFormulier(user);
    await nieuweTitel(user, /^Wat/, 'Muren verven');
    await user.click(within(venster()).getByRole('button', { name: 'Opslaan' }));
    expect(within(rijVan('Muren verven')).queryByText('Lotte')).not.toBeInTheDocument();
    expect(within(rijVan('Muren verven')).getByText('Eva')).toBeInTheDocument();
  });

  it('T5b: personen toevoegen via het formulier blijft staan', async () => {
    const user = userEvent.setup();
    render(<App />);
    await naarAfwerking(user);
    await user.click(screen.getByRole('button', { name: 'Vloer leggen openen' }));
    await naarFormulier(user);
    const groep = within(within(venster()).getByRole('group', { name: 'Wie pakt het op' }));
    await user.click(groep.getByRole('button', { name: 'Eva' }));
    await user.click(groep.getByRole('button', { name: 'Thomas' }));
    await user.click(within(venster()).getByRole('button', { name: 'Opslaan' }));
    expect(within(rijVan('Vloer leggen')).getByText('Eva')).toBeInTheDocument();
    expect(within(rijVan('Vloer leggen')).getByText('Thomas')).toBeInTheDocument();
  });

  it('T7: een nieuwe taak via de + met twee personen, direct en via "Alles invullen"', async () => {
    naar('#/vandaag');
    const user = userEvent.setup();
    render(<App />);
    const plus = () => screen.getAllByRole('button', { name: 'Toevoegen' })[0];
    for (const [titel, viaFormulier] of [['Fiets maken', false], ['Band plakken', true]] as const) {
      await user.click(plus());
      const d = screen.getByRole('dialog');
      await user.type(within(d).getByRole('textbox'), `taak ${titel}`);
      await user.click(within(d).getByRole('button', { name: /Aanpassen/ }));
      await user.click(within(d).getByRole('button', { name: /^Wie/ }));
      const groep = within(within(d).getByRole('group', { name: 'Wie pakt het op' }));
      await user.click(groep.getByRole('button', { name: 'Eva' }));
      await user.click(groep.getByRole('button', { name: 'Lotte' }));
      if (viaFormulier) {
        await user.click(within(d).getByRole('button', { name: 'Formulier' }));
        await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Toevoegen' }));
      } else {
        await user.click(within(d).getByRole('button', { name: /^(Toevoegen|Verstuur|Bewaar|Opslaan)/ }));
      }
    }
    window.location.hash = '#/agenda';
    await user.click(await screen.findByRole('button', { name: /^Zonder datum/ }));
    for (const titel of ['Fiets maken', 'Band plakken']) {
      const rij = rijVan(new RegExp(titel, 'i'));
      expect(within(rij).getByText('Eva')).toBeInTheDocument();
      expect(within(rij).getByText('Lotte')).toBeInTheDocument();
    }
  });

  it('T8: afvinken, weer openzetten en ongedaan maken: de personen blijven', async () => {
    const user = userEvent.setup();
    render(<App />);
    await naarAfwerking(user);
    await user.click(screen.getByRole('checkbox', { name: 'Muren schilderen' }));
    await user.click(screen.getByRole('button', { name: 'Ongedaan maken' }));
    expect(within(rijVan('Muren schilderen')).getByText('Lotte')).toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: 'Muren schilderen' }));
    await user.click(screen.getByRole('button', { name: /afgerond · tonen/ }));
    await user.click(screen.getByRole('checkbox', { name: 'Muren schilderen' }));
    expect(within(rijVan('Muren schilderen')).getByText('Lotte')).toBeInTheDocument();
  });

  it('T9: het filter in de Agenda vindt de taak bij de tweede persoon; de rij toont beide', async () => {
    naar('#/agenda');
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: /^Zonder datum/ }));
    await user.click(screen.getByRole('button', { name: /Taken uit plannen/ }));
    const rij = rijVan('Muren schilderen');
    expect(within(rij).getByText('Eva')).toBeInTheDocument();
    expect(within(rij).getByText('Lotte')).toBeInTheDocument();
  });

  it('T10: om en om in beide vensters: steeds dezelfde personen en velden', async () => {
    const user = userEvent.setup();
    render(<App />);
    await naarAfwerking(user);
    for (const [i, titel] of ['Muren een', 'Muren twee', 'Muren drie'].entries()) {
      await user.click(screen.getByRole('button', { name: new RegExp('^Muren .* openen$') }));
      if (i === 1) await naarFormulier(user);
      await nieuweTitel(user, /^Wat/, titel);
      await user.click(within(venster()).getByRole('button', { name: 'Opslaan' }));
      expect(within(rijVan(titel)).getByText('Eva')).toBeInTheDocument();
      expect(within(rijVan(titel)).getByText('Lotte')).toBeInTheDocument();
    }
    expect(screen.getByRole('button', { name: /^Afwerking.*0 van 3/ })).toBeInTheDocument();
  });

  it('de planpagina telt "voor jou" ook als je de tweede persoon bent', () => {
    const s = beginStaat(V);
    expect(taakMensen(s.items.find(i => i.id === 't-zolder-muren') as Taak)).toEqual([EVA, LOTTE]);
  });
});

describe.skip('T11 en T12: waar de server één persoon kent, kies je er één', () => {
  const leden = [
    { id: EVA, naam: 'Eva', soort: 'volwassene', kleur: 'red', heeftAccount: true },
    { id: LOTTE, naam: 'Lotte', soort: 'kind', kleur: 'green', heeftAccount: false }];
  function opzet(lokaal: boolean) {
    const bijwerken = vi.fn();
    const ctx = {
      staat: { scenario: 'gewoon', items: [taak({ versie: 1 })], vakanties: [], pakitems: [], koppelingen: [], plannen: [], onderdelen: [], planKoppelingen: [], weggeklikt: new Set(), vorige: null, melding: null },
      huishouden: { naam: 'Familie De Boer', ik: EVA, leden }, vandaag: V, nu: '09:00', uur: 9,
      lid: (id: string) => leden.find(l => l.id === id), meld: vi.fn(), bijwerken, toevoegen: vi.fn(), wissel: vi.fn(),
      ...(lokaal ? { lokaal: { omgeving: 'staging' } } : {}),
    } as unknown as AppContext;
    render(<Ctx.Provider value={ctx}><ItemVenster opdracht={{ type: 'bewerk', id: 't1' }} sluit={vi.fn()} /></Ctx.Provider>);
    return { bijwerken, user: userEvent.setup() };
  }

  it('lokaal en staging: een tik vervangt, dus er blijft één persoon, zonder extra veld', async () => {
    const o = opzet(true);
    await o.user.click(screen.getByRole('button', { name: /^Wie pakt het op / }));
    await o.user.click(within(screen.getByRole('group', { name: 'Wie pakt het op' })).getByRole('button', { name: 'Lotte' }));
    expect(screen.getByRole('button', { name: /^Wie pakt het op / })).toHaveTextContent('Lotte');
    await o.user.click(screen.getByRole('button', { name: 'Opslaan' }));
    const opgeslagen = o.bijwerken.mock.calls[0][0] as Taak;
    expect(opgeslagen.voor).toBe(LOTTE);
    expect(opgeslagen.ookVoor).toBeUndefined();
  });

  it('demo: een tik voegt toe', async () => {
    const o = opzet(false);
    await o.user.click(screen.getByRole('button', { name: /^Wie pakt het op / }));
    await o.user.click(within(screen.getByRole('group', { name: 'Wie pakt het op' })).getByRole('button', { name: 'Lotte' }));
    await o.user.click(screen.getByRole('button', { name: 'Opslaan' }));
    const opgeslagen = o.bijwerken.mock.calls[0][0] as Taak;
    expect([opgeslagen.voor, ...(opgeslagen.ookVoor ?? [])]).toEqual([EVA, LOTTE]);
  });
});

describe.skip('wie doet wat op de planpagina', () => {
  it('een klein plan toont geen filter; een groot plan wel', () => {
    naar('#/plannen/plan-schuur');
    const { unmount } = render(<App />);
    expect(screen.queryByRole('group', { name: 'Wie doet wat' })).not.toBeInTheDocument();
    unmount();
    naar('#/plannen/plan-zolder');
    render(<App />);
    expect(screen.getByRole('group', { name: 'Wie doet wat' })).toBeInTheDocument();
  });

  it('per persoon: taken uit alle onderdelen onder elkaar; ook de tweede persoon; geen invoer', async () => {
    const user = userEvent.setup();
    render(<App />);
    const filter = within(screen.getByRole('group', { name: 'Wie doet wat' }));
    await user.click(filter.getByRole('button', { name: 'Lotte' }));
    expect(screen.getByRole('checkbox', { name: 'Muren schilderen' })).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: 'Vergunning nakijken' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Afwerking' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Verbouwing' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Taak toevoegen')).not.toBeInTheDocument();
    await user.click(filter.getByRole('button', { name: 'Eva' }));
    expect(screen.getByRole('checkbox', { name: 'Vergunning nakijken' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Muren schilderen' })).toBeInTheDocument();
  });

  it('"Nog niemand": wat kan ik oppakken? En een lege uitkomst is een rustige zin', async () => {
    const user = userEvent.setup();
    render(<App />);
    const filter = within(screen.getByRole('group', { name: 'Wie doet wat' }));
    await user.click(filter.getByRole('button', { name: 'Nog niemand' }));
    for (const naam of ['Budget afspreken', 'Elektra leggen', 'Vloer leggen']) expect(screen.getByRole('checkbox', { name: naam })).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: 'Muren schilderen' })).not.toBeInTheDocument();
    await user.click(filter.getByRole('button', { name: 'Daan' }));
    expect(screen.getByText('Daan heeft nog niets in dit plan.')).toBeInTheDocument();
    await user.click(filter.getByRole('button', { name: 'Iedereen' }));
    expect(screen.getByLabelText('Taak toevoegen')).toBeInTheDocument();
  });

  it('afvinken vanuit het filter werkt door, en er staan nergens scores of vergelijkingen', async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);
    await user.click(within(screen.getByRole('group', { name: 'Wie doet wat' })).getByRole('button', { name: 'Lotte' }));
    await user.click(screen.getByRole('checkbox', { name: 'Muren schilderen' }));
    expect(screen.getByText('3 van 10 klaar')).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/%|score|meer gedaan/i);
  });
});
