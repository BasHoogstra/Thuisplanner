-- Thuisplanner (map komtgoed) · K3 uit de architectuurcontrole: archiveren met een bewaartermijn van 30 dagen.
-- Zie docs/thuisplanner-k3-archiveren.md (bouwbeschrijving) en docs/thuisplanner-architectuurcontrole.md §7.
--
-- Archiveren en definitief verwijderen blijven gescheiden:
-- - Archiveren (archive_member, ongewijzigd) wist niets. De privé-afspraken van het gearchiveerde lid blijven
--   bewaard, met hun koppeling aan het account, maar zijn voor niemand meer zichtbaar, ook niet als "Bezet"
--   (RLS hieronder). Gedeelde afspraken blijven zichtbaar en door ieder actief lid te wijzigen.
-- - Binnen de termijn haalt een eigenaar of beheerder het lid terug (restore_member). De privé-afspraken zijn
--   dan direct weer van de betrokkene; er wordt niets gekopieerd of teruggezet.
-- - Na de termijn verwijdert private.purge_archived_private() de privé-afspraken van dat lid definitief
--   (details, deelnemers en uitzonderingen gaan mee via on delete cascade). Dat gebeurt dagelijks via
--   pg_cron, en ook direct bij een herstel na de termijn. Het profiel en alle gedeelde inhoud blijven.
-- - Eerder definitief weg alleen door de betrokkene zelf: account verwijderen of het huishouden verlaten
--   (bestaande trigger members_unlink_private). Een beheerder kan andermans privé-afspraken niet wissen.

-- ---------------------------------------------------------------------------------------------
-- 1. De bewaartermijn: één plek
-- ---------------------------------------------------------------------------------------------
create function private.archive_retention()
returns interval language sql immutable set search_path = '' as $$
  select interval '30 days'
$$;
revoke all on function private.archive_retention() from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- 2. Zichtbaarheid (gate 9): privé-afspraken van een gearchiveerd lid ziet niemand, ook niet als "Bezet"
-- ---------------------------------------------------------------------------------------------
-- De subquery leest household_members onder de bestaande RLS (alleen de eigen huishoudens). De eigenaar zelf
-- is als gearchiveerd lid geen lid meer en ziet het huishouden toch al niet.
drop policy events_select on public.events;
create policy events_select on public.events for select to authenticated
  using (
    household_id in (select private.my_household_ids())
    and (visibility <> 'private'
         or owner_member_id not in (
           select m.id from public.household_members m
           where m.household_id in (select private.my_household_ids()) and m.status = 'archived'))
  );
-- Deelnemers en uitzonderingen alleen bij een zichtbare afspraak (events, onder RLS): zo verraden ze niets
-- over een verborgen afspraak.
drop policy event_participants_select on public.event_participants;
create policy event_participants_select on public.event_participants for select to authenticated
  using (household_id in (select private.my_household_ids())
         and exists (select 1 from public.events e where e.id = event_participants.event_id));
drop policy event_exceptions_select on public.event_exceptions;
create policy event_exceptions_select on public.event_exceptions for select to authenticated
  using (household_id in (select private.my_household_ids())
         and exists (select 1 from public.events e where e.id = event_exceptions.series_id));

-- Opruimen en de RLS-voorwaarde zoeken privé-afspraken per eigenaar.
create index events_private_owner_idx on public.events (household_id, owner_member_id) where visibility = 'private';

