-- Huisplan fase 1, stap 1.2: leden met en zonder account, betrouwbare synchronisatie,
-- importtabel en bestandsopslag. Draait op lege tabellen (productie en staging hebben geen rijen).
--
-- Ledenmodel: een huishouden heeft een lijst leden (household_members). Het member-ID (id) is de
-- vaste identiteit van een persoon binnen het huishouden; user_id is alleen de optionele koppeling
-- met een account. Kinderen en nog niet aangemelde volwassenen zijn gewone leden zonder account.
-- Een account wordt alleen via een uitnodiging (accept_invite) aan een lid gekoppeld.
--
-- Rollen: 'owner' = beheerder (mag alles; er kunnen er meerdere zijn, bv. Bas en Sanne),
-- 'member' = lid. Een beheerder heeft altijd een account, en een huishouden houdt altijd minstens
-- één beheerder met account.
--
-- Zie supabase/README.md (stap 1.2) voor de keuzes.

-- ---------------------------------------------------------------------------------------------
-- 1. Rechten aanscherpen
-- ---------------------------------------------------------------------------------------------
-- anon (niet ingelogd) heeft niets te zoeken in onze tabellen. RLS hield anon al buiten, dit is een
-- extra slot. Truncate/references/trigger zijn via de API nooit nodig (truncate omzeilt RLS).
revoke all on table public.households, public.household_members, public.household_invites, public.items from anon;
revoke truncate, references, trigger on table public.households, public.household_members, public.household_invites, public.items from authenticated;

-- Hetzelfde voor alles wat later in public wordt aangemaakt.
alter default privileges for role postgres in schema public revoke all on tables from anon;
alter default privileges for role postgres in schema public revoke all on sequences from anon;
alter default privileges for role postgres in schema public revoke execute on functions from anon, public;
alter default privileges for role postgres in schema public revoke truncate, references, trigger on tables from authenticated;

-- ---------------------------------------------------------------------------------------------
-- 2. household_members: eigen member-ID, account optioneel
-- ---------------------------------------------------------------------------------------------
alter table public.household_members drop constraint household_members_pkey;

alter table public.household_members
  add column id uuid not null default gen_random_uuid(),
  add column kind text not null default 'adult',
  add column color text,
  add column sort integer not null default 0,
  add column legacy_names text[] not null default '{}',
  add column linked_at timestamptz,
  add column created_at timestamptz not null default now(),
  alter column user_id drop not null,
  alter column display_name set not null;

alter table public.household_members
  add constraint household_members_pkey primary key (id),
  add constraint household_members_id_household_key unique (id, household_id),
  add constraint household_members_kind_check check (kind in ('adult', 'child')),
  add constraint household_members_color_check check (color is null or color ~ '^#[0-9a-fA-F]{6}$'),
  add constraint household_members_display_name_not_empty check (char_length(btrim(display_name)) >= 1),
  add constraint household_members_owner_has_account check (role = 'member' or user_id is not null);

-- Een account is per huishouden aan hoogstens één lid gekoppeld.
create unique index household_members_household_user_key on public.household_members (household_id, user_id) where user_id is not null;
create index household_members_household_idx on public.household_members (household_id, sort);

-- Oude trigger (alleen rol bewaken) vervangen door een volledige bewaking.
drop trigger members_keep_role on public.household_members;
drop function private.keep_member_role();

create function private.guard_member()
returns trigger language plpgsql set search_path = '' as $$
declare
  via_api boolean := current_user in ('anon', 'authenticated');
begin
  if tg_op = 'INSERT' then
    if via_api and new.user_id is not null then
      raise exception 'Een account koppel je aan een lid via een uitnodiging' using errcode = '42501';
    end if;
    new.linked_at := case when new.user_id is null then null else now() end;
    return new;
  end if;

  if new.id <> old.id or new.household_id <> old.household_id then
    raise exception 'Huishouden of member-ID van een lid kan niet worden gewijzigd' using errcode = '42501';
  end if;
  if new.user_id is distinct from old.user_id then
    if via_api then
      raise exception 'Een account koppel of ontkoppel je via een uitnodiging of leave_household' using errcode = '42501';
    end if;
    new.linked_at := case when new.user_id is null then null else now() end;
  end if;
  if via_api and not private.is_owner(old.household_id) then
    -- Een lid zonder beheerrechten past alleen de eigen naam en kleur aan.
    if new.role is distinct from old.role or new.kind is distinct from old.kind
       or new.sort is distinct from old.sort or new.legacy_names is distinct from old.legacy_names then
      raise exception 'Alleen een beheerder kan dit wijzigen' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
