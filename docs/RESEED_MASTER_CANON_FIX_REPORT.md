# Reseed MASTER_CANON Fix — отчёт

## Root cause (ensure_indie_master 500)

**500 на POST /api/dev/testdata/ensure_indie_master** возникал из‑за того, что при создании `IndieMaster` не задавался `master_id`. После MASTER_CANON Stage 1 поле `indie_masters.master_id` стало NOT NULL и UNIQUE, поэтому INSERT падал с нарушением constraint.

## Root cause (create_completed_bookings 422)

**422 на POST /api/dev/testdata/create_completed_bookings** возникал из‑за того, что в payload передавался `is_indie: []` (пустой список) вместо `is_indie: false`. Pydantic ожидает `bool`, а выражение `indie_svc_ids and (ci % 10) < 7` при пустом `indie_svc_ids` возвращает `[]` (короткое замыкание `and`). Аналогично `indie_svcs and mi % 2 == 0` при пустом `indie_svcs`.

**Исправление:** обернуть в `bool()`: `use_indie = bool(indie_svc_ids) and (ci % 10) < 7`, `use_indie = bool(indie_svcs) and mi % 2 == 0`.

## Изменённые файлы

| Файл | Изменения |
|------|-----------|
| `backend/routers/dev_testdata.py` | `ensure_indie_master`: поиск по `master_id`/`user_id`, при создании задаётся `master_id=master.id`, в ответ добавлен `master_id` |
| `backend/scripts/reseed_local_test_data.py` | Флаг `--legacy-indie-bookings`, master-only по умолчанию; **fix is_indie:** `bool(indie_svc_ids)` / `bool(indie_svcs)` чтобы не передавать `[]`; логирование 422 response.text; post-reseed check `completed > 0` |

## Затронутые эндпоинты

- **POST /api/dev/testdata/ensure_indie_master** — исправлен, возвращает `master_id` и `indie_master_id`

## Команды запуска

### 1. Старт backend

```bash
cd backend
python3 -m uvicorn main:app --host 127.0.0.1 --port 8000
```

### 2. Запуск reseed (master-only, по умолчанию)

```bash
python3 backend/scripts/reseed_local_test_data.py --base-url http://localhost:8000
```

### 3. Reseed с legacy indie-бронями

```bash
python3 backend/scripts/reseed_local_test_data.py --base-url http://localhost:8000 --legacy-indie-bookings
```

### 4. Проверки (SQLite)

```bash
cd backend
sqlite3 bookme.db "
SELECT 'bookings both_null' as check_name, COUNT(*) as cnt FROM bookings WHERE master_id IS NULL AND indie_master_id IS NULL
UNION ALL
SELECT 'bookings master_null', COUNT(*) FROM bookings WHERE master_id IS NULL
UNION ALL
SELECT 'client_favorites indie_master', COUNT(*) FROM client_favorites WHERE favorite_type='indie_master'
UNION ALL
SELECT 'indie_masters master_id NULL', COUNT(*) FROM indie_masters WHERE master_id IS NULL;
"
```

### 5. curl-проверка ensure_indie_master

```bash
# Логин admin
TOKEN=$(curl -s -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"phone":"+79031078685","password":"test123"}' | jq -r '.access_token')

# ensure_indie_master (требует master_id)
curl -s -X POST "http://localhost:8000/api/dev/testdata/ensure_indie_master" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"master_id":1}' | jq .
# Ожидается: {"success":true,"indie_master_id":N,"master_id":1,"created":true|false}
```

## Post-reseed checks (автоматические)

После reseed скрипт выполняет SQL и выводит summary:

1. **bookings both_null** = 0
2. **master-only**: master_id NULL = 0
3. **client_favorites** favorite_type='indie_master' = 0
4. **indie_masters** master_id NULL = 0, UNIQUE(master_id) violations = 0
5. **bookings status=completed** > 0 (иначе FAIL — create_completed_bookings не сработал)

## Проверка completed/past

После reseed:

```bash
# Логин клиента +79990000101
TOKEN=$(curl -s -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"phone":"+79990000101","password":"test123"}' | jq -r '.access_token')

# Прошлые брони
curl -s -H "Authorization: Bearer $TOKEN" "http://localhost:8000/api/client/bookings/past" | jq 'length, .[0:2]'
```

**Ожидаемый результат:** `length` > 0 (например 4), sample ids: [105, 106, 107, 108]. Все записи с `status: "completed"`, `master_id` задан, `indie_master_id: null`.
