// Lokale Supabase-modus: de levenscyclus van inloggen en synchroniseren, centraal en buiten React.
//
// Waarom buiten React: de sync-module houdt een kanaal, timers en onbevestigde opdrachten bij. Een
// onderdeel dat unmount (een ander scherm, React StrictMode die twee keer mount, een venster dat sluit)
// mag die niet stoppen of wissen. Daarom bestaat er per pagina precies één Sessie; React leest mee via
// useSyncExternalStore (zie useSessie). Alleen uitloggen of een ander account stopt de synchronisatie,
// en ook dan blijven onbevestigde opdrachten bewaard (zie docs/thuisplanner-app.md, P2).
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { useSyncExternalStore } from 'react';
import { maakSync, type Sync, type Toestand } from '../../../../sync/thuisplanner-sync.js';

export interface DemoAccount { naam: string; email: string }

export interface LokaleConfig {
  url: string;
  anonKey: string;
  /** Fictieve accounts om mee in te loggen (alleen lokaal). */
  accounts: DemoAccount[];
  /** Het lokale wachtwoord van die fictieve accounts (alleen lokaal; nooit een echt wachtwoord). */
  wachtwoord?: string;
}

// Alleen een Supabase op dit toestel of in het eigen netwerk (voor de test met twee telefoons). Nooit een
// online project: dat weigert de app al bij het opstarten.
const PRIVE_NET = /^(127\.\d+\.\d+\.\d+|localhost|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)$/;

export function isLokaalAdres(url: string): boolean {
  try {
    const u = new URL(url);
    return (u.protocol === 'http:' || u.protocol === 'https:') && PRIVE_NET.test(u.hostname);
  } catch {
    return false;
  }
}

/** De lokale configuratie uit de bouwomgeving (scripts/lokaal.mjs zet die), of null voor de demo-modus. */
export function lokaleConfig(env: Record<string, string | undefined> = import.meta.env): LokaleConfig | null {
  const url = env.VITE_SUPABASE_URL;
  const anonKey = env.VITE_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  if (!isLokaalAdres(url)) throw new Error('Weigering: de app praat alleen met een lokale Supabase (dit toestel of het eigen netwerk).');
  let accounts: DemoAccount[] = [];
  try { accounts = JSON.parse(env.VITE_DEMO_ACCOUNTS || '[]'); } catch { accounts = []; }
  return { url, anonKey, accounts, wachtwoord: env.VITE_DEMO_WACHTWOORD || undefined };
}

export type Fase = 'start' | 'uitgelogd' | 'bezig' | 'actief' | 'geen-huishouden';

export interface Momentopname {
  fase: Fase;
  fout: string | null;
  account: { id: string; email: string } | null;
  huishouden: { id: string; naam: string } | null;
  toestand: Toestand | null;
}

const LEEG: Momentopname = { fase: 'start', fout: null, account: null, huishouden: null, toestand: null };

// Opslag voor onbevestigde opdrachten (zie de sync-module). Weigert de browser opslag, dan null: de module
// meldt dat dan zelf (toestand.opslagDuurzaam = false).
function veiligeOpslag(): Storage | null {
  try { return window.localStorage; } catch { return null; }
}
// De inlogsessie per tabblad (sessionStorage): zo kun je op één computer in twee tabbladen met twee
// verschillende fictieve accounts werken. Op een telefoon is dat één tabblad.
function sessieOpslag(): Storage | undefined {
  try { return window.sessionStorage; } catch { return undefined; }
}

export interface Fabrieken {
  maakClient?: (url: string, key: string) => SupabaseClient;
  maakSync?: typeof maakSync;
}

export class Sessie {
  readonly client: SupabaseClient;
  private sync: Sync | null = null;
  private snap: Momentopname = LEEG;
  private readonly luisteraars = new Set<() => void>();
  private readonly maakSyncFn: typeof maakSync;
  private herstelBezig: Promise<void> | null = null;

