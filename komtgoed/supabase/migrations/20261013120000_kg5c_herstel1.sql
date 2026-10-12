-- Thuisplanner (map komtgoed) · KG-5C herstelronde 1: bevindingen uit de onafhankelijke review van PR #21
-- (700c3d9). Geen nieuwe functionaliteit.
--
--  1. HOOG  Privé-afspraken hoorden bij het lidprofiel (owner_member_id). Na vertrek kon een ander account
--           aan hetzelfde profiel worden gekoppeld en las dan de oude privé-afspraken. Nu:
--           a. privé-inhoud is gebonden aan het account (owner_user_id, niet leesbaar via de API); details
--              zijn alleen zichtbaar voor dát account, ook als het profiel later aan iemand anders hangt;
--           b. zodra een account van een profiel loskomt (vertrek, accountverwijdering, of welke route
--              ook), verdwijnen de privé-afspraken van dat profiel echt (trigger op household_members).
--           Archiveren laat het account gekoppeld: de privé-afspraken blijven onleesbaar voor iedereen
--           en verdwijnen bij accountverwijdering.
--  2. MIDDEL Een gedeelde reeks verwijderen nam ook losgemaakte privé-voorkomens van een ander mee. Nu
--           alleen de voorkomens die de verwijderaar zelf mag wijzigen; andermans privé-voorkomens
--           houden hun eigen zichtbaarheid en blijven staan.
--  3. MIDDEL Twee losgemaakte voorkomens konden tegelijk naar dezelfde dag. Nu: vaste vergrendelvolgorde
--           (eerst de reeks, dan het voorkomen) en een unieke index (reeks, dag) voor actieve voorkomens.

-- ---------------------------------------------------------------------------------------------
-- 1a. Eigenaar = account
-- ---------------------------------------------------------------------------------------------
alter table public.events add column owner_user_id uuid references auth.users(id) on delete set null;
update public.events e set owner_user_id = m.user_id
  from public.household_members m where m.id = e.owner_member_id;
-- Account-ID's blijven buiten de API (zie KG-T29): select per kolom, zonder owner_user_id.
revoke select on public.events from authenticated;
grant select (id, household_id, owner_member_id, visibility, start_date, start_time, end_date, end_time,
              recurrence_freq, recurrence_until, series_id, original_date, version, created_at, updated_at, deleted_at)
  on public.events to authenticated;

