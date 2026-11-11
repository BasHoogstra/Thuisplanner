// W1: het rustige detailvenster voor een bestaande afspraak of taak (src/components/DetailVenster.tsx). Eerst overzicht;
// een tik op één onderdeel opent alleen dat onderdeel; "Opslaan" pas na een wijziging; bestaande gegevens blijven behouden;
// verwijderen onder "Meer…" met bevestiging; privé alleen voor de eigenaar; "Alles bewerken" opent het volledige formulier.
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ItemVenster } from '../src/components/ItemVenster';
import { Ctx, type AppContext } from '../src/lib/context';
import { voorkomenId } from '../src/lib/herhaling';
import type { Afspraak, Item, Taak } from '../src/lib/types';

const EVA = 'm-eva', THOMAS = 'm-thomas', LOTTE = 'm-lotte', V = '2026-10-20';   // dinsdag
const afspraak = (a: Partial<Afspraak> = {}): Afspraak => ({
  id: 'a1', soort: 'afspraak', titel: 'Tandarts', datum: '2026-10-22', start: '15:00', eind: '16:00', wie: [LOTTE],
  eigenaar: EVA, zichtbaarheid: 'huishouden', plek: 'Praktijk Oost', notities: 'Pasje mee', voorbereiding: 'Tanden poetsen',
  versie: 7, ...a,
});
const taak = (t: Partial<Taak> = {}): Taak => ({ id: 't1', soort: 'taak', titel: 'Band plakken', datum: '2026-10-21', voor: THOMAS, klaar: false, klaarOp: null, versie: 3, ...t });

function opzet(items: Item[], id: string) {
  const f = { bijwerken: vi.fn(), wijzigVoorkomen: vi.fn(), verwijder: vi.fn(), verwijderVoorkomen: vi.fn(), verwijderReeks: vi.fn(), wissel: vi.fn() };
  const leden = [
    { id: EVA, naam: 'Eva', soort: 'volwassene', kleur: 'red', heeftAccount: true },
    { id: THOMAS, naam: 'Thomas', soort: 'volwassene', kleur: 'blue', heeftAccount: true },
    { id: LOTTE, naam: 'Lotte', soort: 'kind', kleur: 'green', heeftAccount: false }];
  const ctx = {
    staat: { scenario: 'gewoon', items, vakanties: [], pakitems: [], koppelingen: [], weggeklikt: new Set(), vorige: null, melding: null },
    huishouden: { naam: 'Familie De Boer', ik: EVA, leden }, vandaag: V, nu: '09:00', uur: 9,
    lid: (lid: string) => leden.find(l => l.id === lid), meld: vi.fn(), toevoegen: vi.fn(), ...f,
  } as unknown as AppContext;
  const sluit = vi.fn();
  render(<Ctx.Provider value={ctx}><ItemVenster opdracht={{ type: 'bewerk', id }} sluit={sluit} /></Ctx.Provider>);
  return { ...f, sluit, d: () => within(screen.getByRole('dialog')), user: userEvent.setup() };
}

it('eerst overzicht: titel, dag, tijd en wie; geen dag- of persoonsknoppen, geen Opslaan of Verwijderen in beeld', () => {
  const o = opzet([afspraak()], 'a1');
  expect(o.d().getByLabelText('Wat?')).toHaveValue('Tandarts');
  for (const [label, waarde] of [['Dag', 'Donderdag 22 oktober'], ['Tijd', '15:00 – 16:00'], ['Voor wie', 'Lotte'], ['Waar', 'Praktijk Oost']]) {
    expect(o.d().getByRole('button', { name: `${label} ${waarde}` })).toBeInTheDocument();
  }
  expect(o.d().queryByRole('group', { name: 'Wanneer' })).not.toBeInTheDocument();
  expect(o.d().queryByRole('group', { name: 'Voor wie' })).not.toBeInTheDocument();
  expect(o.d().queryByRole('button', { name: 'Opslaan' })).not.toBeInTheDocument();
  expect(o.d().queryByRole('button', { name: /Verwijderen/ })).not.toBeInTheDocument();
  expect(o.d().getByRole('button', { name: 'Meer…' })).toBeInTheDocument();
  expect(o.d().getByText('Pasje mee')).toBeInTheDocument();   // notities: zichtbaar, niet weg
});

