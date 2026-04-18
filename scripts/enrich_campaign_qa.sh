#!/usr/bin/env bash
# One-shot: overlay enrichment + verify для campaigns/contact-preferences QA.
# Baseline reseed — опционально (WITH_RESEED=1), т.к. требует запущенный backend с dev testdata.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

API_BASE="${API_BASE_URL:-http://localhost:8000}"

if [[ "${WITH_RESEED:-0}" == "1" ]]; then
  echo "=== [1/3] Baseline reseed (WITH_RESEED=1) → ${API_BASE} ==="
  echo "    Требуется: backend + ENVIRONMENT=development + ENABLE_DEV_TESTDATA=1 + админ."
  python3 backend/scripts/reseed_local_test_data.py --base-url "$API_BASE"
else
  echo "=== [1/3] Baseline reseed пропущен ==="
  echo "    Ожидается уже выполненный reseed (полный цикл: WITH_RESEED=1 make enrich-campaign-qa)."
fi

echo ""
echo "=== [2/3] Overlay enrichment (DB через backend settings / DATABASE_URL) ==="
python3 backend/scripts/enrich_campaign_test_data.py

echo ""
echo "=== [3/3] Verify-only ==="
python3 backend/scripts/enrich_campaign_test_data.py --verify-only

echo ""
echo "=== Campaign QA one-shot: OK (exit 0) ==="
