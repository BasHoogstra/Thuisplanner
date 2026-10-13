// Lokale Supabase-modus: omzetten van serverrijen, de lokale-adrescontrole en de levenscyclus van de sessie
// (unmount en StrictMode stoppen de synchronisatie niet; alleen uitloggen doet dat, zonder iets te wissen).
import { StrictMode } from 'react';
import { act, render } from '@testing-library/react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AfspraakRij, LidRij, Sync, Toestand } from '../../sync/thuisplanner-sync.js';
import { naarAfspraak, naarItems, naarLeden, naarNieuweAfspraak, naarTaak, uitzonderingenPerReeks } from '../src/lib/lokaal/omzetten';
import { isLokaalAdres, lokaleConfig, Sessie, useSessie, type LokaleConfig } from '../src/lib/lokaal/sessie';
import { isBezetVanAnder } from '../src/lib/rechten';

const rij = (r: Partial<AfspraakRij>): AfspraakRij => ({
  id: 'e1', visibility: 'household', start_date: '2026-10-12', start_time: '09:15:00', end_date: null, end_time: '10:00:00',
  version: 3, is_busy: false, title: 'Zwemles', location: 'Bad', participant_ids: ['m1'], owner_member_id: 'm1', ...r,
});

describe('omzetten', () => {
  it('een "bezet"-rij van de server wordt een afspraak zonder titel, plek en voorbereiding', () => {
    const a = naarAfspraak(rij({ is_busy: true, visibility: 'private', title: null, location: null, owner_member_id: 'm2' }), new Map());
    expect(a.titel).toBeUndefined();
    expect(a.plek).toBeUndefined();
    expect(a.zichtbaarheid).toBe('prive');
    expect(isBezetVanAnder(a, 'm1')).toBe(true);
  });

  it('tijden, versie, herhaling en uitzonderingen', () => {
    const u = uitzonderingenPerReeks([{ series_id: 'e1', occurrence_date: '2026-10-19' }, { series_id: 'e1', occurrence_date: '2026-10-26' }]);
    const a = naarAfspraak(rij({ recurrence_freq: 'weekly', recurrence_until: null }), u);
    expect(a).toMatchObject({ start: '09:15', eind: '10:00', versie: 3, titel: 'Zwemles', plek: 'Bad' });
    expect(a.herhaling).toEqual({ freq: 'wekelijks', tot: null, uitzonderingen: ['2026-10-19', '2026-10-26'] });
  });

  it('een losgemaakt voorkomen houdt zijn reeks en oorspronkelijke datum', () => {
    const a = naarAfspraak(rij({ series_id: 's1', original_date: '2026-10-05' }), new Map());
    expect(a).toMatchObject({ reeksId: 's1', origineleDatum: '2026-10-05' });
  });

  it('onbevestigde rijen krijgen een syncstaat; een privé-toevoeging zonder inhoud blijft zichtbaar', () => {
    expect(naarTaak({ id: 't', title: 'x', due_date: null, assignee_member_id: null, done_on: null, version: 0, onzeker: true }).sync).toBe('onzeker');
    const items = naarItems({
      afspraken: [rij({ id: 'p', start_date: null, inhoudNietBewaard: true }), rij({ id: 'leeg', start_date: null })],
      taken: [], boodschappen: [], uitzonderingen: [],
    });
    expect(items.map(i => [i.id, i.sync])).toEqual([['p', 'zonder-inhoud']]);
  });

  it('alleen actieve leden; een eigen kleur gaat voor', () => {
    const l = (x: Partial<LidRij>): LidRij => ({ id: 'm', household_id: 'h', display_name: 'X', kind: 'adult', role: 'member', status: 'active', color: null, has_account: true, sort: 0, created_at: '', ...x });
    const leden = naarLeden([l({ id: 'a' }), l({ id: 'b', status: 'archived' }), l({ id: 'c', kind: 'child', color: '#123456', has_account: false })]);
    expect(leden.map(x => [x.id, x.soort, x.kleur])).toEqual([['a', 'volwassene', 'var(--lid-1)'], ['c', 'kind', '#123456']]);
  });

  it('nieuw: zonder id en versie; bijwerken: met de meegegeven versie; geen eindtijd zonder begintijd', () => {
    const a = naarAfspraak(rij({}), new Map());
    expect(naarNieuweAfspraak(a, null)).toMatchObject({ id: undefined, version: null, start_time: '09:15', end_time: '10:00', visibility: 'household' });
    expect(naarNieuweAfspraak(a, 2)).toMatchObject({ id: 'e1', version: 2 });
    expect(naarNieuweAfspraak({ ...a, start: undefined }, null).end_time).toBeNull();
    expect(naarNieuweAfspraak({ ...a, herhaling: { freq: 'jaarlijks', tot: '2030-01-01' } }, null))
      .toMatchObject({ recurrence_freq: 'yearly', recurrence_until: '2030-01-01' });
  });
});

