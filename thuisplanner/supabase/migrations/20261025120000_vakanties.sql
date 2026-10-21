-- Thuisplanner · F8 Vakanties, stap V1.1: database, RLS en functies (docs/thuisplanner-vakanties.md §5, §6, §7 en §12).
--
-- Productbeslissingen van 21 oktober 2026:
--  1. Een vakantie (trips) heeft een naam, en optioneel een vertrekdatum, een einddatum (alleen met vertrekdatum),
--     een bestemming en notities. Alleen gedeeld: ieder actief lid leest en wijzigt (zoals taken en boodschappen).
--  2. Een paklijst per lid plus Gezamenlijk (member_id leeg); één vinkje per item, geen aantallen of categorieën;
--     dezelfde tekst staat hoogstens één keer bij dezelfde persoon.
--  3. Voorbereidingen zijn gewone taken: tasks.trip_id (hoogstens één vakantie per taak).
--  4. Boodschappen via een koppeltabel (trip_shopping_links): een boodschap is één rij per naam die steeds terugkomt
--     (add_shopping_items, uitkomst "terug"), dus een kolom zou koppelingen overschrijven of laten doorlekken. Komt een
--     afgevinkte boodschap terug, dan sluit de server haar actuele koppelingen af (settled_at).
--  5. Afspraken koppelen volgt pas in V2, in event_details (privacy, gate 9). Daarom hier niets aan events.
--
-- Schrijven:
--  - Vakanties, pakitems en koppelingen via de API (kolomrechten + RLS + guard_content), zoals taken. Verwijderen =
--    markeren (deleted_at); er is geen delete-recht.
--  - Bulkhandelingen via functies: overnemen (copy_packing_items) en vinkjes in één keer (set_packed). Beide volgen het
--    vergrendelingsprotocol: eerst het huishouden gedeeld vergrendelen, dan het lidmaatschap controleren.
--  - Seintjes via ping_content: alleen {t, id, v, op}.

-- ---------------------------------------------------------------------------------------------
-- Tabellen
-- ---------------------------------------------------------------------------------------------
create table public.trips (
  id uuid primary key default gen_random_uuid(),     -- de app maakt de UUID
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 100),
  start_date date,                                    -- leeg = nog geen datum
  end_date date,                                      -- alleen met een vertrekdatum
  destination text check (destination is null or char_length(destination) <= 100),
  notes text check (notes is null or char_length(notes) <= 4000),
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint trips_household_id_key unique (household_id, id),
  constraint trips_dates_check check (end_date is null or (start_date is not null and end_date >= start_date))
);
create index trips_household_idx on public.trips (household_id, start_date);

create table public.trip_packing_items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  trip_id uuid not null,
  member_id uuid,                                     -- leeg = Gezamenlijk
  name text not null check (char_length(btrim(name)) between 1 and 100),
  -- Zelfde sleutel als boodschappen: zonder hoofdletters en overbodige spaties.
  name_key text generated always as (lower(btrim(regexp_replace(name, '\s+', ' ', 'g')))) stored,
  packed_at timestamptz,
  packed_by_member_id uuid,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint trip_packing_items_household_id_key unique (household_id, id),
  constraint trip_packing_items_trip_fkey foreign key (household_id, trip_id)
    references public.trips (household_id, id) on delete cascade,
  -- Leden worden niet hard verwijderd (alleen gearchiveerd); hard alleen met het hele huishouden.
  constraint trip_packing_items_member_fkey foreign key (household_id, member_id)
    references public.household_members (household_id, id) on delete cascade,
  constraint trip_packing_items_packed_by_fkey foreign key (household_id, packed_by_member_id)
    references public.household_members (household_id, id) on delete set null (packed_by_member_id),
  constraint trip_packing_items_packed_check check (packed_by_member_id is null or packed_at is not null)
);
create index trip_packing_items_household_idx on public.trip_packing_items (household_id, trip_id);
-- Dezelfde tekst hoogstens één keer per persoon (of Gezamenlijk) per vakantie, ook bij gelijktijdig invoeren.
create unique index trip_packing_items_name_key on public.trip_packing_items
  (household_id, trip_id, coalesce(member_id, '00000000-0000-0000-0000-000000000000'::uuid), name_key)
  where deleted_at is null;

