// Thuisplanner D6: de uitnodigingsmails van één huishouden versturen. De wachtrij staat in de database (migratie
// uitnodigingsmail); deze functie pakt de rijen die aan de beurt zijn en verstuurt ze. De app roept haar aan na het maken
// van een uitnodiging, na "nog eens sturen", en als de beheerder het huishouden opent terwijl er nog een mail wacht.
//
// Alleen een eigenaar of beheerder met een geldige codesessie: de controle loopt met zijn eigen token door de database
// (uitnodigingsmail_verzoek, dus door de toegangspoort). Daarna werkt de functie met de service-rol, alleen voor dat
// huishouden. De mail bevat geen token (B4) en de tekst ligt vast (veiligeNaam).
//
// Hoogstens één mail per rij: een time-out of een andere onzekere fout maakt de rij "onzeker" (niet opnieuw); alleen
// een aanbieder die de mail aantoonbaar niet aannam (5xx/429) geeft een nieuwe poging.
//
// Antwoorden: 200 { verstuurd, opnieuw, onzeker, mislukt }, 401 { code: 'TPA01' } (geen geldige sessie),
// 403 { code: 'TPU01' } (geen beheerder), 400 (geen huishouden), 503 (storing).
import { instelling, json, log, NietAangenomen, rpc, verstuur } from '../_gedeeld/k1.ts';
import { uitnodiging } from '../_gedeeld/mails.ts';

function cors(): Record<string, string> {
  return { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
    'Access-Control-Allow-Methods': 'POST, OPTIONS' };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const datum = (iso: string) => new Intl.DateTimeFormat('nl-NL', { day: 'numeric', month: 'long', timeZone: 'Europe/Amsterdam' }).format(new Date(iso));

/** Mag deze gebruiker (zijn eigen token) de mails van dit huishouden laten versturen? */
async function magVersturen(token: string, huishouden: string): Promise<'ja' | 'nee' | 'geen-sessie'> {
  const r = await fetch(`${instelling('SUPABASE_URL')}/rest/v1/rpc/uitnodigingsmail_verzoek`, {
    method: 'POST',
    headers: { apikey: instelling('SUPABASE_ANON_KEY'), Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_household: huishouden }),
  });
  if (r.ok) return (await r.json()) === true ? 'ja' : 'nee';
  if (r.status === 401 || r.status === 403) return 'geen-sessie';
  const fout = await r.json().catch(() => ({}));
  if (typeof fout.code === 'string' && fout.code.startsWith('TPA')) return 'geen-sessie';
  throw new Error(`uitnodigingsmail_verzoek: ${r.status}`);
}

Deno.serve(async req => {
  const kop = cors();
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: kop });
  if (req.method !== 'POST') return json(405, {}, kop);
  const token = req.headers.get('authorization')?.match(/^Bearer (.+)$/)?.[1];
  let b: { huishouden?: unknown };
  try { b = await req.json(); } catch { return json(400, {}, kop); }
  const huishouden = typeof b.huishouden === 'string' && UUID.test(b.huishouden) ? b.huishouden : null;
  if (!huishouden) return json(400, {}, kop);
  if (!token) return json(401, { code: 'TPA01' }, kop);
  try {
    const mag = await magVersturen(token, huishouden);
    if (mag === 'geen-sessie') return json(401, { code: 'TPA01' }, kop);
    if (mag === 'nee') return json(403, { code: 'TPU01' }, kop);
    const rijen = await rpc<{ id: string; aan: string; huishouden: string | null; uitnodiger: string | null; geldig_tot: string }[]>(
      'uitnodigingsmail_pak', { p_household: huishouden, p_max: 10 });
    const telling = { verstuurd: 0, opnieuw: 0, onzeker: 0, mislukt: 0 };
    for (const r of rijen) {
      let uitkomst: keyof typeof telling = 'verstuurd';
      let bericht: string | null = null;
      try {
        bericht = await verstuur(uitnodiging(r.aan, r.uitnodiger, r.huishouden, instelling('APP_URL'), datum(r.geldig_tot)), r.id);
      } catch (e) {
        uitkomst = e instanceof NietAangenomen ? (e.opnieuw ? 'opnieuw' : 'mislukt') : 'onzeker';
      }
      await rpc('uitnodigingsmail_klaar', { p_id: r.id, p_uitkomst: uitkomst, p_bericht: bericht });
      telling[uitkomst]++;
    }
    log('stuur-uitnodiging', telling);
    return json(200, telling, kop);
  } catch {
    log('stuur-uitnodiging', { uitkomst: 'storing' });
    return json(503, {}, kop);
  }
});
