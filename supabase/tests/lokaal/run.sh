#!/usr/bin/env bash
# Bouwt een lege lokale database op uit supabase/migrations/ en draait de RLS-tests.
# Alleen voor ontwikkelaars met PostgreSQL 16+ (initdb/pg_ctl/psql). Raakt geen Supabase-project.
#   supabase/tests/lokaal/run.sh            # tijdelijke database, daarna opgeruimd
# Omgeving: PGBIN (map met initdb/pg_ctl), standaard /usr/lib/postgresql/16/bin.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
PGBIN="${PGBIN:-/usr/lib/postgresql/16/bin}"
WORK="$(mktemp -d)"
PORT="${PGPORT_TEST:-54330}"
RUN_AS=()
if [ "$(id -u)" = "0" ]; then chown postgres "$WORK"; RUN_AS=(su postgres -c); fi
run() { if [ ${#RUN_AS[@]} -gt 0 ]; then "${RUN_AS[@]}" "$*"; else bash -c "$*"; fi; }
cleanup() { run "$PGBIN/pg_ctl -D $WORK/data -m immediate stop" >/dev/null 2>&1 || true; rm -rf "$WORK"; }
trap cleanup EXIT
run "$PGBIN/initdb -D $WORK/data -U postgres -A trust" >/dev/null
run "$PGBIN/pg_ctl -D $WORK/data -o '-p $PORT -k $WORK' -l $WORK/log -w start" >/dev/null
PSQL=(psql -X -q -v ON_ERROR_STOP=1 -h "$WORK" -p "$PORT" -U postgres -d postgres)
"${PSQL[@]}" -f "$ROOT/supabase/tests/lokaal/supabase_stub.sql"
MIGDIR="${MIGDIR:-$ROOT/supabase/migrations}"
for f in "$MIGDIR"/*.sql; do
  echo "migratie: $(basename "$f")"
  # Zoals de CLI: elke migratie in één transactie, zonder 'extensions' in het search_path.
  "${PSQL[@]}" -1 -f "$f"
done
echo "vingerafdruk lokaal (PostgreSQL $("${PSQL[@]}" -t -A -c "show server_version")): $("${PSQL[@]}" -t -A -F " " -f "$ROOT/supabase/tests/schema_fingerprint.sql" | grep "^TOTAAL")"
"${PSQL[@]}" -t -A -f "$ROOT/supabase/tests/rls_tests.sql" | grep -E "RLS-tests|ERROR|FOUT|T[0-9]{2}"
