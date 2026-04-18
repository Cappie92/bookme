# MASTER_CANON Cleanup Report

## Изменённые файлы

| Файл | Изменения |
|------|-----------|
| `backend/.env.example` | Добавлены MASTER_CANON_MODE=1, MASTER_CANON_DEBUG=0 |
| `docs/MASTER_CANON_RUNTIME.md` | Описание флагов и рекомендуемого запуска |
| `backend/schemas.py` | Добавлены BookingFutureShortCanon, BookingPastShortCanon (без indie_master_id) |
| `backend/routers/client.py` | response_model=Canon при MODE=1; try/except resolve_master; skip при master_id=None; логирование |
| `backend/scripts/reseed_local_test_data.py` | Явный вывод mode, completed count, summary |
| `backend/scripts/verify_master_canon.py` | **Новый** — проверка DB инвариантов + опционально API |
| `docs/MASTER_CANON_FINAL_CHECKLIST.md` | **Новый** — Done when + команды |

## Финальное состояние

- **Client bookings API:** при MASTER_CANON_MODE=1 поле `indie_master_id` отсутствует в ответе (схемы Canon).
- **Битая запись (нельзя резолвить master_id):** DEBUG=1 → raise; DEBUG=0 → log warning + skip.
- **Favorites:** GET /favorites/indie-masters → 410; POST/DELETE indie_* → 400/410.
- **Reseed:** master-only по умолчанию, `--legacy-indie-bookings` для legacy.
- **Verify:** `verify_master_canon.py` проверяет DB и опционально API.

## Команды проверки

**Важно:** API verify предполагает `MASTER_CANON_MODE=1`.

```bash
# 1. Backend с MASTER_CANON_MODE=1
export MASTER_CANON_MODE=1
cd backend && python3 -m uvicorn main:app --host 127.0.0.1 --port 8000

# 2. Reseed
python3 backend/scripts/reseed_local_test_data.py --base-url http://localhost:8000

# 3. Verify DB
python3 backend/scripts/verify_master_canon.py

# 4. Verify API (с токеном клиента)
TOKEN=$(curl -s -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"phone":"+79990000101","password":"test123"}' | python3 -c "import sys,json; print(json.load(sys.stdin).get('access_token',''))")
TOKEN=$TOKEN python3 backend/scripts/verify_master_canon.py

# 5. Проверка отсутствия indie_master_id в ответе
curl -s -H "Authorization: Bearer $TOKEN" "http://localhost:8000/api/client/bookings/past" | python3 -c "
import sys, json
d = json.load(sys.stdin)
for b in d[:1]:
    assert 'indie_master_id' not in b
print('OK')
"
```

## Ограничения

- IndieMaster таблица/модели не удалены (отдельный рефактор позже).
- При MASTER_CANON_MODE=0 legacy-поведение сохранено (для отката).
