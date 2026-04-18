#!/bin/bash

# Скрипт деплоя системы лояльности на продакшн
# Использование: ./deploy_loyalty.sh

set -e

SERVER_USER="root"
SERVER_HOST="193.160.208.206"
SERVER_PATH="/home/root/dedato"

# Цвета для вывода
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Проверка, что мы в корневой директории
if [ ! -f "docker-compose.prod.yml" ]; then
    print_error "Запустите скрипт из корневой директории проекта"
    exit 1
fi

print_status "Начинаем деплой системы лояльности..."

# Шаг 1: Создание бэкапа
print_status "Шаг 1: Создание бэкапа базы данных..."
mkdir -p backups
BACKUP_FILE="backups/bookme_backup_$(date +%Y%m%d_%H%M%S).db"
ssh $SERVER_USER@$SERVER_HOST "cd $SERVER_PATH && docker-compose -f docker-compose.prod.yml exec -T backend cp /app/bookme.db /tmp/bookme_backup.db"
scp $SERVER_USER@$SERVER_HOST:/tmp/bookme_backup.db $BACKUP_FILE
print_status "Бэкап сохранен: $BACKUP_FILE"

# Шаг 2: Копирование backend файлов
print_status "Шаг 2: Копирование backend файлов..."
scp backend/routers/master_loyalty.py $SERVER_USER@$SERVER_HOST:$SERVER_PATH/backend/routers/
scp backend/routers/client_loyalty.py $SERVER_USER@$SERVER_HOST:$SERVER_PATH/backend/routers/
scp backend/utils/loyalty.py $SERVER_USER@$SERVER_HOST:$SERVER_PATH/backend/utils/
scp backend/models.py $SERVER_USER@$SERVER_HOST:$SERVER_PATH/backend/
scp backend/schemas.py $SERVER_USER@$SERVER_HOST:$SERVER_PATH/backend/
scp backend/main.py $SERVER_USER@$SERVER_HOST:$SERVER_PATH/backend/
scp backend/routers/client.py $SERVER_USER@$SERVER_HOST:$SERVER_PATH/backend/routers/
scp backend/routers/accounting.py $SERVER_USER@$SERVER_HOST:$SERVER_PATH/backend/routers/

# Шаг 3: Копирование миграции
print_status "Шаг 3: Копирование миграции..."
scp backend/alembic/versions/add_loyalty_points_system.py $SERVER_USER@$SERVER_HOST:$SERVER_PATH/backend/alembic/versions/

# Шаг 4: Копирование frontend файлов
print_status "Шаг 4: Копирование frontend файлов..."
scp frontend/src/components/MasterLoyalty.jsx $SERVER_USER@$SERVER_HOST:$SERVER_PATH/frontend/src/components/
scp frontend/src/components/MasterLoyaltyHistory.jsx $SERVER_USER@$SERVER_HOST:$SERVER_PATH/frontend/src/components/
scp frontend/src/components/MasterLoyaltyStats.jsx $SERVER_USER@$SERVER_HOST:$SERVER_PATH/frontend/src/components/
scp frontend/src/components/ClientLoyaltyPoints.jsx $SERVER_USER@$SERVER_HOST:$SERVER_PATH/frontend/src/components/
scp frontend/src/components/MasterAccounting.jsx $SERVER_USER@$SERVER_HOST:$SERVER_PATH/frontend/src/components/
scp frontend/src/components/Tooltip.jsx $SERVER_USER@$SERVER_HOST:$SERVER_PATH/frontend/src/components/
scp frontend/src/pages/MasterDashboard.jsx $SERVER_USER@$SERVER_HOST:$SERVER_PATH/frontend/src/pages/
scp frontend/src/pages/ClientDashboard.jsx $SERVER_USER@$SERVER_HOST:$SERVER_PATH/frontend/src/pages/
scp frontend/src/pages/ClientFavorite.jsx $SERVER_USER@$SERVER_HOST:$SERVER_PATH/frontend/src/pages/
scp frontend/src/components/booking/MasterBookingModule.jsx $SERVER_USER@$SERVER_HOST:$SERVER_PATH/frontend/src/components/booking/

# Шаг 5: Применение миграции
print_status "Шаг 5: Применение миграции на сервере..."
ssh $SERVER_USER@$SERVER_HOST "cd $SERVER_PATH && \
    docker-compose -f docker-compose.prod.yml run --rm backend alembic upgrade head"

# Шаг 6: Проверка миграции
print_status "Шаг 6: Проверка применения миграции..."
CURRENT_VERSION=$(ssh $SERVER_USER@$SERVER_HOST "cd $SERVER_PATH && docker-compose -f docker-compose.prod.yml run --rm backend alembic current" | grep "add_loyalty_points_system" || echo "")
if [ -z "$CURRENT_VERSION" ]; then
    print_error "Миграция не применена корректно!"
    exit 1
fi
print_status "Миграция применена успешно"

# Шаг 7: Пересборка и перезапуск
print_status "Шаг 7: Пересборка и перезапуск контейнеров..."
ssh $SERVER_USER@$SERVER_HOST "cd $SERVER_PATH && \
    docker-compose -f docker-compose.prod.yml down && \
    docker-compose -f docker-compose.prod.yml build --no-cache && \
    docker-compose -f docker-compose.prod.yml up -d"

# Шаг 8: Ожидание запуска
print_status "Шаг 8: Ожидание запуска сервисов..."
sleep 10

# Шаг 9: Проверка статуса
print_status "Шаг 9: Проверка статуса контейнеров..."
ssh $SERVER_USER@$SERVER_HOST "cd $SERVER_PATH && docker-compose -f docker-compose.prod.yml ps"

# Шаг 10: Проверка логов
print_status "Шаг 10: Проверка логов backend (последние 30 строк)..."
ssh $SERVER_USER@$SERVER_HOST "cd $SERVER_PATH && docker-compose -f docker-compose.prod.yml logs --tail=30 backend"

print_status "Деплой завершен!"
print_status "Бэкап сохранен в: $BACKUP_FILE"
print_warning "Не забудьте протестировать функциональность системы лояльности!"
print_status "Используйте LOYALTY_DEPLOYMENT_CHECKLIST.md для проверки всех функций"

