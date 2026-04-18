# ✅ Чек-лист деплоя системы лояльности

## 📋 Предварительные проверки

### Перед началом деплоя:
- [ ] Все изменения закоммичены и запушены в Git
- [ ] Миграция `add_loyalty_points_system` создана и протестирована локально
- [ ] Локально проверено, что все таблицы создаются корректно
- [ ] Backend роутеры `master_loyalty` и `client_loyalty` подключены в `main.py`
- [ ] Все новые компоненты фронтенда работают локально
- [ ] Нет ошибок линтера
- [ ] Документация обновлена

### Проверка новых файлов:
- [ ] `backend/alembic/versions/add_loyalty_points_system.py` - миграция создана
- [ ] `backend/models.py` - добавлены модели `LoyaltySettings` и `LoyaltyTransaction`
- [ ] `backend/schemas.py` - добавлены схемы для лояльности
- [ ] `backend/routers/master_loyalty.py` - создан и подключен
- [ ] `backend/routers/client_loyalty.py` - создан и подключен
- [ ] `backend/utils/loyalty.py` - утилиты для работы с баллами созданы
- [ ] `backend/routers/client.py` - обновлен для резервирования баллов
- [ ] `backend/routers/accounting.py` - обновлен для начисления/списания баллов
- [ ] `frontend/src/components/MasterLoyalty.jsx` - создан (включает настройки)
- [ ] `frontend/src/components/MasterLoyaltyHistory.jsx` - создан
- [ ] `frontend/src/components/MasterLoyaltyStats.jsx` - создан
- [ ] `frontend/src/components/ClientLoyaltyPoints.jsx` - создан
- [ ] `frontend/src/pages/MasterDashboard.jsx` - добавлена кнопка "Лояльность"
- [ ] `frontend/src/pages/ClientDashboard.jsx` - добавлен раздел "Мои баллы"
- [ ] `frontend/src/pages/ClientFavorite.jsx` - добавлено отображение баллов
- [ ] `frontend/src/components/booking/MasterBookingModule.jsx` - добавлена возможность тратить баллы

---

## 🔄 Процесс деплоя

### Шаг 1: Подготовка
- [ ] Перейти в корневую директорию проекта
- [ ] Проверить статус Git: `git status`
- [ ] Проверить текущую версию миграции на продакшн: `alembic current`
- [ ] Создать директорию для бэкапов: `mkdir -p backups`

### Шаг 2: Бэкап данных
- [ ] Создать полный бэкап базы данных продакшн сервера
- [ ] Проверить размер бэкапа
- [ ] Скопировать бэкап локально: `scp root@193.160.208.206:/home/root/dedato/backend/bookme.db ./backups/bookme_backup_$(date +%Y%m%d_%H%M%S).db`
- [ ] Записать имя файла бэкапа

### Шаг 3: Копирование файлов на сервер

#### Backend файлы:
- [ ] `scp -r backend/routers/master_loyalty.py root@193.160.208.206:/home/root/dedato/backend/routers/`
- [ ] `scp -r backend/routers/client_loyalty.py root@193.160.208.206:/home/root/dedato/backend/routers/`
- [ ] `scp backend/utils/loyalty.py root@193.160.208.206:/home/root/dedato/backend/utils/`
- [ ] `scp backend/models.py root@193.160.208.206:/home/root/dedato/backend/`
- [ ] `scp backend/schemas.py root@193.160.208.206:/home/root/dedato/backend/`
- [ ] `scp backend/main.py root@193.160.208.206:/home/root/dedato/backend/`
- [ ] `scp -r backend/routers/client.py root@193.160.208.206:/home/root/dedato/backend/routers/`
- [ ] `scp -r backend/routers/accounting.py root@193.160.208.206:/home/root/dedato/backend/routers/`

#### Миграции:
- [ ] `scp backend/alembic/versions/add_loyalty_points_system.py root@193.160.208.206:/home/root/dedato/backend/alembic/versions/`
- [ ] Проверить, что файл миграции скопирован корректно

