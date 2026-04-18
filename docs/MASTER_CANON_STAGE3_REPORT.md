# MASTER_CANON Stage 3 Report — Favorites migration + dedup

**Дата:** 2026-02-16

## Alembic миграция

| Ревизия | Файл | Описание |
|---------|------|----------|
| 20260216_fav_migrate | 20260216_migrate_favorites_indie_to_master.py | indie_master → master, дедуп |

### Алгоритм

1. Удалить `client_favorites` с `favorite_type='indie_master'`, где уже есть master-favorite на того же `master_id` (дубли)
2. Обновить оставшиеся: `favorite_type='master'`, `master_id=indie_masters.master_id`, `indie_master_id=NULL`
3. Post-check: `favorite_type='indie_master'` = 0

### Результаты (bookme.db)

| Метрика | Значение |
|---------|----------|
| indie_master до миграции | (зависит от данных) |
| indie_master после | 0 |
| Дубли (client_id, master_id) | 0 |

## API favorites (MASTER_CANON_MODE)

### GET /api/client/favorites/masters

Без изменений. Возвращает master favorites.

### GET /api/client/favorites/indie-masters

| Режим | Поведение |
|-------|-----------|
| MASTER_CANON_MODE=0 | Как было (для старых клиентов) |
| MASTER_CANON_MODE=1 | **410 Gone** — "Use /favorites/masters. Indie-masters merged into masters." |

### POST /api/client/favorites

| Режим | Поведение |
|-------|-----------|
| MASTER_CANON_MODE=0 | Старое (salon, master, indie_master, service) |
| MASTER_CANON_MODE=1 | Только `favorite_type='master'` + `master_id`. Иначе **400** |

### DELETE /api/client/favorites/{favorite_type}/{item_id}

| Режим | Поведение |
|-------|-----------|
| MASTER_CANON_MODE=0 | Все типы |
| MASTER_CANON_MODE=1 | `indie_master` / `indie-masters` → **410 Gone** |

## DB checks (обязательные)

```sql
SELECT COUNT(*) FROM client_favorites WHERE favorite_type='indie_master';  -- 0
SELECT client_id, master_id, COUNT(*) FROM client_favorites WHERE favorite_type='master' GROUP BY client_id, master_id HAVING COUNT(*)>1;  -- 0 строк
```

## Команды проверки

```bash
cd backend
python3 -m alembic upgrade head
sqlite3 bookme.db "SELECT COUNT(*) FROM client_favorites WHERE favorite_type='indie_master';"
sqlite3 bookme.db "SELECT client_id, master_id, COUNT(*) FROM client_favorites WHERE favorite_type='master' GROUP BY client_id, master_id HAVING COUNT(*)>1;"
```
