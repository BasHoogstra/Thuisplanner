-- Thuisplanner (technische map: komtgoed) · KG-5C: inhoudsschema (bouwplan stap 2;
-- docs/komtgoed-bouwplan.md, docs/thuisplanner-inhoud.md).
--
-- Afspraken, taken en boodschappen in de database, met de productbeslissingen van 10 oktober 2026:
--  1. Gedeelde afspraken, taken en boodschappen mag ieder actief lid van het huishouden wijzigen.
--  2. Een privé-afspraak van een ander verschijnt alleen als "Bezet": wanneer, van wie en voor wie zijn
--     zichtbaar, titel, plek, notities en voorbereiding nooit. Daarom staan die in een aparte tabel
--     (event_details) met strengere RLS; rij-beveiliging kan geen losse kolommen verbergen.
--  3. Taken en boodschappen zijn alleen gedeeld.
--
-- Schrijven:
--  - Afspraken alleen via functies (save_event, edit_occurrence, delete_occurrence, delete_event):
--    afspraak, details en deelnemers in één transactie, met versiecontrole.
--  - Taken en boodschappen via de API (kolomrechten + RLS + guard-trigger); meerdere boodschappen in één
--    keer via add_shopping_items. Verwijderen = markeren (deleted_at); er is geen delete-recht.
--  - Vergrendelingsprotocol (zie 20261011120000_kg5b_herstel1.sql): inhoud vergrendelt het huishouden
--    gedeeld (FOR SHARE) en controleert daarna het lidmaatschap opnieuw. Zo loopt een inhoudswijziging
--    nooit langs een lopende intrekking van toegang heen, terwijl inhoudswijzigingen elkaar niet
--    blokkeren.
--
-- Realtime: geen van deze tabellen staat in een publicatie (KG-T27). Seintjes via private kanalen
-- volgen in stap 3.

-- ---------------------------------------------------------------------------------------------
-- Huishouden: tijdzone (afspraken staan als lokale datum en tijd)
-- ---------------------------------------------------------------------------------------------
alter table public.households add column timezone text not null default 'Europe/Amsterdam';
create function private.check_timezone()
returns trigger language plpgsql set search_path = '' as $$
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names z where z.name = new.timezone) then
    raise exception 'Onbekende tijdzone' using errcode = '22023';
  end if;
  return new;
end $$;
revoke all on function private.check_timezone() from public, anon, authenticated;
create trigger households_timezone before insert or update of timezone on public.households
  for each row execute function private.check_timezone();
grant select (timezone) on public.households to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Tabellen
-- ---------------------------------------------------------------------------------------------
-- Wanneer, van wie en hoe vaak. Leesbaar voor het hele huishouden (ook bij privé: "Bezet").
create table public.events (
  id uuid primary key default gen_random_uuid(),     -- de app maakt de UUID: een herhaalde opdracht slaat niets dubbel op
  household_id uuid not null references public.households(id) on delete cascade,
  owner_member_id uuid not null,
  visibility public.visibility not null default 'household' check (visibility in ('household', 'private')),
  start_date date not null,
  start_time time,                                    -- leeg = hele dag
  end_date date,                                      -- leeg = dezelfde dag
  end_time time,
  recurrence_freq text check (recurrence_freq in ('daily', 'weekly', 'monthly', 'yearly')),
  recurrence_until date,
  series_id uuid,                                     -- losgemaakt voorkomen: de reeks ...
  original_date date,                                 -- ... en de datum waarop het oorspronkelijk viel
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint events_household_id_key unique (household_id, id),
  constraint events_owner_fkey foreign key (household_id, owner_member_id)
    references public.household_members (household_id, id),
  constraint events_series_fkey foreign key (household_id, series_id)
    references public.events (household_id, id) on delete cascade,
  constraint events_end_time_check check (end_time is null or start_time is not null),
  constraint events_end_date_check check (end_date is null or end_date >= start_date),
  constraint events_order_check check (
    end_time is null or coalesce(end_date, start_date) > start_date or end_time >= start_time),
  constraint events_until_check check (
    recurrence_until is null or (recurrence_freq is not null and recurrence_until >= start_date)),
  constraint events_detached_check check ((series_id is null) = (original_date is null)),
  -- Een losgemaakt voorkomen heeft geen eigen herhaling en verwijst niet naar zichzelf.
  constraint events_detached_no_recurrence check (series_id is null or (recurrence_freq is null and series_id <> id))
);
create index events_household_date_idx on public.events (household_id, start_date);
create index events_series_idx on public.events (household_id, series_id) where series_id is not null;
-- Eén losgemaakt voorkomen per reeksdatum.
create unique index events_series_original_key on public.events (series_id, original_date) where series_id is not null;

