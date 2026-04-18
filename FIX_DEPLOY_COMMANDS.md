# Исправление команд для деплоя

## Проблема
В инструкции указан путь `/path/to/backend`, который нужно заменить на реальный путь на вашем сервере.

## Решение

### 1. Найдите путь к backend директории

```bash
# Вы находитесь в /home/root/dedato
# Проверьте структуру проекта
ls -la

# Обычно backend находится в:
# - /home/root/dedato/backend
# - или /home/root/dedato/back
# - или просто в текущей директории

# Проверьте, есть ли директория backend
ls -la | grep backend
```

### 2. Правильные команды для вашего сервера

Если backend находится в `/home/root/dedato/backend`:

```bash
cd /home/root/dedato/backend
python3 -m alembic current
```

Если backend находится в текущей директории (т.е. `/home/root/dedato`):

```bash
cd /home/root/dedato
python3 -m alembic current
```

### 3. Проверка структуры проекта

```bash
# Посмотрите структуру директорий
find /home/root/dedato -name "alembic.ini" -type f 2>/dev/null

# Или найдите файл alembic.ini
find /home/root/dedato -name "alembic.ini" 2>/dev/null
```

Где находится `alembic.ini`, там и нужно выполнять команды alembic.