revoke all on function private.guard_member() from public, anon, authenticated;
create trigger members_guard before insert or update on public.household_members
  for each row execute function private.guard_member();

-- Een huishouden mag nooit zonder beheerder met account achterblijven. Gecontroleerd aan het einde
-- van de transactie, zodat beheer overdragen in één keer kan. Een huishouden verwijderen mag wel.
create function private.ensure_owner()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.households h where h.id = old.household_id)
     and not exists (
       select 1 from public.household_members m
       where m.household_id = old.household_id and m.role = 'owner' and m.user_id is not null
     ) then
    raise exception 'Een huishouden moet minstens één beheerder met account houden' using errcode = '23514';
  end if;
  return null;
end $$;
revoke all on function private.ensure_owner() from public, anon, authenticated;
create constraint trigger members_ensure_owner after update or delete on public.household_members
  deferrable initially deferred for each row execute function private.ensure_owner();

-- RLS leden: iedereen in het huishouden ziet de leden; beheerders voegen leden zonder account toe,
-- passen leden aan en verwijderen ze; een lid past zichzelf aan (naam, kleur; zie guard_member).
drop policy members_update_self on public.household_members;
drop policy members_delete on public.household_members;
create policy members_insert on public.household_members for insert to authenticated
  with check ((select private.is_owner(household_id)));
create policy members_update on public.household_members for update to authenticated
  using ((select private.is_owner(household_id)) or user_id = (select auth.uid()))
  with check ((select private.is_owner(household_id)) or user_id = (select auth.uid()));
create policy members_delete on public.household_members for delete to authenticated
  using ((select private.is_owner(household_id)));

-- ---------------------------------------------------------------------------------------------
-- 3. household_invites: uitnodiging voor een bestaand lid of een nieuw lid
-- ---------------------------------------------------------------------------------------------
alter table public.household_invites
  add column member_id uuid,
  add column role text not null default 'owner',
  add column revoked_at timestamptz;
alter table public.household_invites
  add constraint household_invites_role_check check (role in ('owner', 'member')),
  add constraint household_invites_member_fkey foreign key (member_id, household_id)
    references public.household_members (id, household_id) on delete cascade;
create index household_invites_member_idx on public.household_invites (member_id, household_id);

-- Uitnodigingen (met token) alleen voor beheerders.
drop policy invites_select on public.household_invites;
drop policy invites_insert on public.household_invites;
drop policy invites_delete on public.household_invites;
create policy invites_select on public.household_invites for select to authenticated
  using ((select private.is_owner(household_id)));
create policy invites_insert on public.household_invites for insert to authenticated
  with check ((select private.is_owner(household_id)) and created_by = (select auth.uid())
              and used_at is null and used_by is null and revoked_at is null);
create policy invites_update on public.household_invites for update to authenticated
  using ((select private.is_owner(household_id))) with check ((select private.is_owner(household_id)));
create policy invites_delete on public.household_invites for delete to authenticated
  using ((select private.is_owner(household_id)));

-- ---------------------------------------------------------------------------------------------
-- 4. items: grafstenen, revisies en wie/wanneer aangemaakt
-- ---------------------------------------------------------------------------------------------
-- Verwijderen = deleted_at zetten (grafsteen), zodat een toestel dat offline was een verwijderd
-- item niet terugzet. rev telt per wijziging op (1, 2, 3, ...) voor conflictdetectie.
alter table public.items
  add column deleted_at timestamptz,
  add column rev bigint not null default 1,
  add column created_at timestamptz not null default now(),
  add column created_by uuid references auth.users(id) on delete set null;
create index items_created_by_idx on public.items (created_by);

create or replace function public.touch_item()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.rev := 1;
    new.created_at := now();
    new.created_by := auth.uid();
  else
    if new.household_id <> old.household_id or new.coll <> old.coll or new.id <> old.id then
      raise exception 'Huishouden, verzameling of id van een item kan niet worden gewijzigd' using errcode = '42501';
    end if;
    new.rev := old.rev + 1;
    new.created_at := old.created_at;
    new.created_by := old.created_by;
  end if;
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;
revoke all on function public.touch_item() from public, anon, authenticated;

-- Echt verwijderen kan via de API niet meer; alleen via het huishouden (cascade) of de server.
drop policy items_delete on public.items;