-- Wat en waar: alleen voor wie de afspraak mag zien (gedeeld, of je eigen privé-afspraak).
create table public.event_details (
  event_id uuid primary key,
  household_id uuid not null,
  title text not null check (char_length(btrim(title)) between 1 and 200),
  location text check (location is null or char_length(location) <= 200),
  notes text check (notes is null or char_length(notes) <= 2000),
  preparation text check (preparation is null or char_length(preparation) <= 500),
  updated_at timestamptz not null default now(),
  constraint event_details_event_fkey foreign key (household_id, event_id)
    references public.events (household_id, id) on delete cascade
);

-- Voor wie. Geen deelnemers = het hele huishouden.
create table public.event_participants (
  event_id uuid not null,
  member_id uuid not null,
  household_id uuid not null,
  primary key (event_id, member_id),
  constraint event_participants_event_fkey foreign key (household_id, event_id)
    references public.events (household_id, id) on delete cascade,
  constraint event_participants_member_fkey foreign key (household_id, member_id)
    references public.household_members (household_id, id) on delete cascade
);
create index event_participants_member_idx on public.event_participants (household_id, member_id);

-- Verwijderde of losgemaakte voorkomens van een reeks. De sleutel voorkomt dubbele uitzonderingen.
create table public.event_exceptions (
  series_id uuid not null,
  occurrence_date date not null,
  household_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (series_id, occurrence_date),
  constraint event_exceptions_series_fkey foreign key (household_id, series_id)
    references public.events (household_id, id) on delete cascade
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 200),
  due_date date,                                      -- leeg = ooit
  assignee_member_id uuid,
  done_on date,
  done_by_member_id uuid,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint tasks_household_id_key unique (household_id, id),
  constraint tasks_assignee_fkey foreign key (household_id, assignee_member_id)
    references public.household_members (household_id, id) on delete set null (assignee_member_id),
  constraint tasks_done_by_fkey foreign key (household_id, done_by_member_id)
    references public.household_members (household_id, id) on delete set null (done_by_member_id),
  constraint tasks_done_check check (done_by_member_id is null or done_on is not null)
);
create index tasks_household_idx on public.tasks (household_id, due_date);

create table public.shopping_items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 100),
  -- Zelfde sleutel als het prototype: zonder hoofdletters en overbodige spaties.
  name_key text generated always as (lower(btrim(regexp_replace(name, '\s+', ' ', 'g')))) stored,
  checked_at timestamptz,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint shopping_items_household_id_key unique (household_id, id)
);
-- Geen dubbelingen op de lijst (zolang niet verwijderd).
create unique index shopping_items_name_key on public.shopping_items (household_id, name_key) where deleted_at is null;

-- ---------------------------------------------------------------------------------------------
-- Hulpfuncties
-- ---------------------------------------------------------------------------------------------
-- Gedeelde vergrendeling van het huishouden voor inhoudswijzigingen: wacht op lopende wijzigingen
-- van lidmaatschap of rollen (die vergrendelen exclusief), maar niet op andere inhoudswijzigingen.
create function private.lock_household_shared(p_household uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'Deze wijziging vraagt isolatieniveau read committed' using errcode = '25001';
  end if;
  perform 1 from public.households h where h.id = p_household for share;
end $$;

-- Valt een reeks (start, frequentie, einde) op deze dag? Zelfde regels als herhaling.ts in de app:
-- maandelijks op de 31e slaat maanden zonder 31e over; jaarlijks op 29 februari alleen in schrikkeljaren.
create function private.occurs_on(p_start date, p_freq text, p_until date, p_day date)
returns boolean language sql immutable set search_path = '' as $$
  select p_freq is not null and p_day >= p_start and (p_until is null or p_day <= p_until) and
    case p_freq
      when 'daily' then true
      when 'weekly' then (p_day - p_start) % 7 = 0
      when 'monthly' then extract(day from p_day) = extract(day from p_start)
      when 'yearly' then extract(month from p_day) = extract(month from p_start)
                     and extract(day from p_day) = extract(day from p_start)
      else false
    end;
$$;

-- Zou een (losgemaakt) voorkomen van reeks s op p_day dubbel staan? Ja als de reeks die dag nog
-- voorkomt (zonder uitzondering), of als er al een ander losgemaakt voorkomen van s op die dag staat.
create function private.occurrence_taken(p_series uuid, p_except_event uuid, p_day date)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
      select 1 from public.events s
      where s.id = p_series
        and private.occurs_on(s.start_date, s.recurrence_freq, s.recurrence_until, p_day)
        and not exists (select 1 from public.event_exceptions x where x.series_id = s.id and x.occurrence_date = p_day))
    or exists (
      select 1 from public.events o
      where o.series_id = p_series and o.start_date = p_day and o.deleted_at is null
        and o.id is distinct from p_except_event);
