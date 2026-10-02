-- Hulpfuncties naar een niet-publiek schema (niet aanroepbaar via de API).
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create or replace function private.is_member(hid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.household_members m where m.household_id = hid and m.user_id = (select auth.uid()));
$$;
create or replace function private.is_owner(hid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.household_members m where m.household_id = hid and m.user_id = (select auth.uid()) and m.role = 'owner');
$$;
revoke all on function private.is_member(uuid) from public, anon;
revoke all on function private.is_owner(uuid) from public, anon;
grant execute on function private.is_member(uuid) to authenticated;
grant execute on function private.is_owner(uuid) to authenticated;

-- Beleid opnieuw, met private.* en (select auth.uid())
drop policy households_select on public.households;
drop policy households_update on public.households;
drop policy households_delete on public.households;
create policy households_select on public.households for select to authenticated using ((select private.is_member(id)));
create policy households_update on public.households for update to authenticated using ((select private.is_owner(id))) with check ((select private.is_owner(id)));
create policy households_delete on public.households for delete to authenticated using ((select private.is_owner(id)));

drop policy members_select on public.household_members;
drop policy members_update_self on public.household_members;
drop policy members_delete on public.household_members;
create policy members_select on public.household_members for select to authenticated using ((select private.is_member(household_id)));
create policy members_update_self on public.household_members for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy members_delete on public.household_members for delete to authenticated
  using (user_id = (select auth.uid()) or (select private.is_owner(household_id)));

-- Je eigen rol aanpassen kan niet (alleen je weergavenaam)
create or replace function private.keep_member_role()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.role is distinct from old.role and not exists (
    select 1 from public.household_members m where m.household_id = old.household_id and m.user_id = (select auth.uid()) and m.role = 'owner' and m.user_id <> old.user_id
  ) then
    new.role := old.role;
  end if;
  if new.household_id <> old.household_id or new.user_id <> old.user_id then
    raise exception 'Huishouden of gebruiker van een lid kan niet worden gewijzigd';
  end if;
  return new;
end $$;
create trigger members_keep_role before update on public.household_members
  for each row execute function private.keep_member_role();

drop policy invites_select on public.household_invites;
drop policy invites_insert on public.household_invites;
drop policy invites_delete on public.household_invites;
create policy invites_select on public.household_invites for select to authenticated using ((select private.is_member(household_id)));
create policy invites_insert on public.household_invites for insert to authenticated with check ((select private.is_member(household_id)) and created_by = (select auth.uid()));
create policy invites_delete on public.household_invites for delete to authenticated using ((select private.is_member(household_id)));

drop policy items_select on public.items;
drop policy items_insert on public.items;
drop policy items_update on public.items;
drop policy items_delete on public.items;
create policy items_select on public.items for select to authenticated using ((select private.is_member(household_id)));
create policy items_insert on public.items for insert to authenticated with check ((select private.is_member(household_id)));
create policy items_update on public.items for update to authenticated using ((select private.is_member(household_id))) with check ((select private.is_member(household_id)));
create policy items_delete on public.items for delete to authenticated using ((select private.is_member(household_id)));

drop function public.is_member(uuid);
drop function public.is_owner(uuid);

-- Indexen voor verwijzingen
create index household_invites_created_by_idx on public.household_invites(created_by);
create index household_invites_used_by_idx on public.household_invites(used_by);
create index households_created_by_idx on public.households(created_by);
create index items_updated_by_idx on public.items(updated_by);