#!/bin/bash

# Скрипт полного деплоя локальной версии на продакшн сервер
# Заменяет все файлы на сервере локальной версией

set -e

SERVER_USER="root"
SERVER_HOST="193.160.208.206"
SERVER_PATH="/home/root/dedato"

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
if [ ! -f "docker-compose.prod.yml" ]; then
    print_error "Запустите скрипт из корневой директории проекта"
    exit 1
fi

print_step "🚀 ПОЛНЫЙ ДЕПЛОЙ ЛОКАЛЬНОЙ ВЕРСИИ НА ПРОДАКШН"

# Шаг 1: Проверка подключения
print_status "Проверка подключения к серверу..."
if ! ssh -o ConnectTimeout=10 $SERVER_USER@$SERVER_HOST "echo 'Подключение успешно'" > /dev/null 2>&1; then
    print_error "Не удается подключиться к серверу $SERVER_HOST"
    exit 1
fi
print_status "✅ Подключение к серверу установлено"

# Шаг 2: Создание бэкапа базы данных
print_step "Шаг 1: Создание бэкапа базы данных"
mkdir -p backups
BACKUP_FILE="backups/bookme_backup_$(date +%Y%m%d_%H%M%S).db"
print_status "Создание бэкапа БД на сервере..."
ssh $SERVER_USER@$SERVER_HOST "cd $SERVER_PATH && \
    docker-compose -f docker-compose.prod.yml exec -T backend cp /app/bookme.db /tmp/bookme_backup.db 2>/dev/null || \
    docker-compose -f docker-compose.prod.yml run --rm backend cp /app/bookme.db /tmp/bookme_backup.db 2>/dev/null || true"
scp $SERVER_USER@$SERVER_HOST:/tmp/bookme_backup.db $BACKUP_FILE 2>/dev/null || print_warning "Не удалось создать бэкап БД (возможно БД нет)"
if [ -f "$BACKUP_FILE" ]; then
    print_status "✅ Бэкап сохранен: $BACKUP_FILE"
else
    print_warning "Бэкап не создан (вероятно, БД еще не существует)"
fi

# Шаг 3: Остановка контейнеров
print_step "Шаг 2: Остановка контейнеров на сервере"
print_status "Останавливаем контейнеры..."
ssh $SERVER_USER@$SERVER_HOST "cd $SERVER_PATH && docker-compose -f docker-compose.prod.yml down 2>/dev/null || true"
print_status "✅ Контейнеры остановлены"

# Шаг 4: Копирование backend файлов
print_step "Шаг 3: Копирование backend файлов"
print_status "Копируем backend..."

# Копируем всю директорию backend (исключая node_modules, __pycache__, .pyc файлы и БД)
rsync -avz --progress \
    --exclude='__pycache__' \
    --exclude='*.pyc' \
    --exclude='*.pyo' \
    --exclude='bookme.db' \
    --exclude='bookme.db-journal' \
    --exclude='test.db' \
    --exclude='.DS_Store' \
    --exclude='*.log' \
    backend/ $SERVER_USER@$SERVER_HOST:$SERVER_PATH/backend/

print_status "✅ Backend файлы скопированы"

# Шаг 5: Копирование frontend файлов
print_step "Шаг 4: Копирование frontend файлов"
print_status "Копируем frontend..."

# Копируем всю директорию frontend (исключая node_modules, dist, .DS_Store)
rsync -avz --progress \
    --exclude='node_modules' \
    --exclude='dist' \
    --exclude='.DS_Store' \
    --exclude='*.log' \
    frontend/ $SERVER_USER@$SERVER_HOST:$SERVER_PATH/frontend/

print_status "✅ Frontend файлы скопированы"

# Шаг 6: Копирование конфигурационных файлов
print_step "Шаг 5: Копирование конфигурационных файлов"
print_status "Копируем конфигурацию..."
scp docker-compose.prod.yml $SERVER_USER@$SERVER_HOST:$SERVER_PATH/
if [ -f "nginx-dedato.conf" ]; then
    scp nginx-dedato.conf $SERVER_USER@$SERVER_HOST:$SERVER_PATH/ 2>/dev/null || true
fi
print_status "✅ Конфигурационные файлы скопированы"

# Шаг 7: Сохранение базы данных на сервере
print_step "Шаг 6: Сохранение существующей базы данных"
print_status "Проверяем наличие БД на сервере..."
EXISTING_DB=$(ssh $SERVER_USER@$SERVER_HOST "ls -la $SERVER_PATH/backend/bookme.db 2>/dev/null || echo 'NOT_FOUND'")
if [[ "$EXISTING_DB" != *"NOT_FOUND"* ]]; then
    print_status "Сохраняем существующую БД..."
    ssh $SERVER_USER@$SERVER_HOST "cd $SERVER_PATH && \
        mv backend/bookme.db backend/bookme.db.backup.$(date +%Y%m%d_%H%M%S) 2>/dev/null || true"
    print_status "✅ База данных сохранена"
else
    print_warning "База данных не найдена, будет создана новая"
fi

# Шаг 7: Пересборка и запуск контейнеров
print_step "Шаг 7: Пересборка и запуск контейнеров"
print_status "Пересобираем контейнеры..."
ssh $SERVER_USER@$SERVER_HOST "cd $SERVER_PATH && \
    docker-compose -f docker-compose.prod.yml build --no-cache"

