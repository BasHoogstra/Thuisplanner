-- Thuisplanner · KG-5H deel 2: de toegangspoort. Zie docs/thuisplanner-deel2-bouwscope.md §1 en §4.
--
-- Supabase Auth kan wachtwoorden niet uitzetten terwijl inloggen met een code aan blijft. Lokaal aangetoond: een
-- aanvaller kan vooraf een account met andermans adres en een eigen wachtwoord aanmaken (en na de bevestiging door
-- het slachtoffer met dat wachtwoord inloggen), en met een gestolen sessie een wachtwoord toevoegen dat na "overal
-- uitloggen" blijft werken. Daarom geeft de database alleen toegang aan een sessie die:
-- - met een code is begonnen (de amr-claim van het token bevat 'otp', en verder niets dan 'otp' of 'totp');
-- - nog bestaat (de session_id uit het token staat in auth.sessions): "uitloggen op alle toestellen" en de noodstop
--   op sessies werken daardoor direct, niet pas als het toegangstoken na een uur verloopt;
-- - niet valt onder de noodstop "onderhoud: dicht".
-- Ontbreekt de amr-claim, dan is er geen toegang (fail-closed).
--
-- Alles wat toegang geeft, loopt via private.uid(): RLS-policies, RPC's (via private.require_uid) en Realtime (via
-- private.may_listen → private.is_active_member). Geen enkele andere functie of policy gebruikt nog auth.uid().
-- Opslag (Storage) gebruikt Thuisplanner niet: er zijn geen buckets en geen storage-policies (de nacontrole kijkt dat na).
--
-- Daarnaast de testpoort (G1): een eigen huishouden aanmaken alleen als dat open staat, of voor wie op de
-- testerslijst staat. Een uitnodiging accepteren kan iedereen met een account.

-- ---------------------------------------------------------------------------------------------
-- 1. Instellingen en testerslijst (alleen de databasebeheerder wijzigt ze; niet via de API)
-- ---------------------------------------------------------------------------------------------
create table private.instellingen (
  id integer primary key default 1 check (id = 1),
  -- Alleen de lokale ontwikkel- en testomgeving zet dit aan (scripts/lokaal.mjs, tests/integratie/run.sh): de
  -- fictieve accounts loggen daar met een wachtwoord in. Op staging, bèta en productie altijd uit (nacontrole).
  wachtwoordsessies_toegestaan boolean not null default false,
  -- Controle dat de sessie nog bestaat. Alleen voor de nabootsing zonder auth.sessions uit te zetten; nooit online.
  sessiecontrole boolean not null default true,
  -- Noodstop: 'dicht' = niemand heeft toegang (bestaande sessies ook niet), tot hij weer leeg is.
  onderhoud text check (onderhoud in ('dicht')),
  -- Testpoort G1: iedereen mag een huishouden aanmaken (bij de commerciële start), of alleen de testerslijst.
  huishouden_open boolean not null default false,
  -- Noodstop: geen nieuwe accounts (de codelaag stuurt dan een uitlegmail in plaats van een code), en geen codes.
  registratie_open boolean not null default true,
  codes_aan boolean not null default true
);
insert into private.instellingen (id) values (1);

