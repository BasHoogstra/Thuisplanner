// Thuisplanner D6: één verzendronde van de wachtrij met uitnodigingsmails (stuur-uitnodiging), zonder Deno- of
// netwerkafhankelijkheden, zodat de regels rond herhalen, claims en termijnen zonder stack te testen zijn
// (tests/functies/verzendronde.test.mjs). Herstelronde na de reviews van PR #54, met migratie 20261116120000:
//
// 1. Onbekende uitkomst. Geen enkele fout (een kale 502/503/504, een PostgREST-code, een verbroken verbinding, een
//    tijdslimiet) bewijst dat een aanroep niet is uitgevoerd. Daarom pakt de ronde met een claimtoken
//    (uitnodigingsmail_pak_ronde): herhalen met hetzelfde token geeft dezelfde, nog geldige claim terug, nooit een
//    tweede. Zo is ook 'pak' veilig opnieuw te proberen. 'klaar' per ronde is idempotent (alleen een rij die deze ronde
//    nog geclaimd heeft).
// 2. Claimtermijn. 'pak' zet bezig_tot = now() + 2 minuten. De ronde meet de termijn vanaf vóór het eerste pak-verzoek
//    (de server claimt daarna, dus de echte termijn is minstens zo lang; klokverschil telt niet, alleen verstreken tijd)
//    en houdt een marge aan. Een mail gaat alleen weg als versturen (hoogstens de tijdslimiet van de adapter) en
//    vastleggen nog binnen de claim passen. Elke aanroep heeft een tijdslimiet die nooit voorbij de claim reikt, en een
//    nieuwe poging begint alleen als hij nog binnen de claim past.
// 3. Teruggeven. Wat geclaimd maar nog niet aan de aanbieder gegeven is (te weinig claim over, een fout halverwege, of
//    een pak waarvan het antwoord nooit kwam), geeft de ronde op elke uitweg terug (uitnodigingsmail_los): weer
//    "wacht", zonder dat de poging telt. Anders werd het na de termijn "onzeker" en dus nooit verstuurd.
//    Wat wél aan de aanbieder is gegeven maar niet vast te leggen was, blijft "bezig" en volgt na de termijn de regel
//    voor een onzekere poging (alleen met een idempotente aanbieder nog eens, met dezelfde sleutel).

export const CLAIM_MS = 120_000;          // bezig_tot = now() + interval '2 minutes' (uitnodigingsmail_pak)
export const MARGE_MS = 15_000;           // reserve binnen de claim (vertraging van de server, afronding)
export const VERSTUUR_MS = 2_500;         // TIJDSLIMIET_MS van de adapters (aanbieder.ts), inclusief de body
export const RPC_MS = 5_000;              // tijdslimiet per databaseaanroep
export const VASTLEG_MS = 20_000;         // tijd die na het versturen minstens over moet zijn om de uitkomst vast te leggen
export const HERHAAL_MS = [500, 1000, 2000, 4000, 8000];
export const BUDGET_MS = 20_000;          // hoogstens zo lang nieuwe porties pakken per aanroep
// Een kleine portie: in het gewone geval gaat ze ruim binnen de claim weg. Lukt dat niet (trage aanbieder, veel
// herhalingen), dan geeft de ronde de rest netjes terug (punt 3); er gaat nooit iets weg op een verlopen claim.
export const BATCH = 5;

/** Een mislukte RPC: de HTTP-status (null = geen of geen volledig antwoord) en de PostgREST-code als die er is. */
export class RpcFout extends Error {
  naam: string;
  status: number | null;
  code: string | null;
  constructor(naam: string, status: number | null, code: string | null) {
    super(`rpc ${naam}: ${status ?? 'netwerk'}${code ? ' ' + code : ''}`);
    this.naam = naam; this.status = status; this.code = code;
  }
}

/** Tijdelijk (mogelijk later wel goed): geen antwoord of een 5xx. Een 4xx is een fout in de aanroep zelf. */
export function tijdelijk(e: unknown): boolean {
  return e instanceof RpcFout && (e.status === null || e.status >= 500);
}

