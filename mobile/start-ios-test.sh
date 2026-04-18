#!/bin/bash

# Скрипт для быстрого запуска тестирования на iOS симуляторе

echo "🚀 Запуск тестирования на iOS симуляторе..."
echo ""

# Проверка, что мы в правильной директории
if [ ! -f "package.json" ]; then
    echo "❌ Запустите скрипт из папки mobile/"
    exit 1
fi

# Проверка backend
echo "📡 Проверка backend..."
if lsof -ti:8000 > /dev/null 2>&1; then
    echo "✅ Backend запущен на порту 8000"
else
    echo "⚠️  Backend не запущен на порту 8000"
    echo "   Запустите в отдельном терминале:"
    echo "   cd ../backend && python3 -m uvicorn main:app --reload --host 0.0.0.0 --port 8000"
    echo ""
    read -p "Продолжить без backend? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Проверка .env
echo "📝 Проверка .env файла..."
if grep -q "API_URL=http://localhost:8000" .env; then
    echo "✅ API_URL настроен правильно"
else
    echo "⚠️  API_URL не настроен для localhost:8000"
    echo "   Проверьте файл .env"
fi

# Запуск симулятора
echo "📱 Запуск iOS симулятора..."
open -a Simulator
sleep 3

# Запуск Expo
echo "🎨 Запуск Expo..."
echo ""
echo "=========================================="
echo "  После запуска нажмите 'i' в терминале"
echo "  чтобы открыть приложение в симуляторе"
echo "=========================================="
echo ""

npm start