create table public.trip_shopping_links (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  trip_id uuid not null,
  shopping_item_id uuid not null,
  settled_at timestamptz,                             -- afgehandeld: alleen de server zet dit (zie add_shopping_items)
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint trip_shopping_links_household_id_key unique (household_id, id),
  constraint trip_shopping_links_trip_fkey foreign key (household_id, trip_id)
    references public.trips (household_id, id) on delete cascade,
  constraint trip_shopping_links_item_fkey foreign key (household_id, shopping_item_id)
    references public.shopping_items (household_id, id) on delete cascade
);
create index trip_shopping_links_household_idx on public.trip_shopping_links (household_id, shopping_item_id);
-- Hoogstens één actuele koppeling per vakantie en boodschap.
create unique index trip_shopping_links_actueel_key on public.trip_shopping_links (household_id, trip_id, shopping_item_id)
  where deleted_at is null and settled_at is null;

alter table public.tasks add column trip_id uuid;
alter table public.tasks add constraint tasks_trip_fkey foreign key (household_id, trip_id)
  references public.trips (household_id, id) on delete set null (trip_id);
create index tasks_trip_idx on public.tasks (household_id, trip_id) where trip_id is not null;

-- ---------------------------------------------------------------------------------------------
-- Hulpfuncties en triggers
-- ---------------------------------------------------------------------------------------------
-- De ID van een overgenomen pakitem, afgeleid uit de opdracht en het bron-item: een herhaalde opdracht (verloren
-- antwoord) maakt niets dubbel en geeft dezelfde items terug, zodat ongedaan maken ook dan werkt.
create function private.afgeleide_id(p_command uuid, p_bron uuid)
returns uuid language sql immutable set search_path = '' as $$
  select md5(p_command::text || ':' || p_bron::text)::uuid
$$;

-- Pakitems: de vakantie ligt vast; een persoon moet een actief lid van dit huishouden zijn. Security definer omdat de
-- ledencontrole (check_participants) niet via de API aan te roepen is.
create function private.guard_trip_packing_item()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and new.trip_id <> old.trip_id then
    raise exception 'Vaste kolommen kunnen niet veranderen' using errcode = '42501';
  end if;
  if new.member_id is not null and (tg_op = 'INSERT' or new.member_id is distinct from old.member_id) then
    perform private.check_participants(new.household_id, array[new.member_id]);
  end if;
  return new;
end $$;

-- Koppelingen: vakantie en boodschap liggen vast, en settled_at gaat alleen van leeg naar gevuld.
create function private.guard_trip_shopping_link()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.trip_id <> old.trip_id or new.shopping_item_id <> old.shopping_item_id
     or (old.settled_at is not null and new.settled_at is distinct from old.settled_at) then
    raise exception 'Vaste kolommen kunnen niet veranderen' using errcode = '42501';
  end if;
  return new;
end $$;

revoke all on function private.afgeleide_id(uuid, uuid), private.guard_trip_packing_item(),
  private.guard_trip_shopping_link() from public, anon, authenticated;

-- guard_content: vaste kolommen, versie, tijden en (via de API) vergrendelen + lidmaatschap opnieuw controleren.
create trigger trips_guard before insert or update on public.trips
  for each row execute function private.guard_content();
create trigger trip_packing_items_guard before insert or update on public.trip_packing_items
  for each row execute function private.guard_content();
create trigger trip_packing_items_refs before insert or update on public.trip_packing_items
  for each row execute function private.guard_trip_packing_item();
create trigger trip_shopping_links_guard before insert or update on public.trip_shopping_links
  for each row execute function private.guard_content();
