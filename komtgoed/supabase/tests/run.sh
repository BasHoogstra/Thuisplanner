#!/usr/bin/env bash
# KomtGoed KG-1: bouwt een lege, tijdelijke PostgreSQL op, voert de Supabase-nabootsing en
# komtgoed/supabase/migrations/*.sql uit en draait de RLS-testmatrix (rls_tests.sql).
# Raakt geen enkel Supabase-project en maakt geen netwerkverbinding.
#
#   komtgoed/supabase/tests/run.sh               # matrix (verwacht: 22 van 22)
#   komtgoed/supabase/tests/run.sh --tegenproef  # daarna: elke sabotage moet het juiste scenario laten falen
#
# Omgeving: PGBIN (map met initdb/pg_ctl/psql), standaard /usr/lib/postgresql/16/bin.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
KG="$(cd "$HERE/.." && pwd)"
PGBIN="${PGBIN:-/usr/lib/postgresql/16/bin}"
PORT="${PGPORT_TEST:-54340}"
WORK="$(mktemp -d)"
RUN_AS=()
if [ "$(id -u)" = "0" ]; then chown postgres "$WORK"; RUN_AS=(su postgres -c); fi
run() { if [ ${#RUN_AS[@]} -gt 0 ]; then "${RUN_AS[@]}" "$*"; else bash -c "$*"; fi; }
cleanup() { run "$PGBIN/pg_ctl -D $WORK/data -m immediate stop" >/dev/null 2>&1 || true; rm -rf "$WORK"; }
trap cleanup EXIT
run "$PGBIN/initdb -D $WORK/data -U postgres -A trust" >/dev/null
run "$PGBIN/pg_ctl -D $WORK/data -o '-p $PORT -k $WORK' -l $WORK/log -w start" >/dev/null
psqlq() { local db="$1"; shift; "$PGBIN/psql" -X -q -v ON_ERROR_STOP=1 -h "$WORK" -p "$PORT" -U postgres -d "$db" "$@"; }

# Basisdatabase: nabootsing + migraties (elke migratie in één transactie, zoals de CLI).
psqlq postgres -c "create database kg_basis"
psqlq kg_basis -f "$HERE/supabase_stub.sql"
for f in "$KG"/migrations/*.sql; do
  echo "migratie: $(basename "$f")"
  psqlq kg_basis -1 -f "$f"
done

matrix() { psqlq "$1" -t -A -f "$HERE/rls_tests.sql" 2>&1 | grep -E "KG-RLS-tests|ERROR|KG-T[0-9]{2}" || true; }

uit="$(matrix kg_basis)"
echo "$uit"
echo "$uit" | grep -q "KG-RLS-tests geslaagd: 22 van 22" || { echo "MATRIX MISLUKT"; exit 1; }

if [ "${1:-}" = "--tegenproef" ]; then
  # Elke regel: verwacht falend scenario | sabotage (SQL, als postgres op een verse kopie).
  fouten=0; n=0
  while IFS='|' read -r verwacht sabotage; do
    [ -z "$verwacht" ] && continue
    n=$((n+1)); db="kg_s$n"
    psqlq postgres -c "create database $db template kg_basis"
    psqlq "$db" -c "$sabotage" >/dev/null
    res="$(matrix "$db")"
    if echo "$res" | grep -q "KG-RLS-tests geslaagd"; then
      echo "TEGENPROEF $n NIET GEVANGEN ($verwacht): $sabotage"; fouten=$((fouten+1))
    elif echo "$res" | grep -q "$verwacht"; then
      echo "tegenproef $n gevangen door $verwacht"
    else
      echo "TEGENPROEF $n gevangen door een ander scenario dan $verwacht: $(echo "$res" | grep -m1 -o 'KG-T[0-9][0-9][^"]*' || echo "$res" | head -1)"; fouten=$((fouten+1))
    fi
    psqlq postgres -c "drop database $db" >/dev/null
  done < "$HERE/tegenproeven.txt"
  echo "Tegenproeven gevangen: $((n-fouten)) van $n"
  [ "$fouten" -eq 0 ] || exit 1
fi