it('één onderdeel wijzigen: de dag; al het andere blijft precies behouden, met de versie van het openen', async () => {
  const o = opzet([afspraak({ eindDatum: '2026-10-23' })], 'a1');
  await o.user.click(o.d().getByRole('button', { name: /^Dag / }));
  await o.user.click(within(o.d().getByRole('group', { name: 'Wanneer' })).getByRole('button', { name: 'Morgen' }));
  expect(o.d().queryByRole('group', { name: 'Wanneer' })).not.toBeInTheDocument();   // het paneel sluit vanzelf
  await o.user.click(o.d().getByRole('button', { name: 'Opslaan' }));
  expect(o.bijwerken.mock.calls[0][0]).toEqual({
    id: 'a1', soort: 'afspraak', titel: 'Tandarts', datum: '2026-10-21', start: '15:00', eind: '16:00', plek: 'Praktijk Oost',
    wie: [LOTTE], eigenaar: EVA, zichtbaarheid: 'huishouden', voorbereiding: 'Tanden poetsen', notities: 'Pasje mee',
    eindDatum: '2026-10-22', herhaling: undefined, reeksId: undefined, origineleDatum: undefined, versie: 7,
  });
  expect(o.sluit).toHaveBeenCalled();
});

it('de tijd: een andere begintijd neemt de duur mee; laat in de avond vervalt het eind', async () => {
  const o = opzet([afspraak()], 'a1');
  await o.user.click(o.d().getByRole('button', { name: /^Tijd / }));
  await o.user.click(within(o.d().getByRole('group', { name: 'Hoe laat' })).getByRole('button', { name: '09:00' }));
  expect(o.d().getByRole('button', { name: 'Tijd 09:00 – 10:00' })).toBeInTheDocument();
});

it('de tijd: "Hele dag" haalt begin en eind weg', async () => {
  const o = opzet([afspraak()], 'a1');
  await o.user.click(o.d().getByRole('button', { name: /^Tijd / }));
  await o.user.click(within(o.d().getByRole('group', { name: 'Hoe laat' })).getByRole('button', { name: 'Hele dag' }));
  await o.user.click(o.d().getByRole('button', { name: 'Opslaan' }));
  expect(o.bijwerken.mock.calls[0][0]).toMatchObject({ start: undefined, eind: undefined });
});

it('een taak: één persoon, "Geen datum" kan, en de rest blijft behouden', async () => {
  const o = opzet([taak()], 't1');
  await o.user.click(o.d().getByRole('button', { name: /^Wie pakt het op / }));
  await o.user.click(within(o.d().getByRole('group', { name: 'Wie pakt het op' })).getByRole('button', { name: 'Lotte' }));
  await o.user.click(o.d().getByRole('button', { name: /^Dag / }));
  await o.user.click(within(o.d().getByRole('group', { name: 'Wanneer' })).getByRole('button', { name: 'Geen datum' }));
  await o.user.click(o.d().getByRole('button', { name: 'Opslaan' }));
  expect(o.bijwerken.mock.calls[0][0]).toEqual({ ...taak(), voor: LOTTE, datum: null });
});

it('een taak afronden kan direct vanuit het overzicht', async () => {
  const o = opzet([taak()], 't1');
  expect(o.d().getByText('Nog te doen')).toBeInTheDocument();
  await o.user.click(o.d().getByRole('button', { name: 'Afgerond' }));
  expect(o.wissel).toHaveBeenCalledWith('t1', 'Band plakken afgerond');
});

it('wijzigingen weggooien: alles terug, en Opslaan verdwijnt weer', async () => {
  const o = opzet([afspraak()], 'a1');
  await o.user.clear(o.d().getByLabelText('Wat?'));
  await o.user.type(o.d().getByLabelText('Wat?'), 'Orthodontist');
  expect(o.d().getByRole('button', { name: 'Opslaan' })).toBeInTheDocument();
  expect(o.d().queryByRole('button', { name: 'Meer…' })).not.toBeInTheDocument();   // eerst opslaan of weggooien
  await o.user.click(o.d().getByRole('button', { name: 'Wijzigingen weggooien' }));
  expect(o.d().getByLabelText('Wat?')).toHaveValue('Tandarts');
  expect(o.d().queryByRole('button', { name: 'Opslaan' })).not.toBeInTheDocument();
});

it('een lege titel wordt niet opgeslagen', async () => {
  const o = opzet([afspraak()], 'a1');
  await o.user.clear(o.d().getByLabelText('Wat?'));
  await o.user.click(o.d().getByRole('button', { name: 'Opslaan' }));
  expect(o.d().getByRole('alert')).toHaveTextContent('Geef het even een naam.');
  expect(o.bijwerken).not.toHaveBeenCalled();
});

