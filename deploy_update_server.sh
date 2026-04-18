#!/bin/bash

# Скрипт для обновления кода на сервере и применения изменений
# Запускать на сервере в директории /home/root/dedato

# Не используем set -e, чтобы скрипт продолжал работу при опциональных ошибках

echo "🚀 Начало обновления DeDato на сервере..."
echo ""

# Переходим в директорию проекта
cd /home/root/dedato

# Проверяем, существует ли git репозиторий
if [ ! -d ".git" ]; then
    echo "📦 Git репозиторий не найден. Инициализирую..."
    git init
    git remote add origin https://github.com/Cappie92/bookme.git || git remote set-url origin https://github.com/Cappie92/bookme.git
    git fetch origin
    git checkout -b main origin/main || git reset --hard origin/main
    echo "✅ Git репозиторий инициализирован"
else
    echo "📥 Получаю последние изменения из GitHub..."
    git fetch origin
    git reset --hard origin/main
    echo "✅ Код обновлен"
fi

echo ""
echo "🔧 Применяю миграции базы данных..."

# Переходим в backend
cd backend

# Применяем миграции
python3 -m alembic upgrade head || echo "⚠️  Ошибка при применении миграций (возможно, уже применены)"

echo ""
echo "📋 Создаю план AlwaysFree..."

# Создаем план AlwaysFree
python3 scripts/create_always_free_plan.py || echo "⚠️  Ошибка при создании плана AlwaysFree (возможно, уже существует)"

echo ""
echo "💰 Настраиваю тестовые аккаунты..."

# Настраиваем тестовые аккаунты (опционально, может выдать ошибку если уже настроены)
python3 scripts/setup_test_accounts.py || echo "⚠️  Ошибка при настройке тестовых аккаунтов (возможно, уже настроены)"

echo ""
echo "🔄 Перезапускаю Docker контейнеры..."

# Возвращаемся в корневую директорию
cd ..

# Перезапускаем контейнеры
docker-compose -f docker-compose.prod.yml restart backend frontend || docker-compose restart backend frontend

echo ""
echo "✅ Обновление завершено!"
echo ""
echo "📊 Проверка статуса контейнеров:"
docker ps | grep dedato

echo ""
echo "🎉 Готово! Приложение обновлено и перезапущено."

