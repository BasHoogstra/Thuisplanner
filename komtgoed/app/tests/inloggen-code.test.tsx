// KG-5H deel 2: inloggen met een e-mailcode in de app (K1), netwerkstoringen, de toegangspoort en de testpoort.
// De beveiliging zelf zit in de database en de Edge Functions (tests/integratie: poort.test.mjs en k1.test.mjs); hier:
// dat de app de juiste dingen aanroept, nooit uitlogt door een netwerkfout, en de gebruiker goed begeleidt.
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { Sessie, type LokaleConfig, type Momentopname } from '../src/lib/lokaal/sessie';
import { bewaarAanvraag, bewaarToestel, controleerBijServer, gemaskeerd, leesAanvraag, leesToestel, vergeetToestellen } from '../src/lib/lokaal/code';
import { CODE_TEKSTEN, TOEGANG_TEKSTEN } from '../src/lib/foutcodes';
import { CodeInloggen } from '../src/components/CodeInloggen';
import { Welkom } from '../src/components/Onboarding';
import { headersBestand } from '../scripts/staging-build';
import { stagingFouten } from '../src/lib/omgeving';

const CONFIG: LokaleConfig = { omgeving: 'staging', url: 'https://abcdefghijklmnopqrst.supabase.co', anonKey: 'anon', accounts: [] };
const nepSync = (() => ({ toestand: { status: 'verbonden', leden: [] }, start: async () => {}, stop: async () => {} })) as never;
beforeEach(() => { sessionStorage.clear(); localStorage.clear(); });

function nepClient(o: {
  otp?: { error?: unknown }; verify?: { error?: unknown; user?: unknown }; sessie?: unknown; sessieFout?: unknown;
  toegang?: string; lid?: { household_id: string; role: string }[]; mag?: boolean;
} = {}) {
  const aanroepen: { naam: string; args?: unknown }[] = [];
  const client = {
    auth: {
      getSession: async () => ({ data: { session: o.sessie ?? null }, error: o.sessieFout ?? null }),
      signInWithOtp: async (args: unknown) => { aanroepen.push({ naam: 'signInWithOtp', args }); return { data: { user: null, session: null }, error: o.otp?.error ?? null }; },
      verifyOtp: async (args: unknown) => { aanroepen.push({ naam: 'verifyOtp', args }); return { data: { user: o.verify?.user ?? { id: 'u1', email: 'joris@example.com' } }, error: o.verify?.error ?? null }; },
      signOut: async (args: unknown) => { aanroepen.push({ naam: 'signOut', args }); return { error: null }; },
      getUser: async () => ({ data: { user: { id: 'u1', email: 'joris@example.com' } } }),
      updateUser: async (args: unknown) => { aanroepen.push({ naam: 'updateUser', args }); return { error: null }; },
    },
    rpc: async (naam: string, args: unknown) => {
      aanroepen.push({ naam, args });
      if (naam === 'mijn_toegang') return { data: o.toegang ?? 'ok', error: null };
      if (naam === 'my_memberships') return { data: o.lid ?? [], error: null };
      if (naam === 'mag_huishouden_maken') return { data: o.mag ?? true, error: null };
      return { data: [], error: null };
    },
    from: () => {
      const q: Record<string, unknown> = {};
      const keten = () => q;
      Object.assign(q, { select: keten, eq: keten, in: keten, maybeSingle: async () => ({ data: { name: 'Familie Test' }, error: null }), upsert: async () => ({ error: null }) });
      return q;
    },
  } as unknown as SupabaseClient;
  return { client, aanroepen };
}

