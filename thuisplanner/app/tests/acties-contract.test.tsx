// KG-5E licht: één datapad. Dezelfde handelingen (lib/acties.ts) op de demo (lib/store.ts) en op de echte opslag
// (lib/lokaal/staat.ts via de sync-module en een LOKALE Supabase-stack), met dezelfde verwachte uitkomst.
//
// - Altijd: beide kanten leveren precies dezelfde handelingen, online zonder demo-extra's en zonder demovelden.
// - Alleen met KG_CONTRACT=1 en een lokale stack (KG_CONTRACT_API_URL, _ANON_KEY, _SERVICE_ROLE_KEY): het gedrag online.
//   Zonder die variabelen draait het gedrag alleen op de demo, en meldt de test dat de online kant is overgeslagen.
import { act, renderHook } from '@testing-library/react';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { maakSync } from '../../sync/thuisplanner-sync.js';
import { useDemoStaat } from '../src/lib/store';
import { useLokaleStaat } from '../src/lib/lokaal/staat';
import type { Momentopname, Sessie } from '../src/lib/lokaal/sessie';
import type { Acties, Staat } from '../src/lib/acties';
import type { Afspraak, Boodschap, Huishouden, Item, Taak } from '../src/lib/types';

/** Het contract, als lijst: elke handeling uit acties.ts. Een nieuwe handeling hoort hier en aan beide kanten. */
const ACTIES: (keyof Acties)[] = [
  'toevoegen', 'bijwerken', 'wissel', 'verwijder', 'voegBoodschappenToe', 'boodschapLater', 'wijzigVoorkomen', 'verwijderVoorkomen',
  'verwijderReeks', 'ongedaan', 'wegklikken', 'meld', 'meldingWeg', 'vakantieToevoegen', 'vakantieBijwerken', 'vakantieVerwijderen',
  'pakitemToevoegen', 'pakitemWissel', 'pakitemBijwerken', 'pakitemVerwijderen', 'paklijstOvernemen', 'paklijstToevoegen',
  'paklijstHernoemen', 'paklijstVerwijderen', 'vinkjesOpnieuw', 'boodschapOntkoppelen', 'vakantieOpenen', 'vakantieSluiten',
];
const DEMO_EXTRA = ['kiesScenario', 'vervangAlles'];
const LOKAAL_EXTRA = ['opnieuwProberen', 'herinvoeren', 'vergeten', 'syncMeldingWeg', 'keuze', 'sluitKeuze'];
const VANDAAG = '2026-11-10';
const HH_DEMO: Huishouden = { naam: 'Demo', ik: 'm-eva', leden: [{ id: 'm-eva', naam: 'Eva', soort: 'volwassene', kleur: 'x', heeftAccount: true }] };

const leegToestand = { status: 'verbonden', melding: null, laatstOpgehaald: null, opslagDuurzaam: true, lid: null, leden: [], boodschappen: [], taken: [],
  afspraken: [], uitzonderingen: [], vakanties: [], pakitems: [], paklijsten: [], vakantieKoppelingen: [] };

describe('contract: beide kanten leveren dezelfde handelingen', () => {
  it('de demo: het contract plus alleen de demo-extra\'s', () => {
    const { result } = renderHook(() => useDemoStaat(VANDAAG));
    const { staat, ...rest } = result.current;
    expect(Object.keys(rest).sort()).toEqual([...ACTIES, ...DEMO_EXTRA].sort());
    expect(staat).toHaveProperty('scenario');   // alleen de demo heeft voorbeelddagen
  });
  it('online: het contract plus alleen de syncopdrachten; geen scenario, geen "vorige", geen demo-extra\'s', () => {
    const sessie = { acties: {}, syncObject: { toestand: leegToestand } } as unknown as Sessie;
    const { result } = renderHook(() => useLokaleStaat(sessie, { toestand: leegToestand } as unknown as Momentopname, VANDAAG, HH_DEMO));
    const { staat, ...rest } = result.current;
    expect(Object.keys(rest).sort()).toEqual([...ACTIES, ...LOKAAL_EXTRA].sort());
    expect(Object.keys(staat).sort()).toEqual(['items', 'koppelingen', 'melding', 'pakitems', 'paklijsten', 'vakanties', 'weggeklikt']);
    for (const k of DEMO_EXTRA) expect(rest).not.toHaveProperty(k);
  });
});

