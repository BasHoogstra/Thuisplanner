-- Thuisplanner (map komtgoed) KG-1 + KG-5B (+ herstelronde 1) + KG-5C: RLS- en rechtentestmatrix. Alles in één transactie die aan het eind wordt
-- teruggedraaid: er blijft niets achter. Alleen lokaal (komtgoed/supabase/tests/run.sh); nooit op
-- een gedeelde of productiedatabase draaien. Synthetische accounts op @test.invalid.
--
-- Personen:
--   Anna    eigenaar van huishouden H1 (De Wit)
--   Lisa    volwassen lid van H1 zonder account; krijgt via een uitnodiging een account en beheer
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

select set_config('test.anna',   gen_random_uuid()::text, true);
select set_config('test.lisa', gen_random_uuid()::text, true);
select set_config('test.kees',  gen_random_uuid()::text, true);
select set_config('test.mira',  gen_random_uuid()::text, true);
select set_config('test.eve',   gen_random_uuid()::text, true);
insert into auth.users (id, email) values
  (current_setting('test.anna')::uuid,   'anna@test.invalid'),
  (current_setting('test.lisa')::uuid, 'lisa@test.invalid'),
  (current_setting('test.kees')::uuid,  'kees@test.invalid'),
  (current_setting('test.mira')::uuid,  'mira@test.invalid'),
  (current_setting('test.eve')::uuid,   'eve@test.invalid');

set local role authenticated;

-- KG-T01 Huishouden aanmaken: Anna wordt eigenaar met account.
select pg_temp.als('anna');
select set_config('test.h1', public.create_household('De Wit', 'Anna')::text, true);
do $$ begin
  if (select count(*) from public.households) <> 1 then raise exception 'KG-T01: Anna ziet haar huishouden niet'; end if;
  if not exists (select 1 from public.household_members m join public.my_memberships() me on me.member_id = m.id
                 where m.role = 'owner' and m.kind = 'adult' and m.status = 'active' and m.has_account and m.linked_at is not null)
    then raise exception 'KG-T01: Anna is geen actieve eigenaar met account'; end if;
  perform pg_temp.ok('KG-T01');
end $$;

-- KG-T02 Ongeldige invoer wordt geweigerd.
do $$ begin
  if not pg_temp.faalt($q$ select public.create_household('', 'Anna') $q$) then raise exception 'KG-T02: lege huishoudnaam toegestaan'; end if;
  if not pg_temp.faalt($q$ select public.create_household('X', null) $q$) then raise exception 'KG-T02: huishouden zonder eigen naam toegestaan'; end if;
  if not pg_temp.faalt($q$ select public.create_household('X', repeat('a', 81)) $q$) then raise exception 'KG-T02: naam van 81 tekens toegestaan'; end if;
  if not pg_temp.faalt(format($q$ select public.add_member(%L, 'X', 'baby') $q$, current_setting('test.h1'))) then raise exception 'KG-T02: onbekende soort lid toegestaan'; end if;
  perform pg_temp.ok('KG-T02');
end $$;

-- KG-T03 Leden zonder account: Lisa en Opa (volwassen), Lynn (kind).
select set_config('test.m_lisa', public.add_member(current_setting('test.h1')::uuid, 'Lisa', 'adult')::text, true);
select set_config('test.m_lynn',  public.add_member(current_setting('test.h1')::uuid, 'Lynn', 'child')::text, true);
select set_config('test.m_opa',   public.add_member(current_setting('test.h1')::uuid, 'Opa', 'adult')::text, true);
do $$ begin
  if (select count(*) from public.household_members) <> 4 then raise exception 'KG-T03: verwacht 4 leden'; end if;
  if (select count(*) from public.household_members where not has_account) <> 3 then raise exception 'KG-T03: verwacht 3 leden zonder account'; end if;
  if exists (select 1 from public.household_members where not has_account and role <> 'member') then raise exception 'KG-T03: lid zonder account heeft beheerrol'; end if;
  if (select kind from public.household_members where id = current_setting('test.m_lynn')::uuid) <> 'child' then raise exception 'KG-T03: Lynn is geen kind-lid'; end if;
  perform pg_temp.ok('KG-T03');
end $$;

-- KG-T04 Uitnodigingen maken. De token komt één keer terug; de hash is via de API niet leesbaar.
select set_config('test.tok_lisa', public.create_invite(current_setting('test.h1')::uuid, current_setting('test.m_lisa')::uuid, 'admin'), true);
select set_config('test.tok_kees',  public.create_invite(current_setting('test.h1')::uuid), true);
select set_config('test.tok_mira',  public.create_invite(current_setting('test.h1')::uuid), true);
do $$ begin
  if current_setting('test.tok_lisa') !~ '^[0-9a-f]{64}$' then raise exception 'KG-T04: token heeft geen 256 bit hex-vorm'; end if;
  if current_setting('test.tok_lisa') = current_setting('test.tok_kees') then raise exception 'KG-T04: tokens niet uniek'; end if;
  if (select count(*) from public.household_invites) <> 3 then raise exception 'KG-T04: eigenaar ziet zijn uitnodigingen niet'; end if;
  if not pg_temp.faalt($q$ select token_hash from public.household_invites $q$) then raise exception 'KG-T04: tokenhash leesbaar via de API'; end if;
  if not pg_temp.faalt($q$ select * from public.household_invites $q$) then raise exception 'KG-T04: select * op uitnodigingen geeft de tokenhash prijs'; end if;
  perform pg_temp.ok('KG-T04');
end $$;
-- De token staat nergens leesbaar opgeslagen (als postgres gecontroleerd).
reset role;
do $$ begin
  if exists (select 1 from public.household_invites where token_hash = current_setting('test.tok_lisa')) then
    raise exception 'KG-T04: token zelf opgeslagen in plaats van een hash'; end if;
  if not exists (select 1 from public.household_invites
                 where token_hash = encode(extensions.digest(current_setting('test.tok_lisa'), 'sha256'), 'hex')) then
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
select pg_temp.als('anna');
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

-- KG-T07 Lisa accepteert de uitnodiging voor haar bestaande lid: geen tweede lid, rol beheerder.
select pg_temp.als('lisa');
do $$ begin
  if public.accept_invite(current_setting('test.tok_lisa')) <> current_setting('test.h1')::uuid then raise exception 'KG-T07: verkeerd huishouden'; end if;
  if (select count(*) from public.household_members) <> 4 then raise exception 'KG-T07: er is een extra lid ontstaan'; end if;
  if not exists (select 1 from public.household_members where id = current_setting('test.m_lisa')::uuid
                 and id in (select member_id from public.my_memberships()) and has_account and role = 'admin' and linked_at is not null)
    then raise exception 'KG-T07: account niet als beheerder aan het bestaande lid gekoppeld'; end if;
  if (select count(*) from public.households) <> 1 then raise exception 'KG-T07: Lisa ziet H1 niet'; end if;
  if (select count(*) from public.household_invites) <> 3 then raise exception 'KG-T07: beheerder ziet de uitnodigingen niet'; end if;
  perform pg_temp.ok('KG-T07');
end $$;

-- KG-T08 Een uitnodiging werkt precies één keer; een onbekende of misvormde token werkt niet.
select pg_temp.als('kees');
do $$ begin
  if not pg_temp.faalt(format($q$ select public.accept_invite(%L, 'Kees') $q$, current_setting('test.tok_lisa'))) then raise exception 'KG-T08: gebruikte uitnodiging werkt nog'; end if;
  if not pg_temp.faalt(format($q$ select public.accept_invite(%L, 'Kees') $q$, repeat('0', 64))) then raise exception 'KG-T08: onbekende token werkt'; end if;
  if not pg_temp.faalt($q$ select public.accept_invite('niet-hex', 'Kees') $q$) then raise exception 'KG-T08: misvormde token werkt'; end if;
  if not pg_temp.faalt($q$ select public.accept_invite(null, 'Kees') $q$) then raise exception 'KG-T08: lege token werkt'; end if;
  if pg_temp.aantal('select 1 from public.households') <> 0 then raise exception 'KG-T08: Kees kreeg toegang via een ongeldige uitnodiging'; end if;
  perform pg_temp.ok('KG-T08');
end $$;

-- KG-T09 Verlopen en ingetrokken uitnodigingen werken niet; intrekken mag alleen beheer.
select pg_temp.als('anna');
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
select pg_temp.als('anna');
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
select pg_temp.als('anna');
do $$ declare h text := current_setting('test.h1'); begin
  if not pg_temp.faalt(format($q$ select public.create_invite(%L, %L) $q$, h, current_setting('test.m_lynn'))) then raise exception 'KG-T10: uitnodiging voor een kind'; end if;
  if not pg_temp.faalt(format($q$ select public.create_invite(%L, null, 'owner') $q$, h)) then raise exception 'KG-T10: uitnodiging als eigenaar'; end if;
  if not pg_temp.faalt(format($q$ select public.create_invite(%L, %L) $q$, h, current_setting('test.m_lisa'))) then raise exception 'KG-T10: uitnodiging voor een al gekoppeld lid'; end if;
  if not pg_temp.faalt(format($q$ select public.create_invite(%L, null, 'member', 0) $q$, h)) then raise exception 'KG-T10: geldigheid 0 dagen'; end if;
  if not pg_temp.faalt(format($q$ select public.create_invite(%L, null, 'member', 31) $q$, h)) then raise exception 'KG-T10: geldigheid 31 dagen'; end if;
  if not pg_temp.faalt(format($q$ select public.create_invite(%L, gen_random_uuid()) $q$, h)) then raise exception 'KG-T10: uitnodiging voor een onbekend lid'; end if;
end $$;
select pg_temp.als('lisa');
do $$ begin
  if not pg_temp.faalt(format($q$ select public.create_invite(%L, null, 'admin') $q$, current_setting('test.h1'))) then raise exception 'KG-T10: beheerder nodigt uit als beheerder'; end if;
  perform pg_temp.ok('KG-T10');
end $$;

-- KG-T11 Kees wordt via de algemene uitnodiging nieuw lid, met alleen gewone rechten.
select pg_temp.als('kees');
select set_config('test.h_kees', public.accept_invite(current_setting('test.tok_kees'), 'Kees')::text, true);
select set_config('test.m_kees', (select member_id::text from public.my_memberships()
  where household_id = current_setting('test.h_kees')::uuid), true);
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
  if (select count(distinct household_id) from public.my_memberships()) <> 2 or (select count(*) from public.my_memberships()) <> 2 then raise exception 'KG-T12: Mira heeft niet één lid per huishouden'; end if;
  if pg_temp.aantal(format('select id from public.household_invites where household_id = %L', current_setting('test.h1'))) <> 0 then raise exception 'KG-T12: Mira (lid in H1) ziet uitnodigingen van H1'; end if;
  if pg_temp.aantal(format('select id from public.household_invites where household_id = %L', current_setting('test.h2'))) <> 1 then raise exception 'KG-T12: Mira (eigenaar H2) ziet haar uitnodiging niet'; end if;
  if not pg_temp.faalt(format($q$ select public.create_invite(%L) $q$, current_setting('test.h1'))) then raise exception 'KG-T12: eigenaarschap van H2 geeft rechten in H1'; end if;
  perform pg_temp.ok('KG-T12');
