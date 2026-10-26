-- Thuisplanner · F8 Vakanties: extra inpaklijsten, stap 1 (database, RLS en tests; docs/thuisplanner-vakanties.md §20).
-- Akkoord 22 oktober 2026, alleen lokaal.
--
-- Naast de lijsten van de leden en Gezamenlijk kun je per vakantie zelf lijsten maken: "Oma", "Paard", "Kampeerspullen".
-- Een extra lijst is geen lid en geen account; ze hoort bij één vakantie.
--
--  - Nieuwe tabel trip_packing_lists: één rij per extra lijst (naam, versie, verwijderd-moment). Een lijst kan leeg zijn;
--    hernoemen raakt alleen de lijst. Dezelfde naam hoogstens één keer per vakantie; niet de naam van een actief lid en
--    niet "Gezamenlijk" (besluit 22 oktober 2026). Volgorde: zoals aangemaakt (created_at).
--  - trip_packing_items.list_id: een item hoort bij een lid (member_id), bij Gezamenlijk (beide leeg) of bij een extra
--    lijst (list_id), nooit bij twee. De verwijzing loopt via (household_id, trip_id, list_id): een item kan dus nooit in
--    een lijst van een andere vakantie of een ander huishouden komen. Dezelfde tekst hoogstens één keer per lijst.
--  - Verwijderen en herstellen van een lijst alleen via functies: lijst en items in één transactie, met hetzelfde
--    moment, zodat herstellen precies die items terugzet. Niets wordt hard gewist; herhalen is veilig.
--  - copy_packing_items: Gezamenlijk betekent nu "member_id én list_id leeg" (anders zouden items van extra lijsten als
--    Gezamenlijk worden overgenomen). Nieuw: p_lists, de extra lijsten die mee moeten; bestaat er in de nieuwe vakantie al
--    een lijst met die naam, dan wordt die aangevuld; anders komt er een lijst bij met een afgeleide ID (herhalen maakt
--    niets dubbel). Zonder p_lists (oude aanroep): geen extra lijsten.
--  - RLS zoals trips: ieder actief lid leest en schrijft; geen delete-recht; seintjes {t, id, v, op}.
--
-- LET OP voor een latere uitrol (verplicht, zie §20.6): een app zonder kennis van list_id toont items van een extra lijst
-- als Gezamenlijk (member_id is leeg). Migratie en een app die list_id kent, moeten samen uitgerold worden.

-- ---------------------------------------------------------------------------------------------
-- Tabel en kolom
-- ---------------------------------------------------------------------------------------------
create table public.trip_packing_lists (
  id uuid primary key default gen_random_uuid(),     -- de app maakt de UUID
  household_id uuid not null references public.households(id) on delete cascade,
  trip_id uuid not null,
  name text not null check (char_length(btrim(name)) between 1 and 40),
  name_key text generated always as (lower(btrim(regexp_replace(name, '\s+', ' ', 'g')))) stored,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint trip_packing_lists_household_id_key unique (household_id, id),
  constraint trip_packing_lists_trip_id_key unique (household_id, trip_id, id),
  constraint trip_packing_lists_trip_fkey foreign key (household_id, trip_id)
    references public.trips (household_id, id) on delete cascade
);
create index trip_packing_lists_household_idx on public.trip_packing_lists (household_id, trip_id, created_at);
-- Dezelfde naam hoogstens één keer per vakantie (zolang niet verwijderd), ook bij gelijktijdig aanmaken of hernoemen.
create unique index trip_packing_lists_name_key on public.trip_packing_lists (household_id, trip_id, name_key)
  where deleted_at is null;

alter table public.trip_packing_items add column list_id uuid;
alter table public.trip_packing_items
  add constraint trip_packing_items_list_fkey foreign key (household_id, trip_id, list_id)
    references public.trip_packing_lists (household_id, trip_id, id) on delete cascade,
  add constraint trip_packing_items_een_lijst_check check (member_id is null or list_id is null);
