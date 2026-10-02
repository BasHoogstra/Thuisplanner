-- Huisplan fase 1: huishoudens, leden, uitnodigingen en items.
-- Toegang wordt in de database afgedwongen (RLS): alleen leden zien hun huishouden.

create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table public.household_members (
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner','member')),
  display_name text check (display_name is null or char_length(display_name) <= 40),
  joined_at timestamptz not null default now(),
  primary key (household_id, user_id)
);
create index household_members_user_idx on public.household_members(user_id);

create table public.household_invites (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  token text not null unique default encode(gen_random_bytes(18), 'hex'),
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  used_by uuid references auth.users(id) on delete set null,
  used_at timestamptz
);
create index household_invites_household_idx on public.household_invites(household_id);

-- Elk item (taak, boodschap, recept, ...) is een eigen rij. coll = de verzameling
-- zoals in de huidige app (tasks, boodschappen, recepten, ...); data = het item zelf.
create table public.items (
  household_id uuid not null references public.households(id) on delete cascade,
  coll text not null check (char_length(coll) between 1 and 64),
  id text not null check (char_length(id) between 1 and 128),
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  primary key (household_id, coll, id)
);
create index items_household_updated_idx on public.items(household_id, updated_at);

create or replace function public.touch_item()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;
create trigger items_touch before insert or update on public.items
  for each row execute function public.touch_item();

-- Is de ingelogde gebruiker lid van dit huishouden? (security definer om RLS-recursie te voorkomen)
create or replace function public.is_member(hid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.household_members m where m.household_id = hid and m.user_id = auth.uid());
$$;
create or replace function public.is_owner(hid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.household_members m where m.household_id = hid and m.user_id = auth.uid() and m.role = 'owner');
$$;

alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.household_invites enable row level security;
alter table public.items enable row level security;

-- Huishoudens: leden lezen, eigenaar hernoemt/verwijdert. Aanmaken gaat via create_household().
create policy households_select on public.households for select to authenticated using (public.is_member(id));
create policy households_update on public.households for update to authenticated using (public.is_owner(id)) with check (public.is_owner(id));
create policy households_delete on public.households for delete to authenticated using (public.is_owner(id));

-- Leden: leden zien elkaar; je past je eigen weergavenaam aan; eigenaar of jijzelf verwijdert.
create policy members_select on public.household_members for select to authenticated using (public.is_member(household_id));
create policy members_update_self on public.household_members for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid() and role = (select m.role from public.household_members m where m.household_id = household_members.household_id and m.user_id = auth.uid()));
create policy members_delete on public.household_members for delete to authenticated
  using (user_id = auth.uid() or public.is_owner(household_id));

-- Uitnodigingen: leden maken en zien ze; gebruiken gaat via accept_invite().
create policy invites_select on public.household_invites for select to authenticated using (public.is_member(household_id));
create policy invites_insert on public.household_invites for insert to authenticated with check (public.is_member(household_id) and created_by = auth.uid());
create policy invites_delete on public.household_invites for delete to authenticated using (public.is_member(household_id));

-- Items: alleen leden, voor alle bewerkingen.
create policy items_select on public.items for select to authenticated using (public.is_member(household_id));
create policy items_insert on public.items for insert to authenticated with check (public.is_member(household_id));
create policy items_update on public.items for update to authenticated using (public.is_member(household_id)) with check (public.is_member(household_id));
create policy items_delete on public.items for delete to authenticated using (public.is_member(household_id));

-- Huishouden aanmaken: huishouden + jij als eigenaar, in één keer.
create or replace function public.create_household(p_name text, p_display_name text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare hid uuid;
begin
  if auth.uid() is null then raise exception 'Niet ingelogd'; end if;
  insert into public.households(name, created_by) values (p_name, auth.uid()) returning id into hid;
  insert into public.household_members(household_id, user_id, role, display_name) values (hid, auth.uid(), 'owner', p_display_name);
  return hid;
end $$;

-- Uitnodiging gebruiken: geldig, niet verlopen, eenmalig.
create or replace function public.accept_invite(p_token text, p_display_name text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare inv public.household_invites%rowtype;
begin
  if auth.uid() is null then raise exception 'Niet ingelogd'; end if;
  select * into inv from public.household_invites where token = p_token for update;
  if not found then raise exception 'Uitnodiging niet gevonden'; end if;
  if inv.used_at is not null then raise exception 'Uitnodiging is al gebruikt'; end if;
  if inv.expires_at < now() then raise exception 'Uitnodiging is verlopen'; end if;
  insert into public.household_members(household_id, user_id, role, display_name)
    values (inv.household_id, auth.uid(), 'member', p_display_name)
    on conflict (household_id, user_id) do nothing;
  update public.household_invites set used_by = auth.uid(), used_at = now() where id = inv.id;
  return inv.household_id;
end $$;

revoke all on function public.create_household(text, text) from public, anon;
revoke all on function public.accept_invite(text, text) from public, anon;
revoke all on function public.is_member(uuid) from public, anon;
revoke all on function public.is_owner(uuid) from public, anon;
grant execute on function public.create_household(text, text) to authenticated;
grant execute on function public.accept_invite(text, text) to authenticated;
grant execute on function public.is_member(uuid) to authenticated;
grant execute on function public.is_owner(uuid) to authenticated;

-- Live updates voor items
alter publication supabase_realtime add table public.items;