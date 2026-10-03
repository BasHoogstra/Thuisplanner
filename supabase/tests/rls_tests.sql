-- RLS- en ledentests voor stap 1.2 (en verder). Draait volledig in één transactie die aan het eind
-- wordt teruggedraaid: er blijft niets achter. Veilig op staging; NIET op productie draaien.
-- Uitvoeren als postgres (SQL-editor, psql of `supabase/tests/lokaal/run.sh`).
--
-- Personen: Bas (beheerder), Sanne (volwassene, krijgt later een account via uitnodiging),
-- Kees (account, wordt via een uitnodiging nieuw lid), Eve (buitenstaander), Lynn en Loïs
-- (kinderen zonder account). Elke test die faalt stopt het script met een duidelijke melding.

begin;

-- Hulpmiddelen (verdwijnen met de rollback): wisselen van ingelogde gebruiker en tellen.
create function pg_temp.als(p_user text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', current_setting('test.' || p_user), 'role', 'authenticated')::text, true);
end $$;
create function pg_temp.ok(p_naam text) returns void language plpgsql as $$
begin
  perform set_config('test.aantal', (coalesce(nullif(current_setting('test.aantal', true), ''), '0')::int + 1)::text, true);
end $$;
grant execute on all functions in schema pg_temp to authenticated, anon;

-- Accounts (als postgres).
select set_config('test.bas',   gen_random_uuid()::text, true);
select set_config('test.sanne', gen_random_uuid()::text, true);
select set_config('test.kees',  gen_random_uuid()::text, true);
select set_config('test.eve',   gen_random_uuid()::text, true);
insert into auth.users (id, email) values
  (current_setting('test.bas')::uuid,   'bas@test.invalid'),
  (current_setting('test.sanne')::uuid, 'sanne@test.invalid'),
  (current_setting('test.kees')::uuid,  'kees@test.invalid'),
  (current_setting('test.eve')::uuid,   'eve@test.invalid');

set local role authenticated;

-- T01 Bas maakt een huishouden; hij is beheerder met account.
select pg_temp.als('bas');
select set_config('test.hh', public.create_household('Hoogstra', 'Bas')::text, true);
do $$ begin
  if (select count(*) from public.households) <> 1 then raise exception 'T01: Bas ziet zijn huishouden niet'; end if;
  if not exists (select 1 from public.household_members where user_id = (select auth.uid()) and role = 'owner' and kind = 'adult')
    then raise exception 'T01: Bas is geen beheerder'; end if;
  perform pg_temp.ok('T01');
end $$;

-- T02 Zonder naam geen huishouden.
do $$ declare fout boolean := false; begin
  begin perform public.create_household('X', null); exception when others then fout := true; end;
  if not fout then raise exception 'T02: huishouden zonder eigen naam werd toegestaan'; end if;
  perform pg_temp.ok('T02');
end $$;

-- T03 Bas voegt leden zonder account toe: Sanne (volwassene), Lynn en Loïs (kinderen).
insert into public.household_members (household_id, display_name, kind, sort) values
  (current_setting('test.hh')::uuid, 'Sanne', 'adult', 1),
  (current_setting('test.hh')::uuid, 'Lynn',  'child', 2),
  (current_setting('test.hh')::uuid, 'Loïs',  'child', 3);
select set_config('test.m_sanne', (select id::text from public.household_members where display_name = 'Sanne'), true);
select set_config('test.m_lynn',  (select id::text from public.household_members where display_name = 'Lynn'), true);
do $$ begin
  if (select count(*) from public.household_members) <> 4 then raise exception 'T03: verwacht 4 leden'; end if;
  if (select count(*) from public.household_members where user_id is null) <> 3 then raise exception 'T03: 3 leden zonder account verwacht'; end if;
  if (select role from public.household_members where display_name = 'Lynn') <> 'member' then raise exception 'T03: kind-lid hoort member te zijn'; end if;
  perform pg_temp.ok('T03');
end $$;

-- T04 Een account kan niet direct aan een lid worden gekoppeld (alleen via uitnodiging).
do $$ declare fout boolean := false; begin
  begin
    insert into public.household_members (household_id, display_name, user_id)
      values (current_setting('test.hh')::uuid, 'Eve', current_setting('test.eve')::uuid);
  exception when others then fout := true; end;
  if not fout then raise exception 'T04: lid met account direct toegevoegd'; end if;
  fout := false;
  begin
    update public.household_members set user_id = current_setting('test.eve')::uuid where id = current_setting('test.m_lynn')::uuid;
  exception when others then fout := true; end;
  if not fout then raise exception 'T04: account direct aan kind-lid gekoppeld'; end if;
  perform pg_temp.ok('T04');
end $$;

-- T05 Een lid zonder account kan geen beheerder zijn.
do $$ declare fout boolean := false; begin
  begin update public.household_members set role = 'owner' where id = current_setting('test.m_lynn')::uuid;
  exception when others then fout := true; end;
  if not fout then raise exception 'T05: lid zonder account werd beheerder'; end if;
  perform pg_temp.ok('T05');
end $$;

-- T06 Bas maakt items en uitnodigingen.
insert into public.items (household_id, coll, id, data) values
  (current_setting('test.hh')::uuid, 'tasks', 't1', '{"text":"Vuilnis"}'),
  (current_setting('test.hh')::uuid, 'boodschappen', 'b1', '{"text":"Melk"}');
do $$ declare t text; begin
  insert into public.household_invites (household_id, created_by, member_id, role)
    values (current_setting('test.hh')::uuid, (select auth.uid()), current_setting('test.m_sanne')::uuid, 'owner') returning token into t;
  perform set_config('test.inv_sanne', t, true);
  insert into public.household_invites (household_id, created_by, role)
    values (current_setting('test.hh')::uuid, (select auth.uid()), 'member') returning token into t;
  perform set_config('test.inv_kees', t, true);
  insert into public.household_invites (household_id, created_by, member_id)
    values (current_setting('test.hh')::uuid, (select auth.uid()), current_setting('test.m_sanne')::uuid) returning token into t;
  perform set_config('test.inv_dubbel', t, true);
  insert into public.household_invites (household_id, created_by, expires_at)
    values (current_setting('test.hh')::uuid, (select auth.uid()), now() - interval '1 minute') returning token into t;
  perform set_config('test.inv_verlopen', t, true);
  insert into public.household_invites (household_id, created_by)
    values (current_setting('test.hh')::uuid, (select auth.uid())) returning token into t;
  perform set_config('test.inv_ingetrokken', t, true);
end $$;
update public.household_invites set revoked_at = now() where token = current_setting('test.inv_ingetrokken');
do $$ begin
  if (select count(*) from public.items) <> 2 then raise exception 'T06: items niet aangemaakt'; end if;
  if (select rev from public.items where id = 't1') <> 1 then raise exception 'T06: rev hoort 1 te zijn'; end if;
  if (select created_by from public.items where id = 't1') <> (select auth.uid()) then raise exception 'T06: created_by klopt niet'; end if;
  perform pg_temp.ok('T06');
end $$;

-- T07 Buitenstaander Eve ziet niets en kan niets.
select pg_temp.als('eve');
do $$ declare n int; fout boolean := false; begin
  if (select count(*) from public.households) + (select count(*) from public.household_members)
     + (select count(*) from public.items) + (select count(*) from public.household_invites)
     + (select count(*) from public.legacy_imports) <> 0 then raise exception 'T07: Eve ziet data van een ander huishouden'; end if;
  begin
    insert into public.items (household_id, coll, id, data) values (current_setting('test.hh')::uuid, 'tasks', 'x', '{}');
  exception when others then fout := true; end;
  if not fout then raise exception 'T07: Eve kon een item toevoegen'; end if;
  update public.households set name = 'Gehackt' where id = current_setting('test.hh')::uuid;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'T07: Eve kon het huishouden hernoemen'; end if;
  update public.items set data = '{}' where household_id = current_setting('test.hh')::uuid;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'T07: Eve kon items wijzigen'; end if;
  fout := false;
  begin
    insert into public.household_members (household_id, display_name) values (current_setting('test.hh')::uuid, 'Indringer');
  exception when others then fout := true; end;
  if not fout then raise exception 'T07: Eve kon een lid toevoegen'; end if;
  perform pg_temp.ok('T07');
end $$;

-- T08 Sanne (account) ziet vóór het accepteren niets; daarna wordt haar account aan het bestaande
-- Sanne-lid gekoppeld en ontstaat er geen tweede Sanne.
select pg_temp.als('sanne');
do $$ begin
  if (select count(*) from public.households) <> 0 then raise exception 'T08: Sanne ziet al iets vóór accepteren'; end if;
  if public.accept_invite(current_setting('test.inv_sanne'), 'Sanne B.') <> current_setting('test.hh')::uuid then
    raise exception 'T08: accept_invite gaf het verkeerde huishouden'; end if;
  if (select count(*) from public.household_members) <> 4 then raise exception 'T08: er is een extra lid ontstaan'; end if;
  if (select count(*) from public.household_members where display_name = 'Sanne') <> 1 then raise exception 'T08: Sanne-lid niet behouden'; end if;
  if (select user_id from public.household_members where id = current_setting('test.m_sanne')::uuid) <> (select auth.uid())
    then raise exception 'T08: account niet aan het Sanne-lid gekoppeld'; end if;
  if (select role from public.household_members where id = current_setting('test.m_sanne')::uuid) <> 'owner'
    then raise exception 'T08: Sanne is geen beheerder geworden'; end if;
  if (select linked_at from public.household_members where id = current_setting('test.m_sanne')::uuid) is null
    then raise exception 'T08: linked_at niet gezet'; end if;
  perform pg_temp.ok('T08');
end $$;

-- T09 Sanne beheert volledig mee: hernoemen, leden aanpassen, items wijzigen (rev telt op).
do $$ declare n int; begin
  update public.households set name = 'Familie Hoogstra' where id = current_setting('test.hh')::uuid;
  get diagnostics n = row_count; if n <> 1 then raise exception 'T09: Sanne kan het huishouden niet hernoemen'; end if;
  update public.household_members set color = '#E67E22' where id = current_setting('test.m_lynn')::uuid;
  get diagnostics n = row_count; if n <> 1 then raise exception 'T09: Sanne kan een lid niet aanpassen'; end if;
  update public.items set data = '{"text":"Vuilnis buiten"}' where id = 't1';
  if (select rev from public.items where id = 't1') <> 2 then raise exception 'T09: rev telt niet op'; end if;
  if (select updated_by from public.items where id = 't1') <> (select auth.uid()) then raise exception 'T09: updated_by klopt niet'; end if;
  if (select created_by from public.items where id = 't1') <> current_setting('test.bas')::uuid then raise exception 'T09: created_by veranderd'; end if;
  perform pg_temp.ok('T09');
end $$;

-- T10 Uitnodigingen: dubbel gebruik, al gekoppeld lid, verlopen en ingetrokken worden geweigerd.
do $$ declare fout boolean; begin
  fout := false; begin perform public.accept_invite(current_setting('test.inv_sanne'), null); exception when others then fout := true; end;
  if not fout then raise exception 'T10: uitnodiging twee keer gebruikt'; end if;
end $$;
select pg_temp.als('kees');
do $$ declare fout boolean; begin
  fout := false; begin perform public.accept_invite(current_setting('test.inv_dubbel'), 'Kees'); exception when others then fout := true; end;
  if not fout then raise exception 'T10: tweede account aan het al gekoppelde Sanne-lid gekoppeld'; end if;
  fout := false; begin perform public.accept_invite(current_setting('test.inv_verlopen'), 'Kees'); exception when others then fout := true; end;
  if not fout then raise exception 'T10: verlopen uitnodiging geaccepteerd'; end if;
  fout := false; begin perform public.accept_invite(current_setting('test.inv_ingetrokken'), 'Kees'); exception when others then fout := true; end;
  if not fout then raise exception 'T10: ingetrokken uitnodiging geaccepteerd'; end if;
  fout := false; begin perform public.accept_invite('bestaat-niet', 'Kees'); exception when others then fout := true; end;
  if not fout then raise exception 'T10: onbekende uitnodiging geaccepteerd'; end if;
  if (select count(*) from public.households) <> 0 then raise exception 'T10: Kees kreeg toegang via een geweigerde uitnodiging'; end if;
  perform pg_temp.ok('T10');
end $$;

-- T11 Kees accepteert een uitnodiging zonder lid: er komt een nieuw lid 'Kees' (geen beheerder).
do $$ declare n int; fout boolean; begin
  perform public.accept_invite(current_setting('test.inv_kees'), 'Kees');
  if (select count(*) from public.household_members) <> 5 then raise exception 'T11: nieuw lid niet aangemaakt'; end if;
  if (select role from public.household_members where user_id = (select auth.uid())) <> 'member' then raise exception 'T11: Kees hoort lid te zijn'; end if;
  if (select count(*) from public.items) <> 2 then raise exception 'T11: Kees ziet de items niet'; end if;
  -- Een lid (geen beheerder) ziet geen uitnodigingen of import, voegt geen leden toe, verandert geen rollen.
  if (select count(*) from public.household_invites) <> 0 then raise exception 'T11: lid ziet uitnodigingen'; end if;
  fout := false; begin
    insert into public.household_members (household_id, display_name) values (current_setting('test.hh')::uuid, 'Extra');
  exception when others then fout := true; end;
  if not fout then raise exception 'T11: lid kon een lid toevoegen'; end if;
  fout := false; begin
    update public.household_members set role = 'owner' where user_id = (select auth.uid());
  exception when others then fout := true; end;
  if not fout then raise exception 'T11: lid kon zichzelf beheerder maken'; end if;
  update public.household_members set color = '#3498DB' where user_id = (select auth.uid());
  get diagnostics n = row_count; if n <> 1 then raise exception 'T11: lid kan eigen kleur niet aanpassen'; end if;
  update public.household_members set display_name = 'Indringer' where id = current_setting('test.m_lynn')::uuid;
  get diagnostics n = row_count; if n <> 0 then raise exception 'T11: lid kon een ander lid aanpassen'; end if;
  -- Een lid mag wel gewoon met de items werken.
  insert into public.items (household_id, coll, id, data) values (current_setting('test.hh')::uuid, 'tasks', 't2', '{"text":"Kees"}');
  perform pg_temp.ok('T11');
end $$;

-- T12 Grafstenen: echt verwijderen kan niet via de API; deleted_at zetten wel.
select pg_temp.als('bas');
do $$ declare n int; begin
  delete from public.items where id = 't1';
  get diagnostics n = row_count; if n <> 0 then raise exception 'T12: item hard verwijderd via de API'; end if;
  update public.items set deleted_at = now() where id = 't1';
  if (select rev from public.items where id = 't1') <> 3 or (select deleted_at from public.items where id = 't1') is null
    then raise exception 'T12: grafsteen niet goed gezet'; end if;
  perform pg_temp.ok('T12');
end $$;

-- T13 Bestanden: alleen binnen het eigen huishouden-pad.
insert into storage.objects (bucket_id, name) values ('household-files', current_setting('test.hh') || '/onderhoud/ketel.jpg');
do $$ declare fout boolean; begin
  if (select count(*) from storage.objects where bucket_id = 'household-files') <> 1 then raise exception 'T13: Bas ziet zijn bestand niet'; end if;
  fout := false; begin insert into storage.objects (bucket_id, name) values ('household-files', gen_random_uuid()::text || '/x.jpg');
  exception when others then fout := true; end;
  if not fout then raise exception 'T13: bestand in een ander huishouden geplaatst'; end if;
  fout := false; begin insert into storage.objects (bucket_id, name) values ('household-files', 'geen-uuid/x.jpg');
  exception when others then fout := true; end;
  if not fout then raise exception 'T13: bestand met ongeldig pad geplaatst'; end if;
  fout := false; begin insert into storage.objects (bucket_id, name) values ('household-files', current_setting('test.hh'));
  exception when others then fout := true; end;
  if not fout then raise exception 'T13: bestand zonder map geplaatst'; end if;
  perform pg_temp.ok('T13');
end $$;
select pg_temp.als('eve');
do $$ declare fout boolean := false; begin
  if (select count(*) from storage.objects where bucket_id = 'household-files') <> 0 then raise exception 'T13: Eve ziet het bestand'; end if;
  begin insert into storage.objects (bucket_id, name) values ('household-files', current_setting('test.hh') || '/x.jpg');
  exception when others then fout := true; end;
  if not fout then raise exception 'T13: Eve kon een bestand in het huishouden plaatsen'; end if;
end $$;

-- T14 legacy_imports: alleen beheerders; status kan de app niet zelf op 'verified' zetten.
select pg_temp.als('bas');
insert into public.legacy_imports (household_id, source_hash, raw, created_by)
  values (current_setting('test.hh')::uuid, repeat('a', 64), '{"tasks":{}}', (select auth.uid()));
do $$ declare fout boolean := false; begin
  if (select count(*) from public.legacy_imports) <> 1 then raise exception 'T14: beheerder ziet de import niet'; end if;
  begin insert into public.legacy_imports (household_id, source_hash, raw, created_by, status)
    values (current_setting('test.hh')::uuid, repeat('b', 64), '{}', (select auth.uid()), 'verified');
  exception when others then fout := true; end;
  if not fout then raise exception 'T14: import direct als verified opgeslagen'; end if;
end $$;
select pg_temp.als('kees');
do $$ begin
  if (select count(*) from public.legacy_imports) <> 0 then raise exception 'T14: gewoon lid ziet de import'; end if;
  perform pg_temp.ok('T14');
end $$;

-- T15 Altijd een beheerder met account: Sanne mag vertrekken (Bas blijft), Bas daarna niet.
select pg_temp.als('sanne');
do $$ begin
  perform public.leave_household(current_setting('test.hh')::uuid);
  if (select count(*) from public.households) <> 0 then raise exception 'T15: Sanne ziet na vertrek nog het huishouden'; end if;
end $$;
select pg_temp.als('bas');
do $$ declare fout boolean; begin
  if (select user_id from public.household_members where id = current_setting('test.m_sanne')::uuid) is not null
    then raise exception 'T15: Sanne-account niet losgekoppeld'; end if;
  if (select count(*) from public.household_members where id = current_setting('test.m_sanne')::uuid) <> 1
    then raise exception 'T15: Sanne-lid is verdwenen (hoort te blijven)'; end if;
  fout := false; begin perform public.leave_household(current_setting('test.hh')::uuid); exception when others then fout := true; end;
  if not fout then raise exception 'T15: laatste beheerder kon vertrekken'; end if;
  -- Zichzelf degraderen of verwijderen als laatste beheerder: geweigerd bij de controle.
  fout := false; begin
    update public.household_members set role = 'member' where user_id = (select auth.uid());
    set constraints all immediate;
  exception when others then fout := true; end;
  set constraints all deferred;
  if not fout then raise exception 'T15: laatste beheerder kon zichzelf degraderen'; end if;
  fout := false; begin
    delete from public.household_members where user_id = (select auth.uid());
    set constraints all immediate;
  exception when others then fout := true; end;
  set constraints all deferred;
  if not fout then raise exception 'T15: laatste beheerder kon zichzelf verwijderen'; end if;
  perform pg_temp.ok('T15');
end $$;

-- T16 Beheer overdragen aan Kees: Kees wordt beheerder, Bas gewoon lid.
do $$ declare fout boolean := false; begin
  perform public.transfer_ownership(current_setting('test.hh')::uuid,
    (select id from public.household_members where user_id = current_setting('test.kees')::uuid));
  set constraints all immediate; set constraints all deferred;
  if (select role from public.household_members where user_id = current_setting('test.kees')::uuid) <> 'owner'
    then raise exception 'T16: Kees is geen beheerder geworden'; end if;
  if (select role from public.household_members where user_id = (select auth.uid())) <> 'member'
    then raise exception 'T16: Bas is nog beheerder'; end if;
  begin perform public.transfer_ownership(current_setting('test.hh')::uuid, current_setting('test.m_lynn')::uuid);
  exception when others then fout := true; end;
  if not fout then raise exception 'T16: niet-beheerder kon beheer overdragen'; end if;
  perform pg_temp.ok('T16');
end $$;

-- T17 Kind-lid zonder account: geen account, kan dus niet inloggen; hoort wel bij het huishouden.
do $$ begin
  if (select user_id from public.household_members where id = current_setting('test.m_lynn')::uuid) is not null
    then raise exception 'T17: kind-lid heeft een account'; end if;
  if (select kind from public.household_members where id = current_setting('test.m_lynn')::uuid) <> 'child'
    then raise exception 'T17: kind-lid is geen child'; end if;
  perform pg_temp.ok('T17');
end $$;

-- T18 Huishouden verwijderen door de beheerder (Kees) mag; alles gaat mee.
select pg_temp.als('kees');
do $$ declare n int; begin
  delete from public.households where id = current_setting('test.hh')::uuid;
  get diagnostics n = row_count; if n <> 1 then raise exception 'T18: beheerder kon het huishouden niet verwijderen'; end if;
  set constraints all immediate; set constraints all deferred;
  if (select count(*) from public.items) + (select count(*) from public.household_members) <> 0
    then raise exception 'T18: data bleef achter'; end if;
  perform pg_temp.ok('T18');
end $$;

-- T19 Niet ingelogd (anon): geen toegang tot de tabellen en functies.
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $$ declare fout int := 0; begin
  begin perform 1 from public.households; exception when others then fout := fout + 1; end;
  begin perform 1 from public.items; exception when others then fout := fout + 1; end;
  begin perform 1 from public.household_members; exception when others then fout := fout + 1; end;
  begin perform public.create_household('X', 'Y'); exception when others then fout := fout + 1; end;
  if fout <> 4 then raise exception 'T19: anon heeft nog toegang (% van 4 geweigerd)', fout; end if;
  perform pg_temp.ok('T19');
end $$;

-- T20 Ingelogd mag geen truncate (omzeilt RLS).
reset role;
set local role authenticated;
select pg_temp.als('eve');
do $$ declare fout boolean := false; begin
  begin execute 'truncate public.items'; exception when others then fout := true; end;
  if not fout then raise exception 'T20: truncate toegestaan'; end if;
  perform pg_temp.ok('T20');
end $$;

reset role;
select 'RLS-tests geslaagd: ' || current_setting('test.aantal') || ' van 20' as resultaat;
rollback;
