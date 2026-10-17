// Huishoudbeheer (KG-5H deel 1 en 1b, docs/thuisplanner-onboarding.md en docs/thuisplanner-uitnodiging-email.md): leden
// toevoegen, uitnodigen (optioneel op e-mailadres), uitnodigingen intrekken.
// Alleen via de bestaande functies en RLS; de database bepaalt wie wat mag (eigenaar/beheerder), de app toont alleen
// wat zinvol is. Eigenaar en beheerder zijn gelijk voor alle dagelijkse dingen; alleen uitzonderlijke handelingen
// (iemand als beheerder uitnodigen, een beheerder archiveren, rollen wijzigen, eigendom overdragen, het huishouden
// verwijderen) zijn van de eigenaar. De eigenaar is een technische rol in het huishouden, los van wie later betaalt.
import type { SupabaseClient } from '@supabase/supabase-js';
import { maakLink } from '../uitnodiging';
import { foutTekst, type Rol, type Uitkomst } from './sessie';

/** Standaard geldigheid van een uitnodiging (besluit 2). De database staat 1 tot 30 dagen toe. */
export const GELDIG_DAGEN = 7;

export const ROL_TEKST: Record<Rol, string> = { owner: 'Beheerder · eigenaar', admin: 'Beheerder', member: 'Lid' };

export const magBeheren = (rol: Rol | undefined) => rol === 'owner' || rol === 'admin';
/** Iemand als beheerder uitnodigen is een uitzonderlijke handeling van de eigenaar (de database dwingt dit af). */
export const magBeheerderUitnodigen = (rol: Rol | undefined) => rol === 'owner';

/**
 * Een uitnodiging die nog niet gebruikt of ingetrokken is (en niet verlopen). email: het adres waaraan hij gekoppeld is
 * (alleen zichtbaar voor eigenaar en beheerder); geweigerd: de genodigde heeft hem geweigerd (het adres is dan al weg).
 */
export interface OpenUitnodiging { id: string; lidId: string | null; rol: 'admin' | 'member'; verloopt: string; email: string | null; geweigerd: boolean }
export interface NieuweUitnodiging { link: string; verloopt: Date; email: string | null }

export async function voegLidToe(c: SupabaseClient, huishouden: string, naam: string, soort: 'adult' | 'child'): Promise<Uitkomst<string>> {
  const r = await c.rpc('add_member', { p_household: huishouden, p_display_name: naam, p_kind: soort });
  return r.error || typeof r.data !== 'string' ? { ok: false, fout: foutTekst(r.error) } : { ok: true, waarde: r.data };
}

/**
 * Een uitnodiging maken. Het token komt één keer terug en gaat alleen in de link; het wordt nergens bewaard of
 * gelogd. lidId: voor een bestaand profiel (volwassene zonder account), anders ontstaat bij accepteren een nieuw lid.
 * email (optioneel): dan kan alleen het account met dat bevestigde adres accepteren, en ziet het de uitnodiging na het
 * inloggen ook zonder link. De database normaliseert en controleert het adres (TPU09) en trekt een eerdere open
 * uitnodiging voor hetzelfde adres in.
 */
export async function nodigUit(c: SupabaseClient, huishouden: string, lidId: string | null, rol: 'admin' | 'member',
  { email = null, nu = new Date() }: { email?: string | null; nu?: Date } = {}): Promise<Uitkomst<NieuweUitnodiging>> {
  const adres = email?.trim() || null;
  const r = await c.rpc('create_invite', { p_household: huishouden, p_member: lidId, p_role: rol, p_days: GELDIG_DAGEN, p_email: adres });
  if (r.error || typeof r.data !== 'string') return { ok: false, fout: foutTekst(r.error) };
  let link: string;
  try { link = maakLink(r.data); } catch { return { ok: false, fout: foutTekst(null) }; }
  return { ok: true, waarde: { link, verloopt: new Date(nu.getTime() + GELDIG_DAGEN * 86400000), email: adres?.toLowerCase() ?? null } };
}