create index trip_packing_items_list_idx on public.trip_packing_items (household_id, list_id) where list_id is not null;
-- Dezelfde tekst hoogstens één keer per lijst: per lid, Gezamenlijk of extra lijst (twee kolommen, zodat een lid en een
-- lijst nooit dezelfde sleutel kunnen krijgen).
drop index public.trip_packing_items_name_key;
create unique index trip_packing_items_name_key on public.trip_packing_items
  (household_id, trip_id, coalesce(member_id, '00000000-0000-0000-0000-000000000000'::uuid),
   coalesce(list_id, '00000000-0000-0000-0000-000000000000'::uuid), name_key)
  where deleted_at is null;

-- ---------------------------------------------------------------------------------------------
-- Bewaking
-- ---------------------------------------------------------------------------------------------
-- Een extra lijst: de vakantie ligt vast en bestaat (niet verwijderd); de naam is niet die van een actief lid of
-- "Gezamenlijk". Security definer: de ledennamen zijn niet via de API te lezen voor deze controle.
create function private.guard_trip_packing_list()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  k text := lower(btrim(regexp_replace(new.name, '\s+', ' ', 'g')));
begin
  if tg_op = 'UPDATE' and new.trip_id <> old.trip_id then
    raise exception 'Vaste kolommen kunnen niet veranderen' using errcode = '42501';
  end if;
  if tg_op = 'INSERT' and not exists (
      select 1 from public.trips t where t.household_id = new.household_id and t.id = new.trip_id and t.deleted_at is null) then
    raise exception 'Vakantie niet gevonden' using errcode = 'P0002';
  end if;
  if tg_op = 'INSERT' or new.name is distinct from old.name then
    if k = 'gezamenlijk' or exists (
        select 1 from public.household_members m
        where m.household_id = new.household_id and m.status = 'active'
          and lower(btrim(regexp_replace(m.display_name, '\s+', ' ', 'g'))) = k) then
      raise exception 'Die naam hoort al bij iemand uit het huishouden of bij Gezamenlijk' using errcode = '23514';
    end if;
  end if;
  return new;
end $$;

-- Pakitems: zoals voorheen (vakantie vast, lid actief), plus: een extra lijst moet bestaan en niet verwijderd zijn bij
-- toevoegen, verplaatsen naar die lijst, of een item terugzetten. De lijst wordt gedeeld vergrendeld, zodat een
-- gelijktijdig verwijderen van de lijst eerst klaar is en dan opnieuw gecontroleerd wordt (geen item in een
-- verwijderde lijst).
create or replace function private.guard_trip_packing_item()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and new.trip_id <> old.trip_id then
    raise exception 'Vaste kolommen kunnen niet veranderen' using errcode = '42501';
  end if;
  if new.member_id is not null and (tg_op = 'INSERT' or new.member_id is distinct from old.member_id) then
    perform private.check_participants(new.household_id, array[new.member_id]);
  end if;
  if new.list_id is not null and new.deleted_at is null
     and (tg_op = 'INSERT' or new.list_id is distinct from old.list_id or old.deleted_at is not null) then
    perform 1 from public.trip_packing_lists l
      where l.household_id = new.household_id and l.trip_id = new.trip_id and l.id = new.list_id and l.deleted_at is null
      for share;
    if not found then
      raise exception 'Inpaklijst niet gevonden' using errcode = 'P0002';
    end if;
  end if;
  return new;
end $$;

revoke all on function private.guard_trip_packing_list(), private.guard_trip_packing_item() from public, anon, authenticated;

create trigger trip_packing_lists_guard before insert or update on public.trip_packing_lists
  for each row execute function private.guard_content();
create trigger trip_packing_lists_refs before insert or update on public.trip_packing_lists
  for each row execute function private.guard_trip_packing_list();
-- Seintjes zonder inhoud: {t, id, v, op}.
create trigger trip_packing_lists_ping after insert or update or delete on public.trip_packing_lists
  for each row execute function private.ping_content();

-- ---------------------------------------------------------------------------------------------
-- RLS en rechten (zoals trips)
-- ---------------------------------------------------------------------------------------------
alter table public.trip_packing_lists enable row level security;
revoke all on table public.trip_packing_lists from public, anon, authenticated;
-- deleted_at is niet schrijfbaar: verwijderen en herstellen gaan via de functies (lijst en items samen).
grant select, insert (id, household_id, trip_id, name), update (name) on public.trip_packing_lists to authenticated;
grant insert (list_id), update (list_id) on public.trip_packing_items to authenticated;

