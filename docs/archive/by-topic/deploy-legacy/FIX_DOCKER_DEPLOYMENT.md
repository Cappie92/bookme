# Исправление Docker деплоя

## Проблема:
1. Docker Compose файл в `/home/root/appointo/` (старая директория)
2. Новый код в `/home/root/dedato/`
3. Контейнер не монтирует код, использует старый запеченный в образе
4. Контейнеры запущены 5 дней назад

## Выполните эти команды для проверки:

```bash
# 1. Проверьте, есть ли docker-compose в /home/root/dedato
echo "=== Docker Compose в /home/root/dedato ==="
find /home/root/dedato -name "docker-compose.yml" -o -name "docker-compose.yaml" 2>/dev/null
echo ""

# 2. Проверьте, какие контейнеры запущены и откуда
echo "=== Информация о контейнерах ==="
docker ps --format "table {{.Names}}\t{{.Image}}\t{{.Status}}"
echo ""

# 3. Проверьте, какой образ используется
echo "=== Образы ==="
docker images | grep -E "dedato|appointo|backend"
echo ""

# 4. Проверьте, откуда был запущен docker-compose
echo "=== Проверка рабочей директории контейнеров ==="
docker inspect dedato_backend_1 | grep -A 5 "WorkingDir"
echo ""

# 5. Проверьте, есть ли .env файлы
echo "=== .env файлы ==="
find /home/root/dedato /home/root/appointo -name ".env" -type f 2>/dev/null
echo ""
```

## План исправления:

### Вариант 1: Обновить docker-compose.yml в appointo
- Изменить пути в docker-compose.yml на `/home/root/dedato`
- Пересобрать контейнеры

### Вариант 2: Создать новый docker-compose.yml в dedato
- Создать docker-compose.yml в `/home/root/dedato`
- Остановить старые контейнеры
- Запустить новые

### Вариант 3: Обновить код в контейнере напрямую (временное решение)
- Скопировать новый код в контейнер
- Перезапустить контейнер

## Рекомендуемый вариант: Вариант 2


