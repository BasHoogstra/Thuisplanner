#!/usr/bin/env bash
# Thuisplanner: LAN-proef zonder telefoons. De app draait op deze machine op het netwerkadres van de
# Docker-brug (zoals `npm run lokaal:lan` op het wifi-adres); de browsers draaien in een container met een
# EIGEN netwerkstack en bereiken app, Auth, REST en Realtime alleen via dat adres, zonder secure context.
# Zo gedraagt een telefoon op hetzelfde wifi zich ook. Vervangt de proef met echte telefoons niet.
#   SUPABASE="npx supabase@2.117.0" bash scripts/lan-proef.sh
# Vereist: draaiende lokale stack (supabase start in komtgoed/), Docker, Playwright-Chromium op deze machine.
set -euo pipefail
APP="$(cd "$(dirname "$0")/.." && pwd)"
cd "$APP"
IP="${LAN_IP:-$(docker network inspect bridge -f '{{(index .IPAM.Config 0).Gateway}}')}"
NODE="$(command -v node)"
BROWSERS="${PLAYWRIGHT_BROWSERS_PATH:-$HOME/.cache/ms-playwright}"
# Een image die er al is (die van de database-container van de stack; in CI komt die van public.ecr.aws).
BEELD="${LAN_BEELD:-$(docker ps --filter 'name=supabase_db_' --format '{{.Image}}' | awk 'NR == 1')}"
LOG="$(mktemp)"
[ -n "$IP" ] || { echo "LAN-proef: geen netwerkadres van de Docker-brug gevonden" >&2; exit 1; }
[ -n "$BEELD" ] || { echo "LAN-proef: geen draaiende database-container van de lokale stack (supabase start)" >&2; exit 1; }
[ -d "$BROWSERS" ] || { echo "LAN-proef: Playwright-browsers niet gevonden in $BROWSERS" >&2; exit 1; }
echo "LAN-proef: app op http://$IP:5180, browsers in een container van $BEELD, Chromium uit $BROWSERS"

node scripts/lokaal.mjs seed
node scripts/lokaal.mjs dev --host "$IP" > "$LOG" 2>&1 &
DEV=$!
trap 'kill $DEV 2>/dev/null || true; pkill -f "[v]ite --mode lokaal --host" || true; node scripts/lokaal.mjs env >/dev/null' EXIT
for i in $(seq 1 60); do curl -sf "http://$IP:5180/" >/dev/null && break; sleep 1; done
cat "$LOG"

# Tweede netwerkhost: een container (eigen netwerkstack, eigen IP) die de bestanden van deze machine alleen
# leest (chroot) en zelf Node en Chromium start. Schrijven kan alleen in een tijdelijke /tmp in de container.
docker run --rm --network bridge -v /:/host:ro --tmpfs /host/tmp:exec \
  -e LAN_URL="http://$IP:5180/" -e LAN_UITVOER=/tmp/lan-uitvoer -e HOME=/tmp -e CI=1 \
  -e PLAYWRIGHT_BROWSERS_PATH="$BROWSERS" -e PATH="$(dirname "$NODE"):/usr/bin:/bin" \
  --entrypoint /usr/sbin/chroot "$BEELD" /host /bin/bash -c \
  "cd '$APP' && echo \"Browserhost: \$(cat /proc/net/fib_trie | awk '/32 host LOCAL/{print p} {p=\$2}' | grep -v '^127' | head -1)\" && \
   '$NODE' node_modules/@playwright/test/cli.js test -c playwright.lan.config.ts"
