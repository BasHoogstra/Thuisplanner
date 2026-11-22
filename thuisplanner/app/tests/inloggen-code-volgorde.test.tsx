// Herstelronde (review): een vertraagd antwoord van controleer-code mag na uitloggen of na een nieuwere inlogactie nooit
// meer een sessie herstellen. De antwoorden komen hier bewust in omgekeerde volgorde binnen.
import type { SupabaseClient } from '@supabase/supabase-js';
import { Sessie, type LokaleConfig } from '../src/lib/lokaal/sessie';
import { leesToestel } from '../src/lib/lokaal/code';

const CONFIG: LokaleConfig = { omgeving: 'staging', url: 'https://abcdefghijklmnopqrst.supabase.co', anonKey: 'anon', accounts: [] };
const nepSync = (() => ({ toestand: { status: 'verbonden', leden: [] }, start: async () => {}, stop: async () => {} })) as never;
const GEBRUIKERS: Record<string, { id: string; email: string }> = {
  ['a'.repeat(56)]: { id: 'u-eva', email: 'eva@example.com' },
  ['b'.repeat(56)]: { id: 'u-thomas', email: 'thomas@example.com' },
};

function nepClient() {
  const aanroepen: { naam: string; args?: unknown }[] = [];
  const client = {
    auth: {
      getSession: async () => ({ data: { session: null }, error: null }),
      verifyOtp: async (args: { token_hash: string }) => {
        aanroepen.push({ naam: 'verifyOtp', args });
        return { data: { user: GEBRUIKERS[args.token_hash] }, error: null };
      },
      signInWithPassword: async ({ email }: { email: string }) => {
        aanroepen.push({ naam: 'signInWithPassword', args: email });
        return { data: { user: { id: 'u-wachtwoord', email } }, error: null };
      },
      signOut: async (args: unknown) => { aanroepen.push({ naam: 'signOut', args }); return { error: null }; },
    },
    rpc: async (naam: string) => {
      if (naam === 'mijn_toegang') return { data: 'ok', error: null };
      if (naam === 'my_memberships') return { data: [{ household_id: 'h1', role: 'admin' }], error: null };
      return { data: [], error: null };
    },
    from: () => {
      const q: Record<string, unknown> = {};
      const keten = () => q;
      Object.assign(q, { select: keten, eq: keten, in: keten, maybeSingle: async () => ({ data: { name: 'Familie Test' }, error: null }) });
      return q;
    },
  } as unknown as SupabaseClient;
  return { client, aanroepen };
}

/** Een nagebootste controleer-code waarvan de test zelf bepaalt wanneer elk antwoord binnenkomt. */
function uitgesteldeServer() {
  const open: { adres: string; antwoord: (tokenHash: string) => void }[] = [];
  const fetchNep = vi.fn((_url: string, init: { body: string }) => new Promise<Response>(ok => {
    const adres = JSON.parse(init.body).email as string;
    open.push({ adres, antwoord: tokenHash => ok(new Response(JSON.stringify({ token_hash: tokenHash, type: 'email', toestel: 'c'.repeat(64) }), { status: 200 })) });
  }));
  return { open, fetchNep };
}

const rust = () => new Promise(ok => setTimeout(ok, 0));
let echt: typeof fetch;
beforeEach(() => { localStorage.clear(); sessionStorage.clear(); echt = globalThis.fetch; });
afterEach(() => { globalThis.fetch = echt; });

describe('vertraagd antwoord van controleer-code', () => {
  it('uitloggen terwijl de controle loopt; daarna komt een goede code binnen: geen sessie, geen verifyOtp, geen toestel', async () => {
    const n = nepClient();
    const srv = uitgesteldeServer();
    globalThis.fetch = srv.fetchNep as unknown as typeof fetch;
    const s = new Sessie(CONFIG, { maakClient: () => n.client, maakSync: nepSync });
    const controle = s.controleerCode('eva@example.com', '123456');
    await rust();
    await s.uitloggen();
    srv.open[0].antwoord('a'.repeat(56));   // het late antwoord
    await controle;
    await rust();
    expect(n.aanroepen.some(a => a.naam === 'verifyOtp')).toBe(false);
    expect(s.momentopname().fase).toBe('uitgelogd');
    expect(s.momentopname().account).toBeNull();
    expect(leesToestel('eva@example.com')).toBeNull();
  });

  it('twee pogingen, antwoorden in omgekeerde volgorde: alleen de nieuwste poging logt in', async () => {
    const n = nepClient();
    const srv = uitgesteldeServer();
    globalThis.fetch = srv.fetchNep as unknown as typeof fetch;
    const s = new Sessie(CONFIG, { maakClient: () => n.client, maakSync: nepSync });
    const eerste = s.controleerCode('eva@example.com', '111111');
    await rust();
    const tweede = s.controleerCode('thomas@example.com', '222222');
    await rust();
    srv.open[1].antwoord('b'.repeat(56));   // de nieuwste eerst
    await tweede;
    srv.open[0].antwoord('a'.repeat(56));   // daarna pas de oudere
    await eerste;
    await rust();
    expect(n.aanroepen.filter(a => a.naam === 'verifyOtp').map(a => (a.args as { token_hash: string }).token_hash)).toEqual(['b'.repeat(56)]);
    expect(s.momentopname().account?.email).toBe('thomas@example.com');
    expect(s.momentopname().fase).toBe('actief');
  });

  it('twee pogingen, antwoorden in de gewone volgorde: de oudere telt niet meer zodra de nieuwere begon', async () => {
    const n = nepClient();
    const srv = uitgesteldeServer();
    globalThis.fetch = srv.fetchNep as unknown as typeof fetch;
    const s = new Sessie(CONFIG, { maakClient: () => n.client, maakSync: nepSync });
    const eerste = s.controleerCode('eva@example.com', '111111');
    await rust();
    const tweede = s.controleerCode('thomas@example.com', '222222');
    await rust();
    srv.open[0].antwoord('a'.repeat(56));
    await eerste;
    srv.open[1].antwoord('b'.repeat(56));
    await tweede;
    await rust();
    expect(n.aanroepen.filter(a => a.naam === 'verifyOtp').map(a => (a.args as { token_hash: string }).token_hash)).toEqual(['b'.repeat(56)]);
    expect(s.momentopname().account?.email).toBe('thomas@example.com');
  });

  it('een nieuwere inlog met wachtwoord (lokaal) terwijl de code-controle hangt: het late antwoord verandert niets', async () => {
    const n = nepClient();
    const srv = uitgesteldeServer();
    globalThis.fetch = srv.fetchNep as unknown as typeof fetch;
    const s = new Sessie(CONFIG, { maakClient: () => n.client, maakSync: nepSync });
    const controle = s.controleerCode('eva@example.com', '123456');
    await rust();
    await s.inloggen('olaf@example.com', 'geheim');
    srv.open[0].antwoord('a'.repeat(56));
    await controle;
    await rust();
    expect(n.aanroepen.some(a => a.naam === 'verifyOtp')).toBe(false);
    expect(s.momentopname().account?.email).toBe('olaf@example.com');
  });
});