create trigger trip_shopping_links_refs before update on public.trip_shopping_links
  for each row execute function private.guard_trip_shopping_link();

-- Seintjes zonder inhoud: {t, id, v, op}.
create trigger trips_ping after insert or update or delete on public.trips
  for each row execute function private.ping_content();
create trigger trip_packing_items_ping after insert or update or delete on public.trip_packing_items
  for each row execute function private.ping_content();
create trigger trip_shopping_links_ping after insert or update or delete on public.trip_shopping_links
  for each row execute function private.ping_content();

-- ---------------------------------------------------------------------------------------------
-- Row Level Security en rechten
-- ---------------------------------------------------------------------------------------------
alter table public.trips enable row level security;
alter table public.trip_packing_items enable row level security;
alter table public.trip_shopping_links enable row level security;

revoke all on table public.trips, public.trip_packing_items, public.trip_shopping_links from public, anon, authenticated;

grant select, insert (id, household_id, name, start_date, end_date, destination, notes),
  update (name, start_date, end_date, destination, notes, deleted_at)
  on public.trips to authenticated;
grant select, insert (id, household_id, trip_id, member_id, name),
  update (name, member_id, packed_at, packed_by_member_id, deleted_at)
  on public.trip_packing_items to authenticated;
-- settled_at is niet schrijfbaar: alleen add_shopping_items sluit een koppeling af.
grant select, insert (id, household_id, trip_id, shopping_item_id), update (deleted_at)
  on public.trip_shopping_links to authenticated;
grant insert (trip_id), update (trip_id) on public.tasks to authenticated;

create policy trips_select on public.trips for select to authenticated
  using (household_id in (select private.my_household_ids()));
create policy trips_insert on public.trips for insert to authenticated
  with check (household_id in (select private.my_household_ids()));
create policy trips_update on public.trips for update to authenticated
  using (household_id in (select private.my_household_ids()))
  with check (household_id in (select private.my_household_ids()));
create policy trip_packing_items_select on public.trip_packing_items for select to authenticated
  using (household_id in (select private.my_household_ids()));
create policy trip_packing_items_insert on public.trip_packing_items for insert to authenticated
  with check (household_id in (select private.my_household_ids()));
create policy trip_packing_items_update on public.trip_packing_items for update to authenticated
  using (household_id in (select private.my_household_ids()))
  with check (household_id in (select private.my_household_ids()));
create policy trip_shopping_links_select on public.trip_shopping_links for select to authenticated
  using (household_id in (select private.my_household_ids()));
create policy trip_shopping_links_insert on public.trip_shopping_links for insert to authenticated
  with check (household_id in (select private.my_household_ids()));
create policy trip_shopping_links_update on public.trip_shopping_links for update to authenticated
  using (household_id in (select private.my_household_ids()))
  with check (household_id in (select private.my_household_ids()));

-- ---------------------------------------------------------------------------------------------
-- Boodschappen toevoegen, met een optionele vakantie
-- ---------------------------------------------------------------------------------------------
-- Zoals 20261017120000_kg5d_herstel3.sql (opdrachtregister, productregels), plus:
--  - bij de uitkomst "terug" (een afgevinkte boodschap komt terug) worden haar actuele koppelingen afgesloten;
--  - met p_trip krijgt de boodschap bij elke uitkomst behalve "al_verwerkt" een actuele koppeling met die vakantie.
-- Alles in één transactie: een herhaalde opdracht (zelfde ID) heeft ook voor koppelingen geen tweede bijwerking.
drop function public.add_shopping_items(uuid, uuid[], text[]);
drop function private.add_shopping_items(uuid, uuid[], text[]);

create function private.add_shopping_items(p_household uuid, p_ids uuid[], p_names text[], p_trip uuid default null)
returns table (id uuid, name text, outcome text)
language plpgsql security definer set search_path = '' as $$
declare
  i integer;
  naam text;
  k text;
  gezien text[] := '{}';
  it public.shopping_items%rowtype;
  cmd private.shopping_commands%rowtype;
  vastgelegd boolean;
