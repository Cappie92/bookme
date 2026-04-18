# Диагностика проблем на сервере

## Проблема: команды не возвращают результаты

### 1. Проверка текущей директории и прав доступа

```bash
# Проверьте, где вы находитесь
pwd

# Проверьте, что находится в текущей директории (включая скрытые файлы)
ls -la

# Проверьте права доступа
ls -la . | head -5

# Проверьте размер директории
du -sh /home/root/dedato
```

### 2. Поиск проекта в других местах

```bash
# Поиск по всей системе (может занять время)
find /home -name "bookme.db" -type f 2>/dev/null
find /home -name "models.py" -type f 2>/dev/null
find /home -name "main.py" -type f 2>/dev/null

# Поиск в корневой директории пользователя
find ~ -name "*.db" -type f 2>/dev/null | head -10
find ~ -name "*.py" -type f 2>/dev/null | head -10
```

### 3. Проверка, запущен ли проект

```bash
# Проверьте запущенные процессы Python
ps aux | grep python

# Проверьте, какие порты заняты
netstat -tulpn | grep python
# или
ss -tulpn | grep python

# Проверьте логи приложения
find /home -name "*.log" -type f 2>/dev/null | head -10
```

### 4. Проверка структуры директории dedato

```bash
# Покажите все файлы и директории (включая скрытые)
ls -la /home/root/dedato/

# Покажите только директории
ls -d /home/root/dedato/*/

# Покажите дерево структуры (если установлено tree)
tree /home/root/dedato 2>/dev/null || find /home/root/dedato -maxdepth 2 -type d
```

### 5. Поиск конфигурационных файлов

```bash
# Найдите .env файлы
find /home/root/dedato -name ".env" -type f 2>/dev/null

# Найдите конфигурационные файлы
find /home/root/dedato -name "*.ini" -type f 2>/dev/null
find /home/root/dedato -name "*.conf" -type f 2>/dev/null
find /home/root/dedato -name "*.yaml" -type f 2>/dev/null
find /home/root/dedato -name "*.yml" -type f 2>/dev/null
```

### 6. Проверка, где находится база данных

```bash
# Вы уже знаете, что bookme.db находится в /home/root/dedato
# Проверьте, что еще там есть
cd /home/root/dedato
ls -la

# Проверьте размер всех файлов
du -sh /home/root/dedato/*
```

---

## Возможные причины отсутствия результатов

1. **Проект находится в другой директории** - нужно найти где
2. **Файлы еще не загружены на сервер** - нужно загрузить код
3. **Права доступа** - возможно, нужны другие права
4. **Структура проекта отличается** - возможно, backend находится в другом месте

---

## Что делать дальше

Выполните эти команды по порядку и пришлите результаты:

```bash
# 1. Проверка текущей директории
pwd
ls -la

# 2. Поиск Python файлов
find /home/root -name "*.py" -type f 2>/dev/null | head -20

# 3. Проверка размера директории
du -sh /home/root/dedato
ls -lh /home/root/dedato
```


