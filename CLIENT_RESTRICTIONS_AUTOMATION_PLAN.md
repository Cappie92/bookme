# План доработки системы автоматических ограничений клиентов

## Цель
Добавить функционал автоматического создания ограничений для клиентов на основе причин отмены записей, с возможностью настройки правил мастером.

---

## 1. БАЗА ДАННЫХ

### 1.1. Таблица `client_restriction_rules`
Таблица для хранения правил автоматических ограничений.

**Структура:**
- `id` (Integer, PK)
- `master_id` (Integer, FK -> masters.id, NOT NULL)
- `cancellation_reason` (String, NOT NULL) - одна из: 'client_requested', 'client_no_show', 'mutual_agreement', 'master_unavailable'
- `cancel_count` (Integer, NOT NULL) - количество отмен для срабатывания правила
- `period_days` (Integer, nullable) - период проверки в днях (NULL = все время)
- `restriction_type` (String, NOT NULL) - 'blacklist' или 'advance_payment_only'
- `created_at` (DateTime, default=now)
- `updated_at` (DateTime, default=now, onupdate=now)

**Индексы:**
- `idx_restriction_rules_master` (master_id)
- `idx_restriction_rules_master_reason` (master_id, cancellation_reason, restriction_type)

### 1.2. Таблица `master_payment_settings`
Таблица для хранения настроек оплаты мастера.

**Структура:**
- `id` (Integer, PK)
- `master_id` (Integer, FK -> masters.id, UNIQUE, NOT NULL)
- `accepts_online_payment` (Boolean, default=False)
- `created_at` (DateTime, default=now)
- `updated_at` (DateTime, default=now, onupdate=now)

**Индексы:**
- `idx_payment_settings_master` (master_id, UNIQUE)

### 1.3. Таблица `temporary_bookings`
Таблица для временных броней на период оплаты (20 минут).

**Структура:**
- `id` (Integer, PK)
- `master_id` (Integer, FK -> masters.id, NOT NULL)
- `client_id` (Integer, FK -> users.id, NOT NULL)
- `service_id` (Integer, FK -> services.id, NOT NULL)
- `start_time` (DateTime, NOT NULL)
- `end_time` (DateTime, NOT NULL)
- `payment_amount` (Float, NOT NULL)
- `expires_at` (DateTime, NOT NULL) - время истечения (start_time + 20 минут)
- `payment_session_id` (String, nullable) - для интеграции с платежной системой
- `payment_link` (String, nullable) - ссылка на оплату
- `status` (String, default='pending') - 'pending', 'paid', 'expired', 'cancelled'
- `created_at` (DateTime, default=now)

**Индексы:**
- `idx_temporary_bookings_master` (master_id)
- `idx_temporary_bookings_client` (client_id)
- `idx_temporary_bookings_expires` (expires_at)
- `idx_temporary_bookings_status` (status)

---

## 2. BACKEND (Python/FastAPI)

### 2.1. Модели (models.py)

**Добавить модели:**
- `ClientRestrictionRule` - модель для правил ограничений
- `MasterPaymentSettings` - модель для настроек оплаты
- `TemporaryBooking` - модель для временных броней

**Обновить связи:**
- В модель `Master` добавить:
  - `restriction_rules = relationship("ClientRestrictionRule", back_populates="master")`
  - `payment_settings = relationship("MasterPaymentSettings", back_populates="master", uselist=False)`

### 2.2. Схемы (schemas.py)

**Добавить схемы:**
- `ClientRestrictionRuleBase`, `ClientRestrictionRuleCreate`, `ClientRestrictionRuleUpdate`, `ClientRestrictionRuleOut`
- `MasterPaymentSettingsBase`, `MasterPaymentSettingsCreate`, `MasterPaymentSettingsUpdate`, `MasterPaymentSettingsOut`
- `TemporaryBookingCreate`, `TemporaryBookingOut`
- `BookingCheckResponse` - ответ при проверке возможности бронирования

### 2.3. Утилиты (utils/)

**Создать `utils/client_restrictions.py`:**

