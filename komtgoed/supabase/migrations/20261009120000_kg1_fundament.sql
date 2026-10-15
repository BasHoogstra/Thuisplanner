-- KomtGoed (werknaam) · KG-1: lokaal databasefundament.
-- Accounts/profielen, huishoudens, leden, uitnodigingen, rollen en toegangsrechten.
--
-- Staat los van de Huisplan-database (supabase/): eigen map, eigen migraties, nergens aan gekoppeld.
-- Deze migratie is alleen lokaal getest (komtgoed/supabase/tests/run.sh) en wordt in KG-1 op geen
-- enkel Supabase-project uitgevoerd.
--
-- Uitgangspunten (docs/komtgoed-fundament.md; PRODUCT_PRINCIPLES.md principe 7; contract
-- docs/identiteit-en-items.md, 1 en 2.5):
--  - Een account (auth.users) en een huishoudlid (household_members) zijn verschillende dingen.
--    Een kind zonder account is een volwaardig lid. Een account is per huishouden aan hoogstens één
--    actief lid gekoppeld, en kan lid zijn van meerdere huishoudens.
--  - Toegang komt alleen van een account dat aan een ACTIEF lid is gekoppeld. Alleen de server
--    bepaalt dat (RLS en de functies hieronder). Een gearchiveerd lid heeft direct geen toegang meer.
--  - Rollen: 'owner' (eigenaar), 'admin' (beheerder), 'member' (lid). Eigenaar en beheerder zijn
--    altijd een actieve volwassene met account. Een huishouden houdt altijd minstens één eigenaar
--    met account.
--  - Een account wordt alleen via een uitnodiging aan een lid gekoppeld. Uitnodigingen bewaren
--    alleen een SHA-256-hash van de token; de token zelf komt één keer terug uit create_invite.
--  - Alle schrijfacties op huishoudens, leden en uitnodigingen lopen via functies; via de API kan
--    alleen een beperkt aantal kolommen direct worden bijgewerkt (kolomrechten + RLS + trigger).
--
-- Patronen overgenomen uit supabase/migrations (Huisplan 1.1/1.2), zonder die bestanden te wijzigen:
-- hulpfuncties in schema private (security definer, leeg search_path), dunne security-invoker-
-- functies in public, anon zonder rechten, guard-trigger en een uitgestelde eigenaarscontrole.

-- ---------------------------------------------------------------------------------------------
-- 0. Rechten vooraf: anon krijgt nergens iets; authenticated geen truncate/references/trigger.
-- ---------------------------------------------------------------------------------------------
alter default privileges for role postgres in schema public revoke all on tables from anon;
alter default privileges for role postgres in schema public revoke all on sequences from anon;
alter default privileges for role postgres in schema public revoke execute on functions from anon, public;
alter default privileges for role postgres in schema public revoke all on tables from authenticated;
alter default privileges for role postgres in schema public revoke execute on functions from authenticated;

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

-- Zichtbaarheid van inhoud (voor latere inhoudstabellen; zie private.can_read).
--  household: iedereen in het huishouden; members: de maker en de genoemde leden; private: de maker.
create type public.visibility as enum ('household', 'members', 'private');

