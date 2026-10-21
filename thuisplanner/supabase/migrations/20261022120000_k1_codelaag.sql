-- Thuisplanner · KG-5H deel 2: K1, de eigen codelaag. Zie docs/thuisplanner-k1-ontwerp.md en
-- docs/thuisplanner-deel2-bouwscope.md §2.
--
-- Supabase Auth maakt een interne code van 10 cijfers die nooit wordt gemaild. De Send Email-hook (Edge Function
-- stuur-code) maakt een eigen code van 6 cijfers en bewaart hier alleen:
-- - een HMAC van adres en code (met een geheime pepper die alleen de Edge Functions kennen);
-- - de token_hash van Supabase, versleuteld (AES-256-GCM, sleutel alleen in de Edge Functions).
-- Met alleen deze database is dus geen code terug te rekenen en geen sessie te halen.
--
-- De functie controleer-code laat hier één poging controleren, atomair onder een vergrendeling van het adres:
-- - een code wordt alleen bekeken als er een plek is: per code 5, per account in 24 uur H = 100 in totaal (harde
--   grens, ongeacht toestellen of IP-adressen), waarvan hoogstens U = 30 vanuit onbekende toestellen samen, en D = 10
--   per bekend toestel (hoogstens M = 5 per account). Vaste regel: H >= U + M * D, zodat een aanvaller zonder
--   toestel-token de bekende toestellen van de echte gebruiker nooit kan blokkeren;
-- - een bekend toestel ontstaat alleen na een geslaagde code; het token draait bij elke geslaagde inlog;
-- - pas bij een goede code komt de versleutelde token_hash terug; de app geeft die aan verifyOtp en Supabase zelf
--   geeft de sessie uit.
-- Alle functies hier zijn alleen voor de service-rol (de Edge Functions), niet voor anon of authenticated.

-- ---------------------------------------------------------------------------------------------
-- 1. Grenzen (één rij; alleen de databasebeheerder wijzigt ze)
-- ---------------------------------------------------------------------------------------------
create table private.k1_grenzen (
  id integer primary key default 1 check (id = 1),
  per_code integer not null default 5,
  h_totaal integer not null default 100,
  u_onbekend integer not null default 30,
  d_toestel integer not null default 10,
  m_toestellen integer not null default 5,
  venster interval not null default interval '24 hours',
  aanvragen_kwartier integer not null default 5,
  -- 8 per dag: genoeg voor een paar keer inloggen op meerdere toestellen, en wie alleen het adres kent, maakt het
  -- mailtegoed (300 per maand op het gratis plan) niet op (review stap 3a, R3).
  aanvragen_dag integer not null default 8,
  code_geldig interval not null default interval '10 minutes',
  captcha_na_fouten integer not null default 2,
  toestel_geldig interval not null default interval '180 days',
  constraint k1_grenzen_regel check (h_totaal >= u_onbekend + m_toestellen * d_toestel and per_code between 1 and 10)
);
insert into private.k1_grenzen (id) values (1);

-- ---------------------------------------------------------------------------------------------
-- 2. Codes, tellers en toestellen
-- ---------------------------------------------------------------------------------------------
create table private.k1_codes (
  id uuid primary key default gen_random_uuid(),
  adres_hmac text not null check (adres_hmac ~ '^[0-9a-f]{64}$'),
  -- Bewust geen verwijzing naar auth.users: Supabase roept de hook aan vóórdat een nieuw account is vastgelegd (in een
  -- transactie die deze verbinding nog niet ziet). Codes zijn hoogstens 24 uur oud (k1_opruimen).
  user_id uuid not null,
  -- signup: eerste bevestiging; email: inloggen; email_change: één van de twee codes bij een adreswijziging.
  soort text not null check (soort in ('signup', 'email', 'email_change')),
  code_hmac text not null check (code_hmac ~ '^[0-9a-f]{64}$'),
  token_hash_enc text not null,
  pogingen integer not null default 0,
  status text not null default 'actief' check (status in ('actief', 'gebruikt', 'vervallen', 'vervangen')),
  gemaakt timestamptz not null default now(),
  verloopt timestamptz not null,
  gebruikt_op timestamptz
);
-- Hoogstens één actieve code per adres.
create unique index k1_codes_actief_idx on private.k1_codes (adres_hmac) where status = 'actief';
create index k1_codes_gemaakt_idx on private.k1_codes (gemaakt);

