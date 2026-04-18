#!/bin/bash

echo "=== 1. Процессы Python ==="
ps aux | grep python | grep -v grep

echo ""
echo "=== 2. Процессы uvicorn/gunicorn ==="
ps aux | grep -E "uvicorn|gunicorn|fastapi" | grep -v grep

echo ""
echo "=== 3. Открытые порты ==="
netstat -tulpn 2>/dev/null | grep -E ":80|:443|:8000" || ss -tulpn 2>/dev/null | grep -E ":80|:443|:8000"

echo ""
echo "=== 4. Systemd сервисы ==="
systemctl list-units --type=service --all 2>/dev/null | grep -E "dedato|python|backend|web|uvicorn" || echo "Не найдено"

echo ""
echo "=== 5. Рабочая директория процесса ==="
PID=$(ps aux | grep -E "uvicorn|gunicorn|python.*main" | grep -v grep | awk '{print $2}' | head -1)
if [ ! -z "$PID" ] && [ -d "/proc/$PID" ]; then
    echo "PID: $PID"
    echo "Рабочая директория: $(readlink /proc/$PID/cwd 2>/dev/null)"
    echo "Команда: $(cat /proc/$PID/cmdline 2>/dev/null | tr '\0' ' ')"
else
    echo "Процесс не найден"
fi

echo ""
echo "=== 6. Поиск main.py ==="
find /home /root -name "main.py" -type f 2>/dev/null | grep -v "site-packages\|__pycache__" | head -5 || echo "Не найдено"

echo ""
echo "=== 7. Поиск models.py ==="
find /home /root -name "models.py" -type f 2>/dev/null | grep -v "site-packages\|__pycache__" | head -5 || echo "Не найдено"

echo ""
echo "=== 8. Unit файлы systemd ==="
find /etc/systemd/system -name "*.service" -type f 2>/dev/null | while read f; do
    grep -q "dedato\|python\|uvicorn" "$f" 2>/dev/null && echo "Найден: $f"
done || echo "Не найдено"

echo ""
echo "=== 9. Логи (последние 10 строк) ==="
journalctl -n 10 --no-pager 2>/dev/null | tail -10 || echo "Логи недоступны"


