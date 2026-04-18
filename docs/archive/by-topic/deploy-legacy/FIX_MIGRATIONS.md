# Исправление проблемы с миграциями

## Проблема:
Множественные head ревизии в Alembic - нужно проверить и исправить.

## Выполните эти команды:

```bash
cd /home/root/dedato

# 1. Проверьте текущее состояние миграций
echo "=== Текущее состояние миграций ==="
docker-compose exec backend python3 -m alembic current
echo ""

# 2. Проверьте все head ревизии
echo "=== Все head ревизии ==="
docker-compose exec backend python3 -m alembic heads
echo ""

# 3. Проверьте историю миграций
echo "=== История миграций ==="
docker-compose exec backend python3 -m alembic history | head -30
echo ""

# 4. Проверьте последнюю миграцию
echo "=== Последние миграции ==="
docker-compose exec backend python3 -m alembic history | grep -E "head|->" | head -10
echo ""
```

## После проверки:

Если есть множественные head, нужно:
1. Найти последнюю правильную миграцию
2. Создать merge миграцию или обновить down_revision в проблемных миграциях
3. Применить миграции