**Функция `check_client_restrictions(db, master_id, client_id, client_phone)`**
- Проверяет ручные ограничения (если номер в списке - возвращает ограничение сразу)
- Если ручных нет - проверяет автоматические правила
- Подсчитывает отмены по каждому правилу (скользящее окно от сегодня назад на period_days)
- Возвращает:
  - `is_blocked` (bool) - заблокирован ли клиент
  - `requires_advance_payment` (bool) - требуется ли предоплата
  - `reason` (str) - причина ограничения
  - `applied_rule_id` (int, optional) - ID применившегося правила

**Функция `count_cancellations_by_reason(db, master_id, client_id, cancellation_reason, period_days=None)`**
- Подсчитывает количество отмен с указанной причиной за период
- Если period_days=None - считает за все время
- Использует скользящее окно от сегодня назад

**Функция `validate_restriction_rule(db, master_id, rule_data)`**
- Проверяет, что правило не противоречит существующим
- Для категории "предоплата": проверяет, что нет правил для черного списка с той же причиной и меньшим или равным количеством отмен
- Возвращает (is_valid, error_message)

**Функция `apply_automatic_restrictions(db, master_id, client_id, client_phone)`**
- Применяет автоматические ограничения на основе правил
- Создает/обновляет запись в `client_restrictions` если клиент попадает под правило

### 2.4. Роутеры

**Обновить `routers/master.py`:**

**GET `/api/master/restriction-rules`**
- Получить все правила ограничений мастера

**POST `/api/master/restriction-rules`**
- Создать новое правило
- Валидация через `validate_restriction_rule`
- Валидация данных (cancel_count > 0, period_days в списке допустимых значений)

**PUT `/api/master/restriction-rules/{rule_id}`**
- Обновить правило
- Валидация через `validate_restriction_rule`

**DELETE `/api/master/restriction-rules/{rule_id}`**
- Удалить правило

**GET `/api/master/payment-settings`**
- Получить настройки оплаты мастера

**PUT `/api/master/payment-settings`**
- Обновить настройки оплаты (пока только accepts_online_payment)

**POST `/api/master/check-booking-eligibility`**
- Проверить возможность бронирования для клиента
- Использует `check_client_restrictions`
- Возвращает результат проверки

**Обновить `routers/client.py` (создание бронирования):**

**POST `/api/client/bookings`** - обновить логику:
- Перед созданием бронирования вызывать `check_client_restrictions`
- Если `is_blocked=True` - возвращать ошибку 403 с сообщением
- Если `requires_advance_payment=True` и `accepts_online_payment=True` - создавать временную бронь вместо обычной
- Если требуется предоплата - создавать запись в `temporary_bookings` со сроком истечения 20 минут

**POST `/api/client/temporary-bookings`**
- Создать временную бронь
- Резервировать слоты на 20 минут
- Возвращать данные для оплаты (пока заглушка)

**POST `/api/client/temporary-bookings/{temporary_booking_id}/confirm-payment`**
- Подтверждение оплаты временной брони
- Создать реальное `Booking` со статусом `COMPLETED` или `AWAITING_PAYMENT`
- Удалить временную бронь

**GET `/api/client/temporary-bookings/{temporary_booking_id}/status`**
- Проверить статус временной брони
- Возвращать время до истечения

**Задача периодической очистки:**
- Создать фоновую задачу для удаления просроченных временных броней (status='expired' или expires_at < now)

### 2.5. Миграция Alembic

**Создать миграцию:**
- Создать таблицы `client_restriction_rules`, `master_payment_settings`, `temporary_bookings`
- Добавить индексы
- Добавить внешние ключи

---

## 3. FRONTEND (React)

### 3.1. Компонент ClientRestrictionsManager

**Обновить `frontend/src/components/ClientRestrictionsManager.jsx`:**

**Добавить секцию "Автоматические правила":**
- Вывести список созданных правил
- Кнопка "Добавить правило"
- Для каждого правила: причина, количество отмен, период, категория, кнопки редактирования/удаления

**Добавить форму создания/редактирования правила:**
- Поля:
  - Причина отмены (выпадающий список из `get_cancellation_reasons()`)
  - Количество отмен (числовое поле, min=1)
  - Период проверки (выпадающий: 30, 60, 90, 180, 365 дней, "Все время")
  - Категория (радио-кнопки: "Черный список" или "Только предоплата")
- Валидация на фронте перед отправкой
- Отображение ошибок валидации с бэкенда

**Разделить на секции:**
1. Автоматические правила
2. Черный список (ручные + автоматические)
3. Только предоплата (ручные + автоматические)