end $$;

-- KG-T13 Huishoudens zien elkaars gegevens niet, en verwijzingen over de grens zijn onmogelijk.
do $$ declare h1 text := current_setting('test.h1'); h2 text := current_setting('test.h2'); wie text; begin
  foreach wie in array array['anna', 'lisa', 'kees'] loop
    perform pg_temp.als(wie);
    if pg_temp.aantal(format('select 1 from public.households where id = %L', h2)) <> 0 then raise exception 'KG-T13: % ziet huishouden H2', wie; end if;
    if pg_temp.aantal(format('select 1 from public.household_members where household_id = %L', h2)) <> 0 then raise exception 'KG-T13: % ziet leden van H2', wie; end if;
    if pg_temp.aantal(format('select id from public.household_invites where household_id = %L', h2)) <> 0 then raise exception 'KG-T13: % ziet uitnodigingen van H2', wie; end if;
    if pg_temp.geraakt(format($q$ update public.households set name = 'Over de grens' where id = %L $q$, h2)) <> 0 then raise exception 'KG-T13: % wijzigt H2', wie; end if;
  end loop;
  perform pg_temp.als('anna');
  if not pg_temp.faalt(format($q$ select public.create_invite(%L, %L) $q$, h1, current_setting('test.m_noor'))) then raise exception 'KG-T13: uitnodiging in H1 voor een lid van H2'; end if;
  if not pg_temp.faalt(format($q$ select public.add_member(%L, 'X', 'adult') $q$, h2)) then raise exception 'KG-T13: Anna voegt een lid toe aan H2'; end if;
  if not pg_temp.faalt(format($q$ select public.archive_member(%L, %L) $q$, h2, current_setting('test.m_noor'))) then raise exception 'KG-T13: Anna archiveert een lid van H2'; end if;
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
select pg_temp.als('lisa');
do $$ begin
  if not pg_temp.faalt(format($q$ select public.set_member_role(%L, %L, 'admin') $q$, current_setting('test.h1'), current_setting('test.m_kees'))) then raise exception 'KG-T14: beheerder wijzigt rollen'; end if;
end $$;
select pg_temp.als('anna');
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
select pg_temp.als('anna');
select public.set_member_role(current_setting('test.h1')::uuid, current_setting('test.m_kees')::uuid, 'member');
select pg_temp.als('kees');
do $$ begin
  if pg_temp.aantal('select id from public.household_invites') <> 0 then raise exception 'KG-T14: teruggezette beheerder ziet nog uitnodigingen'; end if;
  perform pg_temp.ok('KG-T14');
end $$;

-- KG-T15 Archiveren trekt toegang direct in; een eigenaar, jezelf of (als beheerder) een andere
-- beheerder kun je niet archiveren.
select pg_temp.als('lisa');
do $$ declare h text := current_setting('test.h1'); begin
  if not pg_temp.faalt(format($q$ select public.archive_member(%L, %L) $q$, h, (select id from public.household_members where household_id = h::uuid and role = 'owner'))) then raise exception 'KG-T15: eigenaar gearchiveerd'; end if;
  if not pg_temp.faalt(format($q$ select public.archive_member(%L, %L) $q$, h, current_setting('test.m_lisa'))) then raise exception 'KG-T15: jezelf archiveren'; end if;
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
from (select id from public.household_members where household_id = current_setting('test.h1')::uuid and user_id = current_setting('test.anna')::uuid) b,
     (values ('household', null::uuid[], 'h1-iedereen'),
             ('private',   null::uuid[], 'h1-anna-prive'),
             ('members',   array[current_setting('test.m_lisa')::uuid], 'h1-anna-lisa'),
             ('members',   array[current_setting('test.m_kees')::uuid], 'h1-anna-kees')) v(zicht, publiek, tekst);
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
    'anna',   jsonb_build_array('h1-anna-kees', 'h1-anna-lisa', 'h1-anna-prive', 'h1-iedereen'),
    'lisa',  jsonb_build_array('h1-anna-lisa', 'h1-iedereen'),
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
-- account; daarna kan de oud-eigenaar vertrekken en verliest zij de toegang. Het lid blijft bestaan.
select pg_temp.als('anna');
do $$ declare h text := current_setting('test.h1'); begin
  if not pg_temp.faalt(format($q$ select public.leave_household(%L) $q$, h)) then raise exception 'KG-T17: laatste eigenaar vertrekt'; end if;
  if not pg_temp.faalt(format($q$ select public.transfer_ownership(%L, %L) $q$, h, current_setting('test.m_lynn'))) then raise exception 'KG-T17: eigendom naar een kind'; end if;
  if not pg_temp.faalt(format($q$ select public.transfer_ownership(%L, %L) $q$, h, current_setting('test.m_opa'))) then raise exception 'KG-T17: eigendom naar een lid zonder account'; end if;
  if not pg_temp.faalt(format($q$ select public.transfer_ownership(%L, %L) $q$, h, current_setting('test.m_kees'))) then raise exception 'KG-T17: eigendom naar een gearchiveerd lid'; end if;
  if not pg_temp.faalt(format($q$ select public.transfer_ownership(%L, %L) $q$, h, current_setting('test.m_noor'))) then raise exception 'KG-T17: eigendom naar een lid van H2'; end if;
end $$;
select pg_temp.als('lisa');
do $$ begin
  if not pg_temp.faalt(format($q$ select public.transfer_ownership(%L, %L) $q$, current_setting('test.h1'), current_setting('test.m_lisa'))) then raise exception 'KG-T17: beheerder draagt eigendom over'; end if;
end $$;
select pg_temp.als('anna');
select public.transfer_ownership(current_setting('test.h1')::uuid, current_setting('test.m_lisa')::uuid);
select public.leave_household(current_setting('test.h1')::uuid);
do $$ begin
  if pg_temp.aantal('select 1 from public.households') <> 0 then raise exception 'KG-T17: oud-eigenaar ziet H1 na vertrek'; end if;
end $$;
select pg_temp.als('lisa');
do $$ begin
  if (select role from public.household_members where id = current_setting('test.m_lisa')::uuid) <> 'owner' then raise exception 'KG-T17: Lisa is geen eigenaar'; end if;
  if not exists (select 1 from public.household_members where household_id = current_setting('test.h1')::uuid
                 and display_name = 'Anna' and not has_account and status = 'active' and role = 'member')
    then raise exception 'KG-T17: het lid Anna bestaat niet meer zonder account'; end if;
  if not pg_temp.faalt(format($q$ select public.leave_household(%L) $q$, current_setting('test.h1'))) then raise exception 'KG-T17: nieuwe laatste eigenaar vertrekt'; end if;
end $$;
reset role;
do $$ begin
  -- Ook buiten de functies om: een account van de laatste eigenaar verwijderen of de rol direct
  -- weghalen laat het huishouden niet zonder eigenaar.
  if not pg_temp.faalt(format($q$ delete from auth.users where id = %L $q$, current_setting('test.lisa'))) then raise exception 'KG-T17: account van de laatste eigenaar verwijderd'; end if;
  if not pg_temp.faalt(format($q$ set constraints all immediate; update public.household_members set role = 'member' where id = %L $q$, current_setting('test.m_lisa'))) then raise exception 'KG-T17: huishouden zonder eigenaar'; end if;
  set constraints all deferred;
  perform pg_temp.ok('KG-T17');
end $$;
set local role authenticated;

-- KG-T18 Profielen: alleen je eigen profiel.
select pg_temp.als('anna');
insert into public.profiles (user_id, display_name) values (current_setting('test.anna')::uuid, 'Anna');
do $$ begin
  if not pg_temp.faalt(format($q$ insert into public.profiles (user_id, display_name) values (%L, 'Nep') $q$, current_setting('test.eve'))) then raise exception 'KG-T18: profiel voor een ander aangemaakt'; end if;
end $$;
select pg_temp.als('eve');
insert into public.profiles (user_id, display_name) values (current_setting('test.eve')::uuid, 'Eve');
do $$ begin
  if pg_temp.aantal('select 1 from public.profiles') <> 1 then raise exception 'KG-T18: Eve ziet andermans profiel'; end if;
  if pg_temp.geraakt(format($q$ update public.profiles set display_name = 'Gekaapt' where user_id = %L $q$, current_setting('test.anna'))) <> 0 then raise exception 'KG-T18: Eve wijzigt het profiel van Anna'; end if;
  if pg_temp.geraakt($q$ update public.profiles set display_name = 'Eva' $q$) <> 1 then raise exception 'KG-T18: Eve kan haar eigen profiel niet aanpassen'; end if;
  if not pg_temp.faalt(format($q$ update public.profiles set user_id = %L $q$, current_setting('test.anna'))) then raise exception 'KG-T18: profiel aan een ander account gehangen'; end if;
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
  -- KG-5B: account-ID's en uitnodigingsgegevens zijn op kolomniveau afgeschermd.
  if has_column_privilege('authenticated', 'public.household_members', 'user_id', 'select') then raise exception 'KG-T21: user_id van leden leesbaar'; end if;
  if has_column_privilege('authenticated', 'public.household_invites', 'token_hash', 'select') then raise exception 'KG-T21: tokenhash leesbaar'; end if;
  if has_column_privilege('authenticated', 'public.household_invites', 'created_by', 'select') then raise exception 'KG-T21: created_by van uitnodigingen leesbaar'; end if;
  if has_column_privilege('authenticated', 'public.household_invites', 'accepted_by', 'select') then raise exception 'KG-T21: accepted_by van uitnodigingen leesbaar'; end if;
  perform pg_temp.ok('KG-T21');
end $$;

-- KG-T22 Een kind kan geen account krijgen (KG-1), ook niet buiten de functies om.
do $$ begin
  if not pg_temp.faalt(format($q$ update public.household_members set user_id = %L, linked_at = now() where id = %L $q$,
       current_setting('test.eve'), current_setting('test.m_lynn'))) then raise exception 'KG-T22: kind-lid aan een account gekoppeld'; end if;
  perform pg_temp.ok('KG-T22');
end $$;

-- ---------------------------------------------------------------------------------------------
-- KG-5B (bouwplan KG-5A, stap 1)
-- ---------------------------------------------------------------------------------------------