describe('codes en toestel op dit toestel', () => {
  it('M1: de aanvraag (adres en tijd, nooit de code) blijft 10 minuten; daarna weg', () => {
    bewaarAanvraag(' Joris@Example.com ', 1_000);
    expect(leesAanvraag(1_000 + 9 * 60_000)).toEqual({ email: 'joris@example.com', tijd: 1_000 });
    expect(leesAanvraag(1_000 + 11 * 60_000)).toBeNull();
    expect(JSON.stringify(localStorage)).not.toMatch(/\d{6}/);
  });
  it('toestel-token: alleen een geldig token, per adres; vergeten wist ze allemaal', () => {
    bewaarToestel('a@x.nl', 'kort');
    expect(leesToestel('a@x.nl')).toBeNull();
    bewaarToestel('A@x.nl', 'a'.repeat(64));
    expect(leesToestel('a@x.nl')).toBe('a'.repeat(64));
    vergeetToestellen();
    expect(leesToestel('a@x.nl')).toBeNull();
    expect(gemaskeerd('joris@example.com')).toBe('j…@….com');
  });
  it('controleer-code: alles in de body van een POST, nooit in de URL; codes naar teksten; geen netwerk = eigen melding', async () => {
    const doe = vi.fn(async (_u: string, _i: RequestInit) => new Response(JSON.stringify({ token_hash: 'h'.repeat(56), type: 'email', toestel: 't'.repeat(64) }), { status: 200 }));
    const r = await controleerBijServer(CONFIG.url, 'anon', { email: ' Joris@Example.com ', code: '123456', toestel: null }, doe as unknown as typeof fetch);
    expect(r).toEqual({ ok: true, tokenHash: 'h'.repeat(56), type: 'email', toestel: 't'.repeat(64) });
    const [url, init] = doe.mock.calls[0];
    expect(url).toBe(`${CONFIG.url}/functions/v1/controleer-code`);
    expect(url).not.toMatch(/123456|joris/);
    expect(JSON.parse(String(init.body))).toEqual({ email: 'joris@example.com', code: '123456' });
    for (const code of ['TPK01', 'TPK02', 'TPK03', 'TPK06']) {
      const f = await controleerBijServer(CONFIG.url, 'anon', { email: 'a@x.nl', code: '000000' },
        (async () => new Response(JSON.stringify({ code }), { status: 400 })) as unknown as typeof fetch);
      expect(f).toEqual({ ok: false, code, fout: CODE_TEKSTEN[code] });
    }
    const n = await controleerBijServer(CONFIG.url, 'anon', { email: 'a@x.nl', code: '000000' }, (async () => { throw new TypeError('fetch failed'); }) as unknown as typeof fetch);
    expect(n).toMatchObject({ ok: false, code: 'NETWERK' });
  });
});

