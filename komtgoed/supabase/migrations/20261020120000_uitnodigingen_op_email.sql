-- Thuisplanner (map komtgoed) · KG-5H deel 1b: uitnodigingen op e-mailadres. Zie docs/thuisplanner-uitnodiging-email.md.
--
-- Een uitnodiging kan (optioneel) aan een e-mailadres gekoppeld worden. Dan:
-- - ziet alleen een account met dat bevestigde adres hem, na het inloggen, zonder link (my_invites);
-- - kan alleen dat account hem accepteren, met of zonder link (accept_invite_by_id en accept_invite). Het adres komt uit
--   auth.users en telt alleen als email_confirmed_at gezet is; nooit uit het token (JWT);
-- - kan alleen dat account hem weigeren (decline_invite).
-- Een uitnodiging zonder adres werkt ongewijzigd: de link, eenmalig, 7 dagen, intrekbaar.
--
-- Het adres is een persoonsgegeven van iemand die nog geen lid is. Het blijft alleen zolang de uitnodiging open is:
-- - bij accepteren, intrekken en weigeren wist een trigger het, op elke route (ook archiveren, rolwijzigingen en een
--   verwijderd account), en een controle maakt een gesloten uitnodiging met adres onmogelijk;
-- - na het verlopen wist de dagelijkse taak thuisplanner-uitnodigingen-opschonen het.
-- Alleen eigenaar en beheerder van het huishouden zien het adres (bestaande policy invites_select). Geen functie meldt of
-- een adres een account heeft.
--
-- Uitnodigingsfouten krijgen eigen, stabiele codes (TPU01 tot en met TPU10); de app vertaalt alleen de code.

-- ---------------------------------------------------------------------------------------------
-- 1. Tabel: adres, weigeren, en de opruiming als structurele regel
-- ---------------------------------------------------------------------------------------------
alter table public.household_invites
  add column invited_email text,
  add column declined_at timestamptz;

