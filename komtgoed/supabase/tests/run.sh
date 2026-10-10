#!/usr/bin/env bash
# KomtGoed KG-1/KG-5B: draait de RLS-testmatrix (rls_tests.sql) en de tegenproeven.
#
# Standaard: bouwt een lege, tijdelijke PostgreSQL op, voert de Supabase-nabootsing en
# komtgoed/supabase/migrations/*.sql uit. Raakt geen enkel Supabase-project en maakt geen netwerkverbinding.
# Met --db: gebruikt een al draaiende LOKALE Supabase-stack (supabase start), waarop de migraties al staan.
#
#   komtgoed/supabase/tests/run.sh                          # matrix op de nabootsing (verwacht: 27 van 27)
#   komtgoed/supabase/tests/run.sh --tegenproef             # daarna: elke sabotage moet het juiste scenario laten falen
#   komtgoed/supabase/tests/run.sh --db postgresql://postgres:postgres@127.0.0.1:55322/postgres [--tegenproef]
#
# Matrix en tegenproeven lopen elk in één transactie die wordt teruggedraaid: er blijft niets achter.
# Omgeving: PGBIN (map met initdb/pg_ctl/psql), standaard /usr/lib/postgresql/16/bin.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
KG="$(cd "$HERE/.." && pwd)"
PGBIN="${PGBIN:-/usr/lib/postgresql/16/bin}"
VERWACHT="KG-RLS-tests geslaagd: 27 van 27"

DB_URL=""; TEGENPROEF=0
while [ $# -gt 0 ]; do
  case "$1" in
    --db) DB_URL="$2"; shift 2 ;;
    --tegenproef) TEGENPROEF=1; shift ;;
    *) echo "onbekende optie: $1"; exit 2 ;;
  esac
done

if [ -n "$DB_URL" ]; then
  # Alleen een lokale stack: deze tests maken accounts aan en mogen nooit op een gedeelde database draaien.
  case "$DB_URL" in
    *@127.0.0.1:*|*@localhost:*) ;;
    *) echo "Weigering: --db moet naar 127.0.0.1 of localhost wijzen (lokale Supabase)"; exit 2 ;;
  esac
  PSQL="${PSQL:-psql}"
  psqlq() { "$PSQL" -X -q -v ON_ERROR_STOP=1 -d "$DB_URL" "$@"; }
  echo "doel: lokale Supabase ($("$PSQL" -X -t -A -d "$DB_URL" -c 'show server_version'))"
else
  PORT="${PGPORT_TEST:-54340}"
  WORK="$(mktemp -d)"
  RUN_AS=()
  if [ "$(id -u)" = "0" ]; then chown postgres "$WORK"; RUN_AS=(su postgres -c); fi
  run() { if [ ${#RUN_AS[@]} -gt 0 ]; then "${RUN_AS[@]}" "$*"; else bash -c "$*"; fi; }
  cleanup() { run "$PGBIN/pg_ctl -D $WORK/data -m immediate stop" >/dev/null 2>&1 || true; rm -rf "$WORK"; }
  trap cleanup EXIT
  run "$PGBIN/initdb -D $WORK/data -U postgres -A trust" >/dev/null
  run "$PGBIN/pg_ctl -D $WORK/data -o '-p $PORT -k $WORK' -l $WORK/log -w start" >/dev/null
  psqlq() { "$PGBIN/psql" -X -q -v ON_ERROR_STOP=1 -h "$WORK" -p "$PORT" -U postgres -d kg_basis "$@"; }
  "$PGBIN/psql" -X -q -h "$WORK" -p "$PORT" -U postgres -d postgres -c "create database kg_basis"
  echo "doel: nabootsing ($("$PGBIN/postgres" --version))"
  # Nabootsing + migraties (elke migratie in één transactie, zoals de CLI).
  psqlq -f "$HERE/supabase_stub.sql"
  for f in "$KG"/migrations/*.sql; do
    echo "migratie: $(basename "$f")"
    psqlq -1 -f "$f"
  done
fi

# Matrix, optioneel na een sabotage in dezelfde transactie (de rollback aan het eind wist beide).
# De waarschuwing "there is already a transaction in progress" van de tweede begin is verwacht.
matrix() {
  if [ -n "${1:-}" ]; then
    psqlq -t -A -c "begin" -c "$1" -f "$HERE/rls_tests.sql" 2>&1
  else
    psqlq -t -A -f "$HERE/rls_tests.sql" 2>&1
  fi | grep -E "KG-RLS-tests|ERROR|KG-T[0-9]{2}" || true
}

uit="$(matrix)"
echo "$uit"
echo "$uit" | grep -q "$VERWACHT" || { echo "MATRIX MISLUKT"; exit 1; }

if [ "$TEGENPROEF" = "1" ]; then
  # Elke regel: verwacht falend scenario | sabotage (SQL, als postgres, binnen de testtransactie).
  fouten=0; n=0
  while IFS='|' read -r verwacht sabotage; do
    [ -z "$verwacht" ] && continue
    n=$((n+1))
    res="$(matrix "$sabotage")"
    if echo "$res" | grep -q "KG-RLS-tests geslaagd"; then
      echo "TEGENPROEF $n NIET GEVANGEN ($verwacht): $sabotage"; fouten=$((fouten+1))
    elif echo "$res" | grep -q "$verwacht"; then
      echo "tegenproef $n gevangen door $verwacht"
    else
      echo "TEGENPROEF $n gevangen door een ander scenario dan $verwacht: $(echo "$res" | grep -m1 -o 'KG-T[0-9][0-9][^"]*' || echo "$res" | head -1)"; fouten=$((fouten+1))
    fi
  done < "$HERE/tegenproeven.txt"
  # Controle dat de sabotages echt zijn teruggedraaid.
  uit="$(matrix)"; echo "$uit" | grep -q "$VERWACHT" || { echo "MATRIX NA TEGENPROEVEN MISLUKT"; exit 1; }
  echo "Tegenproeven gevangen: $((n-fouten)) van $n"
  [ "$fouten" -eq 0 ] || exit 1
fi
