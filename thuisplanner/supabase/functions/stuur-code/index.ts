// Thuisplanner K1: de Send Email-hook van Supabase Auth. Supabase verstuurt zelf geen mail meer; deze functie maakt
// een eigen code van 6 cijfers en stuurt die. De interne code (10 cijfers) en de token_hash verlaten deze functie nooit:
// de token_hash gaat versleuteld de database in en komt pas terug na een geslaagde controle (controleer-code).
//
// Alleen inloggen (signup, magiclink, email) en het wijzigen van het adres (email_change) zijn toegestaan. Herstel,
// herbevestiging en uitnodigen via Supabase (recovery, reauthentication, invite) sturen niets: Thuisplanner kent geen
// wachtwoorden. Die drie krijgen stil hetzelfde antwoord als bij succes; al het andere weigert deze hook.
//
// Besloten bèta (migratie 20261125120000): een nieuw account (signup) krijgt alleen een code als het adres op de
// testerslijst staat of een open uitnodiging heeft; anders hetzelfde antwoord als bij succes en hoogstens één uitlegmail
// per adres per dag (L1). Elke webhook-id werkt maar één keer (L4).
import { adresHmac, codeHmac, instelling, json, log, rpc, versleutel, webhookGeldig, willekeurigeCode, type Mail } from '../_gedeeld/k1.ts';
import { verstuur } from '../_gedeeld/aanbieder.ts';
import { beslotenTest, inlogcode, wijzigingNieuw, wijzigingOud } from '../_gedeeld/mails.ts';

// Supabase Auth: een HTTP-hook meldt een fout met status 200 en { error: { http_code, message } }; een 4xx of 5xx
// zou als storing (500) of als "opnieuw proberen" (429, 503) gelden. Gemeten met de lokale stack.
const weiger = (status: number, melding: string) => json(200, { error: { http_code: status, message: melding } });

type Uitkomst = 'ok' | 'codes-uit' | 'registratie-dicht' | 'registratie-stil' | 'te-vaak';

// Geen adresverraad via de tijd: elk antwoord dat er als succes uitziet (code verstuurd, uitlegmail verstuurd of niets
// verstuurd) duurt minstens zo lang. Anders zou 'registratie-stil' (direct klaar) te onderscheiden zijn van een
// verstuurde mail. Ruim boven de gewone duur van het versturen, ruim onder de wachttijd van Supabase Auth (5 seconden).
// Niet bij email_change: daar kent de aanvrager het adres al (ingelogd), en de hook maakt er twee codes.
const MINIMALE_DUUR_MS = 1500;
async function minstens(begin: number | null) {
  if (begin === null) return;
  const rest = MINIMALE_DUUR_MS - (performance.now() - begin);
  if (rest > 0) await new Promise(r => setTimeout(r, rest));
}

/** Eén code maken, bewaren en versturen. Geeft null bij succes, anders de weigering. */
async function code(email: string, userId: string, soort: 'signup' | 'email' | 'email_change', tokenHash: string, maakMail: (code: string) => Mail): Promise<Response | null> {
  const begin = soort === 'email_change' ? null : performance.now();
  const nieuw = willekeurigeCode();
  const adres = await adresHmac(email);
  // Het adres zelf gaat alleen bij een nieuw account mee (de database vergelijkt het met de testerslijst en de open
  // uitnodigingen, en bewaart het niet); bij inloggen alleen de HMAC.
  const [r] = await rpc<{ uitkomst: Uitkomst; code_id: string | null }[]>('k1_nieuwe_code', {
    p_adres_hmac: adres, p_email: soort === 'signup' ? email : null, p_user_id: userId, p_soort: soort, p_code_hmac: await codeHmac(adres, nieuw), p_token_hash_enc: await versleutel(tokenHash),
  });
  log('stuur-code', { soort, uitkomst: r.uitkomst });
  if (r.uitkomst === 'codes-uit') return weiger(503, 'Inloggen met een code is tijdelijk uitgeschakeld. Probeer het later opnieuw.');
  // 'te-vaak' is de grens per kwartier (5) of per dag (8): de wachttijd kan dus ook langer zijn dan een kwartier.
  if (r.uitkomst === 'te-vaak') return weiger(429, 'Er zijn net al een paar codes verstuurd. Gebruik de laatste code uit je mail, of probeer het later opnieuw: na een kwartier, of na veel aanvragen pas morgen.');
  if (r.uitkomst === 'registratie-dicht') {
    // Hetzelfde antwoord als bij succes (geen adresverraad); de eigenaar van het adres krijgt uitleg. Mislukt het
    // versturen, dan dezelfde 503 als bij een inlogcode: anders verraadt een storing bij de aanbieder het verschil.
    try { await verstuur(beslotenTest(email)); } catch {
      log('stuur-code', { soort, uitkomst: 'versturen-mislukt' });
      return weiger(503, 'Versturen lukt nu niet. Probeer het over een paar minuten opnieuw.');
    }
    await minstens(begin);
    return null;
  }
  // De uitlegmail ging de afgelopen 24 uur al naar dit adres: niets sturen, wel hetzelfde antwoord, even laat (L1).
  if (r.uitkomst === 'registratie-stil') { await minstens(begin); return null; }
  try {
    await verstuur(maakMail(nieuw));
  } catch {
    await rpc('k1_code_vervalt', { p_code_id: r.code_id });
    log('stuur-code', { soort, uitkomst: 'versturen-mislukt' });
    return weiger(503, 'Versturen lukt nu niet. Probeer het over een paar minuten opnieuw.');
  }
  await minstens(begin);
  return null;
}

