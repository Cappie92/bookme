#!/bin/bash

# Скрипт для деплоя изменений системы ограничений клиентов
# Запускать из корневой директории проекта
# 
# Использование:
#   ./deploy_restrictions_changes.sh
#   или с паролем: SSHPASS=your_password ./deploy_restrictions_changes.sh

set -e

SERVER_USER="root"
SERVER_HOST="193.160.208.206"
SERVER_PATH="/home/root/dedato"

# Определяем команды SSH/SCP с учетом sshpass
if [ -n "$SSHPASS" ]; then
    SSH_CMD="sshpass -e ssh -o StrictHostKeyChecking=no"
    SCP_CMD="sshpass -e scp -o StrictHostKeyChecking=no"
    export SSHPASS
elif command -v sshpass >/dev/null 2>&1; then
    echo "Для использования sshpass установите переменную окружения SSHPASS"
    echo "Например: SSHPASS=your_password ./deploy_restrictions_changes.sh"
    SSH_CMD="ssh -o StrictHostKeyChecking=no"
    SCP_CMD="scp -o StrictHostKeyChecking=no"
else
    SSH_CMD="ssh -o StrictHostKeyChecking=no"
    SCP_CMD="scp -o StrictHostKeyChecking=no"
fi

# Цвета для вывода
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
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

print_step() {
    echo -e "\n${BLUE}════════════════════════════════════════${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}════════════════════════════════════════${NC}\n"
}

print_step "🚀 ДЕПЛОЙ ИЗМЕНЕНИЙ СИСТЕМЫ ОГРАНИЧЕНИЙ"

# Шаг 1: Копирование измененных файлов фронтенда
print_step "Шаг 1: Копирование измененных файлов фронтенда"
print_status "Копируем измененные компоненты..."

# Копируем каждый файл в нужную директорию
$SCP_CMD frontend/src/pages/SubdomainPage.jsx $SERVER_USER@$SERVER_HOST:$SERVER_PATH/frontend/src/pages/ 2>&1 || {
    print_error "Ошибка копирования SubdomainPage.jsx"
    exit 1
}

# Создаем директорию modals если её нет
$SSH_CMD $SERVER_USER@$SERVER_HOST "mkdir -p $SERVER_PATH/frontend/src/components/modals" 2>&1 || true
$SCP_CMD frontend/src/components/modals/PaymentModal.jsx $SERVER_USER@$SERVER_HOST:$SERVER_PATH/frontend/src/components/modals/ 2>&1 || {
    print_error "Ошибка копирования PaymentModal.jsx"
    exit 1
}

$SCP_CMD frontend/src/components/booking/MasterBookingModule.jsx $SERVER_USER@$SERVER_HOST:$SERVER_PATH/frontend/src/components/booking/ 2>&1 || {
    print_error "Ошибка копирования MasterBookingModule.jsx"
    exit 1
}

$SCP_CMD frontend/src/components/ClientRestrictionsManager.jsx $SERVER_USER@$SERVER_HOST:$SERVER_PATH/frontend/src/components/ 2>&1 || {
    print_error "Ошибка копирования ClientRestrictionsManager.jsx"
    exit 1
}

$SCP_CMD frontend/src/components/MasterSettings.jsx $SERVER_USER@$SERVER_HOST:$SERVER_PATH/frontend/src/components/ 2>&1 || {
    print_error "Ошибка копирования MasterSettings.jsx"
    exit 1
}

print_status "✅ Файлы фронтенда скопированы"

# Шаг 2: Копирование измененных файлов бэкенда
print_step "Шаг 2: Копирование измененных файлов бэкенда"
print_status "Копируем измененные файлы бэкенда..."

# Создаем необходимые директории
$SSH_CMD $SERVER_USER@$SERVER_HOST "mkdir -p $SERVER_PATH/backend/utils $SERVER_PATH/backend/routers $SERVER_PATH/backend/services $SERVER_PATH/backend/alembic/versions" 2>&1 || true

# Копируем каждый файл
$SCP_CMD backend/utils/client_restrictions.py $SERVER_USER@$SERVER_HOST:$SERVER_PATH/backend/utils/ 2>&1 || {
    print_error "Ошибка копирования client_restrictions.py"
    exit 1
}

