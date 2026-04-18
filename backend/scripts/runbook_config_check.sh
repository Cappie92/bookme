#!/usr/bin/env bash
# Runbook: проверка конфигурации backend (env/settings).
# Запуск: из корня репо — ./backend/scripts/runbook_config_check.sh
#         или из backend/ — ./scripts/runbook_config_check.sh
# См. docs/CONFIG_AUDIT.md и docs/CONFIG_CLEANUP_PLAN.md (раздел Runbook).

set -e
REPO_ROOT=""
if [ -f "backend/settings.py" ]; then
  REPO_ROOT="."
elif [ -f "settings.py" ]; then
  REPO_ROOT=".."
else
  echo "Запустите скрипт из корня репозитория или из backend/"
  exit 1
fi

BACKEND_ABS=$(cd "$REPO_ROOT/backend" 2>/dev/null && pwd)
PYRUN="python3"
FAIL=0

# Запуск Python без подхвата .env: cwd=/tmp, PYTHONPATH=backend
run_isolated() {
  (cd /tmp && env "$@" PYTHONPATH="$BACKEND_ABS" "$PYRUN" -c "from settings import get_settings; get_settings()")
}

echo "=== Runbook: проверка конфигурации ==="

# 3. Prod: дефолтный JWT — должен падать с ValidationError
echo -n "3. Prod + дефолтный JWT → ValidationError ... "
if run_isolated ENVIRONMENT=production JWT_SECRET_KEY=your-secret-key-here-change-in-production 2>/dev/null; then
  echo "FAIL (ожидалась ошибка валидации JWT)"
  FAIL=1
else
  echo "PASS"
fi

# 4. Prod: ROBOKASSA_MODE=test без секретов — должен падать
echo -n "4. Prod + ROBOKASSA_MODE=test без секретов → ValidationError ... "
if run_isolated ENVIRONMENT=production JWT_SECRET_KEY=strong-secret ROBOKASSA_MODE=test 2>/dev/null; then
  echo "FAIL (ожидалась ошибка: недостающие Robokassa-секреты)"
  FAIL=1
else
  echo "PASS"
fi

# 5. Dev + stub — должен загружаться
echo -n "5. Dev + ROBOKASSA_MODE=stub → settings загружаются ... "
if (cd /tmp && env ENVIRONMENT=development ROBOKASSA_MODE=stub PYTHONPATH="$BACKEND_ABS" "$PYRUN" -c "
from settings import get_settings
s = get_settings()
assert s.robokassa_stub
" 2>/dev/null); then
  echo "PASS"
else
  echo "FAIL"
  FAIL=1
fi

echo ""
if [ $FAIL -eq 0 ]; then
  echo "Все проверки пройдены (3 PASS)."
  echo "Ручные шаги: 1) cd backend && python3 -m uvicorn main:app --reload --host 0.0.0.0 --port 8000"
  echo "             2) curl -i http://localhost:8000/health → HTTP 200 и тело {\"status\":\"healthy\",\"service\":\"DeDato API\"}"
  exit 0
else
  echo "Одна или более проверок не прошли (FAIL). См. docs/CONFIG_AUDIT.md (раздел 5 Runbook)."
  exit 1
fi
