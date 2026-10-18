-- Thuisplanner · D6: uitnodigingsmails automatisch versturen, ook als niemand de app open heeft.
-- Zie docs/thuisplanner-uitnodigingsmail-verzending.md (akkoord 18 oktober 2026). De wachtrij uit 20261023120000 blijft de
-- bron van waarheid; deze migratie voegt het moment en de manier van versturen toe:
--
-- 1. Seintje: na elke nieuwe wachtende mail roept de database (pg_net) de Edge Function stuur-uitnodiging aan. pg_net
--    verstuurt pas na de commit: een teruggedraaide uitnodiging geeft geen seintje.
-- 2. Vangnet: een geplande taak kijkt elke minuut of er werk ligt (een wachtende mail, of een poging die over zijn
--    termijn is) en roept alleen dan de functie aan. Valt een seintje weg (storing, herstart: de wachtrij van pg_net
--    staat in niet-gelogde tabellen), dan pakt het vangnet het binnen een minuut op.
-- 3. Toestanden: "aangenomen" (de aanbieder nam de mail aan) is iets anders dan "bezorgd" (de aanbieder meldt dat de
--    mail is afgeleverd) en "niet_bezorgd" (de aanbieder meldt dat het niet lukte). Alleen een ondertekende melding van
--    de aanbieder maakt een mail bezorgd of niet bezorgd.
-- 4. Opnieuw proberen: een aanbieder die de mail aantoonbaar niet aannam (5xx, 429) geeft een nieuwe poging na 1, 4 en 9
--    minuten (of later als de aanbieder dat vraagt), daarna "mislukt". Een 4xx is meteen "mislukt".
-- 5. Nooit dubbel: een onzekere poging (geen antwoord, of de functie stopte halverwege) wordt ALLEEN opnieuw geprobeerd
--    als de adapter een bewezen idempotente aanbieder is (dezelfde sleutel = hoogstens één mail). Anders blijft hij
--    "onzeker" en kiest de uitnodiger zelf ("Mail nog eens sturen", met de grenzen uit 20261023120000).
-- 6. De URL van de functie en het wachtrijgeheim staan per omgeving in Vault (thuisplanner_wachtrij_url,
--    thuisplanner_wachtrij_geheim), nooit in de repository. Ontbreken ze, dan gaat er niets weg en blijft alles wachten
--    (de nacontrole meldt het).
--
-- pg_net en Vault zijn op Supabase beschikbaar; in de nabootsing van de RLS-tests (gewone PostgreSQL) niet. Dan worden
-- de aanroepen overgeslagen, net als pg_cron.

-- ---------------------------------------------------------------------------------------------
-- 1. Extensie en instellingen
-- ---------------------------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_net with schema extensions;
  end if;
end $$;

-- Alleen voor de lokale tests: de nagebootste aanbieder ('gewoon' of 'idempotent'). Online altijd leeg (nacontrole);
-- de Edge Function gebruikt hem bovendien alleen met een lokale TESTAANBIEDER_URL.
alter table private.instellingen add column mail_testaanbieder text
  check (mail_testaanbieder is null or mail_testaanbieder in ('gewoon', 'idempotent'));

-- ---------------------------------------------------------------------------------------------
-- 2. Toestanden en pogingen
-- ---------------------------------------------------------------------------------------------
alter table private.uitnodigingsmails drop constraint uitnodigingsmails_status_check;
alter table private.uitnodigingsmails drop constraint uitnodigingsmails_pogingen_check;
update private.uitnodigingsmails set status = 'aangenomen' where status = 'verstuurd';
alter table private.uitnodigingsmails rename column verstuurd to aangenomen_op;
alter table private.uitnodigingsmails
  add column bezorgd_op timestamptz,
  add constraint uitnodigingsmails_status_check
    check (status in ('wacht', 'bezig', 'aangenomen', 'bezorgd', 'onzeker', 'mislukt', 'niet_bezorgd', 'vervallen', 'daglimiet')),
  -- De eerste poging en hoogstens 3 nieuwe (na 1, 4 en 9 minuten).
  add constraint uitnodigingsmails_pogingen_check check (pogingen between 0 and 4);

-- De wachttijd voor de volgende poging na n pogingen: 1, 4, 9 minuten.
create function private.uitnodigingsmail_wachttijd(n smallint)
returns interval language sql immutable set search_path = '' as $$ select make_interval(mins => n * n) $$;

-- Is er werk voor de functie? Een wachtende mail die aan de beurt is, of een poging die over zijn termijn is.
create function private.uitnodigingsmail_werk()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from private.uitnodigingsmails m
                 where (m.status = 'wacht' and m.volgende <= now()) or (m.status = 'bezig' and m.bezig_tot < now()))