create table private.k1_accounts (
  adres_hmac text primary key check (adres_hmac ~ '^[0-9a-f]{64}$'),
  totaal integer not null default 0,
  onbekend integer not null default 0,
  venster_start timestamptz not null default now(),
  aanvragen_kwartier integer not null default 0,
  kwartier_start timestamptz not null default now(),
  aanvragen_dag integer not null default 0,
  dag_start timestamptz not null default now(),
  gewaarschuwd timestamptz
);

create table private.k1_toestellen (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  token_hmac text not null unique check (token_hmac ~ '^[0-9a-f]{64}$'),
  fout integer not null default 0,
  venster_start timestamptz not null default now(),
  gemaakt timestamptz not null default now(),
  laatst_gebruikt timestamptz not null default now(),
  ingetrokken boolean not null default false
);
create index k1_toestellen_user_idx on private.k1_toestellen (user_id) where not ingetrokken;

revoke all on table private.k1_grenzen, private.k1_codes, private.k1_accounts, private.k1_toestellen from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- 3. Een nieuwe code (vanuit de hook stuur-code)
-- ---------------------------------------------------------------------------------------------
-- Uitkomst: 'ok', 'codes-uit', 'registratie-dicht' (alleen bij signup) of 'te-vaak'. Bij 'ok' het id van de code.
create function private.k1_nieuwe_code(p_adres_hmac text, p_user_id uuid, p_soort text, p_code_hmac text, p_token_hash_enc text)
returns table (uitkomst text, code_id uuid) language plpgsql security definer set search_path = '' as $$
declare
  g private.k1_grenzen%rowtype;
  inst private.instellingen%rowtype;
  a private.k1_accounts%rowtype;
  nieuw uuid;
begin
  select * into g from private.k1_grenzen where id = 1;
  select * into inst from private.instellingen where id = 1;
  -- Zonder instellingenrij geen codes (fail-closed; anders zijn codes_aan en registratie_open NULL en slaan ze over).
  if not found then return query select 'codes-uit'::text, null::uuid; return; end if;
  if not inst.codes_aan then return query select 'codes-uit'::text, null::uuid; return; end if;
  if p_soort = 'signup' and not inst.registratie_open then return query select 'registratie-dicht'::text, null::uuid; return; end if;
  insert into private.k1_accounts (adres_hmac) values (p_adres_hmac) on conflict do nothing;
  select * into a from private.k1_accounts where adres_hmac = p_adres_hmac for update;
  if a.kwartier_start < now() - interval '15 minutes' then
    update private.k1_accounts set aanvragen_kwartier = 0, kwartier_start = now() where adres_hmac = p_adres_hmac returning * into a;
  end if;
  if a.dag_start < now() - interval '24 hours' then
    update private.k1_accounts set aanvragen_dag = 0, dag_start = now() where adres_hmac = p_adres_hmac returning * into a;
  end if;
  if a.aanvragen_kwartier >= g.aanvragen_kwartier or a.aanvragen_dag >= g.aanvragen_dag then
    return query select 'te-vaak'::text, null::uuid; return;
  end if;
  update private.k1_accounts set aanvragen_kwartier = aanvragen_kwartier + 1, aanvragen_dag = aanvragen_dag + 1 where adres_hmac = p_adres_hmac;
  update private.k1_codes set status = 'vervangen' where adres_hmac = p_adres_hmac and status = 'actief';
  insert into private.k1_codes (adres_hmac, user_id, soort, code_hmac, token_hash_enc, verloopt)
    values (p_adres_hmac, p_user_id, p_soort, p_code_hmac, p_token_hash_enc, now() + g.code_geldig) returning id into nieuw;
  return query select 'ok'::text, nieuw;
end $$;

