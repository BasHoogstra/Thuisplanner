-- KomtGoed KG-1: RLS- en rechtentestmatrix. Alles in één transactie die aan het eind wordt
-- teruggedraaid: er blijft niets achter. Alleen lokaal (komtgoed/supabase/tests/run.sh); nooit op
-- een gedeelde of productiedatabase draaien. Synthetische accounts op @test.invalid.
--
-- Personen:
--   Bas    eigenaar van huishouden H1 (Hoogstra)
--   Sanne  volwassen lid van H1 zonder account; krijgt via een uitnodiging een account en beheer
--   Kees   account; wordt via een algemene uitnodiging nieuw lid van H1, later gearchiveerd
--   Mira   eigenaar van huishouden H2 (Bakker) én gewoon lid van H1 (één account, twee huishoudens)
--   Eve    buitenstaander met account
--   Lynn   kind zonder account (H1); Opa volwassene zonder account (H1); Noor kind zonder account (H2)
-- Elke test die faalt, stopt het script met een melding die begint met het testnummer (KG-Txx).

begin;

-- Hulpmiddelen (verdwijnen met de rollback).
create function pg_temp.als(p_user text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', current_setting('test.' || p_user), 'role', 'authenticated')::text, true);
end $$;
create function pg_temp.ok(p_naam text) returns void language plpgsql as $$
begin
  perform set_config('test.aantal', (coalesce(nullif(current_setting('test.aantal', true), ''), '0')::int + 1)::text, true);
end $$;
-- true als de opdracht een fout geeft (rechten, RLS-check, constraint of functie-uitzondering).
create function pg_temp.faalt(p_sql text) returns boolean language plpgsql as $$
begin
  execute p_sql;
  return false;
exception when others then
  return true;
end $$;
-- Aantal rijen dat een query oplevert, gezien als de huidige rol.
create function pg_temp.aantal(p_sql text) returns bigint language plpgsql as $$
declare n bigint;
begin
  execute 'select count(*) from (' || p_sql || ') q' into n;
  return n;
end $$;
-- Aantal rijen dat een update of delete raakt, gezien als de huidige rol.
create function pg_temp.geraakt(p_sql text) returns bigint language plpgsql as $$
declare n bigint;
begin
  execute p_sql;
  get diagnostics n = row_count;
  return n;
end $$;
grant execute on all functions in schema pg_temp to authenticated, anon;

select set_config('test.bas',   gen_random_uuid()::text, true);
select set_config('test.sanne', gen_random_uuid()::text, true);
select set_config('test.kees',  gen_random_uuid()::text, true);
select set_config('test.mira',  gen_random_uuid()::text, true);
select set_config('test.eve',   gen_random_uuid()::text, true);
insert into auth.users (id, email) values
  (current_setting('test.bas')::uuid,   'bas@test.invalid'),
  (current_setting('test.sanne')::uuid, 'sanne@test.invalid'),
  (current_setting('test.kees')::uuid,  'kees@test.invalid'),
  (current_setting('test.mira')::uuid,  'mira@test.invalid'),
  (current_setting('test.eve')::uuid,   'eve@test.invalid');

set local role authenticated;

-- KG-T01 Huishouden aanmaken: Bas wordt eigenaar met account.
select pg_temp.als('bas');
select set_config('test.h1', public.create_household('Hoogstra', 'Bas')::text, true);
do $$ begin
  if (select count(*) from public.households) <> 1 then raise exception 'KG-T01: Bas ziet zijn huishouden niet'; end if;
  if not exists (select 1 from public.household_members where user_id = (select auth.uid())
                 and role = 'owner' and kind = 'adult' and status = 'active' and linked_at is not null)
    then raise exception 'KG-T01: Bas is geen actieve eigenaar met account'; end if;
  perform pg_temp.ok('KG-T01');
end $$;

-- KG-T02 Ongeldige invoer wordt geweigerd.
do $$ begin
  if not pg_temp.faalt($q$ select public.create_household('', 'Bas') $q$) then raise exception 'KG-T02: lege huishoudnaam toegestaan'; end if;
  if not pg_temp.faalt($q$ select public.create_household('X', null) $q$) then raise exception 'KG-T02: huishouden zonder eigen naam toegestaan'; end if;
  if not pg_temp.faalt($q$ select public.create_household('X', repeat('a', 81)) $q$) then raise exception 'KG-T02: naam van 81 tekens toegestaan'; end if;
  if not pg_temp.faalt(format($q$ select public.add_member(%L, 'X', 'baby') $q$, current_setting('test.h1'))) then raise exception 'KG-T02: onbekende soort lid toegestaan'; end if;
  perform pg_temp.ok('KG-T02');
end $$;

-- KG-T03 Leden zonder account: Sanne en Opa (volwassen), Lynn (kind).
select set_config('test.m_sanne', public.add_member(current_setting('test.h1')::uuid, 'Sanne', 'adult')::text, true);
select set_config('test.m_lynn',  public.add_member(current_setting('test.h1')::uuid, 'Lynn', 'child')::text, true);
select set_config('test.m_opa',   public.add_member(current_setting('test.h1')::uuid, 'Opa', 'adult')::text, true);
do $$ begin
  if (select count(*) from public.household_members) <> 4 then raise exception 'KG-T03: verwacht 4 leden'; end if;
  if (select count(*) from public.household_members where user_id is null) <> 3 then raise exception 'KG-T03: verwacht 3 leden zonder account'; end if;
  if exists (select 1 from public.household_members where user_id is null and role <> 'member') then raise exception 'KG-T03: lid zonder account heeft beheerrol'; end if;
  if (select kind from public.household_members where id = current_setting('test.m_lynn')::uuid) <> 'child' then raise exception 'KG-T03: Lynn is geen kind-lid'; end if;
  perform pg_temp.ok('KG-T03');
end $$;

-- KG-T04 Uitnodigingen maken. De token komt één keer terug; de hash is via de API niet leesbaar.
select set_config('test.tok_sanne', public.create_invite(current_setting('test.h1')::uuid, current_setting('test.m_sanne')::uuid, 'admin'), true);
select set_config('test.tok_kees',  public.create_invite(current_setting('test.h1')::uuid), true);
select set_config('test.tok_mira',  public.create_invite(current_setting('test.h1')::uuid), true);
do $$ begin
  if current_setting('test.tok_sanne') !~ '^[0-9a-f]{64}$' then raise exception 'KG-T04: token heeft geen 256 bit hex-vorm'; end if;
  if current_setting('test.tok_sanne') = current_setting('test.tok_kees') then raise exception 'KG-T04: tokens niet uniek'; end if;
  if (select count(*) from public.household_invites) <> 3 then raise exception 'KG-T04: eigenaar ziet zijn uitnodigingen niet'; end if;
  if not pg_temp.faalt($q$ select token_hash from public.household_invites $q$) then raise exception 'KG-T04: tokenhash leesbaar via de API'; end if;
  if not pg_temp.faalt($q$ select * from public.household_invites $q$) then raise exception 'KG-T04: select * op uitnodigingen geeft de tokenhash prijs'; end if;
  perform pg_temp.ok('KG-T04');
end $$;
-- De token staat nergens leesbaar opgeslagen (als postgres gecontroleerd).
reset role;
do $$ begin
  if exists (select 1 from public.household_invites where token_hash = current_setting('test.tok_sanne')) then
    raise exception 'KG-T04: token zelf opgeslagen in plaats van een hash'; end if;
  if not exists (select 1 from public.household_invites
                 where token_hash = encode(extensions.digest(current_setting('test.tok_sanne'), 'sha256'), 'hex')) then
    raise exception 'KG-T04: hash van de token niet gevonden'; end if;
end $$;
set local role authenticated;

-- KG-T05 Een buitenstaander (Eve) ziet en wijzigt niets van H1.
select pg_temp.als('eve');
do $$ declare h text := current_setting('test.h1'); begin
  if pg_temp.aantal('select 1 from public.households') <> 0 then raise exception 'KG-T05: Eve ziet een huishouden'; end if;
  if pg_temp.aantal('select 1 from public.household_members') <> 0 then raise exception 'KG-T05: Eve ziet leden'; end if;
  if pg_temp.aantal('select id from public.household_invites') <> 0 then raise exception 'KG-T05: Eve ziet uitnodigingen'; end if;
  if pg_temp.geraakt(format($q$ update public.households set name = 'Gekaapt' where id = %L $q$, h)) <> 0 then raise exception 'KG-T05: Eve wijzigt de huishoudnaam'; end if;
  if pg_temp.geraakt(format($q$ update public.household_members set display_name = 'X' where household_id = %L $q$, h)) <> 0 then raise exception 'KG-T05: Eve wijzigt leden'; end if;
  if not pg_temp.faalt(format($q$ select public.add_member(%L, 'Indringer', 'adult') $q$, h)) then raise exception 'KG-T05: Eve voegt een lid toe'; end if;
  if not pg_temp.faalt(format($q$ select public.create_invite(%L) $q$, h)) then raise exception 'KG-T05: Eve maakt een uitnodiging'; end if;
  if not pg_temp.faalt(format($q$ select public.archive_member(%L, %L) $q$, h, current_setting('test.m_lynn'))) then raise exception 'KG-T05: Eve archiveert een lid'; end if;
  if not pg_temp.faalt(format($q$ select public.leave_household(%L) $q$, h)) then raise exception 'KG-T05: Eve verlaat een huishouden waar ze geen lid van is'; end if;
  perform pg_temp.ok('KG-T05');
end $$;

-- KG-T06 Directe schrijfacties buiten de functies om zijn onmogelijk, ook voor de eigenaar.
select pg_temp.als('bas');
do $$ declare h text := current_setting('test.h1'); u text := current_setting('test.eve'); begin
  if not pg_temp.faalt($q$ insert into public.households (name) values ('Direct') $q$) then raise exception 'KG-T06: huishouden direct aangemaakt'; end if;
  if not pg_temp.faalt(format($q$ insert into public.household_members (household_id, display_name) values (%L, 'Direct') $q$, h)) then raise exception 'KG-T06: lid direct toegevoegd'; end if;
  if not pg_temp.faalt(format($q$ insert into public.household_invites (household_id, token_hash) values (%L, repeat('a', 64)) $q$, h)) then raise exception 'KG-T06: uitnodiging direct aangemaakt'; end if;
  if not pg_temp.faalt(format($q$ update public.household_members set user_id = %L where id = %L $q$, u, current_setting('test.m_opa'))) then raise exception 'KG-T06: account direct gekoppeld'; end if;
  if not pg_temp.faalt(format($q$ update public.household_members set role = 'admin' where id = %L $q$, current_setting('test.m_opa'))) then raise exception 'KG-T06: rol direct gewijzigd'; end if;
  if not pg_temp.faalt(format($q$ update public.household_members set status = 'archived' where id = %L $q$, current_setting('test.m_opa'))) then raise exception 'KG-T06: status direct gewijzigd'; end if;
  if not pg_temp.faalt(format($q$ update public.household_members set household_id = gen_random_uuid() where id = %L $q$, current_setting('test.m_opa'))) then raise exception 'KG-T06: huishouden van een lid gewijzigd'; end if;
  if not pg_temp.faalt(format($q$ delete from public.household_members where id = %L $q$, current_setting('test.m_opa'))) then raise exception 'KG-T06: lid direct verwijderd'; end if;
  if not pg_temp.faalt(format($q$ delete from public.households where id = %L $q$, h)) then raise exception 'KG-T06: huishouden direct verwijderd'; end if;
  if not pg_temp.faalt(format($q$ update public.households set created_by = null where id = %L $q$, h)) then raise exception 'KG-T06: created_by gewijzigd'; end if;
  if not pg_temp.faalt($q$ update public.household_invites set revoked_at = now() $q$) then raise exception 'KG-T06: uitnodiging direct gewijzigd'; end if;
  if not pg_temp.faalt($q$ delete from public.household_invites $q$) then raise exception 'KG-T06: uitnodiging direct verwijderd'; end if;
  perform pg_temp.ok('KG-T06');
end $$;

-- KG-T07 Sanne accepteert de uitnodiging voor haar bestaande lid: geen tweede lid, rol beheerder.
select pg_temp.als('sanne');
do $$ begin
  if public.accept_invite(current_setting('test.tok_sanne')) <> current_setting('test.h1')::uuid then raise exception 'KG-T07: verkeerd huishouden'; end if;
  if (select count(*) from public.household_members) <> 4 then raise exception 'KG-T07: er is een extra lid ontstaan'; end if;
  if not exists (select 1 from public.household_members where id = current_setting('test.m_sanne')::uuid
                 and user_id = (select auth.uid()) and role = 'admin' and linked_at is not null)
    then raise exception 'KG-T07: account niet als beheerder aan het bestaande lid gekoppeld'; end if;
  if (select count(*) from public.households) <> 1 then raise exception 'KG-T07: Sanne ziet H1 niet'; end if;
  if (select count(*) from public.household_invites) <> 3 then raise exception 'KG-T07: beheerder ziet de uitnodigingen niet'; end if;
  perform pg_temp.ok('KG-T07');
end $$;

-- KG-T08 Een uitnodiging werkt precies één keer; een onbekende of misvormde token werkt niet.
select pg_temp.als('kees');
do $$ begin
  if not pg_temp.faalt(format($q$ select public.accept_invite(%L, 'Kees') $q$, current_setting('test.tok_sanne'))) then raise exception 'KG-T08: gebruikte uitnodiging werkt nog'; end if;
  if not pg_temp.faalt(format($q$ select public.accept_invite(%L, 'Kees') $q$, repeat('0', 64))) then raise exception 'KG-T08: onbekende token werkt'; end if;
  if not pg_temp.faalt($q$ select public.accept_invite('niet-hex', 'Kees') $q$) then raise exception 'KG-T08: misvormde token werkt'; end if;
  if not pg_temp.faalt($q$ select public.accept_invite(null, 'Kees') $q$) then raise exception 'KG-T08: lege token werkt'; end if;
  if pg_temp.aantal('select 1 from public.households') <> 0 then raise exception 'KG-T08: Kees kreeg toegang via een ongeldige uitnodiging'; end if;
  perform pg_temp.ok('KG-T08');
end $$;

-- KG-T09 Verlopen en ingetrokken uitnodigingen werken niet; intrekken mag alleen beheer.
select pg_temp.als('bas');
select set_config('test.tok_oud', public.create_invite(current_setting('test.h1')::uuid), true);
select set_config('test.tok_weg', public.create_invite(current_setting('test.h1')::uuid, current_setting('test.m_opa')::uuid), true);
reset role;
update public.household_invites set created_at = now() - interval '9 days', expires_at = now() - interval '2 days'
  where token_hash = encode(extensions.digest(current_setting('test.tok_oud'), 'sha256'), 'hex');
select set_config('test.inv_weg', (select id::text from public.household_invites
  where token_hash = encode(extensions.digest(current_setting('test.tok_weg'), 'sha256'), 'hex')), true);
set local role authenticated;
select pg_temp.als('kees');
do $$ begin
  if not pg_temp.faalt(format($q$ select public.revoke_invite(%L) $q$, current_setting('test.inv_weg'))) then raise exception 'KG-T09: niet-lid trekt een uitnodiging in'; end if;
end $$;
select pg_temp.als('bas');
select public.revoke_invite(current_setting('test.inv_weg')::uuid);
select pg_temp.als('kees');
do $$ begin
  if not pg_temp.faalt(format($q$ select public.accept_invite(%L, 'Kees') $q$, current_setting('test.tok_oud'))) then raise exception 'KG-T09: verlopen uitnodiging werkt'; end if;
  if not pg_temp.faalt(format($q$ select public.accept_invite(%L, 'Kees') $q$, current_setting('test.tok_weg'))) then raise exception 'KG-T09: ingetrokken uitnodiging werkt'; end if;
  if pg_temp.aantal('select 1 from public.households') <> 0 then raise exception 'KG-T09: Kees kreeg toegang'; end if;
  perform pg_temp.ok('KG-T09');
end $$;

-- KG-T10 Beperkingen bij uitnodigen: geen kind, geen eigenaar, geen gekoppeld lid, geldigheid 1-30
-- dagen; alleen een eigenaar nodigt uit als beheerder.
select pg_temp.als('bas');
do $$ declare h text := current_setting('test.h1'); begin
  if not pg_temp.faalt(format($q$ select public.create_invite(%L, %L) $q$, h, current_setting('test.m_lynn'))) then raise exception 'KG-T10: uitnodiging voor een kind'; end if;
  if not pg_temp.faalt(format($q$ select public.create_invite(%L, null, 'owner') $q$, h)) then raise exception 'KG-T10: uitnodiging als eigenaar'; end if;
  if not pg_temp.faalt(format($q$ select public.create_invite(%L, %L) $q$, h, current_setting('test.m_sanne'))) then raise exception 'KG-T10: uitnodiging voor een al gekoppeld lid'; end if;
  if not pg_temp.faalt(format($q$ select public.create_invite(%L, null, 'member', 0) $q$, h)) then raise exception 'KG-T10: geldigheid 0 dagen'; end if;
  if not pg_temp.faalt(format($q$ select public.create_invite(%L, null, 'member', 31) $q$, h)) then raise exception 'KG-T10: geldigheid 31 dagen'; end if;
  if not pg_temp.faalt(format($q$ select public.create_invite(%L, gen_random_uuid()) $q$, h)) then raise exception 'KG-T10: uitnodiging voor een onbekend lid'; end if;
end $$;
select pg_temp.als('sanne');
do $$ begin
  if not pg_temp.faalt(format($q$ select public.create_invite(%L, null, 'admin') $q$, current_setting('test.h1'))) then raise exception 'KG-T10: beheerder nodigt uit als beheerder'; end if;
  perform pg_temp.ok('KG-T10');
end $$;

-- KG-T11 Kees wordt via de algemene uitnodiging nieuw lid, met alleen gewone rechten.
select pg_temp.als('kees');
select set_config('test.h_kees', public.accept_invite(current_setting('test.tok_kees'), 'Kees')::text, true);
select set_config('test.m_kees', (select id::text from public.household_members m
  where m.household_id = current_setting('test.h_kees')::uuid and m.user_id = auth.uid()), true);
do $$ declare h text := current_setting('test.h1'); begin
  if current_setting('test.m_kees', true) is null or current_setting('test.m_kees') = '' then raise exception 'KG-T11: Kees is geen lid geworden'; end if;
  if (select role from public.household_members where id = current_setting('test.m_kees')::uuid) <> 'member' then raise exception 'KG-T11: Kees heeft een beheerrol'; end if;
  if pg_temp.aantal('select 1 from public.household_members') <> 5 then raise exception 'KG-T11: Kees ziet niet alle 5 leden'; end if;
  if pg_temp.aantal('select id from public.household_invites') <> 0 then raise exception 'KG-T11: gewoon lid ziet uitnodigingen'; end if;
  if not pg_temp.faalt(format($q$ select public.add_member(%L, 'X', 'adult') $q$, h)) then raise exception 'KG-T11: gewoon lid voegt een lid toe'; end if;
  if not pg_temp.faalt(format($q$ select public.create_invite(%L) $q$, h)) then raise exception 'KG-T11: gewoon lid nodigt uit'; end if;
  if not pg_temp.faalt(format($q$ select public.set_member_role(%L, %L, 'admin') $q$, h, current_setting('test.m_kees'))) then raise exception 'KG-T11: gewoon lid wijzigt een rol'; end if;
  if not pg_temp.faalt(format($q$ select public.archive_member(%L, %L) $q$, h, current_setting('test.m_lynn'))) then raise exception 'KG-T11: gewoon lid archiveert'; end if;
  if pg_temp.geraakt(format($q$ update public.households set name = 'Kees' where id = %L $q$, h)) <> 0 then raise exception 'KG-T11: gewoon lid wijzigt de huishoudnaam'; end if;
  if pg_temp.geraakt(format($q$ update public.household_members set display_name = 'Lynnie' where id = %L $q$, current_setting('test.m_lynn'))) <> 0 then raise exception 'KG-T11: gewoon lid wijzigt een ander lid'; end if;
  if pg_temp.geraakt(format($q$ update public.household_members set display_name = 'Kees K', color = '#336699' where id = %L $q$, current_setting('test.m_kees'))) <> 1 then raise exception 'KG-T11: lid kan eigen naam niet aanpassen'; end if;
  if not pg_temp.faalt(format($q$ update public.household_members set kind = 'child' where id = %L $q$, current_setting('test.m_kees'))) then raise exception 'KG-T11: lid wijzigt eigen soort'; end if;
  if not pg_temp.faalt(format($q$ select public.accept_invite(%L, 'Kees') $q$, current_setting('test.tok_mira'))) then raise exception 'KG-T11: lid accepteert een tweede uitnodiging voor hetzelfde huishouden'; end if;
  perform pg_temp.ok('KG-T11');
end $$;

-- KG-T12 Mira: eigenaar van H2 en gewoon lid van H1. Rechten gelden per huishouden.
select pg_temp.als('mira');
select set_config('test.h2', public.create_household('Bakker', 'Mira')::text, true);
select set_config('test.m_noor', public.add_member(current_setting('test.h2')::uuid, 'Noor', 'child')::text, true);
select set_config('test.tok_h2', public.create_invite(current_setting('test.h2')::uuid), true);
select public.accept_invite(current_setting('test.tok_mira'), 'Mira');
do $$ begin
  if (select count(*) from public.households) <> 2 then raise exception 'KG-T12: Mira ziet niet beide huishoudens'; end if;
  if (select count(*) from public.household_members where household_id = current_setting('test.h1')::uuid) <> 6 then raise exception 'KG-T12: Mira ziet de leden van H1 niet'; end if;
  if (select count(*) from public.household_members where household_id = current_setting('test.h2')::uuid) <> 2 then raise exception 'KG-T12: Mira ziet de leden van H2 niet'; end if;
  if (select count(*) from public.household_members where user_id = (select auth.uid())) <> 2 then raise exception 'KG-T12: Mira heeft niet één lid per huishouden'; end if;
  if pg_temp.aantal(format('select id from public.household_invites where household_id = %L', current_setting('test.h1'))) <> 0 then raise exception 'KG-T12: Mira (lid in H1) ziet uitnodigingen van H1'; end if;
  if pg_temp.aantal(format('select id from public.household_invites where household_id = %L', current_setting('test.h2'))) <> 1 then raise exception 'KG-T12: Mira (eigenaar H2) ziet haar uitnodiging niet'; end if;
  if not pg_temp.faalt(format($q$ select public.create_invite(%L) $q$, current_setting('test.h1'))) then raise exception 'KG-T12: eigenaarschap van H2 geeft rechten in H1'; end if;
  perform pg_temp.ok('KG-T12');
end $$;

-- KG-T13 Huishoudens zien elkaars gegevens niet, en verwijzingen over de grens zijn onmogelijk.
do $$ declare h1 text := current_setting('test.h1'); h2 text := current_setting('test.h2'); wie text; begin
  foreach wie in array array['bas', 'sanne', 'kees'] loop
    perform pg_temp.als(wie);
    if pg_temp.aantal(format('select 1 from public.households where id = %L', h2)) <> 0 then raise exception 'KG-T13: % ziet huishouden H2', wie; end if;
    if pg_temp.aantal(format('select 1 from public.household_members where household_id = %L', h2)) <> 0 then raise exception 'KG-T13: % ziet leden van H2', wie; end if;
    if pg_temp.aantal(format('select id from public.household_invites where household_id = %L', h2)) <> 0 then raise exception 'KG-T13: % ziet uitnodigingen van H2', wie; end if;
    if pg_temp.geraakt(format($q$ update public.households set name = 'Over de grens' where id = %L $q$, h2)) <> 0 then raise exception 'KG-T13: % wijzigt H2', wie; end if;
  end loop;
  perform pg_temp.als('bas');
  if not pg_temp.faalt(format($q$ select public.create_invite(%L, %L) $q$, h1, current_setting('test.m_noor'))) then raise exception 'KG-T13: uitnodiging in H1 voor een lid van H2'; end if;
  if not pg_temp.faalt(format($q$ select public.add_member(%L, 'X', 'adult') $q$, h2)) then raise exception 'KG-T13: Bas voegt een lid toe aan H2'; end if;
  if not pg_temp.faalt(format($q$ select public.archive_member(%L, %L) $q$, h2, current_setting('test.m_noor'))) then raise exception 'KG-T13: Bas archiveert een lid van H2'; end if;
  if not pg_temp.faalt(format($q$ select public.archive_member(%L, %L) $q$, h1, current_setting('test.m_noor'))) then raise exception 'KG-T13: lid van H2 te archiveren via H1'; end if;
  perform pg_temp.als('mira');
  if pg_temp.aantal(format('select 1 from public.household_members where household_id = %L and display_name = %L', h2, 'Noor')) <> 1 then raise exception 'KG-T13: Noor is aangetast'; end if;
end $$;
reset role;
do $$ begin
  -- Ook buiten de functies om (als postgres) weigert de database een uitnodiging die naar een lid van
  -- een ander huishouden wijst (samengestelde foreign key).
  if not pg_temp.faalt(format($q$ insert into public.household_invites (household_id, member_id, token_hash) values (%L, %L, repeat('b', 64)) $q$,
       current_setting('test.h1'), current_setting('test.m_noor'))) then raise exception 'KG-T13: database accepteert een verwijzing over de huishoudgrens'; end if;
  perform pg_temp.ok('KG-T13');
end $$;
set local role authenticated;

-- KG-T14 Rollen: alleen de eigenaar wijzigt rollen; beheer vraagt een actieve volwassene met account.
select pg_temp.als('sanne');
do $$ begin
  if not pg_temp.faalt(format($q$ select public.set_member_role(%L, %L, 'admin') $q$, current_setting('test.h1'), current_setting('test.m_kees'))) then raise exception 'KG-T14: beheerder wijzigt rollen'; end if;
end $$;
select pg_temp.als('bas');
do $$ declare h text := current_setting('test.h1'); begin
  if not pg_temp.faalt(format($q$ select public.set_member_role(%L, %L, 'admin') $q$, h, current_setting('test.m_lynn'))) then raise exception 'KG-T14: kind zonder account wordt beheerder'; end if;
  if not pg_temp.faalt(format($q$ select public.set_member_role(%L, %L, 'admin') $q$, h, current_setting('test.m_opa'))) then raise exception 'KG-T14: lid zonder account wordt beheerder'; end if;
  if not pg_temp.faalt(format($q$ select public.set_member_role(%L, %L, 'owner') $q$, h, current_setting('test.m_kees'))) then raise exception 'KG-T14: eigenaar via rolwijziging'; end if;
  if not pg_temp.faalt(format($q$ select public.set_member_role(%L, %L, 'admin') $q$, h, current_setting('test.m_noor'))) then raise exception 'KG-T14: rol van een lid van H2 via H1'; end if;
  perform public.set_member_role(h::uuid, current_setting('test.m_kees')::uuid, 'admin');
end $$;
select pg_temp.als('kees');
do $$ begin
  if pg_temp.aantal('select id from public.household_invites') = 0 then raise exception 'KG-T14: nieuwe beheerder ziet geen uitnodigingen'; end if;
end $$;
select pg_temp.als('bas');
select public.set_member_role(current_setting('test.h1')::uuid, current_setting('test.m_kees')::uuid, 'member');
select pg_temp.als('kees');
do $$ begin
  if pg_temp.aantal('select id from public.household_invites') <> 0 then raise exception 'KG-T14: teruggezette beheerder ziet nog uitnodigingen'; end if;
  perform pg_temp.ok('KG-T14');
end $$;

-- KG-T15 Archiveren trekt toegang direct in; een eigenaar, jezelf of (als beheerder) een andere
-- beheerder kun je niet archiveren.
select pg_temp.als('sanne');
do $$ declare h text := current_setting('test.h1'); begin
  if not pg_temp.faalt(format($q$ select public.archive_member(%L, %L) $q$, h, (select id from public.household_members where household_id = h::uuid and role = 'owner'))) then raise exception 'KG-T15: eigenaar gearchiveerd'; end if;
  if not pg_temp.faalt(format($q$ select public.archive_member(%L, %L) $q$, h, current_setting('test.m_sanne'))) then raise exception 'KG-T15: jezelf archiveren'; end if;
  perform public.archive_member(h::uuid, current_setting('test.m_kees')::uuid);
end $$;
select pg_temp.als('kees');
do $$ begin
  if pg_temp.aantal('select 1 from public.households') <> 0 then raise exception 'KG-T15: gearchiveerd lid ziet het huishouden nog'; end if;
  if pg_temp.aantal('select 1 from public.household_members') <> 0 then raise exception 'KG-T15: gearchiveerd lid ziet de leden nog'; end if;
  if pg_temp.geraakt(format($q$ update public.household_members set display_name = 'Terug' where id = %L $q$, current_setting('test.m_kees'))) <> 0 then raise exception 'KG-T15: gearchiveerd lid wijzigt zichzelf'; end if;
end $$;
reset role;
do $$ begin
  if (select status from public.household_members where id = current_setting('test.m_kees')::uuid) <> 'archived' then raise exception 'KG-T15: status niet gearchiveerd'; end if;
end $$;
set local role authenticated;
do $$ begin
  perform pg_temp.ok('KG-T15');
end $$;

-- KG-T16 Zichtbaarheid (private.can_read) op een testtabel die alleen in deze transactie bestaat.
reset role;
create table public.kg_fixture (
  household_id uuid not null, eigenaar uuid, zicht public.visibility not null, publiek uuid[], tekst text not null
);
alter table public.kg_fixture enable row level security;
grant select on public.kg_fixture to authenticated;
create policy kg_fixture_select on public.kg_fixture for select to authenticated
  using ((select private.can_read(household_id, zicht, eigenaar, publiek)));
insert into public.kg_fixture (household_id, eigenaar, zicht, publiek, tekst)
select current_setting('test.h1')::uuid, b.id, v.zicht::public.visibility, v.publiek, v.tekst
from (select id from public.household_members where household_id = current_setting('test.h1')::uuid and user_id = current_setting('test.bas')::uuid) b,
     (values ('household', null::uuid[], 'h1-iedereen'),
             ('private',   null::uuid[], 'h1-bas-prive'),
             ('members',   array[current_setting('test.m_sanne')::uuid], 'h1-bas-sanne'),
             ('members',   array[current_setting('test.m_kees')::uuid], 'h1-bas-kees')) v(zicht, publiek, tekst);
insert into public.kg_fixture (household_id, eigenaar, zicht, publiek, tekst) values
  (current_setting('test.h1')::uuid, current_setting('test.m_kees')::uuid, 'private', null, 'h1-kees-prive');
insert into public.kg_fixture (household_id, eigenaar, zicht, publiek, tekst)
select current_setting('test.h2')::uuid, m.id, v.zicht::public.visibility, null, v.tekst
from (select id from public.household_members where household_id = current_setting('test.h2')::uuid and role = 'owner') m,
     (values ('household', 'h2-iedereen'), ('private', 'h2-mira-prive')) v(zicht, tekst);
set local role authenticated;
do $$
declare
  verwacht jsonb := jsonb_build_object(
    'bas',   jsonb_build_array('h1-bas-kees', 'h1-bas-prive', 'h1-bas-sanne', 'h1-iedereen'),
    'sanne', jsonb_build_array('h1-bas-sanne', 'h1-iedereen'),
    'kees',  jsonb_build_array(),
    'mira',  jsonb_build_array('h1-iedereen', 'h2-iedereen', 'h2-mira-prive'),
    'eve',   jsonb_build_array());
  wie text; gezien jsonb;
begin
  for wie in select jsonb_object_keys(verwacht) loop
    perform pg_temp.als(wie);
    select coalesce(jsonb_agg(tekst order by tekst collate "C"), '[]'::jsonb) into gezien from public.kg_fixture;
    if gezien <> verwacht -> wie then raise exception 'KG-T16: % ziet % in plaats van %', wie, gezien, verwacht -> wie; end if;
  end loop;
  perform pg_temp.ok('KG-T16');
end $$;

-- KG-T17 Eigendom: de laatste eigenaar kan niet weg; overdragen alleen aan een actieve volwassene met
-- account; daarna kan de oud-eigenaar vertrekken en verliest hij de toegang. Het lid blijft bestaan.
select pg_temp.als('bas');
do $$ declare h text := current_setting('test.h1'); begin
  if not pg_temp.faalt(format($q$ select public.leave_household(%L) $q$, h)) then raise exception 'KG-T17: laatste eigenaar vertrekt'; end if;
  if not pg_temp.faalt(format($q$ select public.transfer_ownership(%L, %L) $q$, h, current_setting('test.m_lynn'))) then raise exception 'KG-T17: eigendom naar een kind'; end if;
  if not pg_temp.faalt(format($q$ select public.transfer_ownership(%L, %L) $q$, h, current_setting('test.m_opa'))) then raise exception 'KG-T17: eigendom naar een lid zonder account'; end if;
  if not pg_temp.faalt(format($q$ select public.transfer_ownership(%L, %L) $q$, h, current_setting('test.m_kees'))) then raise exception 'KG-T17: eigendom naar een gearchiveerd lid'; end if;
  if not pg_temp.faalt(format($q$ select public.transfer_ownership(%L, %L) $q$, h, current_setting('test.m_noor'))) then raise exception 'KG-T17: eigendom naar een lid van H2'; end if;
end $$;
select pg_temp.als('sanne');
do $$ begin
  if not pg_temp.faalt(format($q$ select public.transfer_ownership(%L, %L) $q$, current_setting('test.h1'), current_setting('test.m_sanne'))) then raise exception 'KG-T17: beheerder draagt eigendom over'; end if;
end $$;
select pg_temp.als('bas');
select public.transfer_ownership(current_setting('test.h1')::uuid, current_setting('test.m_sanne')::uuid);
select public.leave_household(current_setting('test.h1')::uuid);
do $$ begin
  if pg_temp.aantal('select 1 from public.households') <> 0 then raise exception 'KG-T17: oud-eigenaar ziet H1 na vertrek'; end if;
end $$;
select pg_temp.als('sanne');
do $$ begin
  if (select role from public.household_members where id = current_setting('test.m_sanne')::uuid) <> 'owner' then raise exception 'KG-T17: Sanne is geen eigenaar'; end if;
  if not exists (select 1 from public.household_members where household_id = current_setting('test.h1')::uuid
                 and display_name = 'Bas' and user_id is null and status = 'active' and role = 'member')
    then raise exception 'KG-T17: het lid Bas bestaat niet meer zonder account'; end if;
  if not pg_temp.faalt(format($q$ select public.leave_household(%L) $q$, current_setting('test.h1'))) then raise exception 'KG-T17: nieuwe laatste eigenaar vertrekt'; end if;
end $$;
reset role;
do $$ begin
  -- Ook buiten de functies om: een account van de laatste eigenaar verwijderen of de rol direct
  -- weghalen laat het huishouden niet zonder eigenaar.
  if not pg_temp.faalt(format($q$ delete from auth.users where id = %L $q$, current_setting('test.sanne'))) then raise exception 'KG-T17: account van de laatste eigenaar verwijderd'; end if;
  if not pg_temp.faalt(format($q$ set constraints all immediate; update public.household_members set role = 'member' where id = %L $q$, current_setting('test.m_sanne'))) then raise exception 'KG-T17: huishouden zonder eigenaar'; end if;
  set constraints all deferred;
  perform pg_temp.ok('KG-T17');
end $$;
set local role authenticated;

-- KG-T18 Profielen: alleen je eigen profiel.
select pg_temp.als('bas');
insert into public.profiles (user_id, display_name) values (current_setting('test.bas')::uuid, 'Bas');
do $$ begin
  if not pg_temp.faalt(format($q$ insert into public.profiles (user_id, display_name) values (%L, 'Nep') $q$, current_setting('test.eve'))) then raise exception 'KG-T18: profiel voor een ander aangemaakt'; end if;
end $$;
select pg_temp.als('eve');
insert into public.profiles (user_id, display_name) values (current_setting('test.eve')::uuid, 'Eve');
do $$ begin
  if pg_temp.aantal('select 1 from public.profiles') <> 1 then raise exception 'KG-T18: Eve ziet andermans profiel'; end if;
  if pg_temp.geraakt(format($q$ update public.profiles set display_name = 'Gekaapt' where user_id = %L $q$, current_setting('test.bas'))) <> 0 then raise exception 'KG-T18: Eve wijzigt het profiel van Bas'; end if;
  if pg_temp.geraakt($q$ update public.profiles set display_name = 'Eva' $q$) <> 1 then raise exception 'KG-T18: Eve kan haar eigen profiel niet aanpassen'; end if;
  if not pg_temp.faalt(format($q$ update public.profiles set user_id = %L $q$, current_setting('test.bas'))) then raise exception 'KG-T18: profiel aan een ander account gehangen'; end if;
  if not pg_temp.faalt($q$ delete from public.profiles $q$) then raise exception 'KG-T18: profiel direct verwijderd'; end if;
  perform pg_temp.ok('KG-T18');
end $$;

-- KG-T19 Zonder geldige sessie (geen sub) werkt geen enkele functie.
select set_config('request.jwt.claims', json_build_object('role', 'authenticated')::text, true);
do $$ begin
  if not pg_temp.faalt($q$ select public.create_household('Leeg', 'Niemand') $q$) then raise exception 'KG-T19: huishouden zonder ingelogde gebruiker'; end if;
  if not pg_temp.faalt(format($q$ select public.accept_invite(%L, 'Niemand') $q$, current_setting('test.tok_h2'))) then raise exception 'KG-T19: uitnodiging zonder ingelogde gebruiker'; end if;
  if pg_temp.aantal('select 1 from public.households') <> 0 then raise exception 'KG-T19: zonder sessie zichtbaar'; end if;
  perform pg_temp.ok('KG-T19');
end $$;

-- KG-T20 anon (niet ingelogd via de API) heeft op geen tabel of functie rechten.
set local role anon;
do $$ declare t text; begin
  foreach t in array array['public.profiles', 'public.households', 'public.household_members', 'public.household_invites'] loop
    if not pg_temp.faalt('select 1 from ' || t) then raise exception 'KG-T20: anon leest %', t; end if;
  end loop;
  if not pg_temp.faalt($q$ select public.create_household('Anon', 'Anon') $q$) then raise exception 'KG-T20: anon maakt een huishouden'; end if;
  if not pg_temp.faalt(format($q$ select public.accept_invite(%L, 'Anon') $q$, current_setting('test.tok_h2'))) then raise exception 'KG-T20: anon accepteert een uitnodiging'; end if;
  if not pg_temp.faalt(format($q$ select private.is_active_member(%L) $q$, current_setting('test.h1'))) then raise exception 'KG-T20: anon roept een private functie aan'; end if;
  perform pg_temp.ok('KG-T20');
end $$;
set local role authenticated;

-- KG-T21 Catalogus: RLS op elke tabel, geen security definer in public, private-functies met vast
-- search_path, anon zonder tabelrechten, authenticated zonder insert/delete op de kerntabellen.
reset role;
do $$ declare r record; begin
  for r in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity loop
    raise exception 'KG-T21: tabel public.% heeft geen RLS', r.relname;
  end loop;
  for r in select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.prosecdef loop
    raise exception 'KG-T21: functie public.% is security definer', r.proname;
  end loop;
  for r in select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname in ('public', 'private') and p.prokind = 'f'
             and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%') loop
    raise exception 'KG-T21: functie % zonder vast search_path', r.proname;
  end loop;
  for r in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind in ('r', 'v')
             and (has_table_privilege('anon', c.oid, 'select') or has_table_privilege('anon', c.oid, 'insert')
                  or has_table_privilege('anon', c.oid, 'update') or has_table_privilege('anon', c.oid, 'delete')) loop
    raise exception 'KG-T21: anon heeft rechten op public.%', r.relname;
  end loop;
  for r in select t from unnest(array['public.profiles', 'public.households', 'public.household_members', 'public.household_invites']) t
           where has_table_privilege('authenticated', t, 'delete') or has_table_privilege('authenticated', t, 'truncate')
              or (t <> 'public.profiles' and has_table_privilege('authenticated', t, 'insert')) loop
    raise exception 'KG-T21: authenticated mag schrijven buiten de functies om op %', r.t;
  end loop;
  if has_schema_privilege('anon', 'private', 'usage') then raise exception 'KG-T21: anon heeft toegang tot schema private'; end if;
  perform pg_temp.ok('KG-T21');
end $$;

-- KG-T22 Een kind kan geen account krijgen (KG-1), ook niet buiten de functies om.
do $$ begin
  if not pg_temp.faalt(format($q$ update public.household_members set user_id = %L, linked_at = now() where id = %L $q$,
       current_setting('test.eve'), current_setting('test.m_lynn'))) then raise exception 'KG-T22: kind-lid aan een account gekoppeld'; end if;
  perform pg_temp.ok('KG-T22');
end $$;

select 'KG-RLS-tests geslaagd: ' || current_setting('test.aantal') || ' van 22' as resultaat;

rollback;
