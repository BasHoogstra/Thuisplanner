// Thuisplanner D6: de wachtrij van uitnodigingsmails verwerken (docs/thuisplanner-uitnodigingsmail-verzending.md).
// Alleen de database roept deze functie aan: het seintje na een nieuwe mail en het vangnet elke minuut (pg_net, met het
// wachtrijgeheim uit Vault). Zonder het juiste geheim (in constante tijd vergeleken): 401 en er gebeurt niets. Er is geen
// route voor gebruikers of de app.
//
// De functie antwoordt meteen (202) en werkt op de achtergrond verder (EdgeRuntime.waitUntil), zodat een korte
// time-out van pg_net de verwerking niet afbreekt. Hoogstens 20 seconden per aanroep, in porties van 10; wat overblijft,
// pakt de volgende ronde op. Twee gelijktijdige aanroepen pakken nooit dezelfde rij (SKIP LOCKED in de database).
//
// Per mail: de aanbieder neemt aan (aangenomen), weigert tijdelijk (opnieuw), weigert definitief (mislukt), of er komt
// geen antwoord (onzeker; alleen met een bewezen idempotente aanbieder later nog eens, met dezelfde sleutel = de rij-id).
// De mail bevat geen token (B4) en de tekst ligt vast (veiligeNaam).
import { geheimGelijk, instelling, json, log, rpc } from '../_gedeeld/k1.ts';
import { kiesAanbieder, NietAangenomen } from '../_gedeeld/aanbieder.ts';
import { uitnodiging } from '../_gedeeld/mails.ts';

const BUDGET_MS = 20_000;
const datum = (iso: string) => new Intl.DateTimeFormat('nl-NL', { day: 'numeric', month: 'long', timeZone: 'Europe/Amsterdam' }).format(new Date(iso));

type Rij = { id: string; aan: string; huishouden: string | null; uitnodiger: string | null; geldig_tot: string };

// Vlak na een herstart van de database heeft PostgREST even geen verbinding: dan antwoordt hij 503 (PGRST000/001), of
// Kong 502. De opdracht is dan niet uitgevoerd. Zonder herhaling gaf de functie de hele ronde op en wachtte de mail op
// het vangnet van de volgende minuut; gebeurde het na het versturen, dan bleef de mail 2 minuten "bezig" (tweede review
// PR #54). Daarom binnen deze aanroep even opnieuw (samen hoogstens ~15 s). Wat idempotent is (lezen, en 'klaar': dat
// werkt alleen een rij bij die nog "bezig" is) ook na een netwerkfout of een andere 5xx; 'pak' niet (een verloren
// antwoord kan rijen al op "bezig" hebben gezet: die pakt de termijn later op).
const HERHAAL_MS = [500, 1000, 2000, 4000, 8000];
async function rpcHerhaal<T>(naam: string, args: Record<string, unknown>, idempotent: boolean): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await rpc<T>(naam, args);
    } catch (e) {
      const status = Number(/: (\d{3})$/.exec(String((e as Error)?.message ?? ''))?.[1] ?? NaN);
      const tijdelijk = status === 502 || status === 503 || (idempotent && (Number.isNaN(status) || status >= 500));
      if (!tijdelijk || i >= HERHAAL_MS.length) throw e;
      log('stuur-uitnodiging', { opnieuw: naam, status: Number.isNaN(status) ? 'netwerk' : status, poging: i + 1 });
      await new Promise(r => setTimeout(r, HERHAAL_MS[i]));
    }
  }
}

async function verwerk(): Promise<void> {
  const aanbieder = kiesAanbieder(await rpcHerhaal<string | null>('mail_testaanbieder', {}, true));
  const telling = { aangenomen: 0, opnieuw: 0, onzeker: 0, mislukt: 0 };
  const start = Date.now();
  while (Date.now() - start < BUDGET_MS) {
    const rijen = await rpcHerhaal<Rij[]>('uitnodigingsmail_pak', { p_max: 10, p_idempotent: aanbieder.idempotent }, false);
    if (!rijen.length) break;
    for (const r of rijen) {
      let uitkomst: keyof typeof telling = 'aangenomen';
      let bericht: string | null = null;
      let wachtS: number | null = null;
      try {
        bericht = (await aanbieder.verstuur(uitnodiging(r.aan, r.uitnodiger, r.huishouden, instelling('APP_URL'), datum(r.geldig_tot)), r.id)).berichtId;
      } catch (e) {
        if (e instanceof NietAangenomen) { uitkomst = e.opnieuw ? 'opnieuw' : 'mislukt'; wachtS = e.wachtS; }
        else uitkomst = 'onzeker';
      }
      await rpcHerhaal('uitnodigingsmail_klaar', { p_id: r.id, p_uitkomst: uitkomst, p_bericht: bericht, p_wacht_s: wachtS, p_idempotent: aanbieder.idempotent }, true);
      telling[uitkomst]++;
    }
  }
  log('stuur-uitnodiging', { aanbieder: aanbieder.naam, ...telling });
}

Deno.serve(async req => {
  if (req.method !== 'POST') return json(405, {});
  const geheim = req.headers.get('x-thuisplanner-wachtrij') ?? '';
  let verwacht: string;
  try { verwacht = instelling('WACHTRIJ_GEHEIM'); } catch { return json(503, {}); }
  if (verwacht.length < 32 || !geheimGelijk(geheim, verwacht)) return json(401, {});
  // Bij een storing: welke stap en welke status (zonder adressen of inhoud), zodat de logs de oorzaak tonen.
  const werk = verwerk().catch(e => log('stuur-uitnodiging', { uitkomst: 'storing', fout: String((e as Error)?.message ?? e).slice(0, 120) }));
  const rt = (globalThis as { EdgeRuntime?: { waitUntil(p: Promise<unknown>): void } }).EdgeRuntime;
  if (rt?.waitUntil) { rt.waitUntil(werk); return json(202, {}); }
  await werk;
  return json(200, {});
});