describe('sessie: aanvragen, controleren, netwerk en poort', () => {
  it('een code aanvragen: altijd shouldCreateUser true (geen adresverraad), adres in kleine letters; de aanvraag wordt onthouden', async () => {
    const n = nepClient();
    const s = new Sessie(CONFIG, { maakClient: () => n.client, maakSync: nepSync });
    expect(await s.vraagCode(' Joris@Example.com ')).toEqual({ ok: true, waarde: undefined });
    expect(n.aanroepen[0]).toEqual({ naam: 'signInWithOtp', args: { email: 'joris@example.com', options: { shouldCreateUser: true } } });
    expect(leesAanvraag()?.email).toBe('joris@example.com');
  });
  it('meldingen bij aanvragen: de Nederlandse melding van de codelaag letterlijk; Engelse van Supabase niet', async () => {
    const eigen = nepClient({ otp: { error: { status: 429, message: 'Er zijn net al een paar codes verstuurd. Gebruik de laatste code uit je mail.' } } });
    expect(await new Sessie(CONFIG, { maakClient: () => eigen.client, maakSync: nepSync }).vraagCode('a@x.nl'))
      .toMatchObject({ ok: false, fout: 'Er zijn net al een paar codes verstuurd. Gebruik de laatste code uit je mail.' });
    const engels = nepClient({ otp: { error: { status: 429, message: 'For security purposes, you can only request this after 59 seconds.' } } });
    expect(await new Sessie(CONFIG, { maakClient: () => engels.client, maakSync: nepSync }).vraagCode('a@x.nl'))
      .toMatchObject({ ok: false, fout: 'Wacht even voordat je een nieuwe code aanvraagt.' });
  });
  it('een goede code: de token_hash gaat direct naar verifyOtp (Supabase geeft de sessie); het toestel wordt onthouden', async () => {
    const n = nepClient({ lid: [{ household_id: 'h1', role: 'owner' }] });
    const s = new Sessie(CONFIG, { maakClient: () => n.client, maakSync: nepSync });
    const echt = globalThis.fetch;
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ token_hash: 'h'.repeat(56), type: 'signup', toestel: 'c'.repeat(64) }), { status: 200 })) as unknown as typeof fetch;
    try {
      bewaarAanvraag('joris@example.com');
      expect(await s.controleerCode('joris@example.com', '123456')).toEqual({ ok: true, waarde: undefined });
    } finally { globalThis.fetch = echt; }
    expect(n.aanroepen.find(a => a.naam === 'verifyOtp')?.args).toEqual({ token_hash: 'h'.repeat(56), type: 'signup' });
    expect(leesToestel('joris@example.com')).toBe('c'.repeat(64));
    expect(leesAanvraag()).toBeNull();
    expect(s.momentopname()).toMatchObject({ fase: 'actief', huishouden: { id: 'h1' } });
    expect(JSON.stringify(localStorage) + JSON.stringify(sessionStorage)).not.toContain('h'.repeat(56));
  });
  it('een foute code: geen verifyOtp, de melding van de code', async () => {
    const n = nepClient();
    const s = new Sessie(CONFIG, { maakClient: () => n.client, maakSync: nepSync });
    const echt = globalThis.fetch;
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ code: 'TPK01' }), { status: 400 })) as unknown as typeof fetch;
    try { expect(await s.controleerCode('a@x.nl', '000000')).toEqual({ ok: false, fout: CODE_TEKSTEN.TPK01, code: 'TPK01' }); }
    finally { globalThis.fetch = echt; }
    expect(n.aanroepen.some(a => a.naam === 'verifyOtp')).toBe(false);
  });
  it('geen netwerk bij het openen, met een opgeslagen inlogsessie: NIET uitloggen, maar wachten (fase verbinding)', async () => {
    localStorage.setItem('thuisplanner-auth', '{"opgeslagen":true}');
    const n = nepClient({ sessieFout: { name: 'AuthRetryableFetchError', status: 0, message: 'fetch failed' } });
    const s = new Sessie(CONFIG, { maakClient: () => n.client, maakSync: nepSync });
    await s.herstel();
    expect(s.momentopname().fase).toBe('verbinding');
    expect(n.aanroepen.some(a => a.naam === 'signOut')).toBe(false);
    // Zonder opgeslagen sessie: gewoon het inlogscherm.
    localStorage.clear();
    const s2 = new Sessie(CONFIG, { maakClient: () => n.client, maakSync: nepSync });
    await s2.herstel();
    expect(s2.momentopname().fase).toBe('uitgelogd');
  });
  it('de poort zegt "code-nodig" (een wachtwoordsessie): lokaal afmelden, met uitleg; "onderhoud": wachten, niet uitloggen', async () => {
    const n = nepClient({ sessie: { user: { id: 'u1', email: 'a@x.nl' } }, toegang: 'code-nodig' });
    const s = new Sessie(CONFIG, { maakClient: () => n.client, maakSync: nepSync });
    await s.herstel();
    expect(s.momentopname()).toMatchObject({ fase: 'uitgelogd', fout: TOEGANG_TEKSTEN.TPA01, account: null });
    expect(n.aanroepen.find(a => a.naam === 'signOut')?.args).toEqual({ scope: 'local' });
    const o = nepClient({ sessie: { user: { id: 'u1', email: 'a@x.nl' } }, toegang: 'onderhoud' });
    const s2 = new Sessie(CONFIG, { maakClient: () => o.client, maakSync: nepSync });
    await s2.herstel();
    expect(s2.momentopname()).toMatchObject({ fase: 'onderhoud', fout: TOEGANG_TEKSTEN.TPA03 });
    expect(o.aanroepen.some(a => a.naam === 'signOut')).toBe(false);
  });
  it('testpoort: zonder huishouden vraagt de app of een eigen huishouden mag', async () => {
    const n = nepClient({ sessie: { user: { id: 'u1', email: 'a@x.nl' } }, mag: false });
    const s = new Sessie(CONFIG, { maakClient: () => n.client, maakSync: nepSync });
    await s.herstel();
    expect(s.momentopname()).toMatchObject({ fase: 'geen-huishouden', magHuishouden: false });
  });
  it('uitloggen op alle toestellen: toestellen intrekken, alle sessies uit (scope global)', async () => {
    const n = nepClient({ sessie: { user: { id: 'u1', email: 'a@x.nl' } } });
    const s = new Sessie(CONFIG, { maakClient: () => n.client, maakSync: nepSync });
    await s.herstel();
    bewaarToestel('a@x.nl', 'd'.repeat(64));
    await s.uitloggenOveral();
    expect(n.aanroepen.some(a => a.naam === 'mijn_toestellen_intrekken')).toBe(true);
    expect(n.aanroepen.find(a => a.naam === 'signOut')?.args).toEqual({ scope: 'global' });
    expect(leesToestel('a@x.nl')).toBeNull();
    expect(s.momentopname().fase).toBe('uitgelogd');
  });
});

