// Thuisplanner D6: één verzendronde van de wachtrij met uitnodigingsmails (stuur-uitnodiging), zonder Deno- of
// netwerkafhankelijkheden, zodat de regels rond herhalen en claimtermijnen zonder stack te testen zijn
// (tests/functies/verzendronde.test.mjs). Herstelronde na de review van PR #54:
//
// 1. Onbekende uitkomst. Alleen een 503 van PostgREST met een verbindingscode (PGRST000/001/002: geen verbinding met
//    de database, of de schemacache is nog niet geladen) bewijst dat een aanroep niet is uitgevoerd. Een kale 502/503/504
//    (van Kong of een proxy), een andere 5xx of een netwerkfout zegt dat niet: de database kan de opdracht al hebben
//    uitgevoerd. 'pak' (zet rijen op "bezig") wordt dan NIET herhaald: de ronde stopt, en wat misschien geclaimd is,
//    valt na de claimtermijn terug (uitnodigingsmail_pak), zoals bij elke onderbroken ronde. Lezen en 'klaar' (werkt
//    alleen een rij bij die nog "bezig" is) zijn veilig te herhalen.
// 2. Claimtermijn. 'pak' zet bezig_tot = now() + 2 minuten. De ronde pakt kleine porties (BATCH) en meet de termijn vanaf
//    vóór het verzoek (de server claimt daarna, dus de echte termijn is minstens zo lang; klokverschil telt niet, alleen
//    verstreken tijd). Een mail gaat alleen weg als versturen (hoogstens de tijdslimiet van de adapter) en het
//    vastleggen nog ruim binnen de claim passen; herhalen van 'klaar' stopt bij het einde van de claim. Zo gaat er nooit
//    een mail weg op een claim die al verlopen is (en die een andere ronde dus al kan hebben gepakt).

export const CLAIM_MS = 120_000;          // bezig_tot = now() + interval '2 minutes' (uitnodigingsmail_pak)
export const MARGE_MS = 15_000;           // reserve binnen de claim (vertraging van de server, afronding)
export const VERSTUUR_MS = 2_500;         // TIJDSLIMIET_MS van de adapters (aanbieder.ts)
export const VASTLEG_MS = 20_000;         // tijd die na het versturen minstens over moet zijn om de uitkomst vast te leggen
export const HERHAAL_MS = [500, 1000, 2000, 4000, 8000];
export const BUDGET_MS = 20_000;          // hoogstens zo lang nieuwe rijen pakken per aanroep
// Zoveel rijen per 'pak' dat ze in het slechtste geval (elke mail de volle tijdslimiet, elk 'klaar' alle herhalingen)
// samen nog binnen de claim passen: 5 × (2,5 s + 15,5 s) = 90 s ≤ 120 s − 15 s. Niet 1: 'pak' slaat ingetrokken
// uitnodigingen over ("vervallen") en geeft dan minder rijen terug; met één rij zou de ronde dan te vroeg stoppen.
export const BATCH = Math.floor((CLAIM_MS - MARGE_MS) / (VERSTUUR_MS + HERHAAL_MS.reduce((a, b) => a + b, 0)));

/** Een mislukte RPC: de HTTP-status (null = geen antwoord, netwerkfout) en de PostgREST-code als die er is. */
export class RpcFout extends Error {
  naam: string;
  status: number | null;
  code: string | null;
  constructor(naam: string, status: number | null, code: string | null) {
    super(`rpc ${naam}: ${status ?? 'netwerk'}${code ? ' ' + code : ''}`);
    this.naam = naam; this.status = status; this.code = code;
  }
}

/** Bewijst deze fout dat de aanroep NIET is uitgevoerd? Alleen PostgREST zonder databaseverbinding. */
export function zekerNietUitgevoerd(e: unknown): boolean {
  return e instanceof RpcFout && e.status === 503 && ['PGRST000', 'PGRST001', 'PGRST002'].includes(e.code ?? '');
}

