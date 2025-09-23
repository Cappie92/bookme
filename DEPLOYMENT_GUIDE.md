# 🚀 Руководство по деплою Appointo

> **ВАЖНО**: Это внутренний документ для безопасного деплоя. Следуйте инструкциям строго по порядку.

## 📋 Обзор проекта

**Текущая конфигурация:**
- **База данных**: SQLite (`bookme.db`)
- **Миграции**: Alembic (36 миграций)
- **Контейнеризация**: Docker Compose
- **Среда разработки**: `docker-compose.yml`
- **Продакшн**: `docker-compose.prod.yml`
- **CI/CD**: GitHub Actions

---

## 🔄 Процедура деплоя (пошагово)

### **ШАГ 1: Подготовка к деплою**

**Что делает:** Проверяем текущее состояние системы и готовимся к обновлению.

**Алгоритм:**
```bash
# 1.1. Переходим в корень проекта
cd /path/to/appointo

# 1.2. Проверяем статус Git
git status
git log --oneline -5

# 1.3. Проверяем текущие контейнеры
docker-compose ps

# 1.4. Проверяем состояние базы данных
docker-compose exec backend ls -la /app/
docker-compose exec backend sqlite3 /app/bookme.db ".tables" | head -10
```

**Проверки:**
- ✅ Нет незакоммиченных изменений
- ✅ Все контейнеры работают
- ✅ База данных доступна

---

### **ШАГ 2: Создание бэкапа базы данных**

**Что делает:** Создаем резервную копию базы данных перед любыми изменениями.

**Алгоритм:**
```bash
# 2.1. Создаем директорию для бэкапов
mkdir -p backups

# 2.2. Создаем бэкап базы данных
docker-compose exec backend cp /app/bookme.db /app/backup_$(date +%Y%m%d_%H%M%S).db

# 2.3. Копируем бэкап на хост
docker-compose cp backend:/app/backup_$(date +%Y%m%d_%H%M%S).db ./backups/

# 2.4. Проверяем размер бэкапа
ls -lh backups/backup_*.db
```

**Проверки:**
- ✅ Бэкап создан и имеет размер > 0
- ✅ Бэкап скопирован в директорию `backups/`

---

### **ШАГ 3: Проверка миграций**

**Что делает:** Проверяем, есть ли новые миграции и их совместимость.

**Алгоритм:**
```bash
# 3.1. Проверяем текущую версию миграций
docker-compose exec backend alembic current

# 3.2. Проверяем доступные миграции
docker-compose exec backend alembic heads

# 3.3. Проверяем, есть ли новые миграции
docker-compose exec backend alembic show head

# 3.4. Если есть новые миграции, проверяем их содержимое
docker-compose exec backend alembic show --sql head
```

**Проверки:**
- ✅ Текущая версия миграций известна
- ✅ Новые миграции проанализированы
- ✅ Нет конфликтующих изменений

---

### **ШАГ 4: Применение миграций (если есть)**

**Что делает:** Безопасно применяем изменения схемы базы данных.

**Алгоритм:**
```bash
# 4.1. Применяем миграции (только если есть новые)
docker-compose exec backend alembic upgrade head

# 4.2. Проверяем, что миграции применились
docker-compose exec backend alembic current

# 4.3. Проверяем целостность базы данных
docker-compose exec backend sqlite3 /app/bookme.db "PRAGMA integrity_check;"
```

**Проверки:**
- ✅ Миграции применены успешно
- ✅ База данных прошла проверку целостности
- ✅ Нет ошибок в логах

---

### **ШАГ 5: Обновление кода приложения**

**Что делает:** Обновляем код приложения, сохраняя данные в volumes.

**Алгоритм:**
```bash
# 5.1. Останавливаем контейнеры (БЕЗ удаления volumes!)
docker-compose down

# 5.2. Обновляем код из Git
git pull origin main

# 5.3. Пересобираем образы
docker-compose build --no-cache

# 5.4. Запускаем обновленные контейнеры
docker-compose up -d

# 5.5. Проверяем статус
docker-compose ps
```

**Проверки:**
- ✅ Контейнеры запустились без ошибок
- ✅ Все сервисы доступны
- ✅ База данных не повреждена

---

### **ШАГ 6: Проверка работоспособности**

**Что делает:** Убеждаемся, что приложение работает корректно после обновления.

**Алгоритм:**
```bash
# 6.1. Проверяем логи backend
docker-compose logs backend --tail=50

# 6.2. Проверяем логи frontend
docker-compose logs frontend --tail=50

# 6.3. Проверяем доступность API
curl -f http://localhost:8000/health || echo "API недоступен"

# 6.4. Проверяем доступность frontend
curl -f http://localhost:5173 || echo "Frontend недоступен"

# 6.5. Проверяем базу данных
docker-compose exec backend sqlite3 /app/bookme.db "SELECT COUNT(*) FROM users;"
```