### 3.2. Компонент MasterSettings

**Обновить `frontend/src/components/MasterSettings.jsx`:**

**Добавить секцию "Настройки оплаты":**
- Чекбокс "Принимаю оплату через систему DeDato"
- Сохранение в `master_payment_settings`

### 3.3. Компонент бронирования

**Обновить `frontend/src/components/booking/MasterBookingModule.jsx`:**

**Перед созданием бронирования:**
- Вызвать `/api/master/check-booking-eligibility`
- Если `is_blocked=True`:
  - Показать сообщение: "Запись к этому мастеру невозможна"
  - Кнопка "Перейти в личный кабинет"
  - Автоматический редирект через 10 секунд
- Если `requires_advance_payment=True`:
  - После выбора услуги и слота показать модальное окно оплаты

### 3.4. Модальное окно оплаты

**Создать `frontend/src/modals/PaymentModal.jsx`:**

**Функционал:**
- Отображение информации о бронировании (мастер, услуга, время, сумма)
- Таймер обратного отсчета (20 минут)
- Форма оплаты (пока заглушка)
- Кнопка "Оплатить"
- При успешной оплате - закрытие модалки и обновление данных
- При истечении времени - закрытие модалки и освобождение слотов

**Интеграция:**
- Создание временной брони через `/api/client/temporary-bookings`
- Периодическая проверка статуса через `/api/client/temporary-bookings/{id}/status`
- Подтверждение оплаты через `/api/client/temporary-bookings/{id}/confirm-payment`

### 3.5. Проверка при входе/регистрации

**Обновить логику аутентификации:**

**После входа клиента:**
- Проверить наличие активных временных броней
- Если есть и требуется предоплата - показать модальное окно оплаты

**После регистрации нового клиента:**
- Проверить наличие временных броней по номеру телефона
- Если есть и требуется предоплата - показать модальное окно оплаты

---

## 4. ЛОГИКА ПРОВЕРКИ ПРАВИЛ

### 4.1. Алгоритм проверки при бронировании

```
1. Получить client_id и client_phone клиента
2. Проверить ручные ограничения:
   - Если номер телефона есть в client_restrictions -> вернуть ограничение
3. Если ручных ограничений нет:
   - Получить все активные правила мастера
   - Для каждого правила:
     - Подсчитать отмены с причиной cancellation_reason за период period_days
     - Если count >= cancel_count:
       - Применить ограничение (blacklist или advance_payment_only)
       - Создать/обновить запись в client_restrictions с пометкой что это автоматическое правило
4. Вернуть результат проверки
```

### 4.2. Подсчет отмен

```
Для правила с period_days = N:
- today = текущая дата
- start_date = today - timedelta(days=N)
- Запрос: SELECT COUNT(*) FROM bookings 
  WHERE master_id = X 
    AND client_id = Y 
    AND status = 'cancelled' 
    AND cancellation_reason = 'reason'
    AND cancelled_at >= start_date
    AND cancelled_at <= today

Для правила с period_days = NULL (все время):
- Запрос: SELECT COUNT(*) FROM bookings 
  WHERE master_id = X 
    AND client_id = Y 
    AND status = 'cancelled' 
    AND cancellation_reason = 'reason'
```

### 4.3. Валидация правил

```
При создании/обновлении правила для категории "advance_payment_only":
1. Найти все правила мастера для категории "blacklist" с той же cancellation_reason
2. Для каждого найденного правила:
   - Если cancel_count в новом правиле >= cancel_count в правиле черного списка:
     - Вернуть ошибку: "Правило предоплаты не может требовать больше или равное количество отмен, чем правило черного списка для той же причины"
3. Если проверка прошла - сохранить правило
```

---

## 5. ОТЧЕТ О РЕАЛИЗАЦИИ

### ✅ Этап 1: База данных и модели (ЗАВЕРШЕН)

**Выполнено:**

1. **Создана миграция Alembic** (`add_client_restriction_rules_and_payment.py`)
   - Создана таблица `client_restriction_rules` с полями: id, master_id, cancellation_reason, cancel_count, period_days, restriction_type, created_at, updated_at
   - Создана таблица `master_payment_settings` с полями: id, master_id (UNIQUE), accepts_online_payment, created_at, updated_at
   - Создана таблица `temporary_bookings` с полями: id, master_id, client_id, service_id, start_time, end_time, payment_amount, expires_at, payment_session_id, payment_link, status, created_at
   - Добавлены все необходимые индексы для каждой таблицы
   - Реализованы функции upgrade() и downgrade()

