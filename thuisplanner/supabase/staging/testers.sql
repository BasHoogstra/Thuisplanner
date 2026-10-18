-- Thuisplanner-staging: twee testers in één testhuishouden zetten (docs/thuisplanner-staging.md, stap 6).
--
-- Waarom zo: op staging staat publieke registratie uit en de app heeft nog geen schermen om een huishouden aan te
-- maken of iemand uit te nodigen (KG-5H). Dit script gebruikt daarom dezelfde functies als de app later zal doen
-- (create_household, create_invite, accept_invite), mét alle regels en controles; er wordt niets direct in de
-- tabellen gezet en er is geen service-rolsleutel nodig.
--
-- Gebruik (één keer, in het Supabase-dashboard van het STAGINGproject):
--   1. Authentication → Users → Add user → Create new user, voor beide testers: e-mailadres, een sterk
--      wachtwoord en "Auto Confirm User" aan. (Registratie via de app staat uit; dit kan alleen de beheerder.)
--   2. SQL Editor → dit script plakken → de vier waarden hieronder invullen → Run.
--   3. Klaar als de laatste regel "testhuishouden klaar" toont. Draai het niet nog een keer: dan komt er een
--      tweede huishouden bij.
-- Nooit op een ander project dan Thuisplanner-staging draaien. Gebruik alleen verzonnen namen in de app.

begin;

-- ▼▼ invullen ▼▼
select set_config('tp.email_1', 'tester1@example.com', true);   -- wordt eigenaar
select set_config('tp.email_2', 'tester2@example.com', true);   -- wordt beheerder
select set_config('tp.naam_1', 'Tester 1', true);               -- weergavenaam in de app
select set_config('tp.naam_2', 'Tester 2', true);
select set_config('tp.huishouden', 'Testgezin', true);
-- ▲▲ invullen ▲▲

do $$
declare
  a uuid := (select id from auth.users where lower(email) = lower(current_setting('tp.email_1')));
  b uuid := (select id from auth.users where lower(email) = lower(current_setting('tp.email_2')));
begin
  if a is null or b is null then
    raise exception 'Maak eerst beide testers aan (Authentication → Users → Add user); niet gevonden: %',
      concat_ws(', ', case when a is null then current_setting('tp.email_1') end, case when b is null then current_setting('tp.email_2') end);
  end if;
  if a = b then raise exception 'Twee verschillende testers nodig'; end if;
  perform set_config('tp.a', a::text, true);
  perform set_config('tp.b', b::text, true);
end $$;

set local role authenticated;
-- Tester 1 maakt het huishouden en een uitnodiging voor een beheerder.
select set_config('request.jwt.claims', json_build_object('sub', current_setting('tp.a'), 'role', 'authenticated')::text, true);
select set_config('tp.h', public.create_household(current_setting('tp.huishouden'), current_setting('tp.naam_1'))::text, true);
select set_config('tp.tok', public.create_invite(current_setting('tp.h')::uuid, null, 'admin', 1), true);
-- Tester 2 accepteert die uitnodiging.
select set_config('request.jwt.claims', json_build_object('sub', current_setting('tp.b'), 'role', 'authenticated')::text, true);
select public.accept_invite(current_setting('tp.tok'), current_setting('tp.naam_2'));
reset role;

select 'testhuishouden klaar: ' || h.name || ' (' || count(m.*) || ' leden met account)'
  from public.households h join public.household_members m on m.household_id = h.id and m.user_id is not null
  where h.id = current_setting('tp.h')::uuid group by h.name;

commit;
