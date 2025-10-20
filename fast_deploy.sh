#!/bin/bash

echo "🚀 БЫСТРЫЙ АРХИВНЫЙ ДЕПЛОЙ"
echo "=========================="

# Цвета
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log() { echo -e "${GREEN}[INFO]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Шаг 1: Создание архива
log "Создаем архив проекта..."
tar -czf deploy.tar.gz \
    --exclude='node_modules' \
    --exclude='.git' \
    --exclude='*.log' \
    --exclude='.DS_Store' \
    --exclude='bookme.db' \
    --exclude='deploy.tar.gz' \
    .

# Шаг 2: Копирование архива на сервер
log "Копируем архив на сервер..."
scp deploy.tar.gz root@193.160.208.206:/home/root/

# Шаг 3: Распаковка на сервере
log "Распаковываем архив на сервере..."
ssh root@193.160.208.206 "
    cd /home/root &&
    rm -rf dedato_old &&
    mv dedato dedato_old 2>/dev/null || true &&
    mkdir -p dedato &&
    cd dedato &&
    tar -xzf ../deploy.tar.gz &&
    rm ../deploy.tar.gz
"

# Шаг 4: Запуск контейнеров
log "Запускаем контейнеры..."
ssh root@193.160.208.206 "
    cd /home/root/dedato &&
    docker-compose -f docker-compose.prod.yml down 2>/dev/null || true &&
    docker-compose -f docker-compose.prod.yml up -d --build
"

# Шаг 5: Ожидание и проверка
log "Ждем запуска сервисов..."
sleep 30

# Проверка API
if curl -s --connect-timeout 10 http://193.160.208.206:8000/health; then
    log "✅ API работает"
else
    warn "⚠️ API не отвечает"
fi

# Проверка фронтенда
if curl -s --connect-timeout 10 -I http://193.160.208.206:5173 | grep -q "200 OK"; then
    log "✅ Фронтенд работает"
else
    warn "⚠️ Фронтенд не отвечает"
fi

# Очистка
rm -f deploy.tar.gz

echo ""
echo "🎉 ДЕПЛОЙ ЗАВЕРШЕН!"
echo "=================="
echo "Сайт: http://193.160.208.206:5173"
echo "API: http://193.160.208.206:8000"

