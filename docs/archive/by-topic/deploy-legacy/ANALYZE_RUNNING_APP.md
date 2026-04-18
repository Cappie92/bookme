# Анализ запущенного приложения

## Найден процесс:
- **PID:** 13783
- **Команда:** `/usr/local/bin/python3.9 /usr/local/bin/uvicorn main:app --host 0.0.0.0 --port 8000 --reload`
- **Запущен:** 24 декабря
- **Время работы:** 5371 часов CPU

## Выполните эти команды для полного анализа:

```bash
# 1. Найдите рабочую директорию процесса
PID=13783
echo "=== Рабочая директория процесса ==="
readlink /proc/$PID/cwd
echo ""

# 2. Полная команда запуска
echo "=== Команда запуска ==="
cat /proc/$PID/cmdline | tr '\0' ' '
echo ""
echo ""

# 3. Переменные окружения процесса
echo "=== Переменные окружения (первые 20 строк) ==="
cat /proc/$PID/environ | tr '\0' '\n' | head -20
echo ""

# 4. Найдите main.py в рабочей директории
WORK_DIR=$(readlink /proc/$PID/cwd)
echo "=== Рабочая директория: $WORK_DIR ==="
ls -la $WORK_DIR | head -20
echo ""

# 5. Проверьте, есть ли там main.py
echo "=== Проверка main.py ==="
ls -la $WORK_DIR/main.py 2>/dev/null || echo "main.py не найден в рабочей директории"
echo ""

# 6. Проверьте git статус (если есть)
echo "=== Git статус ==="
cd $WORK_DIR 2>/dev/null && git status 2>/dev/null | head -10 || echo "Git репозиторий не найден"
echo ""

# 7. Проверьте дату последнего изменения файлов
echo "=== Последние изменения файлов ==="
find $WORK_DIR -name "*.py" -type f -mtime -30 2>/dev/null | head -10
echo ""

# 8. Найдите systemd сервисы
echo "=== Systemd сервисы ==="
systemctl list-units --type=service --all | grep -E "dedato|python|backend|web|uvicorn"
echo ""

# 9. Найдите unit файлы
echo "=== Unit файлы ==="
find /etc/systemd/system -name "*.service" -type f 2>/dev/null | while read f; do
    grep -q "uvicorn\|main:app\|$WORK_DIR" "$f" 2>/dev/null && echo "Найден: $f"
done
echo ""

# 10. Проверьте логи
echo "=== Логи (последние 20 строк) ==="
journalctl -n 20 --no-pager 2>/dev/null | tail -20
echo ""

# 11. Проверьте nginx конфигурацию
echo "=== Nginx конфигурация ==="
find /etc/nginx -name "*.conf" -type f 2>/dev/null | while read f; do
    grep -q "dedato\|8000\|localhost" "$f" 2>/dev/null && echo "Найден: $f"
done
```

## Или выполните все сразу:

```bash
PID=13783
WORK_DIR=$(readlink /proc/$PID/cwd)
echo "=== АНАЛИЗ ПРИЛОЖЕНИЯ ==="
echo "PID: $PID"
echo "Рабочая директория: $WORK_DIR"
echo "Команда: $(cat /proc/$PID/cmdline | tr '\0' ' ')"
echo ""
echo "=== Содержимое рабочей директории ==="
ls -la $WORK_DIR | head -20
echo ""
echo "=== Git статус ==="
cd $WORK_DIR 2>/dev/null && git status 2>/dev/null | head -10 || echo "Git не найден"
echo ""
echo "=== Последние изменения (30 дней) ==="
find $WORK_DIR -name "*.py" -type f -mtime -30 2>/dev/null | head -10
echo ""
echo "=== Systemd сервисы ==="
systemctl list-units --type=service --all | grep -E "dedato|python|backend|web|uvicorn" || echo "Не найдено"
```


