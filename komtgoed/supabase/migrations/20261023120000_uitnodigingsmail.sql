-- Thuisplanner (map komtgoed) · KG-5H deel 2 (D6): de uitnodigingsmail. Zie docs/thuisplanner-registratie-inloggen.md §15.
--
-- Een uitnodiging op e-mailadres krijgt automatisch een mail. De mail bevat geen token of link met een geheim (B4): wie
-- inlogt met dat adres, ziet de uitnodiging (deel 1b). Een doorgestuurde mail geeft dus niemand toegang.
--
-- Betrouwbaar, en nooit dubbel:
-- - Wachtrij: create_invite met een adres zet in dezelfde transactie een rij in private.uitnodigingsmails (trigger).
--   Geen mail voor een uitnodiging die niet bestaat; geen mail die kwijtraakt.
-- - De wachtrij bevat geen adres. De Edge Function stuur-uitnodiging leest het adres pas bij het versturen uit de open
--   uitnodiging; is die intussen gesloten of verlopen (adres gewist, deel 1b), dan vervalt de mail.
-- - Hoogstens één mail per rij ("at most once"): een rij gaat van wacht naar bezig (met een termijn) en dan naar
--   verstuurd. Is de uitkomst onzeker (time-out na het versturen, of de functie stopte halverwege), dan wordt de rij
--   "onzeker" en NIET automatisch opnieuw verstuurd. Alleen een aanbieder die de mail aantoonbaar niet aannam (5xx of
--   429) geeft een nieuwe poging, hoogstens 3 keer. De rij-id gaat als idempotentiesleutel mee naar de aanbieder.
-- - "Nog eens sturen" (uitnodigingsmail_opnieuw): hoogstens 3 mails per uitnodiging, hoogstens één per 10 minuten,
--   en hoogstens 20 uitnodigingsmails per huishouden per 24 uur. Afgedwongen hier, onder de huishoudvergrendeling.
-- - Status voor de uitnodiger (uitnodigingsmails): verstuurd om, we proberen het opnieuw, niet bezorgd, ...
--
-- Stabiele codes: TPM01 (wacht 10 minuten), TPM02 (al 3 keer verstuurd), TPM03 (daglimiet), TPM04 (geen open
-- uitnodiging met adres). De app vertaalt alleen de code.

-- ---------------------------------------------------------------------------------------------
-- 1. De wachtrij
-- ---------------------------------------------------------------------------------------------
create table private.uitnodigingsmails (
  id uuid primary key default gen_random_uuid(),
  invite_id uuid not null references public.household_invites(id) on delete cascade,
  household_id uuid not null references public.households(id) on delete cascade,
  nummer smallint not null check (nummer between 1 and 3),
  status text not null default 'wacht'
    check (status in ('wacht', 'bezig', 'verstuurd', 'onzeker', 'mislukt', 'niet_bezorgd', 'vervallen', 'daglimiet')),
  pogingen smallint not null default 0 check (pogingen between 0 and 3),
  volgende timestamptz not null default now(),
  bezig_tot timestamptz,
  gevraagd timestamptz not null default now(),
  verstuurd timestamptz,
  bericht_id text check (bericht_id is null or char_length(bericht_id) <= 200),
  unique (invite_id, nummer)
);
create index uitnodigingsmails_wacht_idx on private.uitnodigingsmails (volgende) where status = 'wacht';
create index uitnodigingsmails_huishouden_idx on private.uitnodigingsmails (household_id, gevraagd);
create index uitnodigingsmails_bericht_idx on private.uitnodigingsmails (bericht_id) where bericht_id is not null;
revoke all on private.uitnodigingsmails from public, anon, authenticated;

create function private.uitnodigingsmail_daglimiet()
returns integer language sql immutable set search_path = '' as $$ select 20 $$;

-- Telt wat in de afgelopen 24 uur naar de aanbieder ging of kan gaan (niet: vervallen of geweigerd door de daglimiet).
create function private.uitnodigingsmails_vandaag(p_household uuid)
returns integer language sql stable security definer set search_path = '' as $$
  select count(*)::integer from private.uitnodigingsmails
  where household_id = p_household and gevraagd > now() - interval '24 hours' and status not in ('vervallen', 'daglimiet')
$$;

-- Bij elke nieuwe uitnodiging met adres: de eerste mail in de wachtrij (in dezelfde transactie als create_invite, die
-- het huishouden al vergrendeld heeft). Boven de daglimiet blijft de uitnodiging geldig; de mail gaat dan niet.
create function private.uitnodigingsmail_plannen()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.invited_email is null then return new; end if;
  insert into private.uitnodigingsmails (invite_id, household_id, nummer, status)
    values (new.id, new.household_id, 1,
            case when private.uitnodigingsmails_vandaag(new.household_id) >= private.uitnodigingsmail_daglimiet()
                 then 'daglimiet' else 'wacht' end);
  return new;
