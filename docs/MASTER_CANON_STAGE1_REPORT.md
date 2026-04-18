# MASTER_CANON Stage 1 Report — Bridge + Backfill

**Дата:** 2026-02-16

## Ревизии Alembic

| ID | Файл | Описание |
|----|------|----------|
| 20260216_bridge | 20260216_add_indie_masters_master_id_bridge.py | Добавлена колонка master_id (nullable), индекс |
| 20260216_backfill | 20260216_backfill_indie_masters_master_id.py | Backfill по user_id, создание Master при отсутствии |
| 20260216_constraints | 20260216_add_indie_masters_master_id_constraints.py | NOT NULL, UNIQUE(master_id) |

## SQL / Post-checks

### Pre-checks (до миграций)
См. [MASTER_CANON_PRECHECK_RESULTS.md](./MASTER_CANON_PRECHECK_RESULTS.md)

### Post-checks (после backfill, до constraints)
```sql
SELECT COUNT(*) FROM indie_masters WHERE master_id IS NULL;  -- 0
SELECT master_id, COUNT(*) FROM indie_masters WHERE master_id IS NOT NULL GROUP BY master_id HAVING COUNT(*) > 1;  -- 0 строк
```

### Итоговые counts

| Метрика | Значение |
|---------|----------|
| indie_masters total | 10 |
| indie_masters with master_id | 10 |
| masters created during backfill | 0 |
| violations (NULL) | 0 |
| violations (1:1) | 0 |

## Изменения в коде

- **backend/models.py:** добавлены `IndieMaster.master_id`, `IndieMaster.master` relationship
- **backend/scripts/run_master_canon_prechecks.py:** скрипт pre-checks
- API/сериализация: **не изменялись** (Этап 1)

## Откат

```bash
cd backend && python3 -m alembic downgrade 7b21fbc7e4a0
```

## Проверка

```bash
cd backend
python3 -c "
from sqlalchemy import text
from database import engine
with engine.connect() as conn:
    r = conn.execute(text('SELECT id, user_id, master_id FROM indie_masters LIMIT 3'))
    print(list(r))
"
```