-- Is deze afspraak van mij: mijn (actieve) lidprofiel én mijn account?
create function private.is_my_event(p_owner_member uuid, p_owner_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_owner_user is not null and p_owner_user = (select auth.uid())
     and p_owner_member in (select mm.member_id from private.my_memberships() mm);
$$;
revoke all on function private.is_my_event(uuid, uuid) from public, anon;
grant execute on function private.is_my_event(uuid, uuid) to authenticated;

-- Mag de ingelogde gebruiker de details van deze afspraak lezen? Gedeeld: ieder actief lid. Privé: alleen
-- het account dat eigenaar is, via zijn actieve lidprofiel. Een functie (security definer) omdat
-- owner_user_id niet leesbaar is voor authenticated en het beleid die kolom dus niet zelf mag noemen.
create function private.event_details_visible(p_event uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.events e
    where e.id = p_event and e.household_id in (select private.my_household_ids())
      and (e.visibility = 'household' or private.is_my_event(e.owner_member_id, e.owner_user_id))
  );
$$;
revoke all on function private.event_details_visible(uuid) from public, anon;
grant execute on function private.event_details_visible(uuid) to authenticated;

drop policy event_details_select on public.event_details;
create policy event_details_select on public.event_details for select to authenticated
  using (household_id in (select private.my_household_ids()) and private.event_details_visible(event_id));

-- ---------------------------------------------------------------------------------------------
-- 1b. Account los van een profiel: privé-afspraken van dat profiel verdwijnen
-- ---------------------------------------------------------------------------------------------
create function private.drop_private_on_unlink()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  delete from public.events e
    where e.household_id = old.household_id and e.visibility = 'private'
      and (e.owner_member_id = old.id or e.owner_user_id = old.user_id);
  return null;
end $$;
revoke all on function private.drop_private_on_unlink() from public, anon, authenticated;
create trigger members_unlink_private after update of user_id on public.household_members
  for each row when (old.user_id is not null and new.user_id is distinct from old.user_id)
  execute function private.drop_private_on_unlink();

-- ---------------------------------------------------------------------------------------------
-- 3. Eén actief voorkomen per reeks per dag (ook bij gelijktijdige transacties)
-- ---------------------------------------------------------------------------------------------
create unique index events_series_day_key on public.events (series_id, start_date)
  where series_id is not null and deleted_at is null;

-- ---------------------------------------------------------------------------------------------
-- Functies (zelfde gedrag als KG-5C, met de reparaties)
-- ---------------------------------------------------------------------------------------------
create or replace function private.save_event(
  p_household uuid, p_id uuid, p_version integer,
  p_start_date date, p_start_time time, p_end_date date, p_end_time time,
  p_visibility text, p_title text, p_location text, p_notes text, p_preparation text,
  p_participants uuid[], p_recurrence_freq text, p_recurrence_until date)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := private.require_uid();
  me uuid;
  sid uuid;
  ev public.events%rowtype;
  nieuw integer;
begin
  perform private.lock_household_shared(p_household);
  me := private.my_member_id(p_household);
  if me is null then raise exception 'Je bent geen lid van dit huishouden' using errcode = '42501'; end if;
  if p_id is null then raise exception 'Afspraak zonder id' using errcode = '22023'; end if;
  if p_visibility is null or p_visibility not in ('household', 'private') then
    raise exception 'Zichtbaarheid moet household of private zijn' using errcode = '22023';
  end if;
  if private.clean_text(p_title, 200) is null then raise exception 'Geef de afspraak een titel' using errcode = '22023'; end if;
  perform private.check_participants(p_household, p_participants);

  -- Vergrendelvolgorde: eerst de reeks (bij een losgemaakt voorkomen), dan de afspraak zelf.
  select e.series_id into sid from public.events e where e.id = p_id;
  if sid is not null then
    perform 1 from public.events s where s.id = sid for update;
  end if;
  select * into ev from public.events where id = p_id for update;
  if not found then
    if p_version is not null then raise exception 'Afspraak niet gevonden' using errcode = 'P0002'; end if;
    insert into public.events (id, household_id, owner_member_id, owner_user_id, visibility, start_date, start_time,
                               end_date, end_time, recurrence_freq, recurrence_until)
      values (p_id, p_household, me, uid, p_visibility::public.visibility, p_start_date, p_start_time, p_end_date,
              p_end_time, p_recurrence_freq, p_recurrence_until);
    insert into public.event_details (event_id, household_id, title, location, notes, preparation)
      values (p_id, p_household, private.clean_text(p_title, 200), private.clean_text(p_location, 200),
              private.clean_text(p_notes, 2000), private.clean_text(p_preparation, 500));
    insert into public.event_participants (event_id, member_id, household_id)
      select p_id, m, p_household from (select distinct unnest(coalesce(p_participants, '{}')) m) x;
    return 1;
  end if;

  -- Bestaat in een ander huishouden, is verwijderd, of is privé en niet van dit account: "niet gevonden".
  if ev.household_id <> p_household or ev.deleted_at is not null
     or (ev.visibility = 'private' and not private.is_my_event(ev.owner_member_id, ev.owner_user_id)) then
    raise exception 'Afspraak niet gevonden' using errcode = 'P0002';
  end if;
  if p_version is null then raise exception 'Deze afspraak bestaat al' using errcode = '23505'; end if;
  if ev.version <> p_version then
    raise exception 'Iemand anders heeft dit net aangepast' using errcode = 'PT409';
  end if;
  if p_visibility::public.visibility <> ev.visibility and ev.owner_member_id <> me then
    raise exception 'Alleen de eigenaar kiest of een afspraak privé of gedeeld is' using errcode = '42501';
  end if;
  if ev.series_id is not null then
    if p_recurrence_freq is not null then
      raise exception 'Een aangepast voorkomen kan zelf niet herhalen' using errcode = '22023';
    end if;
    if p_start_date <> ev.start_date and private.occurrence_taken(ev.series_id, ev.id, p_start_date) then
      raise exception 'Op die dag staat de reeks al' using errcode = '23505';
    end if;
  end if;
  update public.events set visibility = p_visibility::public.visibility, start_date = p_start_date,
    start_time = p_start_time, end_date = p_end_date, end_time = p_end_time,
    recurrence_freq = p_recurrence_freq, recurrence_until = p_recurrence_until,
    -- Wordt de afspraak (weer) privé, dan hoort de inhoud bij het account dat dat kiest: de eigenaar.
    owner_user_id = case when p_visibility = 'private' and ev.visibility <> 'private' then uid else ev.owner_user_id end
    where id = ev.id returning version into nieuw;
  update public.event_details set title = private.clean_text(p_title, 200), location = private.clean_text(p_location, 200),
    notes = private.clean_text(p_notes, 2000), preparation = private.clean_text(p_preparation, 500)
    where event_id = ev.id;
  delete from public.event_participants where event_id = ev.id;
  insert into public.event_participants (event_id, member_id, household_id)
    select ev.id, m, p_household from (select distinct unnest(coalesce(p_participants, '{}')) m) x;
  return nieuw;
end $$;

create or replace function private.lock_event(p_id uuid, out ev public.events, out me uuid)
language plpgsql security definer set search_path = '' as $$
declare
  hid uuid;
begin
  perform private.require_uid();
  select e.household_id into hid from public.events e where e.id = p_id;
  if not found then raise exception 'Afspraak niet gevonden' using errcode = 'P0002'; end if;
  perform private.lock_household_shared(hid);
  me := private.my_member_id(hid);
  select * into ev from public.events where id = p_id for update;
  if me is null or not found or ev.deleted_at is not null
     or (ev.visibility = 'private' and not private.is_my_event(ev.owner_member_id, ev.owner_user_id)) then
    raise exception 'Afspraak niet gevonden' using errcode = 'P0002';
  end if;
end $$;

create or replace function private.edit_occurrence(
  p_series uuid, p_original_date date, p_id uuid,
  p_start_date date, p_start_time time, p_end_date date, p_end_time time,
  p_title text, p_location text, p_notes text, p_preparation text, p_participants uuid[])
returns integer language plpgsql security definer set search_path = '' as $$
declare
  r record;
  s public.events%rowtype;
begin
  r := private.lock_event(p_series);   -- vergrendelt de reeks (zelfde volgorde als save_event)
  s := r.ev;
  if s.recurrence_freq is null then raise exception 'Dit is geen herhalende afspraak' using errcode = '22023'; end if;
  if p_id is null or private.clean_text(p_title, 200) is null then
    raise exception 'Geef het voorkomen een id en een titel' using errcode = '22023';
  end if;
  if not private.occurs_on(s.start_date, s.recurrence_freq, s.recurrence_until, p_original_date) then
    raise exception 'Deze datum hoort niet bij de reeks' using errcode = '22023';
  end if;
  if exists (select 1 from public.event_exceptions x where x.series_id = s.id and x.occurrence_date = p_original_date) then
    raise exception 'Dit voorkomen is al aangepast of verwijderd' using errcode = '23505';
  end if;
  if p_start_date <> p_original_date and private.occurrence_taken(s.id, null, p_start_date) then
    raise exception 'Op die dag staat de reeks al' using errcode = '23505';
  end if;
  perform private.check_participants(s.household_id, p_participants);
  insert into public.event_exceptions (series_id, occurrence_date, household_id) values (s.id, p_original_date, s.household_id);
  insert into public.events (id, household_id, owner_member_id, owner_user_id, visibility, start_date, start_time,
                             end_date, end_time, series_id, original_date)
    values (p_id, s.household_id, s.owner_member_id, s.owner_user_id, s.visibility, p_start_date, p_start_time,
            p_end_date, p_end_time, s.id, p_original_date);
  insert into public.event_details (event_id, household_id, title, location, notes, preparation)
    values (p_id, s.household_id, private.clean_text(p_title, 200), private.clean_text(p_location, 200),
            private.clean_text(p_notes, 2000), private.clean_text(p_preparation, 500));
  insert into public.event_participants (event_id, member_id, household_id)
    select p_id, m, s.household_id from (select distinct unnest(coalesce(p_participants, '{}')) m) x;
  update public.events set updated_at = now() where id = s.id;   -- nieuwe versie van de reeks
  return 1;
end $$;

create or replace function private.delete_event(p_id uuid, p_version integer)
returns void language plpgsql security definer set search_path = '' as $$
declare
  r record;
  ev public.events%rowtype;
begin
  r := private.lock_event(p_id);
  ev := r.ev;
  if p_version is null or ev.version <> p_version then
    raise exception 'Iemand anders heeft dit net aangepast' using errcode = 'PT409';
  end if;
  update public.events set deleted_at = now() where id = ev.id;
  if ev.recurrence_freq is not null then
    -- Alleen voorkomens die de verwijderaar zelf mag wijzigen: gedeelde, of de eigen privé-voorkomens.
    -- Andermans privé-voorkomens houden hun eigen zichtbaarheid en blijven staan.
    update public.events set deleted_at = now()
      where series_id = ev.id and deleted_at is null
        and (visibility = 'household' or private.is_my_event(owner_member_id, owner_user_id));
  end if;
end $$;