export type Rij = { id: string; aan: string; huishouden: string | null; uitnodiger: string | null; geldig_tot: string };
export type Uitkomst = 'aangenomen' | 'opnieuw' | 'onzeker' | 'mislukt';
export interface Omgeving {
  rpc: <T>(naam: string, args: Record<string, unknown>, opties?: { tijdslimietMs?: number }) => Promise<T>;
  /** Verstuurt één mail; geeft de uitkomst (de adapter beslist, met zijn eigen tijdslimiet). */
  verstuur: (r: Rij) => Promise<{ uitkomst: Uitkomst; bericht: string | null; wachtS: number | null }>;
  idempotent: boolean;
  log: (gegevens: Record<string, string | number | boolean | null>) => void;
  nieuweId: () => string;
  nu?: () => number;
  wacht?: (ms: number) => Promise<void>;
}

/**
 * Een idempotente aanroep, herhaald bij een tijdelijke fout. Elke poging heeft een tijdslimiet die niet voorbij `tot`
 * reikt, en een nieuwe poging begint alleen als hij (met wachten) nog voor `tot` kan eindigen.
 */
export async function rpcHerhaal<T>(o: Pick<Omgeving, 'rpc' | 'log' | 'nu' | 'wacht'>, naam: string, args: Record<string, unknown>, tot = Infinity): Promise<T> {
  const nu = o.nu ?? Date.now, wacht = o.wacht ?? (ms => new Promise<void>(r => setTimeout(r, ms)));
  for (let i = 0; ; i++) {
    const over = tot - nu();
    if (over <= 0) throw new RpcFout(naam, null, 'TERMIJN');
    try {
      return await o.rpc<T>(naam, args, { tijdslimietMs: Math.min(RPC_MS, over) });
    } catch (e) {
      if (!tijdelijk(e) || i >= HERHAAL_MS.length || nu() + HERHAAL_MS[i] + 1_000 >= tot) throw e;
      o.log({ opnieuw: naam, status: e instanceof RpcFout ? e.status ?? 'netwerk' : 'onbekend', code: e instanceof RpcFout ? e.code : null, poging: i + 1 });
      await wacht(HERHAAL_MS[i]);
    }
  }
}

/** Eén ronde: porties pakken, versturen en vastleggen, binnen het budget en altijd binnen de claim van elke rij. */
export async function verzendronde(o: Omgeving): Promise<Record<Uitkomst, number>> {
  const nu = o.nu ?? Date.now;
  const telling: Record<Uitkomst, number> = { aangenomen: 0, opnieuw: 0, onzeker: 0, mislukt: 0 };
  const start = nu();
  while (nu() - start < BUDGET_MS) {
    const ronde = o.nieuweId();
    const vanaf = nu();                                           // vóór het verzoek: de claim begint later
    const claimTot = vanaf + CLAIM_MS - MARGE_MS;
    // Teruggeven kan tot het echte einde van de claim (de database controleert dat zelf ook).
    const los = async (ids: string[] | null) => {
      try { await rpcHerhaal(o, 'uitnodigingsmail_los', { p_ronde: ronde, p_ids: ids }, vanaf + CLAIM_MS - 1_000); }
      catch (e) { o.log({ uitkomst: 'teruggeven mislukt', fout: String((e as Error)?.message ?? e).slice(0, 80) }); }
    };
    let rijen: Rij[];
    try {
      rijen = await rpcHerhaal<Rij[]>(o, 'uitnodigingsmail_pak_ronde', { p_max: BATCH, p_idempotent: o.idempotent, p_ronde: ronde }, claimTot);
    } catch (e) {
      await los(null);                                            // misschien toch geclaimd: terug
      throw e;
    }
    if (!rijen.length) break;
    const open = new Set(rijen.map(r => r.id));
    let stop = false;
    try {
      for (const r of rijen) {
        if (nu() + VERSTUUR_MS + VASTLEG_MS > claimTot) {
          o.log({ uitkomst: 'claim te kort', over_ms: claimTot - nu(), terug: open.size });
          stop = true;
          break;
        }
        open.delete(r.id);                                        // vanaf hier aan de aanbieder gegeven
        const v = await o.verstuur(r);
        await rpcHerhaal(o, 'uitnodigingsmail_klaar_ronde', { p_id: r.id, p_ronde: ronde, p_uitkomst: v.uitkomst, p_bericht: v.bericht,
          p_wacht_s: v.wachtS, p_idempotent: o.idempotent }, claimTot);
        telling[v.uitkomst]++;
      }
    } finally {
      if (open.size) await los([...open]);
    }
    if (stop) break;
  }
  return telling;
}
