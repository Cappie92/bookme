# 📋 Подробная инструкция по деплою

## Что означает "после успешного push на сервер"

Это означает, что вы:
1. **Локально** (на вашем компьютере) отправили изменения в GitHub через `git push`
2. **На сервере** (где работает ваше приложение) нужно:
   - Подключиться к серверу по SSH
   - Получить новые изменения из GitHub (`git pull`)
   - Применить миграции базы данных
   - Запустить скрипты настройки
   - Перезапустить сервисы

---

## 🔄 Полный процесс деплоя (пошагово)

### Этап 1: Локально (на вашем компьютере)

#### 1.1. Отправка изменений в GitHub

```bash
cd /Users/s.devyatov/DeDato
git push origin main
```

**Что это делает:** Отправляет все ваши коммиты в удаленный репозиторий GitHub.

**Как проверить успех:**
- Команда должна завершиться без ошибок
- Можно проверить на GitHub.com, что коммиты появились

---

### Этап 2: На сервере (где работает приложение)

#### 2.1. Подключение к серверу

```bash
# Подключитесь к серверу по SSH
ssh ваш_пользователь@ваш_сервер

# Например:
ssh root@193.160.208.206
# или
ssh user@dedato.ru
```

**Что это делает:** Открывает терминал на сервере, где работает ваше приложение.

---

#### 2.2. Переход в директорию проекта

```bash
# Перейдите в директорию, где находится проект на сервере
cd /path/to/dedato

# Например:
cd /var/www/dedato
# или
cd ~/dedato
```

**Что это делает:** Переходит в папку с вашим проектом на сервере.

---

#### 2.3. Получение новых изменений из GitHub

```bash
# Получите последние изменения из GitHub
git pull origin main
```

**Что это делает:** 
- Скачивает все новые коммиты из GitHub
- Обновляет файлы на сервере до последней версии

**Как проверить успех:**
- Должно появиться сообщение типа "Updating..." или "Already up to date"
- Файлы на сервере обновятся

---

#### 2.4. Применение миграции базы данных

```bash
# Перейдите в директорию backend
cd backend

# Примените миграции
python3 -m alembic upgrade head
```

**Что это делает:**
- Обновляет структуру базы данных
- Добавляет новые поля `display_name` и `display_order` в таблицы
- Заполняет существующие записи значениями по умолчанию

**Как проверить успех:**
- Должно появиться сообщение "INFO [alembic.runtime.migration] Running upgrade..."
- В конце должно быть "INFO [alembic.runtime.migration] Context impl SQLiteImpl."

**Если ошибка:**
- Проверьте, что база данных `bookme.db` существует
- Проверьте права доступа к файлу базы данных

---

#### 2.5. Создание плана AlwaysFree

```bash
# Убедитесь, что вы в директории backend
cd backend

# Запустите скрипт создания плана AlwaysFree
python3 scripts/create_always_free_plan.py
```

**Что это делает:**
- Создает план подписки "AlwaysFree" как копию Premium
- Делает его скрытым от покупки (`is_active = False`)

**Как проверить успех:**
- Должно появиться сообщение "✅ План AlwaysFree создан" или "✅ План AlwaysFree обновлен"

**Если план уже существует:**
- Скрипт обновит его, это нормально

---

#### 2.6. Настройка тестовых аккаунтов (опционально)

```bash
# Убедитесь, что вы в директории backend
cd backend

# Запустите скрипт настройки тестовых аккаунтов
python3 scripts/setup_test_accounts.py
```

**Что это делает:**
- Зачисляет 1 000 000 рублей на баланс каждого тестового аккаунта
- Создает реальные подписки для указанных тарифов

**Как проверить успех:**
- Должно появиться "✅ Все тестовые аккаунты настроены!"
- Для каждого аккаунта должно быть "✓ Баланс зачислен" и "✓ Подписка создана"

**Если ошибка:**
- Проверьте, что тестовые аккаунты существуют в базе данных
- Проверьте, что планы подписки (Free, Basic, Pro, Premium) существуют

---

#### 2.7. Перезапуск сервисов

**Вариант A: Если используете Docker Compose**

```bash
# Вернитесь в корневую директорию проекта
cd ..

# Перезапустите контейнеры
docker-compose -f docker-compose.prod.yml restart backend frontend

# Или пересоберите и перезапустите (если нужно)
docker-compose -f docker-compose.prod.yml up -d --build
```

**Вариант B: Если используете systemd (сервисы Linux)**

```bash
# Перезапустите backend
sudo systemctl restart dedato-backend

# Перезапустите frontend
sudo systemctl restart dedato-frontend

# Проверьте статус
sudo systemctl status dedato-backend
sudo systemctl status dedato-frontend
```