create policy trip_packing_lists_select on public.trip_packing_lists for select to authenticated
  using (household_id in (select private.my_household_ids()));
create policy trip_packing_lists_insert on public.trip_packing_lists for insert to authenticated
  with check (household_id in (select private.my_household_ids()));
create policy trip_packing_lists_update on public.trip_packing_lists for update to authenticated
  using (household_id in (select private.my_household_ids()))
  with check (household_id in (select private.my_household_ids()));

-- ---------------------------------------------------------------------------------------------
-- Verwijderen en herstellen van een extra lijst
-- ---------------------------------------------------------------------------------------------
-- Verwijderen: de lijst en haar items krijgen hetzelfde deleted_at. p_version: de versie die de app kent (anders
-- PT409). Al verwijderd: geen bijwerking, uitkomst "al_verwijderd" (herhalen is veilig).
create function private.delete_packing_list(p_household uuid, p_list uuid, p_version integer)
returns table (version integer, items integer, outcome text)
language plpgsql security definer set search_path = '' as $$
declare
  l public.trip_packing_lists%rowtype;
  moment timestamptz := now();
  n integer;
begin
  perform private.require_uid();
  perform private.lock_household_shared(p_household);
  if not private.is_active_member(p_household) then
    raise exception 'Je bent geen lid van dit huishouden' using errcode = '42501';
  end if;
  select * into l from public.trip_packing_lists x where x.household_id = p_household and x.id = p_list for update;
  if not found then raise exception 'Inpaklijst niet gevonden' using errcode = 'P0002'; end if;
  if l.deleted_at is not null then
    version := l.version; items := 0; outcome := 'al_verwijderd'; return next; return;
  end if;
  if p_version is null or l.version <> p_version then
    raise exception 'Iemand anders heeft dit net aangepast' using errcode = 'PT409';
  end if;
  update public.trip_packing_items p set deleted_at = moment
    where p.household_id = p_household and p.list_id = p_list and p.deleted_at is null;
  get diagnostics n = row_count;
  update public.trip_packing_lists x set deleted_at = moment where x.id = p_list returning x.version into version;
  items := n; outcome := 'verwijderd'; return next;
end $$;

-- Herstellen: precies de items die met de lijst zijn verwijderd (zelfde moment). p_version: de versie na het
-- verwijderen. Is er intussen een andere lijst met dezelfde naam, dan 23505 en geen bijwerking. Niet verwijderd:
-- uitkomst "al_hersteld".
create function private.restore_packing_list(p_household uuid, p_list uuid, p_version integer)
returns table (version integer, items integer, outcome text)
language plpgsql security definer set search_path = '' as $$
declare
  l public.trip_packing_lists%rowtype;
  n integer;
begin
  perform private.require_uid();
  perform private.lock_household_shared(p_household);
  if not private.is_active_member(p_household) then
    raise exception 'Je bent geen lid van dit huishouden' using errcode = '42501';
  end if;
  select * into l from public.trip_packing_lists x where x.household_id = p_household and x.id = p_list for update;
  if not found then raise exception 'Inpaklijst niet gevonden' using errcode = 'P0002'; end if;
  if l.deleted_at is null then
    version := l.version; items := 0; outcome := 'al_hersteld'; return next; return;
  end if;
  if p_version is null or l.version <> p_version then
    raise exception 'Iemand anders heeft dit net aangepast' using errcode = 'PT409';
  end if;
  if not exists (select 1 from public.trips t where t.household_id = p_household and t.id = l.trip_id and t.deleted_at is null) then
    raise exception 'Vakantie niet gevonden' using errcode = 'P0002';
  end if;
  -- Eerst de lijst (de bewaking van items eist een bestaande lijst), dan de items van dat moment.
  update public.trip_packing_lists x set deleted_at = null where x.id = p_list returning x.version into version;
  update public.trip_packing_items p set deleted_at = null
    where p.household_id = p_household and p.list_id = p_list and p.deleted_at = l.deleted_at;
  get diagnostics n = row_count;
  items := n; outcome := 'hersteld'; return next;
end $$;

