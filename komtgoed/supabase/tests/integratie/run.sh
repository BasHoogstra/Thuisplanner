#!/usr/bin/env bash
# KomtGoed KG-5B: integratietest tegen de draaiende LOKALE Supabase-stack van komtgoed/ (supabase start).
# Leest URL's en lokale demosleutels uit `supabase status -o env`; niets wordt opgeslagen of gecommit.
#   SUPABASE="npx supabase@2.117.0" komtgoed/supabase/tests/integratie/run.sh
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
SUPABASE="${SUPABASE:-supabase}"
eval "$(cd "$HERE/../../.." && $SUPABASE status -o env 2>/dev/null | grep -E '^(API_URL|ANON_KEY|SERVICE_ROLE_KEY|DB_URL)=')"
export API_URL ANON_KEY SERVICE_ROLE_KEY DB_URL
cd "$HERE"
[ -d node_modules ] || npm ci --no-audit --no-fund
node --test --test-concurrency=1 --test-timeout=600000 --test-force-exit integratie.test.mjs
