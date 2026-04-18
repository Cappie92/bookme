# Команды для настройки на боевом сервере

## Проблема: alembic не найден

### 1. Проверка структуры проекта

```bash
# Посмотрите структуру директории
ls -la /home/root/dedato

# Проверьте, есть ли поддиректории
ls -la /home/root/dedato/ | head -20

# Найдите все Python файлы и директории
find /home/root/dedato -name "*.py" -type f | head -10
find /home/root/dedato -name "requirements.txt" -type f
find /home/root/dedato -name "venv" -type d
find /home/root/dedato -name ".venv" -type d
find /home/root/dedato -name "env" -type d
```

### 2. Поиск виртуального окружения

```bash
# Проверьте, есть ли виртуальное окружение
ls -la /home/root/dedato/ | grep -E "venv|env|virtualenv"

# Если найдено виртуальное окружение, активируйте его
# Например, если есть venv:
source /home/root/dedato/venv/bin/activate

# Или если есть .venv:
source /home/root/dedato/.venv/bin/activate

# После активации проверьте alembic
python3 -m alembic --version
```

### 3. Установка alembic (если виртуального окружения нет)

```bash
# Вариант 1: Установка глобально (не рекомендуется)
pip3 install alembic

# Вариант 2: Создание виртуального окружения (рекомендуется)
cd /home/root/dedato
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt  # если есть requirements.txt
pip install alembic
```

### 4. Поиск backend директории

```bash
# Найдите файл main.py (обычно находится в backend)
find /home/root/dedato -name "main.py" -type f

# Найдите директорию с models.py
find /home/root/dedato -name "models.py" -type f

# Найдите директорию с database.py
find /home/root/dedato -name "database.py" -type f
```

### 5. Проверка текущей структуры

```bash
# Покажите структуру директорий
tree -L 2 /home/root/dedato 2>/dev/null || find /home/root/dedato -maxdepth 2 -type d
```

---

## После нахождения backend директории

Когда найдете где находится backend код:

```bash
# Перейдите в директорию backend
cd /путь/к/backend

# Активируйте виртуальное окружение (если есть)
source ../venv/bin/activate  # или путь к вашему venv

# Проверьте alembic
python3 -m alembic current
```

---

## Альтернативный вариант: использование alembic из requirements.txt

Если у вас есть requirements.txt:

```bash
# Найдите requirements.txt
find /home/root/dedato -name "requirements.txt" -type f

# Установите зависимости
pip3 install -r /путь/к/requirements.txt

# Или если есть виртуальное окружение
source venv/bin/activate
pip install -r requirements.txt
```


