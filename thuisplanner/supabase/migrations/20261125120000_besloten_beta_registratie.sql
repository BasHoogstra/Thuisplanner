-- Thuisplanner · besloten bèta (pakket P2, voorwaarde V4): registratie alleen op uitnodiging, en de bevindingen L1, R4,
-- L4 en L5 uit docs/thuisplanner-review-staging.md. Zie docs/thuisplanner-registratie-inloggen.md §29.
--
-- Deze migratie voegt alleen toe: twee tabellen, drie kolommen en functies. Er verdwijnen geen gegevens. Bestaande
-- functies krijgen hooguit een strengere regel (create or replace); hun aanroep blijft hetzelfde.
--
-- 1. Registratie alleen op uitnodiging. Een nieuw account (soort 'signup') krijgt alleen een code als registratie open
--    staat én het adres op de testerslijst staat (G1), er een open uitnodiging voor dat adres is, of huishouden_open aan
--    staat (de commerciële start: dan mag iedereen een huishouden maken, en dus ook een account). Anders hetzelfde
--    antwoord als bij "registratie dicht": de app ziet geen verschil (geen adresverraad). Bestaande accounts loggen
--    gewoon in. Het adres komt alleen bij 'signup' mee (de database kent de pepper niet, dus vergelijken kan alleen op
--    het adres zelf); het wordt nergens bewaard.
-- 2. L1: de controle staat ná de grenzen per adres. Een onbekend adres telt dus net zo mee als een bestaand account, en
--    loopt op dezelfde aanvraag vast ('te-vaak'). De uitlegmail gaat hoogstens één keer per adres per 24 uur.
-- 3. R4: uitnodigingsmails hebben naast de 20 per huishouden per 24 uur ook een grens per account (de uitnodiger) en per
--    ontvanger (een HMAC van het adres met een eigen sleutel in de database: het adres zelf wordt na het sluiten
--    gewist, en opnieuw uitnodigen begint niet meer bij nul).
-- 4. L4: een geheugen voor de webhook-id's van de Send Email-hook. Een opgevangen, geldig ondertekend verzoek is daarna
--    niet nog eens bruikbaar (de handtekening alleen gold 5 minuten lang).
-- 5. L5: het wachtrij-adres in Vault (de aanroep van de Edge Functions met het wachtrijgeheim) alleen via https://,
--    behalve naar een lokaal adres.
-- Stabiele codes: ongewijzigd (TPM03 is ook de code bij de nieuwe grenzen; de app vertaalt alleen de code).

-- ---------------------------------------------------------------------------------------------
-- 1 en 2. De codelaag: registratie op uitnodiging, en de uitlegmail met een grens per adres
-- ---------------------------------------------------------------------------------------------
-- Wanneer ging de laatste uitlegmail ("besloten test") naar dit adres? Leeg: nog nooit (of langer dan 30 dagen geleden,
-- k1_opruimen).
alter table private.k1_accounts add column uitleg_op timestamptz;