-- Versturen mislukt: de code vervalt meteen (er bestaat dan geen geldige code die niemand kreeg).
create function private.k1_code_vervalt(p_code_id uuid)
returns void language sql security definer set search_path = '' as $$
  update private.k1_codes set status = 'vervallen' where id = p_code_id and status = 'actief';
$$;

-- ---------------------------------------------------------------------------------------------
-- 4. Eén poging controleren (vanuit controleer-code)
-- ---------------------------------------------------------------------------------------------
-- Uitkomst:
--   'goed'          code klopt: de versleutelde token_hash, het soort en het account; het toestel-token is gedraaid
--   'fout'          code klopt niet, of er is geen geldige code (één antwoord: geen onderscheid naar buiten)
--   'captcha-nodig' na enkele fouten op deze code eerst een captcha
--   'geremd'        geen plek binnen de grenzen; de code is NIET bekeken
--   'codes-uit'     noodstop
create function private.k1_controleer(p_adres_hmac text, p_code_hmac text, p_toestel_hmac text, p_nieuw_toestel_hmac text, p_captcha_ok boolean)
returns table (uitkomst text, token_hash_enc text, soort text, user_id uuid)
language plpgsql security definer set search_path = '' as $$
declare
  g private.k1_grenzen%rowtype;
  inst private.instellingen%rowtype;
  a private.k1_accounts%rowtype;
  t private.k1_toestellen%rowtype;
  c private.k1_codes%rowtype;
  bekend boolean := false;
begin
  select * into g from private.k1_grenzen where id = 1;
  select * into inst from private.instellingen where id = 1;
  if not found then return query select 'codes-uit'::text, null::text, null::text, null::uuid; return; end if;
  if not inst.codes_aan then return query select 'codes-uit'::text, null::text, null::text, null::uuid; return; end if;
  -- Zonder actieve code valt er niets te raden: meteen 'fout' (hetzelfde antwoord als een verkeerde code), zonder een
  -- plek te tellen en zonder een rij aan te maken. Anders kan wie alleen het adres kent, de emmers van de echte gebruiker
  -- leegmaken zonder dat er ooit een code is verstuurd (review stap 3a, R2).
  if not exists (select 1 from private.k1_codes k where k.adres_hmac = p_adres_hmac and k.status = 'actief') then
    return query select 'fout'::text, null::text, null::text, null::uuid; return;
  end if;
  insert into private.k1_accounts (adres_hmac) values (p_adres_hmac) on conflict do nothing;
  -- Vergrendel het adres: alle pogingen voor dit adres lopen na elkaar, ongeacht toestel of IP-adres.
  select * into a from private.k1_accounts where adres_hmac = p_adres_hmac for update;
  if a.venster_start < now() - g.venster then
    update private.k1_accounts set totaal = 0, onbekend = 0, venster_start = now() where adres_hmac = p_adres_hmac returning * into a;
  end if;
  -- De actieve code van dit adres (er is er hoogstens één), opnieuw onder de vergrendeling.
  select * into c from private.k1_codes k where k.adres_hmac = p_adres_hmac and k.status = 'actief' for update;
  -- Intussen gebruikt, vervangen of verlopen: ook dan 'fout', zonder te tellen (een verlopen code valt niet te raden).
  if c.id is null or c.verloopt <= now() then
    if c.id is not null then update private.k1_codes set status = 'vervallen' where id = c.id; end if;
    return query select 'fout'::text, null::text, null::text, null::uuid; return;
  end if;
  -- Een bekend toestel: alleen een geldig, niet ingetrokken token van HET ACCOUNT van deze code.
  if p_toestel_hmac is not null and c.id is not null then
    select * into t from private.k1_toestellen d
      where d.token_hmac = p_toestel_hmac and d.user_id = c.user_id and not d.ingetrokken
        and d.laatst_gebruikt > now() - g.toestel_geldig for update;
    bekend := found;
    if bekend and t.venster_start < now() - g.venster then
      update private.k1_toestellen set fout = 0, venster_start = now() where id = t.id returning * into t;
    end if;
  end if;
  -- Captcha na enkele fouten op deze code (vóór het reserveren: kost geen plek).
  if c.id is not null and c.pogingen >= g.captcha_na_fouten and not coalesce(p_captcha_ok, false) then
    return query select 'captcha-nodig'::text, null::text, null::text, null::uuid; return;
  end if;
  -- Reserveren: de harde grens, dan de emmer van de context. Zonder plek wordt de code niet bekeken.
  if a.totaal >= g.h_totaal or (bekend and t.fout >= g.d_toestel) or (not bekend and a.onbekend >= g.u_onbekend) then
    return query select 'geremd'::text, null::text, null::text, null::uuid; return;
  end if;
  update private.k1_accounts set totaal = totaal + 1, onbekend = onbekend + (case when bekend then 0 else 1 end)
    where adres_hmac = p_adres_hmac;
  if bekend then update private.k1_toestellen set fout = fout + 1 where id = t.id; end if;
  update private.k1_codes set pogingen = pogingen + 1 where id = c.id;
  if c.code_hmac is distinct from p_code_hmac then
    if c.pogingen + 1 >= g.per_code then update private.k1_codes set status = 'vervallen' where id = c.id; end if;
    return query select 'fout'::text, null::text, null::text, null::uuid; return;
  end if;
  -- Goed: de code is gebruikt; dit toestel krijgt een nieuw token (het oude vervalt), hoogstens M actief.
  update private.k1_codes set status = 'gebruikt', gebruikt_op = now() where id = c.id;
  if bekend then update private.k1_toestellen set ingetrokken = true where id = t.id; end if;
  if p_nieuw_toestel_hmac is not null then
    insert into private.k1_toestellen (user_id, token_hmac) values (c.user_id, p_nieuw_toestel_hmac);
    update private.k1_toestellen set ingetrokken = true where id in (
      select d.id from private.k1_toestellen d where d.user_id = c.user_id and not d.ingetrokken
      order by d.gemaakt desc offset g.m_toestellen);
  end if;
  -- Een geslaagde inlog zet de pogingen van deze context terug (NIST 800-63B §3.2.2 als ontwerpmaat).
  if not bekend then update private.k1_accounts set onbekend = greatest(onbekend - 1, 0) where adres_hmac = p_adres_hmac; end if;
  return query select 'goed'::text, c.token_hash_enc, c.soort, c.user_id;
