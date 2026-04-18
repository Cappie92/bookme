# Быстрая отладка: Поиск запущенного приложения

## Выполните эти команды на сервере по порядку:

```bash
# 1. Найдите процессы Python
ps aux | grep python | grep -v grep

# 2. Найдите процессы uvicorn/gunicorn
ps aux | grep -E "uvicorn|gunicorn" | grep -v grep

# 3. Найдите рабочую директорию процесса (замените PID)
PID=$(ps aux | grep -E "uvicorn|gunicorn" | grep -v grep | awk '{print $2}' | head -1)
echo "PID: $PID"
if [ ! -z "$PID" ]; then
    echo "Рабочая директория:"
    readlink /proc/$PID/cwd
    echo "Команда запуска:"
    cat /proc/$PID/cmdline | tr '\0' ' '
    echo ""
fi

# 4. Найдите systemd сервисы
systemctl list-units --type=service --all | grep -E "dedato|python|backend|web|uvicorn"

# 5. Найдите unit файлы
find /etc/systemd/system -name "*.service" -type f -exec grep -l "dedato\|python\|uvicorn" {} \; 2>/dev/null

# 6. Найдите код
find /home /root -name "main.py" -type f 2>/dev/null | grep -v "site-packages" | head -5
find /home /root -name "models.py" -type f 2>/dev/null | grep -v "site-packages" | head -5

# 7. Проверьте логи
journalctl -n 50 --no-pager | tail -20

# 8. Проверьте nginx
find /etc/nginx -name "*.conf" -type f | xargs grep -l "dedato" 2>/dev/null
```

## Или используйте скрипт:

```bash
# Загрузите скрипт с вашего Mac:
# scp backend/scripts/find_running_app.sh root@сервер:/tmp/

# На сервере:
chmod +x /tmp/find_running_app.sh
/tmp/find_running_app.sh > /tmp/app_analysis.txt 2>&1
cat /tmp/app_analysis.txt
```

## Пришлите результаты всех команд - я помогу найти проблему!


