# MASTER_CANON Stage 2 Report — Backend read-resolve

**Дата:** 2026-02-16

## Изменения в API

### Feature flags (ENV)

| Переменная | По умолчанию | Описание |
|-----------|--------------|----------|
| `MASTER_CANON_MODE` | 0 | 1 = каноничный режим (master-only в API) |
| `MASTER_CANON_DEBUG` | 0 | 1 = диагностические логи (with_indie, resolved, failed) |

### Client bookings API

**GET /api/client/bookings/** (future) и **GET /api/client/bookings/past** (past):

| Режим | Поведение |
|-------|-----------|
| `MASTER_CANON_MODE=0` | Без изменений: `master_id`, `indie_master_id` в ответе |
| `MASTER_CANON_MODE=1` | Только `master_id`, `master_name`. `indie_master_id` не отдаётся (null). Резолв через `indie_masters.master_id` |

### Резолв

- Утилита: `backend/utils/master_canon.py` → `resolve_master_for_booking(booking)`
- Источник: только `indie_masters.master_id` (никаких матчей по имени)
- При `indie_master` без `master_id`: `ValueError` (остановка, remediation)

### Диагностика (MASTER_CANON_DEBUG=1)

Логи при обработке bookings:
- `with_indie` — сколько bookings с `indie_master_id`
- `resolved` — сколько успешно резолвнулось в `master_id`
- `failed` — должно быть 0

## Изменённые файлы

| Файл | Изменения |
|------|-----------|
| `backend/utils/master_canon.py` | Новый: флаги, `resolve_master_for_booking()` |
| `backend/routers/client.py` | Импорт, логика в `get_future_bookings`, `get_past_bookings` |

## Проверка

```bash
# MASTER_CANON_MODE=0 (по умолчанию)
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:8000/api/client/bookings/ | jq '.[0] | {master_id, indie_master_id}'

# MASTER_CANON_MODE=1
MASTER_CANON_MODE=1 curl -s -H "Authorization: Bearer $TOKEN" http://localhost:8000/api/client/bookings/ | jq '.[0] | {master_id, indie_master_id}'
# indie_master_id должен быть null
```
