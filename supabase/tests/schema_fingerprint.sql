-- Vingerafdruk van het app-schema (public en private), alleen lezen.
-- Draai dit op productie en op staging: dezelfde uitkomst = hetzelfde schema.
-- Geeft per onderdeel een regel terug, plus een totaal-md5 over alles.
with parts as (
  -- tabellen en RLS
  select 'table' as kind, n.nspname||'.'||c.relname as name,
         'rls='||c.relrowsecurity||' force='||c.relforcerowsecurity as def
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname in ('public','private') and c.relkind in ('r','p','v','m')
  union all
  -- kolommen
  select 'column', table_schema||'.'||table_name||'.'||column_name,
         data_type||' null='||is_nullable||' default='||coalesce(column_default,'')
  from information_schema.columns where table_schema in ('public','private')
  union all
  -- constraints (pk, fk, unique, check)
  select 'constraint', n.nspname||'.'||cl.relname||'.'||co.conname, pg_get_constraintdef(co.oid)
  from pg_constraint co join pg_class cl on cl.oid=co.conrelid join pg_namespace n on n.oid=cl.relnamespace
  where n.nspname in ('public','private')
  union all
  -- indexen
  select 'index', schemaname||'.'||indexname, indexdef from pg_indexes where schemaname in ('public','private')
  union all
  -- RLS-regels
  select 'policy', schemaname||'.'||tablename||'.'||policyname,
         cmd||' roles='||array_to_string(roles,',')||' using='||coalesce(qual,'')||' check='||coalesce(with_check,'')
  from pg_policies where schemaname in ('public','private')
  union all
  -- functies (volledige definitie, inclusief security definer en search_path)
  select 'function', n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')',
         md5(pg_get_functiondef(p.oid))||' acl='||coalesce(array_to_string(array(select x::text from unnest(p.proacl) x order by 1),','),'default')
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname in ('public','private')
  union all
  -- triggers
  select 'trigger', n.nspname||'.'||c.relname||'.'||t.tgname, pg_get_triggerdef(t.oid)
  from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
  where not t.tgisinternal and n.nspname in ('public','private')
  union all
  -- rechten op tabellen
  select 'grant', table_schema||'.'||table_name||'.'||grantee, string_agg(privilege_type,',' order by privilege_type)
  from information_schema.role_table_grants where table_schema in ('public','private')
  group by table_schema, table_name, grantee
  union all
  -- schema's en hun rechten
  select 'schema', nspname, coalesce(array_to_string(array(select x::text from unnest(nspacl) x order by 1),','),'default')
  from pg_namespace where nspname in ('public','private')
  union all
  -- realtime
  select 'realtime', schemaname||'.'||tablename, pubname from pg_publication_tables
  where pubname='supabase_realtime' and schemaname in ('public','private')
  union all
  -- (vanaf stap 1.2) RLS-regels op storage.objects, de bucket household-files en standaardrechten
  select 'storage_policy', policyname,
         cmd||' roles='||array_to_string(roles,',')||' using='||coalesce(qual,'')||' check='||coalesce(with_check,'')
  from pg_policies where schemaname='storage' and tablename='objects'
  union all
  select 'bucket', id, 'public='||coalesce(public::text,'')||' limit='||coalesce(file_size_limit::text,'')
         ||' mime='||coalesce(array_to_string(allowed_mime_types,','),'')
  from storage.buckets where id='household-files'
  union all
  select 'default_acl', pg_get_userbyid(defaclrole)||':'||defaclobjtype::text,
         array_to_string(array(select x::text from unnest(defaclacl) x order by 1),',')
  from pg_default_acl where defaclnamespace = 'public'::regnamespace
)
select kind, name, def from parts
union all
select 'TOTAAL', count(*)::text, md5(string_agg(kind||'|'||name||'|'||def, E'\n' order by kind, name, def)) from parts
order by 1, 2;
