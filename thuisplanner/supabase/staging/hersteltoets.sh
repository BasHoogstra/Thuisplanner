#!/usr/bin/env bash
# Thuisplanner-staging, stap 2b: de hersteltoets. Zet een export (verbinding.ps1 -Export) terug in een aparte, LEGE
# lokale Supabase-stack met precies de migraties uit het manifest, en vergelijkt daarna elke tabel met de export.
# Zie docs/thuisplanner-staging-overstap.md, stap 2b. Raakt de gewone lokale stack niet (eigen project_id en poorten)
# en geen online project. Na afloop wordt de aparte stack gestopt en zonder back-up verwijderd.
#   bash thuisplanner/supabase/staging/hersteltoets.sh <exportmap> <SHA-256 van manifest.json, zoals de export die toonde>
set -euo pipefail
MAP="${1:?gebruik: hersteltoets.sh <exportmap> <sha256 van manifest.json>}"
VERWACHT_MANIFEST="${2:?geef de SHA-256 van manifest.json die de export toonde}"
HIER="$(cd "$(dirname "$0")" && pwd)"
KG="$(cd "$HIER/.." && pwd)"
SUPA="${SUPABASE:-npx --yes supabase@2.120.0}"
POORT_BASIS=5443   # 54430–54434: API, database, schaduw, Studio, mail

echo "== 1. De export zelf (het manifest, de controlesommen en de tellingen)"
WERKELIJK_MANIFEST="$(node -e "console.log(require('crypto').createHash('sha256').update(require('fs').readFileSync(process.argv[1] + '/manifest.json')).digest('hex'))" "$MAP")"
if [ "$WERKELIJK_MANIFEST" != "$VERWACHT_MANIFEST" ]; then
  echo "GESTOPT: manifest.json is niet het manifest van de export (SHA-256 $WERKELIJK_MANIFEST)."; exit 1
fi
node "$HIER/export.mjs" controleer "$MAP"
LAATSTE="$(node -e "console.log(JSON.parse(require('fs').readFileSync(process.argv[1] + '/manifest.json','utf8')).migraties.at(-1))" "$MAP")"
VERWACHT="$(node -e "console.log(JSON.parse(require('fs').readFileSync(process.argv[1] + '/manifest.json','utf8')).migraties.join(' '))" "$MAP")"

WERK="$(mktemp -d "${TMPDIR:-/tmp}/thuisplanner-hersteltoets-XXXXXX")"
opruimen() {
  (cd "$WERK" && $SUPA stop --workdir . --no-backup >/dev/null 2>&1) || true
  rm -rf "$WERK"
}
trap opruimen EXIT
mkdir -p "$WERK/supabase/migrations"

echo "== 2. Een aparte, lege stack met de migraties tot en met $LAATSTE (zonder seed en zonder mail-hook)"
# Eigen project_id en poorten; geen seed (geen fictieve accounts), geen Send Email-hook (geen Edge Functions nodig).
tr -d '\r' < "$KG/config.toml" | sed \
  -e 's/^project_id = "thuisplanner"/project_id = "thuisplanner_hersteltoets"/' \
  -e "s/55321/${POORT_BASIS}1/g" -e "s/55322/${POORT_BASIS}2/g" -e "s/55320/${POORT_BASIS}0/g" \
  -e "s/55323/${POORT_BASIS}3/g" -e "s/55324/${POORT_BASIS}4/g" \
  | awk '/^\[/{sectie=$0} { if ((sectie=="[db.seed]" || sectie=="[auth.hook.send_email]") && $0 ~ /^enabled = true/) print "enabled = false"; else print }' \
  > "$WERK/supabase/config.toml"
GEKOPIEERD=""
for f in "$KG"/migrations/*.sql; do
  v="$(basename "$f" | cut -c1-14)"
  if [[ ! "$v" > "$LAATSTE" ]]; then tr -d '\r' < "$f" > "$WERK/supabase/migrations/$(basename "$f")"; GEKOPIEERD="${GEKOPIEERD:+$GEKOPIEERD }$v"; fi
done
if [ "$GEKOPIEERD" != "$VERWACHT" ]; then
  echo "GESTOPT: de migraties in de repository ($GEKOPIEERD) zijn niet die van de export ($VERWACHT)."; exit 1
fi
(cd "$WERK" && $SUPA start --workdir . -x realtime,storage-api,imgproxy,kong,mailpit,postgrest,postgres-meta,studio,edge-runtime,logflare,vector,supavisor >/dev/null)

echo "== 3. Terugzetten en vergelijken"
DB_URL="postgresql://postgres:postgres@127.0.0.1:${POORT_BASIS}2/postgres" node "$HIER/export.mjs" herstel "$MAP"
echo "HERSTELTOETS GESLAAGD: de export is volledig terug te zetten in een lege database met dezelfde migraties."