it('verwijderen staat onder Meer…, met bevestiging; "Nee, terug" verwijdert niets', async () => {
  const o = opzet([afspraak()], 'a1');
  await o.user.click(o.d().getByRole('button', { name: 'Meer…' }));
  await o.user.click(o.d().getByRole('button', { name: 'Verwijderen' }));
  await o.user.click(o.d().getByRole('button', { name: 'Nee, terug' }));
  expect(o.verwijder).not.toHaveBeenCalled();
  await o.user.click(o.d().getByRole('button', { name: 'Meer…' }));
  await o.user.click(o.d().getByRole('button', { name: 'Verwijderen' }));
  await o.user.click(o.d().getByRole('button', { name: 'Ja, verwijderen' }));
  expect(o.verwijder).toHaveBeenCalledWith(['a1'], 'Tandarts verwijderd');
});

it('een voorkomen van een reeks: pas bij opslaan "alleen deze of de hele reeks"; alleen deze maakt een los voorkomen met alle gegevens', async () => {
  const reeks = afspraak({ id: 'r1', titel: 'Zwemles', datum: '2026-10-01', herhaling: { freq: 'wekelijks', tot: null, uitzonderingen: [] } });
  const o = opzet([reeks], voorkomenId('r1', '2026-10-22'));
  expect(o.d().getByRole('button', { name: /^Herhaalt / })).toBeInTheDocument();
  await o.user.click(o.d().getByRole('button', { name: /^Tijd / }));
  await o.user.click(within(o.d().getByRole('group', { name: 'Hoe laat' })).getByRole('button', { name: '18:00' }));
  await o.user.click(o.d().getByRole('button', { name: 'Alleen deze opslaan' }));
  expect(o.d().queryByRole('alert')).toBeNull();
  const [reeksId, datum, los] = o.wijzigVoorkomen.mock.calls[0];
  expect([reeksId, datum]).toEqual(['r1', '2026-10-22']);
  expect(los).toMatchObject({ datum: '2026-10-22', start: '18:00', eind: '19:00', herhaling: undefined, notities: 'Pasje mee', plek: 'Praktijk Oost' });
  expect(los.id).not.toBe('r1');
});

it('een reeks verwijderen: kiezen tussen alleen deze en de hele reeks', async () => {
  const reeks = afspraak({ id: 'r1', titel: 'Zwemles', datum: '2026-10-01', herhaling: { freq: 'wekelijks', tot: null, uitzonderingen: [] } });
  const o = opzet([reeks], voorkomenId('r1', '2026-10-22'));
  await o.user.click(o.d().getByRole('button', { name: 'Meer…' }));
  await o.user.click(o.d().getByRole('button', { name: 'Verwijderen' }));
  await o.user.click(o.d().getByRole('button', { name: 'Alleen deze verwijderen' }));
  expect(o.verwijderVoorkomen).toHaveBeenCalledWith('r1', '2026-10-22', 'Zwemles op donderdag 22 oktober verwijderd');
});

it('privé kiest alleen de eigenaar; bij een gedeelde afspraak van een ander staat die regel er niet', async () => {
  const eigen = opzet([afspraak()], 'a1');
  await eigen.user.click(eigen.d().getByRole('button', { name: /^Zichtbaar / }));
  await eigen.user.click(eigen.d().getByRole('button', { name: 'Opslaan' }));
  expect(eigen.bijwerken.mock.calls[0][0].zichtbaarheid).toBe('prive');
  document.body.innerHTML = '';
  const ander = opzet([afspraak({ eigenaar: THOMAS })], 'a1');
  expect(ander.d().queryByRole('button', { name: /^Zichtbaar / })).not.toBeInTheDocument();
});

it('Alles bewerken opent het volledige formulier voor hetzelfde item', async () => {
  const o = opzet([afspraak()], 'a1');
  await o.user.click(o.d().getByRole('button', { name: 'Meer…' }));
  await o.user.click(o.d().getByRole('button', { name: 'Alles bewerken' }));
  const d = within(screen.getByRole('dialog'));
  expect(d.getByLabelText('Wat?')).toHaveValue('Tandarts');
  expect(d.getByLabelText(/Waar/)).toHaveValue('Praktijk Oost');
  expect(d.getByRole('button', { name: 'Verwijderen' })).toBeInTheDocument();
});
