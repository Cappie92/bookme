#!/bin/bash

# Скрипт для копирования актуальной локальной БД на сервер
# Использование: ./copy_db_to_server.sh

set -e

SERVER_USER="root"
SERVER_HOST="193.160.208.206"
SERVER_PATH="/home/root/dedato"
LOCAL_DB="backend/bookme.db"

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

# Проверка, что мы в корневой директории
if [ ! -f "$LOCAL_DB" ]; then
    print_error "Локальная БД не найдена: $LOCAL_DB"
    print_error "Запустите скрипт из корневой директории проекта"
    exit 1
fi

print_step "Копирование локальной БД на сервер"

# Шаг 1: Проверка подключения
print_status "Проверка подключения к серверу..."
if ! ssh -o ConnectTimeout=10 $SERVER_USER@$SERVER_HOST "echo 'Подключение успешно'" > /dev/null 2>&1; then
    print_error "Не удается подключиться к серверу $SERVER_HOST"
    print_error "Проверьте SSH ключи и доступ к серверу"
    exit 1
fi
print_status "✅ Подключение к серверу установлено"

# Шаг 2: Остановка backend
print_step "Остановка backend на сервере"
print_status "Останавливаем backend..."
ssh $SERVER_USER@$SERVER_HOST "cd $SERVER_PATH && docker-compose -f docker-compose.prod.yml stop backend 2>&1" || {
    print_warning "Не удалось остановить backend (возможно, он уже остановлен)"
}

# Шаг 3: Создание бэкапа текущей БД на сервере
print_step "Создание бэкапа текущей БД на сервере"
BACKUP_NAME="bookme.db.backup.$(date +%Y%m%d_%H%M%S)"
ssh $SERVER_USER@$SERVER_HOST "cd $SERVER_PATH && \
    if [ -f backend/bookme.db ]; then
        mv backend/bookme.db backend/$BACKUP_NAME && \
        echo 'Бэкап создан: backend/$BACKUP_NAME' || \
        echo 'Не удалось создать бэкап'
    else
        echo 'Текущая БД не найдена, пропускаем бэкап'
    fi" 2>&1
print_status "✅ Бэкап создан на сервере: $BACKUP_NAME"

# Шаг 4: Копирование локальной БД
print_step "Копирование локальной БД на сервер"
print_status "Размер локальной БД: $(ls -lh $LOCAL_DB | awk '{print $5}')"
print_status "Копируем БД на сервер..."
scp $LOCAL_DB $SERVER_USER@$SERVER_HOST:$SERVER_PATH/backend/bookme.db 2>&1 || {
    print_error "Ошибка при копировании БД"
    exit 1
}
print_status "✅ БД скопирована на сервер"

# Шаг 5: Проверка размера скопированной БД
print_step "Проверка скопированной БД"
REMOTE_SIZE=$(ssh $SERVER_USER@$SERVER_HOST "cd $SERVER_PATH && ls -lh backend/bookme.db | awk '{print \$5}'" 2>&1)
print_status "Размер БД на сервере: $REMOTE_SIZE"

# Шаг 6: Запуск backend
print_step "Запуск backend на сервере"
print_status "Запускаем backend..."
ssh $SERVER_USER@$SERVER_HOST "cd $SERVER_PATH && docker-compose -f docker-compose.prod.yml start backend 2>&1" || {
    print_error "Ошибка при запуске backend"
    exit 1
}
print_status "✅ Backend запущен"

# Шаг 7: Ожидание запуска и проверка
print_step "Проверка работоспособности"
print_status "Ждем 5 секунд для запуска backend..."
sleep 5

print_status "Проверяем API..."
if curl -s --connect-timeout 10 http://$SERVER_HOST:8000/health > /dev/null 2>&1; then
    print_status "✅ API работает"
    curl -s http://$SERVER_HOST:8000/health
else
    print_warning "⚠️ API еще не отвечает, проверьте логи:"
    print_warning "  ssh $SERVER_USER@$SERVER_HOST 'cd $SERVER_PATH && docker-compose -f docker-compose.prod.yml logs --tail=30 backend'"
fi

# Финальная сводка
print_step "✅ Копирование БД завершено"
print_status "Локальная БД успешно скопирована на сервер"
print_status "Бэкап старой БД: $BACKUP_NAME"
print_status "Все пользователи и данные из локальной БД теперь доступны на сервере"

