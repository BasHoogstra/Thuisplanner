// KG-5H deel 1 (docs/thuisplanner-onboarding.md): uitnodigingstoken, sessie (aanmaken, accepteren, kiezen) en de
// schermen S1–S3. De regels zelf (eenmalig, verlopen, ingetrokken, rechten, scheiding) dwingt de database af; die
// staan in de RLS-matrix en de lokale e2e. Hier: dat de app het token veilig behandelt en de juiste functies aanroept.
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { LidRij } from '../../sync/thuisplanner-sync.js';
import { bewaarUitnodiging, leesUitnodiging, maakLink, tokenUit, vangUitnodiging, vergeetUitnodiging } from '../src/lib/uitnodiging';
import { foutTekst, Sessie, type LokaleConfig, type Momentopname, type UitnodigingVoorMij } from '../src/lib/lokaal/sessie';
import { nodigUit, openUitnodigingen, trekIn, voegLidToe, GELDIG_DAGEN } from '../src/lib/lokaal/beheer';
import { UitnodigingAccepteren, UitnodigingMelding, Welkom } from '../src/components/Onboarding';
import { HuishoudenBeheer } from '../src/components/HuishoudenBeheer';
import { Ctx, type AppContext } from '../src/lib/context';

const T = 'a'.repeat(64);
const T2 = '0123456789abcdef'.repeat(4);
beforeEach(() => { sessionStorage.clear(); localStorage.clear(); });

describe('uitnodigingstoken', () => {
  it('alleen precies 64 kleine hexadecimale tekens, los of in een uitnodigingslink', () => {
    expect(tokenUit(T)).toBe(T);
    expect(tokenUit(`  https://thuisplanner-staging.pages.dev/#/uitnodiging/${T2}  `)).toBe(T2);
    for (const fout of [T.toUpperCase(), T.slice(1), T + 'a', `https://x/#/uitnodiging/${T}x`, `https://x/?t=${T}`, `https://x/#/vandaag`, '', 'zomaar tekst']) {
      expect(tokenUit(fout)).toBeNull();
    }
    expect(maakLink(T, 'https://thuisplanner-staging.pages.dev/')).toBe(`https://thuisplanner-staging.pages.dev/#/uitnodiging/${T}`);
    expect(() => maakLink('kort')).toThrow();
  });

  it('bij openen meteen uit de adresbalk, en alleen in sessionStorage van dit tabblad bewaard', () => {
    const replaceState = vi.fn();
    const win = { location: { hash: `#/uitnodiging/${T}`, pathname: '/', search: '' }, history: { replaceState } } as unknown as Window;
    expect(vangUitnodiging(win)).toBe(T);
    expect(replaceState).toHaveBeenCalledWith(null, '', '/#/vandaag');
    expect(leesUitnodiging()).toBe(T);
    expect(JSON.stringify(localStorage)).not.toContain(T);
    // Een ongeldige uitnodigingslink gaat ook uit de adresbalk, maar wordt niet bewaard.
    vergeetUitnodiging();
    const win2 = { location: { hash: '#/uitnodiging/onzin', pathname: '/', search: '' }, history: { replaceState: vi.fn() } } as unknown as Window;
    expect(vangUitnodiging(win2)).toBeNull();
    expect(win2.history.replaceState).toHaveBeenCalled();
    expect(leesUitnodiging()).toBeNull();
    // Een gewone schermlink blijft staan.
    const win3 = { location: { hash: '#/agenda', pathname: '/', search: '' }, history: { replaceState: vi.fn() } } as unknown as Window;
    expect(vangUitnodiging(win3)).toBeNull();
    expect(win3.history.replaceState).not.toHaveBeenCalled();
  });

  it('na 24 uur, met een tijd in de toekomst of na knoeien met de opslag: weg', () => {
    bewaarUitnodiging(T, 1_000);
    expect(leesUitnodiging(1_000 + 23 * 3600_000)).toBe(T);
    expect(leesUitnodiging(1_000 + 25 * 3600_000)).toBeNull();
    expect(sessionStorage.length).toBe(0);
    bewaarUitnodiging(T, 10_000);
    expect(leesUitnodiging(5_000)).toBeNull();
    sessionStorage.setItem('thuisplanner-uitnodiging', JSON.stringify({ token: 'x'.repeat(64), sinds: Date.now() }));
    expect(leesUitnodiging()).toBeNull();
    bewaarUitnodiging('ongeldig');
    expect(sessionStorage.length).toBe(0);
  });
});

