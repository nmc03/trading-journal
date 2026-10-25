#!/usr/bin/env bash
# Builds the Docker image, runs it with throwaway credentials and checks the main behaviours:
# healthcheck, UI, SPA fallback, security header, localised API errors, login, persistence
# across a restart, and that the server does not run as root.
# Needs Docker, curl and jq. It refuses to run if backend/.env or data/ already exist, so it
# never touches a real journal: use it in CI or in a clean checkout.
set -euo pipefail

cd "$(dirname "$0")/.."

PORT="${SMOKE_PORT:-18080}"
SMOKE_USER="smoke"
SMOKE_PASS="smoke-pass-$(date +%s)-throwaway"
SMOKE_SECRET="$(head -c 48 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 48)"

if [ -e backend/.env ] || [ -e data ]; then
  echo "backend/.env or data/ already exists; refusing to overwrite it. Run this in a clean checkout." >&2
  exit 1
fi

fail() {
  echo "FAIL: $*" >&2
  docker compose logs --no-color app 2>&1 | tail -n 40 >&2 || true
  exit 1
}

cleanup() {
  # The container owns the files it wrote to the bind mount: let it empty the folder (no sudo needed).
  docker compose exec -T -u root app sh -c 'rm -rf /app/data/* /app/data/.[!.]*' >/dev/null 2>&1 || true
  docker compose down -v --remove-orphans >/dev/null 2>&1 || true
  rm -rf data 2>/dev/null || true
  rm -f backend/.env
}
trap cleanup EXIT

sed -e "s|^TJ_USER=.*|TJ_USER=${SMOKE_USER}|" \
    -e "s|^TJ_PASSWORD=.*|TJ_PASSWORD=${SMOKE_PASS}|" \
    -e "s|^JWT_SECRET=.*|JWT_SECRET=${SMOKE_SECRET}|" \
    backend/.env.example > backend/.env

export HTTP_PORT="$PORT"
BASE="http://127.0.0.1:${PORT}"

wait_healthy() {
  local cid status="starting"
  cid="$(docker compose ps -q app)"
  for _ in $(seq 1 45); do
    status="$(docker inspect --format '{{.State.Health.Status}}' "$cid" 2>/dev/null || echo starting)"
    [ "$status" = healthy ] && return 0
    sleep 2
  done
  fail "container did not become healthy (status: ${status})"
}

echo "== build and start"
docker compose up -d --build
wait_healthy

echo "== web UI"
curl -fsS "$BASE/" | grep -q 'id="root"' || fail "GET / does not serve the UI"
[ "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/history")" = 200 ] || fail "SPA fallback (/history) is not 200"
curl -fsS "$BASE/api/health" | jq -e '.ok == true' >/dev/null || fail "/api/health is not ok"
curl -sSI "$BASE/" | grep -qi '^content-security-policy:' || fail "missing Content-Security-Policy header"

echo "== API errors follow Accept-Language"
for pair in "en:Not authorised" "fr:Non autorisé" "de:Nicht autorisiert" "es:No autorizado"; do
  lang="${pair%%:*}"
  expected="${pair#*:}"
  got="$(curl -s -H "Accept-Language: ${lang}" "$BASE/api/trades" | jq -r .error)"
  [ "$got" = "$expected" ] || fail "Accept-Language ${lang}: expected '${expected}', got '${got}'"
done

echo "== login and persistence across a restart"
token="$(curl -fsS -X POST -H 'Content-Type: application/json' \
  -d "{\"username\":\"${SMOKE_USER}\",\"password\":\"${SMOKE_PASS}\"}" "$BASE/api/auth/login" | jq -r .token)"
[ -n "$token" ] && [ "$token" != null ] || fail "login did not return a token"
auth=(-H "Authorization: Bearer ${token}")

curl -fsS "${auth[@]}" "$BASE/api/trades" | jq -e 'length == 0' >/dev/null || fail "expected an empty journal"
curl -fsS -X POST "${auth[@]}" -H 'Content-Type: application/json' \
  -d '{"date":"2026-10-01","ticker":"SMOKE","entryPrice":10,"shares":1}' "$BASE/api/trades" \
  | jq -e '.ok == true' >/dev/null || fail "could not create a trade"

docker compose restart app >/dev/null
wait_healthy
curl -fsS "${auth[@]}" "$BASE/api/trades" | jq -e 'map(.ticker) | index("SMOKE") != null' >/dev/null \
  || fail "the trade did not survive a restart"
[ -f data/trading.db ] || fail "data/trading.db was not created on the host"

echo "== the server process does not run as root"
proc_user="$(docker compose exec -T app sh -c "ps -o user,args | awk '/node server.js/ && !/awk/ {print \$1; exit}'")"
[ "$proc_user" = node ] || fail "server runs as '${proc_user}', expected 'node'"

echo "Docker smoke test passed."
