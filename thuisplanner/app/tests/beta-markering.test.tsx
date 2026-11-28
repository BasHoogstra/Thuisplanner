// De bètamarkering (besluit O7, docs/thuisplanner-beta-voorbereiding.md §2.2 en §10): een rustige "Bèta" op het
// inlogscherm en in Meer, niet bovenaan elk scherm, en nooit "Testomgeving · verzonnen gegevens". Productie: geen
// markering. Staging en lokaal: precies zoals voorheen (tegenproef).
import { render, screen } from '@testing-library/react';
import { Inloggen, LokaleBalk } from '../src/components/Lokaal';
import { Ctx, type AppContext } from '../src/lib/context';
import type { LokaleConfig, Momentopname, Sessie } from '../src/lib/lokaal/sessie';
import { Meer } from '../src/screens/Meer';

// Meer bevat ook huishoudbeheer, account en de ingangen naar Vakanties, Spullen en Plannen; die hebben hun eigen tests.
vi.mock('../src/components/HuishoudenBeheer', () => ({ HuishoudenBeheer: () => null }));
vi.mock('../src/components/Account', () => ({ Account: () => null }));
vi.mock('../src/screens/Vakanties', () => ({ VakantiesRij: () => null }));
vi.mock('../src/screens/Spullen', () => ({ SpullenRij: () => null }));
vi.mock('../src/screens/Plannen', () => ({ PlannenRij: () => null }));

type Soort = LokaleConfig['omgeving'];

function inloggen(omgeving: Soort) {
  const sessie = { config: { omgeving, url: 'https://abcdefghijklmnopqrst.supabase.co', anonKey: 'anon', accounts: [] },
    vraagCode: vi.fn(), controleerCode: vi.fn(), uitloggen: vi.fn(), leesNaam: async () => null, bewaarNaam: async () => {} } as unknown as Sessie;
  return render(<Inloggen sessie={sessie} snap={{ fase: 'uitgelogd', fout: null } as Momentopname} />);
}

function ctx(omgeving: Soort): AppContext {
  return {
    huishouden: { naam: 'Ons huis', ik: 'l1', leden: [] },
    staat: { items: [], vakanties: [], pakitems: [] },
    gaNaar: () => {},
    lokaal: { omgeving, account: 'tester1@example.com', status: 'verbonden', opslagDuurzaam: true, syncMelding: null,
      syncMeldingWeg: () => {}, openstaand: [], plannen: false },
  } as unknown as AppContext;
}

describe('inlogscherm', () => {
  it('bèta: een rustige "Bèta", geen balk bovenaan en geen "Testomgeving" of "verzonnen gegevens"', () => {
    inloggen('beta');
    expect(screen.getByRole('note')).toHaveTextContent('Bèta Thuisplanner is nog in ontwikkeling.');
    expect(screen.queryByText(/Testomgeving|verzonnen|Fictief|Lokaal/)).toBeNull();
  });

  it('productie: geen enkele markering', () => {
    inloggen('productie');
    expect(screen.queryByRole('note')).toBeNull();
    expect(screen.queryByText(/Bèta|Testomgeving|verzonnen|Fictief/)).toBeNull();
  });

  it('tegenproef: staging en lokaal houden hun markering', () => {
    const { unmount } = inloggen('staging');
    expect(screen.getByRole('note')).toHaveTextContent('Testomgeving');
    expect(screen.getByText(/verzonnen gegevens/)).toBeInTheDocument();
    expect(screen.queryByText('Bèta')).toBeNull();
    unmount();
    inloggen('lokaal');
    expect(screen.getAllByRole('note')[0]).toHaveTextContent('Lokaal');
  });
});

describe('de balk bovenaan elk scherm', () => {
  it('bèta en productie: geen omgevingslabel, wel wie je bent en de verbinding', () => {
    for (const o of ['beta', 'productie'] as const) {
      const { unmount } = render(<Ctx.Provider value={ctx(o)}><LokaleBalk /></Ctx.Provider>);
      expect(screen.getByRole('note')).toHaveTextContent('tester1@example.com · Verbonden');
      expect(screen.queryByText(/Bèta|Testomgeving|Lokaal/)).toBeNull();
      unmount();
    }
  });

  it('tegenproef: staging en lokaal tonen hun label', () => {
    for (const [o, label] of [['staging', 'Testomgeving'], ['lokaal', 'Lokaal']] as const) {
      const { unmount } = render(<Ctx.Provider value={ctx(o)}><LokaleBalk /></Ctx.Provider>);
      expect(screen.getByText(label)).toBeInTheDocument();
      unmount();
    }
  });
});

describe('Meer', () => {
  const uitleg = () => screen.queryByRole('heading', { name: 'Wat werkt er in deze lokale versie?' });

  it('bèta: de rustige "Bèta", zonder de uitleg over een verzonnen gezin', () => {
    render(<Ctx.Provider value={ctx('beta')}><Meer /></Ctx.Provider>);
    expect(screen.getByRole('note')).toHaveTextContent('Bèta Thuisplanner is nog in ontwikkeling.');
    expect(uitleg()).toBeNull();
    expect(screen.queryByText(/verzonnen/)).toBeNull();
  });

  it('productie: geen markering en geen uitleg', () => {
    render(<Ctx.Provider value={ctx('productie')}><Meer /></Ctx.Provider>);
    expect(screen.queryByText(/Bèta/)).toBeNull();
    expect(uitleg()).toBeNull();
  });

  it('tegenproef: lokaal en staging houden de uitleg, zonder "Bèta"', () => {
    for (const o of ['lokaal', 'staging'] as const) {
      const { unmount } = render(<Ctx.Provider value={ctx(o)}><Meer /></Ctx.Provider>);
      expect(uitleg()).toBeInTheDocument();
      expect(screen.queryByText('Bèta')).toBeNull();
      unmount();
    }
  });
});
