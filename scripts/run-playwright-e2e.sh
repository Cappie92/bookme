#!/usr/bin/env bash
# Own backend + Vite + Playwright against a disposable SQLite DB.
# Used by GitHub Actions and local CI-like runs. Never bookme.db / production.

set -u

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BACKEND_LOG="${BACKEND_LOG:-/tmp/dedato-e2e-backend.log}"
FRONTEND_LOG="${FRONTEND_LOG:-/tmp/dedato-e2e-vite.log}"
E2E_DB="${E2E_DATABASE_PATH:-/tmp/dedato-playwright-e2e.db}"
BACKEND_HOST="127.0.0.1"
BACKEND_PORT="8000"
FRONTEND_HOST="127.0.0.1"
FRONTEND_PORT="5173"
READY_TIMEOUT_SEC="${E2E_READY_TIMEOUT_SEC:-45}"
BACKEND_PID=""
FRONTEND_PID=""
EXIT_CODE=0

fail() {
  echo "ERROR: $*" >&2
  if [ -f "$BACKEND_LOG" ]; then
    echo "--- backend log (last 80 lines) ---" >&2
    tail -80 "$BACKEND_LOG" >&2 || true
  fi
  if [ -f "$FRONTEND_LOG" ]; then
    echo "--- vite log (last 80 lines) ---" >&2
    tail -80 "$FRONTEND_LOG" >&2 || true
  fi
  EXIT_CODE=1
  exit 1
}

is_loopback_http_url() {
  local raw=$1
  case "$raw" in
    http://127.0.0.1:*|http://localhost:*|http://[::1]:*|https://127.0.0.1:*|https://localhost:*|https://[::1]:*)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

refuse_dangerous() {
  local label=$1
  local value=$2
  local lower
  lower=$(printf '%s' "$value" | tr '[:upper:]' '[:lower:]')
  case "$lower" in
    *bookme.db*|*dedato.ru*|postgres://*|postgresql://*|mysql://*|https://www.*|http://www.*)
      fail "$label is not a disposable local E2E target: $value"
      ;;
  esac
}

term_tree() {
  local pid=$1
  local sig=${2:-TERM}
  local child
  [ -n "$pid" ] || return 0
  for child in $(pgrep -P "$pid" 2>/dev/null || true); do
    term_tree "$child" "$sig"
  done
  kill -s "$sig" "$pid" 2>/dev/null || true
}

pid_alive() {
  [ -n "${1:-}" ] && kill -0 "$1" 2>/dev/null
}

cleanup() {
  term_tree "${BACKEND_PID}" TERM
  term_tree "${FRONTEND_PID}" TERM
  local i=0
  while [ "$i" -lt 5 ]; do
    if pid_alive "${BACKEND_PID}" || pid_alive "${FRONTEND_PID}"; then
      sleep 1
      i=$((i + 1))
      continue
    fi
    break
  done
  term_tree "${BACKEND_PID}" KILL
  term_tree "${FRONTEND_PID}" KILL
  if [ -n "${BACKEND_PID}" ]; then
    wait "${BACKEND_PID}" 2>/dev/null || true
  fi
  if [ -n "${FRONTEND_PID}" ]; then
    wait "${FRONTEND_PID}" 2>/dev/null || true
  fi
}
trap cleanup EXIT

wait_url() {
  local url=$1
  local timeout=$2
  local i=0
  while [ "$i" -lt "$timeout" ]; do
    if curl -sf --max-time 1 "$url" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
    i=$((i + 1))
  done
  return 1
}

wait_frontend_html() {
  local url=$1
  local timeout=$2
  local i=0
  local body
  while [ "$i" -lt "$timeout" ]; do
    body=$(curl -sf --max-time 2 "$url" 2>/dev/null || true)
    if printf '%s' "$body" | grep -q "please use Vite dev server"; then
      return 1
    fi
    if printf '%s' "$body" | grep -qE '<!DOCTYPE html>|<html'; then
      return 0
    fi
    sleep 1
    i=$((i + 1))
  done
  return 1
}

if [ "${ENVIRONMENT:-}" = "production" ] || [ "${ENVIRONMENT:-}" = "PRODUCTION" ]; then
  fail "ENVIRONMENT=production is forbidden for Playwright E2E"
fi

if [ -n "${E2E_BASE_URL:-}" ]; then
  refuse_dangerous E2E_BASE_URL "$E2E_BASE_URL"
  is_loopback_http_url "$E2E_BASE_URL" || fail "E2E_BASE_URL must be loopback, got $E2E_BASE_URL"
fi
if [ -n "${E2E_BACKEND_URL:-}" ]; then
  refuse_dangerous E2E_BACKEND_URL "$E2E_BACKEND_URL"
  is_loopback_http_url "$E2E_BACKEND_URL" || fail "E2E_BACKEND_URL must be loopback, got $E2E_BACKEND_URL"
fi
if [ -n "${VITE_API_BASE_URL:-}" ]; then
  refuse_dangerous VITE_API_BASE_URL "$VITE_API_BASE_URL"
  is_loopback_http_url "$VITE_API_BASE_URL" || fail "VITE_API_BASE_URL must be loopback, got $VITE_API_BASE_URL"
fi
if [ -n "${DATABASE_URL:-}" ]; then
  refuse_dangerous DATABASE_URL "$DATABASE_URL"
  case "${DATABASE_URL}" in
    sqlite:*) ;;
    *) fail "DATABASE_URL must be sqlite, got ${DATABASE_URL}" ;;
  esac
