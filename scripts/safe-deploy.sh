#!/bin/bash

# Безопасный скрипт деплоя Appointo
# Автоматизирует процесс деплоя с проверками и бэкапами

set -e

# Цвета для вывода
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Функции для вывода
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
    echo -e "${BLUE}[STEP]${NC} $1"
}

# Проверка, что мы в правильной директории
if [ ! -f "docker-compose.yml" ]; then
    print_error "Запустите скрипт из корневой директории проекта"
    exit 1
fi

# Создание директории для бэкапов
mkdir -p backups

# Функция создания бэкапа
create_backup() {
    local backup_name="backup_$(date +%Y%m%d_%H%M%S).db"
    print_step "Создание бэкапа базы данных..."
    
    # Проверяем, что контейнер backend запущен
    if ! docker-compose ps backend | grep -q "Up"; then
        print_error "Контейнер backend не запущен. Запустите docker-compose up -d"
        exit 1
    fi
    
    # Создаем бэкап
    docker-compose exec backend cp /app/bookme.db /app/$backup_name
    docker-compose cp backend:/app/$backup_name ./backups/
    
    # Проверяем размер бэкапа
    local backup_size=$(ls -lh backups/$backup_name | awk '{print $5}')
    print_status "Бэкап создан: backups/$backup_name (размер: $backup_size)"
    
    echo $backup_name
}

# Функция проверки миграций
check_migrations() {
    print_step "Проверка миграций..."
    
    local current_version=$(docker-compose exec backend alembic current 2>/dev/null | grep -o '[a-f0-9]\{12\}' || echo "none")
    local head_version=$(docker-compose exec backend alembic heads 2>/dev/null | grep -o '[a-f0-9]\{12\}' || echo "none")
    
    print_status "Текущая версия миграций: $current_version"
    print_status "Последняя версия миграций: $head_version"
    
    if [ "$current_version" != "$head_version" ]; then
        print_warning "Обнаружены новые миграции. Они будут применены автоматически."
        return 0
    else
        print_status "Миграции актуальны."
        return 1
    fi
}

# Функция применения миграций
apply_migrations() {
    print_step "Применение миграций..."
    
    docker-compose exec backend alembic upgrade head
    
    # Проверяем целостность базы данных
    local integrity_check=$(docker-compose exec backend sqlite3 /app/bookme.db "PRAGMA integrity_check;" 2>/dev/null)
    
    if [ "$integrity_check" = "ok" ]; then
        print_status "Миграции применены успешно. База данных прошла проверку целостности."
    else
        print_error "Ошибка проверки целостности базы данных: $integrity_check"
        exit 1
    fi
}

# Функция обновления приложения
update_application() {
    print_step "Обновление приложения..."
    
    # Останавливаем контейнеры
    print_status "Остановка контейнеров..."
    docker-compose down
    
    # Обновляем код
    print_status "Обновление кода из Git..."
    git pull origin main
    
    # Пересобираем образы
    print_status "Пересборка Docker образов..."
    docker-compose build --no-cache
    
    # Запускаем контейнеры
    print_status "Запуск обновленных контейнеров..."
    docker-compose up -d
    
    # Ждем запуска
    print_status "Ожидание запуска сервисов..."
    sleep 10
}

# Функция проверки работоспособности
check_health() {
    print_step "Проверка работоспособности..."
    
    # Проверяем статус контейнеров
    if ! docker-compose ps | grep -q "Up"; then
        print_error "Не все контейнеры запущены"
        docker-compose ps
        exit 1
    fi
    
    # Проверяем API
    print_status "Проверка API..."
    if curl -f http://localhost:8000/health >/dev/null 2>&1; then
        print_status "API доступен"
    else
        print_warning "API недоступен (возможно, еще запускается)"
    fi
    
    # Проверяем Frontend
    print_status "Проверка Frontend..."
    if curl -f http://localhost:5173 >/dev/null 2>&1; then
        print_status "Frontend доступен"
    else
        print_warning "Frontend недоступен (возможно, еще запускается)"
    fi
    
    # Проверяем базу данных
    print_status "Проверка базы данных..."
    local user_count=$(docker-compose exec backend sqlite3 /app/bookme.db "SELECT COUNT(*) FROM users;" 2>/dev/null || echo "0")
    print_status "Количество пользователей в базе: $user_count"
}

# Функция отката
rollback() {
    print_error "Обнаружена ошибка. Выполняется откат..."
    
    # Останавливаем контейнеры
    docker-compose down
    
    # Восстанавливаем предыдущую версию кода
    git checkout HEAD~1
    
    # Запускаем контейнеры
    docker-compose up -d
    
    print_warning "Откат выполнен. Проверьте работоспособность системы."
}

# Основная функция
main() {
    print_status "🚀 Начинаем безопасный деплой Appointo..."
    
    # Создаем бэкап
    local backup_name=$(create_backup)
    
    # Проверяем миграции
    if check_migrations; then
        # Применяем миграции
        apply_migrations
    fi
    
    # Обновляем приложение
    update_application
    
    # Проверяем работоспособность
    if check_health; then
        print_status "✅ Деплой завершен успешно!"
        print_status "Бэкап сохранен: backups/$backup_name"
    else
        print_error "❌ Ошибка при проверке работоспособности"
        rollback
        exit 1
    fi
}

# Обработка сигналов для корректного завершения
trap 'print_error "Прерывание деплоя..."; exit 1' INT TERM

# Запуск основной функции
main "$@"
