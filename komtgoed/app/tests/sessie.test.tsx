// Herstelronde 1, bevinding 3: uitloggen mag niet worden teruggedraaid door een oud async antwoord.
// Een nep-client met handbediende ("uitgestelde") antwoorden: elke stap van herstellen en inloggen kan zo
// vóór of na uitloggen of een ander account terugkomen. Na afloop moet de toestand altijd de laatste
// handeling van de gebruiker volgen: na uitloggen geen actieve fase, geen draaiende sync en geen
// inlogsessie in de client.
import { StrictMode } from 'react';
import { act, render } from '@testing-library/react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Sync, Toestand } from '../../sync/thuisplanner-sync.js';
import { Sessie, useSessie, type LokaleConfig } from '../src/lib/lokaal/sessie';

const CONFIG: LokaleConfig = { url: 'http://127.0.0.1:54321', anonKey: 'x', accounts: [] };

interface Uitgesteld<T = unknown> { naam: string; los: (v: T) => void; belofte: Promise<T> }

function nepOmgeving({ ingelogd = null as string | null, stop = 'direct' as 'direct' | 'wacht' | 'fout' } = {}) {
  const wachtrij: Uitgesteld[] = [];
  const wacht = <T,>(naam: string): Promise<T> => {
    let los!: (v: T) => void;
    const belofte = new Promise<T>(r => { los = r; });
    wachtrij.push({ naam, los: los as (v: unknown) => void, belofte });
    return belofte;
  };
  // De inlogsessie van de client (zoals supabase-js die in sessionStorage bewaart).
  const client = { sessie: ingelogd };
  const syncs: { huishouden: string; gestart: boolean; gestopt: boolean }[] = [];
  const auth = {
    getSession: async () => { await wacht('getSession'); return { data: { session: client.sessie ? { user: { id: client.sessie, email: client.sessie } } : null } }; },
    signInWithPassword: async ({ email }: { email: string }) => { await wacht('signIn:' + email); client.sessie = email; return { data: { user: { id: email, email } }, error: null }; },
    signOut: async () => { await wacht('signOut'); client.sessie = null; return { error: null }; },
  };
  const sb = {
    auth,
    rpc: async () => { await wacht('memberships'); return { data: client.sessie ? [{ household_id: 'h-' + client.sessie }] : [], error: null }; },
    from: () => ({ select: () => ({ eq: (_k: string, h: string) => ({ maybeSingle: async () => { await wacht('huishouden'); return { data: { name: 'Naam ' + h } }; } }) }) }),
  } as unknown as SupabaseClient;
  const maakSync = ((o: { huishoudenId: string }) => {
    const s = { huishouden: o.huishoudenId, gestart: false, gestopt: false };
    syncs.push(s);
    return {
      start: async () => { await wacht('syncStart'); s.gestart = true; },
      // De sync-module stopt synchroon (geen verzoeken meer); alleen het afmelden van het Realtime-kanaal
      // kan duren. 'wacht': dat afmelden hangt tot de test het loslaat; 'fout': het afmelden mislukt.
      stop: async () => {
        s.gestopt = true;
        if (stop === 'wacht') await wacht('syncStop');
        if (stop === 'fout') throw new Error('kanaal afmelden mislukt');
      },
      toestand: { status: 'verbonden', afspraken: [], taken: [], boodschappen: [], leden: [], uitzonderingen: [], lid: null } as unknown as Toestand,
      acties: {}, openstaand: [],
    } as unknown as Sync;
  }) as unknown as typeof import('../../sync/thuisplanner-sync.js').maakSync;
  const sessie = new Sessie(CONFIG, { maakClient: () => sb, maakSync });
  const stap = async () => { await act(async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); }); };
  // Laat het oudste openstaande antwoord met deze naam (of het oudste überhaupt) terugkomen.
  const geef = async (naam?: string) => {
    await stap();
    const i = naam ? wachtrij.findIndex(w => w.naam === naam) : 0;
    if (i < 0) throw new Error('Geen openstaand antwoord: ' + naam + ' (wel: ' + wachtrij.map(w => w.naam).join(', ') + ')');
    const [w] = wachtrij.splice(i, 1);
    w.los(undefined);
    await stap();
  };
  const alles = async () => { for (let n = 0; n < 50 && (await stap(), wachtrij.length); n++) await geef(); };
  // Alles laten terugkomen behalve de hangende kanaalafmeldingen ('syncStop').
  const allesBehalveStop = async () => {
    for (let n = 0; n < 50; n++) {
      await stap();
      const w = wachtrij.find(x => x.naam !== 'syncStop');
      if (!w) return;
      await geef(w.naam);
    }
  };
  const draaiend = () => syncs.filter(s => !s.gestopt);
  return { sessie, client, syncs, draaiend, wachtrij, geef, alles, allesBehalveStop, stap };
}

