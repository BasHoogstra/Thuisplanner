-- Thuisplanner (map komtgoed) · KG-5D herstelronde 3 (review van 89e58c5), fout 2: opnieuw proberen van
-- boodschappen is aan de serverkant idempotent. Zie docs/thuisplanner-sync.md §9.
--
-- Probleem: add_shopping_items zocht eerst op naam en kon zo een intussen afgevinkte boodschap opnieuw
-- openen ("terug") vóór het keek of dezelfde opdracht-ID al verwerkt was. Een herhaalde opdracht (zelfde
-- UUID, bijvoorbeeld na een verloren antwoord) kon dus een tweede bijwerking hebben.
--
-- Oplossing: een register van verwerkte opdrachten (private.shopping_commands). Per boodschap in de
-- opdracht wordt eerst de opdracht-ID vastgelegd (insert ... on conflict do nothing: een gelijktijdige
-- herhaling wacht op de eerste en ziet daarna haar uitkomst). Is de ID al verwerkt, dan geeft de functie
-- de oorspronkelijke uitkomst terug, zonder iets te wijzigen. Alleen een nieuwe ID volgt de productregels
-- (bestaat al op de lijst, afgevinkt komt terug, of nieuw). Een ID van een ander huishouden geeft een
-- algemene fout en verraadt niets.
--
-- Het register bevat alleen ID's, het huishouden, de uitkomst en het moment; geen namen. Wordt een
-- huishouden verwijderd, dan verdwijnt zijn register mee.

create table private.shopping_commands (
  id uuid primary key,                      -- de opdracht-ID van de app (= p_ids[i])
  household_id uuid not null references public.households(id) on delete cascade,
  item_id uuid not null,                    -- de boodschap waarop de opdracht uitkwam
  outcome text not null check (outcome in ('nieuw', 'terug', 'al_op_lijst', 'al_verwerkt')),
  created_at timestamptz not null default now()
);
create index shopping_commands_household_idx on private.shopping_commands (household_id);
revoke all on private.shopping_commands from public, anon, authenticated;

create or replace function private.add_shopping_items(p_household uuid, p_ids uuid[], p_names text[])
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
    for attempt in 1 .. 2 loop
      select * into it from public.shopping_items s
        where s.household_id = p_household and s.name_key = k and s.deleted_at is null for update;
      if found then
        if it.checked_at is not null then
          update public.shopping_items s set checked_at = null where s.id = it.id;
          outcome := 'terug';
        else
          outcome := 'al_op_lijst';
        end if;
        update private.shopping_commands c set item_id = it.id, outcome = add_shopping_items.outcome where c.id = p_ids[i];
        id := it.id; name := it.name; return next;
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

revoke all on function private.add_shopping_items(uuid, uuid[], text[]) from public, anon;
grant execute on function private.add_shopping_items(uuid, uuid[], text[]) to authenticated;
