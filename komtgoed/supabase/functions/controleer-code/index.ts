// Thuisplanner K1: één ingevoerde code controleren. De database reserveert eerst een plek binnen de grenzen (per code,
// per account in totaal, per context) en bekijkt de code alleen dan; alles gebeurt atomair onder een vergrendeling van
// het adres. Pas bij een goede code komt de token_hash terug, in de body van dit antwoord. De app geeft die aan
// supabase.auth.verifyOtp en Supabase zelf geeft de sessie uit; deze functie ziet nooit een sessietoken.
//
// Antwoorden (stabiele codes, voor de app):
//   200 { token_hash, type, toestel }   goed; toestel = het nieuwe toestel-token (het oude vervalt)
//   400 { code: 'TPK00' }               geen geldig verzoek (geen zes cijfers, geen adres)
//   400 { code: 'TPK01' }               code klopt niet of is verlopen (één antwoord, ook als er geen code is)
//   403 { code: 'TPK06' }               eerst een captcha
//   429 { code: 'TPK02' }               te veel pogingen; probeer later, of vanaf een toestel waarop je al eerder inlogde
//   503 { code: 'TPK03' }               inloggen met een code tijdelijk uit (noodstop)
//   503 { code: 'TPK04' }               storing; probeer het opnieuw
import { adresHmac, codeHmac, instelling, json, log, ontsleutel, rpc, toestelHmac, willekeurigToken } from '../_gedeeld/k1.ts';

// CORS: elke herkomst. Dit endpoint gebruikt geen cookies of inloggegevens (net als de endpoints van Supabase Auth
// zelf), dus CORS is hier geen beveiligingsgrens; de lokale gateway (Kong) zet bovendien zelf '*'. De bescherming
// zit in de grenzen per adres, de captcha en de eenmalige token_hash.
function cors(_req: Request): Record<string, string> {
  return { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
    'Access-Control-Allow-Methods': 'POST, OPTIONS' };
}

async function captchaGeldig(token: unknown): Promise<boolean> {
  const stand = instelling('K1_CAPTCHA');
  if (stand === 'uit') return true;   // alleen lokaal (geen netwerk naar Cloudflare); de nacontrole eist "aan" online
  if (typeof token !== 'string' || token.length < 10 || token.length > 4096) return false;
  const form = new FormData();
  form.append('secret', instelling('TURNSTILE_SECRET'));
  form.append('response', token);
  const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: form });
  return r.ok && (await r.json()).success === true;
}

Deno.serve(async req => {
  const kop = cors(req);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: kop });
  if (req.method !== 'POST') return json(405, { code: 'TPK00' }, kop);
  let b: { email?: unknown; code?: unknown; toestel?: unknown; captchaToken?: unknown };
  try { b = await req.json(); } catch { return json(400, { code: 'TPK00' }, kop); }
  const email = typeof b.email === 'string' ? b.email.trim().toLowerCase() : '';
  const code = typeof b.code === 'string' ? b.code.trim() : '';
  const toestel = typeof b.toestel === 'string' && /^[0-9a-f]{64}$/.test(b.toestel) ? b.toestel : null;
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 254 || !/^\d{6}$/.test(code)) return json(400, { code: 'TPK00' }, kop);
  try {
    const adres = await adresHmac(email);
    const nieuwToestel = willekeurigToken();
    const captchaOk = b.captchaToken ? await captchaGeldig(b.captchaToken) : instelling('K1_CAPTCHA') === 'uit';
    const [r] = await rpc<{ uitkomst: string; token_hash_enc: string | null; soort: string | null; user_id: string | null }[]>('k1_controleer', {
      p_adres_hmac: adres, p_code_hmac: await codeHmac(adres, code),
      p_toestel_hmac: toestel ? await toestelHmac(toestel) : null, p_nieuw_toestel_hmac: await toestelHmac(nieuwToestel),
      p_captcha_ok: captchaOk,
    });
    log('controleer-code', { uitkomst: r.uitkomst, bekend_toestel: toestel !== null });
    if (r.uitkomst === 'goed' && r.token_hash_enc && r.soort && r.user_id) {
      // Geen wachtwoord overschrijven: dat maakt via de Admin-API de openstaande bevestiging ongeldig en trekt alle
      // sessies in (lokaal gemeten). Een vooraf gezet wachtwoord is onschadelijk door de toegangspoort (amr).
      const type = r.soort === 'signup' ? 'signup' : r.soort === 'email_change' ? 'email_change' : 'email';
      return json(200, { token_hash: await ontsleutel(r.token_hash_enc), type, toestel: nieuwToestel }, kop);
    }
    if (r.uitkomst === 'captcha-nodig') return json(403, { code: 'TPK06' }, kop);
    if (r.uitkomst === 'geremd') return json(429, { code: 'TPK02' }, kop);
    if (r.uitkomst === 'codes-uit') return json(503, { code: 'TPK03' }, kop);
    return json(400, { code: 'TPK01' }, kop);
  } catch (e) {
    log('controleer-code', { uitkomst: 'fout', melding: e instanceof Error ? e.message.slice(0, 60) : 'onbekend' });
    return json(503, { code: 'TPK04' }, kop);
  }
});
