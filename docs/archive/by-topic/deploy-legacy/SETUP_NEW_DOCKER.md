# Настройка Docker с новым кодом

## Выполните эти команды:

```bash
# 1. Проверьте docker-compose.yml
echo "=== Docker Compose конфигурация ==="
cat /home/root/dedato/docker-compose.yml
echo ""

# 2. Проверьте структуру backend
echo "=== Структура backend ==="
ls -la /home/root/dedato/backend/ | head -20
echo ""

# 3. Проверьте наличие Dockerfile в backend
echo "=== Dockerfile в backend ==="
ls -la /home/root/dedato/backend/Dockerfile 2>/dev/null || echo "Dockerfile не найден"
echo ""

# 4. Проверьте структуру frontend
echo "=== Структура frontend ==="
ls -la /home/root/dedato/frontend/ | head -20
echo ""

# 5. Проверьте наличие Dockerfile в frontend
echo "=== Dockerfile в frontend ==="
ls -la /home/root/dedato/frontend/Dockerfile 2>/dev/null || echo "Dockerfile не найден"
echo ""

# 6. Проверьте .env файлы
echo "=== .env файлы ==="
find /home/root/dedato -name ".env" -type f 2>/dev/null
echo ""
```

## После проверки:

1. Если docker-compose.yml правильный - пересоберите и запустите контейнеры
2. Примените миграции
3. Проверьте работу


