# Отладка: Почему работает старая версия сайта

## Проблема
- Сайт https://dedato.ru/ открывается и работает
- Но это старая версия кода
- Директория `/home/root/dedato` пуста (кроме `bookme.db`)
- Нужно найти где запущено приложение и почему используется старая версия

## Шаг 1: Загрузите скрипт на сервер

На вашем Mac выполните:

```bash
cd /Users/s.devyatov/DeDato
scp backend/scripts/find_running_app.sh root@ваш_сервер:/tmp/
```

Или скопируйте содержимое скрипта вручную на сервер.

## Шаг 2: Запустите скрипт на сервере

На сервере выполните:

```bash
# Сделайте скрипт исполняемым
chmod +x /tmp/find_running_app.sh

# Запустите скрипт и сохраните вывод
/tmp/find_running_app.sh > /tmp/app_analysis.txt 2>&1

# Просмотрите результаты
cat /tmp/app_analysis.txt
```

## Шаг 3: Альтернативный вариант - выполните команды вручную

Если скрипт не работает, выполните команды по порядку:

### 3.1. Найдите запущенный процесс

```bash
# Найдите процессы Python
ps aux | grep python | grep -v grep

# Найдите процессы uvicorn/gunicorn
ps aux | grep -E "uvicorn|gunicorn" | grep -v grep

# Найдите открытые порты
netstat -tulpn | grep -E ":80|:443|:8000"
```

### 3.2. Найдите рабочую директорию процесса

```bash
# Замените PID на реальный PID из предыдущей команды
PID=<найденный_PID>
ls -la /proc/$PID/cwd
readlink /proc/$PID/cwd
cat /proc/$PID/cmdline | tr '\0' ' '
```

### 3.3. Найдите systemd сервисы

```bash
# Список всех сервисов
systemctl list-units --type=service --all | grep -E "dedato|python|backend|web"

# Найдите unit файлы
find /etc/systemd/system -name "*.service" -type f | xargs grep -l "dedato\|python\|uvicorn" 2>/dev/null

# Просмотрите содержимое найденных unit файлов
find /etc/systemd/system -name "*.service" -type f -exec grep -l "dedato\|python\|uvicorn" {} \; | xargs cat
```

### 3.4. Найдите код приложения

```bash
# Поиск main.py
find /home /root -name "main.py" -type f 2>/dev/null | grep -v "site-packages"

# Поиск models.py
find /home /root -name "models.py" -type f 2>/dev/null | grep -v "site-packages"

# Поиск alembic.ini
find /home /root -name "alembic.ini" -type f 2>/dev/null
```

### 3.5. Проверьте логи

```bash
# Логи systemd
journalctl -n 100 --no-pager | grep -i error

# Найдите .log файлы
find /home /root /var/log -name "*.log" -type f 2>/dev/null | head -20
```

### 3.6. Проверьте nginx конфигурацию

```bash
# Найдите конфигурацию nginx
find /etc/nginx -name "*.conf" -type f | xargs grep -l "dedato" 2>/dev/null

# Просмотрите конфигурацию
cat /etc/nginx/sites-enabled/* 2>/dev/null | grep -A 10 -B 10 "dedato"
```

## Шаг 4: Анализ результатов

После выполнения команд, соберите следующую информацию:

1. **Где запущено приложение?**
   - Рабочая директория процесса
   - Команда запуска

2. **Как запущено приложение?**
   - systemd сервис?
   - Вручную?
   - Через какой процесс-менеджер?

3. **Где находится код?**
   - Путь к main.py
   - Путь к models.py
   - Есть ли git репозиторий?

4. **Какая версия кода?**
   - Дата последнего коммита
   - Есть ли незакоммиченные изменения?

5. **Есть ли ошибки в логах?**
   - Ошибки при запуске
   - Ошибки при работе
   - Ошибки миграций

## Шаг 5: Возможные причины и решения

### Причина 1: Код в другой директории
**Решение:** Найти код и обновить его там, или переместить в `/home/root/dedato`

### Причина 2: Старая версия в git
**Решение:** 
```bash
cd /путь/к/коду
git pull origin main
# или
git fetch && git reset --hard origin/main
```

### Причина 3: Не применены миграции
**Решение:**
```bash
cd /путь/к/backend
python3 -m alembic upgrade head
```

### Причина 4: Кэш старой версии
**Решение:** Перезапустить приложение
```bash
systemctl restart имя_сервиса
# или
pkill -f uvicorn
# и запустить заново
```

### Причина 5: Неправильная конфигурация nginx
**Решение:** Проверить, что nginx указывает на правильную директорию

## Шаг 6: После исправления

1. **Создайте резервную копию текущего состояния:**
   ```bash
   # Резервная копия базы данных (уже сделана)
   cp bookme.db bookme.db.backup_$(date +%Y%m%d_%H%M%S)
   
   # Резервная копия кода (если найдете)
   cd /путь/к/коду
   tar -czf /tmp/code_backup_$(date +%Y%m%d_%H%M%S).tar.gz .
   ```

2. **Обновите код:**
   - Загрузите новую версию
   - Примените миграции
   - Перезапустите приложение

3. **Проверьте работу:**
   - Откройте https://dedato.ru/
   - Проверьте, что версия обновилась
   - Проверьте логи на ошибки

## Что делать дальше

После выполнения скрипта или команд, пришлите мне:
1. Вывод скрипта `/tmp/app_analysis.txt` или результаты команд
2. Информацию о найденном процессе (PID, рабочая директория)
3. Информацию о найденном коде (путь, версия git)
4. Ошибки из логов (если есть)

Я помогу определить причину и исправить проблему.