-- ---------------------------------------------------------------------------------------------
-- 1. Tabellen
-- ---------------------------------------------------------------------------------------------
create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text check (display_name is null or char_length(btrim(display_name)) between 1 and 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 80),
  -- Mag het verwijderen van een account niet blokkeren (contract 5.2).
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.household_members (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  -- Verwijderen van een account ontkoppelt het lid. Voor een eigenaar of beheerder faalt dat op de
  -- check hieronder: eerst beheer overdragen (contract 2.5).
  user_id uuid references auth.users(id) on delete set null,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 80),
  kind text not null default 'adult' check (kind in ('adult', 'child')),
  role text not null default 'member' check (role in ('owner', 'admin', 'member')),
  status text not null default 'active' check (status in ('active', 'archived')),
  color text check (color is null or color ~ '^#[0-9a-fA-F]{6}$'),
  sort integer not null default 0,
  legacy_ids text[] not null default '{}',
  linked_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Doel voor samengestelde verwijzingen: een verwijzing naar een lid van een ander huishouden kan
  -- de database niet opslaan.
  constraint household_members_household_id_key unique (household_id, id),
  -- Eigenaar en beheerder: altijd een actieve volwassene met account.
  constraint household_members_manager_check
    check (role = 'member' or (user_id is not null and kind = 'adult' and status = 'active')),
  -- KG-1: een kind heeft geen account (kindaccounts vragen eigen rechten; later).
  constraint household_members_child_no_account check (kind = 'adult' or user_id is null),
  constraint household_members_archived_check check ((status = 'archived') = (archived_at is not null)),
  constraint household_members_linked_check check ((user_id is null) = (linked_at is null))
);
-- Een account is per huishouden aan hoogstens één actief lid gekoppeld.
create unique index household_members_household_user_active_key
  on public.household_members (household_id, user_id) where user_id is not null and status = 'active';
create index household_members_user_idx on public.household_members (user_id) where user_id is not null;
create index household_members_household_sort_idx on public.household_members (household_id, sort);

create table public.household_invites (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  -- Optioneel: koppelt het account aan dit bestaande lid (zonder account) in plaats van een nieuw lid.
  member_id uuid,
  role text not null default 'member' check (role in ('admin', 'member')),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  revoked_at timestamptz,
  accepted_at timestamptz,
  accepted_by uuid references auth.users(id) on delete set null,
  constraint household_invites_member_fkey foreign key (household_id, member_id)
    references public.household_members (household_id, id) on delete cascade,
  constraint household_invites_expiry_check
    check (expires_at > created_at and expires_at <= created_at + interval '30 days')
);
create index household_invites_household_idx on public.household_invites (household_id);
create index household_invites_member_idx on public.household_invites (household_id, member_id);

-- ---------------------------------------------------------------------------------------------
-- 2. Hulpfuncties (schema private; niet via de API aanroepbaar, wel door RLS-beleid te gebruiken)
-- ---------------------------------------------------------------------------------------------
create function private.is_active_member(p_household uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.household_members m
    where m.household_id = p_household and m.user_id = (select auth.uid()) and m.status = 'active'
  );
$$;

create function private.my_member_id(p_household uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select m.id from public.household_members m
  where m.household_id = p_household and m.user_id = (select auth.uid()) and m.status = 'active';
$$;

create function private.has_role(p_household uuid, p_roles text[])
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.household_members m
    where m.household_id = p_household and m.user_id = (select auth.uid())
      and m.status = 'active' and m.role = any (p_roles)
  );
$$;

-- Mag de ingelogde gebruiker inhoud met deze zichtbaarheid lezen? Faalt dicht: onbekend = nee.
-- p_owner: lid dat de inhoud maakte/bezit; p_audience: leden die 'members'-inhoud mogen zien.
create function private.can_read(p_household uuid, p_visibility public.visibility, p_owner uuid, p_audience uuid[])
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare
  me uuid := private.my_member_id(p_household);
begin
  if me is null or p_visibility is null then return false; end if;
  if p_visibility = 'household' then return true; end if;
  if p_visibility = 'private' then return p_owner is not null and p_owner = me; end if;
  if p_visibility = 'members' then
    return (p_owner is not null and p_owner = me) or me = any (coalesce(p_audience, '{}'::uuid[]));
  end if;
  return false;
end $$;

revoke all on function private.is_active_member(uuid), private.my_member_id(uuid),
  private.has_role(uuid, text[]), private.can_read(uuid, public.visibility, uuid, uuid[]) from public, anon;
grant execute on function private.is_active_member(uuid), private.my_member_id(uuid),
  private.has_role(uuid, text[]), private.can_read(uuid, public.visibility, uuid, uuid[]) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- 3. Triggers
