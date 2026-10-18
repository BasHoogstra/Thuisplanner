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

async function verwerk(): Promise<void> {
  const aanbieder = kiesAanbieder(await rpc<string | null>('mail_testaanbieder', {}));
  const telling = { aangenomen: 0, opnieuw: 0, onzeker: 0, mislukt: 0 };
  const start = Date.now();
  while (Date.now() - start < BUDGET_MS) {
    const rijen = await rpc<Rij[]>('uitnodigingsmail_pak', { p_max: 10, p_idempotent: aanbieder.idempotent });
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
      await rpc('uitnodigingsmail_klaar', { p_id: r.id, p_uitkomst: uitkomst, p_bericht: bericht, p_wacht_s: wachtS, p_idempotent: aanbieder.idempotent });
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
  const werk = verwerk().catch(() => log('stuur-uitnodiging', { uitkomst: 'storing' }));
  const rt = (globalThis as { EdgeRuntime?: { waitUntil(p: Promise<unknown>): void } }).EdgeRuntime;
  if (rt?.waitUntil) { rt.waitUntil(werk); return json(202, {}); }
  await werk;
  return json(200, {});
});