alter table public.household_invites
  add constraint household_invites_email_form check (
    invited_email is null or (
      char_length(invited_email) <= 254
      and invited_email = lower(btrim(invited_email))
      and invited_email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')),
  -- Een gesloten uitnodiging bevat geen adres. Een route die het wissen vergeet, faalt.
  add constraint household_invites_email_closed check (
    invited_email is null or (accepted_at is null and revoked_at is null and declined_at is null));

create index household_invites_email_idx on public.household_invites (invited_email) where invited_email is not null;

-- Wist het adres zodra een uitnodiging gesloten wordt, op welke route ook (accept, revoke, decline, archive_member,
-- revoke_unauthorized_invites, before_account_delete). Alleen NEW wijzigen; geen rechten nodig.
create function private.invite_wipe_email()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.accepted_at is not null or new.revoked_at is not null or new.declined_at is not null then
    new.invited_email := null;
  end if;
  return new;
end $$;
revoke all on function private.invite_wipe_email() from public, anon, authenticated;
create trigger household_invites_wipe_email before insert or update on public.household_invites
  for each row execute function private.invite_wipe_email();

-- Leesrecht op de nieuwe kolommen; de rijen blijven alleen zichtbaar voor eigenaar en beheerder (invites_select).
grant select (invited_email, declined_at) on public.household_invites to authenticated;

-- ---------------------------------------------------------------------------------------------
-- 2. Hulpfuncties (niet via de API)
-- ---------------------------------------------------------------------------------------------
create function private.invite_limit()
returns integer language sql immutable set search_path = '' as $$
  select 10
$$;

-- Leeg wordt null (geen koppeling). Anders kleine letters, zonder spaties eromheen, hoogstens 254 tekens.
create function private.clean_email(p_email text)
returns text language plpgsql immutable set search_path = '' as $$
declare e text := lower(btrim(coalesce(p_email, '')));
begin
  if e = '' then return null; end if;
  if char_length(e) > 254 or e !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'Ongeldig e-mailadres' using errcode = 'TPU09';
  end if;
  return e;
end $$;

-- Het bevestigde adres van het ingelogde account, anders null. Uit auth.users (actueel), niet uit het token: een
-- token kan ouder zijn dan een adreswijziging, en een onbevestigd adres bewijst niets.
create function private.my_email()
returns text language sql stable security definer set search_path = '' as $$
  select lower(u.email) from auth.users u
  where u.id = (select auth.uid()) and u.email_confirmed_at is not null and u.email is not null
$$;

-- Is deze uitnodiging nu nog te accepteren door het ingelogde account? Gooit anders de passende code. De aanroeper
-- heeft het huishouden vergrendeld en de rij met for update gelezen. Het adres komt na de toestand: zo verraadt een
-- fout adres niet of een gesloten uitnodiging gekoppeld was.
create function private.invite_check_open(inv public.household_invites)
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if inv.declined_at is not null then raise exception 'Uitnodiging is geweigerd' using errcode = 'TPU10'; end if;
  if inv.revoked_at is not null then raise exception 'Uitnodiging is ingetrokken' using errcode = 'TPU04'; end if;
  if inv.accepted_at is not null then raise exception 'Uitnodiging is al gebruikt' using errcode = 'TPU03'; end if;
  if inv.expires_at <= now() then raise exception 'Uitnodiging is verlopen' using errcode = 'TPU02'; end if;
  if not private.invite_creator_authorized(inv.household_id, inv.created_by, inv.role) then
    raise exception 'Deze uitnodiging is niet meer geldig' using errcode = 'TPU05';
  end if;
  if inv.invited_email is not null and inv.invited_email is distinct from private.my_email() then
    raise exception 'Deze uitnodiging is voor een ander e-mailadres' using errcode = 'TPU06';
  end if;
  if private.is_active_member(inv.household_id) then
    raise exception 'Je bent al lid van dit huishouden' using errcode = 'TPU07';
  end if;
end $$;

-- Het accepteren zelf, gedeeld door de link (token) en de lijst (id). Huishouden is vergrendeld door de aanroeper.
create function private.accept_invite_row(p_invite uuid, p_display_name text, p_by_id boolean)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := private.require_uid();
  inv public.household_invites%rowtype;
  mem public.household_members%rowtype;
begin
  select * into inv from public.household_invites where id = p_invite for update;
  if not found then raise exception 'Uitnodiging niet gevonden' using errcode = 'TPU01'; end if;
  -- Via de lijst alleen een gekoppelde uitnodiging: een id is geen geheim zoals het token. Een open uitnodiging
  -- zonder adres bestaat voor deze route niet (een gesloten heeft nooit een adres; die krijgt de eigen code).
  if p_by_id and inv.invited_email is null
     and inv.accepted_at is null and inv.revoked_at is null and inv.declined_at is null then
    raise exception 'Uitnodiging niet gevonden' using errcode = 'TPU01';
  end if;
  perform private.invite_check_open(inv);

  if inv.member_id is not null then
    select * into mem from public.household_members where id = inv.member_id and household_id = inv.household_id for update;
    if not found or mem.status <> 'active' or mem.kind <> 'adult' or mem.user_id is not null then
      raise exception 'Deze uitnodiging is niet meer geldig' using errcode = 'TPU05';
    end if;
    update public.household_members set user_id = uid, linked_at = now(), role = inv.role where id = mem.id;
  else
    insert into public.household_members (household_id, user_id, role, kind, display_name, linked_at)
      values (inv.household_id, uid, inv.role, 'adult',
              private.clean_name(p_display_name, 'Vul je eigen naam in (1-80 tekens)'), now());
  end if;

  update public.household_invites set accepted_at = now(), accepted_by = uid, invited_email = null where id = inv.id;
  return inv.household_id;
end $$;

revoke all on function private.invite_limit(), private.clean_email(text), private.my_email(),
  private.invite_check_open(public.household_invites), private.accept_invite_row(uuid, text, boolean)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- 3. Functies via de API (logica in private, dunne wrappers in public)
-- ---------------------------------------------------------------------------------------------
-- create_invite krijgt p_email (standaard null). De oude handtekening gaat weg, zodat de API niet tussen twee versies
-- hoeft te kiezen; bestaande aanroepen zonder adres werken ongewijzigd.
drop function public.create_invite(uuid, uuid, text, integer);
drop function private.create_invite(uuid, uuid, text, integer);

create function private.create_invite(p_household uuid, p_member uuid, p_role text, p_days integer, p_email text)
returns text language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := private.require_uid();
  tok text;
  mail text;
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
  mail := private.clean_email(p_email);
  if p_member is not null then
    select * into mem from public.household_members where id = p_member and household_id = p_household for update;
    if not found then raise exception 'Lid niet gevonden in dit huishouden' using errcode = 'P0002'; end if;
    if mem.status <> 'active' then raise exception 'Dit lid is gearchiveerd' using errcode = '22023'; end if;
    if mem.kind <> 'adult' then raise exception 'Een kind kan (nog) geen account krijgen' using errcode = '22023'; end if;
    if mem.user_id is not null then raise exception 'Dit lid heeft al een account' using errcode = '22023'; end if;
  end if;
  -- Opnieuw uitnodigen op hetzelfde adres: de vorige open uitnodiging vervalt (het adres gaat mee, zie de trigger).
  if mail is not null then
    update public.household_invites set revoked_at = now()
      where household_id = p_household and invited_email = mail
        and accepted_at is null and revoked_at is null and declined_at is null;
  end if;
  if (select count(*) from public.household_invites i
      where i.household_id = p_household and i.accepted_at is null and i.revoked_at is null and i.declined_at is null
        and i.expires_at > now()) >= private.invite_limit() then
    raise exception 'Te veel open uitnodigingen: trek er eerst een in' using errcode = 'TPU08';
  end if;
  tok := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.household_invites (household_id, member_id, role, token_hash, created_by, expires_at, invited_email)
    values (p_household, p_member, p_role, encode(extensions.digest(tok, 'sha256'), 'hex'), uid,
            now() + make_interval(days => p_days), mail);
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
    raise exception 'Uitnodiging niet gevonden' using errcode = 'TPU01';
  end if;
  if inv.accepted_at is not null then raise exception 'Uitnodiging is al gebruikt' using errcode = 'TPU03'; end if;
  if inv.declined_at is not null then return; end if;   -- al gesloten door de genodigde
  update public.household_invites set revoked_at = coalesce(revoked_at, now()), invited_email = null where id = inv.id;
end $$;

-- Met de link. Extra regel: is er een adres gekoppeld, dan alleen voor het account met dat bevestigde adres.
create or replace function private.accept_invite(p_token text, p_display_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  hash text;
  hid uuid;
  iid uuid;
begin
  perform private.require_uid();
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then
    raise exception 'Uitnodiging niet gevonden' using errcode = 'TPU01';
  end if;
  hash := encode(extensions.digest(p_token, 'sha256'), 'hex');
  select i.household_id, i.id into hid, iid from public.household_invites i where i.token_hash = hash;
  if not found then raise exception 'Uitnodiging niet gevonden' using errcode = 'TPU01'; end if;
  perform private.lock_household(hid);
  return private.accept_invite_row(iid, p_display_name, false);
end $$;

-- Uit de lijst (my_invites), zonder link.
create function private.accept_invite_by_id(p_invite uuid, p_display_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare hid uuid;
begin
  perform private.require_uid();
  select i.household_id into hid from public.household_invites i where i.id = p_invite;
  if not found then raise exception 'Uitnodiging niet gevonden' using errcode = 'TPU01'; end if;
  perform private.lock_household(hid);
  return private.accept_invite_row(p_invite, p_display_name, true);
end $$;

-- Weigeren: alleen de genodigde zelf. Voor ieder ander (ook beheer) bestaat de uitnodiging niet; beheer trekt in.
create function private.decline_invite(p_invite uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  hid uuid;
  inv public.household_invites%rowtype;
begin
  perform private.require_uid();
  select i.household_id into hid from public.household_invites i where i.id = p_invite;
  if found then perform private.lock_household(hid); end if;
  select * into inv from public.household_invites where id = p_invite for update;
  if not found or inv.invited_email is null or inv.invited_email is distinct from private.my_email() then
    raise exception 'Uitnodiging niet gevonden' using errcode = 'TPU01';
  end if;
  update public.household_invites set declined_at = now(), invited_email = null where id = inv.id;
end $$;

-- Open uitnodigingen voor het bevestigde adres van dit account. Geen adres, geen token en geen huishoud-id in de
-- uitvoer; wel wat je nodig hebt om te kunnen beslissen: het huishouden, wie uitnodigde, de rol en tot wanneer.
create function private.my_invites()
returns table (id uuid, household_name text, invited_by text, member_name text, role text, expires_at timestamptz)
language sql stable security definer set search_path = '' as $$
  with ik as (select private.my_email() as mail)
  select i.id, h.name, c.display_name, m.display_name, i.role, i.expires_at
  from ik
  join public.household_invites i on i.invited_email = ik.mail
  join public.households h on h.id = i.household_id
  left join lateral (
    select cm.display_name from public.household_members cm
    where cm.household_id = i.household_id and cm.user_id = i.created_by and cm.status = 'active' limit 1
  ) c on true
  left join public.household_members m on m.id = i.member_id and m.household_id = i.household_id
  where ik.mail is not null
    and i.accepted_at is null and i.revoked_at is null and i.declined_at is null and i.expires_at > now()
    and private.invite_creator_authorized(i.household_id, i.created_by, i.role)
    and not private.is_active_member(i.household_id)
  order by i.created_at, i.id
$$;

revoke all on function private.create_invite(uuid, uuid, text, integer, text), private.accept_invite_by_id(uuid, text),
  private.decline_invite(uuid), private.my_invites() from public, anon;
grant execute on function private.create_invite(uuid, uuid, text, integer, text), private.accept_invite_by_id(uuid, text),
  private.decline_invite(uuid), private.my_invites() to authenticated;

-- Publiek: fouten zonder DETAIL en HINT (zoals KG-5C herstelronde 2).
create function public.create_invite(p_household uuid, p_member uuid default null, p_role text default 'member',
  p_days integer default 7, p_email text default null)
returns text language plpgsql security invoker set search_path = '' as $$
begin
  return private.create_invite(p_household, p_member, p_role, p_days, p_email);
exception when others then
  raise exception using errcode = sqlstate, message = sqlerrm;   -- zonder DETAIL/HINT
end $$;

create function public.accept_invite_by_id(p_invite uuid, p_display_name text default null)
returns uuid language plpgsql security invoker set search_path = '' as $$
begin
  return private.accept_invite_by_id(p_invite, p_display_name);
exception when others then
  raise exception using errcode = sqlstate, message = sqlerrm;   -- zonder DETAIL/HINT
end $$;

create function public.decline_invite(p_invite uuid)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  perform private.decline_invite(p_invite);
exception when others then
  raise exception using errcode = sqlstate, message = sqlerrm;   -- zonder DETAIL/HINT
end $$;

create function public.my_invites()
returns table (id uuid, household_name text, invited_by text, member_name text, role text, expires_at timestamptz)
language plpgsql stable security invoker set search_path = '' as $$
begin
  return query select * from private.my_invites();
exception when others then
  raise exception using errcode = sqlstate, message = sqlerrm;   -- zonder DETAIL/HINT
end $$;

revoke all on function public.create_invite(uuid, uuid, text, integer, text), public.accept_invite_by_id(uuid, text),
  public.decline_invite(uuid), public.my_invites() from public, anon;
grant execute on function public.create_invite(uuid, uuid, text, integer, text), public.accept_invite_by_id(uuid, text),
  public.decline_invite(uuid), public.my_invites() to authenticated;

-- ---------------------------------------------------------------------------------------------
-- 4. Opruimen na het verlopen (dagelijks)
-- ---------------------------------------------------------------------------------------------
-- Per huishouden onder vergrendeling (zelfde protocol als de K3-opruiming); een fout in één huishouden blokkeert de
-- andere niet. Idempotent. Alleen voor de database zelf (pg_cron draait als postgres).
create function private.purge_invite_emails()
returns integer language plpgsql security definer set search_path = '' as $$
declare
  h uuid;
  n integer;
  totaal integer := 0;
begin
  for h in
    select distinct i.household_id from public.household_invites i
    where i.invited_email is not null and i.expires_at <= now() order by 1
  loop
    begin
      perform private.lock_household(h);
      update public.household_invites set invited_email = null
        where household_id = h and invited_email is not null and expires_at <= now();
      get diagnostics n = row_count;
      totaal := totaal + n;
    exception when others then
      raise warning 'Thuisplanner uitnodigingen opschonen: huishouden % overgeslagen (%)', h, sqlerrm;
    end;
  end loop;
  return totaal;
end $$;
revoke all on function private.purge_invite_emails() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    execute $s$ select cron.schedule('thuisplanner-uitnodigingen-opschonen', '29 3 * * *', 'select private.purge_invite_emails()') $s$;
  end if;
end $$;