-- KG-T23 Account-ID's zijn niet leesbaar, ook niet om op te filteren; "heeft account" en de eigen
-- lidmaatschappen wel.
set local role authenticated;
select pg_temp.als('mira');
do $$ begin
  if not pg_temp.faalt('select user_id from public.household_members') then raise exception 'KG-T23: user_id leesbaar'; end if;
  if not pg_temp.faalt('select * from public.household_members') then raise exception 'KG-T23: select * geeft user_id prijs'; end if;
  if not pg_temp.faalt('select 1 from public.household_members where user_id is not null') then raise exception 'KG-T23: filteren op user_id mogelijk'; end if;
  if not pg_temp.faalt('select created_by from public.household_invites') then raise exception 'KG-T23: created_by van uitnodigingen leesbaar'; end if;
  if not pg_temp.faalt('select accepted_by from public.household_invites') then raise exception 'KG-T23: accepted_by van uitnodigingen leesbaar'; end if;
  if pg_temp.aantal('select has_account from public.household_members where has_account') = 0 then raise exception 'KG-T23: has_account niet bruikbaar'; end if;
  if (select count(*) from public.my_memberships()) <> 2 then raise exception 'KG-T23: Mira ziet niet precies haar twee lidmaatschappen'; end if;
end $$;
select pg_temp.als('kees');
do $$ begin
  if (select count(*) from public.my_memberships()) <> 0 then raise exception 'KG-T23: gearchiveerd lid heeft nog een lidmaatschap'; end if;
end $$;
select pg_temp.als('eve');
do $$ begin
  if (select count(*) from public.my_memberships()) <> 0 then raise exception 'KG-T23: buitenstaander heeft een lidmaatschap'; end if;
  perform pg_temp.ok('KG-T23');
end $$;

-- KG-T24 Hoogstens 10 huishoudens als eigenaar per account.
do $$ declare i int; begin
  for i in 1..10 loop perform public.create_household('Eve ' || i, 'Eve'); end loop;
  if not pg_temp.faalt($q$ select public.create_household('Eve 11', 'Eve') $q$) then raise exception 'KG-T24: elfde huishouden toegestaan'; end if;
  perform pg_temp.ok('KG-T24');
end $$;

-- KG-T25 Een huishouden verwijderen kan alleen een eigenaar; leden en uitnodigingen gaan mee, andere
-- huishoudens blijven onaangetast.
do $$ declare h1 text := current_setting('test.h1'); h2 text := current_setting('test.h2'); begin
  perform pg_temp.als('eve');
  if not pg_temp.faalt(format($q$ select public.delete_household(%L) $q$, h2)) then raise exception 'KG-T25: buitenstaander verwijdert H2'; end if;
  perform pg_temp.als('mira');
  if not pg_temp.faalt(format($q$ select public.delete_household(%L) $q$, h1)) then raise exception 'KG-T25: gewoon lid verwijdert H1'; end if;
  perform pg_temp.als('kees');
  if not pg_temp.faalt(format($q$ select public.delete_household(%L) $q$, h1)) then raise exception 'KG-T25: gearchiveerd lid verwijdert H1'; end if;
  perform pg_temp.als('anna');
  if not pg_temp.faalt(format($q$ select public.delete_household(%L) $q$, h1)) then raise exception 'KG-T25: oud-eigenaar verwijdert H1'; end if;
  perform pg_temp.als('mira');
  perform public.delete_household(h2::uuid);
end $$;
reset role;
do $$ begin
  if exists (select 1 from public.households where id = current_setting('test.h2')::uuid) then raise exception 'KG-T25: H2 bestaat nog'; end if;
  if exists (select 1 from public.household_members where household_id = current_setting('test.h2')::uuid) then raise exception 'KG-T25: leden van H2 bestaan nog'; end if;
  if exists (select 1 from public.household_invites where household_id = current_setting('test.h2')::uuid) then raise exception 'KG-T25: uitnodigingen van H2 bestaan nog'; end if;
  if (select count(*) from public.household_members where household_id = current_setting('test.h1')::uuid) <> 6 then raise exception 'KG-T25: H1 is aangetast'; end if;
  perform pg_temp.ok('KG-T25');
end $$;

-- KG-T26 Account verwijderen (AVG), zoals de auth-dienst dat doet: altijd mogelijk, behalve voor de
-- enige eigenaar van een huishouden waar nog andere accounts in zitten (eerst overdragen of het
-- huishouden verwijderen). Een huishouden zonder andere accounts gaat mee; elders blijft het lid
-- zonder account bestaan.
select set_config('test.solo',   gen_random_uuid()::text, true);
select set_config('test.ouder',  gen_random_uuid()::text, true);
select set_config('test.helper', gen_random_uuid()::text, true);
select set_config('test.lid',    gen_random_uuid()::text, true);
insert into auth.users (id, email) values
  (current_setting('test.solo')::uuid,   'solo@test.invalid'),
  (current_setting('test.ouder')::uuid,  'ouder@test.invalid'),
  (current_setting('test.helper')::uuid, 'helper@test.invalid'),
  (current_setting('test.lid')::uuid,    'lid@test.invalid');
set local role authenticated;
select pg_temp.als('solo');
select set_config('test.hs', public.create_household('Alleen', 'Solo')::text, true);
select public.add_member(current_setting('test.hs')::uuid, 'Kind van Solo', 'child');
select pg_temp.als('ouder');
select set_config('test.ho', public.create_household('Samen', 'Ouder')::text, true);
select set_config('test.tok_helper', public.create_invite(current_setting('test.ho')::uuid, null, 'admin'), true);
select set_config('test.tok_lid', public.create_invite(current_setting('test.ho')::uuid), true);
select pg_temp.als('helper');
select public.accept_invite(current_setting('test.tok_helper'), 'Helper');
select pg_temp.als('lid');
select public.accept_invite(current_setting('test.tok_lid'), 'Lid');
insert into public.profiles (user_id, display_name) values (current_setting('test.lid')::uuid, 'Lid');
reset role;
set constraints all immediate;
do $$ declare ho uuid := current_setting('test.ho')::uuid; hs uuid := current_setting('test.hs')::uuid; begin
  -- Gewoon lid: lukt. Het lid blijft zonder account; het profiel is weg.
  if pg_temp.faalt(format($q$ delete from auth.users where id = %L $q$, current_setting('test.lid'))) then raise exception 'KG-T26: account van een gewoon lid kan niet worden verwijderd'; end if;
  if exists (select 1 from public.household_members where user_id = current_setting('test.lid')::uuid) then raise exception 'KG-T26: lid nog aan verwijderd account gekoppeld'; end if;
  if not exists (select 1 from public.household_members where household_id = ho and display_name = 'Lid'
                 and not has_account and linked_at is null and role = 'member') then raise exception 'KG-T26: lid niet netjes ontkoppeld'; end if;
  if exists (select 1 from public.profiles where user_id = current_setting('test.lid')::uuid) then raise exception 'KG-T26: profiel blijft na verwijderen'; end if;
  -- Enige eigenaar met een ander account (Helper) in het huishouden: geweigerd.
  if not pg_temp.faalt(format($q$ delete from auth.users where id = %L $q$, current_setting('test.ouder'))) then raise exception 'KG-T26: enige eigenaar verwijderd terwijl er andere accounts zijn'; end if;
  if not exists (select 1 from public.households where id = ho) then raise exception 'KG-T26: huishouden verdwenen na geweigerd verwijderen'; end if;
  -- Beheerder: lukt; wordt een gewoon lid zonder account.
  delete from auth.users where id = current_setting('test.helper')::uuid;
  if not exists (select 1 from public.household_members where household_id = ho and display_name = 'Helper'
                 and not has_account and role = 'member') then raise exception 'KG-T26: beheerder niet netjes ontkoppeld'; end if;
  -- Nu heeft niemand anders een account: het huishouden gaat mee met het account van de eigenaar.
  delete from auth.users where id = current_setting('test.ouder')::uuid;
  if exists (select 1 from public.households where id = ho) then raise exception 'KG-T26: huishouden zonder andere accounts blijft bestaan'; end if;
  if exists (select 1 from public.household_members where household_id = ho) then raise exception 'KG-T26: leden blijven achter'; end if;
  if exists (select 1 from public.household_invites where household_id = ho) then raise exception 'KG-T26: uitnodigingen blijven achter'; end if;
  -- Alleen in een eigen huishouden, met een kind zonder account: alles gaat mee.
  delete from auth.users where id = current_setting('test.solo')::uuid;
  if exists (select 1 from public.households where id = hs) or exists (select 1 from public.household_members where household_id = hs) then raise exception 'KG-T26: eigen huishouden blijft na verwijderen'; end if;
  -- Eve (enige eigenaar van tien huishoudens zonder andere accounts): alles gaat mee, H1 blijft.
  delete from auth.users where id = current_setting('test.eve')::uuid;
  if exists (select 1 from public.households where name like 'Eve %') then raise exception 'KG-T26: huishoudens van Eve blijven'; end if;
  if not exists (select 1 from public.households where id = current_setting('test.h1')::uuid) then raise exception 'KG-T26: H1 aangetast'; end if;
  -- Mira: gewoon lid van H1: lukt, H1 blijft met Lisa als eigenaar.
  delete from auth.users where id = current_setting('test.mira')::uuid;
  if not exists (select 1 from public.household_members where household_id = current_setting('test.h1')::uuid and display_name = 'Mira' and not has_account) then raise exception 'KG-T26: Mira niet netjes ontkoppeld'; end if;
  perform pg_temp.ok('KG-T26');
end $$;
set constraints all deferred;

-- KG-T27 Realtime: geen enkele tabel uit public staat in een publicatie, dus postgres_changes
-- stuurt niets uit (de integratietest controleert dit ook tegen een echte Supabase).
do $$ begin
  if exists (select 1 from pg_publication_tables where schemaname = 'public') then raise exception 'KG-T27: tabel uit public staat in een publicatie'; end if;
  perform pg_temp.ok('KG-T27');
end $$;

-- ============================== KG-5B herstelronde 1 (review van 6da0f47) ==============================
-- De gelijktijdigheidsproblemen (P1, P3, P5 gelijktijdig) staan in tests/integratie/gelijktijdig.test.mjs:
-- die vragen echte, aparte databaseverbindingen.
reset role;
select set_config('test.oud',   gen_random_uuid()::text, true);
select set_config('test.nieuw', gen_random_uuid()::text, true);
select set_config('test.gast',  gen_random_uuid()::text, true);
select set_config('test.tien',  gen_random_uuid()::text, true);
insert into auth.users (id, email) values
  (current_setting('test.oud')::uuid,   'oud@test.invalid'),
  (current_setting('test.nieuw')::uuid, 'nieuw@test.invalid'),
  (current_setting('test.gast')::uuid,  'gast@test.invalid'),
  (current_setting('test.tien')::uuid,  'tien@test.invalid');
set local role authenticated;

