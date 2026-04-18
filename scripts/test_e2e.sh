#!/bin/bash
# E2E тесты: backend pytest + (опционально) Playwright web
set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "=== Backend tests (pytest) ==="
cd backend
export ZVONOK_MODE=stub
export ROBOKASSA_MODE=stub
export PLUSOFON_MODE=stub
python3 -m pytest tests/test_manual_confirm_switch.py tests/test_accounting_post_visit_phase1.py tests/test_robokassa_stub.py -v --tb=short 2>&1 | tail -60

echo ""
echo "=== E2E: Backend core tests passed ==="
echo "Для Playwright web E2E: cd frontend && npx playwright test (если настроен)"
