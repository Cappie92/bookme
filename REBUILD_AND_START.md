# Пересборка и запуск Docker контейнеров

## Выполните эти команды по порядку:

```bash
# 1. Проверьте содержимое Dockerfile'ов
echo "=== Backend Dockerfile ==="
cat /home/root/dedato/backend/Dockerfile
echo ""
echo "=== Frontend Dockerfile ==="
cat /home/root/dedato/frontend/Dockerfile
echo ""

# 2. Проверьте .env файлы (только наличие, не содержимое)
echo "=== Проверка .env файлов ==="
echo "Корневой .env:"
ls -la /home/root/dedato/.env
echo "Backend .env:"
ls -la /home/root/dedato/backend/.env
echo "Frontend .env:"
ls -la /home/root/dedato/frontend/.env
echo ""

# 3. Перейдите в директорию проекта
cd /home/root/dedato

# 4. Остановите старые контейнеры (если есть)
echo "=== Остановка старых контейнеров ==="
docker-compose down 2>/dev/null || echo "Старые контейнеры не найдены"
echo ""

# 5. Удалите старые образы (опционально, для чистой пересборки)
echo "=== Удаление старых образов ==="
docker rmi dedato_backend dedato_frontend 2>/dev/null || echo "Образы не найдены или используются"
echo ""

# 6. Пересоберите контейнеры
echo "=== Пересборка контейнеров ==="
docker-compose build --no-cache
echo ""

# 7. Запустите контейнеры
echo "=== Запуск контейнеров ==="
docker-compose up -d
echo ""

# 8. Проверьте статус контейнеров
echo "=== Статус контейнеров ==="
docker-compose ps
echo ""

# 9. Проверьте логи (первые 20 строк)
echo "=== Логи backend (первые 20 строк) ==="
docker-compose logs backend | tail -20
echo ""
echo "=== Логи frontend (первые 20 строк) ==="
docker-compose logs frontend | tail -20
echo ""

# 10. Примените миграции
echo "=== Применение миграций ==="
docker-compose exec backend python3 -m alembic upgrade head
echo ""
```

## Или выполните все сразу:

```bash
cd /home/root/dedato

echo "=== ОСТАНОВКА СТАРЫХ КОНТЕЙНЕРОВ ==="
docker-compose down 2>/dev/null
echo "✅ Старые контейнеры остановлены"
echo ""

echo "=== ПЕРЕСБОРКА КОНТЕЙНЕРОВ ==="
docker-compose build --no-cache
echo ""

echo "=== ЗАПУСК КОНТЕЙНЕРОВ ==="
docker-compose up -d
echo ""

echo "=== СТАТУС КОНТЕЙНЕРОВ ==="
sleep 5
docker-compose ps
echo ""

echo "=== ЛОГИ BACKEND (последние 30 строк) ==="
docker-compose logs --tail=30 backend
echo ""

echo "=== ПРИМЕНЕНИЕ МИГРАЦИЙ ==="
docker-compose exec backend python3 -m alembic upgrade head
echo ""

echo "=== ПРОВЕРКА РАБОТЫ ==="
curl -s http://localhost:8000/docs | head -5 || echo "Backend не отвечает"
echo ""
```