#### Frontend файлы:
- [ ] `scp frontend/src/components/MasterLoyalty.jsx root@193.160.208.206:/home/root/dedato/frontend/src/components/`
- [ ] `scp frontend/src/components/MasterLoyaltyHistory.jsx root@193.160.208.206:/home/root/dedato/frontend/src/components/`
- [ ] `scp frontend/src/components/MasterLoyaltyStats.jsx root@193.160.208.206:/home/root/dedato/frontend/src/components/`
- [ ] `scp frontend/src/components/ClientLoyaltyPoints.jsx root@193.160.208.206:/home/root/dedato/frontend/src/components/`
- [ ] `scp frontend/src/components/Tooltip.jsx root@193.160.208.206:/home/root/dedato/frontend/src/components/`
- [ ] `scp frontend/src/pages/MasterDashboard.jsx root@193.160.208.206:/home/root/dedato/frontend/src/pages/`
- [ ] `scp frontend/src/pages/ClientDashboard.jsx root@193.160.208.206:/home/root/dedato/frontend/src/pages/`
- [ ] `scp frontend/src/pages/ClientFavorite.jsx root@193.160.208.206:/home/root/dedato/frontend/src/pages/`
- [ ] `scp frontend/src/components/booking/MasterBookingModule.jsx root@193.160.208.206:/home/root/dedato/frontend/src/components/booking/`
- [ ] `scp frontend/src/components/MasterAccounting.jsx root@193.160.208.206:/home/root/dedato/frontend/src/components/`

### Шаг 4: Применение миграции
- [ ] Подключиться к серверу: `ssh root@193.160.208.206`
- [ ] Перейти в директорию: `cd /home/root/dedato`
- [ ] Остановить контейнеры: `docker-compose -f docker-compose.prod.yml down`
- [ ] Применить миграцию внутри контейнера backend или локально:
  ```bash
  docker-compose -f docker-compose.prod.yml run --rm backend alembic upgrade head
  ```
- [ ] Проверить текущую версию: `docker-compose -f docker-compose.prod.yml run --rm backend alembic current`
- [ ] Должно быть: `add_loyalty_points_system (head)`
- [ ] Проверить создание таблиц:
  ```bash
  docker-compose -f docker-compose.prod.yml run --rm backend python -c "
  import sqlite3
  conn = sqlite3.connect('/app/bookme.db')
  cursor = conn.cursor()
  cursor.execute(\"SELECT name FROM sqlite_master WHERE type='table' AND name IN ('loyalty_settings', 'loyalty_transactions')\")
  tables = cursor.fetchall()
  print('Tables:', [t[0] for t in tables])
  cursor.execute('PRAGMA table_info(loyalty_settings)')
  print('loyalty_settings columns:', [row[1] for row in cursor.fetchall()])
  cursor.execute('PRAGMA table_info(loyalty_transactions)')
  print('loyalty_transactions columns:', [row[1] for row in cursor.fetchall()])
  cursor.execute('PRAGMA table_info(bookings)')
  booking_cols = [row[1] for row in cursor.fetchall()]
  print('bookings has loyalty_points_used:', 'loyalty_points_used' in booking_cols)
  conn.close()
  "
  ```

### Шаг 5: Пересборка и запуск
- [ ] Пересобрать контейнеры: `docker-compose -f docker-compose.prod.yml build --no-cache`
- [ ] Запустить контейнеры: `docker-compose -f docker-compose.prod.yml up -d`
- [ ] Проверить статус: `docker-compose -f docker-compose.prod.yml ps`
- [ ] Все контейнеры должны быть в состоянии "Up"

### Шаг 6: Проверка логов
- [ ] Логи backend: `docker-compose -f docker-compose.prod.yml logs backend | tail -50`
- [ ] Должно быть без критических ошибок
- [ ] Проверить, что роутеры подключены: искать в логах упоминания `master_loyalty` и `client_loyalty`
- [ ] Логи frontend: `docker-compose -f docker-compose.prod.yml logs frontend | tail -50`

### Шаг 7: Проверка API endpoints

#### Мастерские эндпоинты:
- [ ] `curl -H "Authorization: Bearer <master_token>" http://193.160.208.206/api/master/loyalty/settings`
- [ ] `curl -H "Authorization: Bearer <master_token>" http://193.160.208.206/api/master/loyalty/stats`
- [ ] `curl -H "Authorization: Bearer <master_token>" http://193.160.208.206/api/master/loyalty/history`

#### Клиентские эндпоинты:
- [ ] `curl -H "Authorization: Bearer <client_token>" http://193.160.208.206/api/client/loyalty/points`
- [ ] `curl -H "Authorization: Bearer <client_token>" http://193.160.208.206/api/client/loyalty/points/summary`
- [ ] `curl -H "Authorization: Bearer <client_token>" http://193.160.208.206/api/client/loyalty/points/available/<master_id>`

### Шаг 8: Проверка функциональности

#### В кабинете мастера:
- [ ] Кнопка "🎁 Лояльность" отображается в сайдбаре
- [ ] Кнопка активна только для мастеров с подпиской Pro и выше
- [ ] Для мастеров без доступа кнопка неактивна с подсказкой
- [ ] При клике открывается вкладка "Лояльность" с тремя подвкладками:
  - [ ] "Настройки" - можно включить/выключить, задать проценты, срок жизни
  - [ ] "История операций" - отображается таблица транзакций
  - [ ] "Статистика" - отображаются метрики
