# Проверка выполнения скрипта

## Выполните эти команды на сервере:

```bash
# 1. Проверьте, что скрипт существует и исполняемый
ls -la /tmp/find_running_app.sh

# 2. Проверьте, существует ли файл результатов
ls -la /tmp/app_analysis.txt

# 3. Проверьте размер файла (если он существует)
du -h /tmp/app_analysis.txt

# 4. Попробуйте запустить скрипт напрямую и посмотреть вывод
/tmp/find_running_app.sh

# 5. Если скрипт не работает, проверьте синтаксис
bash -n /tmp/find_running_app.sh

# 6. Попробуйте запустить с явным указанием bash
bash /tmp/find_running_app.sh

# 7. Проверьте, какие команды из скрипта работают отдельно
ps aux | grep python | grep -v grep
ps aux | grep -E "uvicorn|gunicorn" | grep -v grep
```

## Альтернатива: Выполните команды вручную

Если скрипт не работает, выполните команды по отдельности:

```bash
# 1. Найдите процессы Python
echo "=== Процессы Python ==="
ps aux | grep python | grep -v grep

# 2. Найдите процессы uvicorn/gunicorn
echo ""
echo "=== Процессы uvicorn/gunicorn ==="
ps aux | grep -E "uvicorn|gunicorn|fastapi" | grep -v grep

# 3. Найдите открытые порты
echo ""
echo "=== Открытые порты ==="
netstat -tulpn 2>/dev/null | grep -E ":80|:443|:8000" || ss -tulpn 2>/dev/null | grep -E ":80|:443|:8000"

# 4. Найдите systemd сервисы
echo ""
echo "=== Systemd сервисы ==="
systemctl list-units --type=service --all | grep -E "dedato|python|backend|web|uvicorn"

# 5. Найдите unit файлы
echo ""
echo "=== Unit файлы ==="
find /etc/systemd/system -name "*.service" -type f 2>/dev/null | while read file; do
    if grep -q "dedato\|python\|uvicorn" "$file" 2>/dev/null; then
        echo "Найден: $file"
    fi
done

# 6. Найдите рабочую директорию процесса
echo ""
echo "=== Рабочая директория процесса ==="
PID=$(ps aux | grep -E "uvicorn|gunicorn|python.*main" | grep -v grep | awk '{print $2}' | head -1)
if [ ! -z "$PID" ]; then
    echo "PID: $PID"
    if [ -d "/proc/$PID" ]; then
        echo "Рабочая директория:"
        readlink /proc/$PID/cwd 2>/dev/null
        echo "Команда запуска:"
        cat /proc/$PID/cmdline 2>/dev/null | tr '\0' ' '
        echo ""
    fi
else
    echo "Процесс не найден"
fi

# 7. Найдите код
echo ""
echo "=== Поиск кода ==="
echo "main.py:"
find /home /root -name "main.py" -type f 2>/dev/null | grep -v "site-packages\|__pycache__" | head -5
echo ""
echo "models.py:"
find /home /root -name "models.py" -type f 2>/dev/null | grep -v "site-packages\|__pycache__" | head -5
echo ""
echo "alembic.ini:"
find /home /root -name "alembic.ini" -type f 2>/dev/null | head -5

# 8. Проверьте логи
echo ""
echo "=== Логи systemd (последние 20 строк) ==="
journalctl -n 20 --no-pager 2>/dev/null | tail -20

# 9. Проверьте nginx
echo ""
echo "=== Nginx конфигурация ==="
if [ -d "/etc/nginx" ]; then
    find /etc/nginx -name "*.conf" -type f 2>/dev/null | while read file; do
        if grep -q "dedato" "$file" 2>/dev/null; then
            echo "Найден: $file"
        fi
    done
else
    echo "Nginx не найден"
fi
```


