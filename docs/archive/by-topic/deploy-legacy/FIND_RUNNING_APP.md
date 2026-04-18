# Поиск запущенного приложения и анализ логов

## 1. Поиск запущенного процесса

```bash
# Найдите все процессы Python
ps aux | grep python | grep -v grep

# Найдите процессы uvicorn/gunicorn (FastAPI)
ps aux | grep -E "uvicorn|gunicorn|fastapi" | grep -v grep

# Найдите процессы по портам
netstat -tulpn | grep -E ":80|:443|:8000"
# или
ss -tulpn | grep -E ":80|:443|:8000"

# Проверьте systemd сервисы
systemctl list-units --type=service --state=running | grep -E "dedato|python|backend|web"
systemctl list-units --type=service --all | grep -E "dedato|python|backend|web"
```

## 2. Поиск рабочей директории процесса

```bash
# Найдите PID процесса Python
PID=$(ps aux | grep -E "uvicorn|gunicorn|python.*main" | grep -v grep | awk '{print $2}' | head -1)

# Если нашли PID, проверьте рабочую директорию
if [ ! -z "$PID" ]; then
    echo "PID процесса: $PID"
    ls -la /proc/$PID/cwd
    readlink /proc/$PID/cwd
    cat /proc/$PID/cmdline | tr '\0' ' '
fi
```

## 3. Поиск логов приложения

```bash
# Стандартные места для логов
find /var/log -name "*dedato*" -o -name "*backend*" -o -name "*python*" 2>/dev/null
find /home -name "*.log" -type f 2>/dev/null | head -20
find /root -name "*.log" -type f 2>/dev/null | head -20

# Проверьте journalctl (systemd логи)
journalctl -u *dedato* --no-pager | tail -50
journalctl -u *backend* --no-pager | tail -50
journalctl -u *python* --no-pager | tail -50

# Все сервисы systemd
systemctl list-units --type=service --all | grep -v "systemd\|dbus\|network"
```

## 4. Поиск конфигурационных файлов systemd

```bash
# Найдите unit файлы
find /etc/systemd/system -name "*.service" -type f | xargs grep -l "dedato\|python\|uvicorn" 2>/dev/null

# Покажите содержимое найденных unit файлов
find /etc/systemd/system -name "*.service" -type f -exec grep -l "dedato\|python\|uvicorn" {} \; | xargs cat
```

## 5. Поиск nginx/apache конфигурации

```bash
# Nginx
find /etc/nginx -name "*.conf" -type f | xargs grep -l "dedato" 2>/dev/null
cat /etc/nginx/sites-enabled/* 2>/dev/null | grep -A 10 -B 10 "dedato"

# Apache
find /etc/apache2 -name "*.conf" -type f | xargs grep -l "dedato" 2>/dev/null
```

## 6. Проверка истории команд

```bash
# История команд root
history | grep -E "python|uvicorn|gunicorn|cd|dedato|backend" | tail -30

# Проверьте .bash_history
cat /root/.bash_history | grep -E "python|uvicorn|gunicorn|cd|dedato|backend" | tail -30
```

## 7. Поиск кода по всей системе

```bash
# Поиск main.py (точка входа FastAPI)
find / -name "main.py" -type f 2>/dev/null | grep -v "site-packages\|__pycache__"

# Поиск models.py
find / -name "models.py" -type f 2>/dev/null | grep -v "site-packages\|__pycache__" | head -10

# Поиск alembic.ini
find / -name "alembic.ini" -type f 2>/dev/null | grep -v "site-packages\|__pycache__"
```

## 8. Проверка git репозиториев

```bash
# Найдите все .git директории
find /home -name ".git" -type d 2>/dev/null
find /root -name ".git" -type d 2>/dev/null

# Проверьте статус git в найденных репозиториях
for repo in $(find /home /root -name ".git" -type d 2>/dev/null); do
    echo "=== Репозиторий: $(dirname $repo) ==="
    cd $(dirname $repo) && git status 2>/dev/null | head -5
    echo ""
done
```

## 9. Анализ логов для поиска ошибок

```bash
# Проверьте системные логи
tail -100 /var/log/syslog | grep -i error
tail -100 /var/log/messages | grep -i error 2>/dev/null

# Проверьте логи systemd
journalctl -xe | tail -100

# Если есть конкретный сервис, проверьте его логи
# journalctl -u имя_сервиса -n 100 --no-pager
```

## 10. Проверка версии кода

```bash
# Если найдете код, проверьте версию
# cd /путь/к/коду
# git log --oneline -10
# git status
# cat requirements.txt | grep -E "fastapi|uvicorn|alembic"
```