-- ---------------------------------------------------------------------------------------------
create function private.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;
revoke all on function private.touch_updated_at() from public, anon, authenticated;
create trigger profiles_touch before update on public.profiles for each row execute function private.touch_updated_at();
create trigger households_touch before update on public.households for each row execute function private.touch_updated_at();
create trigger members_touch before update on public.household_members for each row execute function private.touch_updated_at();

-- Extra slot naast de kolomrechten: via de API (anon/authenticated) wijzigt een lid alleen
-- weergavegegevens. Identiteit, koppeling, rol en status lopen uitsluitend via de functies.
create function private.guard_member()
returns trigger language plpgsql set search_path = '' as $$
declare
  via_api boolean := current_user in ('anon', 'authenticated');
begin
  if tg_op = 'INSERT' then
    if via_api then raise exception 'Leden voeg je toe via add_member of een uitnodiging' using errcode = '42501'; end if;
    return new;
  end if;
  if new.id <> old.id or new.household_id <> old.household_id then
    raise exception 'Huishouden of member-ID van een lid kan niet worden gewijzigd' using errcode = '42501';
  end if;
  if via_api then
    if new.user_id is distinct from old.user_id or new.role is distinct from old.role
       or new.status is distinct from old.status or new.legacy_ids is distinct from old.legacy_ids
       or new.linked_at is distinct from old.linked_at or new.archived_at is distinct from old.archived_at then
      raise exception 'Koppeling, rol en status wijzig je via de functies' using errcode = '42501';
    end if;
    if not private.has_role(old.household_id, array['owner', 'admin']) then
      -- Een lid zonder beheerrechten past alleen de eigen naam en kleur aan.
      if old.user_id is distinct from (select auth.uid())
         or new.kind is distinct from old.kind or new.sort is distinct from old.sort then
        raise exception 'Alleen een beheerder kan dit wijzigen' using errcode = '42501';
      end if;
    end if;
  end if;
  return new;
end $$;
revoke all on function private.guard_member() from public, anon, authenticated;
create trigger members_guard before insert or update on public.household_members
  for each row execute function private.guard_member();

-- Een bestaand huishouden houdt altijd minstens één actieve eigenaar met account. Aan het einde van de
-- transactie gecontroleerd, zodat beheer overdragen in één keer kan. Een huishouden verwijderen mag.
create function private.ensure_owner()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.households h where h.id = old.household_id)
     and not exists (
       select 1 from public.household_members m
       where m.household_id = old.household_id and m.role = 'owner'
         and m.user_id is not null and m.status = 'active'
     ) then
    raise exception 'Een huishouden moet minstens één eigenaar met account houden' using errcode = '23514';
  end if;
  return null;
end $$;
revoke all on function private.ensure_owner() from public, anon, authenticated;
create constraint trigger members_ensure_owner after update or delete on public.household_members
  deferrable initially deferred for each row execute function private.ensure_owner();

-- ---------------------------------------------------------------------------------------------
-- 4. Row Level Security en kolomrechten
-- ---------------------------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.household_invites enable row level security;

revoke all on table public.profiles, public.households, public.household_members, public.household_invites
  from public, anon, authenticated;

-- profiles: alleen je eigen profiel.
grant select, insert (user_id, display_name), update (display_name) on public.profiles to authenticated;
create policy profiles_select on public.profiles for select to authenticated
  using (user_id = (select auth.uid()));
create policy profiles_insert on public.profiles for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy profiles_update on public.profiles for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- households: zien als actief lid; de naam wijzigen als eigenaar of beheerder. Aanmaken via functie.
grant select, update (name) on public.households to authenticated;
create policy households_select on public.households for select to authenticated
  using ((select private.is_active_member(id)));
create policy households_update on public.households for update to authenticated
  using ((select private.has_role(id, array['owner', 'admin'])))
  with check ((select private.has_role(id, array['owner', 'admin'])));

