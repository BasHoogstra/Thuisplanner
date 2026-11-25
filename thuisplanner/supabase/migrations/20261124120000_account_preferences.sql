-- Thuisplanner · Persoonlijke instellingen (besluit 20; docs/thuisplanner-besluit20-bouwvoorstel.md §5.1), PR V.
-- ALLEEN LOKAAL, op een eigen stack. Niet naar staging of de bèta zonder een afzonderlijk akkoord.
--
-- Productregels:
--  1. Voorkeuren zijn per account (auth.users), nooit per huishouden of lid (docs/thuisplanner-meldingen.md, M2 en §3.1).
--     Een kind zonder account heeft geen voorkeuren.
--  2. Alleen het eigen account leest of wijzigt de eigen rij; ook de eigenaar van een huishouden niet die van een ander.
--  3. Alleen bekende sleutels met een vaste set waarden (dezelfde lijst als app/src/lib/voorkeuren.ts, SLEUTELS); geen
--     vrije tekst. Een ontbrekende sleutel is de standaard: bestaande en nieuwe accounts hebben zonder rij de standaard.
--  4. Schrijven per sleutel, atomair (jsonb_set in één update): twee toestellen die verschillende instellingen wijzigen,
--     overschrijven elkaar niet. Dezelfde sleutel: de laatste wint.
--  5. Geen realtime: de app haalt de rij op bij het starten, bij terugkeren naar de app en in een vangnetronde.
--  6. De rij verdwijnt met het account (cascade) en gaat mee in de export (alle tabellen in public).
--
-- Schrijven alleen via set_preference en reset_preferences (security definer, via de toegangspoort); de app heeft alleen
-- leesrecht op de eigen rij.

create table public.account_preferences (
  user_id uuid primary key references auth.users (id) on delete cascade,
  prefs jsonb not null default '{}'::jsonb,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------------------------
-- Bekende sleutels en waarden
-- ---------------------------------------------------------------------------------------------
create function private.voorkeur_geldig(p_key text, p_value jsonb)
returns boolean language sql immutable set search_path = '' as $$
  select case p_key
    when 'startscherm' then p_value in ('"vandaag"', '"agenda"', '"taken"', '"boodschappen"')
    when 'overzicht.afspraken' then jsonb_typeof(p_value) = 'boolean'
    when 'overzicht.taken' then jsonb_typeof(p_value) = 'boolean'
    when 'overzicht.boodschappen' then jsonb_typeof(p_value) = 'boolean'
    when 'overzicht.verder' then jsonb_typeof(p_value) = 'boolean'
    when 'agenda.weergave' then p_value in ('"dag"', '"week"', '"maand"', '"taken"')
    when 'agenda.wie' then p_value in ('"iedereen"', '"ik"')
    else false
  end
$$;

create function private.voorkeuren_geldig(p_prefs jsonb)
returns boolean language sql immutable set search_path = '' as $$
  select jsonb_typeof(p_prefs) = 'object'
    and not exists (select 1 from jsonb_each(p_prefs) e where not private.voorkeur_geldig(e.key, e.value))
    -- Het Overzicht is nooit leeg: niet alle vier de onderdelen uit.
    and not (p_prefs @> '{"overzicht.afspraken": false, "overzicht.taken": false, "overzicht.boodschappen": false, "overzicht.verder": false}')
$$;

alter table public.account_preferences add constraint account_preferences_prefs_check check (private.voorkeuren_geldig(prefs));

revoke all on function private.voorkeur_geldig(text, jsonb), private.voorkeuren_geldig(jsonb) from public, anon, authenticated;

create trigger account_preferences_touch before update on public.account_preferences
  for each row execute function private.touch_updated_at();

-- ---------------------------------------------------------------------------------------------
-- Rechten: alleen de eigen rij lezen; schrijven via de functies hieronder
-- ---------------------------------------------------------------------------------------------
alter table public.account_preferences enable row level security;
revoke all on table public.account_preferences from public, anon, authenticated;
-- Geen user_id: geen enkele kolom die naar een account verwijst is via de API leesbaar (P4, KG-T29). RLS laat toch alleen
-- de eigen rij zien, dus de app haalt "de" rij op zonder filter.
grant select (prefs, version, updated_at) on public.account_preferences to authenticated;
create policy account_preferences_select on public.account_preferences for select to authenticated
  using (user_id = (select private.uid()));

-- ---------------------------------------------------------------------------------------------
-- Schrijven
-- ---------------------------------------------------------------------------------------------
-- Eén sleutel zetten. Geeft de nieuwe stand terug. Een onbekende sleutel of waarde: 22023.
create function private.set_preference(p_key text, p_value jsonb)
returns table (prefs jsonb, version integer) language plpgsql security definer set search_path = '' as $$
declare uid uuid := private.require_uid();
begin
  if p_key is null or p_value is null or not private.voorkeur_geldig(p_key, p_value) then
    raise exception 'Onbekende instelling' using errcode = '22023';
  end if;
  return query
  insert into public.account_preferences as a (user_id, prefs) values (uid, jsonb_build_object(p_key, p_value))
  on conflict (user_id) do update set prefs = a.prefs || jsonb_build_object(p_key, p_value), version = a.version + 1
  returning a.prefs, a.version;
exception when check_violation then
  raise exception 'Eén onderdeel van het Overzicht blijft altijd aan' using errcode = '22023';
end $$;

-- Herstellen: 'weergave' haalt de weergavesleutels weg (startscherm, overzicht.*, agenda.*), zodat de standaard geldt.
-- Later krijgen de meldingen een eigen scope; die blijven bij 'weergave' staan.
create function private.reset_preferences(p_scope text)
returns table (prefs jsonb, version integer) language plpgsql security definer set search_path = '' as $$
declare uid uuid := private.require_uid();
begin
  if p_scope is distinct from 'weergave' then
    raise exception 'Onbekende keuze' using errcode = '22023';
  end if;
  return query
  insert into public.account_preferences as a (user_id) values (uid)
  on conflict (user_id) do update
    set prefs = a.prefs - array['startscherm', 'overzicht.afspraken', 'overzicht.taken', 'overzicht.boodschappen',
                                'overzicht.verder', 'agenda.weergave', 'agenda.wie'],
        version = a.version + 1
  returning a.prefs, a.version;
end $$;

revoke all on function private.set_preference(text, jsonb), private.reset_preferences(text) from public, anon;
grant execute on function private.set_preference(text, jsonb), private.reset_preferences(text) to authenticated;

create function public.set_preference(p_key text, p_value jsonb)
returns table (prefs jsonb, version integer) language plpgsql security invoker set search_path = '' as $$
begin
  return query select * from private.set_preference(p_key, p_value);
exception when others then
  raise exception using errcode = sqlstate, message = sqlerrm;   -- zonder DETAIL/HINT
end $$;
create function public.reset_preferences(p_scope text)
returns table (prefs jsonb, version integer) language plpgsql security invoker set search_path = '' as $$
begin
  return query select * from private.reset_preferences(p_scope);
exception when others then
  raise exception using errcode = sqlstate, message = sqlerrm;
end $$;
revoke all on function public.set_preference(text, jsonb), public.reset_preferences(text) from public, anon;
grant execute on function public.set_preference(text, jsonb), public.reset_preferences(text) to authenticated;