- [ ] Сохранение настроек работает корректно
- [ ] В блоке "Финансы" отображается `total_points_spent`

#### В кабинете клиента:
- [ ] В разделе "Мои баллы" отображаются баллы по всем мастерам
- [ ] В списке избранных мастеров отображаются баллы у каждого
- [ ] В форме записи к мастеру отображается "У вас X баллов. Потратить [checkbox]"
- [ ] Чекбокс работает корректно

#### Проверка начисления и списания баллов:
- [ ] Создать тестовую запись с использованием баллов
- [ ] Мастер подтверждает запись
- [ ] Баллы списались (проверить в истории клиента и мастера)
- [ ] Новые баллы начислились (проверить в истории)
- [ ] В финансовом блоке мастера отражен правильный доход (за вычетом баллов)

### Шаг 9: Проверка базы данных
- [ ] Проверить целостность БД: `docker-compose -f docker-compose.prod.yml exec backend sqlite3 /app/bookme.db "PRAGMA integrity_check;"`
- [ ] Должно вернуть `ok`
- [ ] Проверить индексы:
  ```bash
  docker-compose -f docker-compose.prod.yml exec backend sqlite3 /app/bookme.db "
  SELECT name FROM sqlite_master WHERE type='index' AND tbl_name IN ('loyalty_settings', 'loyalty_transactions');
  "
  ```

---

## 🚨 Процедура отката

### Если что-то пошло не так:
- [ ] Остановить контейнеры: `docker-compose -f docker-compose.prod.yml down`
- [ ] Восстановить БД из бэкапа:
  ```bash
  docker-compose -f docker-compose.prod.yml run --rm backend cp /app/backup_YYYYMMDD_HHMMSS.db /app/bookme.db
  ```
- [ ] Откатить миграцию (если была применена):
  ```bash
  docker-compose -f docker-compose.prod.yml run --rm backend alembic downgrade -1
  ```
- [ ] Восстановить предыдущую версию кода через Git на сервере
- [ ] Перезапустить контейнеры: `docker-compose -f docker-compose.prod.yml up -d`

---

## 📊 Мониторинг после деплоя

### В течение 1 часа:
- [ ] Проверить логи на ошибки: `docker-compose -f docker-compose.prod.yml logs -f backend`
- [ ] Проверить производительность: `docker stats`
- [ ] Протестировать основные функции:
  - [ ] Создание записи с использованием баллов
  - [ ] Начисление баллов при подтверждении
  - [ ] Отображение баллов в кабинетах
  - [ ] Работа настроек лояльности

### В течение 24 часов:
- [ ] Мониторить стабильность работы
- [ ] Проверить, что баллы корректно истекают (если установлен срок жизни)
- [ ] Проверить финансовую отчетность мастера
- [ ] Собрать обратную связь от пользователей

---

## 🔧 Полезные команды для проверки

### Проверка таблиц лояльности:
```bash
docker-compose -f docker-compose.prod.yml exec backend sqlite3 /app/bookme.db "
SELECT COUNT(*) FROM loyalty_settings;
SELECT COUNT(*) FROM loyalty_transactions;
SELECT * FROM loyalty_settings LIMIT 5;
SELECT * FROM loyalty_transactions ORDER BY created_at DESC LIMIT 10;
"
```

### Проверка записей с использованием баллов:
```bash
docker-compose -f docker-compose.prod.yml exec backend sqlite3 /app/bookme.db "
SELECT id, client_id, master_id, payment_amount, loyalty_points_used, status 
FROM bookings 
WHERE loyalty_points_used > 0 
ORDER BY created_at DESC 
LIMIT 10;
"
```

### Проверка баланса баллов клиента:
```bash
docker-compose -f docker-compose.prod.yml exec backend sqlite3 /app/bookme.db "
SELECT 
  master_id,
  client_id,
  transaction_type,
  SUM(points) as total_points,
  COUNT(*) as transactions_count
FROM loyalty_transactions
WHERE client_id = <CLIENT_ID>
GROUP BY master_id, client_id, transaction_type;
"
```

---

## ✅ Финальная проверка перед завершением

- [ ] Все шаги выполнены без ошибок
- [ ] Все проверки пройдены успешно
- [ ] Тестовые сценарии работают
- [ ] Логи не содержат критических ошибок
- [ ] Производительность в норме
- [ ] Бэкап сохранен и доступен для отката

**Дата деплоя:** _______________
**Версия миграции:** `add_loyalty_points_system`
**Исполнитель:** _______________

