// Besluit 20: waar de persoonlijke voorkeuren staan. Dezelfde vorm in de demo (geheugen van dit tabblad) en online
// (de tabel account_preferences, migratie 20261124120000, met een kopie per account op dit toestel).
//
// Online eerst, zoals de inhoud (thuisplanner-sync.js): zonder verbinding kun je niets wijzigen, en er gaat niets
// automatisch later. De laatst bekende stand geldt wel meteen bij het starten (de kopie op dit toestel).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { bewaarCache, leesCache, metWaarde, STANDAARD, uitOpslag, type Sleutel, type Voorkeuren } from './voorkeuren';

export interface VoorkeurenToegang {
  voorkeuren: Voorkeuren;
  /** De stand die bij het openen van de app al op dit toestel bekend was (null: nog nooit, dan geldt het Overzicht). */
  bijStart: Voorkeuren | null;
  /** false: geen verbinding of nog niet opgehaald; de schakelaars staan dan uit. */
  kanWijzigen: boolean;
  /** Waarom niet (voor naast de schakelaars), alleen als kanWijzigen false is. */
  reden: string | null;
  zet: (sleutel: Sleutel, waarde: string | boolean) => Promise<boolean>;
  herstel: () => Promise<boolean>;
}

/** Demo: alles in het geheugen van dit tabblad; herladen zet het terug, zoals de rest van de demo. */
export function useDemoVoorkeuren(): VoorkeurenToegang {
  const [v, zetV] = useState<Voorkeuren>(STANDAARD);
  const zet = useCallback(async (s: Sleutel, w: string | boolean) => { zetV(x => metWaarde(x, s, w)); return true; }, []);
  const herstel = useCallback(async () => { zetV(STANDAARD); return true; }, []);
  return useMemo(() => ({ voorkeuren: v, bijStart: STANDAARD, kanWijzigen: true, reden: null, zet, herstel }), [v, zet, herstel]);
}

interface Rij { prefs: unknown }

/** Hoe vaak de app de voorkeuren opnieuw ophaalt zolang hij zichtbaar is (vangnet naast starten en terugkeren). */
export const VANGNET_MS = 30_000;

/**
 * Online: de kopie op dit toestel meteen, daarna de stand van de server. Opnieuw ophalen bij terugkeren naar de app, bij
 * verbinding terug en elke 30 seconden zolang de app zichtbaar is. Een wijziging gaat direct naar de server; lukt dat
 * niet, dan blijft de oude stand staan en zegt meld() dat het niet is opgeslagen.
 */
export function useServerVoorkeuren(client: SupabaseClient, account: string, online: boolean, meld: (t: string) => void,
  aan: boolean): VoorkeurenToegang | null {
  const [bijStart] = useState<Voorkeuren | null>(() => (aan ? leesCache(account) : null));
  const [v, zetV] = useState<Voorkeuren>(() => bijStart ?? STANDAARD);
  const [opgehaald, zetOpgehaald] = useState(false);
  const [ophaalFout, zetOphaalFout] = useState(false);
  const [bezig, zetBezig] = useState(false);
  // Elke ophaalronde en elke wijziging krijgt een nummer; alleen het antwoord op het laatste telt. Een ophaalronde die
  // tijdens of vóór een wijziging begon, telt dus nooit (anders springt een schakelaar terug naar een oude stand).
  const teller = useRef(0);
  const schrijvend = useRef(false);
  // Na uitloggen (unmount) mag een laat antwoord de kopie op dit toestel niet terugzetten.
  const actief = useRef(true);
  const huidig = useRef(v);
  huidig.current = v;

  const neem = useCallback((ruw: unknown) => {
    if (!actief.current) return;
    const n = uitOpslag(ruw);
    zetV(n);
    bewaarCache(account, n);
  }, [account]);

  const haal = useCallback(async () => {
    if (schrijvend.current) return;   // na de wijziging komt de stand van de server toch mee
    const ronde = ++teller.current;
    // Zonder filter op user_id (die kolom is niet leesbaar, P4): RLS geeft alleen de eigen rij.
    const r = await client.from('account_preferences').select('prefs').maybeSingle<Rij>();
    if (!actief.current || ronde !== teller.current) return;
    if (r.error) { zetOphaalFout(true); return; }
    neem(r.data?.prefs ?? {});
    zetOphaalFout(false);
    zetOpgehaald(true);
  }, [client, account, neem]);

  useEffect(() => {
    actief.current = true;
    return () => { actief.current = false; };
  }, []);

  useEffect(() => {
    if (!aan) return;
    void haal();
    const opZicht = () => { if (document.visibilityState === 'visible') void haal(); };
    const opOnline = () => { void haal(); };
    document.addEventListener('visibilitychange', opZicht);
    window.addEventListener('online', opOnline);
    const t = window.setInterval(() => { if (document.visibilityState === 'visible') void haal(); }, VANGNET_MS);
    return () => {
      document.removeEventListener('visibilitychange', opZicht);
      window.removeEventListener('online', opOnline);
      window.clearInterval(t);
    };
  }, [haal, aan]);

  // Verbinding terug (status van de sync): direct de stand van een ander toestel ophalen.
  useEffect(() => { if (aan && online) void haal(); }, [aan, online, haal]);

  /**
   * Meteen tonen (nieuw), dan opslaan. Lukt dat niet, dan komt de stand van vóór de wijziging direct terug (ook als de
   * server dan ook niet te bereiken is), en daarna haalt de app de stand van de server opnieuw op.
   */
  const schrijf = useCallback(async (nieuw: Voorkeuren, rpc: () => PromiseLike<{ data: unknown; error: unknown }>) => {
    const vorig = huidig.current;
    ++teller.current;   // een lopende ophaalronde telt niet meer
    schrijvend.current = true;
    zetV(nieuw);
    zetBezig(true);
    let ok = false;
    try {
      const r = await rpc();
      const rij = Array.isArray(r.data) ? (r.data[0] as Rij | undefined) : undefined;
      if (!r.error && rij) { ++teller.current; neem(rij.prefs); ok = true; }
    } catch { /* geen antwoord: hieronder terug naar de oude stand */ }
    schrijvend.current = false;
    if (actief.current) zetBezig(false);
    if (!ok) {
      if (actief.current) zetV(vorig);
      meld('Niet opgeslagen. Probeer het zo nog eens.');
      void haal();
    }
    return ok;
  }, [meld, neem, haal]);

  const zet = useCallback((s: Sleutel, w: string | boolean) =>
    schrijf(metWaarde(huidig.current, s, w), () => client.rpc('set_preference', { p_key: s, p_value: w })), [client, schrijf]);
  const herstel = useCallback(() =>
    schrijf(STANDAARD, () => client.rpc('reset_preferences', { p_scope: 'weergave' })), [client, schrijf]);

  const kanWijzigen = online && opgehaald && !bezig;
  const reden = !online ? 'Geen verbinding. Je kunt dit wijzigen zodra er weer verbinding is.'
    : !opgehaald ? (ophaalFout ? 'Je instellingen zijn nu niet op te halen. Probeer het later nog eens.' : 'Even ophalen…') : null;
  return useMemo(() => (aan ? { voorkeuren: v, bijStart, kanWijzigen, reden: kanWijzigen ? null : reden, zet, herstel } : null),
    [aan, v, bijStart, kanWijzigen, reden, zet, herstel]);
}