2. **Добавлены модели в models.py:**
   - `ClientRestrictionRule` - модель для правил автоматических ограничений
   - `MasterPaymentSettings` - модель для настроек оплаты мастера
   - `TemporaryBooking` - модель для временных броней
   - Обновлена модель `Master` - добавлены связи:
     - `restriction_rules = relationship("ClientRestrictionRule", back_populates="master")`
     - `payment_settings = relationship("MasterPaymentSettings", back_populates="master", uselist=False)`

3. **Добавлены схемы в schemas.py:**
   - `ClientRestrictionRuleBase`, `ClientRestrictionRuleCreate`, `ClientRestrictionRuleUpdate`, `ClientRestrictionRuleOut`
   - `MasterPaymentSettingsBase`, `MasterPaymentSettingsCreate`, `MasterPaymentSettingsUpdate`, `MasterPaymentSettingsOut`
   - `TemporaryBookingCreate`, `TemporaryBookingOut`
   - `BookingCheckResponse` - схема для ответа при проверке возможности бронирования

**Файлы изменены:**
- `backend/alembic/versions/add_client_restriction_rules_and_payment.py` (создан)
- `backend/models.py` (обновлен)
- `backend/schemas.py` (обновлен)

---

### ✅ Этап 2: Бэкенд - утилиты и валидация (ЗАВЕРШЕН)

**Выполнено:**

1. **Создан файл `utils/client_restrictions.py`** с функциями:
   - `get_cancellation_reasons()` - возвращает словарь с доступными причинами отмены
   - `count_cancellations_by_reason()` - подсчитывает количество отмен с указанной причиной за период (скользящее окно)
   - `validate_restriction_rule()` - проверяет, что правило не противоречит существующим (валидация строгости правил предоплаты)
   - `check_client_restrictions()` - основная функция проверки ограничений клиента перед бронированием:
     - Сначала проверяет ручные ограничения
     - Затем проверяет автоматические правила (черный список приоритетнее предоплаты)
     - Подсчитывает отмены и применяет правила
   - `apply_automatic_restrictions()` - применяет автоматические ограничения, создавая/обновляя запись в `client_restrictions`

**Особенности реализации:**
- Учитывается связь между `masters.id` и `indie_masters.id` через `user_id`
- Ручные ограничения имеют приоритет над автоматическими
- Правила черного списка приоритетнее правил предоплаты
- Поддержка скользящего окна для подсчета отмен
- Валидация правил: правила предоплаты не могут быть строже правил черного списка

**Файлы изменены:**
- `backend/utils/client_restrictions.py` (создан)

---

### ✅ Этап 3: Бэкенд - API для правил ограничений и настроек оплаты (ЗАВЕРШЕН)

**Выполнено:**

1. **Добавлены новые эндпоинты в `routers/master.py`:**

   **Для управления правилами ограничений:**
   - `GET /api/master/restriction-rules` - получить все правила ограничений мастера
   - `POST /api/master/restriction-rules` - создать новое правило с валидацией
   - `PUT /api/master/restriction-rules/{rule_id}` - обновить правило с валидацией
   - `DELETE /api/master/restriction-rules/{rule_id}` - удалить правило

   **Для настроек оплаты:**
   - `GET /api/master/payment-settings` - получить настройки оплаты (создает если не существует)
   - `PUT /api/master/payment-settings` - обновить настройки оплаты

   **Для проверки возможности бронирования:**
   - `POST /api/master/check-booking-eligibility` - проверить возможность бронирования для клиента

2. **Особенности реализации:**
   - Валидация данных при создании/обновлении правил (период, причина отмены)
   - Валидация правил на противоречия через `validate_restriction_rule()`
   - Автоматическое создание настроек оплаты со значениями по умолчанию при первом запросе
   - Использование `check_client_restrictions()` для проверки возможности бронирования

**Файлы изменены:**
- `backend/routers/master.py` (обновлен - добавлены новые эндпоинты и импорты)

---

### ✅ Этап 4: Бэкенд - временные брони и интеграция с созданием бронирований (ЗАВЕРШЕН)

