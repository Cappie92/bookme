#!/bin/bash

# Скрипт для обновления кода на сервере и применения изменений
echo "🚀 Начало обновления DeDato на сервере..."
echo ""

cd /home/root/dedato

# Исправляем проблему с правами доступа git
git config --global --add safe.directory /home/root/dedato

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
echo "📋 Проверяю, что код получен..."
if [ ! -f "backend/scripts/create_always_free_plan.py" ]; then
    echo "⚠️  Скрипты не найдены. Пытаюсь получить код заново..."
    git fetch origin
    git reset --hard origin/main
    git clean -fd
fi

echo ""
echo "🔧 Применяю миграции базы данных..."
cd backend

# Пробуем разные способы запуска alembic
if python3 -m alembic upgrade head 2>/dev/null; then
    echo "✅ Миграции применены"
elif python3 -c "import alembic" 2>/dev/null && alembic upgrade head; then
    echo "✅ Миграции применены"
else
    echo "⚠️  Не удалось применить миграции. Проверьте установку alembic:"
    echo "   pip3 install alembic"
    echo "   или выполните миграции вручную внутри Docker контейнера"
fi

echo ""
echo "📋 Создаю план AlwaysFree..."

# Проверяем, существует ли скрипт
if [ -f "scripts/create_always_free_plan.py" ]; then
    python3 scripts/create_always_free_plan.py || echo "⚠️  Ошибка при создании плана AlwaysFree (возможно, уже существует)"
else
    echo "⚠️  Скрипт create_always_free_plan.py не найден. Пропускаю..."
fi

echo ""
echo "💰 Настраиваю тестовые аккаунты..."

if [ -f "scripts/setup_test_accounts.py" ]; then
    python3 scripts/setup_test_accounts.py || echo "⚠️  Ошибка при настройке тестовых аккаунтов (возможно, уже настроены)"
else
    echo "⚠️  Скрипт setup_test_accounts.py не найден. Пропускаю..."
fi

echo ""
echo "🔄 Перезапускаю Docker контейнеры..."
cd ..

docker-compose -f docker-compose.prod.yml restart backend frontend || docker-compose restart backend frontend

echo ""
echo "✅ Обновление завершено!"
echo ""
echo "📊 Проверка статуса контейнеров:"
docker ps | grep dedato

echo ""
echo "💡 Если миграции не применились, выполните их внутри контейнера:"
echo "   docker exec -it dedato_backend_1 python -m alembic upgrade head"
echo ""
echo "🎉 Готово!"




