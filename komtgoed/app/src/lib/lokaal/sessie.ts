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
import { foutTekst, TOEGANG_TEKSTEN } from '../foutcodes';
import { bewaarAanvraag, bewaarToestel, controleerBijServer, leesToestel, vergeetAanvraag, vergeetToestellen } from './code';
import { stagingFouten } from '../omgeving';

export { foutTekst };

export interface DemoAccount { naam: string; email: string }

export interface LokaleConfig {
  /** lokaal: dit toestel of het eigen netwerk; staging: precies één online testproject (zie ../omgeving.ts). */
  omgeving: 'lokaal' | 'staging';
  url: string;
  anonKey: string;
  /** Fictieve accounts om mee in te loggen (alleen lokaal). */
  accounts: DemoAccount[];
  /** Het lokale wachtwoord van die fictieve accounts (alleen lokaal; nooit een echt wachtwoord). */
  wachtwoord?: string;
  /** De sitekey van Cloudflare Turnstile (alleen online; lokaal staat de captcha uit). */
  turnstile?: string;
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
  return { omgeving: 'lokaal', url, anonKey, accounts, wachtwoord: env.VITE_DEMO_WACHTWOORD || undefined };
}

/**
 * De configuratie van deze build: null = demo, anders lokaal of staging. Staging alleen met VITE_OMGEVING=staging
 * (dat zet `npm run build:staging`) en precies één online project; zonder die markering blijft elke online URL
 * geweigerd, zoals altijd. Nooit stil terugvallen op de demo.
 */
export function appConfig(env: Record<string, string | undefined> = import.meta.env): LokaleConfig | null {
  const omgeving = env.VITE_OMGEVING;
  if (omgeving === 'staging') {
    const fouten = stagingFouten(env);
    if (fouten.length) throw new Error('Weigering (testomgeving): ' + fouten[0]);
    return { omgeving: 'staging', url: env.VITE_SUPABASE_URL as string, anonKey: env.VITE_SUPABASE_ANON_KEY as string, accounts: [],
      turnstile: env.VITE_TURNSTILE_SITEKEY || undefined };
  }
  if (omgeving && omgeving !== 'lokaal') throw new Error('Weigering: onbekende omgeving ' + omgeving + '.');
  return lokaleConfig(env);
}

/**
 * Hoe de Supabase-client de inlogsessie bewaart. Staging (een eigen telefoon): in localStorage, zodat je ingelogd
 * blijft als je de app of het tabblad sluit; uitloggen wist hem. Lokaal: per tabblad (sessionStorage), zodat je op
 * één computer twee fictieve accounts naast elkaar kunt testen. Nooit een sessie uit de URL overnemen: de app
 * heeft geen inloglinks, dus een token in de URL is altijd verdacht.
 */
export function authOpties(config: Pick<LokaleConfig, 'omgeving'>) {
  return {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
    storage: config.omgeving === 'staging' ? duurzameOpslag() : sessieOpslag(),
    storageKey: 'thuisplanner-auth',
  };
}

/**
 * verbinding: er is een opgeslagen inlogsessie, maar het netwerk is weg (of de server tijdelijk niet bereikbaar). Dan
 * nooit uitloggen: de app wacht en probeert het opnieuw. onderhoud: de noodstop van de beheerder staat aan.
 */
export type Fase = 'start' | 'uitgelogd' | 'bezig' | 'actief' | 'geen-huishouden' | 'verbinding' | 'onderhoud';

/** owner = eigenaar (maakte het huishouden), admin = beheerder, member = lid. Zie docs/thuisplanner-onboarding.md. */
export type Rol = 'owner' | 'admin' | 'member';
export interface Lidmaatschap { id: string; naam: string; rol: Rol }

/**
 * Een open uitnodiging voor het bevestigde e-mailadres van dit account (my_invites, KG-5H deel 1b). Zonder adres,
 * token of huishoud-id: alleen wat je nodig hebt om te beslissen.
 */