end $$;
revoke all on function private.uitnodigingsmail_plannen(), private.uitnodigingsmails_vandaag(uuid),
  private.uitnodigingsmail_daglimiet() from public, anon, authenticated;
create trigger household_invites_mail after insert on public.household_invites
  for each row execute function private.uitnodigingsmail_plannen();

-- Een uitnodiging die nog mail mag krijgen: open, niet verlopen, met adres.
create function private.uitnodiging_mailbaar(inv public.household_invites)
returns boolean language sql stable set search_path = '' as $$
  select inv.invited_email is not null and inv.accepted_at is null and inv.revoked_at is null and inv.declined_at is null
    and inv.expires_at > now()
$$;
revoke all on function private.uitnodiging_mailbaar(public.household_invites) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- 2. Voor de uitnodiger (eigenaar of beheerder)
-- ---------------------------------------------------------------------------------------------
create function private.uitnodigingsmail_opnieuw(p_invite uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := private.require_uid();
  inv public.household_invites%rowtype;
  laatste private.uitnodigingsmails%rowtype;
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
  insert into private.uitnodigingsmails (invite_id, household_id, nummer)
    values (p_invite, inv.household_id, coalesce(laatste.nummer, 0) + 1);
end $$;

-- De laatste mail per open uitnodiging van dit huishouden, met wanneer "nog eens sturen" weer kan.
create function private.uitnodigingsmails(p_household uuid)
returns table (invite_id uuid, nummer smallint, status text, gevraagd timestamptz, verstuurd timestamptz,
               opnieuw_vanaf timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_uid();
  if not private.has_role(p_household, array['owner', 'admin']) then return; end if;
  return query
    select distinct on (m.invite_id) m.invite_id, m.nummer, m.status, m.gevraagd, m.verstuurd,
      case when m.nummer >= 3 then null else m.gevraagd + interval '10 minutes' end
    from private.uitnodigingsmails m
    join public.household_invites i on i.id = m.invite_id
    where m.household_id = p_household and private.uitnodiging_mailbaar(i)
    order by m.invite_id, m.nummer desc;
end $$;

-- Voor de Edge Function, met het token van de gebruiker (dus door de toegangspoort): mag deze gebruiker de wachtrij van
-- dit huishouden laten versturen? Zo kan niemand zonder geldige codesessie de functie laten werken.
create function private.uitnodigingsmail_verzoek(p_household uuid)
returns boolean language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_uid();
  return private.has_role(p_household, array['owner', 'admin']);
end $$;

revoke all on function private.uitnodigingsmail_opnieuw(uuid), private.uitnodigingsmails(uuid),
  private.uitnodigingsmail_verzoek(uuid) from public, anon;
grant execute on function private.uitnodigingsmail_opnieuw(uuid), private.uitnodigingsmails(uuid),
  private.uitnodigingsmail_verzoek(uuid) to authenticated;

create function public.uitnodigingsmail_opnieuw(p_invite uuid)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  perform private.uitnodigingsmail_opnieuw(p_invite);
exception when others then
  raise exception using errcode = sqlstate, message = sqlerrm;   -- zonder DETAIL/HINT
end $$;
create function public.uitnodigingsmails(p_household uuid)
returns table (invite_id uuid, nummer smallint, status text, gevraagd timestamptz, verstuurd timestamptz,
               opnieuw_vanaf timestamptz)
language plpgsql stable security invoker set search_path = '' as $$
begin
  return query select * from private.uitnodigingsmails(p_household);
exception when others then
  raise exception using errcode = sqlstate, message = sqlerrm;
end $$;
create function public.uitnodigingsmail_verzoek(p_household uuid)
returns boolean language plpgsql stable security invoker set search_path = '' as $$
begin
  return private.uitnodigingsmail_verzoek(p_household);
exception when others then
  raise exception using errcode = sqlstate, message = sqlerrm;
end $$;
revoke all on function public.uitnodigingsmail_opnieuw(uuid), public.uitnodigingsmails(uuid),
  public.uitnodigingsmail_verzoek(uuid) from public, anon;
grant execute on function public.uitnodigingsmail_opnieuw(uuid), public.uitnodigingsmails(uuid),
  public.uitnodigingsmail_verzoek(uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- 3. Voor de Edge Function (alleen de service-rol)
-- ---------------------------------------------------------------------------------------------
-- Pakt de rijen die nu aan de beurt zijn (optioneel van één huishouden), met wat de mail nodig heeft. Een rij die al
-- "bezig" was en over zijn termijn is, wordt "onzeker": de vorige poging kan de mail al verstuurd hebben.
create function private.uitnodigingsmail_pak(p_household uuid, p_max integer)
returns table (id uuid, aan text, huishouden text, uitnodiger text, geldig_tot timestamptz)
language plpgsql security definer set search_path = '' as $$
declare
  r record;
  inv public.household_invites%rowtype;
begin
  update private.uitnodigingsmails m set status = 'onzeker', bezig_tot = null
    where m.status = 'bezig' and m.bezig_tot < now() and (p_household is null or m.household_id = p_household);
  for r in
    select m.id as mid, m.invite_id as iid from private.uitnodigingsmails m
    where m.status = 'wacht' and m.volgende <= now() and (p_household is null or m.household_id = p_household)
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

-- De uitkomst van één poging. Alleen vanuit "bezig".
--   verstuurd: de aanbieder nam de mail aan (bericht-id bewaard);
--   opnieuw:   de aanbieder nam hem aantoonbaar niet aan (5xx/429): later opnieuw, na 3 pogingen "mislukt";
--   onzeker:   geen antwoord (time-out): niet automatisch opnieuw;
--   mislukt:   geweigerd (4xx, bijvoorbeeld een ongeldig adres).
create function private.uitnodigingsmail_klaar(p_id uuid, p_uitkomst text, p_bericht text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_uitkomst not in ('verstuurd', 'opnieuw', 'onzeker', 'mislukt') then
    raise exception 'Onbekende uitkomst' using errcode = '22023';
  end if;
  update private.uitnodigingsmails m set
    status = case when p_uitkomst = 'opnieuw' and m.pogingen >= 3 then 'mislukt' when p_uitkomst = 'opnieuw' then 'wacht'
                  else p_uitkomst end,
    volgende = case when p_uitkomst = 'opnieuw' then now() + make_interval(mins => m.pogingen * m.pogingen) else m.volgende end,
    verstuurd = case when p_uitkomst = 'verstuurd' then now() else m.verstuurd end,
    bericht_id = case when p_uitkomst = 'verstuurd' then left(p_bericht, 200) else m.bericht_id end,
    bezig_tot = null
  where m.id = p_id and m.status = 'bezig';
end $$;

-- Een bounce-melding van de aanbieder (T18). Het formaat van de webhook hangt af van de aanbieder (keuze B6); de
-- adapter roept dit aan met het bericht-id.
create function private.uitnodigingsmail_niet_bezorgd(p_bericht text)
returns integer language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  update private.uitnodigingsmails set status = 'niet_bezorgd'
    where bericht_id = p_bericht and status in ('verstuurd', 'onzeker');
  get diagnostics n = row_count;
  return n;
end $$;

revoke all on function private.uitnodigingsmail_pak(uuid, integer), private.uitnodigingsmail_klaar(uuid, text, text),
  private.uitnodigingsmail_niet_bezorgd(text) from public, anon, authenticated;
grant execute on function private.uitnodigingsmail_pak(uuid, integer), private.uitnodigingsmail_klaar(uuid, text, text),
  private.uitnodigingsmail_niet_bezorgd(text) to service_role;

create function public.uitnodigingsmail_pak(p_household uuid default null, p_max integer default 10)
returns table (id uuid, aan text, huishouden text, uitnodiger text, geldig_tot timestamptz)
language plpgsql security invoker set search_path = '' as $$
begin
  return query select * from private.uitnodigingsmail_pak(p_household, p_max);
exception when others then
  raise exception using errcode = sqlstate, message = sqlerrm;   -- zonder DETAIL/HINT
end $$;
create function public.uitnodigingsmail_klaar(p_id uuid, p_uitkomst text, p_bericht text default null)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  perform private.uitnodigingsmail_klaar(p_id, p_uitkomst, p_bericht);
exception when others then
  raise exception using errcode = sqlstate, message = sqlerrm;
end $$;
create function public.uitnodigingsmail_niet_bezorgd(p_bericht text)
returns integer language plpgsql security invoker set search_path = '' as $$
begin
  return private.uitnodigingsmail_niet_bezorgd(p_bericht);
exception when others then
  raise exception using errcode = sqlstate, message = sqlerrm;
end $$;
revoke all on function public.uitnodigingsmail_pak(uuid, integer), public.uitnodigingsmail_klaar(uuid, text, text),
  public.uitnodigingsmail_niet_bezorgd(text) from public, anon, authenticated;
grant execute on function public.uitnodigingsmail_pak(uuid, integer), public.uitnodigingsmail_klaar(uuid, text, text),
  public.uitnodigingsmail_niet_bezorgd(text) to service_role;

-- ---------------------------------------------------------------------------------------------
-- 4. Opruimen (dagelijks): de wachtrij bevat geen adres, maar wordt na 30 dagen toch weggegooid.
-- ---------------------------------------------------------------------------------------------
create function private.uitnodigingsmails_opruimen()
returns integer language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  delete from private.uitnodigingsmails where gevraagd < now() - interval '30 days';
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function private.uitnodigingsmails_opruimen() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    execute $s$ select cron.schedule('thuisplanner-uitnodigingsmails-opruimen', '53 3 * * *', 'select private.uitnodigingsmails_opruimen()') $s$;
  end if;
end $$;