-- KG-T28 (P2) Een uitnodiging is alleen geldig zolang de maker haar nog mag geven. Oud maakt als
-- eigenaar een beheerdersuitnodiging en een gewone uitnodiging, draagt het eigendom over en wordt
-- daarna gearchiveerd: geen van beide oude uitnodigingen werkt nog (ook niet voor Oud zelf). Een
-- nieuwe uitnodiging van de huidige eigenaar werkt wel.
select pg_temp.als('oud');
select set_config('test.h28', public.create_household('Overdracht', 'Oud')::text, true);
select set_config('test.tok_oud_admin', public.create_invite(current_setting('test.h28')::uuid, null, 'admin'), true);
select set_config('test.tok_oud_admin2', public.create_invite(current_setting('test.h28')::uuid, null, 'admin'), true);
select set_config('test.tok_oud_lid', public.create_invite(current_setting('test.h28')::uuid, null, 'member'), true);
select set_config('test.tok_nieuw', public.create_invite(current_setting('test.h28')::uuid, null, 'admin'), true);
select pg_temp.als('nieuw');
select public.accept_invite(current_setting('test.tok_nieuw'), 'Nieuw');
select pg_temp.als('oud');
select set_config('test.m_nieuw', (select id from public.household_members where household_id = current_setting('test.h28')::uuid and display_name = 'Nieuw')::text, true);
select set_config('test.m_oud', (select member_id from public.my_memberships() where household_id = current_setting('test.h28')::uuid)::text, true);
select public.transfer_ownership(current_setting('test.h28')::uuid, current_setting('test.m_nieuw')::uuid);
do $$ declare h text := current_setting('test.h28'); begin
  -- Oud is nu beheerder: de beheerdersuitnodigingen van Oud zijn ongeldig, de gewone nog niet.
  perform pg_temp.als('gast');
  if not pg_temp.faalt(format($q$ select public.accept_invite(%L, 'Gast') $q$, current_setting('test.tok_oud_admin'))) then raise exception 'KG-T28: beheerdersuitnodiging van een oud-eigenaar nog bruikbaar'; end if;
  perform pg_temp.als('nieuw');
  perform public.archive_member(h::uuid, current_setting('test.m_oud')::uuid);
  perform pg_temp.als('oud');
  if pg_temp.aantal('select 1 from public.households') <> 0 then raise exception 'KG-T28: gearchiveerde oud-eigenaar ziet het huishouden nog'; end if;
  -- Oud probeert met de eigen oude tokens terug te komen.
  if not pg_temp.faalt(format($q$ select public.accept_invite(%L, 'Oud') $q$, current_setting('test.tok_oud_admin2'))) then raise exception 'KG-T28: oud-eigenaar weer beheerder via eigen oude uitnodiging'; end if;
  if not pg_temp.faalt(format($q$ select public.accept_invite(%L, 'Oud') $q$, current_setting('test.tok_oud_lid'))) then raise exception 'KG-T28: gearchiveerde maker: gewone uitnodiging nog bruikbaar'; end if;
  if pg_temp.aantal('select 1 from public.households') <> 0 then raise exception 'KG-T28: oud-eigenaar kreeg toegang'; end if;
  -- De ongeldige uitnodigingen staan ook als ingetrokken (zichtbaar voor beheer).
  perform pg_temp.als('nieuw');
  if pg_temp.aantal('select 1 from public.household_invites where accepted_at is null and revoked_at is null') <> 0 then raise exception 'KG-T28: ongeldige uitnodigingen staan nog open'; end if;
  -- Een nieuwe, geautoriseerde uitnodiging werkt wel, met alleen de rechten die erin staan.
  perform set_config('test.tok_terug', public.create_invite(h::uuid, null, 'member'), true);
  perform pg_temp.als('oud');
  perform public.accept_invite(current_setting('test.tok_terug'), 'Oud weer');
  if (select role from public.my_memberships() where household_id = h::uuid) <> 'member' then raise exception 'KG-T28: nieuwe uitnodiging gaf verkeerde rol'; end if;
  perform pg_temp.ok('KG-T28');
end $$;

-- KG-T29 (P4) Geen enkele kolom die naar een account verwijst, is via de API leesbaar (behalve je
-- eigen profiel). Ook households.created_by niet.
do $$ declare r record; begin
  perform pg_temp.als('nieuw');
  if not pg_temp.faalt('select created_by from public.households') then raise exception 'KG-T29: households.created_by leesbaar'; end if;
  if not pg_temp.faalt('select * from public.households') then raise exception 'KG-T29: select * op households lukt (met created_by)'; end if;
  if not pg_temp.faalt(format($q$ select id from public.households where created_by = %L $q$, current_setting('test.oud'))) then raise exception 'KG-T29: filteren op created_by lukt'; end if;
  if pg_temp.aantal('select id, name, created_at, updated_at from public.households') <> 1 then raise exception 'KG-T29: gewone kolommen niet leesbaar'; end if;
  for r in
    select c.conrelid::regclass::text as tabel, a.attname as kolom
    from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
    where c.contype = 'f' and c.confrelid = 'auth.users'::regclass
      and c.connamespace = 'public'::regnamespace and c.conrelid <> 'public.profiles'::regclass
  loop
    if has_column_privilege('authenticated', r.tabel, r.kolom, 'select') then raise exception 'KG-T29: %.% (account-ID) leesbaar', r.tabel, r.kolom; end if;
  end loop;
  perform pg_temp.ok('KG-T29');
end $$;

-- KG-T30 (P5) De limiet van 10 eigen huishoudens geldt ook bij eigendomsoverdracht.
select pg_temp.als('tien');
select public.create_household('Tien ' || g, 'Tien') from generate_series(1, 10) g;
select pg_temp.als('nieuw');
select set_config('test.tok_tien', public.create_invite(current_setting('test.h28')::uuid, null, 'admin'), true);
select pg_temp.als('tien');
select public.accept_invite(current_setting('test.tok_tien'), 'Tien');
do $$ declare h text := current_setting('test.h28'); begin
  perform pg_temp.als('nieuw');
  if not pg_temp.faalt(format($q$ select public.transfer_ownership(%L, (select id from public.household_members where household_id = %L and display_name = 'Tien')) $q$, h, h)) then raise exception 'KG-T30: elfde huishouden via overdracht'; end if;
  if (select role from public.my_memberships() where household_id = h::uuid) <> 'owner' then raise exception 'KG-T30: eigendom toch verschoven'; end if;
  perform pg_temp.als('tien');
  if (select count(*) from public.my_memberships() where role = 'owner') <> 10 then raise exception 'KG-T30: Tien heeft geen 10 eigen huishoudens meer'; end if;
  perform pg_temp.ok('KG-T30');
end $$;

-- KG-T31 Vergrendelingsprotocol: elke functie die lidmaatschap, rollen, uitnodigingen of het
-- huishouden wijzigt, vergrendelt eerst het huishouden (of het account, bij aanmaken).
reset role;
do $$ declare f text; def text; begin
  foreach f in array array['add_member', 'create_invite', 'revoke_invite', 'accept_invite', 'set_member_role',
    'archive_member', 'transfer_ownership', 'leave_household', 'delete_household', 'before_account_delete',
    'ensure_owner', 'guard_member', 'guard_household'] loop
    select pg_get_functiondef(p.oid) into def from pg_proc p where p.pronamespace = 'private'::regnamespace and p.proname = f;
    if def is null or position('private.lock_household(' in def) = 0 then raise exception 'KG-T31: private.% vergrendelt het huishouden niet', f; end if;
    -- Vergrendelen vóór de eerste autorisatiecontrole.
    if position('has_role(' in def) > 0 and position('has_role(' in def) < position('private.lock_household(' in def) then
      raise exception 'KG-T31: private.% controleert rechten vóór de vergrendeling', f;
    end if;
  end loop;
  foreach f in array array['create_household', 'transfer_ownership'] loop
    select pg_get_functiondef(p.oid) into def from pg_proc p where p.pronamespace = 'private'::regnamespace and p.proname = f;
    if position('private.lock_owner_count(' in def) = 0 or position('private.lock_owner_count(' in def) > position('private.owned_household_count(' in def) then
      raise exception 'KG-T31: private.% telt eigen huishoudens zonder accountvergrendeling', f;
    end if;
  end loop;
  if not exists (select 1 from pg_trigger where tgname = 'households_guard' and tgrelid = 'public.households'::regclass) then raise exception 'KG-T31: trigger households_guard ontbreekt'; end if;
  perform pg_temp.ok('KG-T31');
end $$;

-- ============================== KG-5C: inhoud (bouwplan stap 2) ==============================
-- Afspraken, taken en boodschappen. Huishouden HS (Jansen): Sam eigenaar, Noa en Jip leden met account,
-- Mees kind zonder account. Ravi: buitenstaander met een eigen huishouden HR.
-- Teksten met "-geheim" staan alleen in privé-afspraken en mogen bij niemand anders opduiken.
reset role;
-- SQLSTATE van een opdracht (null = gelukt).
create function pg_temp.fout(p_sql text) returns text language plpgsql as $$
begin
  execute p_sql;
  return null;
exception when others then
  return sqlstate;
end $$;
-- Afspraak bewaren met de meest gebruikte velden.
create function pg_temp.bewaar(p_h text, p_id text, p_v integer, p_dag date, p_start time, p_eind time,
  p_zicht text, p_titel text, p_wie uuid[], p_freq text default null, p_plek text default null,
  p_notitie text default null, p_voorb text default null) returns integer language sql as $$
  select public.save_event(p_h::uuid, p_id::uuid, p_v, p_dag, p_start, null, p_eind, p_zicht, p_titel, p_plek,
    p_notitie, p_voorb, p_wie, p_freq, null)
$$;
grant execute on all functions in schema pg_temp to authenticated, anon;
select set_config('test.sam',  gen_random_uuid()::text, true);
select set_config('test.noa',  gen_random_uuid()::text, true);
select set_config('test.jip',  gen_random_uuid()::text, true);
select set_config('test.ravi', gen_random_uuid()::text, true);
insert into auth.users (id, email) values
  (current_setting('test.sam')::uuid,  'sam@test.invalid'),
  (current_setting('test.noa')::uuid,  'noa@test.invalid'),
  (current_setting('test.jip')::uuid,  'jip@test.invalid'),
  (current_setting('test.ravi')::uuid, 'ravi@test.invalid');
