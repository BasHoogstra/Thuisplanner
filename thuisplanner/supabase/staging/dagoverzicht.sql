-- Thuisplanner: het dagoverzicht voor de bewaking tijdens de bèta (docs/thuisplanner-beta-voorbereiding.md §7).
-- ALLEEN LEZEND, ALLEEN AANTALLEN: nooit een adres, hash, code, token of account-id.
--
-- Gebruik: dagelijks (5 minuten) in de SQL-editor van het juiste project (kijk het kenmerk na); kopiëren en uitvoeren.
-- Elke regel is één onderdeel met een waarde en, waar dat kan, een "let op" als de waarde aandacht vraagt.
--
-- De periode is de afgelopen 24 uur. Codes staan hoogstens 24 uur in de database (k1_opruimen); de tellers per adres
-- beschrijven het lopende venster van de grenzen (k1_grenzen: H, U, D en de aanvraaggrenzen per kwartier en per dag).
-- Wat er niet in kan, omdat de database het niet bijhoudt: het aantal geweigerde codeaanvragen ('te-vaak') en het aantal
-- verwijderde onbevestigde accounts. De eerste is te zien als "adressen aan de aanvraaggrens"; de tweede in het logboek
-- van de geplande taak (aantal opgeruimde rijen staat niet apart).
--
-- Eén select: schrijft niets (de test voert hem uit in een alleen-lezende transactie en toetst dat er geen adres in staat).
with g as (select * from private.k1_grenzen where id = 1),
codes as (select * from private.k1_codes where gemaakt > now() - interval '24 hours'),
tellers as (select a.* from private.k1_accounts a, g where a.venster_start > now() - g.venster),
mail as (select * from private.uitnodigingsmail_stand()),
taken as (
  select j.jobname,
         (select d.status from cron.job_run_details d where d.jobid = j.jobid order by d.start_time desc limit 1) as status,
         (select d.start_time from cron.job_run_details d where d.jobid = j.jobid order by d.start_time desc limit 1) as laatst,
         j.active
  from cron.job j where j.jobname like 'thuisplanner-%'
),
regels (volgorde, onderdeel, waarde, let_op) as (
  -- Codes (inloggen en registreren)
  select 10, 'codes aangevraagd (24 uur)', (select count(*) from codes)::text, null::text
  union all select 11, 'codes gebruikt, dus geslaagde inlog of registratie (24 uur)', (select count(*) from codes where status = 'gebruikt')::text, null
  union all select 12, 'codepogingen gecontroleerd (24 uur)', (select coalesce(sum(pogingen), 0) from codes)::text, null
  union all select 13, 'codes vervallen na te veel fouten (24 uur)', (select count(*) from codes, g where status = 'vervallen' and pogingen >= g.per_code)::text,
    case when (select count(*) from codes, g where status = 'vervallen' and pogingen >= g.per_code) > 3 then 'let op: mogelijk raden' end
  -- Geremd door de grenzen
  union all select 20, 'adressen geremd door H (alle pogingen op)', (select count(*) from tellers, g where tellers.totaal >= g.h_totaal)::text,
    case when (select count(*) from tellers, g where tellers.totaal >= g.h_totaal) > 0 then 'let op: vergrendeld adres' end
  union all select 21, 'adressen geremd door U (pogingen van onbekende toestellen op)', (select count(*) from tellers, g where tellers.onbekend >= g.u_onbekend)::text,
    case when (select count(*) from tellers, g where tellers.onbekend >= g.u_onbekend) > 0 then 'let op' end
  union all select 22, 'toestellen geremd door D', (select count(*) from private.k1_toestellen t, g
    where not t.ingetrokken and t.venster_start > now() - g.venster and t.fout >= g.d_toestel)::text, null
  union all select 23, 'adressen aan de aanvraaggrens (kwartier of dag)', (select count(*) from private.k1_accounts a, g
    where (a.kwartier_start > now() - interval '15 minutes' and a.aanvragen_kwartier >= g.aanvragen_kwartier)
       or (a.dag_start > now() - interval '24 hours' and a.aanvragen_dag >= g.aanvragen_dag))::text, null
  -- Accounts
  union all select 30, 'nieuwe accounts (24 uur)', (select count(*) from auth.users where created_at > now() - interval '24 hours')::text, null
  union all select 31, 'waarvan nog onbevestigd', (select count(*) from auth.users where created_at > now() - interval '24 hours' and email_confirmed_at is null)::text, null
  union all select 32, 'accounts geblokkeerd in Supabase Auth', (select count(*) from auth.users where banned_until > now())::text,
    case when (select count(*) from auth.users where banned_until > now()) > 0 then 'let op' end
  union all select 33, 'accounts in totaal', (select count(*) from auth.users)::text, null
  union all select 34, 'huishoudens in totaal', (select count(*) from public.households)::text, null
  -- De mailwachtrij (private.uitnodigingsmail_stand)
  union all select 40, 'uitnodigingsmails langer dan 10 minuten wachtend', (select wacht_lang from mail)::text, case when (select wacht_lang from mail) > 0 then 'let op' end
  union all select 41, 'uitnodigingsmails vastgelopen (bezig over de termijn)', (select bezig_over_termijn from mail)::text, case when (select bezig_over_termijn from mail) > 0 then 'let op' end
  union all select 42, 'uitnodigingsmails onzeker (7 dagen)', (select onzeker from mail)::text, case when (select onzeker from mail) > 0 then 'let op' end
  union all select 43, 'uitnodigingsmails mislukt (7 dagen)', (select mislukt from mail)::text, case when (select mislukt from mail) > 0 then 'let op' end
  union all select 44, 'uitnodigingsmails niet bezorgd (7 dagen)', (select niet_bezorgd from mail)::text, case when (select niet_bezorgd from mail) > 0 then 'let op' end
  -- De geplande taken: de laatste run van elke taak
  union all select 50, 'geplande taak ' || jobname, coalesce(status, 'nog niet gelopen') || coalesce(' op ' || to_char(laatst at time zone 'Europe/Amsterdam', 'YYYY-MM-DD HH24:MI'), ''),
    case when not active then 'let op: staat uit'
         when status is distinct from 'succeeded' then 'let op'
         when jobname <> 'thuisplanner-uitnodigingsmails-versturen' and laatst < now() - interval '26 hours' then 'let op: niet gelopen'
         when jobname = 'thuisplanner-uitnodigingsmails-versturen' and laatst < now() - interval '10 minutes' then 'let op: niet gelopen' end
  from taken
  union all select 59, 'geplande taken van Thuisplanner', (select count(*) from taken)::text,
    case when (select count(*) from taken) <> 6 then 'let op: verwacht 6' end
)
select onderdeel, waarde, coalesce(let_op, '') as let_op from regels order by volgorde, onderdeel;