/** Open (en geweigerde) uitnodigingen; alleen zichtbaar voor eigenaar en beheerder (RLS, zonder tokenhash). */
export async function openUitnodigingen(c: SupabaseClient, huishouden: string, nu = new Date()): Promise<Uitkomst<OpenUitnodiging[]>> {
  const r = await c.from('household_invites').select('id, member_id, role, expires_at, invited_email, declined_at')
    .eq('household_id', huishouden).is('accepted_at', null).is('revoked_at', null).gt('expires_at', nu.toISOString())
    .order('expires_at');
  if (r.error) return { ok: false, fout: foutTekst(r.error) };
  const rijen = (r.data as { id: string; member_id: string | null; role: 'admin' | 'member'; expires_at: string;
    invited_email: string | null; declined_at: string | null }[]) ?? [];
  return { ok: true, waarde: rijen.map(x => ({ id: x.id, lidId: x.member_id, rol: x.role, verloopt: x.expires_at,
    email: x.invited_email, geweigerd: x.declined_at !== null })) };
}

export async function trekIn(c: SupabaseClient, uitnodiging: string): Promise<Uitkomst> {
  const r = await c.rpc('revoke_invite', { p_invite: uitnodiging });
  return r.error ? { ok: false, fout: foutTekst(r.error) } : { ok: true, waarde: undefined };
}

/** De uitnodigingsmail (D6): de laatste mail per open uitnodiging, voor de uitnodiger. */
export type MailStand = 'wacht' | 'bezig' | 'verstuurd' | 'onzeker' | 'mislukt' | 'niet_bezorgd' | 'vervallen' | 'daglimiet';
export interface MailStatus { nummer: number; status: MailStand; verstuurd: string | null; opnieuwVanaf: string | null }

export async function mailStatussen(c: SupabaseClient, huishouden: string): Promise<Map<string, MailStatus>> {
  const r = await c.rpc('uitnodigingsmails', { p_household: huishouden });
  const uit = new Map<string, MailStatus>();
  if (r.error || !Array.isArray(r.data)) return uit;
  for (const m of r.data as { invite_id: string; nummer: number; status: MailStand; verstuurd: string | null; opnieuw_vanaf: string | null }[]) {
    uit.set(m.invite_id, { nummer: m.nummer, status: m.status, verstuurd: m.verstuurd, opnieuwVanaf: m.opnieuw_vanaf });
  }
  return uit;
}

/** Laat de Edge Function de wachtende mails van dit huishouden versturen (met de sessie van deze gebruiker). */
export async function verstuurMails(c: SupabaseClient, huishouden: string): Promise<void> {
  try { await c.functions.invoke('stuur-uitnodiging', { body: { huishouden } }); } catch { /* volgende keer opnieuw */ }
}

export async function mailOpnieuw(c: SupabaseClient, uitnodiging: string): Promise<Uitkomst> {
  const r = await c.rpc('uitnodigingsmail_opnieuw', { p_invite: uitnodiging });
  return r.error ? { ok: false, fout: foutTekst(r.error) } : { ok: true, waarde: undefined };
}

const tijdTekst = (iso: string, nu: Date) => {
  const d = new Date(iso);
  const tijd = d.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
  return d.toDateString() === nu.toDateString() ? tijd : `${d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'long' })} om ${tijd}`;
};

/** De regel onder een open uitnodiging. Delen via de link blijft altijd mogelijk. */
export function mailTekst(m: MailStatus, nu = new Date()): string {
  switch (m.status) {
    case 'wacht': case 'bezig': return 'Mail wordt verstuurd. Lukt het niet meteen, dan proberen we het opnieuw.';
    case 'verstuurd': return `Mail verstuurd om ${m.verstuurd ? tijdTekst(m.verstuurd, nu) : 'onbekend'}.`;
    case 'onzeker': return 'Mail misschien niet aangekomen. Stuur hem nog eens, of deel de link.';
    case 'mislukt': return 'Mail kon niet worden verstuurd. Controleer het adres, of deel de link.';
    case 'niet_bezorgd': return 'Mail niet bezorgd: controleer het adres.';
    case 'daglimiet': return 'Vandaag kan er geen mail meer uit dit huishouden. Deel de link.';
    default: return '';
  }
}

/** Mag "Mail nog eens sturen" nu? (De database beslist; dit is alleen om de knop te tonen.) */
export const magOpnieuwMailen = (m: MailStatus, nu = new Date()) =>
  m.nummer < 3 && !['wacht', 'bezig'].includes(m.status) && (!m.opnieuwVanaf || new Date(m.opnieuwVanaf) <= nu);
