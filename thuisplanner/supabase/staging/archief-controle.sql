-- Thuisplanner-staging: na de nachtelijke run (03:17 UTC) controleren of de verwijdering na 30 dagen heeft gewerkt.
-- Alleen lezen. Hoort bij archief-proef.sql (docs/thuisplanner-staging.md, stap 9).
--
-- Verwacht:
--   - de geplande taak bestaat en de laatste run is geslaagd ("succeeded");
--   - Proef 31: 0 privé-afspraken, 1 gedeelde afspraak, profiel nog gearchiveerd aanwezig;
--   - Proef 29: 1 privé-afspraak, 1 gedeelde afspraak.

select jobname, schedule, command, active from cron.job where jobname = 'thuisplanner-archief-opruimen';

select d.status, d.return_message, d.start_time, d.end_time
  from cron.job_run_details d join cron.job j on j.jobid = d.jobid
  where j.jobname = 'thuisplanner-archief-opruimen'
  order by d.start_time desc limit 3;

select m.display_name, m.status, round(extract(epoch from now() - m.archived_at) / 86400) as dagen_gearchiveerd,
       count(e.*) filter (where e.visibility = 'private') as prive_afspraken,
       count(e.*) filter (where e.visibility = 'household') as gedeelde_afspraken
  from public.household_members m
  left join public.events e on e.owner_member_id = m.id and e.household_id = m.household_id
  where m.display_name in ('Proef 31', 'Proef 29')
  group by m.display_name, m.status, m.archived_at
  order by m.display_name;
