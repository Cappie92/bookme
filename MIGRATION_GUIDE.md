# 🔄 Руководство по миграциям базы данных

> **ВАЖНО**: Все изменения схемы БД должны проходить через миграции Alembic

## 📋 Текущее состояние

**База данных:** SQLite (`bookme.db`)
**Миграции:** Alembic (36 миграций)
**Текущая версия:** Проверить командой `alembic current`

---

## 🚀 Создание новой миграции

### **Шаг 1: Подготовка**

**Что делает:** Подготавливаем среду для создания миграции.

**Алгоритм:**
```bash
# 1.1. Переходим в директорию backend
cd backend

# 1.2. Проверяем текущую версию миграций
docker-compose exec backend alembic current

# 1.3. Проверяем, что все контейнеры запущены
docker-compose ps
```

### **Шаг 2: Создание миграции**

**Что делает:** Создаем новую миграцию на основе изменений в моделях.

**Алгоритм:**
```bash
# 2.1. Создаем миграцию с автогенерацией
docker-compose exec backend alembic revision --autogenerate -m "описание изменений"

# 2.2. Проверяем созданный файл миграции
ls -la alembic/versions/ | tail -1

# 2.3. Просматриваем содержимое миграции
cat alembic/versions/[имя_файла].py
```

**Примеры описаний:**
- `"add client_name to bookings"`
- `"add service_duration and service_price fields"`
- `"create master_schedules table"`
- `"add validation for booking conflicts"`

### **Шаг 3: Проверка миграции**

**Что делает:** Проверяем корректность созданной миграции.

**Алгоритм:**
```bash
# 3.1. Просматриваем SQL, который будет выполнен
docker-compose exec backend alembic show --sql head

# 3.2. Проверяем, что миграция корректна
docker-compose exec backend alembic check

# 3.3. Если нужно, редактируем файл миграции
# nano alembic/versions/[имя_файла].py
```

**Проверки:**
- ✅ Миграция содержит только нужные изменения
- ✅ Нет конфликтующих операций
- ✅ Все индексы и ограничения корректны

---

## 🔄 Применение миграций

### **Шаг 1: Создание бэкапа**

**Что делает:** Создаем резервную копию перед применением миграций.

**Алгоритм:**
```bash
# 1.1. Создаем бэкап
docker-compose exec backend cp /app/bookme.db /app/backup_$(date +%Y%m%d_%H%M%S).db

# 1.2. Копируем бэкап на хост
docker-compose cp backend:/app/backup_$(date +%Y%m%d_%H%M%S).db ../backups/

# 1.3. Проверяем размер бэкапа
ls -lh ../backups/backup_*.db | tail -1
```

### **Шаг 2: Применение миграций**

**Что делает:** Безопасно применяем миграции к базе данных.

**Алгоритм:**
```bash
# 2.1. Применяем миграции
docker-compose exec backend alembic upgrade head

# 2.2. Проверяем, что миграции применились
docker-compose exec backend alembic current

# 2.3. Проверяем целостность базы данных
docker-compose exec backend sqlite3 /app/bookme.db "PRAGMA integrity_check;"
```

**Проверки:**
- ✅ Миграции применены успешно
- ✅ База данных прошла проверку целостности
- ✅ Нет ошибок в логах

---

## 🔙 Откат миграций

### **Шаг 1: Проверка возможности отката**

**Что делает:** Проверяем, можно ли безопасно откатить миграции.

**Алгоритм:**
```bash
# 1.1. Просматриваем историю миграций
docker-compose exec backend alembic history

# 1.2. Проверяем, что откат безопасен
docker-compose exec backend alembic show --sql -1
```

### **Шаг 2: Откат миграций**

**Что делает:** Откатываем последнюю миграцию (если безопасно).

**Алгоритм:**
```bash
# 2.1. Откатываем на одну миграцию назад
docker-compose exec backend alembic downgrade -1

# 2.2. Проверяем текущую версию
docker-compose exec backend alembic current

# 2.3. Проверяем целостность базы данных
docker-compose exec backend sqlite3 /app/bookme.db "PRAGMA integrity_check;"
```

**⚠️ ВНИМАНИЕ:** Откат может привести к потере данных!

---

## 🔍 Диагностика проблем

### **Проблема: Конфликт миграций**

**Симптомы:**
- Ошибка "Multiple heads detected"
- Миграции не применяются

**Решение:**
```bash
# 1. Просматриваем конфликтующие миграции
docker-compose exec backend alembic heads

# 2. Создаем merge миграцию
docker-compose exec backend alembic merge -m "merge heads" [head1] [head2]

# 3. Применяем merge миграцию
docker-compose exec backend alembic upgrade head
```

### **Проблема: Поврежденная база данных**

**Симптомы:**
- Ошибка "database is locked"
- Ошибка "database disk image is malformed"

**Решение:**
```bash
# 1. Останавливаем приложение
docker-compose down

# 2. Восстанавливаем из бэкапа
docker-compose up -d
docker-compose exec backend cp /app/backup_YYYYMMDD_HHMMSS.db /app/bookme.db

# 3. Проверяем целостность
docker-compose exec backend sqlite3 /app/bookme.db "PRAGMA integrity_check;"
```

### **Проблема: Миграция не применяется**

**Симптомы:**
- Миграция создана, но не применяется
- Ошибка "Target database is not up to date"

**Решение:**
```bash
# 1. Проверяем текущую версию
docker-compose exec backend alembic current

# 2. Принудительно применяем миграции
docker-compose exec backend alembic upgrade head

# 3. Если не помогает, сбрасываем версию
docker-compose exec backend alembic stamp head
```

---

## 📊 Мониторинг миграций

### **Полезные команды:**

```bash
# Текущая версия
docker-compose exec backend alembic current

# История миграций
docker-compose exec backend alembic history

# Доступные миграции
docker-compose exec backend alembic heads

# Просмотр SQL миграции
docker-compose exec backend alembic show --sql head

# Проверка целостности
docker-compose exec backend sqlite3 /app/bookme.db "PRAGMA integrity_check;"

# Размер базы данных
docker-compose exec backend ls -lh /app/bookme.db
```

---

## ⚠️ Важные правила

1. **Всегда создавайте бэкап** перед применением миграций
2. **Тестируйте миграции** в dev среде перед продакшном
3. **Не редактируйте** уже примененные миграции
4. **Проверяйте целостность** после каждой миграции
5. **Документируйте** сложные миграции

---

## 📞 Поддержка

При возникновении проблем:
1. Проверьте логи: `docker-compose logs backend`
2. Создайте бэкап
3. Обратитесь к разработчику

---

**Последнее обновление:** $(date)
**Версия:** 1.0
