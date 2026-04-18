#!/bin/bash

# Исправленная версия скрипта полного деплоя
# Основные изменения:
# - Улучшенная обработка ошибок
# - Более надежное применение миграций
# - Проверка статуса контейнеров перед миграциями

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
rsync -avz --progress \
    --exclude='__pycache__' \
    --exclude='*.pyc' \
    --exclude='*.pyo' \
    --exclude='bookme.db' \
    --exclude='bookme.db-journal' \
    --exclude='test.db' \
    --exclude='.DS_Store' \
    --exclude='*.log' \
    --exclude='venv' \
    backend/ $SERVER_USER@$SERVER_HOST:$SERVER_PATH/backend/

print_status "✅ Backend файлы скопированы"

# Шаг 5: Копирование frontend файлов
print_step "Шаг 4: Копирование frontend файлов"
print_status "Копируем frontend..."
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

# Шаг 8: Пересборка и запуск контейнеров
print_step "Шаг 7: Пересборка и запуск контейнеров"
print_status "Пересобираем контейнеры..."
ssh $SERVER_USER@$SERVER_HOST "cd $SERVER_PATH && \
    docker-compose -f docker-compose.prod.yml build --no-cache"

print_status "Запускаем контейнеры..."
ssh $SERVER_USER@$SERVER_HOST "cd $SERVER_PATH && \
    docker-compose -f docker-compose.prod.yml up -d"

print_status "✅ Контейнеры запущены"

# Шаг 9: Ожидание и проверка запуска контейнеров
print_step "Шаг 8: Проверка запуска контейнеров"
print_status "Ждем 20 секунд для полного запуска контейнеров..."
sleep 20

# Проверка что контейнеры запустились
print_status "Проверяем статус контейнеров..."
CONTAINER_STATUS=$(ssh $SERVER_USER@$SERVER_HOST "cd $SERVER_PATH && docker-compose -f docker-compose.prod.yml ps | grep backend | grep -c 'Up' || echo '0'")
if [ "$CONTAINER_STATUS" = "0" ]; then
    print_error "Контейнер backend не запущен! Проверяем логи..."
    ssh $SERVER_USER@$SERVER_HOST "cd $SERVER_PATH && docker-compose -f docker-compose.prod.yml logs --tail=50 backend"
    exit 1
fi
print_status "✅ Контейнер backend запущен"

# Шаг 10: Применение миграций (после того как приложение создаст БД)
print_step "Шаг 9: Применение миграций базы данных"
print_status "Ждем 10 секунд, чтобы приложение создало БД (если её нет)..."
sleep 10

print_status "Проверяем наличие БД..."
DB_EXISTS=$(ssh $SERVER_USER@$SERVER_HOST "cd $SERVER_PATH && docker-compose -f docker-compose.prod.yml exec -T backend ls -la /app/bookme.db 2>/dev/null | grep -c bookme.db || echo '0'")

if [ "$DB_EXISTS" = "0" ]; then
    print_warning "БД еще не создана. Приложение создаст её при первом запросе."
    print_warning "Миграции можно применить позже командой:"
    print_warning "  docker-compose -f docker-compose.prod.yml exec backend alembic upgrade head"
    MIGRATION_EXIT_CODE=1
else
    print_status "БД найдена. Применяем миграции..."
    set +e
    MIGRATION_RESULT=$(ssh $SERVER_USER@$SERVER_HOST "cd $SERVER_PATH && \
        docker-compose -f docker-compose.prod.yml exec -T backend sh -c 'cd /app && alembic upgrade head' 2>&1")
    MIGRATION_EXIT_CODE=$?
    set -e
    
    if [ $MIGRATION_EXIT_CODE -eq 0 ]; then
        print_status "✅ Миграции применены"
        echo "$MIGRATION_RESULT" | head -10
    else
        print_warning "Ошибка при применении миграций через exec. Пробуем через run..."
        ssh $SERVER_USER@$SERVER_HOST "cd $SERVER_PATH && \
            docker-compose -f docker-compose.prod.yml run --rm backend sh -c 'cd /app && alembic upgrade head' 2>&1" || {
            print_warning "Не удалось применить миграции автоматически."
            print_warning "Приложение будет работать с базовой структурой БД."
            print_warning "Миграции можно применить позже вручную."
        }
    fi
fi

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
print_status "Ждем 5 секунд для полной готовности..."
sleep 5

print_status "Проверяем API..."
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
if [ "${MIGRATION_EXIT_CODE:-1}" -eq 0 ]; then
    print_status "Миграции применены"
else
    print_warning "Миграции не применены автоматически"
    print_warning "При необходимости примените их вручную:"
    print_warning "  ssh root@193.160.208.206 'cd /home/root/dedato && docker-compose -f docker-compose.prod.yml exec backend alembic upgrade head'"
fi
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