**Выполнено:**

1. **Обновлена функция создания бронирований (`routers/client.py`):**
   - Добавлена проверка ограничений клиента перед созданием бронирования
   - Если клиент заблокирован - возвращается ошибка 403
   - Если требуется предоплата - возвращается ошибка с указанием использовать эндпоинт временных броней

2. **Добавлены эндпоинты для временных броней в `routers/client.py`:**
   - `POST /api/client/bookings/temporary` - создание временной брони на 20 минут
   - `POST /api/client/bookings/temporary/{id}/confirm-payment` - подтверждение оплаты (создает реальное бронирование)
   - `GET /api/client/bookings/temporary/{id}/status` - проверка статуса временной брони
   - `DELETE /api/client/bookings/temporary/{id}` - отмена временной брони

3. **Особенности реализации временных броней:**
   - Временная бронь создается на 20 минут (expires_at = now + 20 минут)
   - Проверка конфликтов с обычными и временными бронями
   - После успешной оплаты создается реальное бронирование со статусом COMPLETED (автоматически подтверждено)
   - Статус временной брони обновляется на 'paid' после подтверждения оплаты

4. **Создана фоновая задача очистки (`services/temporary_bookings_cleanup.py`):**
   - Запускается каждые 5 минут
   - Обновляет статус просроченных временных броней на 'expired'
   - Интегрирована в `main.py` через startup/shutdown события

**Файлы изменены:**
- `backend/routers/client.py` (обновлен - добавлены проверки ограничений и эндпоинты временных броней)
- `backend/services/temporary_bookings_cleanup.py` (создан - фоновая задача очистки)
- `backend/main.py` (обновлен - добавлен запуск фоновой задачи очистки)

---

### ✅ Этап 5: Фронтенд - управление правилами в ClientRestrictionsManager (ЗАВЕРШЕН)

**Выполнено:**

1. **Обновлен компонент `ClientRestrictionsManager.jsx`:**
   - Добавлена секция "Автоматические правила" (отображается только для мастеров)
   - Форма создания/редактирования правил с полями:
     - Причина отмены (выпадающий список из доступных причин)
     - Количество отмен (числовое поле, min=1)
     - Период проверки (выпадающий: 30, 60, 90, 180, 365 дней, "Все время")
     - Тип ограничения (радио-кнопки: "Черный список" или "Только предоплата")
   - Список созданных правил с отображением:
     - Причина отмены
     - Условие срабатывания (количество отмен за период)
     - Тип ограничения (цветовое выделение)
     - Дата создания
   - Редактирование и удаление правил

2. **Особенности реализации:**
   - Определение типа пользователя (мастер или салон) по apiEndpoint
   - Загрузка правил из `/api/master/restriction-rules`
   - Валидация на фронте перед отправкой
   - Отображение ошибок валидации с бэкенда
   - Интеграция с существующим компонентом (ручные ограничения остались без изменений)

**Файлы изменены:**
- `frontend/src/components/ClientRestrictionsManager.jsx` (обновлен - добавлена секция автоматических правил)

---

### ✅ Этап 6: Фронтенд - настройки оплаты в MasterSettings (ЗАВЕРШЕН)

**Выполнено:**

1. **Обновлен компонент `MasterSettings.jsx`:**
   - Добавлено состояние `paymentSettings` для хранения настроек оплаты
   - Добавлена функция `loadPaymentSettings()` для загрузки настроек при загрузке профиля
   - Добавлена функция `savePaymentSettings()` для сохранения настроек через API
   - Добавлен чекбокс "Принимаю оплату через систему DeDato" в секцию "Способы оплаты"
   - Автоматическое сохранение при изменении чекбокса

2. **Особенности реализации:**
   - Настройки загружаются из `/api/master/payment-settings`
   - Сохранение происходит через PUT запрос к `/api/master/payment-settings`
   - Чекбокс размещен в секции "Способы оплаты" после существующих опций
   - Добавлено описание функционала для пользователя

**Файлы изменены:**
- `frontend/src/components/MasterSettings.jsx` (обновлен - добавлены настройки онлайн оплаты)

---

### ✅ Этап 7: Фронтенд - проверка при бронировании и модальное окно оплаты (ЗАВЕРШЕН)

**Выполнено:**

