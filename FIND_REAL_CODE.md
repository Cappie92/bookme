# Поиск реального кода приложения

## Проблема: Рабочая директория `/app` не существует

## Выполните эти команды:

```bash
# 1. Проверьте Docker контейнеры
echo "=== Docker контейнеры ==="
docker ps -a 2>/dev/null || echo "Docker не установлен"
echo ""

# 2. Проверьте, может быть процесс в chroot или другом окружении
echo "=== Информация о процессе ==="
PID=13783
ls -la /proc/$PID/root 2>/dev/null | head -5
echo ""

# 3. Проверьте, где реально находится main.py
echo "=== Поиск main.py по всей системе ==="
find /home /root /opt /usr/local -name "main.py" -type f 2>/dev/null | grep -v "site-packages\|__pycache__" | head -10
echo ""

# 4. Проверьте, может быть код в /opt или /usr/local
echo "=== Проверка стандартных директорий ==="
ls -la /opt/ 2>/dev/null | head -10
ls -la /usr/local/ 2>/dev/null | head -10
echo ""

# 5. Проверьте переменные окружения процесса
echo "=== Переменные окружения процесса (первые 30 строк) ==="
cat /proc/$PID/environ | tr '\0' '\n' | head -30
echo ""

# 6. Проверьте, может быть код в /root
echo "=== Содержимое /root ==="
ls -la /root/ | head -20
echo ""

# 7. Проверьте nginx конфигурацию (может указать на путь)
echo "=== Nginx конфигурация ==="
find /etc/nginx -name "*.conf" -type f 2>/dev/null | xargs grep -l "dedato\|8000\|localhost" 2>/dev/null | while read f; do
    echo "=== $f ==="
    cat "$f" | grep -A 5 -B 5 "dedato\|8000\|localhost\|proxy_pass"
    echo ""
done
echo ""

# 8. Проверьте, может быть код в /var/www или /srv
echo "=== Проверка /var/www и /srv ==="
ls -la /var/www/ 2>/dev/null | head -10
ls -la /srv/ 2>/dev/null | head -10
echo ""

# 9. Проверьте историю команд root
echo "=== История команд (последние 30 строк с python/uvicorn) ==="
history | grep -E "python|uvicorn|cd|/app" | tail -30
echo ""

# 10. Проверьте, может быть код в /root/dedato (старая директория)
echo "=== Проверка /root/dedato ==="
ls -la /root/dedato/ 2>/dev/null | head -20
echo ""

# 11. Проверьте, может быть код в /home/root/dedato
echo "=== Проверка /home/root/dedato ==="
ls -la /home/root/dedato/ 2>/dev/null | head -20
echo ""
```

## Или выполните все сразу:

```bash
PID=13783
echo "=== 1. Docker контейнеры ==="
docker ps -a 2>/dev/null || echo "Docker не установлен"
echo ""

echo "=== 2. Поиск main.py ==="
find /home /root /opt /usr/local /var/www /srv -name "main.py" -type f 2>/dev/null | grep -v "site-packages\|__pycache__" | head -10
echo ""

echo "=== 3. Переменные окружения процесса ==="
cat /proc/$PID/environ | tr '\0' '\n' | grep -E "PATH|HOME|PWD|VIRTUAL_ENV" | head -10
echo ""

echo "=== 4. Nginx конфигурация ==="
grep -r "dedato\|8000\|localhost" /etc/nginx/ 2>/dev/null | head -20
echo ""

echo "=== 5. Содержимое /root ==="
ls -la /root/ | head -20
echo ""

echo "=== 6. История команд ==="
history | grep -E "python|uvicorn|cd|/app" | tail -20
```


