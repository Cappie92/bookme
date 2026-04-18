# MASTER_ONLY MVP Checklist

## Regression checks (must stay green)

```bash
make verify-master-canon
make test-master-canon
```

Или из backend/: `python3 scripts/verify_master_canon.py`, `python3 -m pytest tests/test_master_canon_flags.py tests/test_booking_factory.py -v`.

**Ожидаемые результаты verify:**
- `bookings master_id NULL: 0`
- `bookings indie_master_id NOT NULL: 0` (master-only)
- `client_favorites favorite_type=indie_master: 0`
- API (если TOKEN): GET /bookings/, /past — без `indie_master_id`; GET /favorites/indie-masters → 410

---

## Команды

### 1. Backend (без env — master-only по умолчанию)

```bash
cd backend && python3 -m uvicorn main:app --host 127.0.0.1 --port 8000
```

### 2. Reseed

```bash
# Из корня репозитория:
python3 backend/scripts/reseed_local_test_data.py --base-url http://localhost:8000

# Из папки backend/:
cd backend && python3 scripts/reseed_local_test_data.py --base-url http://localhost:8000
```

Reseed создаёт только master_id bookings (indie не используется в дефолтном режиме).

### 3. Verify (DB)

```bash
cd backend && python3 scripts/verify_master_canon.py
```

Или из корня: `python3 backend/scripts/verify_master_canon.py`

### 4. Verify (DB + API)

```bash
TOKEN=$(curl -s -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"phone":"+79990000101","password":"test123"}' | python3 -c "import sys,json; print(json.load(sys.stdin).get('access_token',''))")
cd backend && TOKEN=$TOKEN python3 scripts/verify_master_canon.py
```

### 5. Pytest (master-only + timezone)

```bash
cd backend && python3 -m pytest tests/test_master_canon_flags.py tests/test_booking_factory.py tests/test_calendar_ics.py -v
```

### 6. Скачать ICS для ручного теста календаря

```bash
# Получить TOKEN (клиент +79990000101)
TOKEN=$(curl -s -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"phone":"+79990000101","password":"test123"}' | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d.get("access_token",""))')

# Получить booking_id (устойчиво к list и dict+items)
BOOKING_ID=$(curl -s -H "Authorization: Bearer $TOKEN" http://localhost:8000/api/client/bookings/ \
  | python3 -c 'import json,sys; d=json.load(sys.stdin); items=d.get("items",[]) if isinstance(d,dict) else (d if isinstance(d,list) else []); print(items[0]["id"] if items else "")')

# Скачать ICS
curl -L -o booking.ics -H "Authorization: Bearer $TOKEN" \
  "http://localhost:8000/api/client/bookings/${BOOKING_ID}/calendar.ics?alarm_minutes=60"

# Открыть (macOS)
open booking.ics
```

- `open booking.ics` откроет Calendar (macOS)
- Проверить, что время в таймзоне мастера (TZID в ICS)
- Если не открылось — импортировать в календарь вручную (двойной клик по файлу)

### 7. Manual smoke

- Клиент +79990000101, пароль test123: логин, /api/client/bookings/past > 0.
- Мастер +79990000000: логин, дашборд, расписание.

## Legacy (если нужен откат)

```bash
cd backend && LEGACY_INDIE_MODE=1 python3 -m uvicorn main:app --host 127.0.0.1 --port 8000
```

В legacy режиме verify допускает indie bookings в БД.
