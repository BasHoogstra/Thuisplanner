// Thuisplanner D6: bezorgmeldingen van de mailaanbieder (bezorgd of niet bezorgd). De aanbieder roept dit aan; elke
// melding moet ondertekend zijn volgens de adapter (aanbieder.ts). Zonder geldige handtekening: 401 en er verandert
// niets. Het bericht-id koppelt de melding aan de mail in de wachtrij; de uitnodiger ziet daarna "bezorgd" of "niet
// bezorgd: controleer het adres". Een mail die alleen "aangenomen" is, is nog niet bezorgd.
//   POST /functions/v1/mail-bezorging?aanbieder=<naam>
import { json, log, rpc } from '../_gedeeld/k1.ts';
import { kiesAanbieder } from '../_gedeeld/aanbieder.ts';

Deno.serve(async req => {
  if (req.method !== 'POST') return json(405, {});
  const naam = new URL(req.url).searchParams.get('aanbieder');
  const body = await req.text();
  let melding;
  let aanbieder;
  try {
    // Alleen de aanbieder van deze omgeving, of (lokaal) de testaanbieder.
    aanbieder = naam === 'test' ? kiesAanbieder('gewoon') : kiesAanbieder();
    melding = await aanbieder.bezorging(req, body);
  } catch { return json(401, {}); }
  if (!melding) return json(401, {});
  try {
    const n = await rpc<number>('uitnodigingsmail_bezorging', { p_bericht: melding.berichtId, p_uitkomst: melding.uitkomst });
    log('mail-bezorging', { aanbieder: aanbieder.naam, uitkomst: melding.uitkomst, gevonden: n > 0 });
    return json(200, {});
  } catch {
    // Een storing bij ons: de aanbieder probeert het later opnieuw.
    return json(503, {});
  }
});