-- household_members: alle leden van je eigen huishouden zien; weergavegegevens bijwerken (beheer:
-- iedereen; lid: alleen zichzelf, zie guard_member). Toevoegen/koppelen/archiveren via functies.
grant select, update (display_name, color, sort, kind) on public.household_members to authenticated;
create policy members_select on public.household_members for select to authenticated
  using ((select private.is_active_member(household_id)));
create policy members_update on public.household_members for update to authenticated
  using ((select private.has_role(household_id, array['owner', 'admin'])) or user_id = (select auth.uid()))
  with check ((select private.is_active_member(household_id)));

-- household_invites: alleen eigenaar en beheerder zien ze, en nooit de tokenhash.
grant select (id, household_id, member_id, role, created_by, created_at, expires_at, revoked_at, accepted_at, accepted_by)
  on public.household_invites to authenticated;
create policy invites_select on public.household_invites for select to authenticated
  using ((select private.has_role(household_id, array['owner', 'admin'])));

-- ---------------------------------------------------------------------------------------------
-- 5. Functies: logica als security definer in private, dunne security-invoker-functies in public.
-- ---------------------------------------------------------------------------------------------
create function private.require_uid()
returns uuid language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := (select auth.uid());
begin
  if uid is null then raise exception 'Niet ingelogd' using errcode = '42501'; end if;
  return uid;
end $$;

create function private.clean_name(p_name text, p_melding text)
returns text language plpgsql immutable set search_path = '' as $$
begin
  if p_name is null or char_length(btrim(p_name)) not between 1 and 80 then
    raise exception '%', p_melding using errcode = '22023';
  end if;
  return btrim(p_name);
end $$;