// Een nepclient die elke RPC vastlegt en een vooraf ingesteld antwoord geeft.
function nepClient(antwoorden: Record<string, { data?: unknown; error?: { code?: string; message?: string } | null }>, lidmaatschappen: { household_id: string; role: string }[] = [], tabelRijen: unknown[] = []) {
  const aanroepen: { naam: string; args: unknown }[] = [];
  const lijst = { current: lidmaatschappen };
  const client = {
    auth: { getSession: async () => ({ data: { session: { user: { id: 'u1', email: 'tester@example.com' } } } }), signOut: async () => ({ error: null }) },
    rpc: async (naam: string, args: unknown) => {
      aanroepen.push({ naam, args });
      if (naam === 'my_memberships') return { data: lijst.current, error: null };
      return { data: null, error: null, ...antwoorden[naam] };
    },
    from: (tabel: string) => {
      const q: Record<string, unknown> = {};
      const keten = () => q;
      Object.assign(q, {
        select: keten, eq: keten, is: keten, gt: keten, order: async () => ({ data: tabelRijen, error: null }),
        in: async (_k: string, ids: string[]) => ({ data: ids.map(id => ({ id, name: 'Huishouden ' + id })), error: null }),
        maybeSingle: async () => ({ data: { name: tabel === 'households' ? 'Gekozen' : '' }, error: null }),
      });
      return q;
    },
  } as unknown as SupabaseClient;
  return { client, aanroepen, lijst };
}
const CONFIG: LokaleConfig = { omgeving: 'staging', url: 'https://abcdefghijklmnopqrst.supabase.co', anonKey: 'x', accounts: [] };
const nepSync = (() => ({ toestand: { status: 'verbonden', leden: [] }, start: async () => {}, stop: async () => {} })) as never;

