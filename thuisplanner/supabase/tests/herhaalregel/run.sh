#!/usr/bin/env bash
# Toetst het gedeelde herhalingscontract in SQL, in een EIGEN, TIJDELIJKE PostgreSQL-container:
# - alleen een image die al lokaal staat (--pull never: er wordt niets gedownload);
# - zonder netwerk (--network none) en zonder open poort; geen gedeelde database, geen staging;
# - begrensd op 1 CPU en 2 GB geheugen, zodat andere lokale stacks er geen last van hebben;
# - een willekeurig wachtwoord dat nergens wordt bewaard; de container wordt na afloop verwijderd.
#
# Eerst (zonder Docker): de kopiecontrole van private.occurs_on (controleer-kopie.mjs).
# Gebruik: thuisplanner/supabase/tests/herhaalregel/run.sh [--tegenproef] [--zonder-gelijkwaardigheid]
#   PG_IMAGE=<lokale image> (standaard public.ecr.aws/supabase/postgres:17.6.1.167)
set -euo pipefail
# Git Bash op Windows: paden naar de container niet omzetten (alleen voor docker, niet voor node).
dk() { MSYS_NO_PATHCONV=1 docker "$@"; }

HIER="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
IMAGE="${PG_IMAGE:-public.ecr.aws/supabase/postgres:17.6.1.167}"
NAAM="tp-herhaalregel-$$"
TEGENPROEF=0; GELIJK=1
for a in "$@"; do
  case "$a" in
    --tegenproef) TEGENPROEF=1 ;;
    --zonder-gelijkwaardigheid) GELIJK=0 ;;
    *) echo "onbekende optie: $a" >&2; exit 2 ;;
  esac
done

# De vergelijkingskopie van private.occurs_on moet letterlijk gelijk zijn aan de migratie.
node "$HIER/controleer-kopie.mjs"

dk image inspect "$IMAGE" >/dev/null 2>&1 || { echo "Image $IMAGE staat niet lokaal; niets gedownload. Zet PG_IMAGE." >&2; exit 2; }
WACHTWOORD="$(node -e "process.stdout.write(require('crypto').randomBytes(18).toString('hex'))")"
dk run -d --rm --pull never --network none --cpus 1 --memory 2g --name "$NAAM" -e POSTGRES_PASSWORD="$WACHTWOORD" "$IMAGE" >/dev/null
unset WACHTWOORD
trap 'dk rm -f "$NAAM" >/dev/null 2>&1 || true' EXIT
for _ in $(seq 1 60); do dk exec "$NAAM" pg_isready -U postgres -h localhost >/dev/null 2>&1 && break; sleep 2; done
# De image start de database één keer opnieuw na de eerste inrichting: wacht tot een echte query lukt.
for _ in $(seq 1 30); do dk exec "$NAAM" psql -U postgres -h localhost -tAc 'select 1' >/dev/null 2>&1 && break; sleep 2; done

psql() { dk exec -i "$NAAM" psql -U postgres -h localhost -v ON_ERROR_STOP=1 -q "$@"; }
laad() { psql -c 'set client_min_messages = warning; drop schema if exists private cascade' >/dev/null; psql -f - < "$HIER/rule_occurs_on.sql"; }
VERSIE="$(psql -tAc 'show server_version')"
echo "PostgreSQL $VERSIE (eigen tijdelijke container $NAAM, zonder netwerk)"

laad
node "$HIER/maak-sql-tests.mjs" > "$HIER/.vectoren-tests.sql"
trap 'rm -f "$HIER/.vectoren-tests.sql"; dk rm -f "$NAAM" >/dev/null 2>&1 || true' EXIT
psql -tA -f - < "$HIER/.vectoren-tests.sql"
if [ "$GELIJK" = 1 ]; then
  if ! uit="$(psql -f - < "$HIER/gelijkwaardigheid.sql" 2>&1)"; then echo "$uit" | tail -5; echo 'GELIJKWAARDIGHEID MISLUKT'; exit 1; fi
  echo "$uit" | grep -E 'gelijkwaardigheid|Time' || true
fi

if [ "$TEGENPROEF" = 1 ]; then
  fout=0
  for s in 1 2 3; do
    laad
    psql -v sabotage="$s" -f - < "$HIER/tegenproef.sql" >/dev/null
    if psql -tA -f - < "$HIER/.vectoren-tests.sql" >/dev/null 2>&1; then
      echo "TEGENPROEF $s: de vectoren slaagden ondanks de sabotage (FOUT)"; fout=1
    else
      echo "tegenproef $s: vectoren falen zoals verwacht"
    fi
  done
  laad   # sabotage 1 moet ook de gelijkwaardigheid laten falen
  psql -v sabotage=1 -f - < "$HIER/tegenproef.sql" >/dev/null
  if [ "$GELIJK" = 1 ]; then
    if psql -f - < "$HIER/gelijkwaardigheid.sql" >/dev/null 2>&1; then
      echo "TEGENPROEF 1: gelijkwaardigheid slaagde ondanks de sabotage (FOUT)"; fout=1
    else
      echo "tegenproef 1: gelijkwaardigheid faalt zoals verwacht"
    fi
  fi
  [ "$fout" = 0 ] || exit 1
fi
echo "GESLAAGD"
