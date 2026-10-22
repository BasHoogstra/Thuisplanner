-- Thuisplanner · Boodschappen "Later nodig" (docs/thuisplanner-vakanties.md §18; akkoord 21 oktober 2026, alleen lokaal).
--
-- Probleem: boodschappen die je weken vooruit voor een vakantie toevoegt, staan wekenlang tussen de dagelijkse
-- boodschappen. Oplossing: één eigenschap van de boodschap zelf, "later nodig" (deferred). Algemeen: los van de reden
-- (vakantie, verjaardag, feestje); de reden staat in een koppeling (zoals trip_shopping_links), niet hier.
--
--  - Eén boodschap blijft één rij. Afvinken, aanpassen en verwijderen werken zoals altijd; "later" is alleen een tweede
--    lijst op de boodschappenpagina. Geen kopie, geen aparte vakantielijst.
--  - Iedere actief lid mag het zetten en terugzetten (kolomrecht update), zoals naam en vinkje. De RLS is ongewijzigd:
--    die werkt per rij (huishouden), niet per kolom. guard_content verhoogt de versie en de seintjes gaan zoals altijd.
--  - add_shopping_items krijgt p_later (standaard false):
--      nieuw        → deferred = p_later;
--      terug        → (een afgevinkte boodschap komt terug) deferred = p_later;
--      al_op_lijst  → met p_later blijft hij waar hij staat (wie hem nu al nodig heeft, houdt hem bij Nu te kopen);
--                     zonder p_later (toegevoegd op de gewone lijst) gaat een latere boodschap naar Nu te kopen.
--    Oude aanroepen (drie of vier parameters) werken ongewijzigd: p_later is dan false.
--  - Geen verschijndatum in deze ronde.

alter table public.shopping_items add column deferred boolean not null default false;

-- Kolomrechten: het bestaande insert/update-recht plus deferred (alleen erbij; niets ingetrokken).
grant insert (deferred), update (deferred) on public.shopping_items to authenticated;

drop function public.add_shopping_items(uuid, uuid[], text[], uuid);
drop function private.add_shopping_items(uuid, uuid[], text[], uuid);

create function private.add_shopping_items(p_household uuid, p_ids uuid[], p_names text[], p_trip uuid default null,
  p_later boolean default false)
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
  later boolean := coalesce(p_later, false);
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
          update public.shopping_items s set checked_at = null, deferred = later where s.id = it.id;
          -- Hergebruik: wat er eerder voor een vakantie was gekocht, is afgehandeld en niet opnieuw actueel.
          update public.trip_shopping_links l set settled_at = now()
            where l.household_id = p_household and l.shopping_item_id = it.id
              and l.deleted_at is null and l.settled_at is null;
          outcome := 'terug';
        else
          -- Op de gewone lijst toegevoegd: nu nodig. Vanuit een vakantie: blijft waar hij staat.
          if not later and it.deferred then
            update public.shopping_items s set deferred = false where s.id = it.id;
          end if;
          outcome := 'al_op_lijst';
        end if;
        update private.shopping_commands c set item_id = it.id, outcome = add_shopping_items.outcome where c.id = p_ids[i];
        id := it.id; name := it.name;
        exit;
      end if;
      begin
        insert into public.shopping_items (id, household_id, name, deferred) values (p_ids[i], p_household, naam, later);
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

create function public.add_shopping_items(p_household uuid, p_ids uuid[], p_names text[], p_trip uuid default null,
  p_later boolean default false)
returns table (id uuid, name text, outcome text) language plpgsql security invoker set search_path = '' as $$
begin
  return query select * from private.add_shopping_items(p_household, p_ids, p_names, p_trip, p_later);
exception when others then
  raise exception using errcode = sqlstate, message = sqlerrm;   -- zonder DETAIL/HINT
end $$;

revoke all on function private.add_shopping_items(uuid, uuid[], text[], uuid, boolean),
  public.add_shopping_items(uuid, uuid[], text[], uuid, boolean) from public, anon;
grant execute on function private.add_shopping_items(uuid, uuid[], text[], uuid, boolean),
  public.add_shopping_items(uuid, uuid[], text[], uuid, boolean) to authenticated;