1. **Создан компонент `PaymentModal.jsx`:**
   - Модальное окно для оплаты предоплаты
   - Таймер обратного отсчета (20 минут)
   - Отображение информации о бронировании (услуга, дата, время, сумма)
   - Периодическая проверка статуса временной брони (каждые 5 секунд)
   - Заглушка формы оплаты (готово к интеграции с платежной системой)
   - Обработка успешной оплаты и истечения времени

2. **Обновлен компонент `MasterBookingModule.jsx`:**
   - Добавлена функция `checkBookingEligibility()` для проверки ограничений перед бронированием
   - Добавлена функция `createTemporaryBooking()` для создания временной брони при необходимости предоплаты
   - Обновлена функция `handleSubmit()` - проверка ограничений перед созданием бронирования
   - Добавлено отображение сообщения о блокировке с кнопкой "Перейти в личный кабинет"
   - Автоматический редирект через 10 секунд при блокировке
   - Интеграция с `PaymentModal` для обработки предоплаты
   - Обработка успешной оплаты и создания реального бронирования

3. **Особенности реализации:**
   - Проверка ограничений происходит перед созданием бронирования (постоянного или временного)
   - Если клиент заблокирован - показывается сообщение и происходит редирект
   - Если требуется предоплата и клиент авторизован - создается временная бронь и открывается модальное окно
   - Если требуется предоплата и клиент не авторизован - показывается сообщение о необходимости авторизации
   - После успешной оплаты создается реальное бронирование со статусом COMPLETED

**Файлы изменены:**
- `frontend/src/components/modals/PaymentModal.jsx` (создан)
- `frontend/src/components/booking/MasterBookingModule.jsx` (обновлен - добавлена проверка ограничений и интеграция с модальным окном оплаты)

---

## ✅ ИТОГОВЫЙ СТАТУС РЕАЛИЗАЦИИ

**Все 7 этапов успешно завершены!**

### Что реализовано:

1. ✅ **База данных и модели** - созданы 3 новые таблицы, модели и схемы
2. ✅ **Утилиты и валидация** - реализованы функции проверки ограничений и валидации правил
3. ✅ **API для правил и настроек** - добавлены все необходимые эндпоинты
4. ✅ **Временные брони** - реализована система временных броней с фоновой очисткой
5. ✅ **Управление правилами (фронтенд)** - добавлена секция автоматических правил в ClientRestrictionsManager
6. ✅ **Настройки оплаты (фронтенд)** - добавлен чекбокс для онлайн оплаты в MasterSettings
7. ✅ **Проверка и модальное окно** - реализована проверка ограничений при бронировании и модальное окно оплаты

### Основные возможности системы:

- Мастер может создавать автоматические правила ограничений на основе причин отмены
- Система проверяет правила при попытке бронирования
- При блокировке клиент видит сообщение и происходит редирект
- При необходимости предоплаты создается временная бронь и открывается модальное окно оплаты
- После успешной оплаты создается реальное бронирование
- Фоновая задача очищает просроченные временные брони

### Следующие шаги:

1. Применить миграцию базы данных на продакшн
2. Протестировать все сценарии работы
3. Интегрировать реальную платежную систему в PaymentModal
4. Добавить логирование важных событий

**Выполнено:**

1. **Создана миграция Alembic** (`add_client_restriction_rules_and_payment.py`)
   - Создана таблица `client_restriction_rules` с полями: id, master_id, cancellation_reason, cancel_count, period_days, restriction_type, created_at, updated_at
   - Создана таблица `master_payment_settings` с полями: id, master_id (UNIQUE), accepts_online_payment, created_at, updated_at
   - Создана таблица `temporary_bookings` с полями: id, master_id, client_id, service_id, start_time, end_time, payment_amount, expires_at, payment_session_id, payment_link, status, created_at
   - Добавлены все необходимые индексы для каждой таблицы
   - Реализованы функции upgrade() и downgrade()

2. **Добавлены модели в models.py:**
   - `ClientRestrictionRule` - модель для правил автоматических ограничений
   - `MasterPaymentSettings` - модель для настроек оплаты мастера
   - `TemporaryBooking` - модель для временных броней
   - Обновлена модель `Master` - добавлены связи:
     - `restriction_rules = relationship("ClientRestrictionRule", back_populates="master")`
     - `payment_settings = relationship("MasterPaymentSettings", back_populates="master", uselist=False)`

