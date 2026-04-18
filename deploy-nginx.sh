#!/bin/bash

echo "🚀 Деплой конфигурации Nginx для DeDato..."

# Копируем конфигурацию на сервер
echo "📁 Копируем конфигурацию Nginx..."
scp -o HostKeyAlgorithms=+ssh-rsa -o PubkeyAcceptedKeyTypes=+ssh-rsa nginx-dedato.conf root@193.160.208.206:/etc/nginx/sites-available/dedato.ru

# Подключаемся к серверу и настраиваем
echo "🔧 Настраиваем Nginx на сервере..."
ssh -o HostKeyAlgorithms=+ssh-rsa -o PubkeyAcceptedKeyTypes=+ssh-rsa root@193.160.208.206 << 'EOF'
    # Создаем символическую ссылку для активации сайта
    ln -sf /etc/nginx/sites-available/dedato.ru /etc/nginx/sites-enabled/
    
    # Проверяем конфигурацию
    echo "🔍 Проверяем конфигурацию Nginx..."
    nginx -t
    
    if [ $? -eq 0 ]; then
        echo "✅ Конфигурация корректна, перезапускаем Nginx..."
        systemctl reload nginx
        echo "🎉 Nginx успешно настроен!"
        echo "🌐 Сайт должен быть доступен по адресу: http://193.160.208.206/"
    else
        echo "❌ Ошибка в конфигурации Nginx!"
        exit 1
    fi
EOF

echo "✅ Деплой завершен!"
