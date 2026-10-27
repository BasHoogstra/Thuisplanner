#!/usr/bin/env bash
# Thuisplanner-staging: de generale repetitie van een uitrol van nieuwe migraties, helemaal lokaal.
# Zie docs/thuisplanner-staging-overstap.md, "Stap 9b — Vakanties, Agenda en de slimme + naar staging".
#
# 1. De export van staging (verbinding.ps1 -Export) terug in een aparte, lege lokale stack (zoals de hersteltoets);
# 2. daarop de migraties die online al staan (tot en met STAGING_STAND), met dezelfde CLI als verbinding.ps1;
# 3. een foto van alle gegevens, en de controle vooraf van verbinding.ps1 -Bijwerken (precies de nieuwe migraties);
# 4. de nieuwe migraties met `supabase db push`, zoals online;
# 5. de bestaande gegevens vergelijken met de foto, en de nacontrole tegen de referentie van de nieuwe stand.
# Raakt de gewone lokale stack niet (eigen project_id en poorten) en geen online project. Na afloop wordt de aparte
# stack gestopt en zonder back-up verwijderd.
#   bash thuisplanner/supabase/staging/generale.sh <exportmap> <SHA-256 van manifest.json> [STAGING_STAND]
set -euo pipefail
MAP="${1:?gebruik: generale.sh <exportmap> <sha256 van manifest.json> [stand online, standaard 20261024120000]}"
VERWACHT_MANIFEST="${2:?geef de SHA-256 van manifest.json die de export toonde}"
STAGING_STAND="${3:-20261024120000}"
HIER="$(cd "$(dirname "$0")" && pwd)"
KG="$(cd "$HIER/.." && pwd)"
SUPA="${SUPABASE:-npx --yes supabase@2.117.0}"   # dezelfde versie als verbinding.ps1 (db push)
POORT_BASIS=5445   # 54450–54454: API, database, schaduw, Studio, mail
DB="postgresql://postgres:postgres@127.0.0.1:${POORT_BASIS}2/postgres"

echo "== 1. De export zelf (het manifest, de controlesommen en de tellingen)"
WERKELIJK_MANIFEST="$(node -e "console.log(require('crypto').createHash('sha256').update(require('fs').readFileSync(process.argv[1] + '/manifest.json')).digest('hex'))" "$MAP")"
if [ "$WERKELIJK_MANIFEST" != "$VERWACHT_MANIFEST" ]; then
  echo "GESTOPT: manifest.json is niet het manifest van de export (SHA-256 $WERKELIJK_MANIFEST)."; exit 1
fi
node "$HIER/export.mjs" controleer "$MAP"
EXPORT_STAND="$(node -e "console.log(JSON.parse(require('fs').readFileSync(process.argv[1] + '/manifest.json','utf8')).migraties.at(-1))" "$MAP")"
NIEUW="$(cd "$KG/migrations" && ls *.sql | cut -c1-14 | awk -v s="$STAGING_STAND" '$0 > s' | wc -l | tr -d ' ')"
echo "export: stand $EXPORT_STAND; online: $STAGING_STAND; nieuw in de repository: $NIEUW migratie(s)"

WERK="$(mktemp -d "${TMPDIR:-/tmp}/thuisplanner-generale-XXXXXX")"
opruimen() {
  (cd "$WERK" && $SUPA stop --workdir . --no-backup >/dev/null 2>&1) || true
  rm -rf "$WERK"
}
trap opruimen EXIT
mkdir -p "$WERK/supabase/migrations"
kopieer() {   # de migraties tot en met $1 naar de werkmap (zonder \r, zoals de hersteltoets)
  for f in "$KG"/migrations/*.sql; do
    v="$(basename "$f" | cut -c1-14)"
    if [[ ! "$v" > "$1" ]]; then tr -d '\r' < "$f" > "$WERK/supabase/migrations/$(basename "$f")"; fi
  done
}

echo "== 2. Een aparte, lege stack met de migraties van de export (tot en met $EXPORT_STAND), en de export terug"
tr -d '\r' < "$KG/config.toml" | sed \
  -e 's/^project_id = "thuisplanner"/project_id = "thuisplanner_generale"/' \
  -e "s/55321/${POORT_BASIS}1/g" -e "s/55322/${POORT_BASIS}2/g" -e "s/55320/${POORT_BASIS}0/g" \
  -e "s/55323/${POORT_BASIS}3/g" -e "s/55324/${POORT_BASIS}4/g" \
  | awk '/^\[/{sectie=$0} { if ((sectie=="[db.seed]" || sectie=="[auth.hook.send_email]") && $0 ~ /^enabled = true/) print "enabled = false"; else print }' \
  > "$WERK/supabase/config.toml"
kopieer "$EXPORT_STAND"
(cd "$WERK" && $SUPA start --workdir . -x realtime,storage-api,imgproxy,kong,mailpit,postgrest,postgres-meta,studio,edge-runtime,logflare,vector,supavisor >/dev/null)
DB_URL="$DB" node "$HIER/export.mjs" herstel "$MAP"

if [[ "$STAGING_STAND" > "$EXPORT_STAND" ]]; then
  echo "== 3. De migraties die online al staan (tot en met $STAGING_STAND), met db push zoals verbinding.ps1"
  kopieer "$STAGING_STAND"
  (cd "$WERK" && $SUPA db push --workdir . --db-url "$DB" --yes)
fi

echo "== 4. Foto van alle gegevens, en de controle vooraf (verwacht: $NIEUW nieuwe migraties)"
FOTO="$WERK/foto-voor.json"
DB_URL="$DB" node "$HIER/generale.mjs" foto "$FOTO"
DB_URL="$DB" node "$HIER/generale.mjs" voor "$NIEUW"

echo "== 5. De nieuwe migraties met db push (de uitrol)"
kopieer 99999999999999
(cd "$WERK" && $SUPA db push --workdir . --db-url "$DB" --yes)

echo "== 6. Bestaande gegevens ongewijzigd, en de nacontrole tegen de nieuwe stand"
DB_URL="$DB" node "$HIER/generale.mjs" vergelijk "$FOTO"
DB_URL="$DB" node "$HIER/generale.mjs" na
echo "GENERALE REPETITIE GESLAAGD: de nieuwe migraties lopen zonder fout op een kopie van staging, de bestaande gegevens blijven gelijk en de nacontrole is in orde."