**Проверки:**
- ✅ Нет критических ошибок в логах
- ✅ API отвечает на запросы
- ✅ Frontend загружается
- ✅ База данных содержит данные

---

### **ШАГ 7: Продакшн деплой (если нужно)**

**Что делает:** Деплоим обновления на продакшн сервер.

**Алгоритм:**
```bash
# 7.1. Запускаем скрипт деплоя
./scripts/deploy.sh prod

# 7.2. Или вручную через GitHub Actions
# - Делаем push в main ветку
# - Проверяем статус в GitHub Actions
# - Убеждаемся, что деплой прошел успешно
```

**Проверки:**
- ✅ Продакшн деплой завершен успешно
- ✅ Приложение доступно по продакшн URL
- ✅ Все функции работают

---

## 🚨 Процедура отката (если что-то пошло не так)

### **Экстренный откат:**

```bash
# 1. Останавливаем контейнеры
docker-compose down

# 2. Восстанавливаем предыдущую версию кода
git checkout HEAD~1

# 3. Восстанавливаем базу данных из бэкапа
docker-compose up -d
docker-compose exec backend cp /app/backup_YYYYMMDD_HHMMSS.db /app/bookme.db

# 4. Перезапускаем контейнеры
docker-compose restart
```

---

## 📊 Мониторинг после деплоя

### **Проверки в течение 1 часа:**

1. **Логи приложения:**
   ```bash
   docker-compose logs -f backend
   docker-compose logs -f frontend
   ```

2. **Метрики производительности:**
   ```bash
   docker stats
   ```

3. **Проверка функциональности:**
   - Вход в систему
   - Создание записей
   - Работа календаря
   - API endpoints

---

## 🔧 Полезные команды

### **Управление контейнерами:**
```bash
# Просмотр статуса
docker-compose ps

# Просмотр логов
docker-compose logs [service_name]

# Перезапуск сервиса
docker-compose restart [service_name]

# Остановка всех сервисов
docker-compose down

# Остановка с удалением volumes (ОСТОРОЖНО!)
docker-compose down -v
```

### **Управление базой данных:**
```bash
# Подключение к базе
docker-compose exec backend sqlite3 /app/bookme.db

# Создание бэкапа
docker-compose exec backend cp /app/bookme.db /app/backup_$(date +%Y%m%d_%H%M%S).db

# Проверка целостности
docker-compose exec backend sqlite3 /app/bookme.db "PRAGMA integrity_check;"
```

### **Управление миграциями:**
```bash
# Текущая версия
docker-compose exec backend alembic current

# Применение миграций
docker-compose exec backend alembic upgrade head

# Откат миграции (ОСТОРОЖНО!)
docker-compose exec backend alembic downgrade -1

# Создание новой миграции
docker-compose exec backend alembic revision --autogenerate -m "описание изменений"
```

---

## ⚠️ Важные предупреждения

1. **НИКОГДА не используйте `docker-compose down -v`** - это удалит все данные!
2. **Всегда создавайте бэкап** перед применением миграций.
3. **Проверяйте миграции** перед применением в продакшне.
4. **Тестируйте изменения** в dev среде перед продакшном.
5. **Мониторьте логи** после каждого деплоя.

---

## 📝 Примечание про Docker Compose 1.29.2 (на прод-сервере)

На продакшн-сервере установлена версия docker-compose 1.29.2. В этой версии при использовании некоторых сочетаний флагов (например, `--build --no-cache`) команда `docker-compose up` может выводить справку вместо выполнения.

В таком случае используйте простой запуск БЕЗ флагов:

```bash
docker-compose -f docker-compose.prod.yml up -d
```

Если требуется принудительное пересоздание контейнеров без кэша, сначала удалите образы, а затем запустите без флагов:

```bash
docker-compose -f docker-compose.prod.yml down
docker rmi dedato_frontend:latest dedato_backend:latest || true
docker-compose -f docker-compose.prod.yml up -d
```

Альтернатива (если обязательно нужно пересобрать):

```bash
docker-compose -f docker-compose.prod.yml build --no-cache
docker-compose -f docker-compose.prod.yml up -d --force-recreate
```

---

## 📞 Контакты для экстренных случаев

- **Разработчик**: [Ваш контакт]
- **DevOps**: [Контакт DevOps]
- **Мониторинг**: [URL мониторинга]

---

**Последнее обновление:** $(date)
**Версия документа:** 1.0
