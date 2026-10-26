-- Thuisplanner (map komtgoed) · KG-5D: realtime op de server (bouwplan stap 3; docs/thuisplanner-sync.md).
--
-- Na elke wijziging in afspraken, taken, boodschappen, leden of het huishouden stuurt de database een
-- seintje naar het private kanaal household:<id>. Een seintje bevat ALLEEN {t, id, v, op}: welke soort,
-- welk id, welke versie, welke handeling. Nooit titels, namen, notities of account-ID's. De app haalt
-- daarna zelf opnieuw op via de gewone, met RLS beveiligde weg (bouwplan: "realtime stuurt alleen een
-- seintje"). postgres_changes blijft uit: geen tabel staat in een publicatie (KG-T27).
--
-- Toegang tot het kanaal (RLS op realtime.messages): alleen actieve leden van dat huishouden mogen
-- luisteren. Niemand mag via de client zelf op een huishoudkanaal zenden (geen insert-beleid); alleen de
-- database zendt. Presence is niet toegestaan.

-- ---------------------------------------------------------------------------------------------
-- Welk huishouden hoort bij een kanaalnaam? Alleen "household:<uuid>"; al het andere: geen.
-- ---------------------------------------------------------------------------------------------
create function private.topic_household(p_topic text)
returns uuid language sql immutable set search_path = '' as $$
  select case when p_topic ~ '^household:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              then substr(p_topic, 11)::uuid end
$$;
revoke all on function private.topic_household(text) from public, anon;
grant execute on function private.topic_household(text) to authenticated;

-- Luisteren: alleen broadcast, alleen op het kanaal van een huishouden waar je actief lid van bent.
create policy thuisplanner_household_luisteren on realtime.messages for select to authenticated
  using (
    extension = 'broadcast'
    and private.topic_household((select realtime.topic())) in (select private.my_household_ids())
  );

-- ---------------------------------------------------------------------------------------------
-- Seintjes
-- ---------------------------------------------------------------------------------------------
create function private.ping(p_household uuid, p_payload jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  -- Wordt het huishouden zelf verwijderd, dan geen seintje per rij: één seintje van households volstaat.
  if p_household is null or not exists (select 1 from public.households h where h.id = p_household) then
    return;
  end if;
  perform realtime.send(p_payload, 'wijziging', 'household:' || p_household::text, true);
end $$;

-- Inhoud met een versie: afspraken, taken, boodschappen.
create function private.ping_content()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  r record := case when tg_op = 'DELETE' then old else new end;
begin
  perform private.ping(r.household_id, jsonb_build_object(
    't', tg_table_name, 'id', r.id, 'v', case when tg_op = 'DELETE' then null else r.version end,
    'op', left(tg_op, 1)));
  return null;
end $$;

-- Leden: zonder versie. Ook voor wie zijn toegang net verloor (die haalt dan op en ziet "geen toegang").
create function private.ping_members()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  r record := case when tg_op = 'DELETE' then old else new end;
begin
  perform private.ping(r.household_id, jsonb_build_object('t', 'household_members', 'id', r.id, 'op', left(tg_op, 1)));
  return null;
end $$;

create function private.ping_household()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    -- De rij is al weg; zend direct (private.ping zou overslaan).
    perform realtime.send(jsonb_build_object('t', 'households', 'id', old.id, 'op', 'D'), 'wijziging',
                          'household:' || old.id::text, true);
  else
    perform private.ping(new.id, jsonb_build_object('t', 'households', 'id', new.id, 'op', 'U'));
  end if;
  return null;
end $$;

revoke all on function private.ping(uuid, jsonb), private.ping_content(), private.ping_members(), private.ping_household()
  from public, anon, authenticated;

create trigger events_ping after insert or update or delete on public.events
  for each row execute function private.ping_content();
create trigger tasks_ping after insert or update or delete on public.tasks
  for each row execute function private.ping_content();
create trigger shopping_items_ping after insert or update or delete on public.shopping_items
  for each row execute function private.ping_content();
create trigger household_members_ping after insert or update or delete on public.household_members
  for each row execute function private.ping_members();
create trigger households_ping after update or delete on public.households
  for each row execute function private.ping_household();