// De stappen van inloggen tot een draaiende sync, in volgorde.
const INLOGSTAPPEN = ['signIn:eva', 'memberships', 'huishouden', 'syncStart'];

describe('uitloggen terwijl inloggen nog loopt: elk moment', () => {
  for (let k = 0; k <= INLOGSTAPPEN.length; k++) {
    it(`uitloggen na ${k} van de ${INLOGSTAPPEN.length} inlogstappen: uitgelogd, geen sync, geen inlogsessie`, async () => {
      const o = nepOmgeving();
      const inlog = o.sessie.inloggen('eva', 'x');
      for (let i = 0; i < k; i++) await o.geef(INLOGSTAPPEN[i]);
      const uit = o.sessie.uitloggen();
      await o.alles();
      await act(async () => { await Promise.all([inlog, uit]); });
      expect(o.sessie.momentopname()).toMatchObject({ fase: 'uitgelogd', account: null, huishouden: null, toestand: null });
      expect(o.draaiend()).toEqual([]);
      expect(o.client.sessie).toBeNull();
    });
  }
});

describe('uitloggen terwijl het herstel bij het laden nog loopt', () => {
  const STAPPEN = ['getSession', 'memberships', 'huishouden', 'syncStart'];
  for (let k = 0; k <= STAPPEN.length; k++) {
    it(`uitloggen na ${k} herstelstappen`, async () => {
      const o = nepOmgeving({ ingelogd: 'eva' });
      const herstel = o.sessie.herstel();
      for (let i = 0; i < k; i++) await o.geef(STAPPEN[i]);
      const uit = o.sessie.uitloggen();
      await o.alles();
      await act(async () => { await Promise.all([herstel, uit]); });
      expect(o.sessie.momentopname().fase).toBe('uitgelogd');
      expect(o.draaiend()).toEqual([]);
      expect(o.client.sessie).toBeNull();
    });
  }
});

describe('snel wisselen van account', () => {
  it('inloggen als Eva, meteen daarna als Thomas, antwoorden in elke volgorde: alleen Thomas is actief', async () => {
    for (const volgorde of [['signIn:eva', 'signIn:thomas'], ['signIn:thomas', 'signIn:eva']]) {
      const o = nepOmgeving();
      const a = o.sessie.inloggen('eva', 'x');
      const b = o.sessie.inloggen('thomas', 'x');
      // De client voert de inlogaanroepen na elkaar uit; Thomas' aanvraag wacht op die van Eva.
      for (const n of volgorde) { if (o.wachtrij.some(w => w.naam === n)) await o.geef(n); }
      await o.alles();
      await act(async () => { await Promise.all([a, b]); });
      expect(o.sessie.momentopname()).toMatchObject({ fase: 'actief', account: { id: 'thomas' }, huishouden: { id: 'h-thomas' } });
      expect(o.draaiend().map(s => s.huishouden)).toEqual(['h-thomas']);
      expect(o.client.sessie).toBe('thomas');
    }
  });

  it('Eva actief, dan Thomas: de sync van Eva stopt, die van Thomas start; daarna uitloggen stopt alles', async () => {
    const o = nepOmgeving();
    const a = o.sessie.inloggen('eva', 'x');
    await o.alles(); await act(async () => { await a; });
    expect(o.draaiend().map(s => s.huishouden)).toEqual(['h-eva']);
    const b = o.sessie.inloggen('thomas', 'x');
    await o.alles(); await act(async () => { await b; });
    expect(o.draaiend().map(s => s.huishouden)).toEqual(['h-thomas']);
    const u = o.sessie.uitloggen();
    await o.alles(); await act(async () => { await u; });
    expect(o.draaiend()).toEqual([]);
    expect(o.sessie.momentopname().fase).toBe('uitgelogd');
  });

  it('uitloggen en meteen weer inloggen als Thomas, terwijl de inlog van Eva nog hangt: Thomas actief', async () => {
    const o = nepOmgeving();
    const a = o.sessie.inloggen('eva', 'x');
    const u = o.sessie.uitloggen();
    const b = o.sessie.inloggen('thomas', 'x');
    await o.alles();
    await act(async () => { await Promise.all([a, u, b]); });
    expect(o.sessie.momentopname()).toMatchObject({ fase: 'actief', account: { id: 'thomas' } });
    expect(o.draaiend().map(s => s.huishouden)).toEqual(['h-thomas']);
    expect(o.client.sessie).toBe('thomas');
  });
});