print_status "Запускаем контейнеры..."
ssh $SERVER_USER@$SERVER_HOST "cd $SERVER_PATH && \
    docker-compose -f docker-compose.prod.yml up -d"

print_status "✅ Контейнеры запущены"

# Шаг 8: Ожидание запуска контейнеров перед миграциями
print_status "Ждем 15 секунд для запуска контейнеров..."
sleep 15

# Проверка что контейнеры запустились
print_status "Проверяем статус контейнеров..."
CONTAINER_STATUS=$(ssh $SERVER_USER@$SERVER_HOST "cd $SERVER_PATH && docker-compose -f docker-compose.prod.yml ps | grep backend | grep -c 'Up' || echo '0'")
if [ "$CONTAINER_STATUS" = "0" ]; then
    print_error "Контейнер backend не запущен! Проверяем логи..."
    ssh $SERVER_USER@$SERVER_HOST "cd $SERVER_PATH && docker-compose -f docker-compose.prod.yml logs --tail=50 backend"
    exit 1
fi
print_status "✅ Контейнер backend запущен"

# Шаг 9: Применение миграций (после запуска контейнеров)
print_step "Шаг 8: Применение миграций базы данных"
print_status "Проверяем статус контейнера backend..."
ssh $SERVER_USER@$SERVER_HOST "cd $SERVER_PATH && docker-compose -f docker-compose.prod.yml ps backend"

print_status "Применяем миграции..."
MIGRATION_OUTPUT=$(ssh $SERVER_USER@$SERVER_HOST "cd $SERVER_PATH && \
    docker-compose -f docker-compose.prod.yml exec -T backend alembic upgrade head 2>&1" || echo "MIGRATION_FAILED")

if echo "$MIGRATION_OUTPUT" | grep -q "MIGRATION_FAILED\|Error\|error\|Traceback"; then
    print_warning "Попытка применить миграции завершилась с ошибкой. Пробуем еще раз через run..."
    sleep 5
    ssh $SERVER_USER@$SERVER_HOST "cd $SERVER_PATH && \
        docker-compose -f docker-compose.prod.yml run --rm backend alembic upgrade head 2>&1"
    if [ $? -eq 0 ]; then
        print_status "✅ Миграции применены (через run)"
    else
        print_error "❌ Ошибка при применении миграций. Проверьте логи выше."
        echo "$MIGRATION_OUTPUT"
        exit 1
    fi
else
    print_status "✅ Миграции применены"
    echo "$MIGRATION_OUTPUT"
fi

# Шаг 10: Ожидание запуска
print_step "Шаг 9: Ожидание запуска сервисов"
print_status "Ждем 15 секунд для запуска сервисов..."
sleep 15

# Шаг 11: Проверка статуса
print_step "Шаг 10: Проверка статуса контейнеров"
print_status "Проверяем статус контейнеров..."
ssh $SERVER_USER@$SERVER_HOST "cd $SERVER_PATH && docker-compose -f docker-compose.prod.yml ps"

# Шаг 12: Проверка логов
print_step "Шаг 11: Проверка логов"
print_status "Последние 30 строк логов backend:"
ssh $SERVER_USER@$SERVER_HOST "cd $SERVER_PATH && docker-compose -f docker-compose.prod.yml logs --tail=30 backend"

print_status "Последние 30 строк логов frontend:"
ssh $SERVER_USER@$SERVER_HOST "cd $SERVER_PATH && docker-compose -f docker-compose.prod.yml logs --tail=30 frontend"

# Шаг 13: Проверка API и Frontend
print_step "Шаг 12: Проверка доступности сервисов"
print_status "Проверяем API..."
sleep 5
if curl -s --connect-timeout 10 http://$SERVER_HOST:8000/health > /dev/null 2>&1; then
    print_status "✅ API работает"
    curl -s http://$SERVER_HOST:8000/health | head -1
else
    print_warning "⚠️ API не отвечает или еще запускается"
fi

print_status "Проверяем Frontend..."
if curl -s --connect-timeout 10 -I http://$SERVER_HOST:5173 2>/dev/null | grep -q "200\|301\|302"; then
    print_status "✅ Frontend работает"
else
    print_warning "⚠️ Frontend не отвечает или еще запускается"
fi

# Финальная сводка
print_step "🎉 ДЕПЛОЙ ЗАВЕРШЕН"
echo -e "${GREEN}════════════════════════════════════════${NC}"
print_status "Все файлы скопированы с локальной машины на сервер"
print_status "Миграции применены"
print_status "Контейнеры пересобраны и запущены"
if [ -f "$BACKUP_FILE" ]; then
    print_status "Бэкап базы данных: $BACKUP_FILE"
fi
echo -e "${GREEN}════════════════════════════════════════${NC}"
echo ""
print_status "Адреса:"
echo "  🌐 Frontend: http://$SERVER_HOST:5173"
echo "  🔌 API: http://$SERVER_HOST:8000"
echo "  📚 API Docs: http://$SERVER_HOST:8000/docs"
echo ""
print_warning "Рекомендуется протестировать основные функции приложения"