select set_config('test.e1', gen_random_uuid()::text, true);   -- gedeelde afspraak van Sam
select set_config('test.e2', gen_random_uuid()::text, true);   -- privé-afspraak van Sam
select set_config('test.e3', gen_random_uuid()::text, true);   -- privé-afspraak van Noa
select set_config('test.s1', gen_random_uuid()::text, true);   -- wekelijkse reeks
select set_config('test.o1', gen_random_uuid()::text, true);
select set_config('test.o4', gen_random_uuid()::text, true);
select set_config('test.t1', gen_random_uuid()::text, true);
select set_config('test.er', gen_random_uuid()::text, true);   -- afspraak van Ravi
set local role authenticated;
select pg_temp.als('sam');
select set_config('test.hs', public.create_household('Jansen', 'Sam')::text, true);
select set_config('test.m_mees', public.add_member(current_setting('test.hs')::uuid, 'Mees', 'child')::text, true);
select set_config('test.tok_noa', public.create_invite(current_setting('test.hs')::uuid), true);
select set_config('test.tok_jip', public.create_invite(current_setting('test.hs')::uuid), true);
select set_config('test.m_sam', (select member_id from public.my_memberships() where household_id = current_setting('test.hs')::uuid)::text, true);
select pg_temp.als('noa');
select public.accept_invite(current_setting('test.tok_noa'), 'Noa');
select set_config('test.m_noa', (select member_id from public.my_memberships() where household_id = current_setting('test.hs')::uuid)::text, true);
select pg_temp.als('jip');
select public.accept_invite(current_setting('test.tok_jip'), 'Jip');
select set_config('test.m_jip', (select member_id from public.my_memberships() where household_id = current_setting('test.hs')::uuid)::text, true);
select pg_temp.als('ravi');
select set_config('test.hr', public.create_household('Buren', 'Ravi')::text, true);
select set_config('test.m_ravi', (select member_id from public.my_memberships() where household_id = current_setting('test.hr')::uuid)::text, true);
select pg_temp.bewaar(current_setting('test.hr'), current_setting('test.er'), null, '2026-10-12', '08:00', '09:00', 'household', 'Buren-afspraak', null);
insert into public.tasks (household_id, title) values (current_setting('test.hr')::uuid, 'Buren-taak');

-- KG-T32 Gedeelde afspraak: ieder lid ziet tijd, titel, plek en voor wie; de buitenstaander niets.
select pg_temp.als('sam');
select pg_temp.bewaar(current_setting('test.hs'), current_setting('test.e1'), null, '2026-10-12', '19:00', '20:30', 'household',
  'Ouderavond', array[current_setting('test.m_sam'), current_setting('test.m_mees')]::uuid[], null, 'School', 'Rapport meenemen', 'Map klaarleggen');
do $$ declare r record; begin
  perform pg_temp.als('noa');
  select * into r from public.event_overview where id = current_setting('test.e1')::uuid;
  if r.title is distinct from 'Ouderavond' or r.location is distinct from 'School' or r.is_busy then raise exception 'KG-T32: lid ziet de gedeelde afspraak niet volledig'; end if;
  if cardinality(r.participant_ids) <> 2 or r.version <> 1 or r.owner_member_id <> current_setting('test.m_sam')::uuid then raise exception 'KG-T32: deelnemers, versie of eigenaar onjuist'; end if;
  if pg_temp.aantal(format('select 1 from public.event_details where event_id = %L', current_setting('test.e1'))) <> 1 then raise exception 'KG-T32: details niet leesbaar'; end if;
  perform pg_temp.ok('KG-T32');
end $$;

-- KG-T33 Privé-afspraak van een ander = "Bezet": wanneer, van wie en voor wie wel; titel, plek,
-- notities en voorbereiding nergens (tabel, view, filter, functie). Alleen de eigenaar wijzigt hem.
select pg_temp.als('sam');
select pg_temp.bewaar(current_setting('test.hs'), current_setting('test.e2'), null, '2026-10-13', '10:00', '11:00', 'private',
  'Tandarts-geheim', array[current_setting('test.m_sam')]::uuid[], null, 'Kliniek-geheim', 'Notitie-geheim', 'Voorbereiding-geheim');
select pg_temp.als('noa');
select pg_temp.bewaar(current_setting('test.hs'), current_setting('test.e3'), null, '2026-10-14', null, null, 'private', 'Noa-geheim', null);
do $$ declare r record; rel record; kolommen text; n bigint; begin
  perform pg_temp.als('noa');
  if pg_temp.aantal(format('select 1 from public.events where id = %L and start_time = %L', current_setting('test.e2'), '10:00')) <> 1 then raise exception 'KG-T33: tijd van andermans privé-afspraak niet zichtbaar'; end if;
  if pg_temp.aantal(format('select 1 from public.event_details where event_id = %L', current_setting('test.e2'))) <> 0 then raise exception 'KG-T33: details van andermans privé-afspraak leesbaar'; end if;
  select * into r from public.event_overview where id = current_setting('test.e2')::uuid;
  if not r.is_busy or r.title is not null or r.location is not null or r.notes is not null or r.preparation is not null then raise exception 'KG-T33: view toont meer dan "Bezet"'; end if;
  if r.participant_ids <> array[current_setting('test.m_sam')::uuid] or r.start_date <> '2026-10-13' then raise exception 'KG-T33: wanneer/voor wie niet zichtbaar'; end if;
  if pg_temp.aantal($q$ select 1 from public.event_overview where title like '%geheim%' or location like '%geheim%' or notes like '%geheim%' or preparation like '%geheim%' $q$) <> 1 then raise exception 'KG-T33: filteren op andermans privé-tekst geeft iets terug'; end if;
  -- Generiek: in geen enkele tabel of view die Noa kan lezen, staat een privé-tekst van Sam.
  for rel in select c.oid::regclass::text as naam from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
             where ns.nspname = 'public' and c.relkind in ('r', 'v') loop
    select string_agg(quote_ident(a.attname), ', ') into kolommen from pg_attribute a
      where a.attrelid = rel.naam::regclass and a.attnum > 0 and not a.attisdropped
        and has_column_privilege('authenticated', rel.naam, a.attname, 'select');
    if kolommen is null then continue; end if;
    execute format('select count(*) from (select %s from %s) t where t::text like %L or t::text like %L or t::text like %L or t::text like %L',
      kolommen, rel.naam, '%Tandarts-geheim%', '%Kliniek-geheim%', '%Notitie-geheim%', '%Voorbereiding-geheim%') into n;
    if n <> 0 then raise exception 'KG-T33: privé-tekst van Sam zichtbaar via %', rel.naam; end if;
  end loop;
  -- Niet te wijzigen of te verwijderen, en de fout verraadt niets ("niet gevonden", zoals bij een onbekend id).
  if pg_temp.fout(format($q$ select pg_temp.bewaar(%L, %L, 1, '2026-10-13', '10:00', '11:00', 'private', 'X', null) $q$, current_setting('test.hs'), current_setting('test.e2'))) <> 'P0002' then raise exception 'KG-T33: andermans privé-afspraak te wijzigen'; end if;
  if pg_temp.fout(format($q$ select public.delete_event(%L, 1) $q$, current_setting('test.e2'))) <> 'P0002' then raise exception 'KG-T33: andermans privé-afspraak te verwijderen'; end if;
  -- Alleen de eigenaar kiest privé of gedeeld: Noa kan Sams gedeelde afspraak niet privé maken.
  if not pg_temp.faalt(format($q$ select pg_temp.bewaar(%L, %L, 1, '2026-10-12', '19:00', '20:30', 'private', 'Ouderavond', null) $q$, current_setting('test.hs'), current_setting('test.e1'))) then raise exception 'KG-T33: niet-eigenaar maakt een afspraak privé'; end if;
  -- Noa ziet haar eigen privé-afspraak wel volledig; Sam niet.
  if (select title from public.event_overview where id = current_setting('test.e3')::uuid) is distinct from 'Noa-geheim' then raise exception 'KG-T33: eigenaar ziet eigen privé-afspraak niet'; end if;
  perform pg_temp.als('sam');
  if (select title from public.event_overview where id = current_setting('test.e2')::uuid) is distinct from 'Tandarts-geheim' then raise exception 'KG-T33: eigenaar ziet eigen privé-afspraak niet'; end if;
  if (select is_busy from public.event_overview where id = current_setting('test.e3')::uuid) is not true then raise exception 'KG-T33: Sam ziet Noas privé-afspraak'; end if;
  perform pg_temp.ok('KG-T33');
end $$;

-- KG-T34 Gedeelde items wijzigt ieder lid; elke wijziging verhoogt de versie, een verouderde versie
-- wordt geweigerd (PT409 = HTTP 409 via de API). De eigenaar van de afspraak blijft dezelfde.
do $$ begin
  perform pg_temp.als('noa');
  if pg_temp.bewaar(current_setting('test.hs'), current_setting('test.e1'), 1, '2026-10-12', '19:30', '21:00', 'household', 'Ouderavond (later)', null) <> 2 then raise exception 'KG-T34: lid kan gedeelde afspraak niet wijzigen'; end if;
  perform pg_temp.als('sam');
  if pg_temp.fout(format($q$ select pg_temp.bewaar(%L, %L, 1, '2026-10-12', '19:00', '20:00', 'household', 'Oud', null) $q$, current_setting('test.hs'), current_setting('test.e1'))) <> 'PT409' then raise exception 'KG-T34: verouderde versie niet geweigerd'; end if;
  if pg_temp.fout(format($q$ select public.delete_event(%L, 1) $q$, current_setting('test.e1'))) <> 'PT409' then raise exception 'KG-T34: verwijderen met verouderde versie'; end if;
  if (select version from public.events where id = current_setting('test.e1')::uuid) <> 2
     or (select owner_member_id from public.events where id = current_setting('test.e1')::uuid) <> current_setting('test.m_sam')::uuid
     or (select title from public.event_details where event_id = current_setting('test.e1')::uuid) <> 'Ouderavond (later)'
     or (select count(*) from public.event_participants where event_id = current_setting('test.e1')::uuid) <> 0 then raise exception 'KG-T34: eindtoestand onjuist'; end if;
  -- Een herhaalde "maak"-opdracht met hetzelfde id slaat niets dubbel op.
  if pg_temp.fout(format($q$ select pg_temp.bewaar(%L, %L, null, '2026-10-12', '19:00', '20:00', 'household', 'Dubbel', null) $q$, current_setting('test.hs'), current_setting('test.e1'))) <> '23505' then raise exception 'KG-T34: dubbele aanmaak niet geweigerd'; end if;
  perform pg_temp.ok('KG-T34');
end $$;

