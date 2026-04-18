# Анализ Docker контейнеров

## Найдено:
- **Backend контейнер:** `dedato_backend_1` (запущен 5 дней назад)
- **Frontend контейнер:** `dedato_frontend_1` (запущен 5 дней назад)
- **Код находится в:** `/home/root/dedato/backend/`

## Проблема:
Контейнеры запущены 5 дней назад и используют старую версию кода.

## Выполните эти команды:

```bash
# 1. Проверьте docker-compose файл
echo "=== Docker Compose файл ==="
find /home/root -name "docker-compose.yml" -o -name "docker-compose.yaml" 2>/dev/null | head -5
echo ""

# 2. Проверьте, какой код в контейнере
echo "=== Код в контейнере (main.py) ==="
docker exec dedato_backend_1 cat /app/main.py 2>/dev/null | head -30 || echo "Не удалось прочитать"
echo ""

# 3. Проверьте дату последнего изменения файлов в контейнере
echo "=== Дата файлов в контейнере ==="
docker exec dedato_backend_1 ls -la /app/*.py 2>/dev/null | head -10
echo ""

# 4. Проверьте, откуда монтируется код
echo "=== Docker inspect (mounts) ==="
docker inspect dedato_backend_1 | grep -A 10 "Mounts" | head -20
echo ""

# 5. Проверьте git статус в /home/root/dedato
echo "=== Git статус в /home/root/dedato ==="
cd /home/root/dedato && git status 2>/dev/null | head -20 || echo "Git не найден"
echo ""

# 6. Проверьте дату последних изменений в /home/root/dedato
echo "=== Последние изменения в /home/root/dedato ==="
find /home/root/dedato -name "*.py" -type f -mtime -10 2>/dev/null | head -10
echo ""

# 7. Проверьте docker-compose.yml
echo "=== Содержимое docker-compose.yml ==="
find /home/root -name "docker-compose.yml" -o -name "docker-compose.yaml" 2>/dev/null | head -1 | xargs cat 2>/dev/null
echo ""
```

## Или выполните все сразу:

```bash
echo "=== 1. Docker Compose файл ==="
COMPOSE_FILE=$(find /home/root -name "docker-compose.yml" -o -name "docker-compose.yaml" 2>/dev/null | head -1)
echo "Найден: $COMPOSE_FILE"
if [ ! -z "$COMPOSE_FILE" ]; then
    cat "$COMPOSE_FILE"
fi
echo ""

echo "=== 2. Монтирование в контейнере ==="
docker inspect dedato_backend_1 | grep -A 20 "Mounts"
echo ""

echo "=== 3. Код в контейнере (первые 20 строк main.py) ==="
docker exec dedato_backend_1 head -20 /app/main.py 2>/dev/null || echo "Не удалось прочитать"
echo ""

echo "=== 4. Git статус в /home/root/dedato ==="
cd /home/root/dedato && git status 2>/dev/null | head -15 || echo "Git не найден"
echo ""

echo "=== 5. Последние изменения (10 дней) ==="
find /home/root/dedato -name "*.py" -type f -mtime -10 2>/dev/null | head -10
echo ""
```