$$;

create function private.clean_text(p_text text, p_max integer)
returns text language sql immutable set search_path = '' as $$
  select case when p_text is null or btrim(p_text) = '' then null else btrim(p_text) end
$$;

-- Deelnemers moeten actieve leden van dit huishouden zijn.
create function private.check_participants(p_household uuid, p_members uuid[])
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if p_members is null then return; end if;
  if (select count(distinct m) from unnest(p_members) m) <> (
      select count(*) from public.household_members h
      where h.household_id = p_household and h.status = 'active' and h.id = any (p_members)) then
    raise exception 'Deelnemers moeten actieve leden van dit huishouden zijn' using errcode = '22023';
  end if;
end $$;

revoke all on function private.lock_household_shared(uuid), private.occurs_on(date, text, date, date),
  private.occurrence_taken(uuid, uuid, date), private.clean_text(text, integer),
  private.check_participants(uuid, uuid[]) from public, anon, authenticated;
-- De guard-trigger voor taken en boodschappen (security invoker) vergrendelt het huishouden.
grant execute on function private.lock_household_shared(uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Triggers: vaste kolommen, versie en (via de API) lidmaatschap opnieuw controleren
-- ---------------------------------------------------------------------------------------------
create function private.guard_event()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.id <> old.id or new.household_id <> old.household_id or new.owner_member_id <> old.owner_member_id
     or new.series_id is distinct from old.series_id or new.original_date is distinct from old.original_date
     or new.created_at <> old.created_at then
    raise exception 'Vaste kolommen van een afspraak kunnen niet veranderen' using errcode = '42501';
  end if;
  new.version := old.version + 1;
  new.updated_at := now();
  return new;
end $$;
create trigger events_guard before update on public.events for each row execute function private.guard_event();

create function private.guard_event_details()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.event_id <> old.event_id or new.household_id <> old.household_id then
    raise exception 'Vaste kolommen van een afspraak kunnen niet veranderen' using errcode = '42501';
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger event_details_guard before update on public.event_details for each row execute function private.guard_event_details();

-- Taken en boodschappen. Via de API: eerst het huishouden (gedeeld) vergrendelen, dan het
-- lidmaatschap opnieuw controleren op een verse momentopname (zie het protocol).
create function private.guard_content()
returns trigger language plpgsql set search_path = '' as $$
declare
  via_api boolean := current_user in ('anon', 'authenticated');
begin
  if via_api then
    perform private.lock_household_shared(new.household_id);
    if not private.is_active_member(new.household_id) then
      raise exception 'Je bent geen actief lid van dit huishouden' using errcode = '42501';
    end if;
  end if;
  if tg_op = 'INSERT' then
    new.version := 1;
    new.created_at := now();
    new.updated_at := now();
    new.deleted_at := null;
  else
    if new.id <> old.id or new.household_id <> old.household_id or new.created_at <> old.created_at then
      raise exception 'Vaste kolommen kunnen niet veranderen' using errcode = '42501';
    end if;
    new.version := old.version + 1;
    new.updated_at := now();
  end if;
  return new;
end $$;
revoke all on function private.guard_event(), private.guard_event_details(), private.guard_content()
  from public, anon, authenticated;
create trigger tasks_guard before insert or update on public.tasks for each row execute function private.guard_content();
create trigger shopping_items_guard before insert or update on public.shopping_items for each row execute function private.guard_content();

-- ---------------------------------------------------------------------------------------------
-- Row Level Security en rechten
-- ---------------------------------------------------------------------------------------------
alter table public.events enable row level security;
alter table public.event_details enable row level security;
alter table public.event_participants enable row level security;
alter table public.event_exceptions enable row level security;
alter table public.tasks enable row level security;
alter table public.shopping_items enable row level security;

revoke all on table public.events, public.event_details, public.event_participants, public.event_exceptions,
  public.tasks, public.shopping_items from public, anon, authenticated;

-- Afspraken: lezen; schrijven alleen via de functies.
grant select on public.events, public.event_details, public.event_participants, public.event_exceptions to authenticated;
create policy events_select on public.events for select to authenticated
  using (household_id in (select private.my_household_ids()));
create policy event_participants_select on public.event_participants for select to authenticated
  using (household_id in (select private.my_household_ids()));
create policy event_exceptions_select on public.event_exceptions for select to authenticated
  using (household_id in (select private.my_household_ids()));
-- Details: alleen bij een gedeelde afspraak, of als jij de eigenaar bent. Gate 9.
create policy event_details_select on public.event_details for select to authenticated
  using (
    household_id in (select private.my_household_ids())
    and exists (
      select 1 from public.events e
      where e.id = event_details.event_id and e.household_id = event_details.household_id
        and (e.visibility = 'household'
             or e.owner_member_id in (select mm.member_id from private.my_memberships() mm))
    )
  );

-- Taken en boodschappen: ieder actief lid leest, maakt en wijzigt; verwijderen = deleted_at zetten.
grant select, insert (id, household_id, title, due_date, assignee_member_id, done_on, done_by_member_id),
  update (title, due_date, assignee_member_id, done_on, done_by_member_id, deleted_at)
  on public.tasks to authenticated;
grant select, insert (id, household_id, name, checked_at), update (name, checked_at, deleted_at)
  on public.shopping_items to authenticated;
create policy tasks_select on public.tasks for select to authenticated
  using (household_id in (select private.my_household_ids()));
create policy tasks_insert on public.tasks for insert to authenticated
  with check (household_id in (select private.my_household_ids()));
create policy tasks_update on public.tasks for update to authenticated
  using (household_id in (select private.my_household_ids()))
  with check (household_id in (select private.my_household_ids()));
create policy shopping_items_select on public.shopping_items for select to authenticated
  using (household_id in (select private.my_household_ids()));
create policy shopping_items_insert on public.shopping_items for insert to authenticated
  with check (household_id in (select private.my_household_ids()));
create policy shopping_items_update on public.shopping_items for update to authenticated
  using (household_id in (select private.my_household_ids()))
  with check (household_id in (select private.my_household_ids()));

-- De weergave voor de app: afspraak + (als toegestaan) details + deelnemers. security_invoker: de RLS
-- van de lezer geldt. Bij andermans privé-afspraak zijn titel, plek, notities en voorbereiding leeg en
-- is is_busy waar ("Bezet").
create view public.event_overview with (security_invoker = true) as
  select e.id, e.household_id, e.owner_member_id, e.visibility,
         e.start_date, e.start_time, e.end_date, e.end_time,
         e.recurrence_freq, e.recurrence_until, e.series_id, e.original_date,
         e.version, e.created_at, e.updated_at, e.deleted_at,
         (d.event_id is null) as is_busy,
         d.title, d.location, d.notes, d.preparation,
         coalesce((select array_agg(p.member_id order by p.member_id) from public.event_participants p
                   where p.event_id = e.id), '{}'::uuid[]) as participant_ids
  from public.events e
  left join public.event_details d on d.event_id = e.id;
revoke all on public.event_overview from public, anon, authenticated;
grant select on public.event_overview to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Functies: afspraken
-- ---------------------------------------------------------------------------------------------
-- Afspraak maken (p_version leeg) of bijwerken (p_version = de versie die de app kent). Geeft de nieuwe
-- versie terug. Privé of gedeeld kiest alleen de eigenaar; andermans privé-afspraak bestaat voor de
-- rest van het huishouden alleen als "Bezet" en is niet te wijzigen.
create function private.save_event(
  p_household uuid, p_id uuid, p_version integer,
  p_start_date date, p_start_time time, p_end_date date, p_end_time time,
  p_visibility text, p_title text, p_location text, p_notes text, p_preparation text,
  p_participants uuid[], p_recurrence_freq text, p_recurrence_until date)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  me uuid;
  ev public.events%rowtype;
  nieuw integer;
begin
  perform private.require_uid();
  perform private.lock_household_shared(p_household);
  me := private.my_member_id(p_household);
  if me is null then raise exception 'Je bent geen lid van dit huishouden' using errcode = '42501'; end if;
  if p_id is null then raise exception 'Afspraak zonder id' using errcode = '22023'; end if;
  if p_visibility is null or p_visibility not in ('household', 'private') then
    raise exception 'Zichtbaarheid moet household of private zijn' using errcode = '22023';
  end if;
  if private.clean_text(p_title, 200) is null then raise exception 'Geef de afspraak een titel' using errcode = '22023'; end if;
  perform private.check_participants(p_household, p_participants);

  select * into ev from public.events where id = p_id for update;
  if not found then
    if p_version is not null then raise exception 'Afspraak niet gevonden' using errcode = 'P0002'; end if;
    insert into public.events (id, household_id, owner_member_id, visibility, start_date, start_time, end_date,
                               end_time, recurrence_freq, recurrence_until)
      values (p_id, p_household, me, p_visibility::public.visibility, p_start_date, p_start_time, p_end_date,
              p_end_time, p_recurrence_freq, p_recurrence_until);
    insert into public.event_details (event_id, household_id, title, location, notes, preparation)
      values (p_id, p_household, private.clean_text(p_title, 200), private.clean_text(p_location, 200),
              private.clean_text(p_notes, 2000), private.clean_text(p_preparation, 500));
    insert into public.event_participants (event_id, member_id, household_id)
      select p_id, m, p_household from (select distinct unnest(coalesce(p_participants, '{}')) m) x;
    return 1;
  end if;

  -- Bestaat in een ander huishouden, is verwijderd, of is andermans privé-afspraak: "niet gevonden".
  if ev.household_id <> p_household or ev.deleted_at is not null
     or (ev.visibility = 'private' and ev.owner_member_id <> me) then
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
    recurrence_freq = p_recurrence_freq, recurrence_until = p_recurrence_until
    where id = ev.id returning version into nieuw;
  update public.event_details set title = private.clean_text(p_title, 200), location = private.clean_text(p_location, 200),
    notes = private.clean_text(p_notes, 2000), preparation = private.clean_text(p_preparation, 500)
    where event_id = ev.id;
  delete from public.event_participants where event_id = ev.id;
  insert into public.event_participants (event_id, member_id, household_id)
    select ev.id, m, p_household from (select distinct unnest(coalesce(p_participants, '{}')) m) x;
  return nieuw;
end $$;

-- Reeks of afspraak ophalen voor een wijziging: vergrendelen volgens het protocol en controleren.
-- Andermans privé-afspraak bestaat voor dit doel niet.
create function private.lock_event(p_id uuid, out ev public.events, out me uuid)
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
     or (ev.visibility = 'private' and ev.owner_member_id <> me) then
    raise exception 'Afspraak niet gevonden' using errcode = 'P0002';
  end if;
end $$;

-- "Alleen deze wijzigen": in één transactie een uitzondering op de reeks en een losgemaakte afspraak
-- (zelfde eigenaar en zichtbaarheid als de reeks). Niet naar een dag waarop de reeks al staat.
create function private.edit_occurrence(
  p_series uuid, p_original_date date, p_id uuid,
  p_start_date date, p_start_time time, p_end_date date, p_end_time time,
  p_title text, p_location text, p_notes text, p_preparation text, p_participants uuid[])
returns integer language plpgsql security definer set search_path = '' as $$
declare
  r record;
  s public.events%rowtype;
begin
  r := private.lock_event(p_series);
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
  insert into public.events (id, household_id, owner_member_id, visibility, start_date, start_time, end_date, end_time,
                             series_id, original_date)
    values (p_id, s.household_id, s.owner_member_id, s.visibility, p_start_date, p_start_time, p_end_date, p_end_time,
            s.id, p_original_date);
  insert into public.event_details (event_id, household_id, title, location, notes, preparation)
    values (p_id, s.household_id, private.clean_text(p_title, 200), private.clean_text(p_location, 200),
            private.clean_text(p_notes, 2000), private.clean_text(p_preparation, 500));
  insert into public.event_participants (event_id, member_id, household_id)
    select p_id, m, s.household_id from (select distinct unnest(coalesce(p_participants, '{}')) m) x;
  update public.events set updated_at = now() where id = s.id;   -- nieuwe versie van de reeks
  return 1;
end $$;

-- "Alleen deze verwijderen": een uitzondering op de reeks.
create function private.delete_occurrence(p_series uuid, p_date date)
returns void language plpgsql security definer set search_path = '' as $$
declare
  r record;
  s public.events%rowtype;
begin
  r := private.lock_event(p_series);
  s := r.ev;
  if s.recurrence_freq is null then raise exception 'Dit is geen herhalende afspraak' using errcode = '22023'; end if;
  if not private.occurs_on(s.start_date, s.recurrence_freq, s.recurrence_until, p_date) then
    raise exception 'Deze datum hoort niet bij de reeks' using errcode = '22023';
  end if;
  if exists (select 1 from public.event_exceptions x where x.series_id = s.id and x.occurrence_date = p_date) then
    raise exception 'Dit voorkomen is al aangepast of verwijderd' using errcode = '23505';
  end if;
  insert into public.event_exceptions (series_id, occurrence_date, household_id) values (s.id, p_date, s.household_id);
  update public.events set updated_at = now() where id = s.id;
end $$;

-- Verwijderen = markeren. Bij een reeks: de hele reeks, inclusief losgemaakte voorkomens.
create function private.delete_event(p_id uuid, p_version integer)
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
    update public.events set deleted_at = now() where series_id = ev.id and deleted_at is null;
  end if;
end $$;

-- ---------------------------------------------------------------------------------------------
-- Functies: boodschappen
-- ---------------------------------------------------------------------------------------------
-- Meerdere boodschappen in één keer, zonder dubbelingen (zelfde regels als het prototype): staat iets
-- al open, dan niets; was het afgevinkt, dan weer nodig; dubbelingen in de invoer tellen één keer.
-- De app geeft per naam een UUID mee, zodat een herhaalde opdracht niets dubbel opslaat.
create function private.add_shopping_items(p_household uuid, p_ids uuid[], p_names text[])
returns table (id uuid, name text, outcome text)
language plpgsql security definer set search_path = '' as $$
declare
  i integer;
  naam text;
  k text;
  gezien text[] := '{}';
  it public.shopping_items%rowtype;
begin
  perform private.require_uid();
  perform private.lock_household_shared(p_household);
  if not private.is_active_member(p_household) then
    raise exception 'Je bent geen lid van dit huishouden' using errcode = '42501';
  end if;
  if p_ids is null or p_names is null or cardinality(p_ids) <> cardinality(p_names) or cardinality(p_names) > 100 then
    raise exception 'Geef per boodschap een id en een naam (hoogstens 100)' using errcode = '22023';
  end if;
  for i in 1 .. cardinality(p_names) loop
    naam := btrim(regexp_replace(coalesce(p_names[i], ''), '\s+', ' ', 'g'));
    k := lower(naam);
    if naam = '' or k = any (gezien) then continue; end if;
    gezien := gezien || k;
    if char_length(naam) > 100 then raise exception 'Boodschap te lang (hoogstens 100 tekens)' using errcode = '22023'; end if;
    for attempt in 1 .. 2 loop
      select * into it from public.shopping_items s
        where s.household_id = p_household and s.name_key = k and s.deleted_at is null for update;
      if found then
        if it.checked_at is not null then
          update public.shopping_items s set checked_at = null where s.id = it.id;
          id := it.id; name := it.name; outcome := 'terug'; return next;
        else
          id := it.id; name := it.name; outcome := 'al_op_lijst'; return next;
        end if;
        exit;
      end if;
      if exists (select 1 from public.shopping_items s where s.id = p_ids[i]) then
        -- Herhaalde opdracht voor een boodschap die intussen weer van de lijst is.
        id := p_ids[i]; name := naam; outcome := 'al_verwerkt'; return next;
        exit;
      end if;
      begin
        insert into public.shopping_items (id, household_id, name) values (p_ids[i], p_household, naam);
        id := p_ids[i]; name := naam; outcome := 'nieuw'; return next;
        exit;
      exception when unique_violation then
        -- Iemand voegde dezelfde boodschap tegelijk toe: opnieuw kijken (tweede ronde vindt hem).
        if attempt = 2 then raise; end if;
      end;
    end loop;
  end loop;
end $$;

revoke all on function private.save_event(uuid, uuid, integer, date, time, date, time, text, text, text, text, text, uuid[], text, date),
  private.lock_event(uuid), private.edit_occurrence(uuid, date, uuid, date, time, date, time, text, text, text, text, uuid[]),
  private.delete_occurrence(uuid, date), private.delete_event(uuid, integer),
  private.add_shopping_items(uuid, uuid[], text[]) from public, anon;
grant execute on function private.save_event(uuid, uuid, integer, date, time, date, time, text, text, text, text, text, uuid[], text, date),
  private.lock_event(uuid), private.edit_occurrence(uuid, date, uuid, date, time, date, time, text, text, text, text, uuid[]),
  private.delete_occurrence(uuid, date), private.delete_event(uuid, integer),
  private.add_shopping_items(uuid, uuid[], text[]) to authenticated;

-- Publieke functies (security invoker).
create function public.save_event(
  p_household uuid, p_id uuid, p_version integer,
  p_start_date date, p_start_time time, p_end_date date, p_end_time time,
  p_visibility text, p_title text, p_location text, p_notes text, p_preparation text,
  p_participants uuid[], p_recurrence_freq text, p_recurrence_until date)
returns integer language sql security invoker set search_path = '' as $$
  select private.save_event(p_household, p_id, p_version, p_start_date, p_start_time, p_end_date, p_end_time,
    p_visibility, p_title, p_location, p_notes, p_preparation, p_participants, p_recurrence_freq, p_recurrence_until)
$$;
create function public.edit_occurrence(
  p_series uuid, p_original_date date, p_id uuid,
  p_start_date date, p_start_time time, p_end_date date, p_end_time time,
  p_title text, p_location text, p_notes text, p_preparation text, p_participants uuid[])
returns integer language sql security invoker set search_path = '' as $$
  select private.edit_occurrence(p_series, p_original_date, p_id, p_start_date, p_start_time, p_end_date, p_end_time,
    p_title, p_location, p_notes, p_preparation, p_participants)
$$;
create function public.delete_occurrence(p_series uuid, p_date date)
returns void language sql security invoker set search_path = '' as $$
  select private.delete_occurrence(p_series, p_date)
$$;
create function public.delete_event(p_id uuid, p_version integer)
returns void language sql security invoker set search_path = '' as $$
  select private.delete_event(p_id, p_version)
$$;
create function public.add_shopping_items(p_household uuid, p_ids uuid[], p_names text[])
returns table (id uuid, name text, outcome text) language sql security invoker set search_path = '' as $$
  select * from private.add_shopping_items(p_household, p_ids, p_names)
$$;
revoke all on function public.save_event(uuid, uuid, integer, date, time, date, time, text, text, text, text, text, uuid[], text, date),
  public.edit_occurrence(uuid, date, uuid, date, time, date, time, text, text, text, text, uuid[]),
  public.delete_occurrence(uuid, date), public.delete_event(uuid, integer),
  public.add_shopping_items(uuid, uuid[], text[]) from public, anon;
grant execute on function public.save_event(uuid, uuid, integer, date, time, date, time, text, text, text, text, text, uuid[], text, date),
  public.edit_occurrence(uuid, date, uuid, date, time, date, time, text, text, text, text, uuid[]),
  public.delete_occurrence(uuid, date), public.delete_event(uuid, integer),
  public.add_shopping_items(uuid, uuid[], text[]) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Account verwijderen (AVG): privé-afspraken van dat account verdwijnen echt
-- ---------------------------------------------------------------------------------------------
-- Gedeelde afspraken, taken en boodschappen blijven bij het huishouden (het lid blijft bestaan zonder
-- account). Privé-afspraken zijn van de persoon zelf: niemand anders kan ze lezen, dus ze gaan weg.
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
  -- Privé-afspraken van dit account (alle huishoudens) verdwijnen, met details en voorkomens.
  delete from public.events e
    where e.visibility = 'private'
      and e.owner_member_id in (select h.id from public.household_members h where h.user_id = old.id);
  -- Overige koppelingen (ook gearchiveerde leden) losmaken. Het lid blijft in het huishouden bestaan,
  -- zonder account en zonder beheerrol.
  update public.household_members set user_id = null, linked_at = null, role = 'member'
    where user_id = old.id;
  -- Uitnodigingen van dit account vervallen.
  update public.household_invites set revoked_at = now()
    where created_by = old.id and accepted_at is null and revoked_at is null;
  return old;
end $$;
