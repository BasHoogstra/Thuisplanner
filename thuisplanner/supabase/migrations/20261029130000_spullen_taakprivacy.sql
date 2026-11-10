-- Thuisplanner · Mijn spullen: taken alleen bij gedeelde spullen (privacyherstel tasks.possession_id, optie A, akkoord Bas
-- 10 november 2026). Direct na 20261029120000; die migratie mag nooit zonder deze online.
-- ALLEEN LOKAAL, op een eigen stack. Niet naar staging of de bèta zonder een afzonderlijk akkoord.
--
-- Het probleem: taken zijn voor het hele huishouden zichtbaar. Een taak aan een persoonlijk spul verraadde het id van dat
-- spul (en via de titel vaak de naam), ook als de eigenaar zelf koppelde of het spul later persoonlijk maakte.
-- De regel: tasks.possession_id wijst alleen naar een gedeeld spul (visibility = 'household'), voor elke rol.
--  1. Koppelen (insert of een andere possession_id) kan alleen aan een gedeeld spul. Via de API daarnaast alleen in een eigen
--     huishouden en niet in de prullenbak. Dezelfde fout als bij een onbekend id (geen aanwijzing dat het bestaat).
--     Het spul wordt daarbij vergrendeld (for share), zodat koppelen en tegelijk persoonlijk maken niet kunnen kruisen.
--  2. Wordt een spul persoonlijk, dan worden de koppelingen in dezelfde transactie leeggemaakt. Titels blijven zoals ze
--     zijn en er wordt niets verwijderd (de app waarschuwt de eigenaar vooraf).
--  3. Eenmalig: bestaande koppelingen aan een niet-gedeeld spul worden leeggemaakt (online bestaat 29 nog nergens).

-- 1. De controle. De vergrendelfunctie is security definer (de leden mogen possessions niet vergrendelen); de guard zelf
--    blijft invoker, anders is current_user nooit 'authenticated' en valt de API-controle stil weg.
create function private.spul_gedeeld_vergrendeld(p_household uuid, p_id uuid, p_via_api boolean)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.possessions p
    where p.household_id = p_household and p.id = p_id and p.visibility = 'household'
      and (not p_via_api or (p.deleted_at is null and p.household_id in (select private.my_household_ids())))
    for share;
  return found;
end $$;
revoke all on function private.spul_gedeeld_vergrendeld(uuid, uuid, boolean) from public, anon;
grant execute on function private.spul_gedeeld_vergrendeld(uuid, uuid, boolean) to authenticated, service_role;

create or replace function private.guard_task_possession()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.possession_id is not null
     and (tg_op = 'INSERT' or new.possession_id is distinct from old.possession_id)
     and not private.spul_gedeeld_vergrendeld(new.household_id, new.possession_id, current_user in ('anon', 'authenticated')) then
    raise exception 'Spul niet gevonden' using errcode = '42501';
  end if;
  return new;
end $$;

-- 2. Persoonlijk maken maakt de koppelingen los.
create function private.spul_taken_los()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.tasks set possession_id = null
    where household_id = new.household_id and possession_id = new.id;
  return null;
end $$;
revoke all on function private.spul_taken_los() from public, anon, authenticated;
create trigger possessions_taken_los after update of visibility on public.possessions
  for each row when (old.visibility = 'household' and new.visibility <> 'household')
  execute function private.spul_taken_los();

-- 3. Eenmalig opruimen; als functie, zodat de integratietest kan aantonen dat alleen deze koppelingen verdwijnen.
create function private.spullen_taakkoppelingen_opschonen()
returns integer language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  update public.tasks t set possession_id = null
    from public.possessions p
    where t.household_id = p.household_id and t.possession_id = p.id and p.visibility <> 'household';
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function private.spullen_taakkoppelingen_opschonen() from public, anon, authenticated;
select private.spullen_taakkoppelingen_opschonen();