  constructor(readonly config: LokaleConfig, f: Fabrieken = {}) {
    this.client = (f.maakClient ?? ((url, key) => createClient(url, key, {
      auth: { persistSession: true, autoRefreshToken: true, storage: sessieOpslag(), storageKey: 'thuisplanner-auth' },
    })))(config.url, config.anonKey);
    this.maakSyncFn = f.maakSync ?? maakSync;
  }

  abonneer = (f: () => void) => { this.luisteraars.add(f); return () => { this.luisteraars.delete(f); }; };
  momentopname = () => this.snap;
  /** De acties van de sync-module (alleen als er een actieve sessie is). */
  get acties() { return this.sync?.acties ?? null; }
  get syncObject() { return this.sync; }

  private zet(delta: Partial<Momentopname>) {
    this.snap = { ...this.snap, ...delta };
    for (const f of this.luisteraars) f();
  }

  /** Bij het laden van de pagina: is er in dit tabblad al iemand ingelogd? */
  // Eén keer per pagina, ook als React het effect twee keer uitvoert (StrictMode).
  herstel(): Promise<void> {
    this.herstelBezig ??= (async () => {
      if (this.snap.fase !== 'start') return;
      const { data } = await this.client.auth.getSession();
      if (data.session) await this.begin(data.session.user.id, data.session.user.email ?? '');
      else this.zet({ fase: 'uitgelogd' });
    })();
    return this.herstelBezig;
  }

  async inloggen(email: string, wachtwoord: string): Promise<void> {
    if (this.sync) await this.uitloggen();
    this.zet({ fase: 'bezig', fout: null });
    const { data, error } = await this.client.auth.signInWithPassword({ email, password: wachtwoord });
    if (error || !data.user) {
      this.zet({ fase: 'uitgelogd', fout: 'Inloggen lukte niet. Klopt het wachtwoord, en staat de lokale database klaar?' });
      return;
    }
    await this.begin(data.user.id, data.user.email ?? email);
  }

  private async begin(id: string, email: string) {
    this.zet({ fase: 'bezig', fout: null, account: { id, email } });
    const lid = await this.client.rpc('my_memberships');
    const eerste = (lid.data as { household_id: string }[] | null)?.[0];
    if (lid.error || !eerste) { this.zet({ fase: 'geen-huishouden' }); return; }
    const h = await this.client.from('households').select('name').eq('id', eerste.household_id).maybeSingle();
    const naam = (h.data as { name?: string } | null)?.name ?? 'Huishouden';
    // Eén sync per sessie. Een vorige (ander account of huishouden) stopt eerst.
    if (this.sync) await this.sync.stop();
    const sync = this.maakSyncFn({
      supabase: this.client,
      huishoudenId: eerste.household_id,
      opslag: veiligeOpslag(),
      opWijziging: toestand => { if (this.sync === sync) this.zet({ toestand }); },
    });
    this.sync = sync;
    this.zet({ fase: 'actief', huishouden: { id: eerste.household_id, naam }, toestand: sync.toestand });
    await sync.start();
  }

  /**
   * Uitloggen: synchronisatie stoppen (kanaal dicht, cache leeg) en de inlogsessie beëindigen.
   * Onbevestigde opdrachten blijven bewaard; wissen bij uitloggen (P2) vraagt eerst een productbesluit.
   */
  async uitloggen(): Promise<void> {
    const sync = this.sync;
    this.sync = null;
    if (sync) await sync.stop();
    await this.client.auth.signOut({ scope: 'local' });
    this.zet({ ...LEEG, fase: 'uitgelogd' });
  }
}

// Precies één sessie per pagina (niet per onderdeel).
let enige: Sessie | null = null;
export function sessieVoor(config: LokaleConfig): Sessie {
  if (!enige || enige.config.url !== config.url) enige = new Sessie(config);
  return enige;
}

export function useSessie(sessie: Sessie): Momentopname {
  return useSyncExternalStore(sessie.abonneer, sessie.momentopname, sessie.momentopname);
}
