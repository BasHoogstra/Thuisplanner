-- Thuisplanner · Mijn spullen & Documenten (besluit 17; docs/thuisplanner-spullen-documenten.md §6, §7 en §14).
-- ALLEEN LOKAAL, op een eigen stack. Niet naar staging of de bèta zonder een afzonderlijk akkoord.
--
-- Productbeslissingen:
--  1. Een spul (possessions) en een document (documents) zijn persoonlijk of gedeeld (besluit 14). Persoonlijk betekent
--     hier: helemaal niet zichtbaar voor anderen, ook niet als "bezet", en geen aanwijzing dat het bestaat. Ook geen
--     seintje over persoonlijke rijen naar het kanaal van het huishouden.
--  2. Een document is één rij met één bestand. Het hangt via document_links (veel-op-veel) aan spullen; er wordt nooit
--     gekopieerd. Ontkoppelen = deleted_at op de koppeling; het document blijft.
--  3. Geen berekende wettelijke einddatum: alleen ingevoerde commerciële en aanvullende garanties.
--  4. Herkende gegevens zijn een voorstel: field_status bewaart per veld alleen 'voorstel'; de rest is bevestigd of leeg.
--  5. Het bestand staat in de privé-bucket "documenten" onder <household_id>/<document_id>/origineel. Uploaden in twee
--     fasen: de rij op 'wacht', dan het object (alleen bij een eigen 'wacht'-document), dan bevestig-upload (magic bytes,
--     service-rol) → 'klaar'. Lezen (ondertekende link) alleen bij 'klaar', niet verwijderd en zichtbaar voor dit lid.
--  6. Verwijderen = de prullenbak (deleted_at), 30 dagen terug te zetten; daarna wist de opruimfunctie rij en bestand.
--     Een SQL-cascade wist geen bestanden: de opruimfunctie vindt ook wezen (na delete_household of een verwijderd account).
--
-- Schrijven via de API (kolomrechten + RLS + guard_content), zoals Vakanties. Geen delete-recht.

-- ---------------------------------------------------------------------------------------------
-- Tabellen
-- ---------------------------------------------------------------------------------------------
-- Alleen 'voorstel' per bekend veld; een leeg object is alles bevestigd of leeg.
create function private.geldige_veldstatus(p jsonb)
returns boolean language sql immutable set search_path = '' as $$
  select jsonb_typeof(p) = 'object' and not exists (
    select 1 from jsonb_each(p) e
    where e.key not in ('name', 'category', 'brand', 'model', 'serial', 'purchase_date', 'shop', 'price_cents', 'order_number',
                        'warranty_commercial_until', 'warranty_extra_until', 'warranty_extra_provider')
       or e.value <> '"voorstel"'::jsonb)
$$;

create table public.possessions (
  id uuid primary key default gen_random_uuid(),     -- de app maakt de UUID
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  category text check (category is null or char_length(category) <= 60),
  brand text check (brand is null or char_length(brand) <= 80),
  model text check (model is null or char_length(model) <= 80),
  serial text check (serial is null or char_length(serial) <= 80),
  purchase_date date,
  shop text check (shop is null or char_length(shop) <= 100),
  price_cents integer check (price_cents is null or price_cents between 0 and 100000000),
  currency text not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),
  order_number text check (order_number is null or char_length(order_number) <= 80),
  warranty_commercial_until date,
  warranty_extra_until date,
  warranty_extra_provider text check (warranty_extra_provider is null or char_length(warranty_extra_provider) <= 100),
  notes text check (notes is null or char_length(notes) <= 4000),
  visibility public.visibility not null default 'household' check (visibility in ('household', 'private')),
  owner_member_id uuid not null,
  owner_user_id uuid references auth.users(id) on delete set null,   -- niet leesbaar via de API (KG-T29)
  field_status jsonb not null default '{}'::jsonb check (private.geldige_veldstatus(field_status)),
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint possessions_household_id_key unique (household_id, id),
  constraint possessions_owner_fkey foreign key (household_id, owner_member_id)
    references public.household_members (household_id, id) on delete cascade
);
create index possessions_household_idx on public.possessions (household_id, name);

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 120),
  kind text not null check (kind in ('factuur', 'bon', 'garantiebewijs', 'handleiding', 'polis', 'contract', 'onderhoudsrapport', 'overig')),
  document_date date,
  visibility public.visibility not null default 'household' check (visibility in ('household', 'private')),
  owner_member_id uuid not null,
  owner_user_id uuid references auth.users(id) on delete set null,
  -- Alleen de server zet 'klaar' of 'mislukt' (documenten_klaar, documenten_mislukt).
  upload_status text not null default 'wacht' check (upload_status in ('wacht', 'klaar', 'mislukt')),
  -- Het pad is vast en niet te kiezen.
  storage_path text generated always as (household_id::text || '/' || id::text || '/origineel') stored,
  mime text not null check (mime in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp')),
  size_bytes integer not null check (size_bytes between 1 and 10485760),
  sha256 text check (sha256 is null or sha256 ~ '^[0-9a-f]{64}$'),
  -- Alleen bevestigde velden; geen volledige OCR-tekst (besluit 17).
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint documents_household_id_key unique (household_id, id),
  constraint documents_owner_fkey foreign key (household_id, owner_member_id)
    references public.household_members (household_id, id) on delete cascade
);
create index documents_household_idx on public.documents (household_id, kind);
create index documents_sha_idx on public.documents (household_id, sha256) where sha256 is not null and deleted_at is null;

