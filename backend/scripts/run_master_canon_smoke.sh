#!/bin/bash
# MASTER_CANON smoke checks (manual)
# Требуется: запущенный backend (master-only по умолчанию), токен клиента в TOKEN

set -e
BASE="${API_BASE:-http://localhost:8000}"
TOKEN="${TOKEN:-}"

echo "=== MASTER_CANON Smoke ==="
echo "API_BASE=$BASE"

if [ -z "$TOKEN" ]; then
  echo "⚠️  Set TOKEN (client JWT) to run API smoke. Skipping API checks."
fi

echo ""
echo "--- DB checks ---"
cd "$(dirname "$0")/.."
DB="${DB_PATH:-bookme.db}"
echo "DB=$DB"

indie=$(sqlite3 "$DB" "SELECT COUNT(*) FROM client_favorites WHERE favorite_type='indie_master';")
echo "client_favorites favorite_type=indie_master: $indie (expect 0)"
[ "$indie" = "0" ] || exit 1

dups=$(sqlite3 "$DB" "SELECT COUNT(*) FROM (SELECT client_id, master_id, COUNT(*) as c FROM client_favorites WHERE favorite_type='master' GROUP BY client_id, master_id HAVING c>1);")
echo "duplicates (client_id, master_id): $dups (expect 0)"
[ -z "$dups" ] || [ "$dups" = "0" ] || exit 1

echo ""
echo "--- API smoke (master-only) ---"
if [ -n "$TOKEN" ]; then
  echo "GET /api/client/bookings/"
  curl -s -H "Authorization: Bearer $TOKEN" "$BASE/api/client/bookings/" | python3 -c "
import sys,json
d=json.load(sys.stdin)
for i, b in enumerate(d[:2]):
    print(f'  [{i}] master_id={b.get(\"master_id\")}, indie_master_id={b.get(\"indie_master_id\")}')
" 2>/dev/null || echo "  (no bookings or parse error)"
  echo "GET /api/client/favorites/masters"
  curl -s -H "Authorization: Bearer $TOKEN" "$BASE/api/client/favorites/masters" | head -c 200
  echo ""
  echo "GET /api/client/favorites/indie-masters (expect 410)"
  code=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $TOKEN" "$BASE/api/client/favorites/indie-masters")
  echo "  HTTP $code (expect 410)"
  [ "$code" = "410" ] || echo "  ⚠️ Expected 410"
fi

echo ""
echo "=== Smoke done ==="