describe('React StrictMode', () => {
  function Kijker({ sessie }: { sessie: Sessie }) {
    const s = useSessie(sessie);
    return <p>{s.fase}</p>;
  }

  it('dubbel mounten en herstellen: één getSession, één sync; unmount stopt niets; uitloggen tijdens herstel wint', async () => {
    const o = nepOmgeving({ ingelogd: 'eva' });
    const r = render(<StrictMode><Kijker sessie={o.sessie} /></StrictMode>);
    const h1 = o.sessie.herstel(), h2 = o.sessie.herstel();
    expect(h1).toBe(h2);
    await o.alles(); await act(async () => { await h1; });
    expect(r.container).toHaveTextContent('actief');
    expect(o.wachtrij).toEqual([]);
    expect(o.syncs.length).toBe(1);
    r.unmount();
    expect(o.draaiend().length).toBe(1);

    // Tweede pagina: uitloggen terwijl het (dubbele) herstel nog loopt.
    const p = nepOmgeving({ ingelogd: 'eva' });
    const r2 = render(<StrictMode><Kijker sessie={p.sessie} /></StrictMode>);
    const h = p.sessie.herstel(); void p.sessie.herstel();
    await p.geef('getSession');
    const u = p.sessie.uitloggen();
    await p.alles(); await act(async () => { await Promise.all([h, u]); });
    expect(r2.container).toHaveTextContent('uitgelogd');
    expect(p.draaiend()).toEqual([]);
  });
});