begin
  perform private.require_uid();
  perform private.lock_household_shared(p_household);
  if not private.is_active_member(p_household) then
    raise exception 'Je bent geen lid van dit huishouden' using errcode = '42501';
  end if;
  if p_ids is null or p_names is null or cardinality(p_ids) <> cardinality(p_names) or cardinality(p_names) > 100 then
    raise exception 'Geef per boodschap een id en een naam (hoogstens 100)' using errcode = '22023';
  end if;
  if p_trip is not null and not exists (
      select 1 from public.trips t where t.id = p_trip and t.household_id = p_household and t.deleted_at is null) then
    raise exception 'Vakantie niet gevonden' using errcode = 'P0002';
  end if;
  for i in 1 .. cardinality(p_names) loop
    naam := btrim(regexp_replace(coalesce(p_names[i], ''), '\s+', ' ', 'g'));
    k := lower(naam);
    if p_ids[i] is null then raise exception 'Geef per boodschap een id' using errcode = '22023'; end if;
    if naam = '' or k = any (gezien) then continue; end if;
    gezien := gezien || k;
    if char_length(naam) > 100 then raise exception 'Boodschap te lang (hoogstens 100 tekens)' using errcode = '22023'; end if;

    -- 1. Opdracht-ID vastleggen vóór enige bijwerking. Bestaat ze al: geen bijwerking, oorspronkelijke uitkomst.
    insert into private.shopping_commands as c (id, household_id, item_id, outcome)
      values (p_ids[i], p_household, p_ids[i], 'nieuw')
      on conflict on constraint shopping_commands_pkey do nothing;
    get diagnostics vastgelegd = row_count;
    if not vastgelegd then
      select * into cmd from private.shopping_commands c where c.id = p_ids[i];
      if cmd.household_id <> p_household then
        raise exception 'Deze opdracht-ID is al gebruikt' using errcode = '23505';
      end if;
      select s.name into name from public.shopping_items s where s.id = cmd.item_id;
      id := cmd.item_id; name := coalesce(name, naam); outcome := cmd.outcome; return next;
      continue;
    end if;
    -- Een boodschap met deze ID van vóór het register (eerdere versie): al verwerkt, geen bijwerking.
    if exists (select 1 from public.shopping_items s where s.id = p_ids[i] and s.household_id = p_household) then
      update private.shopping_commands c set outcome = 'al_verwerkt' where c.id = p_ids[i];
      id := p_ids[i]; name := naam; outcome := 'al_verwerkt'; return next;
      continue;
    end if;

    -- 2. Nieuwe opdracht: de productregels.
    outcome := null;
    for attempt in 1 .. 2 loop
      select * into it from public.shopping_items s
        where s.household_id = p_household and s.name_key = k and s.deleted_at is null for update;
      if found then
        if it.checked_at is not null then
          update public.shopping_items s set checked_at = null where s.id = it.id;
          -- Hergebruik: wat er eerder voor een vakantie was gekocht, is afgehandeld en niet opnieuw actueel.
          update public.trip_shopping_links l set settled_at = now()
            where l.household_id = p_household and l.shopping_item_id = it.id
              and l.deleted_at is null and l.settled_at is null;
          outcome := 'terug';
        else
          outcome := 'al_op_lijst';
        end if;
        update private.shopping_commands c set item_id = it.id, outcome = add_shopping_items.outcome where c.id = p_ids[i];
        id := it.id; name := it.name;
        exit;
      end if;
      begin
        insert into public.shopping_items (id, household_id, name) values (p_ids[i], p_household, naam);
        id := p_ids[i]; name := naam; outcome := 'nieuw';
        exit;
      exception when unique_violation then
        -- Iemand voegde dezelfde boodschap tegelijk toe: opnieuw kijken (tweede ronde vindt hem).
        if attempt = 2 then raise; end if;
      end;
    end loop;
    if p_trip is not null then
      insert into public.trip_shopping_links (household_id, trip_id, shopping_item_id)
        values (p_household, p_trip, add_shopping_items.id)
        on conflict do nothing;
    end if;
    return next;
  end loop;