export interface UitnodigingVoorMij {
  id: string;
  huishouden: string;
  /** De naam van wie uitnodigde, in dat huishouden. */
  doorWie: string | null;
  /** Het bestaande profiel waaraan je gekoppeld wordt, of null (dan ontstaat een nieuw lid met jouw naam). */
  profiel: string | null;
  rol: 'admin' | 'member';
  geldigTot: string;
}

export interface Momentopname {
  fase: Fase;
  fout: string | null;
  account: { id: string; email: string } | null;
  huishouden: Lidmaatschap | null;
  /** Alle huishoudens van dit account (actieve lidmaatschappen). */
  huishoudens: Lidmaatschap[];
  /** Open uitnodigingen voor het bevestigde e-mailadres van dit account. */
  uitnodigingen: UitnodigingVoorMij[];
  /** Mag dit account een eigen huishouden aanmaken (testpoort G1)? null = onbekend. De database beslist. */
  magHuishouden: boolean | null;
  /** Een lopende adreswijziging: het nieuwe adres (beide adressen moeten met een code bevestigen). */
  adreswijziging: { nieuw: string } | null;
  toestand: Toestand | null;
}

/** Uitkomst van een beheeractie: gelukt, of een melding in gewone taal. */
export type Uitkomst<T = undefined> = { ok: true; waarde: T } | { ok: false; fout: string; code?: string };

const mislukt = (fout: { code?: string; message?: string } | null | undefined) =>
  ({ ok: false as const, fout: foutTekst(fout), ...(fout?.code ? { code: fout.code } : {}) });

const LEEG: Momentopname = { fase: 'start', fout: null, account: null, huishouden: null, huishoudens: [], uitnodigingen: [],
  magHuishouden: null, adreswijziging: null, toestand: null };

/** Een fout van supabase-js zonder antwoord van de server (geen netwerk, time-out): nooit een reden om uit te loggen. */
export const isNetwerkfout = (e: unknown) => {
  const f = e as { name?: string; status?: number } | null;
  return !!f && (f.name === 'AuthRetryableFetchError' || f.status === 0);
};

// De Nederlandse meldingen van de codelaag (functions/stuur-code) komen ongewijzigd door; Engelse meldingen van Supabase
// Auth zelf niet: die worden een eigen tekst per situatie.
const EIGEN_MELDING = /^(Inloggen met een code|Er zijn net al|Versturen lukt nu niet|Deze actie is niet beschikbaar)/;
function aanvraagFout(e: { status?: number; message?: string; code?: string; name?: string }): string {
  if (e.message && EIGEN_MELDING.test(e.message)) return e.message;
  if (isNetwerkfout(e)) return 'Geen verbinding. Controleer je internet en probeer het opnieuw.';
  if (e.status === 429) return 'Wacht even voordat je een nieuwe code aanvraagt.';
  if (e.code === 'captcha_failed') return 'Bevestig eerst dat je geen robot bent, en probeer het dan opnieuw.';
  return 'Een code aanvragen lukte nu niet. Controleer het adres en probeer het opnieuw.';
}

interface UitnodigingRij { id: string; household_name: string; invited_by: string | null; member_name: string | null; role: 'admin' | 'member'; expires_at: string }
const naarUitnodiging = (r: UitnodigingRij): UitnodigingVoorMij =>
  ({ id: r.id, huishouden: r.household_name, doorWie: r.invited_by, profiel: r.member_name, rol: r.role, geldigTot: r.expires_at });

