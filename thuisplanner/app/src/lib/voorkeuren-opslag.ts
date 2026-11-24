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
  const [bezig, zetBezig] = useState(false);
  // Een antwoord van een ophaalronde die begon vóór de laatste wijziging, telt niet (anders springt een schakelaar terug).
  const teller = useRef(0);

  const neem = useCallback((ruw: unknown) => {
    const n = uitOpslag(ruw);
    zetV(n);
    bewaarCache(account, n);
  }, [account]);

  const haal = useCallback(async () => {
    const ronde = ++teller.current;
    // Zonder filter op user_id (die kolom is niet leesbaar, P4): RLS geeft alleen de eigen rij.
    const r = await client.from('account_preferences').select('prefs').maybeSingle<Rij>();
    if (ronde !== teller.current || r.error) return;
    neem(r.data?.prefs ?? {});
    zetOpgehaald(true);
  }, [client, account, neem]);

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

  const schrijf = useCallback(async (rpc: () => PromiseLike<{ data: unknown; error: unknown }>) => {
    ++teller.current;
    zetBezig(true);
    try {
      const r = await rpc();
      const rij = Array.isArray(r.data) ? (r.data[0] as Rij | undefined) : undefined;
      if (r.error || !rij) { meld('Niet opgeslagen. Probeer het zo nog eens.'); void haal(); return false; }
      neem(rij.prefs);
      return true;
    } catch {
      meld('Niet opgeslagen. Probeer het zo nog eens.');
      return false;
    } finally {
      zetBezig(false);
    }
  }, [meld, neem, haal]);

  const zet = useCallback((s: Sleutel, w: string | boolean) => {
    // Meteen tonen; de server bevestigt of de oude stand komt terug (haal na een fout).
    zetV(x => metWaarde(x, s, w));
    return schrijf(() => client.rpc('set_preference', { p_key: s, p_value: w }));
  }, [client, schrijf]);
  const herstel = useCallback(() => {
    zetV(STANDAARD);
    return schrijf(() => client.rpc('reset_preferences', { p_scope: 'weergave' }));
  }, [client, schrijf]);

  const kanWijzigen = online && opgehaald && !bezig;
  const reden = !online ? 'Geen verbinding. Je kunt dit wijzigen zodra er weer verbinding is.'
    : !opgehaald ? 'Even ophalen…' : null;
  return useMemo(() => (aan ? { voorkeuren: v, bijStart, kanWijzigen, reden: kanWijzigen ? null : reden, zet, herstel } : null),
    [aan, v, bijStart, kanWijzigen, reden, zet, herstel]);
}