// ---- Het gedrag: één scenario, twee kanten ----

interface Kant {
  naam: string;
  ik: string;
  staat: () => Staat;
  acties: () => Acties;
  /** Wacht tot de staat aan de voorwaarde voldoet (demo: meteen; online: tot de server het bevestigt). */
  wachtOp: (wat: string, f: (s: Staat) => boolean) => Promise<void>;
}
const taakMet = (s: Staat, titel: string) => s.items.find((i): i is Taak => i.soort === 'taak' && i.titel === titel);
const boodschapMet = (s: Staat, naam: string) => s.items.find((i): i is Boodschap => i.soort === 'boodschap' && i.naam === naam);

async function contract(k: Kant, run: string) {
  const doe = async (f: (a: Acties) => unknown) => { await act(async () => { await f(k.acties()); }); };
  const taak = `Contracttaak ${run}`, taak2 = `Contracttaak ${run} (aangepast)`, melk = `Contractmelk ${run}`;

  // Een taak: toevoegen, afvinken, aanpassen, verwijderen.
  await doe(a => a.toevoegen([{ id: 't-contract', soort: 'taak', titel: taak, datum: null, voor: null, klaar: false, klaarOp: null } as Item], 'Toegevoegd'));
  await k.wachtOp('taak toegevoegd', s => !!taakMet(s, taak));
  const t = taakMet(k.staat(), taak)!;
  expect(t.klaar).toBe(false);
  await doe(a => a.wissel(t.id));
  await k.wachtOp('taak afgevinkt', s => taakMet(s, taak)?.klaar === true);
  await doe(a => a.bijwerken({ ...taakMet(k.staat(), taak)!, titel: taak2 }));
  await k.wachtOp('taak aangepast', s => !!taakMet(s, taak2) && !taakMet(s, taak));
  await doe(a => a.verwijder([taakMet(k.staat(), taak2)!.id], 'Verwijderd'));
  await k.wachtOp('taak verwijderd', s => !taakMet(s, taak2));

  // Een afspraak.
  const afspraak = { id: 'a-contract', soort: 'afspraak', datum: '2026-11-20', start: '10:00', eind: '11:00', wie: [], eigenaar: k.ik,
    zichtbaarheid: 'huishouden', titel: `Contractafspraak ${run}` } as Afspraak;
  await doe(a => a.toevoegen([afspraak], 'Toegevoegd'));
  await k.wachtOp('afspraak toegevoegd', s => s.items.some(i => i.soort === 'afspraak' && i.titel === afspraak.titel && i.datum === '2026-11-20'));

  // Een boodschap, naar "Later nodig", en ongedaan maken: de melding belooft het, en het werkt (aan beide kanten).
  await doe(a => a.voegBoodschappenToe([melk]));
  await k.wachtOp('boodschap toegevoegd', s => !!boodschapMet(s, melk) && !boodschapMet(s, melk)!.later);
  await doe(a => a.boodschapLater(boodschapMet(k.staat(), melk)!, true));
  await k.wachtOp('boodschap later', s => boodschapMet(s, melk)?.later === true && s.melding?.ongedaan === true);
  await doe(a => a.ongedaan!());
  await k.wachtOp('later ongedaan', s => boodschapMet(s, melk)?.later !== true);

  // Een vakantie met een pakitem; verwijderen en ongedaan maken.
  const naam = `Contractvakantie ${run}`;
  let vid: string | null = null;
  await doe(async a => { vid = await a.vakantieToevoegen({ naam, vertrek: '2026-12-20', terug: '2026-12-27' }); });
  expect(vid).toBeTruthy();
  await k.wachtOp('vakantie toegevoegd', s => s.vakanties.some(v => v.id === vid && v.naam === naam));
  await doe(a => a.pakitemToevoegen(vid!, k.ik, 'Zonnebrand'));
  await k.wachtOp('pakitem toegevoegd', s => s.pakitems.some(p => p.vakantieId === vid && p.naam === 'Zonnebrand'));
  await doe(a => a.pakitemWissel(k.staat().pakitems.find(p => p.vakantieId === vid && p.naam === 'Zonnebrand')!));
  await k.wachtOp('pakitem ingepakt', s => s.pakitems.some(p => p.vakantieId === vid && p.naam === 'Zonnebrand' && p.ingepakt));
  await doe(a => a.vakantieVerwijderen(k.staat().vakanties.find(v => v.id === vid)!));
  await k.wachtOp('vakantie verwijderd', s => !s.vakanties.some(v => v.id === vid) && s.melding?.ongedaan === true);
  await doe(a => a.ongedaan!());
  await k.wachtOp('vakantie teruggezet', s => s.vakanties.some(v => v.id === vid && v.naam === naam));
}

