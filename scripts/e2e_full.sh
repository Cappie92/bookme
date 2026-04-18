#!/bin/bash
# E2E full run: backend (8000) + frontend (5173) + seed + Playwright
# Фиксированные порты: backend 8000, frontend 5173.
# RUNS=3 — прогнать 3 раза подряд, каждый раз reset+seed перед прогоном.
set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

BACKEND_PORT=8000
FRONTEND_PORT=5173
RUNS="${RUNS:-1}"
E2E_BACKEND_URL="http://localhost:${BACKEND_PORT}"
E2E_BASE_URL="http://localhost:${FRONTEND_PORT}"

# Временные файлы для логов
BACKEND_LOG=$(mktemp)
FRONTEND_LOG=$(mktemp)

# --- helpers ---
wait_http_ok() {
  local url=$1
  local timeout=${2:-30}
  local i=0
  while [ $i -lt $timeout ]; do
    if curl -sf "$url" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
    i=$((i + 1))
  done
  return 1
}

# Проверка: 5173 отдаёт HTML (Vite), а не JSON-заглушку
check_frontend_html() {
  local body
  body=$(curl -sf "$E2E_BASE_URL/" 2>/dev/null || echo "")
  if echo "$body" | grep -q "please use Vite dev server"; then
    echo "ERROR: Порт $FRONTEND_PORT занят, но отдаёт JSON-заглушку вместо React-приложения." >&2
    echo "Остановите процесс на порту $FRONTEND_PORT и запустите: cd frontend && npm run dev -- --port $FRONTEND_PORT --strictPort" >&2
    return 1
  fi
  if ! echo "$body" | grep -qE '<!DOCTYPE html>|<html'; then
    return 1
  fi
  return 0
}

fail_with_logs() {
  local msg=$1
  echo "" >&2
  echo "=== E2E FAILED: $msg ===" >&2
  echo "Backend PID: ${BACKEND_PID:-none}, port: $BACKEND_PORT" >&2
  echo "Frontend PID: ${FRONTEND_PID:-none}, port: $FRONTEND_PORT" >&2
  echo "" >&2
  if [ -f "$BACKEND_LOG" ]; then
    echo "--- Backend log (last 50 lines) ---" >&2
    tail -50 "$BACKEND_LOG" >&2
    echo "" >&2
  fi
  if [ -f "$FRONTEND_LOG" ]; then
    echo "--- Frontend log (last 50 lines) ---" >&2
    tail -50 "$FRONTEND_LOG" >&2
  fi
  exit 1
}

cleanup() {
  local exit_code=$?
  echo "Cleaning up..."
  [ -n "$BACKEND_PID" ] && kill $BACKEND_PID 2>/dev/null || true
  [ -n "$FRONTEND_PID" ] && kill $FRONTEND_PID 2>/dev/null || true
  wait 2>/dev/null || true
  rm -f "$BACKEND_LOG" "$FRONTEND_LOG"
  exit $exit_code
}
trap cleanup EXIT

# --- env ---
export DEV_E2E=true
export ZVONOK_MODE=stub
export ROBOKASSA_MODE=stub
export PLUSOFON_MODE=stub
export E2E_BACKEND_URL
export E2E_BASE_URL
export VITE_API_BASE_URL="$E2E_BACKEND_URL"

if [ -n "$E2E_DATABASE_PATH" ]; then
  export DATABASE_URL="sqlite:///${E2E_DATABASE_PATH}"
  echo "Using E2E db: $DATABASE_URL"
fi

echo "=== E2E ports: backend=$BACKEND_PORT frontend=$FRONTEND_PORT ==="

# 1) Backend: если 8000 уже отвечает /health — не стартуем заново
if wait_http_ok "$E2E_BACKEND_URL/health" 2 2>/dev/null; then
  echo "=== Backend already running on $BACKEND_PORT ==="
  BACKEND_PID=""
else
  echo "=== Starting backend on port $BACKEND_PORT ==="
  cd "$ROOT/backend"
  python3 -m uvicorn main:app --host 0.0.0.0 --port $BACKEND_PORT >"$BACKEND_LOG" 2>&1 &
  BACKEND_PID=$!
  echo "Backend PID: $BACKEND_PID"

  echo "=== Waiting for backend ==="
  if ! wait_http_ok "$E2E_BACKEND_URL/health" 30; then
    fail_with_logs "Backend health timeout on $BACKEND_PORT"
  fi
fi
echo "Backend ready"

# 2) Frontend: если 5173 отдаёт HTML (не JSON-заглушку) — не стартуем заново
if check_frontend_html 2>/dev/null; then
  echo "=== Frontend already running on $FRONTEND_PORT (HTML OK) ==="
  FRONTEND_PID=""
else
  if wait_http_ok "$E2E_BASE_URL" 2 2>/dev/null; then
    if ! check_frontend_html 2>/dev/null; then
      echo "ERROR: Порт $FRONTEND_PORT занят, но отдаёт JSON-заглушку вместо Vite." >&2
      echo "Остановите процесс и запустите: cd frontend && npm run dev -- --port $FRONTEND_PORT --strictPort" >&2
      exit 1
    fi
  fi

  echo "=== Starting frontend on port $FRONTEND_PORT ==="
  cd "$ROOT/frontend"
  VITE_API_BASE_URL="$E2E_BACKEND_URL" npx vite --port $FRONTEND_PORT --strictPort >"$FRONTEND_LOG" 2>&1 &
  FRONTEND_PID=$!
  echo "Frontend PID: $FRONTEND_PID"

  echo "=== Waiting for frontend (HTML) ==="
  i=0
  while [ $i -lt 30 ]; do
    if check_frontend_html 2>/dev/null; then
      break
    fi
    sleep 1
    i=$((i + 1))
  done
  if ! check_frontend_html 2>/dev/null; then
    fail_with_logs "Frontend не отдаёт HTML на $FRONTEND_PORT"
  fi
fi
echo "Frontend ready"

# 4) Run E2E: цикл RUNS раз (reset+seed перед каждым прогоном)
cd "$ROOT/frontend"
run=1
while [ "$run" -le "$RUNS" ]; do
  echo ""
  echo "=== E2E run $run / $RUNS: reset+seed ==="
  SEED_RESULT=$(curl -s -X POST "$E2E_BACKEND_URL/api/dev/e2e/seed" \
    -H "Content-Type: application/json" \
    -d '{"reset": true}')
  if ! echo "$SEED_RESULT" | grep -q '"success":true'; then
    fail_with_logs "Seed (run $run) failed: $SEED_RESULT"
  fi
  echo "Seed OK"

  echo "=== E2E run $run / $RUNS: Playwright (baseURL=$E2E_BASE_URL) ==="
  E2E_BASE_URL="$E2E_BASE_URL" E2E_BACKEND_URL="$E2E_BACKEND_URL" npx playwright test --reporter=list \
    || fail_with_logs "Playwright run $run failed"

  run=$((run + 1))
done

echo ""
echo "=== E2E complete ($RUNS run(s)) ==="