-- ---------------------------------------------------------------------------------------------
-- 3. Definitief verwijderen na de termijn
-- ---------------------------------------------------------------------------------------------
-- Eén lid; de aanroeper heeft het huishouden al vergrendeld. Alleen privé-afspraken van dat profiel (niet op
-- account: hetzelfde account kan onder een ander, actief profiel eigen privé-afspraken hebben).
create function private.purge_member_private(p_household uuid, p_member uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  delete from public.events e
    where e.household_id = p_household and e.owner_member_id = p_member and e.visibility = 'private';
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function private.purge_member_private(uuid, uuid) from public, anon, authenticated;

-- Alle huishoudens: per huishouden onder vergrendeling (zelfde protocol als archive_member en restore_member),
-- en een fout in één huishouden blokkeert de andere niet. Idempotent. Alleen voor de database zelf
-- (pg_cron draait als postgres); niet via de API.
create function private.purge_archived_private()
returns integer language plpgsql security definer set search_path = '' as $$
declare
  h uuid;
  m uuid;
  totaal integer := 0;
begin
  for h in
    select distinct mm.household_id from public.household_members mm
    where mm.status = 'archived' and mm.archived_at < now() - private.archive_retention()
      and exists (select 1 from public.events e
                  where e.household_id = mm.household_id and e.owner_member_id = mm.id and e.visibility = 'private')
    order by 1
  loop
    begin
      perform private.lock_household(h);
      -- Opnieuw bepalen onder de vergrendeling: een herstel kan net voor zijn geweest.
      for m in
        select mm.id from public.household_members mm
        where mm.household_id = h and mm.status = 'archived' and mm.archived_at < now() - private.archive_retention()
      loop
        totaal := totaal + private.purge_member_private(h, m);
      end loop;
    exception when others then
      raise warning 'Thuisplanner archief opruimen: huishouden % overgeslagen (%)', h, sqlerrm;
    end;
  end loop;
  return totaal;
end $$;
revoke all on function private.purge_archived_private() from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- 4. Herstel
-- ---------------------------------------------------------------------------------------------
create function private.restore_member(p_household uuid, p_member uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  mem public.household_members%rowtype;
begin
  perform private.require_uid();
  perform private.lock_household(p_household);
  if not private.has_role(p_household, array['owner', 'admin']) then
    raise exception 'Alleen een eigenaar of beheerder kan leden terughalen' using errcode = '42501';
  end if;
  select * into mem from public.household_members where id = p_member and household_id = p_household for update;
  if not found then raise exception 'Lid niet gevonden in dit huishouden' using errcode = 'P0002'; end if;
  if mem.status <> 'archived' then raise exception 'Dit lid is niet gearchiveerd' using errcode = '22023'; end if;
  if mem.user_id is not null and exists (
    select 1 from public.household_members o
    where o.household_id = p_household and o.user_id = mem.user_id and o.status = 'active'
  ) then
    raise exception 'Dit account is in dit huishouden al actief onder een ander profiel' using errcode = '23505';
  end if;
  -- Na de termijn zijn de privé-afspraken weg, ook als de dagelijkse opruiming nog niet heeft gedraaid.
  if mem.archived_at < now() - private.archive_retention() then
    perform private.purge_member_private(p_household, mem.id);
  end if;
  -- Terug als gewoon lid: een beheerrol geeft een eigenaar daarna bewust opnieuw. Ingetrokken uitnodigingen
  -- blijven ingetrokken.
  update public.household_members set status = 'active', archived_at = null, role = 'member' where id = mem.id;
end $$;
revoke all on function private.restore_member(uuid, uuid) from public, anon;
grant execute on function private.restore_member(uuid, uuid) to authenticated;

-- Zoals de andere publieke functies (KG-5C herstelronde 2): fouten zonder DETAIL en HINT, dus zonder rijgegevens.
create function public.restore_member(p_household uuid, p_member uuid)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  perform private.restore_member(p_household, p_member);
exception when others then
  raise exception using errcode = sqlstate, message = sqlerrm;   -- zonder DETAIL/HINT
end $$;
revoke all on function public.restore_member(uuid, uuid) from public, anon;
grant execute on function public.restore_member(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- 5. Dagelijks opruimen (pg_cron), alleen waar de extensie beschikbaar is
-- ---------------------------------------------------------------------------------------------
-- Op Supabase (lokaal en online) is pg_cron beschikbaar; in de nabootsing op een kale PostgreSQL (CI) niet.
-- Daar bestaat de opruimfunctie wel en roepen de tests haar rechtstreeks aan. Zonder geplande taak gaat er
-- niets verloren; de gegevens blijven dan alleen langer staan (de smoketest voor staging controleert de taak).
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    execute $s$ select cron.schedule('thuisplanner-archief-opruimen', '17 3 * * *', 'select private.purge_archived_private()') $s$;
  end if;
end $$;
