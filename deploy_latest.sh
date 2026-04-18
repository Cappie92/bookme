#!/bin/bash

# Скрипт для полного деплоя последней версии на сервер
# Использование: ./deploy_latest.sh

set -e

SERVER_USER="root"
SERVER_HOST="193.160.208.206"
SERVER_PATH="/home/root/dedato"

echo "🚀 Начинаем полный деплой последней версии..."

# Цвета для вывода
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Проверка, что мы в корне проекта
if [ ! -f "docker-compose.yml" ]; then
    print_error "Запустите скрипт из корневой директории проекта"
    exit 1
fi

print_status "ШАГ 1: Остановка и очистка контейнеров на сервере..."
ssh ${SERVER_USER}@${SERVER_HOST} << 'EOF'
cd /home/root/dedato
echo "Останавливаем контейнеры..."
docker-compose down -v 2>/dev/null || true
echo "Удаляем старые образы..."
docker rmi dedato_frontend dedato_backend 2>/dev/null || true
docker system prune -f
echo "✅ Очистка завершена"
EOF

print_status "ШАГ 2: Копирование всех файлов на сервер..."
rsync -avz --progress \
    --exclude='node_modules' \
    --exclude='.git' \
    --exclude='logs' \
    --exclude='__pycache__' \
    --exclude='*.pyc' \
    --exclude='.env' \
    --exclude='bookme.db' \
    --exclude='bookme.db.backup_*' \
    ./ ${SERVER_USER}@${SERVER_HOST}:${SERVER_PATH}/

print_status "ШАГ 3: Пересборка и запуск контейнеров на сервере..."
ssh ${SERVER_USER}@${SERVER_HOST} << 'EOF'
cd /home/root/dedato
echo "Пересобираем контейнеры..."
docker-compose build --no-cache
echo "Запускаем контейнеры..."
docker-compose up -d
echo "✅ Контейнеры запущены"
EOF

print_status "ШАГ 4: Проверка статуса..."
ssh ${SERVER_USER}@${SERVER_HOST} << 'EOF'
cd /home/root/dedato
echo "=== Статус контейнеров ==="
docker-compose ps
echo ""
echo "=== Логи backend (последние 5 строк) ==="
docker-compose logs --tail=5 backend
echo ""
echo "=== Логи frontend (последние 5 строк) ==="
docker-compose logs --tail=5 frontend
EOF

print_status "✅ Деплой завершен!"
print_status "Проверьте сайт: https://dedato.ru/"

