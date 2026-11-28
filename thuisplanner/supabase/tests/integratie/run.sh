#!/usr/bin/env bash
# Thuisplanner KG-5B: integratie- en gelijktijdigheidstests tegen de draaiende LOKALE Supabase-stack van thuisplanner/ (supabase start).
# Leest URL's en lokale demosleutels uit `supabase status -o env`; niets wordt opgeslagen of gecommit.
#   SUPABASE="npx supabase@2.117.0" thuisplanner/supabase/tests/integratie/run.sh
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
SUPABASE="${SUPABASE:-supabase}"
eval "$(cd "$HERE/../../.." && $SUPABASE status -o env 2>/dev/null | grep -E '^(API_URL|ANON_KEY|SERVICE_ROLE_KEY|DB_URL|JWT_SECRET)=')"
export API_URL ANON_KEY SERVICE_ROLE_KEY DB_URL JWT_SECRET
# Mijn spullen: de opruimronde vraagt het lokale wachtrijgeheim (uit k1-lokaal.mjs; nooit in de repository).
if [ -f "$HERE/../../functions/.env" ]; then
  WACHTRIJ_GEHEIM="$(grep '^WACHTRIJ_GEHEIM=' "$HERE/../../functions/.env" | cut -d= -f2-)"; export WACHTRIJ_GEHEIM
  # Verwijderen op verzoek (A9): de hash van een adres, zoals de codelaag die maakt (lokale pepper).
  K1_PEPPER="$(grep '^K1_PEPPER=' "$HERE/../../functions/.env" | cut -d= -f2-)"; export K1_PEPPER
fi
cd "$HERE"
[ -d node_modules ] || npm ci --no-audit --no-fund
# API, Auth en Realtime; daarna gelijktijdigheid (aparte verbindingen) en de tegenproef daarvan:
# zonder vergrendelingen moet elke race weer optreden.
node --test --test-concurrency=1 --test-timeout=600000 --test-force-exit integratie.test.mjs gelijktijdig.test.mjs sync.test.mjs herstel.test.mjs herstel2.test.mjs herstel3.test.mjs react.test.mjs p1p2.test.mjs uitnodiging.test.mjs poort.test.mjs k1.test.mjs uitnodigingsmail.test.mjs besloten.test.mjs vakanties.test.mjs vakanties-sync.test.mjs spullen.test.mjs spullen-sync.test.mjs spullen-taakprivacy.test.mjs plannen-sync.test.mjs verwijderen-spullen.test.mjs export.test.mjs nacontrole.test.mjs
# Verwijderen op verzoek (A9), AVG-inzage en het dagoverzicht (V6), elk met hun tegenproeven in de test zelf.
node --test --test-concurrency=1 --test-timeout=600000 --test-force-exit verwijderen.test.mjs avg-export.test.mjs dagoverzicht.test.mjs
KG_TEGENPROEF=1 node --test --test-concurrency=1 --test-timeout=600000 --test-force-exit gelijktijdig.test.mjs
# KG-5D herstelronde 1: zonder kanaalwissel blijft een niet-meewerkende client seintjes ontvangen
# (Realtime trekt zelf niet in); herstelronde 3: met de oude add_shopping_items opent een herhaalde
# opdracht een afgevinkte boodschap opnieuw; en elke teruggedraaide eigenschap van de syncmodule laat
# zijn regressietest falen.
KG_TEGENPROEF=1 node --test --test-concurrency=1 --test-timeout=600000 --test-force-exit herstel.test.mjs herstel3.test.mjs
node sync-tegenproeven.mjs
# KG-5H deel 2 (K1) en de besloten bèta: elke grens in de codelaag gesaboteerd moet zijn integratietest laten falen.
node k1-tegenproeven.mjs
# F8 Vakanties (V1.2): elke teruggedraaide eigenschap van de vakantielaag in de sync laat zijn test falen.
node vakanties-sync-tegenproeven.mjs
# Mijn spullen & Documenten (gate 9): elke te ruime storage-policy of zichtbaarheidsfunctie laat een scheidingstest falen.
node spullen-tegenproeven.mjs
