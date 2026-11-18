-- Thuisplanner · D6, herstelronde na de review van PR #54: een claimronde voor de verzending van uitnodigingsmails.
-- Zie docs/thuisplanner-uitnodigingsmail-verzending.md. De bestaande functies (pak, klaar) blijven ongewijzigd; deze
-- migratie voegt toe:
--
-- 1. Een claimtoken per portie (kolom ronde). uitnodigingsmail_pak_ronde(p_max, p_idempotent, p_ronde) geeft bij een
--    herhaling met hetzelfde token dezelfde, nog geldige claim terug in plaats van nieuwe rijen. Een verloren antwoord
--    (onbekende uitkomst: een kale 502/503, een verbroken verbinding) is dan veilig opnieuw te proberen: er blijft geen
--    geclaimde rij achter die niemand meer verstuurt. Aanroepen met hetzelfde token lopen na elkaar (een slot per token),
--    ook als de herhaling op de server tegelijk met de eerste aanroep loopt.
-- 2. Teruggeven: uitnodigingsmail_los(p_ronde, p_ids) zet geclaimde rijen die nog NIET aan de aanbieder zijn gegeven
--    terug op "wacht", zonder dat de poging telt, zolang de claim nog geldt. Zo worden ze niet na de termijn "onzeker"
--    (wat bij een niet-idempotente aanbieder betekent: nooit verstuurd, en de uitnodiger denkt "misschien wel").
-- 3. Vastleggen per ronde: uitnodigingsmail_klaar_ronde legt de uitkomst alleen vast op een rij die nog door déze ronde
--    geclaimd is. Een te late vastlegging raakt dus nooit een rij die een andere ronde intussen heeft gepakt.
-- Alleen de service-rol (de Edge Function stuur-uitnodiging) mag ze aanroepen.

alter table private.uitnodigingsmails add column ronde uuid;

-- Pakt een portie met een claimtoken. Houdt deze ronde nog een geldige claim, dan precies die rijen (herhaling na een
-- onbekende uitkomst); anders nieuwe rijen via uitnodigingsmail_pak (zelfde regels: termijn, ingetrokken, SKIP LOCKED).
create function private.uitnodigingsmail_pak_ronde(p_max integer, p_idempotent boolean, p_ronde uuid)
returns table (id uuid, aan text, huishouden text, uitnodiger text, geldig_tot timestamptz)
language plpgsql security definer set search_path = '' as $$
declare
  r record;
