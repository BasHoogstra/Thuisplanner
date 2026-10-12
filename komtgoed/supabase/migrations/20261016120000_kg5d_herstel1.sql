-- Thuisplanner (map komtgoed) · KG-5D herstelronde 1 (bevinding 2): een kanaal dat na intrekking
-- openblijft, krijgt niets meer. Zie docs/thuisplanner-sync.md, "Toegang intrekken en realtime".
--
-- Gemeten tegen de lokale stack (supabase/realtime v2.130): Realtime controleert het beleid op
-- realtime.messages bij het aanmelden op een kanaal, opnieuw als de client zelf een nieuw toegangstoken
-- stuurt, en sluit het kanaal als het token verloopt. Een client die NIET meewerkt (geen nieuw token
-- stuurt en zich niet afmeldt) blijft na intrekking dus tot het verlopen van zijn token (standaard
-- tot een uur) seintjes ontvangen. Dat mag niet van de vrijwillige client afhangen.
--
-- Oplossing op de server: de kanaalnaam bevat een volgnummer (epoch), household:<id>:<epoch>. Verliest
-- een account zijn actieve lidmaatschap (archiveren, vertrekken, account loskoppelen, lid verwijderen),
-- dan verhoogt de database het volgnummer. Alle volgende seintjes gaan naar het nieuwe kanaal; het oude
-- kanaal krijgt niets meer, wat de client ook doet. Aanmelden op het nieuwe kanaal toetst Realtime aan
-- het beleid: alleen een actief lid, alleen het actuele volgnummer. De naam is geen geheim: de
-- bescherming zit in die toets en in het feit dat de server het oude kanaal niet meer gebruikt.
--
-- Volgorde binnen de intrekkende transactie: eerst het ledenseintje op het oude kanaal (zodat de
-- overgebleven leden weten dat ze moeten overstappen), dan pas het nieuwe volgnummer
-- (triggernamen: household_members_ping vóór household_members_rotate_channel; PostgreSQL voert
-- triggers voor dezelfde gebeurtenis uit in alfabetische volgorde). Alles wat daarna in dezelfde
-- transactie of later gebeurt, gaat naar het nieuwe kanaal.

create table private.household_channels (
  household_id uuid primary key,   -- bewust zonder verwijzing: zie ping_household (verwijderen)
  epoch integer not null default 0 check (epoch >= 0)
);
revoke all on private.household_channels from public, anon, authenticated;

-- Actuele kanaalnaam van een huishouden (zonder rij: volgnummer 0).
create function private.household_topic(p_household uuid)
returns text language sql stable security definer set search_path = '' as $$
  select 'household:' || p_household::text || ':'
         || coalesce((select c.epoch from private.household_channels c where c.household_id = p_household), 0)::text
$$;
revoke all on function private.household_topic(uuid) from public, anon, authenticated;

-- Mag de ingelogde gebruiker op dit kanaal luisteren? Alleen "household:<uuid>:<epoch>", alleen als
-- actief lid, alleen het actuele volgnummer.
create function private.may_listen(p_topic text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare
  hid uuid;
begin
  if p_topic is null
     or p_topic !~ '^household:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:(0|[1-9][0-9]{0,8})$' then
    return false;
  end if;
  hid := substr(p_topic, 11, 36)::uuid;
  return private.is_active_member(hid) and p_topic = private.household_topic(hid);
end $$;
revoke all on function private.may_listen(text) from public, anon;
grant execute on function private.may_listen(text) to authenticated;

drop policy thuisplanner_household_luisteren on realtime.messages;
drop function private.topic_household(text);
create policy thuisplanner_household_luisteren on realtime.messages for select to authenticated
  using (
    extension = 'broadcast'
    and (select private.may_listen((select realtime.topic())))
  );

-- De kanaalnaam voor de app (alleen voor een actief lid).
create function private.household_channel(p_household uuid)
returns text language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_uid();
  if not private.is_active_member(p_household) then
    raise exception 'Je bent geen lid van dit huishouden' using errcode = '42501';
  end if;
  return private.household_topic(p_household);
end $$;
revoke all on function private.household_channel(uuid) from public, anon;
grant execute on function private.household_channel(uuid) to authenticated;

create function public.household_channel(p_household uuid)
returns text language plpgsql stable security invoker set search_path = '' as $$
begin
  return private.household_channel(p_household);
exception when others then
  raise exception using errcode = sqlstate, message = sqlerrm;   -- zonder DETAIL/HINT
end $$;
revoke all on function public.household_channel(uuid) from public, anon;
grant execute on function public.household_channel(uuid) to authenticated;

-- Seintjes gaan voortaan naar het actuele kanaal.
create or replace function private.ping(p_household uuid, p_payload jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  -- Wordt het huishouden zelf verwijderd, dan geen seintje per rij: één seintje van households volstaat.
  if p_household is null or not exists (select 1 from public.households h where h.id = p_household) then
    return;
  end if;
  perform realtime.send(p_payload, 'wijziging', private.household_topic(p_household), true);
end $$;

create or replace function private.ping_household()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    -- De rij is al weg; zend direct (private.ping zou overslaan) en ruim het volgnummer op.
    perform realtime.send(jsonb_build_object('t', 'households', 'id', old.id, 'op', 'D'), 'wijziging',
                          private.household_topic(old.id), true);
    delete from private.household_channels c where c.household_id = old.id;
  else
    perform private.ping(new.id, jsonb_build_object('t', 'households', 'id', new.id, 'op', 'U'));
  end if;
  return null;
end $$;

-- Nieuw volgnummer zodra een account zijn actieve lidmaatschap verliest.
create function private.rotate_channel_on_revoke()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  verloren boolean := false;
begin
  if old.user_id is not null and old.status = 'active' then
    if tg_op = 'DELETE' then
      verloren := true;
    elsif new.status <> 'active' or new.user_id is distinct from old.user_id then
      verloren := true;
    end if;
  end if;
  if verloren and exists (select 1 from public.households h where h.id = old.household_id) then
    insert into private.household_channels as c (household_id, epoch) values (old.household_id, 1)
      on conflict (household_id) do update set epoch = c.epoch + 1;
  end if;
  return null;
end $$;
revoke all on function private.rotate_channel_on_revoke() from public, anon, authenticated;

create trigger household_members_rotate_channel after update or delete on public.household_members
  for each row execute function private.rotate_channel_on_revoke();