describe('alleen een lokale Supabase', () => {
  it('dit toestel en het eigen netwerk wel, een online project niet', () => {
    for (const u of ['http://127.0.0.1:54321', 'http://localhost:54321', 'http://192.168.1.20:54321', 'http://10.0.0.5:54321', 'http://172.20.1.1:54321']) {
      expect(isLokaalAdres(u)).toBe(true);
    }
    for (const u of ['https://abcd.supabase.co', 'http://8.8.8.8:54321', 'http://172.32.0.1', 'http://192.168.1.20.example.com', 'niet-een-url']) {
      expect(isLokaalAdres(u)).toBe(false);
    }
  });

  it('zonder configuratie de demo; met een online adres een weigering, nooit stil de demo', () => {
    expect(lokaleConfig({})).toBeNull();
    expect(() => lokaleConfig({ VITE_SUPABASE_URL: 'https://abcd.supabase.co', VITE_SUPABASE_ANON_KEY: 'x' })).toThrow(/alleen met een lokale Supabase/);
    expect(lokaleConfig({ VITE_SUPABASE_URL: 'http://127.0.0.1:54321', VITE_SUPABASE_ANON_KEY: 'x', VITE_DEMO_ACCOUNTS: '[{"naam":"Eva","email":"eva@test.invalid"}]' }))
      .toMatchObject({ accounts: [{ naam: 'Eva' }] });
  });
});

describe('levenscyclus van de sessie', () => {
  const CONFIG: LokaleConfig = { url: 'http://127.0.0.1:54321', anonKey: 'x', accounts: [] };

  function nep() {
    const aanroepen = { getSession: 0, signOut: 0, start: 0, stop: 0, maakSync: 0 };
    const auth = {
      getSession: async () => { aanroepen.getSession++; return { data: { session: { user: { id: 'u1', email: 'eva@test.invalid' } } } }; },
      signInWithPassword: async () => ({ data: { user: { id: 'u1', email: 'eva@test.invalid' } }, error: null }),
      signOut: async () => { aanroepen.signOut++; return { error: null }; },
    };
    const client = {
      auth,
      rpc: async () => ({ data: [{ household_id: 'h1' }], error: null }),
      from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { name: 'Familie Test' } }) }) }) }),
    } as unknown as SupabaseClient;
    const toestand = { status: 'verbonden', afspraken: [], taken: [], boodschappen: [], leden: [], uitzonderingen: [], lid: null } as unknown as Toestand;
    const maakSync = (() => {
      aanroepen.maakSync++;
      return {
        start: async () => { aanroepen.start++; }, stop: async () => { aanroepen.stop++; }, toestand,
        acties: {}, openstaand: [],
      } as unknown as Sync;
    }) as unknown as typeof import('../../sync/thuisplanner-sync.js').maakSync;
    const sessie = new Sessie(CONFIG, { maakClient: () => client, maakSync });
    return { sessie, aanroepen };
  }

  function Kijker({ sessie }: { sessie: Sessie }) {
    const s = useSessie(sessie);
    return <p>{s.fase}</p>;
  }

  it('StrictMode en unmount stoppen de synchronisatie niet; herstellen gebeurt één keer', async () => {
    const { sessie, aanroepen } = nep();
    const r = render(<StrictMode><Kijker sessie={sessie} /></StrictMode>);
    await act(async () => { await Promise.all([sessie.herstel(), sessie.herstel()]); });
    expect(r.container).toHaveTextContent('actief');
    expect(aanroepen).toMatchObject({ getSession: 1, maakSync: 1, start: 1, stop: 0 });

    r.unmount();
    expect(aanroepen.stop).toBe(0);
    expect(sessie.momentopname().fase).toBe('actief');

    // Opnieuw mounten (ander scherm): dezelfde sessie, geen tweede sync.
    const r2 = render(<Kijker sessie={sessie} />);
    expect(r2.container).toHaveTextContent('actief');
    expect(aanroepen.maakSync).toBe(1);
  });

  it('uitloggen stopt de synchronisatie en de inlogsessie', async () => {
    const { sessie, aanroepen } = nep();
    await sessie.herstel();
    await sessie.uitloggen();
    expect(aanroepen).toMatchObject({ stop: 1, signOut: 1 });
    expect(sessie.momentopname()).toMatchObject({ fase: 'uitgelogd', toestand: null, huishouden: null });
  });

  it('opnieuw inloggen stopt eerst de vorige synchronisatie', async () => {
    const { sessie, aanroepen } = nep();
    await sessie.herstel();
    await sessie.inloggen('eva@test.invalid', 'x');
    expect(aanroepen).toMatchObject({ maakSync: 2, stop: 1 });
    expect(sessie.momentopname().fase).toBe('actief');
  });
});