begin
  if p_ronde is null then raise exception 'Een ronde is verplicht' using errcode = '22023'; end if;
  -- Aanroepen met hetzelfde token na elkaar (review PR #54, R2): een herhaling na een tijdslimiet kan op de server
  -- tegelijk lopen met de eerste aanroep. Zonder dit slot ziet de herhaling de nog niet vastgelegde claim niet, slaat
  -- ze die vergrendelde rijen over (SKIP LOCKED) en pakt ze andere: dan houdt het token rijen die niemand verstuurt.
  -- Met het slot wacht de herhaling, en krijgt ze precies de claim van de eerste terug. Verschillende tokens wachten
  -- niet op elkaar; die sluiten elkaar uit via FOR UPDATE SKIP LOCKED in uitnodigingsmail_pak.
  perform pg_advisory_xact_lock(hashtextextended('thuisplanner:uitnodigingsmail_ronde:' || p_ronde::text, 0));
  if exists (select 1 from private.uitnodigingsmails m where m.ronde = p_ronde and m.status = 'bezig' and m.bezig_tot > now()) then
    return query
      select m.id, i.invited_email::text, h.name::text,
             (select hm.display_name::text from public.household_members hm
              where hm.household_id = i.household_id and hm.user_id = i.created_by and hm.status = 'active' limit 1),
             i.expires_at
      from private.uitnodigingsmails m
      join public.household_invites i on i.id = m.invite_id
      join public.households h on h.id = i.household_id
      where m.ronde = p_ronde and m.status = 'bezig' and m.bezig_tot > now();
    return;
  end if;
  for r in select * from private.uitnodigingsmail_pak(p_max, p_idempotent) loop
    update private.uitnodigingsmails m set ronde = p_ronde where m.id = r.id;
    id := r.id; aan := r.aan; huishouden := r.huishouden; uitnodiger := r.uitnodiger; geldig_tot := r.geldig_tot;
    return next;
  end loop;
end $$;

-- Geeft geclaimde, nog niet verstuurde rijen van deze ronde terug (alle rijen van de ronde als p_ids null is). Alleen
-- zolang de claim geldt; de poging telt niet mee (pak telde hem al).
create function private.uitnodigingsmail_los(p_ronde uuid, p_ids uuid[])
returns integer language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  update private.uitnodigingsmails m
    set status = 'wacht', pogingen = greatest(m.pogingen - 1, 0), bezig_tot = null, ronde = null
    where m.ronde = p_ronde and m.status = 'bezig' and m.bezig_tot > now() and (p_ids is null or m.id = any (p_ids));
  get diagnostics n = row_count;
  return n;
end $$;

-- De uitkomst, alleen als deze ronde de rij nog geclaimd heeft (de rij vergrendeld, zodat het verlopen van de termijn of
-- een andere ronde er niet tussendoor komt). Daarna dezelfde regels als uitnodigingsmail_klaar.
create function private.uitnodigingsmail_klaar_ronde(p_id uuid, p_ronde uuid, p_uitkomst text, p_bericht text, p_wacht_s integer,
  p_idempotent boolean)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from private.uitnodigingsmails m where m.id = p_id and m.ronde = p_ronde and m.status = 'bezig' for update;
  if not found then return false; end if;
  perform private.uitnodigingsmail_klaar(p_id, p_uitkomst, p_bericht, p_wacht_s, p_idempotent);
  return true;
end $$;

revoke all on function private.uitnodigingsmail_pak_ronde(integer, boolean, uuid), private.uitnodigingsmail_los(uuid, uuid[]),
  private.uitnodigingsmail_klaar_ronde(uuid, uuid, text, text, integer, boolean) from public, anon, authenticated;
grant execute on function private.uitnodigingsmail_pak_ronde(integer, boolean, uuid), private.uitnodigingsmail_los(uuid, uuid[]),
  private.uitnodigingsmail_klaar_ronde(uuid, uuid, text, text, integer, boolean) to service_role;

create function public.uitnodigingsmail_pak_ronde(p_max integer, p_idempotent boolean, p_ronde uuid)
returns table (id uuid, aan text, huishouden text, uitnodiger text, geldig_tot timestamptz)
language plpgsql security invoker set search_path = '' as $$
begin
  return query select * from private.uitnodigingsmail_pak_ronde(p_max, p_idempotent, p_ronde);
exception when others then
  raise exception using errcode = sqlstate, message = sqlerrm;   -- zonder DETAIL/HINT
end $$;
create function public.uitnodigingsmail_los(p_ronde uuid, p_ids uuid[] default null)
returns integer language plpgsql security invoker set search_path = '' as $$
begin
  return private.uitnodigingsmail_los(p_ronde, p_ids);
exception when others then
  raise exception using errcode = sqlstate, message = sqlerrm;
end $$;
create function public.uitnodigingsmail_klaar_ronde(p_id uuid, p_ronde uuid, p_uitkomst text, p_bericht text default null,
  p_wacht_s integer default null, p_idempotent boolean default false)
returns boolean language plpgsql security invoker set search_path = '' as $$
begin
  return private.uitnodigingsmail_klaar_ronde(p_id, p_ronde, p_uitkomst, p_bericht, p_wacht_s, p_idempotent);
exception when others then
  raise exception using errcode = sqlstate, message = sqlerrm;
end $$;
revoke all on function public.uitnodigingsmail_pak_ronde(integer, boolean, uuid), public.uitnodigingsmail_los(uuid, uuid[]),
  public.uitnodigingsmail_klaar_ronde(uuid, uuid, text, text, integer, boolean) from public, anon, authenticated;
grant execute on function public.uitnodigingsmail_pak_ronde(integer, boolean, uuid), public.uitnodigingsmail_los(uuid, uuid[]),
  public.uitnodigingsmail_klaar_ronde(uuid, uuid, text, text, integer, boolean) to service_role;