-- KG-T35 Huishoudgrens: niets zien, niets schrijven en niets verwijzen over de grens, ook niet als postgres.
do $$ declare t text; begin
  perform pg_temp.als('ravi');
  foreach t in array array['events', 'event_details', 'event_participants', 'event_exceptions', 'tasks', 'shopping_items', 'event_overview'] loop
    if pg_temp.aantal(format('select 1 from public.%I where household_id = %L', t, current_setting('test.hs'))) <> 0 then raise exception 'KG-T35: Ravi ziet % van HS', t; end if;
  end loop;
  if not pg_temp.faalt(format($q$ select pg_temp.bewaar(%L, %L, null, '2026-10-12', null, null, 'household', 'Inbraak', null) $q$, current_setting('test.hs'), gen_random_uuid())) then raise exception 'KG-T35: Ravi maakt een afspraak in HS'; end if;
  if not pg_temp.faalt(format($q$ select pg_temp.bewaar(%L, %L, null, '2026-10-12', null, null, 'household', 'Met Mees', array[%L]::uuid[]) $q$, current_setting('test.hr'), gen_random_uuid(), current_setting('test.m_mees'))) then raise exception 'KG-T35: deelnemer uit een ander huishouden'; end if;
  if not pg_temp.faalt(format($q$ select pg_temp.bewaar(%L, %L, null, '2026-10-12', null, null, 'household', 'Kaping', null) $q$, current_setting('test.hr'), current_setting('test.e1'))) then raise exception 'KG-T35: id van een afspraak uit HS overgenomen'; end if;
  if not pg_temp.faalt(format($q$ select public.add_shopping_items(%L, array[%L]::uuid[], array['Inbraak']) $q$, current_setting('test.hs'), gen_random_uuid())) then raise exception 'KG-T35: Ravi voegt boodschappen toe in HS'; end if;
  if not pg_temp.faalt(format($q$ select public.delete_occurrence(%L, '2026-10-12') $q$, current_setting('test.e1'))) then raise exception 'KG-T35: Ravi wijzigt een afspraak van HS'; end if;
  perform pg_temp.als('sam');
  if not pg_temp.faalt(format($q$ insert into public.tasks (household_id, title) values (%L, 'Inbraak') $q$, current_setting('test.hr'))) then raise exception 'KG-T35: taak in een ander huishouden'; end if;
  if not pg_temp.faalt(format($q$ insert into public.tasks (household_id, title, assignee_member_id) values (%L, 'X', %L) $q$, current_setting('test.hs'), current_setting('test.m_ravi'))) then raise exception 'KG-T35: taak voor een lid van een ander huishouden'; end if;
  if pg_temp.geraakt(format($q$ update public.tasks set title = 'Gekaapt' where household_id = %L $q$, current_setting('test.hr'))) <> 0 then raise exception 'KG-T35: Sam wijzigt een taak van HR'; end if;
  if not pg_temp.faalt(format($q$ update public.tasks set household_id = %L $q$, current_setting('test.hr'))) then raise exception 'KG-T35: household_id van een taak te wijzigen'; end if;
  perform pg_temp.ok('KG-T35');
end $$;
reset role;
do $$ begin
  if not pg_temp.faalt(format($q$ insert into public.event_participants (event_id, member_id, household_id) values (%L, %L, %L) $q$, current_setting('test.e1'), current_setting('test.m_ravi'), current_setting('test.hs'))) then raise exception 'KG-T35: deelnemer over de grens opgeslagen (als postgres)'; end if;
  if not pg_temp.faalt(format($q$ insert into public.event_details (event_id, household_id, title) values (%L, %L, 'X') $q$, current_setting('test.er'), current_setting('test.hs'))) then raise exception 'KG-T35: details aan afspraak van ander huishouden (als postgres)'; end if;
  if not pg_temp.faalt(format($q$ insert into public.events (household_id, owner_member_id, start_date, series_id, original_date) values (%L, %L, '2026-10-12', %L, '2026-10-12') $q$, current_setting('test.hs'), current_setting('test.m_sam'), current_setting('test.er'))) then raise exception 'KG-T35: voorkomen van een reeks uit ander huishouden (als postgres)'; end if;
  if not pg_temp.faalt(format($q$ insert into public.events (household_id, owner_member_id, start_date) values (%L, %L, '2026-10-12') $q$, current_setting('test.hs'), current_setting('test.m_ravi'))) then raise exception 'KG-T35: eigenaar uit ander huishouden (als postgres)'; end if;
end $$;
set local role authenticated;

-- KG-T36 Herhaling: regels gelijk aan de app; geen dubbele uitzondering of losgemaakt voorkomen;
-- niet naar een dag waarop de reeks al staat; atomair; hele reeks verwijderen neemt alles mee.
select pg_temp.als('sam');
select pg_temp.bewaar(current_setting('test.hs'), current_setting('test.s1'), null, '2026-10-03', '09:00', '10:00', 'household',
  'Zwemles', array[current_setting('test.m_mees')]::uuid[], 'weekly');
reset role;
do $$ begin
  if private.occurs_on('2026-01-31', 'monthly', null, '2026-02-28') or not private.occurs_on('2026-01-31', 'monthly', null, '2026-03-31') then raise exception 'KG-T36: maandelijks op de 31e'; end if;
  if not private.occurs_on('2024-02-29', 'yearly', null, '2028-02-29') or private.occurs_on('2024-02-29', 'yearly', null, '2027-02-28') then raise exception 'KG-T36: jaarlijks op 29 februari'; end if;
  if not private.occurs_on('2026-10-03', 'weekly', null, '2026-10-10') or private.occurs_on('2026-10-03', 'weekly', null, '2026-10-11') then raise exception 'KG-T36: wekelijks'; end if;
  if private.occurs_on('2026-10-03', 'weekly', '2026-10-17', '2026-10-24') or private.occurs_on('2026-10-03', 'daily', null, '2026-10-02') then raise exception 'KG-T36: einde of begin van de reeks'; end if;
  if not private.occurs_on('2026-10-03', 'daily', null, '2026-10-04') or private.occurs_on('2026-10-03', null, null, '2026-10-03') then raise exception 'KG-T36: dagelijks of geen herhaling'; end if;
end $$;
set local role authenticated;
do $$ declare s text := current_setting('test.s1'); h text := current_setting('test.hs'); begin
  perform pg_temp.als('noa');   -- een lid past een voorkomen van een gedeelde reeks aan
  perform public.edit_occurrence(s::uuid, '2026-10-10', current_setting('test.o1')::uuid, '2026-10-11', '09:00', null, '10:00', 'Zwemles (zondag)', null, null, null, null);
  if pg_temp.aantal(format($q$ select 1 from public.event_exceptions where series_id = %L and occurrence_date = '2026-10-10' $q$, s)) <> 1 then raise exception 'KG-T36: geen uitzondering'; end if;
  if pg_temp.aantal(format($q$ select 1 from public.event_overview where id = %L and series_id = %L and original_date = '2026-10-10' and start_date = '2026-10-11' and owner_member_id = %L and visibility = 'household' $q$, current_setting('test.o1'), s, current_setting('test.m_sam'))) <> 1 then raise exception 'KG-T36: losgemaakt voorkomen onjuist'; end if;
  if not pg_temp.faalt(format($q$ select public.edit_occurrence(%L, '2026-10-10', gen_random_uuid(), '2026-10-12', null, null, null, 'Nog eens', null, null, null, null) $q$, s)) then raise exception 'KG-T36: hetzelfde voorkomen twee keer losgemaakt'; end if;
  if not pg_temp.faalt(format($q$ select public.edit_occurrence(%L, '2026-10-12', gen_random_uuid(), '2026-10-12', null, null, null, 'Geen voorkomen', null, null, null, null) $q$, s)) then raise exception 'KG-T36: datum buiten de reeks'; end if;
  if not pg_temp.faalt(format($q$ select public.edit_occurrence(%L, '2026-10-17', gen_random_uuid(), '2026-10-24', null, null, null, 'Op reeksdag', null, null, null, null) $q$, s)) then raise exception 'KG-T36: verplaatst naar een dag waarop de reeks al staat'; end if;
  if not pg_temp.faalt(format($q$ select public.edit_occurrence(%L, '2026-10-17', gen_random_uuid(), '2026-10-11', null, null, null, 'Op losgemaakte dag', null, null, null, null) $q$, s)) then raise exception 'KG-T36: verplaatst naar een dag met een ander losgemaakt voorkomen'; end if;
  perform public.delete_occurrence(s::uuid, '2026-10-17');
  if not pg_temp.faalt(format($q$ select public.delete_occurrence(%L, '2026-10-17') $q$, s)) then raise exception 'KG-T36: dubbele uitzondering'; end if;
  -- Een verwijderde reeksdag is vrij: daarheen verplaatsen mag.
  perform public.edit_occurrence(s::uuid, '2026-10-24', current_setting('test.o4')::uuid, '2026-10-17', null, null, null, 'Zwemles (ingehaald)', null, null, null, null);
  -- Een losgemaakt voorkomen herhaalt niet en gaat niet naar een reeksdag.
  if not pg_temp.faalt(format($q$ select pg_temp.bewaar(%L, %L, 1, '2026-10-11', null, null, 'household', 'X', null, 'weekly') $q$, h, current_setting('test.o1'))) then raise exception 'KG-T36: losgemaakt voorkomen met herhaling'; end if;
  if not pg_temp.faalt(format($q$ select pg_temp.bewaar(%L, %L, 1, '2026-10-31', null, null, 'household', 'X', null) $q$, h, current_setting('test.o1'))) then raise exception 'KG-T36: losgemaakt voorkomen naar een reeksdag'; end if;
  -- Mislukte opdrachten lieten niets half achter.
  if pg_temp.aantal(format('select 1 from public.event_exceptions where series_id = %L', s)) <> 3
     or pg_temp.aantal(format('select 1 from public.events where series_id = %L', s)) <> 2 then raise exception 'KG-T36: onvolledige opdracht liet iets achter'; end if;
  if (select version from public.events where id = s::uuid) < 4 then raise exception 'KG-T36: reeksversie niet verhoogd'; end if;
  perform pg_temp.ok('KG-T36');
end $$;
reset role;
do $$ declare s text := current_setting('test.s1'); begin
  if not pg_temp.faalt(format($q$ insert into public.event_exceptions (series_id, occurrence_date, household_id) values (%L, '2026-10-17', %L) $q$, s, current_setting('test.hs'))) then raise exception 'KG-T36: dubbele uitzondering (als postgres)'; end if;
  if not pg_temp.faalt(format($q$ insert into public.events (household_id, owner_member_id, start_date, series_id, original_date) values (%L, %L, '2026-10-30', %L, '2026-10-10') $q$, current_setting('test.hs'), current_setting('test.m_sam'), s)) then raise exception 'KG-T36: dubbel losgemaakt voorkomen (als postgres)'; end if;
  if not pg_temp.faalt(format($q$ insert into public.events (household_id, owner_member_id, start_date, series_id, original_date, recurrence_freq) values (%L, %L, '2026-10-30', %L, '2026-10-31', 'weekly') $q$, current_setting('test.hs'), current_setting('test.m_sam'), s)) then raise exception 'KG-T36: losgemaakt voorkomen met herhaling (als postgres)'; end if;
  if not pg_temp.faalt(format($q$ update public.events set owner_member_id = %L where id = %L $q$, current_setting('test.m_noa'), s)) then raise exception 'KG-T36: eigenaar te wijzigen (als postgres)'; end if;
end $$;
set local role authenticated;
do $$ declare s text := current_setting('test.s1'); begin
  perform pg_temp.als('sam');
  perform public.delete_event(s::uuid, (select version from public.events where id = s::uuid));
  if pg_temp.aantal(format('select 1 from public.events where (id = %L or series_id = %L) and deleted_at is null', s, s)) <> 0 then raise exception 'KG-T36: reeks niet volledig verwijderd'; end if;
end $$;