end $$;

-- ---------------------------------------------------------------------------------------------
-- 5. Toestellen intrekken (uitloggen op alle toestellen, adreswijziging) en opruimen
-- ---------------------------------------------------------------------------------------------
create function private.k1_toestellen_intrekken(p_user_id uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  update private.k1_toestellen set ingetrokken = true where user_id = p_user_id and not ingetrokken;
  get diagnostics n = row_count;
  return n;
end $$;

-- Voor de app: de eigen toestellen intrekken (bij "uitloggen op alle toestellen"). Alleen via de poort.
create function private.mijn_toestellen_intrekken()
returns integer language plpgsql security definer set search_path = '' as $$
begin
  return private.k1_toestellen_intrekken(private.require_uid());
end $$;

-- Dagelijks: oude codes weg (na 24 uur), oude toestellen weg, en onbevestigde accounts zonder huishouden na 24 uur weg
-- (rommel van misbruik met andermans adres). Bevestigde accounts blijven altijd.
create function private.k1_opruimen()
returns integer language plpgsql security definer set search_path = '' as $$
declare n integer := 0; m integer;
begin
  delete from private.k1_codes where gemaakt < now() - interval '24 hours';
  get diagnostics m = row_count; n := n + m;
  delete from private.k1_toestellen where ingetrokken or laatst_gebruikt < now() - (select toestel_geldig from private.k1_grenzen);
  get diagnostics m = row_count; n := n + m;
  delete from private.k1_accounts where venster_start < now() - interval '30 days' and dag_start < now() - interval '30 days';
  get diagnostics m = row_count; n := n + m;
  delete from auth.users u where u.email_confirmed_at is null and u.created_at < now() - interval '24 hours'
    and not exists (select 1 from public.household_members m2 where m2.user_id = u.id);
  get diagnostics m = row_count; n := n + m;
  return n;
end $$;

revoke all on function private.k1_nieuwe_code(text, uuid, text, text, text), private.k1_code_vervalt(uuid),
  private.k1_controleer(text, text, text, text, boolean), private.k1_toestellen_intrekken(uuid), private.k1_opruimen()
  from public, anon, authenticated;
revoke all on function private.mijn_toestellen_intrekken() from public, anon;
grant execute on function private.mijn_toestellen_intrekken() to authenticated;
grant usage on schema private to service_role;
grant execute on function private.k1_nieuwe_code(text, uuid, text, text, text), private.k1_code_vervalt(uuid),
  private.k1_controleer(text, text, text, text, boolean), private.k1_toestellen_intrekken(uuid) to service_role;

-- ---------------------------------------------------------------------------------------------
-- 6. Publieke ingangen: alleen voor de service-rol (de Edge Functions), behalve het intrekken van de eigen toestellen
-- ---------------------------------------------------------------------------------------------
create function public.k1_nieuwe_code(p_adres_hmac text, p_user_id uuid, p_soort text, p_code_hmac text, p_token_hash_enc text)
returns table (uitkomst text, code_id uuid) language plpgsql security invoker set search_path = '' as $$
begin
  return query select * from private.k1_nieuwe_code(p_adres_hmac, p_user_id, p_soort, p_code_hmac, p_token_hash_enc);
exception when others then
  raise exception using errcode = sqlstate, message = sqlerrm;   -- zonder DETAIL/HINT
end $$;

create function public.k1_code_vervalt(p_code_id uuid)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  perform private.k1_code_vervalt(p_code_id);
exception when others then
  raise exception using errcode = sqlstate, message = sqlerrm;   -- zonder DETAIL/HINT
end $$;

create function public.k1_controleer(p_adres_hmac text, p_code_hmac text, p_toestel_hmac text, p_nieuw_toestel_hmac text, p_captcha_ok boolean)
returns table (uitkomst text, token_hash_enc text, soort text, user_id uuid) language plpgsql security invoker set search_path = '' as $$
begin
  return query select * from private.k1_controleer(p_adres_hmac, p_code_hmac, p_toestel_hmac, p_nieuw_toestel_hmac, p_captcha_ok);
exception when others then
  raise exception using errcode = sqlstate, message = sqlerrm;   -- zonder DETAIL/HINT
end $$;

create function public.k1_toestellen_intrekken(p_user_id uuid)
returns integer language plpgsql security invoker set search_path = '' as $$
begin
  return private.k1_toestellen_intrekken(p_user_id);
exception when others then
  raise exception using errcode = sqlstate, message = sqlerrm;   -- zonder DETAIL/HINT
end $$;

create function public.mijn_toestellen_intrekken()
returns integer language plpgsql security invoker set search_path = '' as $$
begin
  return private.mijn_toestellen_intrekken();
exception when others then
  raise exception using errcode = sqlstate, message = sqlerrm;   -- zonder DETAIL/HINT
end $$;

revoke all on function public.k1_nieuwe_code(text, uuid, text, text, text), public.k1_code_vervalt(uuid),
  public.k1_controleer(text, text, text, text, boolean), public.k1_toestellen_intrekken(uuid), public.mijn_toestellen_intrekken()
  from public, anon, authenticated;
grant execute on function public.k1_nieuwe_code(text, uuid, text, text, text), public.k1_code_vervalt(uuid),
  public.k1_controleer(text, text, text, text, boolean), public.k1_toestellen_intrekken(uuid) to service_role;
grant execute on function public.mijn_toestellen_intrekken() to authenticated;

-- ---------------------------------------------------------------------------------------------
-- 7. Dagelijks opruimen (pg_cron), alleen waar de extensie beschikbaar is
-- ---------------------------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    execute $s$ select cron.schedule('thuisplanner-codes-opruimen', '41 3 * * *', 'select private.k1_opruimen()') $s$;
  end if;
end $$;
