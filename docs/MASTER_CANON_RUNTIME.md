# MASTER_CANON Runtime

## Truth table

| Env | Результат |
|-----|------------|
| default (нет env) | master-only |
| `LEGACY_INDIE_MODE=1` | legacy |
| `LEGACY_INDIE_MODE=0` | master-only |
| `MASTER_CANON_MODE=1` (deprecated) | master-only |
| `MASTER_CANON_MODE=0` (deprecated) | legacy |
| оба заданы | **LEGACY_INDIE_MODE побеждает** |

## Флаги

| Переменная | По умолчанию | Описание |
|------------|--------------|----------|
| `LEGACY_INDIE_MODE` | `0` | **Единственный источник истины.** `1`/`true`/`yes` — legacy; `0`/`false`/`no` — master-only |
| `MASTER_CANON_DEBUG` | `0` | `1` — доп. логирование резолва indie→master; orphan → raise вместо skip |
| `MASTER_CANON_MODE` | deprecated | Читается **только если** `LEGACY_INDIE_MODE` не задан. При конфликте — `LEGACY_INDIE_MODE` побеждает |

## Команды запуска

```bash
# Prod (master-only)
cd backend && python3 -m uvicorn main:app --host 127.0.0.1 --port 8000

# Legacy (dev/rollback)
cd backend && LEGACY_INDIE_MODE=1 python3 -m uvicorn main:app --host 127.0.0.1 --port 8000

# Debug (fail-fast)
cd backend && MASTER_CANON_DEBUG=1 python3 -m uvicorn main:app --host 127.0.0.1 --port 8000
```

## Reseed (тестовые данные)

```bash
# Из корня репозитория:
python3 backend/scripts/reseed_local_test_data.py --base-url http://localhost:8000

# Из папки backend/:
cd backend && python3 scripts/reseed_local_test_data.py --base-url http://localhost:8000
```

## Что блокируется в master-only

**Write-path** (создание/изменение):

- indie booking (POST/PUT с `indie_master_id`) → 400
- indie service (POST /dev/testdata/create_indie_service) → 400
- favorite indie_master (POST /favorites с `favorite_type=indie_master`) → 400

**Read-path** (GET) — не блокируется; orphan: log+skip (или raise при `MASTER_CANON_DEBUG=1`).

## Инварианты (master-only)

- **DB**: `bookings.indie_master_id IS NOT NULL` = 0 (verify FAIL если >0)
- **Read-path (GET)**: схема canon — без `indie_master_id`; orphan — log+skip (или raise при DEBUG)
- **Write-path (POST/PUT)**: `indie_master_id` → 400
- **GET /api/client/favorites/indie-masters** — всегда 410 Gone

## 400 по indie_master_id — только write-path

| Endpoint | Метод | master-only |
|----------|-------|-------------|
| `/api/client/bookings/` | POST | 400 при indie_master_id |
| `/api/client/bookings/{id}` | PUT | 400 при установке indie_master_id |
| `/api/bookings/public` | POST | 400 при indie_master_id |
| `/api/client/favorites` | POST | 400 при favorite_type=indie_master |
| `/api/dev/testdata/create_indie_service` | POST | 400 |

Read-path (GET) никогда не возвращает 400 за indie_master_id — только нормальная выдача или log+skip orphan.

## master_timezone (без fallback)

**master_timezone** берётся только из `master.timezone`; fallback (UTC, Europe/Moscow и т.п.) отсутствует. Отсутствие или пустой timezone = ошибка данных / skip записи:
- **Write-path**: мастер без timezone не принимает записи (400).
- **Read-path**: при пустом timezone — `MASTER_CANON_DEBUG=1` → raise/500; `MASTER_CANON_DEBUG=0` → log warning + skip записи из выдачи.