-- ---------------------------------------------------------------------------------------------
-- 5. legacy_imports: de oude Firebase-planner ongewijzigd bewaren (voor stap 1.12)
-- ---------------------------------------------------------------------------------------------
create table public.legacy_imports (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  source text not null default 'firebase' check (source in ('firebase')),
  source_hash text not null check (source_hash ~ '^[0-9a-f]{64}$'),
  raw jsonb not null,
  counts jsonb not null default '{}'::jsonb,
  status text not null default 'received'
    check (status in ('received', 'imported', 'verified', 'failed', 'rolled_back')),
  error text,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  imported_at timestamptz,
  unique (household_id, source_hash)
);
create index legacy_imports_created_by_idx on public.legacy_imports (created_by);
alter table public.legacy_imports enable row level security;
revoke all on table public.legacy_imports from anon;
revoke truncate, references, trigger on table public.legacy_imports from authenticated;

-- Alleen beheerders; de status zet later de importfunctie (1.12), niet de app.
create policy legacy_imports_select on public.legacy_imports for select to authenticated
  using ((select private.is_owner(household_id)));
create policy legacy_imports_insert on public.legacy_imports for insert to authenticated
  with check ((select private.is_owner(household_id)) and created_by = (select auth.uid())
              and status = 'received' and imported_at is null and error is null);

-- ---------------------------------------------------------------------------------------------
-- 6. Bestandsopslag: bucket household-files, pad {household_id}/...
-- ---------------------------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('household-files', 'household-files', false, 10485760,
        array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf'])
on conflict (id) do nothing;

-- Huishouden uit het pad; null als het eerste deel geen uuid is (dan geen toegang).
create function private.household_from_path(p_name text)
returns uuid language sql immutable set search_path = '' as $$
  select case
    when split_part(p_name, '/', 1) ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
      and split_part(p_name, '/', 2) <> ''
    then split_part(p_name, '/', 1)::uuid
  end
$$;
revoke all on function private.household_from_path(text) from public, anon;
grant execute on function private.household_from_path(text) to authenticated;

create policy household_files_select on storage.objects for select to authenticated
  using (bucket_id = 'household-files' and private.is_member(private.household_from_path(name)));
create policy household_files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'household-files' and private.is_member(private.household_from_path(name)));
create policy household_files_update on storage.objects for update to authenticated
  using (bucket_id = 'household-files' and private.is_member(private.household_from_path(name)))
  with check (bucket_id = 'household-files' and private.is_member(private.household_from_path(name)));
create policy household_files_delete on storage.objects for delete to authenticated
  using (bucket_id = 'household-files' and private.is_member(private.household_from_path(name)));

-- ---------------------------------------------------------------------------------------------
-- 7. Functies. De logica draait als security definer in schema private (niet via de API
--    bereikbaar); in public staan dunne security-invoker-functies die de app aanroept.
-- ---------------------------------------------------------------------------------------------

