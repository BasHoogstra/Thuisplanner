-- Tegenproeven: elke sabotage zet één regel van het contract verkeerd. Daarna moeten de vectoren (en bij
-- sabotage 1 ook de gelijkwaardigheid) falen. run.sh --tegenproef laadt telkens een verse kopie van de functies,
-- dan één sabotage, en verwacht dat de controles daarna mislukken.

-- :sabotage = 1 — een maand zonder die dag valt op de laatste dag (in plaats van overslaan)
-- :sabotage = 2 — de week begint op zondag (in plaats van maandag)
-- :sabotage = 3 — count telt uitzonderingen niet mee / telt verkeerd (index één te laag)
\if :{?sabotage}
\else
  \echo 'gebruik: psql -v sabotage=1|2|3 -f tegenproef.sql'
  \quit
\endif

select (:sabotage = 1) as s1, (:sabotage = 2) as s2, (:sabotage = 3) as s3 \gset
\if :s1
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
      and case when p_byday is null
               then extract(day from p_day) = least(extract(day from p_anchor),
                    extract(day from (date_trunc('month', p_day) + interval '1 month' - interval '1 day')))
               else private.rule_nth_weekday(extract(year from p_day)::int, extract(month from p_day)::int, p_byday[1]) = p_day end
    when 'yearly' then
      extract(month from p_day) = extract(month from p_anchor)
      and (extract(year from p_day)::int - extract(year from p_anchor)::int) % p_interval = 0
      and case when p_byday is null then extract(day from p_day) = extract(day from p_anchor)
               else private.rule_nth_weekday(extract(year from p_day)::int, extract(month from p_day)::int, p_byday[1]) = p_day end
    else false
  end;
$$;
\endif
\if :s2
create or replace function private.rule_matches(
  p_anchor date, p_freq text, p_interval integer, p_byday text[], p_day date)
returns boolean language sql immutable set search_path = '' as $$
  select case p_freq
    when 'daily' then (p_day - p_anchor) % p_interval = 0
    when 'weekly' then
      ((p_day - extract(dow from p_day)::int) - (p_anchor - extract(dow from p_anchor)::int)) / 7 % p_interval = 0
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
\endif
\if :s3
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
      or private.rule_index(p_anchor, p_freq, coalesce(p_interval, 1), p_byday, p_day, p_count) - 1 <= p_count;
end $$;
\endif