// Herstelronde 2 (review van b867346): een uitlogactie wiens kanaalafmelding hangt, mag een latere inlog niet
// meer ongedaan maken. Gecontroleerd op twee plekken: wat React toont (momentopname) en welke inlogsessie de
// Supabase-client werkelijk heeft (client.sessie, het token waarmee verzoeken gaan).
describe('uitloggen met een hangende kanaalafmelding, daarna een nieuwe inlog', () => {
  async function evaActief(o: ReturnType<typeof nepOmgeving>) {
    const a = o.sessie.inloggen('eva', 'x');
    await o.allesBehalveStop(); await act(async () => { await a; });
    expect(o.sessie.momentopname()).toMatchObject({ fase: 'actief', account: { id: 'eva' } });
  }
  const verwachtThomas = (o: ReturnType<typeof nepOmgeving>) => {
    expect(o.sessie.momentopname()).toMatchObject({ fase: 'actief', account: { id: 'thomas' }, huishouden: { id: 'h-thomas' } });
    expect(o.client.sessie).toBe('thomas');
    expect(o.draaiend().map(s => s.huishouden)).toEqual(['h-thomas']);
  };

  it('reproductie uit de review: A uit (stop hangt), B in en actief, dan pas eindigt de stop van A: B blijft ingelogd', async () => {
    const o = nepOmgeving({ stop: 'wacht' });
    await evaActief(o);
    const uit = o.sessie.uitloggen();
    await o.stap();
    expect(o.sessie.momentopname().fase).toBe('uitgelogd');   // het scherm toont meteen de inlogpagina
    const b = o.sessie.inloggen('thomas', 'x');
    await o.allesBehalveStop();
    await act(async () => { await b; });
    verwachtThomas(o);
    // Nu pas eindigt het afmelden van het kanaal van Eva.
    await o.geef('syncStop');
    await o.alles();
    await act(async () => { await uit; });
    verwachtThomas(o);
  });

  const STAPPEN_B = ['signOut', 'signIn:thomas', 'memberships', 'huishouden', 'syncStart'];
  for (let k = 0; k <= STAPPEN_B.length; k++) {
    it(`de stop van A eindigt na ${k} van de ${STAPPEN_B.length} stappen van uitloggen en inloggen als B`, async () => {
      const o = nepOmgeving({ stop: 'wacht' });
      await evaActief(o);
      const uit = o.sessie.uitloggen();
      const b = o.sessie.inloggen('thomas', 'x');
      for (let i = 0; i < k; i++) await o.geef(STAPPEN_B[i]);
      await o.geef('syncStop');
      await o.alles();
      await act(async () => { await Promise.all([uit, b]); });
      verwachtThomas(o);
    });
  }

  it('snel uit en weer in, twee keer (A → B → A), stops eindigen in omgekeerde volgorde: A actief met het token van A', async () => {
    const o = nepOmgeving({ stop: 'wacht' });
    await evaActief(o);
    const acties = [o.sessie.uitloggen(), o.sessie.inloggen('thomas', 'x')];
    await o.allesBehalveStop();
    acties.push(o.sessie.uitloggen(), o.sessie.inloggen('eva', 'x'));
    await o.allesBehalveStop();
    // Hangende afmeldingen pas nu, de nieuwste eerst.
    for (const i of o.wachtrij.map((w, i) => (w.naam === 'syncStop' ? i : -1)).filter(i => i >= 0).reverse()) {
      const [w] = o.wachtrij.splice(i, 1); w.los(undefined); await o.stap();
    }
    await o.alles();
    await act(async () => { await Promise.all(acties); });
    expect(o.sessie.momentopname()).toMatchObject({ fase: 'actief', account: { id: 'eva' } });
    expect(o.client.sessie).toBe('eva');
    expect(o.draaiend().map(s => s.huishouden)).toEqual(['h-eva']);
  });

  it('uitloggen terwijl de stop hangt en die nooit eindigt: het token is toch weg en een nieuwe inlog loopt niet vast', async () => {
    const o = nepOmgeving({ stop: 'wacht' });
    await evaActief(o);
    void o.sessie.uitloggen();
    await o.allesBehalveStop();
    expect(o.client.sessie).toBeNull();
    const b = o.sessie.inloggen('thomas', 'x');
    await o.allesBehalveStop();
    await act(async () => { await b; });
    verwachtThomas(o);
    expect(o.wachtrij.map(w => w.naam)).toEqual(['syncStop']);   // hangt nog steeds; niets wacht erop
  });

  it('direct van A naar B wisselen (zonder uitloggen) terwijl de stop van A hangt: B wordt toch actief', async () => {
    const o = nepOmgeving({ stop: 'wacht' });
    await evaActief(o);
    const b = o.sessie.inloggen('thomas', 'x');
    await o.allesBehalveStop();
    await act(async () => { await b; });
    verwachtThomas(o);
    await o.alles();
    verwachtThomas(o);
  });

  it('een fout bij het stoppen blokkeert de auth-wachtrij niet: uitgelogd, token weg, daarna gewoon inloggen', async () => {
    const o = nepOmgeving({ stop: 'fout' });
    await evaActief(o);
    const uit = o.sessie.uitloggen();
    await o.alles();
    await act(async () => { await uit; });
    expect(o.sessie.momentopname().fase).toBe('uitgelogd');
    expect(o.client.sessie).toBeNull();
    const b = o.sessie.inloggen('thomas', 'x');
    await o.alles();
    await act(async () => { await b; });
    verwachtThomas(o);
  });
});
