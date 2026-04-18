# Поиск кода проекта на сервере

## Проблема: директория /home/root/dedato пуста (кроме bookme.db)

### 1. Проверка, что действительно есть в директории

```bash
# Проверьте все файлы, включая скрытые
ls -la /home/root/dedato/

# Проверьте размер директории
du -sh /home/root/dedato

# Покажите только файлы (не директории)
find /home/root/dedato -maxdepth 1 -type f

# Покажите только директории
find /home/root/dedato -maxdepth 1 -type d
```

### 2. Поиск проекта в других местах

```bash
# Поиск по всей системе (может занять время)
find /home -name "main.py" -type f 2>/dev/null
find /home -name "models.py" -type f 2>/dev/null
find /home -name "alembic.ini" -type f 2>/dev/null
find /home -name "requirements.txt" -type f 2>/dev/null

# Поиск в корневой директории
find /root -name "*.py" -type f 2>/dev/null | head -20

# Поиск запущенных процессов Python
ps aux | grep python | grep -v grep
```

### 3. Проверка, где запущено приложение

```bash
# Проверьте запущенные процессы
ps aux | grep -E "python|uvicorn|gunicorn|fastapi"

# Проверьте открытые порты
netstat -tulpn | grep -E "8000|3000|5173"
# или
ss -tulpn | grep -E "8000|3000|5173"

# Проверьте systemd сервисы
systemctl list-units | grep -E "dedato|python|backend"
```

### 4. Поиск конфигурационных файлов

```bash
# Найдите .env файлы
find /home -name ".env" -type f 2>/dev/null
find /root -name ".env" -type f 2>/dev/null

# Найдите systemd unit файлы
find /etc/systemd/system -name "*dedato*" -o -name "*backend*" 2>/dev/null
find /etc/systemd/system -name "*.service" -type f 2>/dev/null | xargs grep -l "dedato\|python" 2>/dev/null
```

### 5. Проверка истории команд

```bash
# Проверьте историю команд (может показать где запускали проект)
history | grep -E "python|cd|dedato|backend" | tail -20
```

---

## Решение: Загрузка кода на сервер

Если код действительно отсутствует, нужно загрузить его на сервер:

### Вариант 1: Через git (если есть репозиторий)

```bash
cd /home/root/dedato
git clone <ваш_репозиторий> .
# или
git pull origin main
```

### Вариант 2: Через scp/rsync с локальной машины

```bash
# На вашей локальной машине (Mac)
cd /Users/s.devyatov/DeDato
scp -r backend root@ваш_сервер:/home/root/dedato/
scp -r frontend root@ваш_сервер:/home/root/dedato/
```

### Вариант 3: Через архив

```bash
# На локальной машине создайте архив
cd /Users/s.devyatov/DeDato
tar -czf deploy.tar.gz backend/ frontend/

# Загрузите на сервер
scp deploy.tar.gz root@ваш_сервер:/home/root/dedato/

# На сервере распакуйте
cd /home/root/dedato
tar -xzf deploy.tar.gz
```

---

## После загрузки кода

1. Установите зависимости:
   ```bash
   cd /home/root/dedato/backend
   pip3 install -r requirements.txt
   ```

2. Примените миграции:
   ```bash
   cd /home/root/dedato/backend
   python3 -m alembic upgrade head
   ```