describe('sessie: huishouden aanmaken, accepteren en kiezen', () => {
  it('aanmaken roept alleen create_household aan en opent daarna dat huishouden', async () => {
    const n = nepClient({ create_household: { data: 'h-nieuw' } });
    const s = new Sessie(CONFIG, { maakClient: () => n.client, maakSync: nepSync });
    await s.herstel();
    expect(s.momentopname().fase).toBe('geen-huishouden');
    n.lijst.current = [{ household_id: 'h-nieuw', role: 'owner' }];
    const r = await s.maakHuishouden('Familie Test', 'Tester');
    expect(r).toEqual({ ok: true, waarde: 'h-nieuw' });
    expect(n.aanroepen.find(a => a.naam === 'create_household')?.args).toEqual({ p_name: 'Familie Test', p_display_name: 'Tester' });
    expect(s.momentopname()).toMatchObject({ fase: 'actief', huishouden: { id: 'h-nieuw', rol: 'owner' } });
  });

  it('accepteren stuurt alleen het token en de naam; de database bepaalt huishouden en rol', async () => {
    const n = nepClient({ accept_invite: { data: 'h-b' } }, [{ household_id: 'h-a', role: 'owner' }]);
    const s = new Sessie(CONFIG, { maakClient: () => n.client, maakSync: nepSync });
    await s.herstel();
    n.lijst.current = [{ household_id: 'h-a', role: 'owner' }, { household_id: 'h-b', role: 'admin' }];
    expect(await s.accepteerUitnodiging(T, '')).toEqual({ ok: true, waarde: 'h-b' });
    expect(n.aanroepen.find(a => a.naam === 'accept_invite')?.args).toEqual({ p_token: T, p_display_name: null });
    expect(s.momentopname().huishouden).toMatchObject({ id: 'h-b', rol: 'admin' });
    expect(s.momentopname().huishoudens.map(h => h.id).sort()).toEqual(['h-a', 'h-b']);
  });

  it('wisselen alleen naar een eigen huishouden; de keuze wordt per account onthouden (alleen het id)', async () => {
    const n = nepClient({}, [{ household_id: 'h-a', role: 'owner' }, { household_id: 'h-b', role: 'member' }]);
    const s = new Sessie(CONFIG, { maakClient: () => n.client, maakSync: nepSync });
    await s.herstel();
    expect(s.momentopname().huishouden?.id).toBe('h-a');
    await s.kiesHuishouden('h-vreemd');
    expect(s.momentopname().huishouden?.id).toBe('h-a');
    await s.kiesHuishouden('h-b');
    expect(s.momentopname().huishouden).toMatchObject({ id: 'h-b', rol: 'member' });
    expect(localStorage.getItem('thuisplanner-huishouden:u1')).toBe('h-b');
    // Na herladen: weer h-b.
    const s2 = new Sessie(CONFIG, { maakClient: () => n.client, maakSync: nepSync });
    await s2.herstel();
    expect(s2.momentopname().huishouden?.id).toBe('h-b');
  });

  it('meldingen: uitnodigingen via hun stabiele code, de rest letterlijk of algemeen (geen technische details)', async () => {
    expect(foutTekst({ code: '22023', message: 'Geldigheid moet 1 tot 30 dagen zijn' })).toBe('Geldigheid moet 1 tot 30 dagen zijn');
    expect(foutTekst({ code: 'XX000', message: 'interne fout met details' })).toMatch(/lukte nu niet/);
    expect(foutTekst({ message: 'Failed to fetch' })).toMatch(/lukte nu niet/);
    const n = nepClient({ accept_invite: { error: { code: 'TPU03', message: 'Uitnodiging is al gebruikt' } } }, [{ household_id: 'h-a', role: 'owner' }]);
    const s = new Sessie(CONFIG, { maakClient: () => n.client, maakSync: nepSync });
    await s.herstel();
    expect(await s.accepteerUitnodiging(T, 'X')).toEqual({ ok: false, fout: 'Deze uitnodiging is al gebruikt.', code: 'TPU03' });
    expect(s.momentopname().huishouden?.id).toBe('h-a');
  });

  const RIJ = { id: 'i1', household_name: 'Familie Test', invited_by: 'Sanne', member_name: null, role: 'admin', expires_at: '2026-10-24T10:00:00Z' };
  it('uitnodigingen voor jou: na inloggen opgehaald (zonder adres of token), ook zonder huishouden; een fout geeft een lege lijst', async () => {
    const n = nepClient({ my_invites: { data: [RIJ] } });
    const s = new Sessie(CONFIG, { maakClient: () => n.client, maakSync: nepSync });
    await s.herstel();
    expect(s.momentopname()).toMatchObject({ fase: 'geen-huishouden', uitnodigingen: [
      { id: 'i1', huishouden: 'Familie Test', doorWie: 'Sanne', profiel: null, rol: 'admin', geldigTot: '2026-10-24T10:00:00Z' }] });
    const n2 = nepClient({ my_invites: { error: { code: 'PGRST202', message: 'not found' } } }, [{ household_id: 'h-a', role: 'owner' }]);
    const s2 = new Sessie(CONFIG, { maakClient: () => n2.client, maakSync: nepSync });
    await s2.herstel();
    expect(s2.momentopname()).toMatchObject({ fase: 'actief', uitnodigingen: [], fout: null });
  });

  it('accepteren uit de lijst stuurt alleen het id en de naam; weigeren alleen het id; daarna een verse lijst', async () => {
    const n = nepClient({ my_invites: { data: [RIJ] }, accept_invite_by_id: { data: 'h-b' }, decline_invite: {} }, [{ household_id: 'h-a', role: 'owner' }]);
    const s = new Sessie(CONFIG, { maakClient: () => n.client, maakSync: nepSync });
    await s.herstel();
    expect(s.momentopname().uitnodigingen).toHaveLength(1);
    n.lijst.current = [{ household_id: 'h-a', role: 'owner' }, { household_id: 'h-b', role: 'admin' }];
    expect(await s.accepteerUitnodigingOpId('i1', 'Joris')).toEqual({ ok: true, waarde: 'h-b' });
    expect(n.aanroepen.find(a => a.naam === 'accept_invite_by_id')?.args).toEqual({ p_invite: 'i1', p_display_name: 'Joris' });
    expect(s.momentopname().huishouden).toMatchObject({ id: 'h-b', rol: 'admin' });
    const voor = n.aanroepen.filter(a => a.naam === 'my_invites').length;
    expect(await s.weigerUitnodiging('i2')).toEqual({ ok: true, waarde: undefined });
    expect(n.aanroepen.find(a => a.naam === 'decline_invite')?.args).toEqual({ p_invite: 'i2' });
    expect(n.aanroepen.filter(a => a.naam === 'my_invites').length).toBe(voor + 1);
  });

  it('een geweigerde poging uit de lijst geeft de tekst bij de code en ververst de lijst', async () => {
    const n = nepClient({ my_invites: { data: [RIJ] }, accept_invite_by_id: { error: { code: 'TPU04', message: 'x' } } }, [{ household_id: 'h-a', role: 'owner' }]);
    const s = new Sessie(CONFIG, { maakClient: () => n.client, maakSync: nepSync });
    await s.herstel();
    const voor = n.aanroepen.filter(a => a.naam === 'my_invites').length;
    expect(await s.accepteerUitnodigingOpId('i1', null)).toEqual({ ok: false, fout: 'Deze uitnodiging is ingetrokken.', code: 'TPU04' });
    await waitFor(() => expect(n.aanroepen.filter(a => a.naam === 'my_invites').length).toBe(voor + 1));
    expect(s.momentopname().huishouden?.id).toBe('h-a');
  });
});