create function public.delete_packing_list(p_household uuid, p_list uuid, p_version integer)
returns table (version integer, items integer, outcome text) language plpgsql security invoker set search_path = '' as $$
begin
  return query select * from private.delete_packing_list(p_household, p_list, p_version);
exception when others then
  raise exception using errcode = sqlstate, message = sqlerrm;   -- zonder DETAIL/HINT
end $$;
create function public.restore_packing_list(p_household uuid, p_list uuid, p_version integer)
returns table (version integer, items integer, outcome text) language plpgsql security invoker set search_path = '' as $$
begin
  return query select * from private.restore_packing_list(p_household, p_list, p_version);
exception when others then
  raise exception using errcode = sqlstate, message = sqlerrm;   -- zonder DETAIL/HINT
end $$;

-- ---------------------------------------------------------------------------------------------
-- Paklijst overnemen, met extra lijsten
-- ---------------------------------------------------------------------------------------------
-- Zoals in 20261025120000_vakanties.sql (aanvullend, niet afgevinkt, gearchiveerde leden overgeslagen, afgeleide ID's),
-- met twee wijzigingen:
--  - Gezamenlijk en "iedereen" nemen alleen items van leden en Gezamenlijk (list_id leeg); extra lijsten nooit vanzelf.
--  - p_lists: extra lijsten van de bronvakantie die mee moeten (alleen bij iedereen). Per lijst: bestaat er in de nieuwe
--    vakantie al een lijst met die naam, dan wordt die aangevuld; anders een nieuwe lijst met ID afgeleide_id(opdracht,
--    bronlijst). Een lijst waarvan de naam nu bij een actief lid hoort, wordt overgeslagen.
-- Geeft alle items van deze opdracht terug (ook bij herhaling), met list_id.
drop function public.copy_packing_items(uuid, uuid, uuid, uuid, uuid, boolean);
drop function private.copy_packing_items(uuid, uuid, uuid, uuid, uuid, boolean);

create function private.copy_packing_items(p_household uuid, p_command uuid, p_from_trip uuid, p_to_trip uuid,
  p_member uuid default null, p_gezamenlijk boolean default false, p_lists uuid[] default null)
returns table (id uuid, member_id uuid, list_id uuid, name text)
language plpgsql security definer set search_path = '' as $$
declare
  bron public.trip_packing_lists%rowtype;
  doel uuid;
begin
  perform private.require_uid();
  perform private.lock_household_shared(p_household);
  if not private.is_active_member(p_household) then
    raise exception 'Je bent geen lid van dit huishouden' using errcode = '42501';
  end if;
  if p_command is null or p_from_trip is null or p_to_trip is null or p_from_trip = p_to_trip
     or (p_member is not null and coalesce(p_gezamenlijk, false))
     or ((p_member is not null or coalesce(p_gezamenlijk, false)) and coalesce(cardinality(p_lists), 0) > 0)
     or coalesce(cardinality(p_lists), 0) > 100 then
    raise exception 'Kies een opdracht, twee verschillende vakanties en hoogstens één persoon of lijsten' using errcode = '22023';
  end if;
  if (select count(*) from public.trips t
      where t.household_id = p_household and t.id in (p_from_trip, p_to_trip) and t.deleted_at is null) <> 2 then
    raise exception 'Vakantie niet gevonden' using errcode = 'P0002';
  end if;
  if p_member is not null then
    perform private.check_participants(p_household, array[p_member]);
  end if;
  if coalesce(cardinality(p_lists), 0) > 0 and exists (
      select 1 from unnest(p_lists) g(id) where not exists (
        select 1 from public.trip_packing_lists l
        where l.household_id = p_household and l.trip_id = p_from_trip and l.id = g.id and l.deleted_at is null)) then
    raise exception 'Inpaklijst niet gevonden' using errcode = 'P0002';
  end if;

  -- Leden en Gezamenlijk.
  insert into public.trip_packing_items (id, household_id, trip_id, member_id, name)
    select private.afgeleide_id(p_command, s.id), p_household, p_to_trip, s.member_id, s.name
    from public.trip_packing_items s
    where s.household_id = p_household and s.trip_id = p_from_trip and s.deleted_at is null and s.list_id is null
      and (case when coalesce(p_gezamenlijk, false) then s.member_id is null
                when p_member is not null then s.member_id = p_member
                else true end)
      and (s.member_id is null or exists (
        select 1 from public.household_members m
        where m.household_id = p_household and m.id = s.member_id and m.status = 'active'))
    order by s.created_at, s.id
    on conflict do nothing;

  -- Extra lijsten (in de volgorde van aanmaken).
  for bron in select * from public.trip_packing_lists l
      where l.household_id = p_household and l.trip_id = p_from_trip and l.deleted_at is null
        and l.id = any (coalesce(p_lists, '{}'))
      order by l.created_at, l.id loop
    continue when bron.name_key = 'gezamenlijk' or exists (
      select 1 from public.household_members m
      where m.household_id = p_household and m.status = 'active'
        and lower(btrim(regexp_replace(m.display_name, '\s+', ' ', 'g'))) = bron.name_key);
    select l.id into doel from public.trip_packing_lists l
      where l.household_id = p_household and l.trip_id = p_to_trip and l.name_key = bron.name_key and l.deleted_at is null;
    if doel is null then
      -- Niets bij botsing: dezelfde afgeleide ID (herhaling) of intussen dezelfde naam (iemand anders, gelijktijdig).
      insert into public.trip_packing_lists (id, household_id, trip_id, name)
        values (private.afgeleide_id(p_command, bron.id), p_household, p_to_trip, bron.name)
        on conflict do nothing;
      -- Daarna altijd de lijst die nu echt actief is met deze naam. Geen (de afgeleide lijst is intussen verwijderd):
      -- niet stilletjes terugzetten, deze lijst overslaan.
      select l.id into doel from public.trip_packing_lists l
        where l.household_id = p_household and l.trip_id = p_to_trip and l.name_key = bron.name_key and l.deleted_at is null;
      continue when doel is null;
    end if;
    insert into public.trip_packing_items (id, household_id, trip_id, list_id, name)
      select private.afgeleide_id(p_command, s.id), p_household, p_to_trip, doel, s.name
      from public.trip_packing_items s
      where s.household_id = p_household and s.trip_id = p_from_trip and s.list_id = bron.id and s.deleted_at is null
      order by s.created_at, s.id
      on conflict do nothing;
  end loop;

  return query
    select p.id, p.member_id, p.list_id, p.name
    from public.trip_packing_items s
    join public.trip_packing_items p on p.id = private.afgeleide_id(p_command, s.id)
    where s.household_id = p_household and s.trip_id = p_from_trip
      and p.household_id = p_household and p.trip_id = p_to_trip and p.deleted_at is null
    order by p.created_at, p.id;
end $$;

create function public.copy_packing_items(p_household uuid, p_command uuid, p_from_trip uuid, p_to_trip uuid,
  p_member uuid default null, p_gezamenlijk boolean default false, p_lists uuid[] default null)
returns table (id uuid, member_id uuid, list_id uuid, name text) language plpgsql security invoker set search_path = '' as $$
begin
  return query select * from private.copy_packing_items(p_household, p_command, p_from_trip, p_to_trip, p_member, p_gezamenlijk, p_lists);
exception when others then
  raise exception using errcode = sqlstate, message = sqlerrm;   -- zonder DETAIL/HINT
end $$;

revoke all on function private.delete_packing_list(uuid, uuid, integer), private.restore_packing_list(uuid, uuid, integer),
  private.copy_packing_items(uuid, uuid, uuid, uuid, uuid, boolean, uuid[]),
  public.delete_packing_list(uuid, uuid, integer), public.restore_packing_list(uuid, uuid, integer),
  public.copy_packing_items(uuid, uuid, uuid, uuid, uuid, boolean, uuid[])
  from public, anon;
grant execute on function private.delete_packing_list(uuid, uuid, integer), private.restore_packing_list(uuid, uuid, integer),
  private.copy_packing_items(uuid, uuid, uuid, uuid, uuid, boolean, uuid[]),
  public.delete_packing_list(uuid, uuid, integer), public.restore_packing_list(uuid, uuid, integer),
  public.copy_packing_items(uuid, uuid, uuid, uuid, uuid, boolean, uuid[])
  to authenticated;