-- Huishouden aanmaken: huishouden + jij als beheerder (met naam), in één keer.
create function private.create_household(p_name text, p_display_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  hid uuid;
begin
  if uid is null then raise exception 'Niet ingelogd' using errcode = '42501'; end if;
  if p_display_name is null or btrim(p_display_name) = '' then
    raise exception 'Vul je eigen naam in' using errcode = '22023';
  end if;
  insert into public.households (name, created_by) values (btrim(p_name), uid) returning id into hid;
  insert into public.household_members (household_id, user_id, role, kind, display_name)
    values (hid, uid, 'owner', 'adult', btrim(p_display_name));
  return hid;
end $$;

-- Uitnodiging gebruiken. Met member_id: koppelt jouw account aan dat bestaande lid (er ontstaat geen
-- tweede lid). Zonder member_id: maakt een nieuw lid met jouw naam.
create function private.accept_invite(p_token text, p_display_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  inv public.household_invites%rowtype;
  mem public.household_members%rowtype;
  mine uuid;
begin
  if uid is null then raise exception 'Niet ingelogd' using errcode = '42501'; end if;
  select * into inv from public.household_invites where token = p_token for update;
  if not found then raise exception 'Uitnodiging niet gevonden' using errcode = 'P0002'; end if;
  if inv.revoked_at is not null then raise exception 'Uitnodiging is ingetrokken' using errcode = '22023'; end if;
  if inv.used_at is not null then raise exception 'Uitnodiging is al gebruikt' using errcode = '22023'; end if;
  if inv.expires_at < now() then raise exception 'Uitnodiging is verlopen' using errcode = '22023'; end if;

  select m.id into mine from public.household_members m
    where m.household_id = inv.household_id and m.user_id = uid;

  if inv.member_id is not null then
    select * into mem from public.household_members where id = inv.member_id for update;
    if mine is not null and mine <> mem.id then
      raise exception 'Je account is in dit huishouden al aan een ander lid gekoppeld' using errcode = '23505';
    end if;
    if mem.user_id is not null and mem.user_id <> uid then
      raise exception 'Dit lid is al aan een ander account gekoppeld' using errcode = '23505';
    end if;
    if mem.user_id is null then
      update public.household_members set user_id = uid, role = inv.role where id = mem.id;
    end if;
  elsif mine is null then
    if p_display_name is null or btrim(p_display_name) = '' then
      raise exception 'Vul je eigen naam in' using errcode = '22023';
    end if;
    insert into public.household_members (household_id, user_id, role, kind, display_name)
      values (inv.household_id, uid, inv.role, 'adult', btrim(p_display_name));
  end if;

  update public.household_invites set used_by = uid, used_at = now() where id = inv.id;
  return inv.household_id;
end $$;

-- Beheer overdragen: het andere lid (met account) wordt beheerder, jij wordt gewoon lid.
create function private.transfer_ownership(p_household_id uuid, p_member_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  target public.household_members%rowtype;
begin
  if uid is null then raise exception 'Niet ingelogd' using errcode = '42501'; end if;
  if not private.is_owner(p_household_id) then
    raise exception 'Alleen een beheerder kan het beheer overdragen' using errcode = '42501';
  end if;
  select * into target from public.household_members
    where id = p_member_id and household_id = p_household_id for update;
  if not found then raise exception 'Lid niet gevonden in dit huishouden' using errcode = 'P0002'; end if;
  if target.user_id is null then
    raise exception 'Dit lid heeft nog geen account' using errcode = '22023';
  end if;
  if target.user_id = uid then
    raise exception 'Je bent al beheerder' using errcode = '22023';
  end if;
  update public.household_members set role = 'owner' where id = target.id;
  update public.household_members set role = 'member' where household_id = p_household_id and user_id = uid;
end $$;

-- Huishouden verlaten: je account wordt losgekoppeld; het lid en de data blijven bestaan.
create function private.leave_household(p_household_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  me public.household_members%rowtype;
begin
  if uid is null then raise exception 'Niet ingelogd' using errcode = '42501'; end if;
  select * into me from public.household_members
    where household_id = p_household_id and user_id = uid for update;
  if not found then raise exception 'Je bent geen lid van dit huishouden' using errcode = 'P0002'; end if;
  if me.role = 'owner' and not exists (
    select 1 from public.household_members m
    where m.household_id = p_household_id and m.role = 'owner' and m.user_id is not null and m.id <> me.id
  ) then
    raise exception 'Je bent de laatste beheerder: draag eerst het beheer over' using errcode = '23514';
  end if;
  update public.household_members set user_id = null, role = 'member' where id = me.id;
end $$;

revoke all on function private.create_household(text, text), private.accept_invite(text, text),
  private.transfer_ownership(uuid, uuid), private.leave_household(uuid) from public, anon;
grant execute on function private.create_household(text, text), private.accept_invite(text, text),
  private.transfer_ownership(uuid, uuid), private.leave_household(uuid) to authenticated;

-- Publieke functies (security invoker). create_household en accept_invite bestonden al als
-- security definer met dezelfde parameters; ze worden hier vervangen.
create or replace function public.create_household(p_name text, p_display_name text default null)
returns uuid language sql security invoker set search_path = '' as $$
  select private.create_household(p_name, p_display_name)
$$;
create or replace function public.accept_invite(p_token text, p_display_name text default null)
returns uuid language sql security invoker set search_path = '' as $$
  select private.accept_invite(p_token, p_display_name)
$$;
create function public.transfer_ownership(p_household_id uuid, p_member_id uuid)
returns void language sql security invoker set search_path = '' as $$
  select private.transfer_ownership(p_household_id, p_member_id)
$$;
create function public.leave_household(p_household_id uuid)
returns void language sql security invoker set search_path = '' as $$
  select private.leave_household(p_household_id)
$$;

revoke all on function public.create_household(text, text), public.accept_invite(text, text),
  public.transfer_ownership(uuid, uuid), public.leave_household(uuid) from public, anon;
grant execute on function public.create_household(text, text), public.accept_invite(text, text),
  public.transfer_ownership(uuid, uuid), public.leave_household(uuid) to authenticated;