end $$;

create function public.add_shopping_items(p_household uuid, p_ids uuid[], p_names text[], p_trip uuid default null)
returns table (id uuid, name text, outcome text) language plpgsql security invoker set search_path = '' as $$
begin
  return query select * from private.add_shopping_items(p_household, p_ids, p_names, p_trip);
exception when others then
  raise exception using errcode = sqlstate, message = sqlerrm;   -- zonder DETAIL/HINT
end $$;

-- ---------------------------------------------------------------------------------------------
-- Paklijst overnemen van een eerdere vakantie
-- ---------------------------------------------------------------------------------------------
-- Aanvullend: bestaande items (zelfde persoon + tekst) blijven staan en worden overgeslagen; overgenomen items zijn
-- niet afgevinkt; items van een lid dat niet (meer) actief is, worden overgeslagen. Kies iedereen (standaard), één
-- persoon (p_member) of alleen Gezamenlijk (p_gezamenlijk). Geeft alle items van deze opdracht terug, ook bij een
-- herhaling met dezelfde opdracht-ID (afgeleide ID's); ongedaan maken gebruikt die ID's.
create function private.copy_packing_items(p_household uuid, p_command uuid, p_from_trip uuid, p_to_trip uuid,
  p_member uuid default null, p_gezamenlijk boolean default false)
returns table (id uuid, member_id uuid, name text)
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_uid();
  perform private.lock_household_shared(p_household);
  if not private.is_active_member(p_household) then
    raise exception 'Je bent geen lid van dit huishouden' using errcode = '42501';
  end if;
  if p_command is null or p_from_trip is null or p_to_trip is null or p_from_trip = p_to_trip
     or (p_member is not null and coalesce(p_gezamenlijk, false)) then
    raise exception 'Kies een opdracht, twee verschillende vakanties en hoogstens één persoon' using errcode = '22023';
  end if;
  if (select count(*) from public.trips t
      where t.household_id = p_household and t.id in (p_from_trip, p_to_trip) and t.deleted_at is null) <> 2 then
    raise exception 'Vakantie niet gevonden' using errcode = 'P0002';
  end if;
  if p_member is not null then
    perform private.check_participants(p_household, array[p_member]);
  end if;

  insert into public.trip_packing_items (id, household_id, trip_id, member_id, name)
    select private.afgeleide_id(p_command, s.id), p_household, p_to_trip, s.member_id, s.name
    from public.trip_packing_items s
    where s.household_id = p_household and s.trip_id = p_from_trip and s.deleted_at is null
      and (case when coalesce(p_gezamenlijk, false) then s.member_id is null
                when p_member is not null then s.member_id = p_member
                else true end)
      and (s.member_id is null or exists (
        select 1 from public.household_members m
        where m.household_id = p_household and m.id = s.member_id and m.status = 'active'))
    order by s.created_at, s.id
    on conflict do nothing;

  return query
    select p.id, p.member_id, p.name
    from public.trip_packing_items s
    join public.trip_packing_items p on p.id = private.afgeleide_id(p_command, s.id)
    where s.household_id = p_household and s.trip_id = p_from_trip
      and p.household_id = p_household and p.trip_id = p_to_trip and p.deleted_at is null
    order by p.created_at, p.id;
end $$;

create function public.copy_packing_items(p_household uuid, p_command uuid, p_from_trip uuid, p_to_trip uuid,
  p_member uuid default null, p_gezamenlijk boolean default false)
returns table (id uuid, member_id uuid, name text) language plpgsql security invoker set search_path = '' as $$
begin
  return query select * from private.copy_packing_items(p_household, p_command, p_from_trip, p_to_trip, p_member, p_gezamenlijk);
exception when others then
  raise exception using errcode = sqlstate, message = sqlerrm;   -- zonder DETAIL/HINT
end $$;

-- ---------------------------------------------------------------------------------------------
-- Vinkjes in één keer zetten of weghalen
-- ---------------------------------------------------------------------------------------------
-- Voor "afvinken opnieuw beginnen" en het ongedaan maken daarvan. p_items: [{id, version, packed, packed_at?,
-- packed_by?}]. Een item met een andere versie (intussen aangepast) wordt overgeslagen en teruggemeld. packed_at en
-- packed_by (alleen bij packed = true) herstellen de oorspronkelijke stand; standaard nu en de aanroeper.
create function private.set_packed(p_household uuid, p_trip uuid, p_items jsonb)
returns table (id uuid, version integer, outcome text)
language plpgsql security definer set search_path = '' as $$
declare
  ik uuid;
  r record;
  nieuw integer;
begin
  perform private.require_uid();
  perform private.lock_household_shared(p_household);
  if not private.is_active_member(p_household) then
    raise exception 'Je bent geen lid van dit huishouden' using errcode = '42501';
  end if;
  ik := private.my_member_id(p_household);
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 1000 then
    raise exception 'Geef een lijst van hoogstens 1000 items' using errcode = '22023';
  end if;
  if not exists (select 1 from public.trips t where t.id = p_trip and t.household_id = p_household and t.deleted_at is null) then
    raise exception 'Vakantie niet gevonden' using errcode = 'P0002';
  end if;
  for r in
    select (e->>'id')::uuid as item, (e->>'version')::integer as versie, (e->>'packed')::boolean as ingepakt,
           (e->>'packed_at')::timestamptz as moment, (e->>'packed_by')::uuid as door
    from jsonb_array_elements(p_items) e
  loop
    if r.item is null or r.versie is null or r.ingepakt is null then
      raise exception 'Elk item heeft een id, een versie en packed' using errcode = '22023';
    end if;
    if r.ingepakt and r.moment is not null and r.moment > now() then
      raise exception 'Een moment in de toekomst kan niet' using errcode = '22023';
    end if;
    if r.ingepakt and r.door is not null then
      perform private.check_participants(p_household, array[r.door]);
    end if;
    update public.trip_packing_items p
      set packed_at = case when r.ingepakt then coalesce(r.moment, now()) end,
          packed_by_member_id = case when r.ingepakt then coalesce(r.door, ik) end
      where p.id = r.item and p.household_id = p_household and p.trip_id = p_trip
        and p.version = r.versie and p.deleted_at is null
      returning p.version into nieuw;
    id := r.item;
    if found then version := nieuw; outcome := 'gezet'; else version := null; outcome := 'overgeslagen'; end if;
    return next;
  end loop;
end $$;

create function public.set_packed(p_household uuid, p_trip uuid, p_items jsonb)
returns table (id uuid, version integer, outcome text) language plpgsql security invoker set search_path = '' as $$
begin
  return query select * from private.set_packed(p_household, p_trip, p_items);
exception when others then
  raise exception using errcode = sqlstate, message = sqlerrm;   -- zonder DETAIL/HINT
end $$;

revoke all on function private.add_shopping_items(uuid, uuid[], text[], uuid),
  private.copy_packing_items(uuid, uuid, uuid, uuid, uuid, boolean), private.set_packed(uuid, uuid, jsonb),
  public.add_shopping_items(uuid, uuid[], text[], uuid),
  public.copy_packing_items(uuid, uuid, uuid, uuid, uuid, boolean), public.set_packed(uuid, uuid, jsonb)
  from public, anon;
grant execute on function private.add_shopping_items(uuid, uuid[], text[], uuid),
  private.copy_packing_items(uuid, uuid, uuid, uuid, uuid, boolean), private.set_packed(uuid, uuid, jsonb),
  public.add_shopping_items(uuid, uuid[], text[], uuid),
  public.copy_packing_items(uuid, uuid, uuid, uuid, uuid, boolean), public.set_packed(uuid, uuid, jsonb)
  to authenticated;
