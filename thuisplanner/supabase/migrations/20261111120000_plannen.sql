-- Thuisplanner · Plannen (besluit 18; docs/thuisplanner-plannen.md §5 en §6.2), de eerste echte versie voor de gezinsbèta.
-- ALLEEN LOKAAL, op een eigen stack. Niet naar staging of de bèta zonder een afzonderlijk akkoord.
--
-- Productbeslissingen (besluit 18, aangevuld door Bas op 10 november 2026):
--  1. Een plan is gedeeld binnen het huishouden (ieder actief lid leest en wijzigt), zoals vakanties. Geen persoonlijke
--     plannen en geen koppeling tussen huishoudens.
--  2. Een taak in een plan is een gewone taak (tasks.plan_id), zoals een vakantievoorbereiding (tasks.trip_id): één
--     vinkje overal. Hoogstens één context per taak: een vakantie óf een plan.
--  3. Eén verantwoordelijke per taak in deze versie (de bestaande assignee_member_id); geen task_members.
--  4. Geen bijlagen in deze versie.
--  5. Onderdelen (plan_sections) zijn optioneel; een taak in een onderdeel hoort bij hetzelfde plan.
--  6. "Bezig" is started_on; afgerond blijft alleen done_on. Afvinken maakt Bezig leeg: geen tweede waarheid.
--  7. Voortgang en de stand van een plan worden in de app berekend, nooit opgeslagen. closed_on is alleen "afgerond" dat
--     de gebruiker zelf zet.
--  8. Een plan verwijderen: de taken blijven als losse taken (standaard), of gaan mee ("plan en taken"); in één transactie.
--
-- Schrijven via de API (kolomrechten + RLS + guard_content), zoals Vakanties; verwijderen = markeren (deleted_at), geen
-- delete-recht. Seintjes via ping_content: alleen {t, id, v, op}.

-- ---------------------------------------------------------------------------------------------
-- Tabellen
-- ---------------------------------------------------------------------------------------------
create table public.plans (
  id uuid primary key default gen_random_uuid(),     -- de app maakt de UUID
  household_id uuid not null references public.households(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 100),
  description text check (description is null or char_length(description) <= 4000),
  due_date date,
  -- Wie het oppakt; leeg = het hele huishouden. Actieve leden van dit huishouden (guard_plan).
  member_ids uuid[] not null default '{}' check (cardinality(member_ids) <= 50),
  closed_on date,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint plans_household_id_key unique (household_id, id)
);
create index plans_household_idx on public.plans (household_id, due_date);

create table public.plan_sections (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  plan_id uuid not null,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  position integer not null default 0,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint plan_sections_household_id_key unique (household_id, id),
  constraint plan_sections_plan_key unique (household_id, plan_id, id),
  constraint plan_sections_plan_fkey foreign key (household_id, plan_id)
    references public.plans (household_id, id) on delete cascade
);
create index plan_sections_plan_idx on public.plan_sections (household_id, plan_id, position);

alter table public.tasks add column plan_id uuid;
alter table public.tasks add column plan_section_id uuid;
alter table public.tasks add column started_on date;
alter table public.tasks add constraint tasks_plan_fkey foreign key (household_id, plan_id)
  references public.plans (household_id, id) on delete set null (plan_id);
-- Een onderdeel hoort bij hetzelfde plan (samengestelde verwijzing; met een leeg plan_id zou die niets toetsen, vandaar
-- de check eronder).
alter table public.tasks add constraint tasks_plan_section_fkey foreign key (household_id, plan_id, plan_section_id)
  references public.plan_sections (household_id, plan_id, id) on delete set null (plan_section_id);
alter table public.tasks add constraint tasks_plan_section_check check (plan_section_id is null or plan_id is not null);
alter table public.tasks add constraint tasks_een_context_check check (trip_id is null or plan_id is null);
create index tasks_plan_idx on public.tasks (household_id, plan_id) where plan_id is not null;

