-- Thuisplanner (map komtgoed) · KG-5C herstelronde 2: bevindingen uit de herreview van PR #21 (427542d).
-- Geen nieuwe functionaliteit.
--
--  1. MIDDEL Een verwijderde reeks blokkeerde nog datums: occurrence_taken keek naar het patroon van de
--           reeks, ook als die verwijderd was. Daardoor kon een achtergebleven privé-voorkomen (zie
--           herstelronde 1) niet vrij worden verplaatst. Nu telt alleen een niet-verwijderde reeks mee.
--  2. MIDDEL Account-ID's via foutdetails. Bij een schending van een constraint binnen een functie met
--           eigenaarsrechten (security definer) zet PostgreSQL de hele rij in DETAIL ("Failing row
--           contains ..."), ook kolommen die de aanroeper niet mag lezen, zoals events.owner_user_id.
--           PostgREST stuurt DETAIL en HINT mee naar de app (gereproduceerd: save_event en
--           edit_occurrence met een einddatum vóór de start gaven het account-ID van de eigenaar terug).
--           Directe API-schrijfacties hebben dit probleem niet: daar toont PostgreSQL alleen kolommen
--           waarop de aanroeper leesrecht heeft (in de praktijk: geen DETAIL).
--           Oplossing: elke publieke functie (de enige weg naar de functies in private) geeft een fout
--           door met dezelfde SQLSTATE en melding, maar zonder DETAIL en HINT. Meldingen bevatten nooit
--           rijgegevens; eigen meldingen (raise) noemen geen account-ID's.

-- ---------------------------------------------------------------------------------------------
-- 1. Verwijderde reeks blokkeert geen datums
-- ---------------------------------------------------------------------------------------------
create or replace function private.occurrence_taken(p_series uuid, p_except_event uuid, p_day date)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
      select 1 from public.events s
      where s.id = p_series and s.deleted_at is null
        and private.occurs_on(s.start_date, s.recurrence_freq, s.recurrence_until, p_day)
        and not exists (select 1 from public.event_exceptions x where x.series_id = s.id and x.occurrence_date = p_day))
    or exists (
      select 1 from public.events o
      where o.series_id = p_series and o.start_date = p_day and o.deleted_at is null
        and o.id is distinct from p_except_event);
$$;

-- ---------------------------------------------------------------------------------------------
-- 2. Publieke functies: fouten zonder DETAIL en HINT
-- ---------------------------------------------------------------------------------------------
create or replace function public.accept_invite(p_token text, p_display_name text default null)
returns uuid language plpgsql security invoker set search_path = '' as $$
begin
  return private.accept_invite(p_token, p_display_name);
exception when others then
  raise exception using errcode = sqlstate, message = sqlerrm;   -- zonder DETAIL/HINT
end $$;

create or replace function public.add_member(p_household uuid, p_display_name text, p_kind text default 'adult')
returns uuid language plpgsql security invoker set search_path = '' as $$
begin
  return private.add_member(p_household, p_display_name, p_kind);
exception when others then
  raise exception using errcode = sqlstate, message = sqlerrm;   -- zonder DETAIL/HINT
end $$;

create or replace function public.archive_member(p_household uuid, p_member uuid)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  perform private.archive_member(p_household, p_member);
exception when others then
  raise exception using errcode = sqlstate, message = sqlerrm;   -- zonder DETAIL/HINT
end $$;

create or replace function public.create_household(p_name text, p_display_name text)
returns uuid language plpgsql security invoker set search_path = '' as $$
begin
  return private.create_household(p_name, p_display_name);
exception when others then
  raise exception using errcode = sqlstate, message = sqlerrm;   -- zonder DETAIL/HINT
end $$;

create or replace function public.create_invite(p_household uuid, p_member uuid default null, p_role text default 'member', p_days integer default 7)
returns text language plpgsql security invoker set search_path = '' as $$
begin
  return private.create_invite(p_household, p_member, p_role, p_days);