$SCP_CMD backend/routers/master.py $SERVER_USER@$SERVER_HOST:$SERVER_PATH/backend/routers/ 2>&1 || {
    print_error "Ошибка копирования master.py"
    exit 1
}

$SCP_CMD backend/routers/client.py $SERVER_USER@$SERVER_HOST:$SERVER_PATH/backend/routers/ 2>&1 || {
    print_error "Ошибка копирования client.py"
    exit 1
}

$SCP_CMD backend/services/temporary_bookings_cleanup.py $SERVER_USER@$SERVER_HOST:$SERVER_PATH/backend/services/ 2>&1 || {
    print_error "Ошибка копирования temporary_bookings_cleanup.py"
    exit 1
}

$SCP_CMD backend/main.py $SERVER_USER@$SERVER_HOST:$SERVER_PATH/backend/ 2>&1 || {
    print_error "Ошибка копирования main.py"
    exit 1
}

$SCP_CMD backend/models.py $SERVER_USER@$SERVER_HOST:$SERVER_PATH/backend/ 2>&1 || {
    print_error "Ошибка копирования models.py"
    exit 1
}

$SCP_CMD backend/schemas.py $SERVER_USER@$SERVER_HOST:$SERVER_PATH/backend/ 2>&1 || {
    print_error "Ошибка копирования schemas.py"
    exit 1
}

$SCP_CMD backend/alembic/versions/add_client_restriction_rules_and_payment.py $SERVER_USER@$SERVER_HOST:$SERVER_PATH/backend/alembic/versions/ 2>&1 || {
    print_error "Ошибка копирования миграции"
    exit 1
}

print_status "✅ Файлы бэкенда скопированы"

# Шаг 3: Применение миграций
print_step "Шаг 3: Применение миграций базы данных"
print_status "Применяем миграции..."
$SSH_CMD $SERVER_USER@$SERVER_HOST "cd $SERVER_PATH && \
    docker-compose -f docker-compose.prod.yml exec -T backend alembic upgrade head 2>&1" || {
    print_warning "Попытка применить миграции через exec не удалась, пробуем через run..."
    $SSH_CMD $SERVER_USER@$SERVER_HOST "cd $SERVER_PATH && \
        docker-compose -f docker-compose.prod.yml run --rm backend alembic upgrade head 2>&1"
}

print_status "✅ Миграции применены"

# Шаг 4: Перезапуск контейнеров
print_step "Шаг 4: Перезапуск контейнеров"
print_status "Перезапускаем backend..."
$SSH_CMD $SERVER_USER@$SERVER_HOST "cd $SERVER_PATH && \
    docker-compose -f docker-compose.prod.yml restart backend"

print_status "Перезапускаем frontend..."
$SSH_CMD $SERVER_USER@$SERVER_HOST "cd $SERVER_PATH && \
    docker-compose -f docker-compose.prod.yml restart frontend"

print_status "✅ Контейнеры перезапущены"

# Шаг 5: Ожидание запуска
print_step "Шаг 5: Ожидание запуска сервисов"
print_status "Ждем 10 секунд для запуска сервисов..."
sleep 10

# Шаг 6: Проверка статуса
print_step "Шаг 6: Проверка статуса контейнеров"
print_status "Проверяем статус контейнеров..."
$SSH_CMD $SERVER_USER@$SERVER_HOST "cd $SERVER_PATH && docker-compose -f docker-compose.prod.yml ps"

# Шаг 7: Проверка логов
print_step "Шаг 7: Проверка логов"
print_status "Последние 20 строк логов backend:"
$SSH_CMD $SERVER_USER@$SERVER_HOST "cd $SERVER_PATH && docker-compose -f docker-compose.prod.yml logs --tail=20 backend"

print_status "Последние 20 строк логов frontend:"
$SSH_CMD $SERVER_USER@$SERVER_HOST "cd $SERVER_PATH && docker-compose -f docker-compose.prod.yml logs --tail=20 frontend"

# Финальная сводка
print_step "🎉 ДЕПЛОЙ ЗАВЕРШЕН"
echo -e "${GREEN}════════════════════════════════════════${NC}"
print_status "Измененные файлы скопированы"
print_status "Миграции применены"
print_status "Контейнеры перезапущены"
echo -e "${GREEN}════════════════════════════════════════${NC}"
echo ""
print_status "Проверьте работу системы на:"
echo "  🌐 https://dedato.ru"
echo ""