-- KG-T37 Taken: ieder lid maakt, wijzigt en markeert als verwijderd; versie loopt op; echt verwijderen,
-- vaste kolommen en eigen versies zetten kan niet via de API.
do $$ declare t text := current_setting('test.t1'); h text := current_setting('test.hs'); begin
  perform pg_temp.als('noa');
  execute format($q$ insert into public.tasks (id, household_id, title, assignee_member_id, due_date) values (%L, %L, 'Gymtas pakken', %L, '2026-10-12') $q$, t, h, current_setting('test.m_mees'));
  perform pg_temp.als('sam');
  if pg_temp.geraakt(format($q$ update public.tasks set done_on = '2026-10-12', done_by_member_id = %L where id = %L and version = 1 $q$, current_setting('test.m_sam'), t)) <> 1 then raise exception 'KG-T37: lid kan taak niet afvinken'; end if;
  if pg_temp.geraakt(format($q$ update public.tasks set title = 'Oud' where id = %L and version = 1 $q$, t)) <> 0 then raise exception 'KG-T37: verouderde versie wijzigt toch'; end if;
  if (select version from public.tasks where id = t::uuid) <> 2 then raise exception 'KG-T37: versie niet verhoogd'; end if;
  if not pg_temp.faalt(format('delete from public.tasks where id = %L', t)) then raise exception 'KG-T37: echt verwijderen via de API'; end if;
  if not pg_temp.faalt(format($q$ insert into public.tasks (household_id, title, version) values (%L, 'X', 7) $q$, h)) then raise exception 'KG-T37: eigen versie zetten'; end if;
  if not pg_temp.faalt(format($q$ update public.tasks set created_at = now() - interval '1 year' where id = %L $q$, t)) then raise exception 'KG-T37: aanmaakmoment te wijzigen'; end if;
  if not pg_temp.faalt(format($q$ insert into public.tasks (household_id, title) values (%L, '  ') $q$, h)) then raise exception 'KG-T37: taak zonder titel'; end if;
  perform pg_temp.als('noa');
  if pg_temp.geraakt(format('update public.tasks set deleted_at = now() where id = %L', t)) <> 1 then raise exception 'KG-T37: lid kan taak niet verwijderen'; end if;
  if pg_temp.aantal(format('select 1 from public.tasks where id = %L and deleted_at is not null and version = 3', t)) <> 1 then raise exception 'KG-T37: verwijdering niet gemarkeerd'; end if;
  perform pg_temp.ok('KG-T37');
end $$;

-- KG-T38 Boodschappen: geen dubbelingen (ook niet in hoofdletters of spaties), afgevinkt komt terug,
-- een herhaalde opdracht slaat niets dubbel op, en de database weigert een directe dubbeling.
do $$ declare h text := current_setting('test.hs'); u uuid[] := array[gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid()];
  v uuid[] := array[gen_random_uuid(), gen_random_uuid()]; uitkomst text; begin
  perform pg_temp.als('noa');
  select string_agg(name || ':' || outcome, ',' order by name) into uitkomst from public.add_shopping_items(h::uuid, u, array['Melk', 'melk ', ' Brood', 'Kaas  ']);
  if uitkomst <> 'Brood:nieuw,Kaas:nieuw,Melk:nieuw' then raise exception 'KG-T38: eerste toevoeging gaf %', uitkomst; end if;
  perform pg_temp.als('sam');
  if pg_temp.geraakt($q$ update public.shopping_items set checked_at = now() where name = 'Melk' $q$) <> 1 then raise exception 'KG-T38: afvinken lukt niet'; end if;
  select string_agg(name || ':' || outcome, ',' order by name) into uitkomst from public.add_shopping_items(h::uuid, v, array['MELK', 'Eieren']);
  if uitkomst <> 'Eieren:nieuw,Melk:terug' then raise exception 'KG-T38: tweede toevoeging gaf %', uitkomst; end if;
  select string_agg(name || ':' || outcome, ',' order by name) into uitkomst from public.add_shopping_items(h::uuid, v, array['MELK', 'Eieren']);
  if uitkomst <> 'Eieren:al_op_lijst,Melk:al_op_lijst' then raise exception 'KG-T38: herhaalde opdracht gaf %', uitkomst; end if;
  if not pg_temp.faalt(format($q$ insert into public.shopping_items (household_id, name) values (%L, 'brood') $q$, h)) then raise exception 'KG-T38: directe dubbeling toegestaan'; end if;
  perform pg_temp.geraakt($q$ update public.shopping_items set deleted_at = now() where name = 'Brood' $q$);
  select string_agg(name || ':' || outcome, ',') into uitkomst from public.add_shopping_items(h::uuid, array[gen_random_uuid()], array['Brood']);
  if uitkomst <> 'Brood:nieuw' then raise exception 'KG-T38: verwijderde boodschap niet opnieuw toe te voegen'; end if;
  if pg_temp.aantal(format('select 1 from public.shopping_items where household_id = %L and deleted_at is null', h)) <> 4 then raise exception 'KG-T38: verkeerd aantal op de lijst'; end if;
  if not pg_temp.faalt(format('delete from public.shopping_items where household_id = %L', h)) then raise exception 'KG-T38: echt verwijderen via de API'; end if;
  perform pg_temp.ok('KG-T38');
end $$;

-- KG-T39 Een gearchiveerd lid ziet en schrijft geen inhoud meer.
select pg_temp.als('sam');
select public.archive_member(current_setting('test.hs')::uuid, current_setting('test.m_jip')::uuid);
do $$ declare t text; h text := current_setting('test.hs'); begin
  perform pg_temp.als('jip');
  foreach t in array array['events', 'event_details', 'event_participants', 'event_exceptions', 'tasks', 'shopping_items', 'event_overview'] loop
    if pg_temp.aantal(format('select 1 from public.%I', t)) <> 0 then raise exception 'KG-T39: gearchiveerd lid ziet %', t; end if;
  end loop;
  if not pg_temp.faalt(format($q$ insert into public.tasks (household_id, title) values (%L, 'Na archiveren') $q$, h)) then raise exception 'KG-T39: gearchiveerd lid maakt een taak'; end if;
  if not pg_temp.faalt(format($q$ select public.add_shopping_items(%L, array[gen_random_uuid()], array['Na archiveren']) $q$, h)) then raise exception 'KG-T39: gearchiveerd lid voegt boodschappen toe'; end if;
  if not pg_temp.faalt(format($q$ select pg_temp.bewaar(%L, %L, null, '2026-10-12', null, null, 'household', 'Na archiveren', null) $q$, h, gen_random_uuid())) then raise exception 'KG-T39: gearchiveerd lid maakt een afspraak'; end if;
  if not pg_temp.faalt(format($q$ select pg_temp.bewaar(%L, %L, 2, '2026-10-12', null, null, 'household', 'Na archiveren', null) $q$, h, current_setting('test.e1'))) then raise exception 'KG-T39: gearchiveerd lid wijzigt een afspraak'; end if;
  perform pg_temp.ok('KG-T39');
end $$;

-- ============================== KG-5C herstelronde 1 (review van 700c3d9) ==============================
-- KG-T42 (bevinding 1) Privé-inhoud hoort bij het account, niet bij het lidprofiel. Pim maakt een
-- privé-afspraak en vertrekt; een ander account (Quinn) wordt aan Pims profiel gekoppeld en mag die
-- afspraak nooit lezen. Bij vertrek verdwijnt hij; en ook een privé-afspraak die nog aan het profiel
-- hangt (hier als postgres neergezet) blijft voor het nieuwe account "Bezet". Archiveren: niemand leest
-- de privé-afspraak; accountverwijdering ruimt hem op.
reset role;
select set_config('test.pim',   gen_random_uuid()::text, true);
select set_config('test.quinn', gen_random_uuid()::text, true);
select set_config('test.rik',   gen_random_uuid()::text, true);
select set_config('test.e_pim', gen_random_uuid()::text, true);
select set_config('test.e_bind', gen_random_uuid()::text, true);
select set_config('test.e_rik', gen_random_uuid()::text, true);
insert into auth.users (id, email) values
  (current_setting('test.pim')::uuid,   'pim@test.invalid'),
  (current_setting('test.quinn')::uuid, 'quinn@test.invalid'),
  (current_setting('test.rik')::uuid,   'rik@test.invalid');
set local role authenticated;
select pg_temp.als('sam');
select set_config('test.tok_pim', public.create_invite(current_setting('test.hs')::uuid), true);
select set_config('test.tok_rik', public.create_invite(current_setting('test.hs')::uuid), true);
select pg_temp.als('pim');
select public.accept_invite(current_setting('test.tok_pim'), 'Pim');
select set_config('test.m_pim', (select member_id from public.my_memberships() where household_id = current_setting('test.hs')::uuid)::text, true);
select pg_temp.bewaar(current_setting('test.hs'), current_setting('test.e_pim'), null, '2026-10-15', '09:00', '10:00', 'private', 'Pim-geheim', null, null, 'Pim-plek-geheim');
select public.leave_household(current_setting('test.hs')::uuid);
select pg_temp.als('sam');
select set_config('test.tok_quinn', public.create_invite(current_setting('test.hs')::uuid, current_setting('test.m_pim')::uuid), true);
select pg_temp.als('quinn');
select public.accept_invite(current_setting('test.tok_quinn'), null);
reset role;
-- Een privé-afspraak die nog aan het profiel hangt maar van het vorige account is (bijv. een
-- toekomstige route die niets opruimt): het nieuwe account mag hem niet lezen.
insert into public.events (id, household_id, owner_member_id, owner_user_id, visibility, start_date)
  values (current_setting('test.e_bind')::uuid, current_setting('test.hs')::uuid, current_setting('test.m_pim')::uuid,
          current_setting('test.pim')::uuid, 'private', '2026-10-16');
insert into public.event_details (event_id, household_id, title, notes)
  values (current_setting('test.e_bind')::uuid, current_setting('test.hs')::uuid, 'Binding-geheim', 'Binding-notitie-geheim');
