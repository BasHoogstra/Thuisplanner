-- Gelijkwaardigheid over 10 jaar: de huidige regel private.occurs_on en het nieuwe contract private.rule_occurs_on
-- (met de standaardwaarden: interval 1, geen weekdagen, geen count) geven voor bestaande reeksen dag voor dag
-- hetzelfde antwoord. Ankers, gelijk aan de Vitest-toets: voor maand- en jaarreeksen elke dag van 2024 (alle randen:
-- 29–31, 29 februari), voor dag- en weekreeksen 1–14 januari 2024 (elke weekdag twee keer); elk zonder einde en met
-- een einde na 400 dagen. Dagen: 1 januari 2024 t/m 31 december 2033.
-- Per frequentie en per anker een aparte telling, zodat het geheugengebruik klein blijft.
\set ON_ERROR_STOP on
do $$
declare
  f text;
  a date;
  u date;
  verschil bigint;
  totaal bigint := 0;
  fouten bigint := 0;
  voorbeeld text;
begin
  foreach f in array array['daily', 'weekly', 'monthly', 'yearly'] loop
    for a in select g::date from generate_series('2024-01-01'::date,
               case when f in ('monthly', 'yearly') then '2024-12-31'::date else '2024-01-14'::date end, interval '1 day') g loop
      foreach u in array array[null::date, (a + interval '400 days')::date] loop
        select count(*) filter (where private.occurs_on(a, f, u, d::date)
                                  is distinct from private.rule_occurs_on(a, f, null, null, u, null, d::date))
          into verschil
          from generate_series('2024-01-01'::date, '2033-12-31'::date, interval '1 day') d;
        totaal := totaal + 3653;
        if verschil > 0 then
          fouten := fouten + verschil;
          voorbeeld := coalesce(voorbeeld, format('%s %s tot %s', f, a, u));
        end if;
      end loop;
    end loop;
  end loop;
  if fouten <> 0 then
    raise exception 'GELIJKWAARDIGHEID: % verschillen op % vergelijkingen; eerste reeks met verschil: %', fouten, totaal, voorbeeld;
  end if;
  raise notice 'gelijkwaardigheid: % vergelijkingen over 10 jaar, 0 verschillen', totaal;
end $$;
