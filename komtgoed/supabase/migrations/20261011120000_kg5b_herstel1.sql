-- KomtGoed (werknaam) · KG-5B herstelronde 1: bevindingen uit de onafhankelijke review van PR #19 (6da0f47).
-- Geen nieuwe app-functies; alleen beveiliging.
--
--  P1 Races: een autorisatie die op een oude momentopname is gecontroleerd, kon na intrekking van de
--     toegang alsnog een mutatie uitvoeren (delete_household, set_member_role, ...).
--  P1 Een oude beheerdersuitnodiging bleef bruikbaar nadat de maker zijn bevoegdheid kwijt was.
--  P1 Twee eigenaars die tegelijk vertrekken, konden samen de laatste eigenaar laten verdwijnen.
--  P2 households.created_by (een account-ID) was leesbaar via de API.
--  P2 De limiet van 10 eigen huishoudens gold niet bij eigendomsoverdracht en niet bij gelijktijdige
--     transacties.
--
-- VERGRENDELINGSPROTOCOL (geldt voor elke mutatie op lidmaatschap, rollen, uitnodigingen of het
-- huishouden zelf):
--  1. Eerst private.lock_household(h): een rijvergrendeling (FOR NO KEY UPDATE) op de rij van het
--     huishouden in public.households. Alle mutaties binnen één huishouden lopen daardoor na elkaar.
--     Raakt een mutatie meerdere huishoudens (account verwijderen), dan vergrendelt ze die in
--     oplopende volgorde van id.
--  2. Pas daarna de autorisatie (has_role, is_active_member, ...) en alle andere controles. In read
--     committed krijgt elke opdracht na de wachttijd een verse momentopname, dus een rol die intussen
--     is ingetrokken, wordt gezien. lock_household weigert daarom andere isolatieniveaus (fail closed).
--  3. Dan pas rijen van leden en uitnodigingen (FOR UPDATE), en als laatste, alleen waar een account
--     eigenaar wordt, de accountvergrendeling private.lock_owner_count(user) (advisory lock op het
--     account), zodat de telling van eigen huishoudens over huishoudens heen klopt.
--  Vaste volgorde: huishouden(s) → rijen → account. De controle "minstens één eigenaar" (ensure_owner,
--  uitgesteld) vergrendelt het huishouden ook en controleert daarna opnieuw. Directe API-wijzigingen
--  (naam van het huishouden, weergavegegevens van een lid) controleren de rol opnieuw ná de
--  vergrendeling, in een trigger.