function nepSessie(extra: Record<string, unknown> = {}) {
  return { config: CONFIG, vraagCode: vi.fn(async () => ({ ok: true, waarde: undefined })), controleerCode: vi.fn(async () => ({ ok: true, waarde: undefined })),
    uitloggen: vi.fn(), leesNaam: async () => null, bewaarNaam: async () => {}, ...extra } as unknown as Sessie;
}

describe('het codescherm', () => {
  it('adres → "Stuur code" → het codescherm met het adres; zes cijfers gaan vanzelf verder', async () => {
    const s = nepSessie();
    render(<CodeInloggen sessie={s} />);
    fireEvent.change(screen.getByLabelText('E-mailadres'), { target: { value: 'joris@example.com' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Stuur code' })); });
    expect(s.vraagCode).toHaveBeenCalledWith('joris@example.com', null);
    expect(screen.getByText('joris@example.com')).toBeTruthy();
    const veld = screen.getByLabelText('Code uit de mail') as HTMLInputElement;
    expect(veld.getAttribute('autocomplete')).toBe('one-time-code');
    expect(veld.getAttribute('inputmode')).toBe('numeric');
    await act(async () => { fireEvent.change(veld, { target: { value: '12 34 56' } }); });
    expect(s.controleerCode).toHaveBeenCalledWith('joris@example.com', '123456', null);
    expect(screen.getByRole('button', { name: /Nieuwe code over \d+ s/ })).toBeTruthy();
  });
  it('een ongeldig adres: een melding, geen aanvraag; een foute code: de melding en het veld is weer leeg', async () => {
    const s = nepSessie({ controleerCode: vi.fn(async () => ({ ok: false, fout: CODE_TEKSTEN.TPK01, code: 'TPK01' })) });
    render(<CodeInloggen sessie={s} />);
    fireEvent.change(screen.getByLabelText('E-mailadres'), { target: { value: 'geen-adres' } });
    fireEvent.click(screen.getByRole('button', { name: 'Stuur code' }));
    expect(screen.getByRole('alert').textContent).toMatch(/Vul je e-mailadres in/);
    expect(s.vraagCode).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('E-mailadres'), { target: { value: 'a@x.nl' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Stuur code' })); });
    await act(async () => { fireEvent.change(screen.getByLabelText('Code uit de mail'), { target: { value: '000000' } }); });
    expect(screen.getByRole('alert').textContent).toBe(CODE_TEKSTEN.TPK01);
    expect((screen.getByLabelText('Code uit de mail') as HTMLInputElement).value).toBe('');
  });
  it('M1: een openstaande aanvraag opent direct het codescherm; "Ander adres gebruiken" gaat terug', async () => {
    bewaarAanvraag('joris@example.com');
    render(<CodeInloggen sessie={nepSessie()} />);
    expect(screen.getByLabelText('Code uit de mail')).toBeTruthy();
    expect(screen.getByText('joris@example.com')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Ander adres gebruiken' }));
    expect(screen.getByLabelText('E-mailadres')).toBeTruthy();
    expect(leesAanvraag()).toBeNull();
  });
  it('na twee nieuwe codes: hulp als er niets komt, met het adres letterlijk', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const s = nepSessie();
      render(<CodeInloggen sessie={s} />);
      fireEvent.change(screen.getByLabelText('E-mailadres'), { target: { value: 'joris@example.com' } });
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Stuur code' })); });
      for (let i = 0; i < 2; i++) {
        for (let t = 0; t < 61; t++) await act(async () => { vi.advanceTimersByTime(1_000); });
        await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Stuur een nieuwe code' })); });
      }
      await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/Komt er niets\? Controleer of het adres klopt: joris@example.com/));
    } finally { vi.useRealTimers(); }
  });
});

describe('testpoort op het welkomstscherm', () => {
  const SNAP = { fase: 'geen-huishouden', fout: null, account: { id: 'u1', email: 'pia@example.com' }, huishouden: null, huishoudens: [], uitnodigingen: [],
    magHuishouden: false, adreswijziging: null, toestand: null } as Momentopname;
  it('mag geen eigen huishouden: uitleg in plaats van het formulier, en het adres waarmee je bent ingelogd', () => {
    render(<Welkom sessie={nepSessie()} snap={SNAP} opUitnodiging={vi.fn()} opBekijk={vi.fn()} />);
    expect(screen.getByRole('heading', { name: 'Besloten test' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Huishouden aanmaken' })).toBeNull();
    expect(screen.getByText('pia@example.com')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Uitloggen en ander adres gebruiken' })).toBeTruthy();
  });
  it('mag wel: het formulier, met de naam uit het profiel voorgesteld', async () => {
    render(<Welkom sessie={nepSessie({ leesNaam: async () => 'Pia' })} snap={{ ...SNAP, magHuishouden: true }} opUitnodiging={vi.fn()} opBekijk={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Huishouden aanmaken' })).toBeTruthy();
    await waitFor(() => expect((screen.getByLabelText('Jouw naam') as HTMLInputElement).value).toBe('Pia'));
  });
});

describe('build en contract', () => {
  it('CSP: Turnstile alleen als er een sitekey is (script en frame); anders geen frames', () => {
    const met = headersBestand('abcdefghijklmnopqrst', true), zonder = headersBestand('abcdefghijklmnopqrst');
    expect(met).toMatch(/script-src 'self' https:\/\/challenges\.cloudflare\.com/);
    expect(met).toMatch(/frame-src https:\/\/challenges\.cloudflare\.com/);
    expect(zonder).toMatch(/frame-src 'none'/);
    expect(zonder).not.toMatch(/challenges\.cloudflare\.com/);
  });
  it('een ongeldige sitekey wordt geweigerd', () => {
    const env = { VITE_SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co', VITE_SUPABASE_ANON_KEY: 'x' };
    expect(stagingFouten({ ...env, VITE_TURNSTILE_SITEKEY: 'onzin' })).toEqual(['VITE_TURNSTILE_SITEKEY is geen sitekey van Cloudflare Turnstile (begint met 0x).']);
    expect(stagingFouten({ ...env, VITE_TURNSTILE_SITEKEY: '0x4AAAAAAAAbcdefghij' })).toEqual([]);
  });
  it('elke TPA/TPB-code uit de migraties en elke TPK-code uit controleer-code heeft een tekst in de app', () => {
    const map = path.resolve(__dirname, '../../supabase');
    const sql = readdirSync(path.join(map, 'migrations')).filter(f => f.endsWith('.sql')).map(f => readFileSync(path.join(map, 'migrations', f), 'utf8')).join('\n');
    const db = new Set([...sql.matchAll(/errcode = '(TP[AB]\d\d)'/g)].map(m => m[1]));
    expect([...db].sort()).toEqual(Object.keys(TOEGANG_TEKSTEN).sort());
    const fn = readFileSync(path.join(map, 'functions/controleer-code/index.ts'), 'utf8');
    for (const [, code] of fn.matchAll(/code: '(TPK\d\d)'/g)) expect(CODE_TEKSTEN[code], code).toBeTruthy();
  });
});