create table private.testers (
  email text primary key check (email = lower(btrim(email)) and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  toegevoegd timestamptz not null default now()
);

revoke all on table private.instellingen, private.testers from public, anon, authenticated;

-- De instellingenrij blijft altijd bestaan: wijzigen mag, verwijderen of leegmaken niet. (Ontbreekt hij toch, dan is de
-- poort dicht; zie toegang_status.) Een herstel met session_replication_role = replica slaat deze triggers bewust over.
create function private.instellingen_blijft()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'private.instellingen heeft altijd precies één rij; wijzig de waarden in plaats van de rij te verwijderen';
end $$;
revoke all on function private.instellingen_blijft() from public, anon, authenticated;
create trigger instellingen_niet_verwijderen before delete on private.instellingen
  for each row execute function private.instellingen_blijft();
create trigger instellingen_niet_leegmaken before truncate on private.instellingen
  for each statement execute function private.instellingen_blijft();

-- ---------------------------------------------------------------------------------------------
-- 2. De poort
-- ---------------------------------------------------------------------------------------------
-- 'ok', 'geen-sessie', 'code-nodig' (geen code-sessie, bijvoorbeeld een wachtwoord), 'sessie-ingetrokken' of 'onderhoud'.
create function private.toegang_status()
returns text language plpgsql stable security definer set search_path = '' as $$
declare
  claims jsonb := auth.jwt();
  inst private.instellingen%rowtype;
  methoden text[];
  sid text;
begin
  if (select auth.uid()) is null then return 'geen-sessie'; end if;
  select * into inst from private.instellingen where id = 1;
  -- Zonder instellingenrij zijn alle schakelaars NULL en sloegen de controles hieronder over: dan dicht (fail-closed).
  if not found then return 'onderhoud'; end if;
  if inst.onderhoud = 'dicht' then return 'onderhoud'; end if;
  select coalesce(array_agg(e ->> 'method'), '{}') into methoden
  from jsonb_array_elements(case when jsonb_typeof(claims -> 'amr') = 'array' then claims -> 'amr' else '[]'::jsonb end) e;
  if not ('otp' = any (methoden) or (inst.wachtwoordsessies_toegestaan and 'password' = any (methoden))) then
    return 'code-nodig';
  end if;
  if exists (select 1 from unnest(methoden) m
             where m is distinct from 'otp' and m is distinct from 'totp'
               and not (inst.wachtwoordsessies_toegestaan and m = 'password')) then
    return 'code-nodig';
  end if;
  if inst.sessiecontrole then
    sid := claims ->> 'session_id';
    if sid is null or sid !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       or not exists (select 1 from auth.sessions s where s.id = sid::uuid) then
      return 'sessie-ingetrokken';
    end if;
  end if;
  return 'ok';
end $$;

-- Het account van deze sessie, of null als de poort geen toegang geeft. Gebruik dit in plaats van auth.uid().
create function private.uid()
returns uuid language sql stable security definer set search_path = '' as $$
  select case when private.toegang_status() = 'ok' then (select auth.uid()) end
$$;

revoke all on function private.toegang_status(), private.uid() from public, anon;
grant execute on function private.toegang_status(), private.uid() to authenticated;

-- RPC's: een duidelijke, stabiele code als de poort weigert.
create or replace function private.require_uid()
returns uuid language plpgsql stable security definer set search_path = '' as $$
declare s text := private.toegang_status();
begin
  if s = 'ok' then return (select auth.uid()); end if;
  if s = 'code-nodig' then raise exception 'Log opnieuw in met een code' using errcode = 'TPA01'; end if;
  if s = 'sessie-ingetrokken' then raise exception 'Je bent uitgelogd. Log opnieuw in met een code' using errcode = 'TPA02'; end if;
  if s = 'onderhoud' then raise exception 'Thuisplanner is even niet beschikbaar' using errcode = 'TPA03'; end if;
  raise exception 'Niet ingelogd' using errcode = '42501';
end $$;

-- ---------------------------------------------------------------------------------------------
-- 3. Alle toegangsfuncties via private.uid()
-- ---------------------------------------------------------------------------------------------
create or replace function private.is_active_member(p_household uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.household_members m
    where m.household_id = p_household and m.user_id = (select private.uid()) and m.status = 'active'
  );
$$;

create or replace function private.my_member_id(p_household uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select m.id from public.household_members m
  where m.household_id = p_household and m.user_id = (select private.uid()) and m.status = 'active';
$$;

create or replace function private.has_role(p_household uuid, p_roles text[])
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.household_members m
    where m.household_id = p_household and m.user_id = (select private.uid())
      and m.status = 'active' and m.role = any (p_roles)
  );
$$;

create or replace function private.my_memberships()
returns table (household_id uuid, member_id uuid, role text)
language sql stable security definer set search_path = '' as $$
  select m.household_id, m.id, m.role from public.household_members m
  where m.user_id = (select private.uid()) and m.status = 'active';
$$;

create or replace function private.my_household_ids()
returns setof uuid language sql stable security definer set search_path = '' as $$
  select m.household_id from public.household_members m
  where m.user_id = (select private.uid()) and m.status = 'active';
$$;

create or replace function private.is_my_event(p_owner_member uuid, p_owner_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_owner_user is not null and p_owner_user = (select private.uid())
     and p_owner_member in (select mm.member_id from private.my_memberships() mm);
$$;

create or replace function private.my_email()
returns text language sql stable security definer set search_path = '' as $$
  select lower(u.email) from auth.users u
  where u.id = (select private.uid()) and u.email_confirmed_at is not null and u.email is not null
$$;

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
      if old.user_id is distinct from (select private.uid())
         or new.kind is distinct from old.kind or new.sort is distinct from old.sort then
        raise exception 'Alleen een beheerder kan dit wijzigen' using errcode = '42501';
      end if;
    end if;
  end if;
  return new;
end $$;

create or replace function private.leave_household(p_household uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  me public.household_members%rowtype;
  uid uuid := private.require_uid();
begin
  perform private.lock_household(p_household);
  select * into me from public.household_members
    where household_id = p_household and user_id = uid and status = 'active' for update;
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

-- Het eigen profiel (de naam die Thuisplanner één keer vraagt).
drop policy profiles_select on public.profiles;
drop policy profiles_insert on public.profiles;
drop policy profiles_update on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (user_id = (select private.uid()));
create policy profiles_insert on public.profiles for insert to authenticated
  with check (user_id = (select private.uid()));
create policy profiles_update on public.profiles for update to authenticated
  using (user_id = (select private.uid())) with check (user_id = (select private.uid()));

-- ---------------------------------------------------------------------------------------------
-- 4. Testpoort G1
-- ---------------------------------------------------------------------------------------------
create function private.mag_huishouden_maken()
returns boolean language sql stable security definer set search_path = '' as $$
  select (select private.uid()) is not null and (
    coalesce((select i.huishouden_open from private.instellingen i where i.id = 1), false)
    or exists (select 1 from private.testers t where t.email = private.my_email())
  )
$$;
revoke all on function private.mag_huishouden_maken() from public, anon;
grant execute on function private.mag_huishouden_maken() to authenticated;

create or replace function private.create_household(p_name text, p_display_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := private.require_uid();
  hid uuid;
begin
  if not private.mag_huishouden_maken() then
    raise exception 'Thuisplanner is nog in een besloten test. Je kunt meedoen met een uitnodiging.' using errcode = 'TPB01';
  end if;
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

-- ---------------------------------------------------------------------------------------------
-- 5. Voor de app: de stand van de poort en of een eigen huishouden mag (zonder DETAIL/HINT)
-- ---------------------------------------------------------------------------------------------
create function public.mijn_toegang()
returns text language plpgsql stable security invoker set search_path = '' as $$
begin
  return private.toegang_status();
exception when others then
  raise exception using errcode = sqlstate, message = sqlerrm;   -- zonder DETAIL/HINT
end $$;

create function public.mag_huishouden_maken()
returns boolean language plpgsql stable security invoker set search_path = '' as $$
begin
  return private.mag_huishouden_maken();
exception when others then
  raise exception using errcode = sqlstate, message = sqlerrm;   -- zonder DETAIL/HINT
end $$;

revoke all on function public.mijn_toegang(), public.mag_huishouden_maken() from public, anon;
grant execute on function public.mijn_toegang(), public.mag_huishouden_maken() to authenticated;
