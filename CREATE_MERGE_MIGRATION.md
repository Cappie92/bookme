# Создание merge миграции

## Проблема:
Два head ревизии:
- `add_display_fields` (head)
- `62bed6fe1c6d` (head)

## Решение:
Создать merge миграцию, которая объединит эти два head.

## Выполните эти команды:

```bash
cd /home/root/dedato

# 1. Создайте merge миграцию
echo "=== Создание merge миграции ==="
docker-compose exec backend python3 -m alembic merge -m "merge_heads" add_display_fields 62bed6fe1c6d
echo ""

# 2. Проверьте, что merge миграция создана
echo "=== Проверка созданной миграции ==="
docker-compose exec backend ls -la /app/alembic/versions/ | grep merge
echo ""

# 3. Примените миграции
echo "=== Применение миграций ==="
docker-compose exec backend python3 -m alembic upgrade head
echo ""

# 4. Проверьте текущее состояние
echo "=== Текущее состояние ==="
docker-compose exec backend python3 -m alembic current
echo ""

# 5. Проверьте head ревизии (должна быть одна)
echo "=== Head ревизии (должна быть одна) ==="
docker-compose exec backend python3 -m alembic heads
echo ""
```


