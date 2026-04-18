#!/bin/bash

# Скрипт для проверки статуса SSL настройки

echo "=== ПРОВЕРКА SSL НАСТРОЙКИ ==="
echo ""

echo "1. Проверка наличия файлов сертификатов:"
echo "   Сертификат:"
ls -la /etc/ssl/certs/dedato.ru.crt 2>/dev/null || echo "   ❌ Файл сертификата НЕ найден"
echo "   Приватный ключ:"
ls -la /etc/ssl/private/dedato.ru.key 2>/dev/null || echo "   ❌ Файл приватного ключа НЕ найден"
echo ""

echo "2. Проверка прав доступа:"
if [ -f /etc/ssl/certs/dedato.ru.crt ]; then
    PERMS=$(stat -c "%a" /etc/ssl/certs/dedato.ru.crt 2>/dev/null || stat -f "%OLp" /etc/ssl/certs/dedato.ru.crt)
    echo "   Сертификат: $PERMS (ожидается 644)"
fi
if [ -f /etc/ssl/private/dedato.ru.key ]; then
    PERMS=$(stat -c "%a" /etc/ssl/private/dedato.ru.key 2>/dev/null || stat -f "%OLp" /etc/ssl/private/dedato.ru.key)
    echo "   Приватный ключ: $PERMS (ожидается 600)"
fi
echo ""

echo "3. Проверка конфигурации nginx:"
nginx -t 2>&1
echo ""

echo "4. Проверка статуса nginx:"
systemctl status nginx --no-pager -l | head -15
echo ""

echo "5. Проверка портов:"
netstat -tlnp 2>/dev/null | grep -E ':(80|443)' || ss -tlnp 2>/dev/null | grep -E ':(80|443)'
echo ""

echo "6. Проверка конфигурации nginx для HTTPS:"
grep -A 5 "listen 443" /etc/nginx/sites-available/dedato.ru 2>/dev/null || echo "   ❌ Конфигурация HTTPS не найдена"
echo ""

echo "7. Тест HTTPS соединения:"
curl -I https://dedato.ru 2>&1 | head -10
echo ""