describe('beheer: de juiste functies met de juiste gegevens', () => {
  it('lid toevoegen, uitnodigen (7 dagen, link met fragment), intrekken, open uitnodigingen', async () => {
    const n = nepClient({ add_member: { data: 'm1' }, create_invite: { data: T }, revoke_invite: {} });
    expect(await voegLidToe(n.client, 'h1', 'Lotte', 'child')).toEqual({ ok: true, waarde: 'm1' });
    expect(n.aanroepen.at(-1)).toEqual({ naam: 'add_member', args: { p_household: 'h1', p_display_name: 'Lotte', p_kind: 'child' } });
    const u = await nodigUit(n.client, 'h1', null, 'admin', { nu: new Date('2026-10-16T10:00:00Z') });
    expect(n.aanroepen.at(-1)).toEqual({ naam: 'create_invite', args: { p_household: 'h1', p_member: null, p_role: 'admin', p_days: GELDIG_DAGEN, p_email: null } });
    expect(GELDIG_DAGEN).toBe(7);
    expect(u.ok && u.waarde.link).toMatch(new RegExp(`#/uitnodiging/${T}$`));
    expect(u.ok && u.waarde.link).not.toMatch(/\?/);
    expect(await trekIn(n.client, 'i1')).toEqual({ ok: true, waarde: undefined });
    expect(n.aanroepen.at(-1)).toEqual({ naam: 'revoke_invite', args: { p_invite: 'i1' } });
    expect(await openUitnodigingen(n.client, 'h1')).toEqual({ ok: true, waarde: [] });
  });

  it('uitnodigen op e-mailadres: het adres gaat mee (de database normaliseert en controleert); leeg = zonder adres', async () => {
    const n = nepClient({ create_invite: { data: T } });
    const u = await nodigUit(n.client, 'h1', null, 'member', { email: '  Joris@Example.com ' });
    expect(n.aanroepen.at(-1)?.args).toMatchObject({ p_email: 'Joris@Example.com' });
    expect(u.ok && u.waarde.email).toBe('joris@example.com');
    await nodigUit(n.client, 'h1', null, 'member', { email: '   ' });
    expect(n.aanroepen.at(-1)?.args).toMatchObject({ p_email: null });
    const fout = nepClient({ create_invite: { error: { code: 'TPU09', message: 'Ongeldig e-mailadres' } } });
    const r = await nodigUit(fout.client, 'h1', null, 'member', { email: 'geen-adres' });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.fout).toMatch(/e-mailadres lijkt niet te kloppen/);
  });

  it('open uitnodigingen tonen het adres en "geweigerd"', async () => {
    const n = nepClient({}, [], [
      { id: 'i1', member_id: null, role: 'member', expires_at: '2026-10-24T10:00:00Z', invited_email: 'joris@example.com', declined_at: null },
      { id: 'i2', member_id: null, role: 'member', expires_at: '2026-10-24T10:00:00Z', invited_email: null, declined_at: '2026-10-17T10:00:00Z' }]);
    expect(await openUitnodigingen(n.client, 'h1')).toEqual({ ok: true, waarde: [
      { id: 'i1', lidId: null, rol: 'member', verloopt: '2026-10-24T10:00:00Z', email: 'joris@example.com', geweigerd: false },
      { id: 'i2', lidId: null, rol: 'member', verloopt: '2026-10-24T10:00:00Z', email: null, geweigerd: true }] });
  });
});