set local role authenticated;
do $$ declare r record; begin
  perform pg_temp.als('quinn');
  if (select member_id from public.my_memberships() where household_id = current_setting('test.hs')::uuid) <> current_setting('test.m_pim')::uuid then raise exception 'KG-T42: opzet: Quinn niet aan Pims profiel gekoppeld'; end if;
  if pg_temp.aantal($q$ select 1 from public.event_details where title like '%Pim-geheim%' or location like '%geheim%' $q$) <> 0 then raise exception 'KG-T42: nieuw account leest privé-afspraak van het vorige account'; end if;
  if pg_temp.aantal(format('select 1 from public.event_overview where id = %L', current_setting('test.e_pim'))) <> 0 then raise exception 'KG-T42: privé-afspraak bleef na vertrek bestaan'; end if;
  if pg_temp.aantal(format('select 1 from public.event_details where event_id = %L', current_setting('test.e_bind'))) <> 0 then raise exception 'KG-T42: privé-inhoud volgt het profiel in plaats van het account'; end if;
  select * into r from public.event_overview where id = current_setting('test.e_bind')::uuid;
  if not r.is_busy or r.title is not null or r.notes is not null then raise exception 'KG-T42: view toont privé-inhoud van het vorige account'; end if;
  if pg_temp.fout(format($q$ select pg_temp.bewaar(%L, %L, 1, '2026-10-16', null, null, 'household', 'Openbaar gemaakt', null) $q$, current_setting('test.hs'), current_setting('test.e_bind'))) <> 'P0002' then raise exception 'KG-T42: nieuw account kan privé-afspraak van het vorige account wijzigen of openbaar maken'; end if;
  if pg_temp.fout(format($q$ select public.delete_event(%L, 1) $q$, current_setting('test.e_bind'))) <> 'P0002' then raise exception 'KG-T42: nieuw account kan privé-afspraak van het vorige account verwijderen'; end if;
  -- Archiveren: Rik maakt een privé-afspraak en wordt gearchiveerd; niemand leest hem.
  perform pg_temp.als('rik');
  perform public.accept_invite(current_setting('test.tok_rik'), 'Rik');
  perform pg_temp.bewaar(current_setting('test.hs'), current_setting('test.e_rik'), null, '2026-10-17', null, null, 'private', 'Rik-geheim', null);
  perform pg_temp.als('sam');
  perform public.archive_member(current_setting('test.hs')::uuid, (select id from public.household_members where household_id = current_setting('test.hs')::uuid and display_name = 'Rik'));
  if pg_temp.aantal($q$ select 1 from public.event_details where title = 'Rik-geheim' $q$) <> 0 then raise exception 'KG-T42: privé-afspraak van gearchiveerd lid leesbaar'; end if;
  perform pg_temp.als('rik');
  if pg_temp.aantal('select 1 from public.event_details') <> 0 then raise exception 'KG-T42: gearchiveerd lid leest nog details'; end if;
end $$;
reset role;
set constraints all immediate;
do $$ begin
  delete from auth.users where id = current_setting('test.rik')::uuid;
  if exists (select 1 from public.events where id = current_setting('test.e_rik')::uuid) then raise exception 'KG-T42: privé-afspraak van verwijderd (gearchiveerd) account blijft'; end if;
  -- Geen enkele kolom met een account-ID (ook owner_user_id niet) is leesbaar via de API.
  if has_column_privilege('authenticated', 'public.events', 'owner_user_id', 'select') then raise exception 'KG-T42: owner_user_id leesbaar'; end if;
  perform pg_temp.ok('KG-T42');
end $$;
set constraints all deferred;
set local role authenticated;

-- KG-T43 (bevinding 2) Een gedeelde reeks verwijderen laat andermans privé-voorkomens staan (eigen
-- zichtbaarheid) en neemt de gedeelde en eigen voorkomens wel mee.
select set_config('test.s2', gen_random_uuid()::text, true);
select set_config('test.o5', gen_random_uuid()::text, true);
select set_config('test.o6', gen_random_uuid()::text, true);
select pg_temp.als('sam');
select pg_temp.bewaar(current_setting('test.hs'), current_setting('test.s2'), null, '2026-11-07', '09:00', '10:00', 'private', 'Sam-reeks-geheim', null, 'weekly');
select public.edit_occurrence(current_setting('test.s2')::uuid, '2026-11-14', current_setting('test.o5')::uuid, '2026-11-15', null, null, null, 'Sam-los-geheim', null, null, null, null);
select pg_temp.bewaar(current_setting('test.hs'), current_setting('test.s2'), (select version from public.events where id = current_setting('test.s2')::uuid), '2026-11-07', '09:00', '10:00', 'household', 'Gedeelde reeks', null, 'weekly');
select pg_temp.als('noa');
select public.edit_occurrence(current_setting('test.s2')::uuid, '2026-11-21', current_setting('test.o6')::uuid, '2026-11-22', null, null, null, 'Gedeeld los', null, null, null, null);
do $$ declare s text := current_setting('test.s2'); begin
  perform pg_temp.als('noa');
  if (select is_busy from public.event_overview where id = current_setting('test.o5')::uuid) is not true then raise exception 'KG-T43: opzet: Noa ziet Sams privé-voorkomen'; end if;
  perform public.delete_event(s::uuid, (select version from public.events where id = s::uuid));
  if pg_temp.aantal(format('select 1 from public.events where id = %L and deleted_at is null', current_setting('test.o5'))) <> 1 then raise exception 'KG-T43: privé-voorkomen van een ander verwijderd via de gedeelde reeks'; end if;
  if pg_temp.aantal(format('select 1 from public.events where id in (%L, %L) and deleted_at is null', s, current_setting('test.o6'))) <> 0 then raise exception 'KG-T43: reeks of gedeeld voorkomen niet verwijderd'; end if;
  if pg_temp.aantal(format('select 1 from public.event_details where event_id = %L', current_setting('test.o5'))) <> 0 then raise exception 'KG-T43: details van het privé-voorkomen zichtbaar'; end if;
  perform pg_temp.als('sam');
  if (select title from public.event_overview where id = current_setting('test.o5')::uuid) is distinct from 'Sam-los-geheim' then raise exception 'KG-T43: eigenaar ziet het privé-voorkomen niet meer'; end if;
  perform pg_temp.ok('KG-T43');
end $$;

-- KG-T44 (bevinding 3) De database zelf weigert twee actieve voorkomens van dezelfde reeks op één dag,
-- ook als de controle in de functie zou worden omzeild (de race staat in gelijktijdig.test.mjs).
reset role;
do $$ declare s text := current_setting('test.s1'); begin
  -- Reeks s1 is verwijderd (KG-T36); gebruik een nieuwe reeks met twee losse voorkomens.
  perform set_config('test.s3', gen_random_uuid()::text, true);
  insert into public.events (id, household_id, owner_member_id, owner_user_id, start_date, recurrence_freq)
    values (current_setting('test.s3')::uuid, current_setting('test.hs')::uuid, current_setting('test.m_sam')::uuid, current_setting('test.sam')::uuid, '2026-12-05', 'weekly');
  insert into public.events (household_id, owner_member_id, start_date, series_id, original_date)
    values (current_setting('test.hs')::uuid, current_setting('test.m_sam')::uuid, '2026-12-13', current_setting('test.s3')::uuid, '2026-12-12');
  if not pg_temp.faalt(format($q$ insert into public.events (household_id, owner_member_id, start_date, series_id, original_date) values (%L, %L, '2026-12-13', %L, '2026-12-19') $q$, current_setting('test.hs'), current_setting('test.m_sam'), current_setting('test.s3'))) then raise exception 'KG-T44: twee actieve voorkomens van een reeks op één dag'; end if;
  perform pg_temp.ok('KG-T44');
end $$;
set local role authenticated;

-- KG-T40 Catalogus inhoud: geen delete-recht, afspraken alleen via functies, view met security_invoker,
-- en elke inhoudsfunctie vergrendelt het huishouden vóór de lidmaatschapscontrole.
reset role;
do $$ declare r record; f text; def text; begin
  for r in select c.oid::regclass::text as t from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind in ('r', 'v')
             and (has_table_privilege('authenticated', c.oid, 'delete') or has_table_privilege('authenticated', c.oid, 'truncate')) loop
    raise exception 'KG-T40: authenticated mag verwijderen uit %', r.t;
  end loop;
  foreach f in array array['public.events', 'public.event_details', 'public.event_participants', 'public.event_exceptions', 'public.event_overview'] loop
    if has_table_privilege('authenticated', f, 'insert') or has_table_privilege('authenticated', f, 'update') then raise exception 'KG-T40: % schrijfbaar buiten de functies om', f; end if;
    if has_any_column_privilege('authenticated', f, 'insert') or has_any_column_privilege('authenticated', f, 'update') then raise exception 'KG-T40: kolommen van % schrijfbaar', f; end if;
  end loop;
  if not exists (select 1 from pg_class where oid = 'public.event_overview'::regclass and 'security_invoker=true' = any (reloptions)) then raise exception 'KG-T40: event_overview zonder security_invoker'; end if;
  foreach f in array array['save_event', 'lock_event', 'add_shopping_items', 'guard_content'] loop
    select pg_get_functiondef(p.oid) into def from pg_proc p where p.pronamespace = 'private'::regnamespace and p.proname = f;
    if def is null or position('private.lock_household_shared(' in def) = 0 then raise exception 'KG-T40: private.% vergrendelt het huishouden niet', f; end if;
    if position('private.my_member_id(' in def) between 1 and position('private.lock_household_shared(' in def)
       or position('private.is_active_member(' in def) between 1 and position('private.lock_household_shared(' in def) then
      raise exception 'KG-T40: private.% controleert het lidmaatschap vóór de vergrendeling', f;
    end if;
  end loop;
  foreach f in array array['edit_occurrence', 'delete_occurrence', 'delete_event'] loop
    select pg_get_functiondef(p.oid) into def from pg_proc p where p.pronamespace = 'private'::regnamespace and p.proname = f;
    if position('private.lock_event(' in def) = 0 then raise exception 'KG-T40: private.% gebruikt lock_event niet', f; end if;
  end loop;
  perform pg_temp.ok('KG-T40');
end $$;

-- KG-T41 Verwijderen (AVG): bij het verwijderen van een account verdwijnen diens privé-afspraken echt;
-- gedeelde inhoud blijft bij het huishouden. Een verwijderd huishouden neemt alle inhoud mee.
set constraints all immediate;
do $$ declare h text := current_setting('test.hs'); t text; begin
  delete from auth.users where id = current_setting('test.noa')::uuid;
  if exists (select 1 from public.events where id = current_setting('test.e3')::uuid) or exists (select 1 from public.event_details where event_id = current_setting('test.e3')::uuid) then raise exception 'KG-T41: privé-afspraak van verwijderd account blijft'; end if;
  if not exists (select 1 from public.events where id = current_setting('test.e1')::uuid) or not exists (select 1 from public.tasks where id = current_setting('test.t1')::uuid) then raise exception 'KG-T41: gedeelde inhoud verdwenen'; end if;
  if not exists (select 1 from public.events where id = current_setting('test.e2')::uuid) then raise exception 'KG-T41: privé-afspraak van een ander verdwenen'; end if;
  perform pg_temp.als('sam');
  set local role authenticated;
  perform public.delete_household(h::uuid);
  reset role;
  foreach t in array array['events', 'event_details', 'event_participants', 'event_exceptions', 'tasks', 'shopping_items'] loop
    if pg_temp.aantal(format('select 1 from public.%I where household_id = %L', t, h)) <> 0 then raise exception 'KG-T41: % blijft na verwijderen huishouden', t; end if;
  end loop;
  if pg_temp.aantal(format('select 1 from public.events where household_id = %L', current_setting('test.hr'))) <> 1 then raise exception 'KG-T41: ander huishouden aangetast'; end if;
  perform pg_temp.ok('KG-T41');
end $$;
set constraints all deferred;

select 'KG-RLS-tests geslaagd: ' || current_setting('test.aantal') || ' van 44' as resultaat;

rollback;