3. **Добавлены схемы в schemas.py:**
   - `ClientRestrictionRuleBase`, `ClientRestrictionRuleCreate`, `ClientRestrictionRuleUpdate`, `ClientRestrictionRuleOut`
   - `MasterPaymentSettingsBase`, `MasterPaymentSettingsCreate`, `MasterPaymentSettingsUpdate`, `MasterPaymentSettingsOut`
   - `TemporaryBookingCreate`, `TemporaryBookingOut`
   - `BookingCheckResponse` - схема для ответа при проверке возможности бронирования

**Файлы изменены:**
- `backend/alembic/versions/add_client_restriction_rules_and_payment.py` (создан)
- `backend/models.py` (обновлен)
- `backend/schemas.py` (обновлен)

---

## 6. ЭТАПЫ РЕАЛИЗАЦИИ

### Этап 1: База данных и модели
1. Создать миграцию Alembic для новых таблиц
2. Добавить модели в models.py
3. Добавить схемы в schemas.py
4. Обновить связи моделей

### Этап 2: Бэкенд - утилиты и валидация
1. Создать utils/client_restrictions.py
2. Реализовать функции проверки и подсчета
3. Реализовать валидацию правил

### Этап 3: Бэкенд - API для правил
1. Добавить эндпоинты для управления правилами
2. Добавить эндпоинты для настроек оплаты
3. Добавить эндпоинт проверки возможности бронирования

### Этап 4: Бэкенд - временные брони
1. Добавить эндпоинты для временных броней
2. Реализовать логику резервирования слотов на 20 минут
3. Создать фоновую задачу очистки просроченных броней

### Этап 5: Бэкенд - интеграция с созданием бронирований
1. Обновить POST /api/client/bookings для проверки ограничений
2. Добавить логику создания временных броней при необходимости

### Этап 6: Фронтенд - управление правилами
1. Обновить ClientRestrictionsManager
2. Добавить форму создания/редактирования правил
3. Добавить отображение списка правил

### Этап 7: Фронтенд - настройки оплаты
1. Добавить чекбокс в MasterSettings
2. Реализовать сохранение настроек

### Этап 8: Фронтенд - проверка при бронировании
1. Обновить MasterBookingModule для проверки ограничений
2. Добавить отображение сообщения о блокировке
3. Реализовать редирект

### Этап 9: Фронтенд - модальное окно оплаты
1. Создать PaymentModal компонент
2. Реализовать таймер обратного отсчета
3. Интегрировать с API временных броней
4. Реализовать заглушку формы оплаты

### Этап 10: Интеграция и тестирование
1. Проверить все сценарии работы
2. Протестировать валидацию правил
3. Протестировать временные брони
4. Проверить автоматическую очистку

---

## 7. ВАЖНЫЕ ЗАМЕЧАНИЯ

1. **Приоритет ограничений**: Ручные ограничения имеют приоритет над автоматическими. Если клиент вручную добавлен в черный список, правила не проверяются.

2. **Черный список приоритетнее предоплаты**: Если клиент попадает под оба правила, применяется черный список.

3. **Пересчет правил**: Правила пересчитываются только при попытке бронирования, не в фоновом режиме.

4. **Временные брони**: Автоматически удаляются через 20 минут или при успешной оплате создается реальное бронирование.

5. **Период проверки**: Скользящее окно от текущей даты назад на указанное количество дней.

---

## 8. ТЕСТИРОВАНИЕ

### Сценарии для тестирования:

1. **Создание правила**:
   - Создать правило для черного списка
   - Создать правило для предоплаты (с валидацией строгости)
   - Попытка создать противоречащее правило (должна быть ошибка)

2. **Проверка ограничений**:
   - Создать несколько отмен с разными причинами
   - Проверить подсчет отмен за период
   - Проверить применение правила

3. **Бронирование**:
   - Попытка забронировать с ограничением (черный список)
   - Попытка забронировать с требованием предоплаты
   - Успешное бронирование без ограничений

4. **Временные брони**:
   - Создание временной брони
   - Проверка истечения времени
   - Подтверждение оплаты

5. **Валидация правил**:
   - Попытка создать правило предоплаты строже чем черный список
   - Успешное создание корректных правил