// De laatst gekozen huishouden per account (alleen het id; geen inhoud).
const keuzeSleutel = (account: string) => 'thuisplanner-huishouden:' + account;
function leesKeuze(account: string): string | null {
  try { return window.localStorage.getItem(keuzeSleutel(account)); } catch { return null; }
}
function bewaarKeuze(account: string, huishouden: string) {
  try { window.localStorage.setItem(keuzeSleutel(account), huishouden); } catch { /* geen opslag: volgende keer het eerste */ }
}

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
function duurzameOpslag(): Storage | undefined {
  try { return window.localStorage; } catch { return undefined; }
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
  /**
   * Generatie: elke herstel-, inlog- of uitlogactie begint een nieuwe. Een antwoord dat binnenkomt nadat er
   * een nieuwere actie begon (bijvoorbeeld een trage inlog na uitloggen), verandert niets meer: geen fase,
   * geen account, geen sync.
   */
  private generatie = 0;
  /**
   * De Supabase-client heeft één inlogsessie. Aanroepen die die sessie veranderen (getSession, inloggen,
   * uitloggen) lopen daarom na elkaar, in de volgorde waarin ze gevraagd zijn: een trage inlog die pas na
   * "uitloggen" terugkomt, wordt daarna alsnog door dat uitloggen opgeruimd, en bij snel wisselen van
   * account houdt de client de sessie van het laatst gekozen account.
   */
  private authRij: Promise<unknown> = Promise.resolve();

  constructor(readonly config: LokaleConfig, f: Fabrieken = {}) {
    this.client = (f.maakClient ?? ((url, key) => createClient(url, key, {
      auth: authOpties(config),
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

  private inRij<T>(f: () => Promise<T>): Promise<T> {
    const p = this.authRij.then(f, f);
    this.authRij = p.catch(() => undefined);
    return p;
  }

  private actueel = (g: number) => g === this.generatie;

  /**
   * Stopt de huidige sync (als die er is); onbevestigde opdrachten blijven bewaard. De sync verstuurt vanaf
   * het aanroepen van stop() niets meer; alleen het afmelden van het Realtime-kanaal kan nog duren of mislukken.
   * Daar wacht geen auth-handeling op, en een fout daarbij blokkeert niets.
   */
  private async stopSync() {
    const sync = this.sync;
    this.sync = null;
    if (!sync) return;
    try { await sync.stop(); } catch { /* kanaal niet netjes afgemeld; de sync is wel gestopt */ }
  }

  /** Bij het laden van de pagina: is er in dit tabblad al iemand ingelogd? */
  // Eén keer per pagina, ook als React het effect twee keer uitvoert (StrictMode).
  herstel(): Promise<void> {
    this.herstelBezig ??= (async () => {
      if (this.snap.fase !== 'start') return;
      const g = ++this.generatie;
      const { data, error } = await this.inRij(() => this.client.auth.getSession());
      if (!this.actueel(g)) return;
      if (data.session) await this.begin(g, data.session.user.id, data.session.user.email ?? '');
      // Geen netwerk, maar wel een opgeslagen inlogsessie: niet uitloggen, maar wachten en opnieuw proberen.
      else if (isNetwerkfout(error) && this.heeftOpgeslagenSessie()) this.wachtOpVerbinding(g);
      else this.zet({ fase: 'uitgelogd' });
    })();
    return this.herstelBezig;
  }

  private heeftOpgeslagenSessie(): boolean {
    try { return !!authOpties(this.config).storage?.getItem('thuisplanner-auth'); } catch { return false; }
  }

  private verbindingsklok: ReturnType<typeof setTimeout> | null = null;
  /**
   * Opnieuw proberen na een netwerkstoring: elke 5 seconden, en direct bij opnieuwVerbinden (de knop, of "online" van
   * de browser). supabase-js houdt na een mislukte vernieuwing 60 seconden een afkoelperiode aan (lokaal gemeten); ook
   * dan blijft de app in deze fase en wordt niemand uitgelogd.
   */
  private wachtOpVerbinding(g: number) {
    this.zet({ fase: 'verbinding', fout: null });
    if (this.verbindingsklok) clearTimeout(this.verbindingsklok);
    this.verbindingsklok = setTimeout(() => { if (this.actueel(g)) void this.opnieuwVerbinden(); }, 5000);
  }

  async opnieuwVerbinden(): Promise<void> {
    if (this.snap.fase !== 'verbinding') return;
    if (this.verbindingsklok) { clearTimeout(this.verbindingsklok); this.verbindingsklok = null; }
    this.herstelBezig = null;
    this.snap = { ...this.snap, fase: 'start' };
    await this.herstel();
  }

  async inloggen(email: string, wachtwoord: string): Promise<void> {
    const g = ++this.generatie;
    this.zet({ ...LEEG, fase: 'bezig' });
    // Een vorige sync stopt meteen (verstuurt niets meer); op het afmelden van zijn kanaal wacht de inlog niet.
    // De inlog gaat direct de auth-rij in, in de volgorde waarin hij gevraagd is.
    void this.stopSync();
    const { data, error } = await this.inRij(() => this.client.auth.signInWithPassword({ email, password: wachtwoord }));
    if (!this.actueel(g)) return;   // intussen uitgelogd of een ander account gekozen: die actie ruimt op
    if (error || !data.user) {
      this.zet({ fase: 'uitgelogd', fout: this.config.omgeving === 'staging'
        ? 'Inloggen lukte niet. Klopt je e-mailadres en wachtwoord?'
        : 'Inloggen lukte niet. Klopt het wachtwoord, en staat de lokale database klaar?' });
      return;
    }
    await this.begin(g, data.user.id, data.user.email ?? email);
  }

  private async begin(g: number, id: string, email: string) {
    this.zet({ fase: 'bezig', fout: null, account: { id, email } });
    const [toegang, lid, uitnodigingen] = await Promise.all([
      this.client.rpc('mijn_toegang'), this.client.rpc('my_memberships'), this.haalUitnodigingen()]);
    if (!this.actueel(g)) return;
    // De toegangspoort (database): alleen een code-sessie die nog bestaat. Dit is alleen de uitleg; de database weigert zelf.
    const stand = typeof toegang.data === 'string' ? toegang.data : null;
    if (stand === 'code-nodig' || stand === 'sessie-ingetrokken') {
      void this.stopSync();
      await this.inRij(() => this.client.auth.signOut({ scope: 'local' })).catch(() => undefined);
      if (this.actueel(g)) this.zet({ ...LEEG, fase: 'uitgelogd', fout: TOEGANG_TEKSTEN[stand === 'code-nodig' ? 'TPA01' : 'TPA02'] });
      return;
    }
    if (stand === 'onderhoud') { void this.stopSync(); this.zet({ fase: 'onderhoud', fout: TOEGANG_TEKSTEN.TPA03, toestand: null }); return; }
    if (isNetwerkfout(lid.error)) { void this.stopSync(); this.wachtOpVerbinding(g); return; }
    const rijen = (lid.data as { household_id: string; role?: string }[] | null) ?? [];
    if (lid.error || rijen.length === 0) {
      void this.stopSync();
      const mag = await this.client.rpc('mag_huishouden_maken');
      if (!this.actueel(g)) return;
      this.zet({ fase: 'geen-huishouden', huishouden: null, huishoudens: [], uitnodigingen, toestand: null,
        magHuishouden: typeof mag.data === 'boolean' ? mag.data : null });
      return;
    }
    // De keuze: het laatst gekozen huishouden van dit account, anders het eerste.
    const voorkeur = leesKeuze(id);
    const eerste = rijen.find(r => r.household_id === voorkeur) ?? rijen[0];
    const h = await this.client.from('households').select('name').eq('id', eerste.household_id).maybeSingle();
    if (!this.actueel(g)) return;
    const naam = (h.data as { name?: string } | null)?.name ?? 'Huishouden';
    // Meer huishoudens: de namen voor het wisselen (alleen de eigen huishoudens; RLS).
    let huishoudens: Lidmaatschap[] = [{ id: eerste.household_id, naam, rol: (eerste.role ?? 'member') as Rol }];
    if (rijen.length > 1) {
      const alle = await this.client.from('households').select('id, name').in('id', rijen.map(r => r.household_id));
      if (!this.actueel(g)) return;
      const namen = new Map(((alle.data as { id: string; name: string }[] | null) ?? []).map(x => [x.id, x.name]));
      huishoudens = rijen.map(r => ({ id: r.household_id, naam: namen.get(r.household_id) ?? 'Huishouden', rol: (r.role ?? 'member') as Rol }))
        .sort((a, b) => a.naam.localeCompare(b.naam, 'nl'));
    }
    // Eén sync per sessie. Een vorige (ander account of huishouden) stopt eerst; niet wachten op zijn kanaal.
    void this.stopSync();
    const sync = this.maakSyncFn({
      supabase: this.client,
      huishoudenId: eerste.household_id,
      opslag: veiligeOpslag(),
      opWijziging: toestand => { if (this.sync === sync) this.zet({ toestand }); },
    });
    this.sync = sync;
    this.zet({ fase: 'actief', huishouden: { id: eerste.household_id, naam, rol: (eerste.role ?? 'member') as Rol }, huishoudens, uitnodigingen, toestand: sync.toestand });
    // Starten loopt verder op de achtergrond; uitloggen tijdens het starten stopt deze sync (this.sync).
    await sync.start();
  }

  /** Open uitnodigingen voor dit account; bij een fout (geen verbinding) een lege lijst: er verschijnt dan niets. */
  private async haalUitnodigingen(): Promise<UitnodigingVoorMij[]> {
    const r = await this.client.rpc('my_invites');
    return r.error ? [] : ((r.data as UitnodigingRij[] | null) ?? []).map(naarUitnodiging);
  }

  /** De lijst met uitnodigingen opnieuw ophalen (bij terugkeer naar de app). Verandert verder niets. */
  async verversUitnodigingen(): Promise<void> {
    if (!this.snap.account) return;
    const g = this.generatie;
    const uitnodigingen = await this.haalUitnodigingen();
    if (this.actueel(g) && this.snap.account) this.zet({ uitnodigingen });
  }

  /**
   * Een code aanvragen (inloggen en aanmelden zijn één route). Altijd shouldCreateUser: true, zodat een nieuw en een
   * bestaand adres precies hetzelfde antwoord krijgen (geen adresverraad).
   */
  async vraagCode(email: string, captchaToken?: string | null): Promise<Uitkomst> {
    const adres = email.trim().toLowerCase();
    const r = await this.inRij(() => this.client.auth.signInWithOtp({ email: adres,
      options: { shouldCreateUser: true, ...(captchaToken ? { captchaToken } : {}) } }));
    if (r.error) return { ok: false, fout: aanvraagFout(r.error), ...(r.error.status === 429 ? { code: 'TE_VAAK' } : {}) };
    bewaarAanvraag(adres);
    return { ok: true, waarde: undefined };
  }

  /** De zes cijfers controleren (codelaag K1) en inloggen; Supabase geeft de sessie uit. */
  async controleerCode(email: string, code: string, captchaToken?: string | null): Promise<Uitkomst> {
    const adres = email.trim().toLowerCase();
    const c = await controleerBijServer(this.config.url, this.config.anonKey, { email: adres, code, toestel: leesToestel(adres), captchaToken });
    if (!c.ok) return { ok: false, fout: c.fout, code: c.code };
    bewaarToestel(adres, c.toestel);
    const g = ++this.generatie;
    void this.stopSync();
    const v = await this.inRij(() => this.client.auth.verifyOtp({ token_hash: c.tokenHash, type: c.type }));
    if (!this.actueel(g)) return { ok: true, waarde: undefined };
    if (v.error || !v.data.user) return { ok: false, fout: 'Inloggen lukte nu niet. Vraag een nieuwe code aan.', code: 'TPK04' };
    vergeetAanvraag();
    await this.begin(g, v.data.user.id, v.data.user.email ?? adres);
    return { ok: true, waarde: undefined };
  }

  /** Het eigen profiel: de naam die Thuisplanner één keer vraagt en daarna voorstelt (D5). */
  async leesNaam(): Promise<string | null> {
    const account = this.snap.account;
    if (!account) return null;
    const r = await this.client.from('profiles').select('display_name').eq('user_id', account.id).maybeSingle();
    const n = (r.data as { display_name?: string } | null)?.display_name;
    return typeof n === 'string' && n.trim() ? n : null;
  }
  async bewaarNaam(naam: string): Promise<void> {
    const account = this.snap.account;
    const n = naam.trim();
    if (!account || !n || n.length > 80) return;
    await this.client.from('profiles').upsert({ user_id: account.id, display_name: n }, { onConflict: 'user_id' });
  }

  /** Het adres wijzigen: via de codelaag krijgen het oude én het nieuwe adres een eigen code. */
  async wijzigAdres(nieuw: string): Promise<Uitkomst> {
    const adres = nieuw.trim().toLowerCase();
    if (!this.snap.account) return { ok: false, fout: 'Log eerst in.' };
    if (adres === this.snap.account.email.toLowerCase()) return { ok: false, fout: 'Dit is al je e-mailadres.' };
    const r = await this.client.auth.updateUser({ email: adres });
    if (r.error) return { ok: false, fout: r.error.message && EIGEN_MELDING.test(r.error.message) ? r.error.message
      : 'Dit adres kan nu niet worden gebruikt. Controleer het en probeer het opnieuw.' };
    this.zet({ adreswijziging: { nieuw: adres } });
    return { ok: true, waarde: undefined };
  }

  /**
   * Eén van de twee codes van een adreswijziging bevestigen. Zijn beide bevestigd, dan is het adres gewijzigd: de andere
   * sessies en alle bekende toestellen gaan uit; alleen dit toestel blijft ingelogd.
   */
  async bevestigAdres(email: string, code: string): Promise<Uitkomst<'gewijzigd' | 'nog-een'>> {
    const c = await controleerBijServer(this.config.url, this.config.anonKey, { email, code });
    if (!c.ok) return { ok: false, fout: c.fout, code: c.code };
    if (c.type !== 'email_change') return { ok: false, fout: 'Deze code hoort niet bij een adreswijziging.', code: 'TPK01' };
    const v = await this.inRij(() => this.client.auth.verifyOtp({ token_hash: c.tokenHash, type: 'email_change' }));
    if (v.error) return { ok: false, fout: 'Bevestigen lukte nu niet. Probeer het opnieuw.', code: 'TPK04' };
    const u = (await this.client.auth.getUser()).data.user;
    const doel = this.snap.adreswijziging?.nieuw;
    if (u?.email && doel && u.email.toLowerCase() === doel) {
      await this.client.rpc('mijn_toestellen_intrekken');
      vergeetToestellen();
      await this.inRij(() => this.client.auth.signOut({ scope: 'others' })).catch(() => undefined);
      this.zet({ account: { id: u.id, email: u.email }, adreswijziging: null });
      void this.verversUitnodigingen();
      return { ok: true, waarde: 'gewijzigd' };
    }
    return { ok: true, waarde: 'nog-een' };
  }

  /** Uitloggen op alle toestellen: alle sessies (direct, ook nog geldige toegangstokens) en alle bekende toestellen uit. */
  async uitloggenOveral(): Promise<void> {
    await this.client.rpc('mijn_toestellen_intrekken');
    vergeetToestellen();
    const g = ++this.generatie;
    this.zet({ ...LEEG, fase: 'uitgelogd' });
    const afmelding = this.inRij(() => this.client.auth.signOut({ scope: 'global' }));
    void this.stopSync();
    await afmelding.catch(() => undefined);
    if (this.actueel(g)) this.zet({ ...LEEG, fase: 'uitgelogd' });
  }

  /** Opnieuw beginnen met het huidige account (na aanmaken, accepteren, wisselen of verlaten). */
  private async opnieuw(): Promise<void> {
    const account = this.snap.account;
    if (!account) return;
    const g = ++this.generatie;
    await this.begin(g, account.id, account.email);
  }

  /**
   * Het eerste (of een volgend) huishouden aanmaken. De database maakt de ingelogde gebruiker eigenaar
   * (create_household; hoogstens 10 eigen huishoudens). Daarna meteen dat huishouden openen.
   */
  async maakHuishouden(naam: string, eigenNaam: string): Promise<Uitkomst<string>> {
    const account = this.snap.account;
    if (!account) return { ok: false, fout: 'Log eerst in.' };
    const r = await this.client.rpc('create_household', { p_name: naam, p_display_name: eigenNaam });
    if (r.error || typeof r.data !== 'string') return { ok: false, fout: foutTekst(r.error) };
    bewaarKeuze(account.id, r.data);
    await this.opnieuw();
    return { ok: true, waarde: r.data };
  }

  /**
   * Een uitnodiging accepteren. Alle regels (eenmalig, verlopen, ingetrokken, maker nog bevoegd, al lid, het juiste
   * huishouden en profiel) dwingt accept_invite af; de app stuurt alleen het token en de eigen naam.
   */
  async accepteerUitnodiging(token: string, eigenNaam: string | null): Promise<Uitkomst<string>> {
    const account = this.snap.account;
    if (!account) return { ok: false, fout: 'Log eerst in.' };
    const r = await this.client.rpc('accept_invite', { p_token: token, p_display_name: eigenNaam || null });
    if (r.error || typeof r.data !== 'string') return mislukt(r.error);
    bewaarKeuze(account.id, r.data);
    await this.opnieuw();
    return { ok: true, waarde: r.data };
  }

  /**
   * Een uitnodiging uit "Uitnodigingen voor jou" accepteren (accept_invite_by_id). De database controleert dezelfde
   * regels als bij de link, en daarnaast dat de uitnodiging aan het bevestigde e-mailadres van dit account gekoppeld is.
   */
  async accepteerUitnodigingOpId(id: string, eigenNaam: string | null): Promise<Uitkomst<string>> {
    const account = this.snap.account;
    if (!account) return { ok: false, fout: 'Log eerst in.' };
    const r = await this.client.rpc('accept_invite_by_id', { p_invite: id, p_display_name: eigenNaam || null });
    if (r.error || typeof r.data !== 'string') { void this.verversUitnodigingen(); return mislukt(r.error); }
    bewaarKeuze(account.id, r.data);
    await this.opnieuw();
    return { ok: true, waarde: r.data };
  }

  /** Een uitnodiging voor jou weigeren (decline_invite): gesloten, het e-mailadres is direct weg. */
  async weigerUitnodiging(id: string): Promise<Uitkomst> {
    const r = await this.client.rpc('decline_invite', { p_invite: id });
    await this.verversUitnodigingen();
    return r.error ? mislukt(r.error) : { ok: true, waarde: undefined };
  }

  /** Naar een ander eigen huishouden (alleen een huishouden waarvan je actief lid bent). */
  async kiesHuishouden(id: string): Promise<void> {
    const account = this.snap.account;
    if (!account || !this.snap.huishoudens.some(h => h.id === id)) return;
    bewaarKeuze(account.id, id);
    await this.opnieuw();
  }

  /** Een huishouden verlaten (leave_household): het account wordt losgekoppeld, het lid en de inhoud blijven. */
  async verlaatHuishouden(id: string): Promise<Uitkomst> {
    const r = await this.client.rpc('leave_household', { p_household: id });
    if (r.error) return { ok: false, fout: foutTekst(r.error) };
    await this.opnieuw();
    return { ok: true, waarde: undefined };
  }

  /**
   * Uitloggen: synchronisatie stoppen (kanaal dicht, cache leeg) en de inlogsessie beëindigen. Het scherm
   * toont meteen "uitgelogd"; lopende inlog- of herstelacties tellen vanaf nu niet meer mee.
   * Onbevestigde opdrachten blijven bewaard; wissen bij uitloggen (P2) vraagt eerst een productbesluit.
   */
  async uitloggen(): Promise<void> {
    const g = ++this.generatie;
    this.zet({ ...LEEG, fase: 'uitgelogd' });
    // Het afmelden direct in de auth-rij zetten, vóór het (mogelijk trage) stoppen van de sync. Anders kan een
    // nieuwe inlog dit uitloggen inhalen en wist het late signOut het token van die nieuwe gebruiker.
    const afmelding = this.inRij(() => this.client.auth.signOut({ scope: 'local' }));
    void this.stopSync();   // de sync stopt meteen; op het afmelden van het kanaal wacht niets
    await afmelding.catch(() => undefined);   // lokaal afmelden; een fout mag de rest niet tegenhouden
    if (this.actueel(g)) this.zet({ ...LEEG, fase: 'uitgelogd' });
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