create table public.document_links (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  document_id uuid not null,
  possession_id uuid not null,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint document_links_household_id_key unique (household_id, id),
  constraint document_links_document_fkey foreign key (household_id, document_id)
    references public.documents (household_id, id) on delete cascade,
  constraint document_links_possession_fkey foreign key (household_id, possession_id)
    references public.possessions (household_id, id) on delete cascade
);
-- Hoogstens één actuele koppeling per document en spul: geen duplicaten.
create unique index document_links_actueel_key on public.document_links (household_id, document_id, possession_id)
  where deleted_at is null;
create index document_links_possession_idx on public.document_links (household_id, possession_id);

alter table public.tasks add column possession_id uuid;
alter table public.tasks add constraint tasks_possession_fkey foreign key (household_id, possession_id)
  references public.possessions (household_id, id) on delete set null (possession_id);
create index tasks_possession_idx on public.tasks (household_id, possession_id) where possession_id is not null;

-- ---------------------------------------------------------------------------------------------
-- Zichtbaarheid (via de poort: my_household_ids, is_my_event → private.uid)
-- ---------------------------------------------------------------------------------------------
-- Een functie (security definer), omdat owner_user_id niet leesbaar is voor authenticated en het beleid die kolom dus
-- niet zelf mag noemen (zoals event_details_visible).
create function private.possession_visible(p_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.possessions p
    where p.id = p_id and p.household_id in (select private.my_household_ids())
      and (p.visibility = 'household' or private.is_my_event(p.owner_member_id, p.owner_user_id)));
$$;
create function private.document_visible(p_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.documents d
    where d.id = p_id and d.household_id in (select private.my_household_ids())
      and (d.visibility = 'household' or private.is_my_event(d.owner_member_id, d.owner_user_id)));
