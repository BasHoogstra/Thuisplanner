// Huishoudbeheer (KG-5H deel 1, docs/thuisplanner-onboarding.md): leden toevoegen, uitnodigen, uitnodigingen intrekken.
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

export interface OpenUitnodiging { id: string; lidId: string | null; rol: 'admin' | 'member'; verloopt: string }
export interface NieuweUitnodiging { link: string; verloopt: Date }

export async function voegLidToe(c: SupabaseClient, huishouden: string, naam: string, soort: 'adult' | 'child'): Promise<Uitkomst<string>> {
  const r = await c.rpc('add_member', { p_household: huishouden, p_display_name: naam, p_kind: soort });
  return r.error || typeof r.data !== 'string' ? { ok: false, fout: foutTekst(r.error) } : { ok: true, waarde: r.data };
}

/**
 * Een uitnodiging maken. Het token komt één keer terug en gaat alleen in de link; het wordt nergens bewaard of
 * gelogd. lidId: voor een bestaand profiel (volwassene zonder account), anders ontstaat bij accepteren een nieuw lid.
 */
export async function nodigUit(c: SupabaseClient, huishouden: string, lidId: string | null, rol: 'admin' | 'member', nu = new Date()): Promise<Uitkomst<NieuweUitnodiging>> {
  const r = await c.rpc('create_invite', { p_household: huishouden, p_member: lidId, p_role: rol, p_days: GELDIG_DAGEN });
  if (r.error || typeof r.data !== 'string') return { ok: false, fout: foutTekst(r.error) };
  let link: string;
  try { link = maakLink(r.data); } catch { return { ok: false, fout: foutTekst(null) }; }
  return { ok: true, waarde: { link, verloopt: new Date(nu.getTime() + GELDIG_DAGEN * 86400000) } };
}

/** Open uitnodigingen (alleen zichtbaar voor eigenaar en beheerder; RLS, zonder tokenhash). */
export async function openUitnodigingen(c: SupabaseClient, huishouden: string, nu = new Date()): Promise<Uitkomst<OpenUitnodiging[]>> {
  const r = await c.from('household_invites').select('id, member_id, role, expires_at')
    .eq('household_id', huishouden).is('accepted_at', null).is('revoked_at', null).gt('expires_at', nu.toISOString())
    .order('expires_at');
  if (r.error) return { ok: false, fout: foutTekst(r.error) };
  const rijen = (r.data as { id: string; member_id: string | null; role: 'admin' | 'member'; expires_at: string }[]) ?? [];
  return { ok: true, waarde: rijen.map(x => ({ id: x.id, lidId: x.member_id, rol: x.role, verloopt: x.expires_at })) };
}

export async function trekIn(c: SupabaseClient, uitnodiging: string): Promise<Uitkomst> {
  const r = await c.rpc('revoke_invite', { p_invite: uitnodiging });
  return r.error ? { ok: false, fout: foutTekst(r.error) } : { ok: true, waarde: undefined };
}
