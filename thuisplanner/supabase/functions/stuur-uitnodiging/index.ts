// Thuisplanner D6: de wachtrij van uitnodigingsmails verwerken (docs/thuisplanner-uitnodigingsmail-verzending.md).
// Alleen de database roept deze functie aan: het seintje na een nieuwe mail en het vangnet elke minuut (pg_net, met het
// wachtrijgeheim uit Vault). Zonder het juiste geheim (in constante tijd vergeleken): 401 en er gebeurt niets. Er is geen
// route voor gebruikers of de app.
//
// De functie antwoordt meteen (202) en werkt op de achtergrond verder (EdgeRuntime.waitUntil), zodat een korte
// time-out van pg_net de verwerking niet afbreekt. Hoogstens 20 seconden per aanroep, in porties van 5 (zodat elke mail
// in het slechtste geval nog binnen zijn claim van 2 minuten blijft); wat overblijft, pakt de volgende ronde op. Twee gelijktijdige aanroepen
// pakken nooit dezelfde rij (SKIP LOCKED in de database).
//
// Per mail: de aanbieder neemt aan (aangenomen), weigert tijdelijk (opnieuw), weigert definitief (mislukt), of er komt
// geen antwoord (onzeker; alleen met een bewezen idempotente aanbieder later nog eens, met dezelfde sleutel = de rij-id).
// De mail bevat geen token (B4) en de tekst ligt vast (veiligeNaam).
import { geheimGelijk, instelling, json, log, rpc } from '../_gedeeld/k1.ts';
import { kiesAanbieder, NietAangenomen } from '../_gedeeld/aanbieder.ts';
import { uitnodiging } from '../_gedeeld/mails.ts';
import { type Rij, rpcHerhaal, verzendronde } from '../_gedeeld/verzendronde.ts';

const datum = (iso: string) => new Intl.DateTimeFormat('nl-NL', { day: 'numeric', month: 'long', timeZone: 'Europe/Amsterdam' }).format(new Date(iso));

// Herhalen, onbekende uitkomsten en de claimtermijn: zie _gedeeld/verzendronde.ts (en tests/functies/verzendronde.test.mjs).
async function verwerk(): Promise<void> {
  const logR = (g: Record<string, string | number | boolean | null>) => log('stuur-uitnodiging', g);
  const lezen = { rpc, verstuur: async () => ({ uitkomst: 'onzeker' as const, bericht: null, wachtS: null }), idempotent: false, log: logR };
  const aanbieder = kiesAanbieder(await rpcHerhaal<string | null>(lezen, 'mail_testaanbieder', {}, 'idempotent'));
  const telling = await verzendronde({
    rpc, idempotent: aanbieder.idempotent, log: logR,
    verstuur: async (r: Rij) => {
      try {
        const bericht = (await aanbieder.verstuur(uitnodiging(r.aan, r.uitnodiger, r.huishouden, instelling('APP_URL'), datum(r.geldig_tot)), r.id)).berichtId;
        return { uitkomst: 'aangenomen' as const, bericht, wachtS: null };
      } catch (e) {
        if (e instanceof NietAangenomen) return { uitkomst: e.opnieuw ? 'opnieuw' as const : 'mislukt' as const, bericht: null, wachtS: e.wachtS };
        return { uitkomst: 'onzeker' as const, bericht: null, wachtS: null };
      }
    },
  });
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
