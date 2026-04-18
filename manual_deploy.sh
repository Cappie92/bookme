#!/bin/bash

# Ручной деплой скрипт для DeDato
# Этот скрипт создает архив с проектом для ручного переноса на сервер

set -e

echo "🚀 Подготовка к ручному деплою DeDato..."

# Создаем директорию для деплоя
DEPLOY_DIR="dedato_deploy_$(date +%Y%m%d_%H%M%S)"
mkdir -p "$DEPLOY_DIR"

echo "📁 Копируем файлы проекта..."

# Копируем основные файлы
cp -r backend "$DEPLOY_DIR/"
cp -r frontend "$DEPLOY_DIR/"
cp docker-compose.prod.yml "$DEPLOY_DIR/"
cp -r docs "$DEPLOY_DIR/"

# Копируем бэкап базы данных
cp backups/bookme_backup_*.db "$DEPLOY_DIR/backend/bookme.db"

echo "🗂️ Создаем архив для переноса..."

# Создаем архив
tar -czf "${DEPLOY_DIR}.tar.gz" "$DEPLOY_DIR"

echo "📊 Размер архива:"
ls -lh "${DEPLOY_DIR}.tar.gz"

echo "✅ Архив готов для переноса на сервер!"
echo "📁 Файл: ${DEPLOY_DIR}.tar.gz"
echo ""
echo "📋 Инструкции для деплоя на сервере:"
echo "1. Скопируйте архив на сервер"
echo "2. Распакуйте: tar -xzf ${DEPLOY_DIR}.tar.gz"
echo "3. Перейдите в директорию: cd $DEPLOY_DIR"
echo "4. Запустите: docker-compose -f docker-compose.prod.yml up -d"
echo ""
echo "🌐 После деплоя приложение будет доступно по адресу:"
echo "   Frontend: http://193.160.208.206:5173"
echo "   Backend:  http://193.160.208.206:8000"

# Удаляем временную директорию
rm -rf "$DEPLOY_DIR"

echo ""
echo "🎉 Готово! Архив ${DEPLOY_DIR}.tar.gz готов для переноса на сервер."