$$;
revoke all on function private.geldige_veldstatus(jsonb), private.possession_visible(uuid), private.document_visible(uuid) from public, anon;
grant execute on function private.geldige_veldstatus(jsonb), private.possession_visible(uuid), private.document_visible(uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Triggers: vaste kolommen, eigenaar, zichtbaarheid, koppelen
-- ---------------------------------------------------------------------------------------------
-- Security invoker (zoals guard_content): zo ziet de trigger of de aanroep via de API komt.
-- Spullen en documenten: via de API is de eigenaar altijd het eigen actieve lid (met het eigen account); daarna liggen
-- eigenaar en (bij documenten) het bestand vast. Alleen de eigenaar wisselt de zichtbaarheid.
create function private.guard_spul_of_document()
returns trigger language plpgsql set search_path = '' as $$
declare
  via_api boolean := current_user in ('anon', 'authenticated');
begin
  if tg_op = 'INSERT' then
    if via_api then
      if new.owner_member_id is distinct from private.my_member_id(new.household_id) then
        raise exception 'De eigenaar is altijd je eigen lidprofiel' using errcode = '42501';
      end if;
      new.owner_user_id := private.uid();
      if tg_table_name = 'documents' then new.upload_status := 'wacht'; end if;
    end if;
    return new;
  end if;
  -- Een verwijderd account maakt owner_user_id leeg (on delete set null): dat mag alleen de database zelf.
  if new.owner_member_id <> old.owner_member_id
     or (new.owner_user_id is distinct from old.owner_user_id and (via_api or new.owner_user_id is not null)) then
    raise exception 'Vaste kolommen kunnen niet veranderen' using errcode = '42501';
  end if;
  if via_api and new.visibility <> old.visibility and not private.is_my_event(old.owner_member_id, old.owner_user_id) then
    raise exception 'Alleen de eigenaar kan dit persoonlijk of gedeeld maken' using errcode = '42501';
  end if;
  if tg_table_name = 'documents' then
    if new.mime <> old.mime or new.size_bytes <> old.size_bytes or new.sha256 is distinct from old.sha256 then
      raise exception 'Vaste kolommen kunnen niet veranderen' using errcode = '42501';
    end if;
    if via_api and new.upload_status <> old.upload_status then
      raise exception 'Alleen de server bevestigt een upload' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;

-- Koppelingen: document en spul liggen vast, en het lid moet beide kanten mogen zien (geen koppeling naar het
-- persoonlijke document van een ander). Een ander huishouden kan al niet: de samengestelde verwijzingen.
create function private.guard_document_link()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and (new.document_id <> old.document_id or new.possession_id <> old.possession_id) then
    raise exception 'Vaste kolommen kunnen niet veranderen' using errcode = '42501';
  end if;
  if current_user in ('anon', 'authenticated')
     and not (private.document_visible(new.document_id) and private.possession_visible(new.possession_id)) then
    raise exception 'Document of spul niet gevonden' using errcode = '42501';
  end if;
  return new;
end $$;

-- Taken: een spul moet zichtbaar zijn voor wie de taak koppelt.
create function private.guard_task_possession()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.possession_id is not null and current_user in ('anon', 'authenticated')
     and (tg_op = 'INSERT' or new.possession_id is distinct from old.possession_id)
     and not private.possession_visible(new.possession_id) then
    raise exception 'Spul niet gevonden' using errcode = '42501';
  end if;
  return new;
end $$;

-- Seintjes zonder inhoud, maar nooit over een persoonlijke rij (anders verraadt het kanaal van het huishouden dat er
-- iets is). Wordt iets van gedeeld persoonlijk, dan wel één seintje: de anderen moeten het laten verdwijnen.
create function private.ping_spullen()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  r record := case when tg_op = 'DELETE' then old else new end;
  gedeeld boolean;
begin
  if tg_table_name = 'document_links' then
    gedeeld := exists (select 1 from public.documents d where d.household_id = r.household_id and d.id = r.document_id and d.visibility = 'household')
           and exists (select 1 from public.possessions p where p.household_id = r.household_id and p.id = r.possession_id and p.visibility = 'household');
  else
    gedeeld := r.visibility = 'household' or (tg_op = 'UPDATE' and old.visibility = 'household');
  end if;
  if gedeeld then
    perform private.ping(r.household_id, jsonb_build_object(
      't', tg_table_name, 'id', r.id, 'v', case when tg_op = 'DELETE' then null else r.version end, 'op', left(tg_op, 1)));
  end if;
  return null;
end $$;

revoke all on function private.guard_spul_of_document(), private.guard_document_link(), private.guard_task_possession(),
  private.ping_spullen() from public, anon, authenticated;

create trigger possessions_guard before insert or update on public.possessions
  for each row execute function private.guard_content();
create trigger possessions_refs before insert or update on public.possessions
  for each row execute function private.guard_spul_of_document();
create trigger documents_guard before insert or update on public.documents
  for each row execute function private.guard_content();
create trigger documents_refs before insert or update on public.documents
  for each row execute function private.guard_spul_of_document();
create trigger document_links_guard before insert or update on public.document_links
  for each row execute function private.guard_content();
create trigger document_links_refs before insert or update on public.document_links
  for each row execute function private.guard_document_link();
create trigger tasks_possession_refs before insert or update of possession_id on public.tasks
  for each row execute function private.guard_task_possession();

create trigger possessions_ping after insert or update or delete on public.possessions
  for each row execute function private.ping_spullen();
create trigger documents_ping after insert or update or delete on public.documents
  for each row execute function private.ping_spullen();
create trigger document_links_ping after insert or update or delete on public.document_links
  for each row execute function private.ping_spullen();

-- ---------------------------------------------------------------------------------------------
-- Row Level Security en rechten
-- ---------------------------------------------------------------------------------------------
alter table public.possessions enable row level security;
alter table public.documents enable row level security;
alter table public.document_links enable row level security;

revoke all on table public.possessions, public.documents, public.document_links from public, anon, authenticated;

-- Lezen per kolom, zonder owner_user_id (account-ID's blijven buiten de API).
grant select (id, household_id, name, category, brand, model, serial, purchase_date, shop, price_cents, currency, order_number,
              warranty_commercial_until, warranty_extra_until, warranty_extra_provider, notes, visibility, owner_member_id,
              field_status, version, created_at, updated_at, deleted_at),
  insert (id, household_id, name, category, brand, model, serial, purchase_date, shop, price_cents, currency, order_number,
          warranty_commercial_until, warranty_extra_until, warranty_extra_provider, notes, visibility, owner_member_id, field_status),
  update (name, category, brand, model, serial, purchase_date, shop, price_cents, currency, order_number,
          warranty_commercial_until, warranty_extra_until, warranty_extra_provider, notes, visibility, field_status, deleted_at)
  on public.possessions to authenticated;
grant select (id, household_id, title, kind, document_date, visibility, owner_member_id, upload_status, storage_path, mime,
              size_bytes, sha256, version, created_at, updated_at, deleted_at),
  insert (id, household_id, title, kind, document_date, visibility, owner_member_id, mime, size_bytes, sha256),
  update (title, kind, document_date, visibility, deleted_at)
  on public.documents to authenticated;
grant select, insert (id, household_id, document_id, possession_id), update (deleted_at) on public.document_links to authenticated;
grant insert (possession_id), update (possession_id) on public.tasks to authenticated;

-- Lezen: een persoonlijke rij alleen voor de eigenaar (zijn eigen, actieve lidprofiel); een gearchiveerd lid ziet niets
-- (my_household_ids). Rechtstreeks op de rij en niet via possession_visible(id): bij insert ... returning (zo voegt
-- PostgREST toe) toetst Postgres deze regel op de nieuwe rij, die een opzoekfunctie nog niet ziet. Even streng als
-- is_my_event: wordt een account van een lid losgemaakt, dan verdwijnen de persoonlijke items van dat lid
-- (spullen_drop_private_on_unlink), dus een volgend account op hetzelfde lid ziet ze nooit.
create policy possessions_select on public.possessions for select to authenticated
  using (household_id in (select private.my_household_ids())
         and (visibility = 'household' or owner_member_id = private.my_member_id(household_id)));
create policy possessions_insert on public.possessions for insert to authenticated
  with check (household_id in (select private.my_household_ids())
              and (visibility = 'household' or owner_member_id = private.my_member_id(household_id)));
create policy possessions_update on public.possessions for update to authenticated
  using (household_id in (select private.my_household_ids())
         and (visibility = 'household' or owner_member_id = private.my_member_id(household_id)))
  with check (household_id in (select private.my_household_ids())
              and (visibility = 'household' or owner_member_id = private.my_member_id(household_id)));

create policy documents_select on public.documents for select to authenticated
  using (household_id in (select private.my_household_ids())
         and (visibility = 'household' or owner_member_id = private.my_member_id(household_id)));
create policy documents_insert on public.documents for insert to authenticated
  with check (household_id in (select private.my_household_ids())
              and (visibility = 'household' or owner_member_id = private.my_member_id(household_id)));
create policy documents_update on public.documents for update to authenticated
  using (household_id in (select private.my_household_ids())
         and (visibility = 'household' or owner_member_id = private.my_member_id(household_id)))
  with check (household_id in (select private.my_household_ids())
              and (visibility = 'household' or owner_member_id = private.my_member_id(household_id)));

-- Een koppeling alleen als beide kanten zichtbaar zijn: zo verraadt ze niets over een persoonlijk item.
create policy document_links_select on public.document_links for select to authenticated
  using (household_id in (select private.my_household_ids())
         and private.document_visible(document_id) and private.possession_visible(possession_id));
create policy document_links_insert on public.document_links for insert to authenticated
  with check (household_id in (select private.my_household_ids()));
create policy document_links_update on public.document_links for update to authenticated
  using (household_id in (select private.my_household_ids())
         and private.document_visible(document_id) and private.possession_visible(possession_id))
  with check (household_id in (select private.my_household_ids()));

-- ---------------------------------------------------------------------------------------------
-- Storage: één privé-bucket en policies per operatie (alleen lezen en uploaden; nooit overschrijven of wissen)
-- ---------------------------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('documenten', 'documenten', false, 10485760, array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);

-- Het document bij een objectnaam, alleen bij precies <uuid>/<uuid>/origineel.
create function private.document_bij_pad(p_name text)
returns table (household_id uuid, document_id uuid) language sql immutable set search_path = '' as $$
  select split_part(p_name, '/', 1)::uuid, split_part(p_name, '/', 2)::uuid
  where p_name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/origineel$'
$$;

-- Lezen (ook een ondertekende link aanmaken): het document staat op 'klaar', is niet verwijderd en is zichtbaar.
create function private.documentobject_lezen(p_name text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from private.document_bij_pad(p_name) x
    join public.documents d on d.household_id = x.household_id and d.id = x.document_id
    where d.household_id in (select private.my_household_ids())
      and d.upload_status = 'klaar' and d.deleted_at is null
      and (d.visibility = 'household' or private.is_my_event(d.owner_member_id, d.owner_user_id)));
$$;

-- Uploaden: alleen het eigen document op 'wacht', binnen een uur na het aanmaken.
create function private.documentobject_uploaden(p_name text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from private.document_bij_pad(p_name) x
    join public.documents d on d.household_id = x.household_id and d.id = x.document_id
    where d.household_id in (select private.my_household_ids())
      and d.upload_status = 'wacht' and d.deleted_at is null and d.created_at > now() - interval '1 hour'
      and private.is_my_event(d.owner_member_id, d.owner_user_id));
$$;
revoke all on function private.document_bij_pad(text), private.documentobject_lezen(text), private.documentobject_uploaden(text) from public, anon;
revoke all on function private.document_bij_pad(text) from authenticated;   -- alleen binnen de twee functies hieronder
grant execute on function private.documentobject_lezen(text), private.documentobject_uploaden(text) to authenticated;

create policy documenten_lezen on storage.objects for select to authenticated
  using (bucket_id = 'documenten' and private.documentobject_lezen(name));
create policy documenten_uploaden on storage.objects for insert to authenticated
  with check (bucket_id = 'documenten' and private.documentobject_uploaden(name));

-- ---------------------------------------------------------------------------------------------
-- Twee fasen: alleen de service-rol (de Edge Function bevestig-upload) zet een document op 'klaar' of 'mislukt'
-- ---------------------------------------------------------------------------------------------
-- 'klaar' alleen als het object bestaat met de opgegeven grootte en hetzelfde type (de magic bytes zijn in de functie
-- gecontroleerd). Geeft het resultaat terug: 'klaar', 'mislukt' of 'onbekend'.
create function private.documenten_klaar(p_id uuid, p_type text)
returns text language plpgsql security definer set search_path = '' as $$
declare
  d record;
  o record;
begin
  select * into d from public.documents where id = p_id for update;
  if not found or d.upload_status <> 'wacht' or d.deleted_at is not null then return 'onbekend'; end if;
  select so.metadata into o from storage.objects so where so.bucket_id = 'documenten' and so.name = d.storage_path;
  if not found or (o.metadata ->> 'size')::bigint is distinct from d.size_bytes or p_type is distinct from d.mime then
    update public.documents set upload_status = 'mislukt' where id = p_id;
    return 'mislukt';
  end if;
  update public.documents set upload_status = 'klaar' where id = p_id;
  return 'klaar';
end $$;
create function private.documenten_mislukt(p_id uuid)
returns void language sql security definer set search_path = '' as $$
  update public.documents set upload_status = 'mislukt' where id = p_id and upload_status = 'wacht';
$$;

-- Wat de opruimfunctie (Edge Function opruimen-documenten, service-rol) uit de bucket wist, en welke rijen daarna weg
-- mogen: de prullenbak na 30 dagen, 'wacht' of 'mislukt' na 24 uur, en wezen (een object zonder rij, bijvoorbeeld na
-- delete_household of een verwijderd account). Wist zelf de verlopen rijen; objecten kan alleen de Storage-API wissen.
create function private.documenten_op_te_ruimen()
returns table (pad text) language plpgsql security definer set search_path = '' as $$
begin
  return query
    with weg as (
      delete from public.documents d
      where (d.deleted_at is not null and d.deleted_at < now() - interval '30 days')
         or (d.upload_status in ('wacht', 'mislukt') and d.created_at < now() - interval '24 hours')
      returning d.storage_path
    )
    select w.storage_path from weg w
    union
    select so.name from storage.objects so
    where so.bucket_id = 'documenten'
      and not exists (select 1 from public.documents d where d.storage_path = so.name);
  -- Spullen in de prullenbak na 30 dagen (hun koppelingen gaan mee via cascade).
  delete from public.possessions p where p.deleted_at is not null and p.deleted_at < now() - interval '30 days';
end $$;

revoke all on function private.documenten_klaar(uuid, text), private.documenten_mislukt(uuid), private.documenten_op_te_ruimen()
  from public, anon, authenticated;
grant usage on schema private to service_role;
grant execute on function private.documenten_klaar(uuid, text), private.documenten_mislukt(uuid), private.documenten_op_te_ruimen()
  to service_role;

-- Voor de Edge Functions (service-rol): een publieke ingang zonder rechten voor authenticated of anon.
create function public.documenten_klaar(p_id uuid, p_type text)
returns text language plpgsql security invoker set search_path = '' as $$
begin
  return private.documenten_klaar(p_id, p_type);
exception when others then
  raise exception using errcode = sqlstate, message = sqlerrm;   -- zonder DETAIL/HINT
end $$;
create function public.documenten_mislukt(p_id uuid)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  perform private.documenten_mislukt(p_id);
exception when others then
  raise exception using errcode = sqlstate, message = sqlerrm;
end $$;
create function public.documenten_op_te_ruimen()
returns table (pad text) language plpgsql security invoker set search_path = '' as $$
begin
  return query select x.pad from private.documenten_op_te_ruimen() x;
exception when others then
  raise exception using errcode = sqlstate, message = sqlerrm;
end $$;
revoke all on function public.documenten_klaar(uuid, text), public.documenten_mislukt(uuid), public.documenten_op_te_ruimen()
  from public, anon, authenticated;
grant execute on function public.documenten_klaar(uuid, text), public.documenten_mislukt(uuid), public.documenten_op_te_ruimen()
  to service_role;

-- ---------------------------------------------------------------------------------------------
-- Persoonlijke spullen en documenten volgen het account (zoals privé-afspraken)
-- ---------------------------------------------------------------------------------------------
-- Account verwijderd: een eigen trigger naast komtgoed_before_account_delete, op owner_user_id (blijft staan, ook als
-- de andere trigger het lid al losmaakt). De bestanden worden wezen en verdwijnen bij de opruimronde.
create function private.spullen_before_account_delete()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  delete from public.documents where visibility = 'private' and owner_user_id = old.id;
  delete from public.possessions where visibility = 'private' and owner_user_id = old.id;
  return old;
end $$;
revoke all on function private.spullen_before_account_delete() from public, anon, authenticated;
create trigger spullen_before_account_delete before delete on auth.users
  for each row execute function private.spullen_before_account_delete();

-- Account los van een profiel: persoonlijke spullen en documenten van dat profiel verdwijnen.
create function private.spullen_drop_private_on_unlink()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  delete from public.documents d
    where d.household_id = old.household_id and d.visibility = 'private'
      and (d.owner_member_id = old.id or d.owner_user_id = old.user_id);
  delete from public.possessions p
    where p.household_id = old.household_id and p.visibility = 'private'
      and (p.owner_member_id = old.id or p.owner_user_id = old.user_id);
  return null;
end $$;
revoke all on function private.spullen_drop_private_on_unlink() from public, anon, authenticated;
create trigger members_unlink_private_spullen after update of user_id on public.household_members
  for each row when (old.user_id is not null and new.user_id is distinct from old.user_id)
  execute function private.spullen_drop_private_on_unlink();

-- Gearchiveerd lid na de bewaartermijn: ook persoonlijke spullen en documenten (zelfde signatuur en rechten).
create or replace function private.purge_member_private(p_household uuid, p_member uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare n integer; m integer; k integer;
begin
  delete from public.events e
    where e.household_id = p_household and e.owner_member_id = p_member and e.visibility = 'private';
  get diagnostics n = row_count;
  delete from public.documents d
    where d.household_id = p_household and d.owner_member_id = p_member and d.visibility = 'private';
  get diagnostics m = row_count;
  delete from public.possessions p
    where p.household_id = p_household and p.owner_member_id = p_member and p.visibility = 'private';
  get diagnostics k = row_count;
  return n + m + k;
end $$;
revoke all on function private.purge_member_private(uuid, uuid) from public, anon, authenticated;