fi

refuse_dangerous E2E_DATABASE_PATH "$E2E_DB"
case "$E2E_DB" in
  /*) ;;
  *) fail "E2E_DATABASE_PATH must be an absolute path, got $E2E_DB" ;;
esac

export ENVIRONMENT=development
export DEV_E2E=true
export ZVONOK_MODE=stub
export ROBOKASSA_MODE=stub
export EMAIL_ENABLED=false
export APPLE_IAP_ENABLED=false
export PUSH_NOTIFICATIONS_ENABLED=false
export ENABLE_DEV_TESTDATA=""
export E2E_REQUIRE_SEED=1
# Playwright's verified local origin is localhost; servers still bind 127.0.0.1 only.
export E2E_BASE_URL="http://localhost:${FRONTEND_PORT}"
export E2E_BACKEND_URL="http://localhost:${BACKEND_PORT}"
export VITE_API_BASE_URL="http://${BACKEND_HOST}:${BACKEND_PORT}"
export DATABASE_URL="sqlite:///${E2E_DB}"

if [ -n "${PYTHON:-}" ]; then
  :
elif [ -x "$ROOT/backend/.venv/bin/python" ]; then
  PYTHON="$ROOT/backend/.venv/bin/python"
else
  PYTHON=python3
fi

if curl -sf --max-time 1 "http://${BACKEND_HOST}:${BACKEND_PORT}/health" >/dev/null 2>&1 \
  || curl -sf --max-time 1 "${E2E_BACKEND_URL}/health" >/dev/null 2>&1; then
  fail "Refusing to reuse an existing process on :${BACKEND_PORT}. Stop it, then rerun."
fi
if curl -sf --max-time 1 "http://${FRONTEND_HOST}:${FRONTEND_PORT}/" >/dev/null 2>&1 \
  || curl -sf --max-time 1 "${E2E_BASE_URL}/" >/dev/null 2>&1; then
  fail "Refusing to reuse an existing process on :${FRONTEND_PORT}. Stop it, then rerun."
fi

rm -f "$E2E_DB"
: >"$BACKEND_LOG"
: >"$FRONTEND_LOG"

echo "Playwright E2E stack"
echo "  DATABASE_URL=$DATABASE_URL"
echo "  E2E_BACKEND_URL=$E2E_BACKEND_URL"
echo "  E2E_BASE_URL=$E2E_BASE_URL"
echo "  VITE_API_BASE_URL=$VITE_API_BASE_URL"
echo "  bind backend=${BACKEND_HOST}:${BACKEND_PORT}"
echo "  bind frontend=${FRONTEND_HOST}:${FRONTEND_PORT}"
echo "  PYTHON=$PYTHON"

cd "$ROOT/backend"
env -u CI "$PYTHON" -m uvicorn main:app --host "$BACKEND_HOST" --port "$BACKEND_PORT" >"$BACKEND_LOG" 2>&1 &
BACKEND_PID=$!
echo "Backend PID $BACKEND_PID"

if ! wait_url "http://${BACKEND_HOST}:${BACKEND_PORT}/health" "$READY_TIMEOUT_SEC"; then
  fail "Backend did not become ready at http://${BACKEND_HOST}:${BACKEND_PORT}/health"
fi
echo "Backend ready"

cd "$ROOT/frontend"
env -u CI "$ROOT/frontend/node_modules/.bin/vite" --host "$FRONTEND_HOST" --port "$FRONTEND_PORT" --strictPort >"$FRONTEND_LOG" 2>&1 &
FRONTEND_PID=$!
echo "Vite PID $FRONTEND_PID"

if ! wait_frontend_html "${E2E_BASE_URL}/" "$READY_TIMEOUT_SEC"; then
  fail "Vite did not serve SPA HTML at ${E2E_BASE_URL}"
fi
echo "Frontend ready"

echo "Running npm run test:e2e"
cd "$ROOT/frontend"
if ! CI=true npm run test:e2e; then
  EXIT_CODE=1
  echo "Playwright failed" >&2
  if [ -f "$BACKEND_LOG" ]; then
    echo "--- backend log (last 80 lines) ---" >&2
    tail -80 "$BACKEND_LOG" >&2 || true
  fi
  if [ -f "$FRONTEND_LOG" ]; then
    echo "--- vite log (last 80 lines) ---" >&2
    tail -80 "$FRONTEND_LOG" >&2 || true
  fi
fi

exit "$EXIT_CODE"
