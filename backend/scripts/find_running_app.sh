#!/bin/bash

# Скрипт для поиска запущенного приложения и анализа логов
# Использование: ./find_running_app.sh

echo "=========================================="
echo "ПОИСК ЗАПУЩЕННОГО ПРИЛОЖЕНИЯ"
echo "=========================================="
echo ""

echo "1. Поиск процессов Python..."
echo "----------------------------------------"
ps aux | grep python | grep -v grep || echo "Процессы Python не найдены"
echo ""

echo "2. Поиск процессов uvicorn/gunicorn..."
echo "----------------------------------------"
ps aux | grep -E "uvicorn|gunicorn|fastapi" | grep -v grep || echo "Процессы uvicorn/gunicorn не найдены"
echo ""

echo "3. Проверка открытых портов..."
echo "----------------------------------------"
netstat -tulpn 2>/dev/null | grep -E ":80|:443|:8000" || ss -tulpn 2>/dev/null | grep -E ":80|:443|:8000" || echo "Порты не найдены"
echo ""

echo "4. Поиск systemd сервисов..."
echo "----------------------------------------"
systemctl list-units --type=service --all | grep -E "dedato|python|backend|web|uvicorn" || echo "Сервисы не найдены"
echo ""

echo "5. Поиск unit файлов systemd..."
echo "----------------------------------------"
find /etc/systemd/system -name "*.service" -type f 2>/dev/null | while read file; do
    if grep -q "dedato\|python\|uvicorn" "$file" 2>/dev/null; then
        echo "Найден: $file"
        echo "Содержимое:"
        cat "$file"
        echo ""
    fi
done
echo ""

echo "6. Поиск рабочей директории процесса..."
echo "----------------------------------------"
PID=$(ps aux | grep -E "uvicorn|gunicorn|python.*main" | grep -v grep | awk '{print $2}' | head -1)
if [ ! -z "$PID" ]; then
    echo "PID процесса: $PID"
    if [ -d "/proc/$PID" ]; then
        echo "Рабочая директория:"
        ls -la /proc/$PID/cwd 2>/dev/null || echo "Не удалось определить"
        readlink /proc/$PID/cwd 2>/dev/null || echo "Не удалось определить"
        echo ""
        echo "Команда запуска:"
        cat /proc/$PID/cmdline 2>/dev/null | tr '\0' ' ' || echo "Не удалось определить"
        echo ""
    fi
else
    echo "Процесс не найден"
fi
echo ""

echo "7. Поиск логов..."
echo "----------------------------------------"
echo "Логи systemd (последние 50 строк):"
journalctl -n 50 --no-pager 2>/dev/null | tail -50 || echo "Логи systemd недоступны"
echo ""

echo "Поиск .log файлов:"
find /home /root /var/log -name "*.log" -type f 2>/dev/null | head -20 || echo "Лог файлы не найдены"
echo ""

echo "8. Поиск кода приложения..."
echo "----------------------------------------"
echo "Поиск main.py:"
find /home /root -name "main.py" -type f 2>/dev/null | grep -v "site-packages\|__pycache__" | head -5 || echo "main.py не найден"
echo ""

echo "Поиск models.py:"
find /home /root -name "models.py" -type f 2>/dev/null | grep -v "site-packages\|__pycache__" | head -5 || echo "models.py не найден"
echo ""

echo "Поиск alembic.ini:"
find /home /root -name "alembic.ini" -type f 2>/dev/null | head -5 || echo "alembic.ini не найден"
echo ""

echo "9. Проверка git репозиториев..."
echo "----------------------------------------"
for repo in $(find /home /root -name ".git" -type d 2>/dev/null | head -5); do
    repo_dir=$(dirname "$repo")
    echo "Репозиторий: $repo_dir"
    cd "$repo_dir" 2>/dev/null && git status 2>/dev/null | head -5 || echo "Не удалось проверить статус"
    echo ""
done
echo ""

echo "10. Проверка nginx конфигурации..."
echo "----------------------------------------"
if [ -d "/etc/nginx" ]; then
    find /etc/nginx -name "*.conf" -type f 2>/dev/null | while read file; do
        if grep -q "dedato" "$file" 2>/dev/null; then
            echo "Найден: $file"
            grep -A 10 -B 5 "dedato" "$file" 2>/dev/null
            echo ""
        fi
    done
else
    echo "Nginx не установлен или конфигурация не найдена"
fi
echo ""

echo "11. Последние ошибки в системных логах..."
echo "----------------------------------------"
tail -50 /var/log/syslog 2>/dev/null | grep -i error | tail -10 || echo "Ошибки не найдены"
echo ""

echo "=========================================="
echo "АНАЛИЗ ЗАВЕРШЕН"
echo "=========================================="


