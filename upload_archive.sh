#!/bin/bash

# Скрипт для загрузки архива на сервер
# Использование: ./upload_archive.sh

ARCHIVE="dedato_deploy_20251119_033838.tar.gz"
SERVER="root@193.160.208.206"
SERVER_PATH="/home/root"

echo "📤 Загружаем архив на сервер..."
echo "Архив: $ARCHIVE"
echo "Сервер: $SERVER"
echo ""

# Проверяем, существует ли архив
if [ ! -f "$ARCHIVE" ]; then
    echo "❌ Ошибка: архив $ARCHIVE не найден!"
    exit 1
fi

# Загружаем архив
echo "Загрузка началась..."
scp -o ServerAliveInterval=60 -o ServerAliveCountMax=10 "$ARCHIVE" "$SERVER:$SERVER_PATH/"

if [ $? -eq 0 ]; then
    echo "✅ Архив успешно загружен на сервер!"
    echo ""
    echo "Теперь на сервере выполните:"
    echo "  cd /home/root/dedato"
    echo "  tar -xzf ../$ARCHIVE"
    echo "  rm ../$ARCHIVE"
else
    echo "❌ Ошибка при загрузке архива"
    exit 1
fi