-- Mag dit adres een nieuw account krijgen? Alleen voor de codelaag (service-rol), niet via de API.
create function private.k1_registratie_toegestaan(p_email text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare
  inst private.instellingen%rowtype;
  e text := nullif(lower(btrim(coalesce(p_email, ''))), '');
begin
  select * into inst from private.instellingen where id = 1;
  if not found or e is null or not inst.registratie_open then return false; end if;
  return inst.huishouden_open
    or exists (select 1 from private.testers t where t.email = e)
    or exists (select 1 from public.household_invites i
               where i.invited_email = e and i.accepted_at is null and i.revoked_at is null and i.declined_at is null
                 and i.expires_at > now());
end $$;

-- De nieuwe ingang: dezelfde als k1_nieuwe_code, met het adres (alleen nodig bij 'signup').
-- Uitkomst: 'ok', 'codes-uit', 'te-vaak', 'registratie-dicht' (uitlegmail sturen) of 'registratie-stil' (de uitlegmail
-- ging de afgelopen 24 uur al; niets sturen). Naar buiten zijn beide 'registratie'-uitkomsten gelijk aan 'ok'.
create function private.k1_nieuwe_code(p_adres_hmac text, p_email text, p_user_id uuid, p_soort text, p_code_hmac text, p_token_hash_enc text)
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
  -- L1: pas ná de grenzen (een onbekend adres loopt op dezelfde aanvraag vast als een bestaand account).
  if p_soort = 'signup' and not private.k1_registratie_toegestaan(p_email) then
    if a.uitleg_op is not null and a.uitleg_op > now() - interval '24 hours' then
      return query select 'registratie-stil'::text, null::uuid; return;
    end if;
    update private.k1_accounts set uitleg_op = now() where adres_hmac = p_adres_hmac;
    return query select 'registratie-dicht'::text, null::uuid; return;
  end if;
  update private.k1_codes set status = 'vervangen' where adres_hmac = p_adres_hmac and status = 'actief';
  insert into private.k1_codes (adres_hmac, user_id, soort, code_hmac, token_hash_enc, verloopt)
    values (p_adres_hmac, p_user_id, p_soort, p_code_hmac, p_token_hash_enc, now() + g.code_geldig) returning id into nieuw;
  return query select 'ok'::text, nieuw;
end $$;

-- De oude ingang (zonder adres) blijft bestaan voor een Edge Function van vóór deze migratie, maar volgt de nieuwe
-- regel: zonder adres is een nieuw account nooit toegestaan (fail-closed). Inloggen werkt gewoon door.
create or replace function private.k1_nieuwe_code(p_adres_hmac text, p_user_id uuid, p_soort text, p_code_hmac text, p_token_hash_enc text)
returns table (uitkomst text, code_id uuid) language plpgsql security definer set search_path = '' as $$
begin
  return query select * from private.k1_nieuwe_code(p_adres_hmac, null::text, p_user_id, p_soort, p_code_hmac, p_token_hash_enc);
end $$;

create function public.k1_nieuwe_code(p_adres_hmac text, p_email text, p_user_id uuid, p_soort text, p_code_hmac text, p_token_hash_enc text)
returns table (uitkomst text, code_id uuid) language plpgsql security invoker set search_path = '' as $$
begin
  return query select * from private.k1_nieuwe_code(p_adres_hmac, p_email, p_user_id, p_soort, p_code_hmac, p_token_hash_enc);
exception when others then
  raise exception using errcode = sqlstate, message = sqlerrm;   -- zonder DETAIL/HINT
end $$;

revoke all on function private.k1_registratie_toegestaan(text), private.k1_nieuwe_code(text, text, uuid, text, text, text),
  public.k1_nieuwe_code(text, text, uuid, text, text, text) from public, anon, authenticated;
grant execute on function private.k1_nieuwe_code(text, text, uuid, text, text, text),
  public.k1_nieuwe_code(text, text, uuid, text, text, text) to service_role;

-- ---------------------------------------------------------------------------------------------
-- 3. R4: uitnodigingsmails met een grens per account en per ontvanger
-- ---------------------------------------------------------------------------------------------
-- Eén rij; alleen de databasebeheerder wijzigt ze. De sleutel is willekeurig per database en verlaat haar nooit: met
-- alleen de wachtrij is een adres dus niet terug te vinden. Na een herstel zonder deze rij komt er een nieuwe sleutel;
-- dan beginnen alleen de tellers van de afgelopen 24 uur opnieuw.
create table private.uitnodigingsmail_grenzen (
  id integer primary key default 1 check (id = 1),
  -- Per uitnodiger (account), over al zijn huishoudens samen. Ruim voor een partner, een tweede volwassene en een paar
  -- keer "nog eens sturen"; geen 10 × 20 meer.
  per_account integer not null default 5 check (per_account between 1 and 100),
  -- Per ontvanger, van alle uitnodigers samen: zoveel als één uitnodiging ooit mag krijgen (3).
  per_adres integer not null default 3 check (per_adres between 1 and 100),
  sleutel text not null default encode(extensions.gen_random_bytes(32), 'hex') check (sleutel ~ '^[0-9a-f]{64}$')
);
insert into private.uitnodigingsmail_grenzen (id) values (1);
revoke all on table private.uitnodigingsmail_grenzen from public, anon, authenticated;

-- Wie de mail liet versturen (de maker van de uitnodiging of wie "nog eens sturen" koos), en een HMAC van de ontvanger.
-- Leeg bij rijen van vóór deze migratie (die tellen dan alleen per huishouden, zoals voorheen; na 24 uur niet meer).
alter table private.uitnodigingsmails
  add column aanvrager uuid references auth.users (id) on delete set null,
  add column ontvanger_hmac text check (ontvanger_hmac is null or ontvanger_hmac ~ '^[0-9a-f]{64}$');
create index uitnodigingsmails_aanvrager_idx on private.uitnodigingsmails (aanvrager, gevraagd) where aanvrager is not null;
create index uitnodigingsmails_ontvanger_idx on private.uitnodigingsmails (ontvanger_hmac, gevraagd) where ontvanger_hmac is not null;

create function private.uitnodigingsmail_ontvanger(p_email text)
returns text language sql stable security definer set search_path = '' as $$
  select encode(extensions.hmac(lower(btrim(p_email)), (select g.sleutel from private.uitnodigingsmail_grenzen g where g.id = 1), 'sha256'), 'hex')
$$;

-- Is er voor deze uitnodiger en deze ontvanger nog plek (afgelopen 24 uur, zoals uitnodigingsmails_vandaag: wat naar
-- de aanbieder ging of kan gaan)? Vergrendelt eerst de uitnodiger en dan de ontvanger (altijd na het huishouden, in deze
-- volgorde), zodat gelijktijdige aanvragen over huishoudens heen niet samen over de grens gaan. Zonder grenzenrij: geen
-- plek (fail-closed).
create function private.uitnodigingsmail_plek(p_aanvrager uuid, p_ontvanger text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  g private.uitnodigingsmail_grenzen%rowtype;
begin
  select * into g from private.uitnodigingsmail_grenzen where id = 1;
  if not found or p_aanvrager is null or p_ontvanger is null then return false; end if;
  perform pg_advisory_xact_lock(hashtextextended('thuisplanner:uitnodigingsmail:account:' || p_aanvrager::text, 0));
  perform pg_advisory_xact_lock(hashtextextended('thuisplanner:uitnodigingsmail:adres:' || p_ontvanger, 0));
  return (select count(*) from private.uitnodigingsmails m
          where m.aanvrager = p_aanvrager and m.gevraagd > now() - interval '24 hours'
            and m.status not in ('vervallen', 'daglimiet')) < g.per_account
     and (select count(*) from private.uitnodigingsmails m
          where m.ontvanger_hmac = p_ontvanger and m.gevraagd > now() - interval '24 hours'
            and m.status not in ('vervallen', 'daglimiet')) < g.per_adres;
end $$;

-- Een nieuwe uitnodiging met adres: de eerste mail in de wachtrij. Boven een grens blijft de uitnodiging geldig; de
-- mail gaat dan niet ('daglimiet', zoals voorheen bij de grens per huishouden).
create or replace function private.uitnodigingsmail_plannen()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  ontvanger text;
  plek boolean;
begin
  if new.invited_email is null then return new; end if;
  ontvanger := private.uitnodigingsmail_ontvanger(new.invited_email);
  plek := private.uitnodigingsmail_plek(new.created_by, ontvanger);
  insert into private.uitnodigingsmails (invite_id, household_id, nummer, status, aanvrager, ontvanger_hmac)
    values (new.id, new.household_id, 1,
            case when private.uitnodigingsmails_vandaag(new.household_id) >= private.uitnodigingsmail_daglimiet()
                 then 'daglimiet' when not plek then 'daglimiet' else 'wacht' end,
            new.created_by, ontvanger);
  return new;
end $$;

-- "Nog eens sturen": dezelfde regels als voorheen, plus de grens per account en per ontvanger (TPM03).
create or replace function private.uitnodigingsmail_opnieuw(p_invite uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := private.require_uid();
  inv public.household_invites%rowtype;
  laatste private.uitnodigingsmails%rowtype;
  ontvanger text;
begin
  select * into inv from public.household_invites where id = p_invite;
  if not found or not private.has_role(inv.household_id, array['owner', 'admin']) then
    raise exception 'Uitnodiging niet gevonden' using errcode = 'TPU01';
  end if;
  perform private.lock_household(inv.household_id);
  select * into inv from public.household_invites where id = p_invite;   -- opnieuw, onder de vergrendeling
  if not private.uitnodiging_mailbaar(inv) then
    raise exception 'Geen open uitnodiging met e-mailadres' using errcode = 'TPM04';
  end if;
  select * into laatste from private.uitnodigingsmails where invite_id = p_invite order by nummer desc limit 1;
  if found and laatste.nummer >= 3 then
    raise exception 'Deze uitnodiging is al 3 keer gemaild' using errcode = 'TPM02';
  end if;
  if found and laatste.gevraagd > now() - interval '10 minutes' then
    raise exception 'Wacht 10 minuten voor je opnieuw mailt' using errcode = 'TPM01';
  end if;
  if private.uitnodigingsmails_vandaag(inv.household_id) >= private.uitnodigingsmail_daglimiet() then
    raise exception 'Daglimiet voor uitnodigingsmails bereikt' using errcode = 'TPM03';
  end if;
  ontvanger := private.uitnodigingsmail_ontvanger(inv.invited_email);
  if not private.uitnodigingsmail_plek(uid, ontvanger) then
    raise exception 'Daglimiet voor uitnodigingsmails bereikt' using errcode = 'TPM03';
  end if;
  insert into private.uitnodigingsmails (invite_id, household_id, nummer, aanvrager, ontvanger_hmac)
    values (p_invite, inv.household_id, coalesce(laatste.nummer, 0) + 1, uid, ontvanger);
end $$;

revoke all on function private.uitnodigingsmail_ontvanger(text), private.uitnodigingsmail_plek(uuid, text)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- 4. L4: geziene webhook-id's van de Send Email-hook
-- ---------------------------------------------------------------------------------------------
-- Een SHA-256 van de id (de id zelf is geen geheim, maar zo is de lengte vast). Supabase Auth maakt per verzoek een
-- nieuwe id; de handtekening geldt 5 minuten, dus 24 uur bewaren (k1_opruimen) is ruim genoeg.
create table private.k1_webhooks (
  id_hash text primary key check (id_hash ~ '^[0-9a-f]{64}$'),
  gezien timestamptz not null default now()
);
create index k1_webhooks_gezien_idx on private.k1_webhooks (gezien);
revoke all on table private.k1_webhooks from public, anon, authenticated;

-- true: deze id is nieuw (en nu onthouden); false: al eerder gezien (een herhaald verzoek). Atomair: van twee gelijke
-- verzoeken tegelijk krijgt er precies één true.
create function private.k1_webhook_nieuw(p_id text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  if p_id is null or p_id = '' or char_length(p_id) > 200 then return false; end if;
  insert into private.k1_webhooks (id_hash) values (encode(extensions.digest(p_id, 'sha256'), 'hex')) on conflict do nothing;
  get diagnostics n = row_count;
  return n = 1;
end $$;

create function public.k1_webhook_nieuw(p_id text)
returns boolean language plpgsql security invoker set search_path = '' as $$
begin
  return private.k1_webhook_nieuw(p_id);
exception when others then
  raise exception using errcode = sqlstate, message = sqlerrm;   -- zonder DETAIL/HINT
end $$;

revoke all on function private.k1_webhook_nieuw(text), public.k1_webhook_nieuw(text) from public, anon, authenticated;
grant execute on function private.k1_webhook_nieuw(text), public.k1_webhook_nieuw(text) to service_role;

-- Het dagelijkse opruimen (pg_cron, ongewijzigde taak): ook de geziene webhook-id's van meer dan 24 uur oud.
create or replace function private.k1_opruimen()
returns integer language plpgsql security definer set search_path = '' as $$
declare n integer := 0; m integer;
begin
  delete from private.k1_codes where gemaakt < now() - interval '24 hours';
  get diagnostics m = row_count; n := n + m;
  delete from private.k1_toestellen where ingetrokken or laatst_gebruikt < now() - (select toestel_geldig from private.k1_grenzen);
  get diagnostics m = row_count; n := n + m;
  delete from private.k1_accounts where venster_start < now() - interval '30 days' and dag_start < now() - interval '30 days';
  get diagnostics m = row_count; n := n + m;
  delete from private.k1_webhooks where gezien < now() - interval '24 hours';
  get diagnostics m = row_count; n := n + m;
  delete from auth.users u where u.email_confirmed_at is null and u.created_at < now() - interval '24 hours'
    and not exists (select 1 from public.household_members m2 where m2.user_id = u.id);
  get diagnostics m = row_count; n := n + m;
  return n;
end $$;

-- ---------------------------------------------------------------------------------------------
-- 5. L5: het wachtrij-adres uit Vault alleen via https (behalve lokaal)
-- ---------------------------------------------------------------------------------------------
-- De database roept de Edge Functions aan met het wachtrijgeheim in een kop. Over http:// zou dat geheim onversleuteld
-- over het netwerk gaan. Online dus alleen https://; http:// alleen naar een lokaal adres: dit toestel (127.0.0.1,
-- localhost), de Docker-host (host.docker.internal) of de gateway van een lokale Supabase-stack (kong,
-- supabase_kong_<project>, zoals k1-lokaal.mjs het in Vault zet). Na de host komt meteen een poort of een /, zodat
-- "http://localhost.voorbeeld.nl/" of "http://localhost@voorbeeld.nl/" niet als lokaal telt.
create function private.wachtrij_url_toegestaan(p_url text)
returns boolean language sql immutable set search_path = '' as $$
  select coalesce(p_url ~ '^https://[^/@]+/'
    or p_url ~ '^http://(127\.0\.0\.1|localhost|host\.docker\.internal|kong|supabase_kong_[a-z0-9_]+)(:[0-9]+)?/', false)
$$;
revoke all on function private.wachtrij_url_toegestaan(text) from public, anon, authenticated;

-- Ongewijzigd, behalve de controle op het adres.
create or replace function private.uitnodigingsmail_aanroepen()
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  url text;
  geheim text;
begin
  if to_regnamespace('net') is null or to_regclass('vault.decrypted_secrets') is null then return false; end if;
  execute 'select decrypted_secret from vault.decrypted_secrets where name = $1' into url using 'thuisplanner_wachtrij_url';
  execute 'select decrypted_secret from vault.decrypted_secrets where name = $1' into geheim using 'thuisplanner_wachtrij_geheim';
  if url is null or geheim is null or not private.wachtrij_url_toegestaan(url) then return false; end if;
  execute 'select net.http_post(url := $1, body := $2, headers := $3, timeout_milliseconds := 10000)'
    using url, jsonb_build_object('wachtrij', true),
          jsonb_build_object('Content-Type', 'application/json', 'X-Thuisplanner-Wachtrij', geheim);
  return true;
exception when others then
  -- Een seintje mag een uitnodiging nooit laten mislukken; het vangnet probeert het straks opnieuw.
  raise warning 'Thuisplanner uitnodigingsmail: seintje niet verstuurd (%)', sqlstate;
  return false;
end $$;

create or replace function private.documenten_opruimen_ronde()
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  url text;
  geheim text;
begin
  if to_regnamespace('net') is null or to_regclass('vault.decrypted_secrets') is null then return false; end if;
  execute 'select decrypted_secret from vault.decrypted_secrets where name = $1' into url using 'thuisplanner_wachtrij_url';
  execute 'select decrypted_secret from vault.decrypted_secrets where name = $1' into geheim using 'thuisplanner_wachtrij_geheim';
  if url is null or geheim is null or url !~ '^https?://[^/]+/functions/v1/stuur-uitnodiging$'
     or not private.wachtrij_url_toegestaan(url) then return false; end if;
  execute 'select net.http_post(url := $1, body := $2, headers := $3, timeout_milliseconds := 60000)'
    using regexp_replace(url, '/stuur-uitnodiging$', '/opruimen-documenten'), '{}'::jsonb,
          jsonb_build_object('Content-Type', 'application/json', 'X-Thuisplanner-Wachtrij', geheim);
  return true;
exception when others then
  raise warning 'Thuisplanner opruimen-documenten: niet aangeroepen (%)', sqlstate;
  return false;
end $$;
