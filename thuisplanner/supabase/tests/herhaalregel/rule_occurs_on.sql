-- Het gedeelde herhalingscontract in SQL (ontwerp fase A, §5.2). UITSLUITEND EEN LOKAAL TESTBESTAND, GEEN MIGRATIE:
-- het wordt alleen geladen in een eigen, tijdelijke testdatabase (run.sh). Na akkoord op de migratie komt dezelfde
-- inhoud in de migratie van het afsprakenmodel.
--
-- Dezelfde regels als app/src/lib/herhaalregel.ts, getoetst met dezelfde vectoren (vectoren.json):
-- - freq daily | weekly | monthly | yearly; interval 1–99; weekstart maandag;
-- - weekly: weekdagen ('MO'…'SU'), zonder weekdagen de weekdag van het anker;
-- - monthly/yearly: precies één n-de of laatste weekdag ('2TU', '-1FR'), zonder de dag van de maand van het anker
--   (een maand zonder die dag wordt overgeslagen); yearly altijd in de maand van het anker;
-- - until (inclusief) óf count (1–999); count telt de keren van de regel;
-- - het anker is de eerste keer en moet bij de regel passen.
create schema if not exists private;

-- De n-de (1–4) of laatste (-1) weekdag van een maand.
create or replace function private.rule_nth_weekday(p_year integer, p_month integer, p_code text)
returns date language sql immutable strict set search_path = '' as $$
  select case when c.n = -1
    then c.laatste - ((extract(isodow from c.laatste)::int - c.doel + 7) % 7)
    else c.eerste + ((c.doel - extract(isodow from c.eerste)::int + 7) % 7) + (c.n - 1) * 7
  end
  from (select case when left(p_code, 2) = '-1' then -1 else left(p_code, 1)::int end as n,
               array_position(array['MO','TU','WE','TH','FR','SA','SU'], right(p_code, 2)) as doel,
               make_date(p_year, p_month, 1) as eerste,
               (make_date(p_year, p_month, 1) + interval '1 month' - interval '1 day')::date as laatste) c;
$$;

-- Fouten in een regel (leeg = geldig), met dezelfde codes en volgorde als controleerRegel in herhaalregel.ts.
create or replace function private.rule_check(
  p_anchor date, p_freq text, p_interval integer, p_byday text[], p_until date, p_count integer)
returns text[] language plpgsql immutable set search_path = '' as $$
declare
  f text[] := '{}';
  iv integer := coalesce(p_interval, 1);
  codes constant text[] := array['MO','TU','WE','TH','FR','SA','SU'];
begin
  if p_anchor is null then return array['anker']; end if;
  if p_freq is null or p_freq not in ('daily', 'weekly', 'monthly', 'yearly') then return array['freq']; end if;
  if iv < 1 or iv > 99 then f := array_append(f, 'interval'); end if;
  if p_until is not null and p_count is not null then f := array_append(f, 'until_en_count'); end if;
  if p_until is not null and p_until < p_anchor then f := array_append(f, 'until'); end if;
  if p_count is not null and (p_count < 1 or p_count > 999) then f := array_append(f, 'count'); end if;
  if p_byday is not null then
    if cardinality(p_byday) = 0 or p_freq = 'daily' then
      f := array_append(f, 'byday');
    elsif p_freq = 'weekly' then
      if not (p_byday <@ codes) or array_position(p_byday, null) is not null
         or (select count(distinct x) from unnest(p_byday) x) <> cardinality(p_byday) then
        f := array_append(f, 'byday');
      elsif not (codes[extract(isodow from p_anchor)::int] = any (p_byday)) then
        f := array_append(f, 'anker_past_niet');
      end if;
    elsif cardinality(p_byday) <> 1 or p_byday[1] is null or p_byday[1] !~ '^(-1|[1-4])(MO|TU|WE|TH|FR|SA|SU)$' then
      f := array_append(f, 'byday');
    elsif private.rule_nth_weekday(extract(year from p_anchor)::int, extract(month from p_anchor)::int, p_byday[1]) <> p_anchor then
      f := array_append(f, 'anker_past_niet');
    end if;
  end if;
  return f;
end $$;

-- Past de dag bij het patroon van de regel (zonder begin, einde of count)?
create or replace function private.rule_matches(
  p_anchor date, p_freq text, p_interval integer, p_byday text[], p_day date)
