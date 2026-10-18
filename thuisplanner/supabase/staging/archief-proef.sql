-- Thuisplanner-staging: de automatische verwijdering na 30 dagen controleren (docs/thuisplanner-staging.md, stap 9).
--
-- Zet twee VERZONNEN proefleden klaar in het testhuishouden: elk met één privé- en één gedeelde afspraak, daarna
-- gearchiveerd, met een archiefdatum van 31 dagen (moet opgeruimd worden) en 29 dagen (moet blijven). Daarna
-- doet de nachtelijke pg_cron-taak (03:17 UTC) het werk; controleer de volgende dag met archief-controle.sql.
--
-- Vooraf, in het dashboard van het STAGINGproject:
--   1. Authentication → Users → Add user → twee proefaccounts, bijvoorbeeld proef31@example.com en
--      proef29@example.com (sterk wachtwoord, Auto Confirm User aan). Niemand hoeft ermee in te loggen.
--   2. Hieronder het e-mailadres van de eigenaar van het testhuishouden invullen (tester 1 uit testers.sql).
-- Alleen de archiefdatum wordt rechtstreeks gezet; al het andere gaat via de gewone functies en hun regels.

begin;

-- ▼▼ invullen ▼▼
select set_config('tp.eigenaar', 'tester1@example.com', true);
select set_config('tp.proef31', 'proef31@example.com', true);
select set_config('tp.proef29', 'proef29@example.com', true);
-- ▲▲ invullen ▲▲

do $$
declare
  e uuid := (select id from auth.users where lower(email) = lower(current_setting('tp.eigenaar')));
  p31 uuid := (select id from auth.users where lower(email) = lower(current_setting('tp.proef31')));
  p29 uuid := (select id from auth.users where lower(email) = lower(current_setting('tp.proef29')));
  h uuid;
begin
  if e is null or p31 is null or p29 is null then raise exception 'Eigenaar of proefaccount niet gevonden; maak ze eerst aan'; end if;
  select m.household_id into h from public.household_members m
    where m.user_id = e and m.role = 'owner' and m.status = 'active' order by m.created_at limit 1;
  if h is null then raise exception 'Deze eigenaar heeft geen testhuishouden; draai eerst testers.sql'; end if;
  perform set_config('tp.e', e::text, true);
  perform set_config('tp.p31', p31::text, true);
  perform set_config('tp.p29', p29::text, true);
  perform set_config('tp.h', h::text, true);
end $$;

set local role authenticated;
do $$
declare
  h uuid := current_setting('tp.h')::uuid;
  wie text;
  tok text;
  m uuid;
begin
  foreach wie in array array['p31', 'p29'] loop
    -- De eigenaar nodigt het proefaccount uit; het proefaccount accepteert en zet twee afspraken.
    perform set_config('request.jwt.claims', json_build_object('sub', current_setting('tp.e'), 'role', 'authenticated')::text, true);
    tok := public.create_invite(h, null, 'member', 1);
    perform set_config('request.jwt.claims', json_build_object('sub', current_setting('tp.' || wie), 'role', 'authenticated')::text, true);
    perform public.accept_invite(tok, 'Proef ' || substr(wie, 2));
    m := (select mm.member_id from public.my_memberships() mm where mm.household_id = h);
    perform set_config('tp.m_' || wie, m::text, true);
    perform public.save_event(h, gen_random_uuid(), null, current_date + 7, '09:00', null, '10:00', 'private',
      'Proef ' || substr(wie, 2) || ' privé', null, null, null, null, null, null);
    perform public.save_event(h, gen_random_uuid(), null, current_date + 7, '19:00', null, '20:00', 'household',
      'Proef ' || substr(wie, 2) || ' gedeeld', null, null, null, null, null, null);
    -- De eigenaar archiveert het proeflid (archiveren wist niets).
    perform set_config('request.jwt.claims', json_build_object('sub', current_setting('tp.e'), 'role', 'authenticated')::text, true);
    perform public.archive_member(h, m);
  end loop;
end $$;
reset role;

-- Alleen hier rechtstreeks: de archiefdatum terugzetten, zodat de termijn van 30 dagen verstreken is (of net niet).
update public.household_members set archived_at = now() - interval '31 days' where id = current_setting('tp.m_p31')::uuid;
update public.household_members set archived_at = now() - interval '29 days' where id = current_setting('tp.m_p29')::uuid;

select display_name, status, round(extract(epoch from now() - archived_at) / 86400) as dagen_gearchiveerd,
       (select count(*) from public.events e where e.owner_member_id = m.id and e.visibility = 'private') as prive_afspraken
  from public.household_members m where m.id in (current_setting('tp.m_p31')::uuid, current_setting('tp.m_p29')::uuid)
  order by display_name;

commit;