**Вариант C: Если запускаете вручную**

```bash
# Остановите процессы (Ctrl+C в терминалах, где они запущены)
# Затем запустите заново:

# Backend
cd backend
python3 -m uvicorn main:app --host 0.0.0.0 --port 8000 &

# Frontend (в другом терминале)
cd frontend
npm run build
npm run preview -- --host 0.0.0.0 --port 5173 &
```

**Что это делает:**
- Применяет все изменения в коде
- Перезагружает конфигурацию
- Начинает использовать новую версию приложения

---

### Этап 3: Проверка после деплоя

#### 3.1. Проверка миграции

```bash
# Проверьте, что поля добавлены
sqlite3 backend/bookme.db "PRAGMA table_info(subscription_plans);" | grep display_name
sqlite3 backend/bookme.db "PRAGMA table_info(service_functions);" | grep -E "display_name|display_order"
```

**Ожидаемый результат:**
- Должны появиться строки с `display_name` и `display_order`

---

#### 3.2. Проверка плана AlwaysFree

```bash
sqlite3 backend/bookme.db "SELECT id, name, display_name, is_active FROM subscription_plans WHERE name = 'AlwaysFree';"
```

**Ожидаемый результат:**
- Должна быть одна строка с `name = 'AlwaysFree'`, `is_active = 0`

---

#### 3.3. Проверка API

```bash
# Проверьте, что API работает
curl http://localhost:8000/api/balance/subscription-status \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Ожидаемый результат:**
- Должен вернуться JSON с данными подписки, включая `plan_display_name`

---

#### 3.4. Проверка в браузере

1. Откройте админку: `http://ваш_сервер/admin/functions`
2. Перейдите на вкладку "Планы подписки"
3. Проверьте, что:
   - План AlwaysFree виден в списке (с пометкой, что он скрыт)
   - При редактировании плана есть поле "Отображаемое название"
   - Функции тарифа отображаются в два столбца

4. Откройте ЛК мастера: `http://ваш_сервер/master/dashboard`
5. Проверьте, что:
   - Название тарифа отображается корректно
   - Статус подписки правильный

---

## ❓ Частые вопросы

### Q: Как узнать путь к проекту на сервере?

**A:** Обычно это:
- `/var/www/dedato` (для веб-серверов)
- `/home/пользователь/dedato` (для пользовательских проектов)
- Или спросите у администратора сервера

---

### Q: Как узнать, используется ли Docker или systemd?

**A:** Проверьте:

```bash
# Проверка Docker
docker ps | grep dedato

# Проверка systemd
systemctl list-units | grep dedato
```

---

### Q: Что делать, если миграция не применяется?

**A:** 
1. Проверьте, что вы в правильной директории (`cd backend`)
2. Проверьте, что база данных существует (`ls -la bookme.db`)
3. Проверьте права доступа (`chmod 644 bookme.db`)
4. Проверьте логи: `python3 -m alembic upgrade head --verbose`

---

### Q: Что делать, если скрипты не запускаются?

**A:**
1. Проверьте, что вы в директории `backend`
2. Проверьте, что Python установлен: `python3 --version`
3. Проверьте, что скрипты существуют: `ls scripts/`
4. Запустите с полным путем: `python3 /полный/путь/к/scripts/create_always_free_plan.py`

---

### Q: Как проверить, что изменения применились?

**A:**
1. Проверьте версию в коде: откройте файл на сервере и проверьте, что изменения есть
2. Проверьте логи сервисов: `journalctl -u dedato-backend -n 50`
3. Проверьте в браузере: откройте приложение и проверьте функциональность

---

## 📝 Краткая шпаргалка (для быстрого деплоя)

```bash
# 1. Локально
git push origin main

# 2. На сервере
ssh user@server
cd /path/to/dedato
git pull origin main
cd backend
python3 -m alembic upgrade head
python3 scripts/create_always_free_plan.py
python3 scripts/setup_test_accounts.py  # опционально
cd ..
docker-compose restart backend frontend  # или systemctl restart
```

---

## 🆘 Если что-то пошло не так

1. **Откат изменений:**
   ```bash
   git reset --hard HEAD~1  # Откатить последний коммит
   git pull origin main     # Получить старую версию
   ```

2. **Проверка логов:**
   ```bash
   # Backend логи
   docker logs dedato-backend
   # или
   journalctl -u dedato-backend -n 100
   
   # Frontend логи
   docker logs dedato-frontend
   ```

3. **Проверка статуса сервисов:**
   ```bash
   docker ps
   # или
   systemctl status dedato-backend
   systemctl status dedato-frontend
   ```