-- ---------------------------------------------------------------------------------------------
-- Vergrendeling
-- ---------------------------------------------------------------------------------------------
create function private.lock_household(p_household uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'Deze wijziging vraagt isolatieniveau read committed' using errcode = '25001';
  end if;
  perform 1 from public.households h where h.id = p_household for no key update;
end $$;

create function private.lock_owner_count(p_user uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('komtgoed:eigenaar:' || p_user::text, 0));
end $$;

create function private.owned_household_count(p_user uuid)
returns integer language sql stable security definer set search_path = '' as $$
  select count(*)::int from public.household_members m
  where m.user_id = p_user and m.status = 'active' and m.role = 'owner';
$$;

-- Mag de maker van een uitnodiging die uitnodiging nú nog geven? Beheerder-uitnodiging: alleen een
-- actieve eigenaar. Gewone uitnodiging: actieve eigenaar of beheerder. Maker weg (account verwijderd,
-- vertrokken, gearchiveerd, rol kwijt): ongeldig.
create function private.invite_creator_authorized(p_household uuid, p_created_by uuid, p_role text)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_created_by is not null and exists (
    select 1 from public.household_members c
    where c.household_id = p_household and c.user_id = p_created_by and c.status = 'active'
      and (c.role = 'owner' or (p_role = 'member' and c.role = 'admin'))
  );
$$;

-- Open uitnodigingen waarvan de maker de bevoegdheid kwijt is, vervallen direct (ook zichtbaar voor
-- beheer). accept_invite controleert het daarnaast zelf.
create function private.revoke_unauthorized_invites(p_household uuid)
returns void language sql security definer set search_path = '' as $$
  update public.household_invites i set revoked_at = now()
  where i.household_id = p_household and i.accepted_at is null and i.revoked_at is null
    and not private.invite_creator_authorized(i.household_id, i.created_by, i.role);
$$;

revoke all on function private.lock_household(uuid), private.lock_owner_count(uuid),
  private.owned_household_count(uuid), private.invite_creator_authorized(uuid, uuid, text),
  private.revoke_unauthorized_invites(uuid) from public, anon, authenticated;
-- guard_member (security invoker) vergrendelt het huishouden bij een directe API-wijziging.
grant execute on function private.lock_household(uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- P2: households.created_by niet via de API
-- ---------------------------------------------------------------------------------------------
revoke select on public.households from authenticated;
grant select (id, name, created_at, updated_at) on public.households to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Triggers: eigenaarscontrole en directe API-wijzigingen
-- ---------------------------------------------------------------------------------------------
create or replace function private.ensure_owner()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- Vergrendelen en dan pas tellen: twee transacties die elk een eigenaar weghalen, worden zo na
  -- elkaar gecontroleerd en de tweede ziet de eerste.
  perform private.lock_household(old.household_id);
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

create or replace function private.guard_member()
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
    -- Protocol: eerst het huishouden, dan opnieuw de rechten (verse momentopname).
    perform private.lock_household(old.household_id);
    if not private.is_active_member(old.household_id) then
      raise exception 'Je bent geen actief lid van dit huishouden' using errcode = '42501';
    end if;
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

-- De naam van een huishouden wijzigen via de API: de rij is dan al vergrendeld; de rol wordt hier
-- opnieuw gecontroleerd, ná eventuele lopende rolwijzigingen.
create function private.guard_household()
returns trigger language plpgsql set search_path = '' as $$
begin
  if current_user in ('anon', 'authenticated') then
    perform private.lock_household(old.id);
    if not private.has_role(old.id, array['owner', 'admin']) then
      raise exception 'Alleen een eigenaar of beheerder kan het huishouden wijzigen' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
revoke all on function private.guard_household() from public, anon, authenticated;
create trigger households_guard before update on public.households
  for each row execute function private.guard_household();

-- ---------------------------------------------------------------------------------------------
-- Functies volgens het protocol
-- ---------------------------------------------------------------------------------------------
create or replace function private.create_household(p_name text, p_display_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := private.require_uid();
  hid uuid;
begin
  perform private.lock_owner_count(uid);
  if private.owned_household_count(uid) >= 10 then
    raise exception 'Je bent al eigenaar van 10 huishoudens' using errcode = '54000';
  end if;
  insert into public.households (name, created_by)
    values (private.clean_name(p_name, 'Geef het huishouden een naam (1-80 tekens)'), uid) returning id into hid;
  insert into public.household_members (household_id, user_id, role, kind, display_name, linked_at)
    values (hid, uid, 'owner', 'adult', private.clean_name(p_display_name, 'Vul je eigen naam in (1-80 tekens)'), now());
  return hid;
end $$;

create or replace function private.add_member(p_household uuid, p_display_name text, p_kind text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  mid uuid;
begin
  perform private.require_uid();
  perform private.lock_household(p_household);
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

create or replace function private.create_invite(p_household uuid, p_member uuid, p_role text, p_days integer)
returns text language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := private.require_uid();
  tok text;
  mem public.household_members%rowtype;
begin
  perform private.lock_household(p_household);
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
    select * into mem from public.household_members where id = p_member and household_id = p_household for update;
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

create or replace function private.revoke_invite(p_invite uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  hid uuid;
  inv public.household_invites%rowtype;
begin
  perform private.require_uid();
  select i.household_id into hid from public.household_invites i where i.id = p_invite;
  if found then perform private.lock_household(hid); end if;
  select * into inv from public.household_invites where id = p_invite for update;
  if not found or not private.has_role(inv.household_id, array['owner', 'admin']) then
    raise exception 'Uitnodiging niet gevonden' using errcode = 'P0002';
  end if;
  if inv.accepted_at is not null then raise exception 'Uitnodiging is al gebruikt' using errcode = '22023'; end if;
  update public.household_invites set revoked_at = coalesce(revoked_at, now()) where id = inv.id;
end $$;

create or replace function private.accept_invite(p_token text, p_display_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := private.require_uid();
  hash text;
  hid uuid;
  inv public.household_invites%rowtype;
  mem public.household_members%rowtype;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then
    raise exception 'Uitnodiging niet gevonden' using errcode = 'P0002';
  end if;
  hash := encode(extensions.digest(p_token, 'sha256'), 'hex');
  select i.household_id into hid from public.household_invites i where i.token_hash = hash;
  if not found then raise exception 'Uitnodiging niet gevonden' using errcode = 'P0002'; end if;
  perform private.lock_household(hid);
  select * into inv from public.household_invites where token_hash = hash for update;
  if not found then raise exception 'Uitnodiging niet gevonden' using errcode = 'P0002'; end if;
  if inv.revoked_at is not null then raise exception 'Uitnodiging is ingetrokken' using errcode = '22023'; end if;
  if inv.accepted_at is not null then raise exception 'Uitnodiging is al gebruikt' using errcode = '22023'; end if;
  if inv.expires_at <= now() then raise exception 'Uitnodiging is verlopen' using errcode = '22023'; end if;
  -- De maker moet deze uitnodiging nu nog mogen geven (zie invite_creator_authorized).
  if not private.invite_creator_authorized(inv.household_id, inv.created_by, inv.role) then
    raise exception 'Deze uitnodiging is niet meer geldig' using errcode = '22023';
  end if;
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

create or replace function private.set_member_role(p_household uuid, p_member uuid, p_role text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  mem public.household_members%rowtype;
begin
  perform private.require_uid();
  perform private.lock_household(p_household);
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
  perform private.revoke_unauthorized_invites(p_household);
end $$;

create or replace function private.archive_member(p_household uuid, p_member uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  mem public.household_members%rowtype;
begin
  perform private.require_uid();
  perform private.lock_household(p_household);
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
  -- Open uitnodigingen voor dit lid, en die dit lid niet meer mag geven, vervallen.
  update public.household_invites set revoked_at = now()
    where member_id = mem.id and accepted_at is null and revoked_at is null;
  perform private.revoke_unauthorized_invites(p_household);
end $$;

create or replace function private.transfer_ownership(p_household uuid, p_member uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  me uuid;
  target public.household_members%rowtype;
begin
  perform private.require_uid();
  perform private.lock_household(p_household);
  me := private.my_member_id(p_household);
  if not private.has_role(p_household, array['owner']) then
    raise exception 'Alleen een eigenaar kan het eigendom overdragen' using errcode = '42501';
  end if;
  select * into target from public.household_members where id = p_member and household_id = p_household for update;
  if not found then raise exception 'Lid niet gevonden in dit huishouden' using errcode = 'P0002'; end if;
  if target.id = me then raise exception 'Je bent al eigenaar' using errcode = '22023'; end if;
  if target.user_id is null or target.status <> 'active' or target.kind <> 'adult' then
    raise exception 'Alleen een actieve volwassene met account kan eigenaar worden' using errcode = '22023';
  end if;
  -- Limiet van 10 eigen huishoudens, ook bij gelijktijdige overdrachten (accountvergrendeling).
  perform private.lock_owner_count(target.user_id);
  if private.owned_household_count(target.user_id) >= 10 then
    raise exception 'Dit lid is al eigenaar van 10 huishoudens' using errcode = '54000';
  end if;
  update public.household_members set role = 'owner' where id = target.id;
  update public.household_members set role = 'admin' where id = me;
  perform private.revoke_unauthorized_invites(p_household);
end $$;

create or replace function private.leave_household(p_household uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  me public.household_members%rowtype;
begin
  perform private.require_uid();
  perform private.lock_household(p_household);
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
  perform private.revoke_unauthorized_invites(p_household);
end $$;

create or replace function private.delete_household(p_household uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_uid();
  perform private.lock_household(p_household);
  if not private.has_role(p_household, array['owner']) then
    raise exception 'Alleen een eigenaar kan het huishouden verwijderen' using errcode = '42501';
  end if;
  delete from public.households where id = p_household;
end $$;

create or replace function private.before_account_delete()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  hid uuid;
  m record;
begin
  -- Protocol: eerst alle betrokken huishoudens, in vaste volgorde.
  for hid in
    select distinct h.household_id from public.household_members h where h.user_id = old.id order by 1
  loop
    perform private.lock_household(hid);
  end loop;
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
  -- Uitnodigingen van dit account vervallen.
  update public.household_invites set revoked_at = now()
    where created_by = old.id and accepted_at is null and revoked_at is null;
  return old;
end $$;