$$;

-- ---------------------------------------------------------------------------------------------
-- 3. Pakken, uitkomst en bezorging (voor de Edge Function, alleen de service-rol)
-- ---------------------------------------------------------------------------------------------
drop function public.uitnodigingsmail_pak(uuid, integer);
drop function private.uitnodigingsmail_pak(uuid, integer);
drop function public.uitnodigingsmail_klaar(uuid, text, text);
drop function private.uitnodigingsmail_klaar(uuid, text, text);
drop function public.uitnodigingsmail_niet_bezorgd(text);
drop function private.uitnodigingsmail_niet_bezorgd(text);

-- Pakt de rijen die aan de beurt zijn. Een rij die "bezig" was en over zijn termijn is (de functie stopte halverwege,
-- of het antwoord van de aanbieder ging verloren): met een idempotente adapter nog eens (zelfde sleutel), anders
-- "onzeker". FOR UPDATE SKIP LOCKED: twee gelijktijdige aanroepen pakken nooit dezelfde rij.
create function private.uitnodigingsmail_pak(p_max integer, p_idempotent boolean)
returns table (id uuid, aan text, huishouden text, uitnodiger text, geldig_tot timestamptz)
language plpgsql security definer set search_path = '' as $$
declare
  r record;
  inv public.household_invites%rowtype;
begin
  update private.uitnodigingsmails m
    set status = case when p_idempotent and m.pogingen < 4 then 'wacht' else 'onzeker' end,
        volgende = case when p_idempotent and m.pogingen < 4 then now() + private.uitnodigingsmail_wachttijd(m.pogingen) else m.volgende end,
        bezig_tot = null
    where m.status = 'bezig' and m.bezig_tot < now();
  for r in
    select m.id as mid, m.invite_id as iid from private.uitnodigingsmails m
    where m.status = 'wacht' and m.volgende <= now()
    order by m.volgende
    limit least(greatest(coalesce(p_max, 10), 1), 50)
    for update of m skip locked
  loop
    select * into inv from public.household_invites i where i.id = r.iid;
    if not private.uitnodiging_mailbaar(inv) then
      update private.uitnodigingsmails m set status = 'vervallen' where m.id = r.mid;
      continue;
    end if;
    update private.uitnodigingsmails m set status = 'bezig', bezig_tot = now() + interval '2 minutes', pogingen = m.pogingen + 1
      where m.id = r.mid;
    id := r.mid;
    aan := inv.invited_email;
    huishouden := (select h.name from public.households h where h.id = inv.household_id);
    uitnodiger := (select hm.display_name from public.household_members hm
                   where hm.household_id = inv.household_id and hm.user_id = inv.created_by and hm.status = 'active' limit 1);
    geldig_tot := inv.expires_at;
    return next;
  end loop;
end $$;