-- Huishouden aanmaken: het huishouden en jij als eigenaar, in één keer.
create function private.create_household(p_name text, p_display_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := private.require_uid();
  hid uuid;
begin
  insert into public.households (name, created_by)
    values (private.clean_name(p_name, 'Geef het huishouden een naam (1-80 tekens)'), uid) returning id into hid;
  insert into public.household_members (household_id, user_id, role, kind, display_name, linked_at)
    values (hid, uid, 'owner', 'adult', private.clean_name(p_display_name, 'Vul je eigen naam in (1-80 tekens)'), now());
  return hid;
end $$;

-- Lid zonder account toevoegen (volwassene of kind). Alleen eigenaar of beheerder.
create function private.add_member(p_household uuid, p_display_name text, p_kind text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  mid uuid;
begin
  perform private.require_uid();
  if not private.has_role(p_household, array['owner', 'admin']) then
    raise exception 'Alleen een eigenaar of beheerder kan leden toevoegen' using errcode = '42501';
  end if;
  if p_kind is null or p_kind not in ('adult', 'child') then
    raise exception 'Soort lid moet adult of child zijn' using errcode = '22023';
  end if;
  insert into public.household_members (household_id, display_name, kind, role)
    values (p_household, private.clean_name(p_display_name, 'Vul een naam in (1-80 tekens)'), p_kind, 'member')
    returning id into mid;
  return mid;
end $$;

-- Uitnodiging maken. Geeft de token één keer terug; opgeslagen wordt alleen de SHA-256-hash.
-- Met p_member: voor een bestaand, actief, volwassen lid zonder account in dit huishouden.
create function private.create_invite(p_household uuid, p_member uuid, p_role text, p_days integer)
returns text language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := private.require_uid();
  tok text;
  mem public.household_members%rowtype;
begin
  if not private.has_role(p_household, array['owner', 'admin']) then
    raise exception 'Alleen een eigenaar of beheerder kan uitnodigen' using errcode = '42501';
  end if;
  if p_role is null or p_role not in ('admin', 'member') then
    raise exception 'Rol moet admin of member zijn (eigenaar worden gaat via overdracht)' using errcode = '22023';
  end if;
  if p_role = 'admin' and not private.has_role(p_household, array['owner']) then
    raise exception 'Alleen een eigenaar kan iemand als beheerder uitnodigen' using errcode = '42501';
  end if;
  if p_days is null or p_days not between 1 and 30 then
    raise exception 'Geldigheid moet 1 tot 30 dagen zijn' using errcode = '22023';
  end if;
  if p_member is not null then
    select * into mem from public.household_members where id = p_member and household_id = p_household;
    if not found then raise exception 'Lid niet gevonden in dit huishouden' using errcode = 'P0002'; end if;
    if mem.status <> 'active' then raise exception 'Dit lid is gearchiveerd' using errcode = '22023'; end if;
    if mem.kind <> 'adult' then raise exception 'Een kind kan (nog) geen account krijgen' using errcode = '22023'; end if;
    if mem.user_id is not null then raise exception 'Dit lid heeft al een account' using errcode = '22023'; end if;
  end if;
  tok := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.household_invites (household_id, member_id, role, token_hash, created_by, expires_at)
    values (p_household, p_member, p_role, encode(extensions.digest(tok, 'sha256'), 'hex'), uid,
            now() + make_interval(days => p_days));
  return tok;
end $$;

create function private.revoke_invite(p_invite uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  inv public.household_invites%rowtype;
begin
  perform private.require_uid();
  select * into inv from public.household_invites where id = p_invite for update;
  if not found or not private.has_role(inv.household_id, array['owner', 'admin']) then
    raise exception 'Uitnodiging niet gevonden' using errcode = 'P0002';
  end if;
  if inv.accepted_at is not null then raise exception 'Uitnodiging is al gebruikt' using errcode = '22023'; end if;
  update public.household_invites set revoked_at = coalesce(revoked_at, now()) where id = inv.id;
end $$;

-- Uitnodiging gebruiken. Met member_id: koppelt jouw account aan dat bestaande lid. Zonder: maakt een
-- nieuw (volwassen) lid met jouw naam. Elke uitnodiging werkt precies één keer.
create function private.accept_invite(p_token text, p_display_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := private.require_uid();
  inv public.household_invites%rowtype;
  mem public.household_members%rowtype;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then
    raise exception 'Uitnodiging niet gevonden' using errcode = 'P0002';
  end if;
  select * into inv from public.household_invites
    where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex') for update;
  if not found then raise exception 'Uitnodiging niet gevonden' using errcode = 'P0002'; end if;
  if inv.revoked_at is not null then raise exception 'Uitnodiging is ingetrokken' using errcode = '22023'; end if;
  if inv.accepted_at is not null then raise exception 'Uitnodiging is al gebruikt' using errcode = '22023'; end if;
  if inv.expires_at <= now() then raise exception 'Uitnodiging is verlopen' using errcode = '22023'; end if;
  if private.is_active_member(inv.household_id) then
    raise exception 'Je bent al lid van dit huishouden' using errcode = '23505';
  end if;

  if inv.member_id is not null then
    select * into mem from public.household_members where id = inv.member_id and household_id = inv.household_id for update;
    if not found or mem.status <> 'active' or mem.kind <> 'adult' or mem.user_id is not null then
      raise exception 'Deze uitnodiging is niet meer geldig' using errcode = '22023';
    end if;
    update public.household_members set user_id = uid, linked_at = now(), role = inv.role where id = mem.id;
  else
    insert into public.household_members (household_id, user_id, role, kind, display_name, linked_at)
      values (inv.household_id, uid, inv.role, 'adult',
              private.clean_name(p_display_name, 'Vul je eigen naam in (1-80 tekens)'), now());
  end if;

  update public.household_invites set accepted_at = now(), accepted_by = uid where id = inv.id;
  return inv.household_id;
end $$;

-- Rol wijzigen tussen admin en member. Alleen een eigenaar; eigenaar worden gaat via overdracht.
create function private.set_member_role(p_household uuid, p_member uuid, p_role text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  mem public.household_members%rowtype;
begin
  perform private.require_uid();
  if not private.has_role(p_household, array['owner']) then
    raise exception 'Alleen een eigenaar kan rollen wijzigen' using errcode = '42501';
  end if;
  if p_role is null or p_role not in ('admin', 'member') then
    raise exception 'Rol moet admin of member zijn' using errcode = '22023';
  end if;
  select * into mem from public.household_members where id = p_member and household_id = p_household for update;
  if not found then raise exception 'Lid niet gevonden in dit huishouden' using errcode = 'P0002'; end if;
  if mem.role = 'owner' then raise exception 'Een eigenaar wijzig je via overdracht' using errcode = '22023'; end if;
  update public.household_members set role = p_role where id = mem.id; -- check: admin = actieve volwassene met account
end $$;

-- Lid archiveren: verliest direct alle toegang. Een eigenaar kan niet worden gearchiveerd (eerst
-- overdragen); een beheerder archiveert alleen gewone leden. Jezelf archiveren gaat via leave_household.
create function private.archive_member(p_household uuid, p_member uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  mem public.household_members%rowtype;
begin
  perform private.require_uid();
  if not private.has_role(p_household, array['owner', 'admin']) then
    raise exception 'Alleen een eigenaar of beheerder kan leden archiveren' using errcode = '42501';
  end if;
  select * into mem from public.household_members where id = p_member and household_id = p_household for update;
  if not found then raise exception 'Lid niet gevonden in dit huishouden' using errcode = 'P0002'; end if;
  if mem.status = 'archived' then return; end if;
  if mem.id = private.my_member_id(p_household) then
    raise exception 'Jezelf verwijderen gaat via leave_household' using errcode = '22023';
  end if;
  if mem.role = 'owner' then raise exception 'Een eigenaar kan niet worden gearchiveerd' using errcode = '22023'; end if;
  if mem.role = 'admin' and not private.has_role(p_household, array['owner']) then
    raise exception 'Alleen een eigenaar kan een beheerder archiveren' using errcode = '42501';
  end if;
  update public.household_members set status = 'archived', archived_at = now(), role = 'member' where id = mem.id;
  -- Open uitnodigingen voor dit lid vervallen.
  update public.household_invites set revoked_at = now()
    where member_id = mem.id and accepted_at is null and revoked_at is null;
end $$;

-- Eigendom overdragen aan een actieve volwassene met account; jij wordt beheerder.
create function private.transfer_ownership(p_household uuid, p_member uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  me uuid := private.my_member_id(p_household);
  target public.household_members%rowtype;
begin
  perform private.require_uid();
  if not private.has_role(p_household, array['owner']) then
    raise exception 'Alleen een eigenaar kan het eigendom overdragen' using errcode = '42501';
  end if;
  select * into target from public.household_members where id = p_member and household_id = p_household for update;
  if not found then raise exception 'Lid niet gevonden in dit huishouden' using errcode = 'P0002'; end if;
  if target.id = me then raise exception 'Je bent al eigenaar' using errcode = '22023'; end if;
  if target.user_id is null or target.status <> 'active' or target.kind <> 'adult' then
    raise exception 'Alleen een actieve volwassene met account kan eigenaar worden' using errcode = '22023';
  end if;
  update public.household_members set role = 'owner' where id = target.id;
  update public.household_members set role = 'admin' where id = me;
end $$;

-- Huishouden verlaten: je account wordt losgekoppeld. Het lid (de persoon) blijft bestaan, zonder
-- account; archiveren is een aparte keuze van de beheerders. De laatste eigenaar kan niet weg.
create function private.leave_household(p_household uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  me public.household_members%rowtype;
begin
  perform private.require_uid();
  select * into me from public.household_members
    where household_id = p_household and user_id = (select auth.uid()) and status = 'active' for update;
  if not found then raise exception 'Je bent geen lid van dit huishouden' using errcode = 'P0002'; end if;
  if me.role = 'owner' and not exists (
    select 1 from public.household_members m
    where m.household_id = p_household and m.role = 'owner' and m.user_id is not null
      and m.status = 'active' and m.id <> me.id
  ) then
    raise exception 'Je bent de laatste eigenaar: draag eerst het eigendom over' using errcode = '23514';
  end if;
  update public.household_members set user_id = null, linked_at = null, role = 'member' where id = me.id;
end $$;

revoke all on function private.require_uid(), private.clean_name(text, text),
  private.create_household(text, text), private.add_member(uuid, text, text),
  private.create_invite(uuid, uuid, text, integer), private.revoke_invite(uuid),
  private.accept_invite(text, text), private.set_member_role(uuid, uuid, text),
  private.archive_member(uuid, uuid), private.transfer_ownership(uuid, uuid),
  private.leave_household(uuid) from public, anon;
grant execute on function private.require_uid(), private.clean_name(text, text),
  private.create_household(text, text), private.add_member(uuid, text, text),
  private.create_invite(uuid, uuid, text, integer), private.revoke_invite(uuid),
  private.accept_invite(text, text), private.set_member_role(uuid, uuid, text),
  private.archive_member(uuid, uuid), private.transfer_ownership(uuid, uuid),
  private.leave_household(uuid) to authenticated;

-- Publieke functies (security invoker): wat de app straks aanroept.
create function public.create_household(p_name text, p_display_name text)
returns uuid language sql security invoker set search_path = '' as $$
  select private.create_household(p_name, p_display_name)
$$;
create function public.add_member(p_household uuid, p_display_name text, p_kind text default 'adult')
returns uuid language sql security invoker set search_path = '' as $$
  select private.add_member(p_household, p_display_name, p_kind)
$$;
create function public.create_invite(p_household uuid, p_member uuid default null, p_role text default 'member', p_days integer default 7)
returns text language sql security invoker set search_path = '' as $$
  select private.create_invite(p_household, p_member, p_role, p_days)
$$;
create function public.revoke_invite(p_invite uuid)
returns void language sql security invoker set search_path = '' as $$
  select private.revoke_invite(p_invite)
$$;
create function public.accept_invite(p_token text, p_display_name text default null)
returns uuid language sql security invoker set search_path = '' as $$
  select private.accept_invite(p_token, p_display_name)
$$;
create function public.set_member_role(p_household uuid, p_member uuid, p_role text)
returns void language sql security invoker set search_path = '' as $$
  select private.set_member_role(p_household, p_member, p_role)
$$;
create function public.archive_member(p_household uuid, p_member uuid)
returns void language sql security invoker set search_path = '' as $$
  select private.archive_member(p_household, p_member)
$$;
create function public.transfer_ownership(p_household uuid, p_member uuid)
returns void language sql security invoker set search_path = '' as $$
  select private.transfer_ownership(p_household, p_member)
$$;
create function public.leave_household(p_household uuid)
returns void language sql security invoker set search_path = '' as $$
  select private.leave_household(p_household)
$$;

revoke all on function public.create_household(text, text), public.add_member(uuid, text, text),
  public.create_invite(uuid, uuid, text, integer), public.revoke_invite(uuid),
  public.accept_invite(text, text), public.set_member_role(uuid, uuid, text),
  public.archive_member(uuid, uuid), public.transfer_ownership(uuid, uuid),
  public.leave_household(uuid) from public, anon;
grant execute on function public.create_household(text, text), public.add_member(uuid, text, text),
  public.create_invite(uuid, uuid, text, integer), public.revoke_invite(uuid),
  public.accept_invite(text, text), public.set_member_role(uuid, uuid, text),
  public.archive_member(uuid, uuid), public.transfer_ownership(uuid, uuid),
  public.leave_household(uuid) to authenticated;
