-- KomtGoed: kopie van supabase/tests/lokaal/supabase_stub.sql (Huisplan), zodat komtgoed/ los staat.
-- ALLEEN VOOR LOKAAL TESTEN. Bootst de delen van een Supabase-database na die onze migraties en
-- RLS-tests gebruiken, zodat ze op een kale PostgreSQL (16+) kunnen draaien. Nooit op Supabase
-- uitvoeren. Definities overgenomen van het stagingproject (auth.uid, storage.foldername,
-- standaardrechten in schema public).

create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
grant anon, authenticated, service_role to postgres;

-- Standaardrechten zoals op Supabase: nieuwe tabellen/functies/sequences in public zijn voor
-- anon, authenticated en service_role toegankelijk (RLS bepaalt wat er echt mag).
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;

create schema extensions;
create extension pgcrypto with schema extensions;
grant usage on schema extensions to anon, authenticated, service_role;

create schema auth;
grant usage on schema auth to anon, authenticated, service_role;
create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  created_at timestamptz default now()
);
create function auth.uid() returns uuid language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;
create function auth.role() returns text language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  )::text
$$;
grant execute on function auth.uid(), auth.role() to anon, authenticated, service_role;

create schema storage;
grant usage on schema storage to anon, authenticated, service_role;
create table storage.buckets (
  id text primary key,
  name text not null,
  owner uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  public boolean default false,
  file_size_limit bigint,
  allowed_mime_types text[]
);
create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets(id),
  name text,
  owner uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  metadata jsonb
);
alter table storage.buckets enable row level security;
alter table storage.objects enable row level security;
grant all on storage.buckets, storage.objects to anon, authenticated, service_role;
create function storage.foldername(name text) returns text[] language plpgsql immutable as $$
declare _parts text[];
begin
  select string_to_array(name, '/') into _parts;
  return _parts[1 : array_length(_parts,1) - 1];
end $$;
grant execute on function storage.foldername(text) to anon, authenticated, service_role;

create publication supabase_realtime;

-- Zoals de Supabase CLI (cli_login_postgres): migraties draaien zonder 'extensions' in het search_path.
alter role postgres set search_path = "$user", public;