-- De uitkomst van één poging, alleen vanuit "bezig":
--   aangenomen: de aanbieder nam de mail aan (bericht-id bewaard);
--   opnieuw:    aantoonbaar niet aangenomen (5xx, 429): na 1, 4 of 9 minuten (of de wachttijd van de aanbieder), na de
--               4e poging "mislukt";
--   onzeker:    geen antwoord; alleen met een idempotente adapter nog eens (zelfde schema), anders "onzeker";
--   mislukt:    definitief geweigerd (4xx).
create function private.uitnodigingsmail_klaar(p_id uuid, p_uitkomst text, p_bericht text, p_wacht_s integer, p_idempotent boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_uitkomst not in ('aangenomen', 'opnieuw', 'onzeker', 'mislukt') then
    raise exception 'Onbekende uitkomst' using errcode = '22023';
  end if;
  update private.uitnodigingsmails m set
    status = case
      when p_uitkomst = 'aangenomen' then 'aangenomen'
      when p_uitkomst = 'mislukt' then 'mislukt'
      when p_uitkomst = 'opnieuw' then case when m.pogingen >= 4 then 'mislukt' else 'wacht' end
      else case when p_idempotent and m.pogingen < 4 then 'wacht' else 'onzeker' end end,
    volgende = case when p_uitkomst = 'opnieuw' or (p_uitkomst = 'onzeker' and p_idempotent)
      then now() + greatest(private.uitnodigingsmail_wachttijd(m.pogingen), make_interval(secs => least(coalesce(p_wacht_s, 0), 3600)))
      else m.volgende end,
    aangenomen_op = case when p_uitkomst = 'aangenomen' then now() else m.aangenomen_op end,
    bericht_id = case when p_uitkomst = 'aangenomen' then left(p_bericht, 200) else m.bericht_id end,
    bezig_tot = null
  where m.id = p_id and m.status = 'bezig';
end $$;

-- Een ondertekende melding van de aanbieder: bezorgd of niet bezorgd. Alleen na aangenomen (of onzeker: de mail bleek
-- toch weg); een latere "niet bezorgd" gaat voor (een bounce na aflevering).
create function private.uitnodigingsmail_bezorging(p_bericht text, p_uitkomst text)
returns integer language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  if p_uitkomst not in ('bezorgd', 'niet_bezorgd') then raise exception 'Onbekende uitkomst' using errcode = '22023'; end if;
  update private.uitnodigingsmails m set status = p_uitkomst,
      bezorgd_op = case when p_uitkomst = 'bezorgd' then now() else m.bezorgd_op end
    where m.bericht_id = p_bericht
      and (m.status in ('aangenomen', 'onzeker') or (m.status = 'bezorgd' and p_uitkomst = 'niet_bezorgd'));
  get diagnostics n = row_count;
  return n;
end $$;

-- Welke testaanbieder (alleen lokaal; online null).
create function private.mail_testaanbieder()
returns text language sql stable security definer set search_path = '' as $$
  select mail_testaanbieder from private.instellingen where id = 1
$$;

revoke all on function private.uitnodigingsmail_pak(integer, boolean), private.uitnodigingsmail_klaar(uuid, text, text, integer, boolean),
  private.uitnodigingsmail_bezorging(text, text), private.mail_testaanbieder(), private.uitnodigingsmail_werk(),
  private.uitnodigingsmail_wachttijd(smallint) from public, anon, authenticated;
grant execute on function private.uitnodigingsmail_pak(integer, boolean), private.uitnodigingsmail_klaar(uuid, text, text, integer, boolean),
  private.uitnodigingsmail_bezorging(text, text), private.mail_testaanbieder() to service_role;

create function public.uitnodigingsmail_pak(p_max integer default 10, p_idempotent boolean default false)
returns table (id uuid, aan text, huishouden text, uitnodiger text, geldig_tot timestamptz)
language plpgsql security invoker set search_path = '' as $$
begin
  return query select * from private.uitnodigingsmail_pak(p_max, p_idempotent);
exception when others then
  raise exception using errcode = sqlstate, message = sqlerrm;   -- zonder DETAIL/HINT
end $$;
create function public.uitnodigingsmail_klaar(p_id uuid, p_uitkomst text, p_bericht text default null, p_wacht_s integer default null,
  p_idempotent boolean default false)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  perform private.uitnodigingsmail_klaar(p_id, p_uitkomst, p_bericht, p_wacht_s, p_idempotent);
exception when others then
  raise exception using errcode = sqlstate, message = sqlerrm;
end $$;
create function public.uitnodigingsmail_bezorging(p_bericht text, p_uitkomst text)
returns integer language plpgsql security invoker set search_path = '' as $$
begin
  return private.uitnodigingsmail_bezorging(p_bericht, p_uitkomst);
exception when others then
  raise exception using errcode = sqlstate, message = sqlerrm;
end $$;
create function public.mail_testaanbieder()
returns text language plpgsql stable security invoker set search_path = '' as $$
begin
  return private.mail_testaanbieder();
exception when others then
  raise exception using errcode = sqlstate, message = sqlerrm;
end $$;
revoke all on function public.uitnodigingsmail_pak(integer, boolean), public.uitnodigingsmail_klaar(uuid, text, text, integer, boolean),
  public.uitnodigingsmail_bezorging(text, text), public.mail_testaanbieder() from public, anon, authenticated;
grant execute on function public.uitnodigingsmail_pak(integer, boolean), public.uitnodigingsmail_klaar(uuid, text, text, integer, boolean),
  public.uitnodigingsmail_bezorging(text, text), public.mail_testaanbieder() to service_role;

-- De app hoeft niet meer zelf te laten versturen: weg met de gebruikersroute.
drop function public.uitnodigingsmail_verzoek(uuid);
drop function private.uitnodigingsmail_verzoek(uuid);

-- ---------------------------------------------------------------------------------------------
-- 4. Status voor de uitnodiger: aangenomen en bezorgd apart
-- ---------------------------------------------------------------------------------------------
drop function public.uitnodigingsmails(uuid);
drop function private.uitnodigingsmails(uuid);
create function private.uitnodigingsmails(p_household uuid)
returns table (invite_id uuid, nummer smallint, status text, gevraagd timestamptz, aangenomen_op timestamptz,
               bezorgd_op timestamptz, opnieuw_vanaf timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_uid();
  if not private.has_role(p_household, array['owner', 'admin']) then return; end if;
  return query
    select distinct on (m.invite_id) m.invite_id, m.nummer, m.status, m.gevraagd, m.aangenomen_op, m.bezorgd_op,
      case when m.nummer >= 3 then null else m.gevraagd + interval '10 minutes' end
    from private.uitnodigingsmails m
    join public.household_invites i on i.id = m.invite_id
    where m.household_id = p_household and private.uitnodiging_mailbaar(i)
    order by m.invite_id, m.nummer desc;
end $$;
revoke all on function private.uitnodigingsmails(uuid) from public, anon;
grant execute on function private.uitnodigingsmails(uuid) to authenticated;
create function public.uitnodigingsmails(p_household uuid)
returns table (invite_id uuid, nummer smallint, status text, gevraagd timestamptz, aangenomen_op timestamptz,
               bezorgd_op timestamptz, opnieuw_vanaf timestamptz)
language plpgsql stable security invoker set search_path = '' as $$
begin
  return query select * from private.uitnodigingsmails(p_household);
exception when others then
  raise exception using errcode = sqlstate, message = sqlerrm;
end $$;
revoke all on function public.uitnodigingsmails(uuid) from public, anon;
grant execute on function public.uitnodigingsmails(uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- 5. Het seintje en het vangnet
-- ---------------------------------------------------------------------------------------------
-- Roept stuur-uitnodiging aan via pg_net, met de URL en het geheim uit Vault. Geeft false (en verstuurt niets) als
-- pg_net, Vault of een van de twee waarden ontbreekt. Dynamische SQL: zo werkt de migratie ook zonder die extensies.
create function private.uitnodigingsmail_aanroepen()
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  url text;
  geheim text;
begin
  if to_regnamespace('net') is null or to_regclass('vault.decrypted_secrets') is null then return false; end if;
  execute 'select decrypted_secret from vault.decrypted_secrets where name = $1' into url using 'thuisplanner_wachtrij_url';
  execute 'select decrypted_secret from vault.decrypted_secrets where name = $1' into geheim using 'thuisplanner_wachtrij_geheim';
  if url is null or geheim is null or url !~ '^https?://' then return false; end if;
  execute 'select net.http_post(url := $1, body := $2, headers := $3, timeout_milliseconds := 10000)'
    using url, jsonb_build_object('wachtrij', true),
          jsonb_build_object('Content-Type', 'application/json', 'X-Thuisplanner-Wachtrij', geheim);
  return true;
exception when others then
  -- Een seintje mag een uitnodiging nooit laten mislukken; het vangnet probeert het straks opnieuw.
  raise warning 'Thuisplanner uitnodigingsmail: seintje niet verstuurd (%)', sqlstate;
  return false;
end $$;

-- Na elke nieuwe wachtende mail (één seintje per opdracht, ook bij meer rijen tegelijk).
create function private.uitnodigingsmail_seintje()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from nieuw where status = 'wacht') then perform private.uitnodigingsmail_aanroepen(); end if;
  return null;
end $$;
create trigger uitnodigingsmails_seintje after insert on private.uitnodigingsmails
  referencing new table as nieuw for each statement execute function private.uitnodigingsmail_seintje();

-- Het vangnet: elke minuut, alleen als er werk ligt.
create function private.uitnodigingsmail_ronde()
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if not private.uitnodigingsmail_werk() then return false; end if;
  return private.uitnodigingsmail_aanroepen();
end $$;

-- Bewaking (nacontrole en dagelijkse telling): alleen aantallen, nooit adressen.
create function private.uitnodigingsmail_stand()
returns table (wacht_lang integer, bezig_over_termijn integer, onzeker integer, mislukt integer, niet_bezorgd integer)
language sql stable security definer set search_path = '' as $$
  select count(*) filter (where status = 'wacht' and volgende <= now() - interval '10 minutes')::int,
         count(*) filter (where status = 'bezig' and bezig_tot < now() - interval '10 minutes')::int,
         count(*) filter (where status = 'onzeker' and gevraagd > now() - interval '7 days')::int,
         count(*) filter (where status = 'mislukt' and gevraagd > now() - interval '7 days')::int,
         count(*) filter (where status = 'niet_bezorgd' and gevraagd > now() - interval '7 days')::int
  from private.uitnodigingsmails
$$;

revoke all on function private.uitnodigingsmail_aanroepen(), private.uitnodigingsmail_seintje(), private.uitnodigingsmail_ronde(),
  private.uitnodigingsmail_stand() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    execute $s$ select cron.schedule('thuisplanner-uitnodigingsmails-versturen', '* * * * *', 'select private.uitnodigingsmail_ronde()') $s$;
  end if;
end $$;