// Schermen met een nep-sessie.
function nepSessie(extra: Partial<Record<string, unknown>> = {}) {
  return { config: CONFIG, uitloggen: vi.fn(async () => {}), momentopname: () => ({ huishouden: { id: 'h-b', naam: 'Familie B' } }), ...extra } as unknown as Sessie;
}
const SNAP = { fase: 'geen-huishouden', fout: null, account: { id: 'u1', email: 'tester@example.com' }, huishouden: null, huishoudens: [], uitnodigingen: [], magHuishouden: true, adreswijziging: null, toestand: null } as Momentopname;
const U: UitnodigingVoorMij = { id: 'i1', huishouden: 'Familie Test', doorWie: 'Sanne', profiel: null, rol: 'admin', geldigTot: '2026-10-24T10:00:00Z' };

describe('S1 en S2', () => {
  it('S1: aanmaken met twee namen; een ongeldige link geeft een melding, een geldige gaat naar de uitnodiging', async () => {
    const maakHuishouden = vi.fn(async () => ({ ok: true, waarde: 'h1' }));
    const opUitnodiging = vi.fn();
    render(<Welkom sessie={nepSessie({ maakHuishouden })} snap={SNAP} opUitnodiging={opUitnodiging} opBekijk={vi.fn()} />);
    expect(screen.getByText(/verschijnt de uitnodiging hier vanzelf/)).toBeTruthy();
    expect(screen.getByText(/Testomgeving/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Huishouden aanmaken' }));
    expect(maakHuishouden).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Naam van het huishouden'), { target: { value: ' Familie Test ' } });
    fireEvent.change(screen.getByLabelText('Jouw naam'), { target: { value: 'Tester' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Huishouden aanmaken' })); });
    expect(maakHuishouden).toHaveBeenCalledWith('Familie Test', 'Tester');
    fireEvent.change(screen.getByLabelText('Uitnodigingslink'), { target: { value: 'https://x/#/uitnodiging/kapot' } });
    fireEvent.click(screen.getByRole('button', { name: 'Verder' }));
    expect(screen.getByRole('alert').textContent).toMatch(/geen geldige uitnodigingslink/);
    expect(opUitnodiging).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Uitnodigingslink'), { target: { value: `https://x/#/uitnodiging/${T}` } });
    fireEvent.click(screen.getByRole('button', { name: 'Verder' }));
    expect(opUitnodiging).toHaveBeenCalledWith(T);
    expect(leesUitnodiging()).toBe(T);
  });

  it('S2: nooit vanzelf accepteren; na accepteren is het token weg; "Niet accepteren" wist het ook', async () => {
    bewaarUitnodiging(T);
    const accepteerUitnodiging = vi.fn(async () => ({ ok: true, waarde: 'h-b' }));
    const sluit = vi.fn();
    const { unmount } = render(<UitnodigingAccepteren sessie={nepSessie({ accepteerUitnodiging })} snap={SNAP} bron={{ soort: 'link', token: T }} sluit={sluit} />);
    expect(accepteerUitnodiging).not.toHaveBeenCalled();
    expect(screen.getByText('tester@example.com')).toBeTruthy();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Accepteren' })); });
    expect(accepteerUitnodiging).toHaveBeenCalledWith(T, null);
    expect(leesUitnodiging()).toBeNull();
    expect(screen.getByRole('heading', { name: 'Welkom bij Familie B' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Toch niet/ })).toBeTruthy();
    unmount();

    bewaarUitnodiging(T);
    render(<UitnodigingAccepteren sessie={nepSessie({ accepteerUitnodiging })} snap={SNAP} bron={{ soort: 'link', token: T }} sluit={sluit} />);
    fireEvent.click(screen.getByRole('button', { name: 'Niet accepteren' }));
    expect(leesUitnodiging()).toBeNull();
    expect(sluit).toHaveBeenCalled();
  });

  it('S2: een fout van de database wordt getoond en het scherm blijft staan', async () => {
    const accepteerUitnodiging = vi.fn(async () => ({ ok: false, fout: 'Uitnodiging is verlopen' }));
    render(<UitnodigingAccepteren sessie={nepSessie({ accepteerUitnodiging })} snap={SNAP} bron={{ soort: 'link', token: T }} sluit={vi.fn()} />);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Accepteren' })); });
    expect(screen.getByRole('alert').textContent).toBe('Uitnodiging is verlopen');
    expect(screen.getByRole('button', { name: 'Accepteren' })).toBeTruthy();
  });

  it('S1: "Uitnodigingen voor jou" bovenaan; Bekijken opent de uitnodiging (accepteren gebeurt daar, nooit vanzelf)', () => {
    const opBekijk = vi.fn();
    const accepteerUitnodigingOpId = vi.fn();
    render(<Welkom sessie={nepSessie({ accepteerUitnodigingOpId })} snap={{ ...SNAP, uitnodigingen: [U] }} opUitnodiging={vi.fn()} opBekijk={opBekijk} />);
    expect(screen.getByRole('heading', { name: 'Uitnodigingen voor jou' })).toBeTruthy();
    expect(screen.getByText('Familie Test')).toBeTruthy();
    expect(screen.getByText(/Van Sanne · als beheerder · geldig tot 24 oktober/)).toBeTruthy();
    expect(screen.queryByText(/verschijnt de uitnodiging hier vanzelf/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Uitnodiging voor Familie Test bekijken' }));
    expect(opBekijk).toHaveBeenCalledWith(U);
    expect(accepteerUitnodigingOpId).not.toHaveBeenCalled();
  });

  it('S2 uit de lijst: wie, welk huishouden en welke rol; accepteren met het id; Later doet niets; weigeren na bevestigen', async () => {
    const accepteerUitnodigingOpId = vi.fn(async () => ({ ok: true, waarde: 'h-b' }));
    const weigerUitnodiging = vi.fn(async () => ({ ok: true, waarde: undefined }));
    const sluit = vi.fn();
    const { unmount } = render(<UitnodigingAccepteren sessie={nepSessie({ accepteerUitnodigingOpId, weigerUitnodiging })} snap={SNAP} bron={{ soort: 'lijst', u: U }} sluit={sluit} />);
    expect(screen.getByText(/Sanne nodigt je uit voor/).textContent).toMatch(/Familie Test, als beheerder/);
    fireEvent.click(screen.getByRole('button', { name: 'Later' }));
    expect(sluit).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Weigeren' }));
    expect(weigerUitnodiging).not.toHaveBeenCalled();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Ja, weigeren' })); });
    expect(weigerUitnodiging).toHaveBeenCalledWith('i1');
    expect(sluit).toHaveBeenCalledTimes(2);
    unmount();

    render(<UitnodigingAccepteren sessie={nepSessie({ accepteerUitnodigingOpId })} snap={SNAP} bron={{ soort: 'lijst', u: U }} sluit={sluit} />);
    fireEvent.change(screen.getByLabelText('Jouw naam'), { target: { value: ' Joris ' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Accepteren' })); });
    expect(accepteerUitnodigingOpId).toHaveBeenCalledWith('i1', 'Joris');
    expect(screen.getByRole('heading', { name: 'Welkom bij Familie B' })).toBeTruthy();
  });

  it('S2 uit de lijst voor een bestaand profiel: geen naamveld, de koppeling staat erbij', async () => {
    const accepteerUitnodigingOpId = vi.fn(async () => ({ ok: true, waarde: 'h-b' }));
    render(<UitnodigingAccepteren sessie={nepSessie({ accepteerUitnodigingOpId })} snap={SNAP} bron={{ soort: 'lijst', u: { ...U, profiel: 'Partner' } }} sluit={vi.fn()} />);
    expect(screen.queryByLabelText('Jouw naam')).toBeNull();
    expect(screen.getByText('Partner')).toBeTruthy();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Accepteren' })); });
    expect(accepteerUitnodigingOpId).toHaveBeenCalledWith('i1', null);
  });

  it('S2 met een link voor een ander adres (TPU06): uitleg en uitloggen; de link blijft in dit tabblad', async () => {
    bewaarUitnodiging(T);
    const uitloggen = vi.fn(async () => {});
    const accepteerUitnodiging = vi.fn(async () => ({ ok: false, fout: foutTekst({ code: 'TPU06' }), code: 'TPU06' }));
    render(<UitnodigingAccepteren sessie={nepSessie({ accepteerUitnodiging, uitloggen })} snap={SNAP} bron={{ soort: 'link', token: T }} sluit={vi.fn()} />);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Accepteren' })); });
    expect(screen.getByRole('alert').textContent).toMatch(/ander e-mailadres/);
    fireEvent.click(screen.getByRole('button', { name: 'Uitloggen en met een ander adres inloggen' }));
    expect(uitloggen).toHaveBeenCalled();
    expect(leesUitnodiging()).toBe(T);
  });

  it('Vandaag: één rustige melding; Bekijken opent die ene, bij meer naar de lijst; Later', () => {
    const opBekijk = vi.fn(); const opAlle = vi.fn(); const opLater = vi.fn();
    const { rerender, container } = render(<UitnodigingMelding lijst={[U]} opBekijk={opBekijk} opAlle={opAlle} opLater={opLater} />);
    expect(screen.getByText(/Je bent uitgenodigd voor/).textContent).toBe('Je bent uitgenodigd voor Familie Test.');
    fireEvent.click(screen.getByRole('button', { name: 'Bekijken' }));
    expect(opBekijk).toHaveBeenCalledWith(U);
    rerender(<UitnodigingMelding lijst={[U, { ...U, id: 'i2', huishouden: 'Smit' }]} opBekijk={opBekijk} opAlle={opAlle} opLater={opLater} />);
    expect(screen.getByText('Je hebt 2 uitnodigingen.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Bekijken' }));
    expect(opAlle).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Later' }));
    expect(opLater).toHaveBeenCalled();
    rerender(<UitnodigingMelding lijst={[]} opBekijk={opBekijk} opAlle={opAlle} opLater={opLater} />);
    expect(container.textContent).toBe('');
  });
});

describe('S3: Meer → Huishouden, per rol', () => {
  const leden: LidRij[] = [
    { id: 'm-eig', household_id: 'h1', display_name: 'Eigenaar', kind: 'adult', role: 'owner', status: 'active', color: null, has_account: true, sort: 0, created_at: '' },
    { id: 'm-partner', household_id: 'h1', display_name: 'Partner', kind: 'adult', role: 'member', status: 'active', color: null, has_account: false, sort: 1, created_at: '' },
    { id: 'm-kind', household_id: 'h1', display_name: 'Kind', kind: 'child', role: 'member', status: 'active', color: null, has_account: false, sort: 2, created_at: '' },
  ];
  function toon(rol: 'owner' | 'admin' | 'member') {
    const n = nepClient({ create_invite: { data: T } });
    const ctx = { lokaal: { omgeving: 'staging', beheer: { client: n.client, huishouden: { id: 'h1', naam: 'Familie Test', rol }, huishoudens: [{ id: 'h1', naam: 'Familie Test', rol }], leden, kies: vi.fn() } } } as unknown as AppContext;
    render(<Ctx.Provider value={ctx}><HuishoudenBeheer /></Ctx.Provider>);
    return n;
  }
  it('een lid ziet de leden, maar geen beheerknoppen', () => {
    toon('member');
    expect(screen.getByText('Partner')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Uitnodiging maken' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Toevoegen' })).toBeNull();
  });
  it('een beheerder kan toevoegen en uitnodigen, maar alleen als lid', async () => {
    const n = toon('admin');
    expect(screen.queryByRole('radio', { name: 'Beheerder' })).toBeNull();
    // Alleen volwassenen zonder account zijn uit te nodigen profielen; een kind niet.
    const opties = [...(screen.getByLabelText('Voor wie') as HTMLSelectElement).options].map(o => o.textContent);
    expect(opties).toEqual(['Iemand nieuw', 'Partner']);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Uitnodiging maken' })); });
    expect(n.aanroepen.find(a => a.naam === 'create_invite')?.args).toMatchObject({ p_role: 'member', p_member: null });
  });
  it('de eigenaar nodigt standaard uit als beheerder, voor een bestaand profiel; de link staat klaar om te delen', async () => {
    const n = toon('owner');
    expect(screen.getByRole('radio', { name: 'Beheerder' }).getAttribute('aria-checked')).toBe('true');
    fireEvent.change(screen.getByLabelText('Voor wie'), { target: { value: 'm-partner' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Uitnodiging maken' })); });
    expect(n.aanroepen.find(a => a.naam === 'create_invite')?.args).toEqual({ p_household: 'h1', p_member: 'm-partner', p_role: 'admin', p_days: 7, p_email: null });
    await waitFor(() => expect((screen.getByLabelText('Uitnodigingslink') as HTMLInputElement).value).toMatch(new RegExp(`#/uitnodiging/${T}$`)));
    expect(screen.getByText(/één keer te gebruiken/)).toBeTruthy();
  });
  it('uitnodigen op e-mailadres: het adres gaat mee en de uitleg noemt het en zegt dat we mailen; daarna is het veld leeg', async () => {
    const n = toon('owner');
    fireEvent.change(screen.getByLabelText('E-mailadres (optioneel)'), { target: { value: 'Joris@Example.com' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Uitnodiging maken' })); });
    expect(n.aanroepen.find(a => a.naam === 'create_invite')?.args).toMatchObject({ p_email: 'Joris@Example.com' });
    await waitFor(() => expect(screen.getByText('joris@example.com')).toBeTruthy());
    expect(screen.getByText(/We mailen/)).toBeTruthy();
    expect(screen.getByText(/de link kun je ook zelf delen/)).toBeTruthy();
    expect((screen.getByLabelText('E-mailadres (optioneel)') as HTMLInputElement).value).toBe('');
  });
  it('uitnodigingen voor jou staan ook in Meer, voor elke rol', () => {
    const n = nepClient({});
    const bekijk = vi.fn();
    const ctx = { lokaal: { omgeving: 'staging',
      uitnodigingen: { lijst: [{ id: 'i9', huishouden: 'Smit', doorWie: 'Olaf', profiel: null, rol: 'member', geldigTot: '2026-10-24T10:00:00Z' }], melding: [], bekijk, later: vi.fn() },
      beheer: { client: n.client, huishouden: { id: 'h1', naam: 'Familie Test', rol: 'member' }, huishoudens: [], leden, kies: vi.fn() } } } as unknown as AppContext;
    render(<Ctx.Provider value={ctx}><HuishoudenBeheer /></Ctx.Provider>);
    fireEvent.click(screen.getByRole('button', { name: 'Uitnodiging voor Smit bekijken' }));
    expect(bekijk).toHaveBeenCalledWith(expect.objectContaining({ id: 'i9' }));
  });
});
