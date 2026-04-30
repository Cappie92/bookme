#!/bin/bash

# LEGACY SCRIPT (do not use for production).
#
# Этот скрипт исторический и может приводить к “плавающему” Docker Compose project name,
# из-за чего появляются дубли named volumes (симптом: `dedato_dedato_data`).
#
# Канонический prod runbook и compose namespace закреплены в репозитории:
# - `docker-compose.prod.yml` (volumes: dedato_*, network: dedato_network; без верхнеуровневого `name:` ради совместимости с docker-compose v1.29.2)
# - `PROD_DEPLOY.md` (инструкции деплоя/миграции/бэкапа)

echo "🚀 БЫСТРЫЙ ДЕПЛОЙ С НУЛЯ"
echo "========================"

# Цвета для вывода
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Функция для вывода сообщений
log() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Проверка подключения к серверу
log "Проверяем подключение к серверу..."
if ! ssh -o ConnectTimeout=10 root@193.160.208.206 "echo 'Подключение успешно'"; then
    error "Не удается подключиться к серверу"
    exit 1
fi

log "✅ Подключение к серверу установлено"

# Шаг 1: Остановка всех контейнеров на сервере
log "Останавливаем все контейнеры на сервере..."
ssh root@193.160.208.206 "cd /home/root && docker-compose -f dedato/docker-compose.prod.yml down"

# Шаг 2: Создание папки и удаление старой (если нужно)
log "Создаем папку проекта на сервере..."
ssh root@193.160.208.206 "mkdir -p /home/root/dedato && rm -rf /home/root/dedato_old && mv /home/root/dedato /home/root/dedato_old 2>/dev/null || true && mkdir -p /home/root/dedato"

# Шаг 3: Копирование всей папки проекта
log "Копируем проект на сервер..."
scp -r . root@193.160.208.206:/home/root/dedato/

# Шаг 4: Запуск контейнеров
log "Запускаем контейнеры на сервере..."
ssh root@193.160.208.206 "cd /home/root/dedato && docker-compose -f docker-compose.prod.yml up -d --build"

# Шаг 5: Проверка статуса
log "Проверяем статус контейнеров..."
ssh root@193.160.208.206 "cd /home/root/dedato && docker-compose -f docker-compose.prod.yml ps"

# Шаг 6: Проверка API
log "Проверяем API..."
sleep 10
if curl -s http://193.160.208.206:8000/health; then
    log "✅ API работает"
else
    warn "⚠️ API не отвечает"
fi

# Шаг 7: Проверка фронтенда
log "Проверяем фронтенд..."
if curl -s -I http://193.160.208.206:5173 | grep -q "200 OK"; then
    log "✅ Фронтенд работает"
else
    warn "⚠️ Фронтенд не отвечает"
fi

echo ""
echo "🎉 ДЕПЛОЙ ЗАВЕРШЕН!"
echo "=================="
echo "Сайт: http://193.160.208.206:5173"
echo "API: http://193.160.208.206:8000"
echo ""
echo "Проверьте в браузере:"
echo "1. Загружается ли страница быстро"
echo "2. Есть ли логотип в модальном окне входа/регистрации"
echo "3. Работает ли логин для пользователей с ролью SALON"
echo "4. Правильно ли работает редирект после логина"