/** Tijdelijk en veilig te herhalen voor een idempotente aanroep (lezen, 'klaar'). */
function tijdelijk(e: unknown): boolean {
  return zekerNietUitgevoerd(e) || (e instanceof RpcFout && (e.status === null || e.status >= 500));
}

export type Rij = { id: string; aan: string; huishouden: string | null; uitnodiger: string | null; geldig_tot: string };
export type Uitkomst = 'aangenomen' | 'opnieuw' | 'onzeker' | 'mislukt';
export interface Omgeving {
  rpc: <T>(naam: string, args: Record<string, unknown>) => Promise<T>;
  /** Verstuurt één mail; geeft de uitkomst (de adapter beslist, met zijn eigen tijdslimiet). */
  verstuur: (r: Rij) => Promise<{ uitkomst: Uitkomst; bericht: string | null; wachtS: number | null }>;
  idempotent: boolean;
  log: (gegevens: Record<string, string | number | boolean | null>) => void;
  nu?: () => number;
  wacht?: (ms: number) => Promise<void>;
}

/**
 * Herhaalt een aanroep zolang dat veilig is: 'pak' alleen als hij zeker niet is uitgevoerd, de rest ook bij een
 * onbekende uitkomst. Nooit voorbij `tot` (het einde van de claim).
 */
export async function rpcHerhaal<T>(o: Omgeving, naam: string, args: Record<string, unknown>, soort: 'pak' | 'idempotent',
  tot = Infinity): Promise<T> {
  const nu = o.nu ?? Date.now, wacht = o.wacht ?? (ms => new Promise<void>(r => setTimeout(r, ms)));
  for (let i = 0; ; i++) {
    try {
      return await o.rpc<T>(naam, args);
    } catch (e) {
      const opnieuw = soort === 'pak' ? zekerNietUitgevoerd(e) : tijdelijk(e);
      if (!opnieuw || i >= HERHAAL_MS.length || nu() + HERHAAL_MS[i] >= tot) throw e;
      o.log({ opnieuw: naam, status: e instanceof RpcFout ? e.status ?? 'netwerk' : 'onbekend', code: e instanceof RpcFout ? e.code : null, poging: i + 1 });
      await wacht(HERHAAL_MS[i]);
    }
  }
}

/** Eén ronde: rij voor rij pakken, versturen en vastleggen, binnen het budget en altijd binnen de claim. */
export async function verzendronde(o: Omgeving): Promise<Record<Uitkomst, number>> {
  const nu = o.nu ?? Date.now;
  const telling: Record<Uitkomst, number> = { aangenomen: 0, opnieuw: 0, onzeker: 0, mislukt: 0 };
  const start = nu();
  while (nu() - start < BUDGET_MS) {
    const vanaf = nu();                                           // vóór het verzoek: de claim begint later
    const rijen = await rpcHerhaal<Rij[]>(o, 'uitnodigingsmail_pak', { p_max: BATCH, p_idempotent: o.idempotent }, 'pak');
    if (!rijen.length) break;
    const claimTot = vanaf + CLAIM_MS - MARGE_MS;
    for (const r of rijen) {
      if (nu() + VERSTUUR_MS + VASTLEG_MS > claimTot) {
        // Te weinig claim over om te versturen én vast te leggen: niet versturen. De rij valt na de termijn terug.
        o.log({ uitkomst: 'claim te kort', over_ms: claimTot - nu() });
        return telling;
      }
      const v = await o.verstuur(r);
      await rpcHerhaal(o, 'uitnodigingsmail_klaar',
        { p_id: r.id, p_uitkomst: v.uitkomst, p_bericht: v.bericht, p_wacht_s: v.wachtS, p_idempotent: o.idempotent }, 'idempotent', claimTot);
      telling[v.uitkomst]++;
    }
  }
  return telling;
}
