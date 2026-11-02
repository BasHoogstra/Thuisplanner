// Maakt uit vectoren.json de SQL-controles voor private.rule_occurs_on en private.rule_check (stdout).
// Gebruik: node maak-sql-tests.mjs > vectoren-tests.sql. Elke mislukte controle stopt met een exception.
import { readFileSync } from 'node:fs';

const v = JSON.parse(readFileSync(new URL('./vectoren.json', import.meta.url), 'utf8'));
const lit = s => (s == null ? 'null' : `'${String(s).replace(/'/g, "''")}'`);
const arr = a => (a == null ? 'null::text[]' : `array[${a.map(lit).join(',')}]::text[]`);
const dat = d => (d == null ? 'null::date' : `'${d}'::date`);
const int = n => (n == null ? 'null::integer' : String(n));
const args = (anker, r) => `${dat(anker)}, ${lit(r.freq)}, ${int(r.interval)}, ${arr(r.byday)}, ${dat(r.until)}, ${int(r.count)}`;

const uit = ['\\set ON_ERROR_STOP on', 'begin;'];
for (const t of v.datums) {
  const weg = t.uitzonderingen?.length ? ` and not (d::date = any (${arr(t.uitzonderingen)}::date[]))` : '';
  uit.push(`do $$ declare got text; begin
  select coalesce(string_agg(d::date::text, ',' order by d), '') into got
    from generate_series(${dat(t.van)}, ${dat(t.tot)}, interval '1 day') g(d)
   where private.rule_occurs_on(${args(t.anker, t.regel)}, d::date)${weg};
  if got is distinct from ${lit(t.datums.join(','))} then raise exception 'VECTOR % : kreeg %', ${lit(t.naam)}, got; end if;
end $$;`);
}
for (const t of v.geldigheid) {
  uit.push(`do $$ begin
  if private.rule_check(${args(t.anker, t.regel)}) is distinct from ${arr(t.fouten)} then
    raise exception 'GELDIGHEID % : kreeg %', ${lit(t.naam)}, private.rule_check(${args(t.anker, t.regel)});
  end if;
  if cardinality(${arr(t.fouten)}) > 0 and private.rule_occurs_on(${args(t.anker, t.regel)}, ${dat(t.anker)}) then
    raise exception 'GELDIGHEID % : ongeldige regel komt toch voor', ${lit(t.naam)};
  end if;
end $$;`);
}
uit.push(`select 'vectoren: ${v.datums.length} datumvectoren en ${v.geldigheid.length} geldigheidsvectoren geslaagd' as uitslag;`, 'rollback;');
console.log(uit.join('\n'));
