# Очистка старого кода и исправление Docker

## Выполните эти команды по порядку:

```bash
# ============================================
# ШАГ 1: Проверка и анализ
# ============================================
echo "=== 1. Docker Compose в /home/root/dedato ==="
find /home/root/dedato -name "docker-compose.yml" -o -name "docker-compose.yaml" 2>/dev/null
echo ""

echo "=== 2. Информация о контейнерах ==="
docker ps --format "table {{.Names}}\t{{.Image}}\t{{.Status}}"
echo ""

echo "=== 3. Образы Docker ==="
docker images | grep -E "dedato|appointo|backend"
echo ""

echo "=== 4. Рабочая директория контейнера ==="
docker inspect dedato_backend_1 | grep -A 3 "WorkingDir"
echo ""

echo "=== 5. .env файлы ==="
find /home/root/dedato /home/root/appointo -name ".env" -type f 2>/dev/null
echo ""

echo "=== 6. Структура /home/root/dedato ==="
ls -la /home/root/dedato/ | head -20
echo ""

# ============================================
# ШАГ 2: Остановка и удаление старых контейнеров
# ============================================
echo "=== 7. Остановка старых контейнеров ==="
cd /home/root/appointo 2>/dev/null && docker-compose down 2>/dev/null || echo "Не удалось остановить через docker-compose"
docker stop dedato_backend_1 dedato_frontend_1 2>/dev/null || echo "Контейнеры уже остановлены"
echo ""

echo "=== 8. Удаление старых контейнеров ==="
docker rm dedato_backend_1 dedato_frontend_1 2>/dev/null || echo "Контейнеры уже удалены"
echo ""

# ============================================
# ШАГ 3: Удаление старого кода
# ============================================
echo "=== 9. Проверка содержимого /home/root/appointo перед удалением ==="
ls -la /home/root/appointo/ | head -20
echo ""

echo "=== 10. Удаление директории /home/root/appointo ==="
rm -rf /home/root/appointo
echo "Директория /home/root/appointo удалена"
echo ""

echo "=== 11. Проверка что директория удалена ==="
ls -la /home/root/appointo 2>/dev/null || echo "✅ Директория успешно удалена"
echo ""

# ============================================
# ШАГ 4: Проверка оставшихся контейнеров
# ============================================
echo "=== 12. Проверка оставшихся контейнеров ==="
docker ps -a | grep -E "dedato|appointo" || echo "Старые контейнеры удалены"
echo ""

echo "=== 13. Проверка оставшихся образов ==="
docker images | grep -E "dedato|appointo" || echo "Старые образы (можно удалить позже)"
echo ""
```

## Или выполните все сразу одной командой:

```bash
# Полная очистка и проверка
echo "=== ПРОВЕРКА ПЕРЕД ОЧИСТКОЙ ==="
echo "Docker Compose в dedato:"
find /home/root/dedato -name "docker-compose.yml" -o -name "docker-compose.yaml" 2>/dev/null
echo ""
echo "Запущенные контейнеры:"
docker ps --format "table {{.Names}}\t{{.Image}}\t{{.Status}}"
echo ""
echo "=== ОСТАНОВКА И УДАЛЕНИЕ КОНТЕЙНЕРОВ ==="
cd /home/root/appointo 2>/dev/null && docker-compose down 2>/dev/null
docker stop dedato_backend_1 dedato_frontend_1 2>/dev/null
docker rm dedato_backend_1 dedato_frontend_1 2>/dev/null
echo "✅ Контейнеры остановлены и удалены"
echo ""
echo "=== УДАЛЕНИЕ СТАРОГО КОДА ==="
echo "Содержимое /home/root/appointo перед удалением:"
ls -la /home/root/appointo/ 2>/dev/null | head -10
echo ""
rm -rf /home/root/appointo
echo "✅ Директория /home/root/appointo удалена"
echo ""
echo "=== ПРОВЕРКА ==="
ls -la /home/root/appointo 2>/dev/null || echo "✅ Директория успешно удалена"
docker ps -a | grep -E "dedato|appointo" || echo "✅ Старые контейнеры удалены"
echo ""
echo "=== ГОТОВО ==="
```