Deno.serve(async req => {
  if (req.method !== 'POST') return weiger(405, 'Niet toegestaan');
  const body = await req.text();
  try {
    // Geen geldige handtekening: dit verzoek komt niet van Supabase Auth; een echte 401.
    if (!(await webhookGeldig(instelling('K1_HOOK_SECRET'), req.headers, body))) return json(401, { error: { http_code: 401, message: 'Ongeldige handtekening' } });
  } catch {
    return weiger(500, 'Niet ingesteld');
  }
  // L4: een geldig ondertekend verzoek werkt maar één keer. Een opgevangen en herhaald verzoek (binnen de 5 minuten van
  // de handtekening) maakt dus geen nieuwe code en verstuurt geen mail. Supabase Auth maakt per verzoek een nieuwe id.
  try {
    if (!(await rpc<boolean>('k1_webhook_nieuw', { p_id: req.headers.get('webhook-id') }))) {
      log('stuur-code', { uitkomst: 'herhaald-verzoek' });
      return json(401, { error: { http_code: 401, message: 'Verzoek al verwerkt' } });
    }
  } catch {
    return weiger(503, 'Versturen lukt nu niet. Probeer het over een paar minuten opnieuw.');
  }
  let p: { user?: { id?: string; email?: string; new_email?: string }; email_data?: Record<string, string> };
  try { p = JSON.parse(body); } catch { return weiger(400, 'Ongeldig verzoek'); }
  const u = p.user ?? {}, d = p.email_data ?? {};
  const actie = d.email_action_type;
  try {
    if ((actie === 'signup' || actie === 'magiclink' || actie === 'email') && u.id && u.email && d.token_hash) {
      const fout = await code(u.email, u.id, actie === 'signup' ? 'signup' : 'email', d.token_hash, c => inlogcode(u.email as string, c));
      return fout ?? json(200, {});
    }
    if (actie === 'email_change' && u.id && u.email && u.new_email && d.token_hash && d.token_hash_new) {
      // Supabase: token_hash_new hoort bij het HUIDIGE adres, token_hash bij het NIEUWE (zie de documentatie van de hook).
      const oud = await code(u.email, u.id, 'email_change', d.token_hash_new, c => wijzigingOud(u.email as string, c, u.new_email as string));
      if (oud) return oud;
      const nieuw = await code(u.new_email, u.id, 'email_change', d.token_hash, c => wijzigingNieuw(u.new_email as string, c));
      return nieuw ?? json(200, {});
    }
    // Herstel, herbevestiging en uitnodigen via Supabase: Thuisplanner gebruikt ze niet. Geen mail, wel hetzelfde
    // antwoord als bij succes, en meteen (Supabase Auth antwoordt bij een onbekend adres ook meteen, zonder hook): een
    // weigering (400) zou verraden dat het adres een account heeft. Restrisico M1: §29.
    if (actie === 'recovery' || actie === 'reauthentication' || actie === 'invite') {
      log('stuur-code', { soort: actie, uitkomst: 'stil-geweigerd' });
      return json(200, {});
    }
    log('stuur-code', { soort: actie ?? 'onbekend', uitkomst: 'geweigerd' });
    return weiger(400, 'Deze actie is niet beschikbaar in Thuisplanner.');
  } catch (e) {
    log('stuur-code', { soort: actie ?? 'onbekend', uitkomst: 'fout', melding: e instanceof Error ? e.message.slice(0, 60) : 'onbekend' });
    return weiger(503, 'Versturen lukt nu niet. Probeer het over een paar minuten opnieuw.');
  }
});