describe('contract: hetzelfde gedrag', () => {
  it('de demo', async () => {
    const { result } = renderHook(() => useDemoStaat(VANDAAG));
    await contract({
      naam: 'demo', ik: 'm-eva', staat: () => result.current.staat, acties: () => result.current,
      wachtOp: async (wat, f) => { expect(f(result.current.staat), wat).toBe(true); },
    }, 'demo');
  });

  const { KG_CONTRACT, KG_CONTRACT_API_URL: URL, KG_CONTRACT_ANON_KEY: ANON, KG_CONTRACT_SERVICE_ROLE_KEY: SERVICE } = process.env;
  const online = KG_CONTRACT === '1' && !!URL && !!ANON && !!SERVICE;
  if (online && !/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(URL!)) throw new Error('Weigering: het contract draait alleen tegen een lokale stack');

  describe.skipIf(!online)('online (lokale Supabase-stack, KG_CONTRACT=1)', () => {
    const run = Math.random().toString(36).slice(2, 10);
    const opties = { auth: { persistSession: false, autoRefreshToken: false } };
    let admin: SupabaseClient, client: SupabaseClient, gebruiker = '', huishouden = '';
    let sync: ReturnType<typeof maakSync>;

    beforeAll(async () => {
      admin = createClient(URL!, SERVICE!, opties);
      const email = `contract-${run}@test.invalid`, wachtwoord = 'Kc-' + run + run;
      const u = await admin.auth.admin.createUser({ email, password: wachtwoord, email_confirm: true });
      if (u.error) throw u.error;
      gebruiker = u.data.user.id;
      client = createClient(URL!, ANON!, opties);
      const inlog = await client.auth.signInWithPassword({ email, password: wachtwoord });
      if (inlog.error) throw inlog.error;
      const h = await client.rpc('create_household', { p_name: 'Contract ' + run, p_display_name: 'Eva' });
      if (h.error) throw h.error;
      huishouden = h.data as string;
      sync = maakSync({ supabase: client, huishoudenId: huishouden, vangnetMs: 60000 });
      await sync.start();
    }, 30_000);
    afterAll(async () => {
      await sync?.stop();
      if (huishouden) await admin.from('households').delete().eq('id', huishouden);
      if (gebruiker) await admin.auth.admin.deleteUser(gebruiker);
    });

    it('de echte opslag', async () => {
      const ik = ((await client.rpc('my_memberships')).data as { household_id: string; member_id: string }[]).find(m => m.household_id === huishouden)!.member_id;
      const hh: Huishouden = { naam: 'Contract', ik, leden: [{ id: ik, naam: 'Eva', soort: 'volwassene', kleur: 'x', heeftAccount: true }] };
      const sessie = { acties: sync.acties, syncObject: sync } as unknown as Sessie;
      const snap = () => ({ toestand: { ...sync.toestand } }) as unknown as Momentopname;
      const { result, rerender } = renderHook(({ s }) => useLokaleStaat(sessie, s, VANDAAG, hh), { initialProps: { s: snap() } });
      await contract({
        naam: 'online', ik, staat: () => result.current.staat, acties: () => result.current,
        wachtOp: async (wat, f) => {
          const eind = Date.now() + 15_000;
          for (;;) {
            await act(async () => { await sync.vernieuw(); rerender({ s: snap() }); });
            if (f(result.current.staat)) return;
            if (Date.now() > eind) throw new Error('Niet binnen 15 s: ' + wat);
            await act(async () => { await new Promise(r => setTimeout(r, 200)); });
          }
        },
      }, run);
    }, 120_000);
  });
});