returns boolean language sql immutable set search_path = '' as $$
  select case p_freq
    when 'daily' then (p_day - p_anchor) % p_interval = 0
    when 'weekly' then
      ((p_day - extract(isodow from p_day)::int) - (p_anchor - extract(isodow from p_anchor)::int)) / 7 % p_interval = 0
      and (array['MO','TU','WE','TH','FR','SA','SU'])[extract(isodow from p_day)::int]
          = any (coalesce(p_byday, array[(array['MO','TU','WE','TH','FR','SA','SU'])[extract(isodow from p_anchor)::int]]))
    when 'monthly' then
      ((extract(year from p_day)::int - extract(year from p_anchor)::int) * 12
        + extract(month from p_day)::int - extract(month from p_anchor)::int) % p_interval = 0
      and case when p_byday is null then extract(day from p_day) = extract(day from p_anchor)
               else private.rule_nth_weekday(extract(year from p_day)::int, extract(month from p_day)::int, p_byday[1]) = p_day end
    when 'yearly' then
      extract(month from p_day) = extract(month from p_anchor)
      and (extract(year from p_day)::int - extract(year from p_anchor)::int) % p_interval = 0
      and case when p_byday is null then extract(day from p_day) = extract(day from p_anchor)
               else private.rule_nth_weekday(extract(year from p_day)::int, extract(month from p_day)::int, p_byday[1]) = p_day end
    else false
  end;
$$;

-- Het hoeveelste voorkomen is p_day (1 = het anker)? Telt alleen de keren in [anker, p_day] en stopt zodra er
-- meer dan p_max zijn geteld. Alleen nodig bij count.
create or replace function private.rule_index(
  p_anchor date, p_freq text, p_interval integer, p_byday text[], p_day date, p_max integer)
returns integer language plpgsql immutable set search_path = '' as $$
declare
  n integer := 0;
  k integer := 0;
  d date;
  ma date;
  pos integer;
  mi integer;
  bd text[];
  codes constant text[] := array['MO','TU','WE','TH','FR','SA','SU'];
begin
  if p_freq = 'daily' then
    return (p_day - p_anchor) / p_interval + 1;
  end if;
  if p_freq = 'weekly' then
    bd := coalesce(p_byday, array[codes[extract(isodow from p_anchor)::int]]);
    loop
      ma := p_anchor - (extract(isodow from p_anchor)::int - 1) + k * p_interval * 7;
      exit when ma > p_day;
      for pos in 1..7 loop
        if codes[pos] = any (bd) then
          d := ma + (pos - 1);
          if d >= p_anchor and d <= p_day then n := n + 1; end if;
        end if;
      end loop;
      exit when n > p_max;
      k := k + 1;
    end loop;
    return n;
  end if;
  -- monthly en yearly: per periode hoogstens één datum
  loop
    mi := extract(year from p_anchor)::int * 12 + extract(month from p_anchor)::int - 1
          + k * case when p_freq = 'monthly' then p_interval else p_interval * 12 end;
    exit when make_date(mi / 12, mi % 12 + 1, 1) > p_day;
    if p_byday is not null then
      d := private.rule_nth_weekday(mi / 12, mi % 12 + 1, p_byday[1]);
    elsif extract(day from p_anchor)::int <= extract(day from (make_date(mi / 12, mi % 12 + 1, 1) + interval '1 month' - interval '1 day'))::int then
      d := make_date(mi / 12, mi % 12 + 1, extract(day from p_anchor)::int);
    else
      d := null;
    end if;
    if d is not null and d >= p_anchor and d <= p_day then n := n + 1; end if;
    exit when n > p_max;
    k := k + 1;
  end loop;
  return n;
end $$;

-- Komt de reeks op deze dag voor? (Zonder uitzonderingen en losgemaakte voorkomens: die horen bij het domein.)
create or replace function private.rule_occurs_on(
  p_anchor date, p_freq text, p_interval integer, p_byday text[], p_until date, p_count integer, p_day date)
returns boolean language plpgsql immutable set search_path = '' as $$
begin
  if p_day is null or cardinality(private.rule_check(p_anchor, p_freq, p_interval, p_byday, p_until, p_count)) > 0 then
    return false;
  end if;
  if p_day < p_anchor or (p_until is not null and p_day > p_until) then return false; end if;
  if not private.rule_matches(p_anchor, p_freq, coalesce(p_interval, 1), p_byday, p_day) then return false; end if;
  return p_count is null
      or private.rule_index(p_anchor, p_freq, coalesce(p_interval, 1), p_byday, p_day, p_count) <= p_count;
end $$;

-- Ter vergelijking: de huidige regel, letterlijk uit migratie 20261012120000_kg5c_inhoud.sql:172.
create or replace function private.occurs_on(p_start date, p_freq text, p_until date, p_day date)
returns boolean language sql immutable set search_path = '' as $$
  select p_freq is not null and p_day >= p_start and (p_until is null or p_day <= p_until) and
    case p_freq
      when 'daily' then true
      when 'weekly' then (p_day - p_start) % 7 = 0
      when 'monthly' then extract(day from p_day) = extract(day from p_start)
      when 'yearly' then extract(month from p_day) = extract(month from p_start)
                     and extract(day from p_day) = extract(day from p_start)
      else false
    end;
$$;