exception when others then
  raise exception using errcode = sqlstate, message = sqlerrm;   -- zonder DETAIL/HINT
end $$;

create or replace function public.delete_event(p_id uuid, p_version integer)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  perform private.delete_event(p_id, p_version);
exception when others then
  raise exception using errcode = sqlstate, message = sqlerrm;   -- zonder DETAIL/HINT
end $$;

create or replace function public.delete_household(p_household uuid)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  perform private.delete_household(p_household);
exception when others then
  raise exception using errcode = sqlstate, message = sqlerrm;   -- zonder DETAIL/HINT
end $$;

create or replace function public.delete_occurrence(p_series uuid, p_date date)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  perform private.delete_occurrence(p_series, p_date);
exception when others then
  raise exception using errcode = sqlstate, message = sqlerrm;   -- zonder DETAIL/HINT
end $$;

create or replace function public.edit_occurrence(p_series uuid, p_original_date date, p_id uuid,
  p_start_date date, p_start_time time, p_end_date date, p_end_time time,
  p_title text, p_location text, p_notes text, p_preparation text, p_participants uuid[])
returns integer language plpgsql security invoker set search_path = '' as $$
begin
  return private.edit_occurrence(p_series, p_original_date, p_id, p_start_date, p_start_time, p_end_date, p_end_time,
    p_title, p_location, p_notes, p_preparation, p_participants);
exception when others then
  raise exception using errcode = sqlstate, message = sqlerrm;   -- zonder DETAIL/HINT
end $$;

create or replace function public.leave_household(p_household uuid)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  perform private.leave_household(p_household);
exception when others then
  raise exception using errcode = sqlstate, message = sqlerrm;   -- zonder DETAIL/HINT
end $$;

create or replace function public.revoke_invite(p_invite uuid)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  perform private.revoke_invite(p_invite);
exception when others then
  raise exception using errcode = sqlstate, message = sqlerrm;   -- zonder DETAIL/HINT
end $$;

create or replace function public.save_event(p_household uuid, p_id uuid, p_version integer,
  p_start_date date, p_start_time time, p_end_date date, p_end_time time,
  p_visibility text, p_title text, p_location text, p_notes text, p_preparation text,
  p_participants uuid[], p_recurrence_freq text, p_recurrence_until date)
returns integer language plpgsql security invoker set search_path = '' as $$
begin
  return private.save_event(p_household, p_id, p_version, p_start_date, p_start_time, p_end_date, p_end_time,
    p_visibility, p_title, p_location, p_notes, p_preparation, p_participants, p_recurrence_freq, p_recurrence_until);
exception when others then
  raise exception using errcode = sqlstate, message = sqlerrm;   -- zonder DETAIL/HINT
end $$;

create or replace function public.set_member_role(p_household uuid, p_member uuid, p_role text)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  perform private.set_member_role(p_household, p_member, p_role);
exception when others then
  raise exception using errcode = sqlstate, message = sqlerrm;   -- zonder DETAIL/HINT
end $$;

create or replace function public.transfer_ownership(p_household uuid, p_member uuid)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  perform private.transfer_ownership(p_household, p_member);
exception when others then
  raise exception using errcode = sqlstate, message = sqlerrm;   -- zonder DETAIL/HINT
end $$;

create or replace function public.add_shopping_items(p_household uuid, p_ids uuid[], p_names text[])
returns table (id uuid, name text, outcome text) language plpgsql security invoker set search_path = '' as $$
begin
  return query select * from private.add_shopping_items(p_household, p_ids, p_names);
exception when others then
  raise exception using errcode = sqlstate, message = sqlerrm;   -- zonder DETAIL/HINT
end $$;

create or replace function public.my_memberships()
returns table (household_id uuid, member_id uuid, role text) language plpgsql stable security invoker set search_path = '' as $$
begin
  return query select * from private.my_memberships();
exception when others then
  raise exception using errcode = sqlstate, message = sqlerrm;   -- zonder DETAIL/HINT
end $$;