-- ---------------------------------------------------------------------------------------------
-- Bewaking
-- ---------------------------------------------------------------------------------------------
-- Plannen: wie het oppakt, moeten actieve leden zijn (security definer: check_participants is niet via de API aan te roepen).
create function private.guard_plan()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' or new.member_ids is distinct from old.member_ids then
    perform private.check_participants(new.household_id, new.member_ids);
  end if;
  return new;
end $$;

-- Onderdelen: het plan ligt vast.
create function private.guard_plan_section()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and new.plan_id <> old.plan_id then
    raise exception 'Vaste kolommen kunnen niet veranderen' using errcode = '42501';
  end if;
  return new;
end $$;

-- Een plan (en onderdeel) om aan te koppelen: in een eigen huishouden, bestaat, niet verwijderd. Vergrendeld (for share),
-- zodat koppelen en tegelijk verwijderen niet kunnen kruisen. Security definer: alleen voor de taakbewaking hieronder.
create function private.plan_koppelbaar(p_household uuid, p_plan uuid, p_section uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.plans p where p.household_id = p_household and p.id = p_plan and p.deleted_at is null
    and p.household_id in (select private.my_household_ids()) for share;
  if not found then return false; end if;
  if p_section is not null then
    perform 1 from public.plan_sections s where s.household_id = p_household and s.plan_id = p_plan and s.id = p_section
      and s.deleted_at is null for share;
    if not found then return false; end if;
  end if;
  return true;
end $$;

-- Taken: via de API alleen koppelen aan een bestaand, niet verwijderd plan (en onderdeel). Afvinken maakt Bezig leeg.
-- Invoker: current_user moet de echte rol zijn.
create function private.guard_task_plan()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.done_on is not null then new.started_on := null; end if;
  if current_user in ('anon', 'authenticated') and new.plan_id is not null
     and (tg_op = 'INSERT' or new.plan_id is distinct from old.plan_id or new.plan_section_id is distinct from old.plan_section_id)
     and not private.plan_koppelbaar(new.household_id, new.plan_id, new.plan_section_id) then
    raise exception 'Plan niet gevonden' using errcode = '42501';
  end if;
  return new;
end $$;

revoke all on function private.guard_plan(), private.guard_plan_section(), private.guard_task_plan() from public, anon, authenticated;
revoke all on function private.plan_koppelbaar(uuid, uuid, uuid) from public, anon;
grant execute on function private.plan_koppelbaar(uuid, uuid, uuid) to authenticated;

create trigger plans_guard before insert or update on public.plans
  for each row execute function private.guard_content();
create trigger plans_refs before insert or update on public.plans
  for each row execute function private.guard_plan();
create trigger plan_sections_guard before insert or update on public.plan_sections
  for each row execute function private.guard_content();
create trigger plan_sections_refs before insert or update on public.plan_sections
  for each row execute function private.guard_plan_section();
create trigger tasks_plan_refs before insert or update of plan_id, plan_section_id, started_on, done_on on public.tasks
  for each row execute function private.guard_task_plan();

create trigger plans_ping after insert or update or delete on public.plans
  for each row execute function private.ping_content();
create trigger plan_sections_ping after insert or update or delete on public.plan_sections
  for each row execute function private.ping_content();

-- ---------------------------------------------------------------------------------------------
-- Row Level Security en rechten
-- ---------------------------------------------------------------------------------------------
alter table public.plans enable row level security;
alter table public.plan_sections enable row level security;

revoke all on table public.plans, public.plan_sections from public, anon, authenticated;

grant select, insert (id, household_id, title, description, due_date, member_ids, closed_on),
  update (title, description, due_date, member_ids, closed_on, deleted_at)
  on public.plans to authenticated;
grant select, insert (id, household_id, plan_id, name, position), update (name, position, deleted_at)
  on public.plan_sections to authenticated;
grant insert (plan_id, plan_section_id, started_on), update (plan_id, plan_section_id, started_on) on public.tasks to authenticated;

create policy plans_select on public.plans for select to authenticated
  using (household_id in (select private.my_household_ids()));
create policy plans_insert on public.plans for insert to authenticated
  with check (household_id in (select private.my_household_ids()));
create policy plans_update on public.plans for update to authenticated
  using (household_id in (select private.my_household_ids()))
  with check (household_id in (select private.my_household_ids()));
create policy plan_sections_select on public.plan_sections for select to authenticated
  using (household_id in (select private.my_household_ids()));
create policy plan_sections_insert on public.plan_sections for insert to authenticated
  with check (household_id in (select private.my_household_ids()));
create policy plan_sections_update on public.plan_sections for update to authenticated
  using (household_id in (select private.my_household_ids()))
  with check (household_id in (select private.my_household_ids()));

-- ---------------------------------------------------------------------------------------------
-- Een plan verwijderen (en terugzetten), een onderdeel verwijderen
-- ---------------------------------------------------------------------------------------------
-- p_with_tasks false (standaard): de taken blijven als losse taken (plan en onderdeel leeg). true: de taken gaan mee
-- (hetzelfde deleted_at). p_version: de versie die de app kent (anders PT409). Al verwijderd: "al_verwijderd".
create function private.delete_plan(p_household uuid, p_plan uuid, p_version integer, p_with_tasks boolean)
returns table (version integer, tasks integer, outcome text)
language plpgsql security definer set search_path = '' as $$
declare
  p public.plans%rowtype;
  moment timestamptz := now();
  n integer;
begin
  perform private.require_uid();
  perform private.lock_household_shared(p_household);
  if not private.is_active_member(p_household) then
    raise exception 'Je bent geen lid van dit huishouden' using errcode = '42501';
  end if;
  select * into p from public.plans x where x.household_id = p_household and x.id = p_plan for update;
  if not found then raise exception 'Plan niet gevonden' using errcode = 'P0002'; end if;
  if p.deleted_at is not null then
    version := p.version; tasks := 0; outcome := 'al_verwijderd'; return next; return;
  end if;
  if p_version is null or p.version <> p_version then
    raise exception 'Iemand anders heeft dit net aangepast' using errcode = 'PT409';
  end if;
  if coalesce(p_with_tasks, false) then
    update public.tasks t set deleted_at = moment
      where t.household_id = p_household and t.plan_id = p_plan and t.deleted_at is null;
  else
    update public.tasks t set plan_id = null, plan_section_id = null
      where t.household_id = p_household and t.plan_id = p_plan;
  end if;
  get diagnostics n = row_count;
  update public.plan_sections s set deleted_at = moment where s.household_id = p_household and s.plan_id = p_plan and s.deleted_at is null;
  update public.plans x set deleted_at = moment where x.id = p_plan returning x.version into version;
  tasks := n; outcome := 'verwijderd'; return next;
end $$;

-- Terugzetten: het plan en de onderdelen en taken die er op hetzelfde moment mee zijn verwijderd. Losgekoppelde taken
-- (de standaard) blijven los: die koppeling komt niet vanzelf terug. Niet verwijderd: "al_hersteld".
create function private.restore_plan(p_household uuid, p_plan uuid, p_version integer)
returns table (version integer, tasks integer, outcome text)
language plpgsql security definer set search_path = '' as $$
declare
  p public.plans%rowtype;
  n integer;
begin
  perform private.require_uid();
  perform private.lock_household_shared(p_household);
  if not private.is_active_member(p_household) then
    raise exception 'Je bent geen lid van dit huishouden' using errcode = '42501';
  end if;
  select * into p from public.plans x where x.household_id = p_household and x.id = p_plan for update;
  if not found then raise exception 'Plan niet gevonden' using errcode = 'P0002'; end if;
  if p.deleted_at is null then
    version := p.version; tasks := 0; outcome := 'al_hersteld'; return next; return;
  end if;
  if p_version is null or p.version <> p_version then
    raise exception 'Iemand anders heeft dit net aangepast' using errcode = 'PT409';
  end if;
  update public.plans x set deleted_at = null where x.id = p_plan returning x.version into version;
  update public.plan_sections s set deleted_at = null where s.household_id = p_household and s.plan_id = p_plan and s.deleted_at = p.deleted_at;
  update public.tasks t set deleted_at = null where t.household_id = p_household and t.plan_id = p_plan and t.deleted_at = p.deleted_at;
  get diagnostics n = row_count;
  tasks := n; outcome := 'hersteld'; return next;
end $$;

-- Een onderdeel verwijderen: de taken blijven in het plan, zonder onderdeel.
create function private.delete_plan_section(p_household uuid, p_section uuid, p_version integer)
returns table (version integer, tasks integer, outcome text)
language plpgsql security definer set search_path = '' as $$
declare
  s public.plan_sections%rowtype;
  n integer;
begin
  perform private.require_uid();
  perform private.lock_household_shared(p_household);
  if not private.is_active_member(p_household) then
    raise exception 'Je bent geen lid van dit huishouden' using errcode = '42501';
  end if;
  select * into s from public.plan_sections x where x.household_id = p_household and x.id = p_section for update;
  if not found then raise exception 'Onderdeel niet gevonden' using errcode = 'P0002'; end if;
  if s.deleted_at is not null then
    version := s.version; tasks := 0; outcome := 'al_verwijderd'; return next; return;
  end if;
  if p_version is null or s.version <> p_version then
    raise exception 'Iemand anders heeft dit net aangepast' using errcode = 'PT409';
  end if;
  update public.tasks t set plan_section_id = null where t.household_id = p_household and t.plan_section_id = p_section;
  get diagnostics n = row_count;
  update public.plan_sections x set deleted_at = now() where x.id = p_section returning x.version into version;
  tasks := n; outcome := 'verwijderd'; return next;
end $$;

revoke all on function private.delete_plan(uuid, uuid, integer, boolean), private.restore_plan(uuid, uuid, integer),
  private.delete_plan_section(uuid, uuid, integer) from public, anon;
grant execute on function private.delete_plan(uuid, uuid, integer, boolean), private.restore_plan(uuid, uuid, integer),
  private.delete_plan_section(uuid, uuid, integer) to authenticated;

create function public.delete_plan(p_household uuid, p_plan uuid, p_version integer, p_with_tasks boolean default false)
returns table (version integer, tasks integer, outcome text) language plpgsql security invoker set search_path = '' as $$
begin
  return query select * from private.delete_plan(p_household, p_plan, p_version, p_with_tasks);
exception when others then
  raise exception using errcode = sqlstate, message = sqlerrm;   -- zonder DETAIL/HINT
end $$;
create function public.restore_plan(p_household uuid, p_plan uuid, p_version integer)
returns table (version integer, tasks integer, outcome text) language plpgsql security invoker set search_path = '' as $$
begin
  return query select * from private.restore_plan(p_household, p_plan, p_version);
exception when others then
  raise exception using errcode = sqlstate, message = sqlerrm;
end $$;
create function public.delete_plan_section(p_household uuid, p_section uuid, p_version integer)
returns table (version integer, tasks integer, outcome text) language plpgsql security invoker set search_path = '' as $$
begin
  return query select * from private.delete_plan_section(p_household, p_section, p_version);
exception when others then
  raise exception using errcode = sqlstate, message = sqlerrm;
end $$;
revoke all on function public.delete_plan(uuid, uuid, integer, boolean), public.restore_plan(uuid, uuid, integer),
  public.delete_plan_section(uuid, uuid, integer) from public, anon;
grant execute on function public.delete_plan(uuid, uuid, integer, boolean), public.restore_plan(uuid, uuid, integer),
  public.delete_plan_section(uuid, uuid, integer) to authenticated;
