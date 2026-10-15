-- KomtGoed (werknaam) · KG-5B: KG-1 verstevigen (bouwplan KG-5A, stap 1; docs/komtgoed-bouwplan.md).
-- Geen nieuwe inhoud of functies voor de app; alleen beveiliging en privacy van het fundament.
--
--  1. Account verwijderen werkt (AVG). Tot nu toe faalde het verwijderen van ELK gekoppeld account:
--     de FK zette user_id op null maar liet linked_at staan, wat household_members_linked_check brak.
--     Een trigger op auth.users ontkoppelt nu eerst netjes. Is het account de enige eigenaar van een
--     huishouden waar verder niemand een account heeft, dan verdwijnt dat huishouden mee. Zijn er nog
--     andere accounts, dan weigert de database: eerst eigendom overdragen of het huishouden verwijderen.
--  2. Huishouden verwijderen: een eigenaar kan zijn huishouden (met alle leden en uitnodigingen) wissen.
--  3. Account-ID's (user_id) zijn niet meer leesbaar via de API; "heeft een account" wel (has_account),
--     en je eigen lidmaatschappen via my_memberships(). Ook created_by/accepted_by van uitnodigingen
--     zijn niet meer leesbaar.
--  4. Lees-RLS via private.my_household_ids(): één keer per query in plaats van een functie per rij.
--  5. Hoogstens 10 huishoudens als eigenaar per account (tegen misbruik).
--
-- Realtime: geen enkele tabel staat in een publicatie, dus postgres_changes stuurt niets uit
-- (gecontroleerd in KG-T27 en in de integratietest tegen een echte lokale Supabase).

-- ---------------------------------------------------------------------------------------------
-- 3. Account-ID's afschermen
-- ---------------------------------------------------------------------------------------------
alter table public.household_members
  add column has_account boolean generated always as (user_id is not null) stored;

revoke select on public.household_members from authenticated;
grant select (id, household_id, display_name, kind, role, status, color, sort, legacy_ids, has_account,
              linked_at, archived_at, created_at, updated_at)
  on public.household_members to authenticated;

revoke select on public.household_invites from authenticated;
grant select (id, household_id, member_id, role, created_at, expires_at, revoked_at, accepted_at)
  on public.household_invites to authenticated;

-- Je eigen actieve lidmaatschappen: zo weet de app welk lid "jij" bent, zonder account-ID's te tonen.
create function private.my_memberships()
returns table (household_id uuid, member_id uuid, role text)
language sql stable security definer set search_path = '' as $$
  select m.household_id, m.id, m.role from public.household_members m
  where m.user_id = (select auth.uid()) and m.status = 'active';
$$;

-- ---------------------------------------------------------------------------------------------
-- 4. Lees-RLS: de huishoudens van de ingelogde gebruiker, één keer per query bepaald
-- ---------------------------------------------------------------------------------------------
create function private.my_household_ids()
returns setof uuid language sql stable security definer set search_path = '' as $$
  select m.household_id from public.household_members m
  where m.user_id = (select auth.uid()) and m.status = 'active';
$$;

drop policy households_select on public.households;
create policy households_select on public.households for select to authenticated
  using (id in (select private.my_household_ids()));

drop policy members_select on public.household_members;
create policy members_select on public.household_members for select to authenticated
  using (household_id in (select private.my_household_ids()));

-- Bijwerken: beheer in het hele huishouden, een lid alleen zichzelf (zie guard_member); zonder user_id.
drop policy members_update on public.household_members;
create policy members_update on public.household_members for update to authenticated
  using ((select private.has_role(household_id, array['owner', 'admin']))
         or id in (select mm.member_id from private.my_memberships() mm))
  with check (household_id in (select private.my_household_ids()));

revoke all on function private.my_memberships(), private.my_household_ids() from public, anon;
grant execute on function private.my_memberships(), private.my_household_ids() to authenticated;

-- ---------------------------------------------------------------------------------------------
-- 5. Huishouden aanmaken: hoogstens 10 als eigenaar
-- ---------------------------------------------------------------------------------------------
create or replace function private.create_household(p_name text, p_display_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := private.require_uid();
  hid uuid;
begin
  if (select count(*) from public.household_members m
      where m.user_id = uid and m.status = 'active' and m.role = 'owner') >= 10 then
    raise exception 'Je bent al eigenaar van 10 huishoudens' using errcode = '54000';
  end if;
  insert into public.households (name, created_by)
    values (private.clean_name(p_name, 'Geef het huishouden een naam (1-80 tekens)'), uid) returning id into hid;
  insert into public.household_members (household_id, user_id, role, kind, display_name, linked_at)
    values (hid, uid, 'owner', 'adult', private.clean_name(p_display_name, 'Vul je eigen naam in (1-80 tekens)'), now());
  return hid;
end $$;

-- ---------------------------------------------------------------------------------------------
-- 2. Huishouden verwijderen (alleen een eigenaar; leden en uitnodigingen gaan mee)
-- ---------------------------------------------------------------------------------------------
create function private.delete_household(p_household uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_uid();
  if not private.has_role(p_household, array['owner']) then
    raise exception 'Alleen een eigenaar kan het huishouden verwijderen' using errcode = '42501';
  end if;
  delete from public.households where id = p_household;
end $$;

-- ---------------------------------------------------------------------------------------------
-- 1. Account verwijderen
-- ---------------------------------------------------------------------------------------------
create function private.before_account_delete()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  m record;
begin
  for m in
    select h.household_id, h.id from public.household_members h
    where h.user_id = old.id and h.status = 'active' and h.role = 'owner'
  loop
    if not exists (
      select 1 from public.household_members o
      where o.household_id = m.household_id and o.id <> m.id
        and o.role = 'owner' and o.status = 'active' and o.user_id is not null
    ) then
      if exists (
        select 1 from public.household_members o
        where o.household_id = m.household_id and o.id <> m.id
          and o.status = 'active' and o.user_id is not null
      ) then
        raise exception 'Dit account is de enige eigenaar van een huishouden met andere accounts: draag eerst het eigendom over of verwijder het huishouden'
          using errcode = '23514';
      end if;
      -- Niemand anders heeft toegang: het huishouden is alleen van dit account en gaat mee.
      delete from public.households where id = m.household_id;
    end if;
  end loop;
  -- Overige koppelingen (ook gearchiveerde leden) losmaken. Het lid blijft in het huishouden bestaan,
  -- zonder account en zonder beheerrol.
  update public.household_members set user_id = null, linked_at = null, role = 'member'
    where user_id = old.id;
  return old;
end $$;

create trigger komtgoed_before_account_delete before delete on auth.users
  for each row execute function private.before_account_delete();

revoke all on function private.before_account_delete() from public, anon, authenticated;
revoke all on function private.delete_household(uuid) from public, anon;
grant execute on function private.delete_household(uuid) to authenticated;

-- Publieke functies (security invoker).
create function public.my_memberships()
returns table (household_id uuid, member_id uuid, role text)
language sql stable security invoker set search_path = '' as $$
  select * from private.my_memberships()
$$;
create function public.delete_household(p_household uuid)
returns void language sql security invoker set search_path = '' as $$
  select private.delete_household(p_household)
$$;
revoke all on function public.my_memberships(), public.delete_household(uuid) from public, anon;
grant execute on function public.my_memberships(), public.delete_household(uuid) to authenticated;
