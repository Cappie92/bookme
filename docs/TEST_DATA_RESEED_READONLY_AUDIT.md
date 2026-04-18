# READ-ONLY аудит: пересоздание тестовых данных через API

Цель: понять **канонический путь** создания тестовых сущностей (мастера, клиенты, услуги, категории, расписание, брони, подписка, баланс) **строго через существующие API/сервисы**, с валидациями, без прямых INSERT/UPDATE в таблицы. Код не менялся.

---

## Summary (кратко)

- **Регистрация мастера:** единственный канонический путь — `POST /api/auth/register` с `role=master`, **city** и **timezone** обязательны. Создаётся `User` и `Master` (city, timezone, timezone_confirmed, domain).
- **Профиль мастера:** `GET /api/master/settings`, `PUT /api/master/profile` (FormData). City/timezone нельзя очищать после выбора (safety-net в backend).
- **Услуги и категории:** категории — `POST /api/master/categories` (`name`). Услуги — `POST /api/master/services` (`name`, `duration`, `price`, `category_id`). Владелец — мастер (привязаны к `Master`).
- **Расписание:** правила — `POST /api/master/schedule/rules` (type `weekdays`, `effective_start_date`, `valid_until`, `weekdays`); массовое создание слотов — `POST /api/master/schedule/bulk-create?start_date=&end_date=`. Слоты хранятся в `MasterSchedule`; `bulk-create` читает `MasterScheduleSettings.fixed_schedule`. Нет отдельного API «только настройки без слотов» — правила сразу создают слоты и/или settings.
- **Бронирования:** слоты — `GET /api/bookings/available-slots-repeat` (публично) или `GET /api/bookings/available-slots` (с авторизацией). Создание: `POST /api/client/bookings/` (обычное) или `POST /api/client/bookings/temporary` + `POST .../confirm-payment` (предоплата). Есть `POST /api/bookings/public` (по телефону, без токена). Клиент при брони создаётся по `client_phone` при отсутствии. **Booking** всегда использует `service_id` → `services.id`. Домен мастера отдаёт **MasterService**; при брони через салон/инди — **Service** (salon/indie). Уточнение маппинга MasterService↔Service при брони с персональной страницы мастера — в коде (domain vs bookings).
- **Подписка/план/баланс:** планы — `GET /api/subscription-plans/available?subscription_type=master`. Статус/фичи — `GET /api/subscriptions/my`, `GET /api/master/subscription/features`, `GET /api/balance/subscription-status`. Оплата: `POST /api/subscriptions/calculate` → `POST /api/payments/subscription/init` → Robokassa → `POST .../robokassa/result` → начисление в `UserBalance`, активация подписки. Без оплаты: `POST /api/subscriptions/apply-upgrade-free` при `final_price <= 0`. MVP: баланс = остаток депозита, пополнение только через подписку; `POST /api/balance/deposit` и `POST /api/payments/deposit/init` → 410.
- **Очистка под пересоздание:** сохранять `subscription_plans`, `service_functions`, админа `+79031078685` (и связанные админ-данные по необходимости). Остальное — удалять в порядке, обратном FK (сначала дочерние таблицы). Ниже — таблицы, порядок и стратегия.

---

## 1. Entities & dependencies (ER, текст)

| Сущность | Владелец / связь | Обязательные поля | Заметки |
|----------|-------------------|-------------------|---------|
| **User** | — | `phone`, `hashed_password`, `role`, `is_active` | Роли: ADMIN, MASTER, CLIENT, SALON, INDIE. Email опционален. |
| **Master** | `user_id` → User | При онбординге: **city**, **timezone**, **timezone_confirmed** | `domain` уникален, генерируется при регистрации мастера. `can_work_independently`, `can_work_in_salon`. |
| **IndieMaster** | `user_id` → User | `domain` (unique) | Отдельная модель; услуги через `Service` (indie_master_id). |
| **Salon** | `user_id` → User | `name`, `city`, `timezone` (в схемах) | Связь с мастерами через `salon_masters`. |
| **Service** | `salon_id` или `indie_master_id` | `name`, `duration`, `price` | Используется в **Booking** (`service_id`). |
| **ServiceCategory** | `salon_id` → Salon | `name` | Для услуг салона. |
| **MasterServiceCategory** | `master_id` → Master | `name` | Для каталога мастера. |
| **MasterService** | `master_id` → Master, `category_id` → MasterServiceCategory | `name`, `duration`, `price`, `category_id` | Каталог мастера; домен отдаёт его. Брони через API используют **Service**; маппинг MasterService↔Service при записи с персональной страницы — см. реализацию. |
| **MasterScheduleSettings** | `master_id` → Master | `schedule_type`, `fixed_schedule` (JSON) | Нужны для `bulk-create`. |
| **MasterSchedule** | `master_id` → Master | `date`, `start_time`, `end_time`, `is_available` | Слоты по дням. `salon_id`/`branch_id`/`place_id` опциональны. |
| **AvailabilitySlot** | `owner_type`, `owner_id` | `day_of_week`, `start_time`, `end_time` | Используется в `get_available_slots` наряду с **MasterSchedule**; при наличии MasterSchedule на дату приоритет у него. |
| **IndieMasterSchedule** | `indie_master_id` → IndieMaster | `day_of_week`, `start_time`, `end_time` | Для инди-мастеров. |
| **Booking** | `client_id` → User, `service_id` → Service | `service_id`, `start_time`, `end_time`, один из `master_id` / `indie_master_id` / `salon_id` | Статусы: created, awaiting_confirmation, completed, cancelled и др. |
| **TemporaryBooking** | `master_id`, `client_id`, `service_id` | `start_time`, `end_time`, `payment_amount`, `expires_at` | Предоплата; 20 мин на подтверждение. |
| **BookingEditRequest** | `booking_id` → Booking | `proposed_start`, `proposed_end` | |
| **SubscriptionPlan** | — | `name`, `subscription_type`, `price_1month`…`price_12months`, `is_active` | Админка/скрипты. Не трогать при очистке тест-данных. |
| **Subscription** | `user_id` → User | `subscription_type`, `plan_id`, `start_date`, `end_date`, `price`, `daily_rate`, `status`, `is_active` | Длительности 30/90/180/360 дней через `duration_months_to_days`. |
| **UserBalance** | `user_id` → User | `balance` (рубли), `currency` | MVP: остаток депозита подписки. |
| **BalanceTransaction** | `user_id` → User | `amount`, `transaction_type`, `balance_before`, `balance_after` | |
| **DailySubscriptionCharge** | `subscription_id` → Subscription | `charge_date`, `amount`, `status`, `reason` (при failed) | История списаний. |
| **SubscriptionReservation** | `user_id`, `subscription_id` | `reserved_amount` | В MVP вне бизнес-логики; можно не использовать. |
| **SubscriptionPriceSnapshot** | `user_id`, `plan_id` | `duration_months`, `total_price`, `final_price`, `upgrade_type`, `expires_at` | Для calculate → init → apply. |
| **Payment** | `user_id` → User | `amount`, `status`, `payment_type`, `robokassa_invoice_id`, etc. | Инициализация через `POST /api/payments/subscription/init`. |

---

## 2. Canonical flows (endpoints, файлы, строки)

### A. Создание мастера (регистрация)

| Шаг | Endpoint | Метод | Payload | Файл | Строки |
|-----|----------|--------|---------|------|--------|
| 1 | `/api/auth/register` | POST | `phone`, `password`, `role`, `email?`, `full_name?`, **`city`**, **`timezone`** (обязательны при `role=master`) | `routers/auth.py` | 43–73, 102–124 |
| — | Создание User | — | `auth` | 76–93 |
| — | Создание Master | — | `auth` | 102–124; domain: 122–124 |

- **Обязательно при master:** `city`, `timezone` (непустые после strip). Иначе 400: «Для регистрации мастера укажите город. Часовой пояс определяется автоматически.»  
- **Создаётся автоматически:** `Master` (city, timezone, timezone_confirmed=True), `domain` через `generate_unique_domain`.  
- **Web:** `frontend/src/modals/AuthModal.jsx` 304–315 — при `master` в payload добавляются `city`, `timezone` из формы.  
- **Mobile:** `mobile/src/services/api/auth.ts` — `POST /api/auth/register`; наличие city/timezone в форме регистрации мастера — по реализации.

**Канонический путь:** `POST /api/auth/register` (web или mobile) с city/timezone для мастера.

---

### B. Создание / обновление профиля мастера

| Действие | Endpoint | Метод | Файл | Строки |
|----------|----------|--------|------|--------|
| Чтение | `/api/master/settings` | GET | `routers/master.py` | 518–555 |
| Чтение | `/api/master/profile` | GET | `routers/master.py` | 508–515 |
| Обновление | `/api/master/profile` | PUT | `routers/master.py` | 781–896 |

- **PUT** принимает FormData: `full_name`, `phone`, `email`, `city`, `timezone`, `bio`, `experience_years`, `can_work_independently`, `can_work_in_salon`, `website`, `domain`, `address`, `auto_confirm_bookings`, и др.  
- **Запрет очистки city/timezone:** `_reject_clear_city_timezone` (safety-net); пустые `""` при уже заданных — 400.  
- **timezone_confirmed:** выставляется в `True`, если есть и city, и timezone (878–881).  
- **Mobile:** `EditProfileModal` — `PUT /api/master/profile` (formData).

**Канонический путь:** `GET /api/master/settings` → `PUT /api/master/profile` с нужными полями.

---

### C. Услуги и категории

| Действие | Endpoint | Метод | Payload / query | Файл | Строки |
|----------|----------|--------|------------------|------|--------|
| Список категорий | `/api/master/categories` | GET | — | `routers/master.py` | 1883–1914 |
| Создать категорию | `/api/master/categories` | POST | `{"name": "..."}` | `routers/master.py` | 1917–1952 |
| Обновить категорию | `/api/master/categories/{id}` | PUT | `{"name": "..."}` | `routers/master.py` | 1955–1988 |
| Удалить категорию | `/api/master/categories/{id}` | DELETE | — | `routers/master.py` | 1991–2018 |
| Список услуг | `/api/master/services` | GET | — | `routers/master.py` | 2023–2060 |
| Создать услугу | `/api/master/services` | POST | `name`, `duration`, `price`, `category_id`; `description?` | `routers/master.py` | 2063–2115 |
| Обновить услугу | `/api/master/services/{id}` | PUT | `MasterServiceUpdate` | `routers/master.py` | 2119–2183 |
| Удалить услугу | `/api/master/services/{id}` | DELETE | — | `routers/master.py` | 2186–2208 |

- Категория привязана к мастеру; имя уникально в рамках мастера.  
- Услуга привязана к мастеру и категории (`category_id`); имя уникально в рамках мастера.  
- Схемы: `MasterServiceCategoryCreate`, `MasterServiceCreate` — `schemas.py` 743–766.

**Канонический путь:** 1) `POST /api/master/categories` → 2) `POST /api/master/services` с `category_id`.

---

### D. Расписание на 1+ месяц

| Действие | Endpoint | Метод | Payload / query | Файл | Строки |
|----------|----------|--------|------------------|------|--------|
| Правила | `/api/master/schedule/rules` | GET | — | `routers/master.py` | 1334–1368 |
| Создать правила | `/api/master/schedule/rules` | POST | `type`, **`effective_start_date`**, **`valid_until`**, `weekdays` (для type=weekdays) | `routers/master.py` | 1372–1762 |
| Массовое создание слотов | `/api/master/schedule/bulk-create` | POST | Query: `start_date`, `end_date` (YYYY-MM-DD); `salon_id?`, `branch_id?`, `place_id?` | `routers/master.py` | 4120–4171 |
| Массовое удаление | `/api/master/schedule/bulk-delete` | DELETE | Query: `start_date`, `end_date`; `work_type?` | `routers/master.py` | 4175–4208 |
| Одиночный слот | `/api/master/schedule` | POST | `ScheduleCreate` (date, start_time, end_time, …) | `routers/master.py` | 456–491 |
| Удалить слоты с даты | `/api/master/schedule/future` | DELETE | — | `routers/master.py` | 4077–4117 |
| Неделя/месяц (чтение) | `/api/master/schedule/weekly`, `/api/master/schedule/monthly` | GET | Query: `week_offset`, `weeks_ahead` / `year`, `month` | `routers/master.py` | 1050–1150, 1152–1332 |

- **Правила:** `type=weekdays`, `effective_start_date`, `valid_until` обязательны. `weekdays` — объект по дням 1–7 с `start`/`end` (HH:00 или HH:30). Создаётся `MasterScheduleSettings` и слоты `MasterSchedule`.  
- **bulk-create:** использует `MasterScheduleSettings.fixed_schedule`; создаёт записи `MasterSchedule` в диапазоне дат. Если настроек нет — 400.  
- **Порядок для «расписание на 1+ месяц»:** 1) `POST /api/master/schedule/rules` с `weekdays` и диапазоном дат → 2) при необходимости дополнительно `POST /api/master/schedule/bulk-create` на нужный диапазон (если правила уже есть).  
- **Нет отдельного «только настройки без слотов»** API; слоты создаются правилами и/или bulk-create.  
- **Проверка доступности:** `get_available_slots` использует `AvailabilitySlot` (owner_type, owner_id, day_of_week) и **MasterSchedule** (master_id, date); при наличии MasterSchedule на дату — он приоритетен (`services/scheduling.py` 138–212).

**Канонический путь:** `POST /api/master/schedule/rules` (weekdays) → при необходимости `POST /api/master/schedule/bulk-create` по датам.

---

### E. Бронирования

| Действие | Endpoint | Метод | Условие | Файл | Строки |
|----------|----------|--------|---------|------|--------|
| Слоты (публично) | `/api/bookings/available-slots-repeat` | GET | Query: `owner_type`, `owner_id`, `year`, `month`, `day`, `service_duration`, `branch_id?` | `routers/bookings.py` | 698–741 |
| Слоты (авториз.) | `/api/bookings/available-slots` | GET | Аналогично + `date` | `routers/bookings.py` | 674–688 |
| Слоты для смены времени | `/api/client/bookings/{id}/available-slots` | GET | Query: `date` | `routers/client.py` | 320–418 |
| Создание (клиент) | `/api/client/bookings/` | POST | `BookingCreate`: `service_id`, `master_id`|`indie_master_id`|`salon_id`, `start_time`, `end_time`, `client_name`, `service_name`, `service_duration`, `service_price`, `use_loyalty_points?` | `routers/client.py` | 421–656 |
| Временная бронь | `/api/client/bookings/temporary` | POST | `TemporaryBookingCreate`: `master_id`, `service_id`, `start_time`, `end_time` | `routers/client.py` | 661–778 |
| Подтверждение оплаты | `/api/client/bookings/temporary/{id}/confirm-payment` | POST | — | `routers/client.py` | 782–850 |
| Публичное создание | `/api/bookings/public` | POST | `BookingCreate` + `client_phone` | `routers/bookings.py` | 291–505 |

- **Обычное бронирование:** слоты через `available-slots-repeat` (или `available-slots`) → `POST /api/client/bookings/`.  
- **Предоплата:** при `requires_advance_payment` и `accepts_online_payment` нужно `temporary` → оплата → `confirm-payment`; иначе 400 «используйте /temporary».  
- **Публичное:** `POST /api/bookings/public` — клиент по `client_phone`; при отсутствии создаётся `User` (client).  
- **Конфликты:** `check_booking_conflicts` по `start_time`/`end_time` и владельцу. Рабочие часы: `check_master_working_hours` (MasterSchedule / IndieMasterSchedule и т.п.).  
- **Сдвиг времени:** отдельного «автосдвига» на backend нет; клиент подбирает слот через available-slots и отправляет `start_time`/`end_time`.  
- **Booking** всегда `service_id` → `services.id`. Услуги мастера по домену — **MasterService** (`/api/domain/{subdomain}/services`, `/api/domain/services?master_id=`); при брони через салон/инди используется **Service**. Соответствие MasterService↔Service при записи с персональной страницы мастера — в реализации (domain vs bookings).

**Канонический путь:** `GET /api/bookings/available-slots-repeat` → `POST /api/client/bookings/` (или temporary + confirm-payment при предоплате).

---

### F. Подписка, план, баланс

| Действие | Endpoint | Метод | Файл | Строки |
|----------|----------|--------|------|--------|
| Планы (публично) | `/api/subscription-plans/available` | GET | Query: `subscription_type=master` | `routers/subscription_plans_public.py` | 16–40 |
| Моя подписка | `/api/subscriptions/my` | GET | — | `routers/subscriptions.py` | 49–180 |
| Фичи мастера | `/api/master/subscription/features` | GET | — | `routers/master.py` | 558–654 |
| Статус подписки | `/api/balance/subscription-status` | GET | — | `routers/balance.py` | 88–160 |
| Расчёт | `/api/subscriptions/calculate` | POST | `plan_id`, `duration_months` (1/3/6/12), `upgrade_type?` | `routers/subscriptions.py` | 840–1095 |
| Инициация оплаты | `/api/payments/subscription/init` | POST | `plan_id`, `duration_months`, `payment_period?`, `calculation_id?`, `upgrade_type?`, `enable_auto_renewal?` | `routers/payments.py` | 52–228 |
| Callback Robokassa | `/api/payments/robokassa/result` | POST | Form from Robokassa | `routers/payments.py` | 243–566 |
| Применение без оплаты | `/api/subscriptions/apply-upgrade-free` | POST | `calculation_id` (snapshot) | `routers/subscriptions.py` | 1124–… |
| Баланс | `/api/balance/` | GET | — | `routers/balance.py` | 26–42 |
| Транзакции | `/api/balance/transactions` | GET | — | `routers/balance.py` | 59–84 |

- **daily_rate:** из плана — `total_price / duration_days` (30/90/180/360). Подписка хранит `daily_rate`; списания уменьшают `UserBalance.balance`.  
- **Pro/не Pro:** по `get_master_features` → `plan.features["service_functions"]` (1–6). В т.ч. 2 = has_extended_stats, 3 = loyalty, 4 = finance и т.д. (`utils/subscription_features.py` 13–24, 398–523).  
- **Пополнение «просто так» отключено:** `POST /api/balance/deposit`, `POST /api/payments/deposit/init` → 410.

**Канонический путь:** планы → `calculate` → `init` → Robokassa → result → баланс + подписка; при `final_price <= 0` — `apply-upgrade-free`.

---

## 3. Required fields & validations

### Регистрация мастера (онбординг)

- **Обязательно:** `phone`, `password`, `role=master`, **`city`**, **`timezone`** (непустые).  
- **Опционально:** `email`, `full_name`.  
- **Валидация:** `auth` 64–72; при пустых city/timezone — 400.

### Профиль мастера (city / timezone)

- **Нельзя очищать** после выбора: `PUT /api/master/profile` с `city=""` или `timezone=""` при уже заданных → 400 (`_reject_clear_city_timezone`).  
- **timezone_confirmed:** выставляется автоматически при наличии и city, и timezone.

### Loyalty

- Создание/обновление скидок требует **завершённый онбординг:** `timezone` и `timezone_confirmed` (`routers/loyalty.py` 223–244, `_require_master_onboarding_completed`).

### Бронирования

- Проверки: конфликты по времени, рабочие часы мастера, ограничения клиента (в т.ч. предоплата).  
- **Temporary:** только при `requires_advance_payment` и `accepts_online_payment`; иначе 400.

---

## 4. Subscription plan mapping

Планы задаются в БД (админка, `create_subscription_plans`, `create_always_free_plan`). Имена и типичные фичи:

| Имя | subscription_type | Публичный список | Особенности |
|-----|-------------------|-------------------|-------------|
| Free | master | да | Базовые лимиты, минимум service_functions. |
| Basic | master | да | Расширенные возможности, `service_functions` и т.д. |
| Pro | master | да | Расширенная статистика, лояльность, финансы и т.д. |
| Premium | master | да | Максимальные лимиты и фичи. |
| AlwaysFree | master | **нет** | Копия Premium, `is_active=False`; для `is_always_free` пользователей. |

- **Фичи:** `plan.features["service_functions"]` — список ID 1–6 (booking, extended_stats, loyalty, finance, client_restrictions, customize_domain).  
- **Цены:** `price_1month`…`price_12months`. Длительности → 30/90/180/360 дней (`constants.duration_months_to_days`).  
- **Получение планов:** `GET /api/subscription-plans/available?subscription_type=master`.  

Конкретные `plan_id` зависят от БД; при пересоздании тест-данных **планы не удалять**.

---

## 5. Safe cleanup plan (что удалять / что сохранять)

### Сохранять (не трогать)

- **Таблицы:** `subscription_plans`, `service_functions` (и связанные справочники, если есть).  
- **Пользователь:** `User` с `phone = '+79031078685'` и `role = ADMIN` (админ). Используется в `balance_utils.get_admin_user_id` и т.п.  
- По необходимости — прочие админские данные (например, логи операций), если они привязаны к этому админу и не должны обнуляться.

### Можно очищать (тест-данные)

- Пользователи (кроме админа выше), мастеры, инди-мастера, салоны, услуги, категории (master + salon), расписание (MasterSchedule, IndieMasterSchedule, AvailabilitySlot, MasterScheduleSettings), брони (Booking, TemporaryBooking, BookingEditRequest), подписки, балансы, транзакции, списания, резервы, снепшоты, платежи и т.д.

### Порядок удаления (учёт FK)

Удалять в **обратном** порядке зависимостей (сначала дочерние, затем родители). Упрощённый порядок:

1. Таблицы, ссылающиеся на многие другие: `booking_edit_requests`, `applied_discounts`, `income`, `balance_transactions`, `daily_subscription_charges`, `subscription_reservations`, `subscription_price_snapshots`, `subscription_freezes`, `payments`, …  
2. `bookings`, `temporary_bookings`.  
3. `master_schedules`, `indie_master_schedules`, `availability_slots`, `master_schedule_settings`.  
4. `master_services_list`, `master_service_categories`, `services`, `service_categories`, …  
5. Прочие связи мастер/салон/инди (loyalty, restrictions, payment_settings, etc.).  
6. `masters`, `indie_masters`, `salons`, …  
7. В конце — `user_balances` и `users` (кроме админа `+79031078685`).

Точный порядок лучше вывести из `Base.metadata.tables` и графа FK (миграции Alembic / модели SQLAlchemy).  
**Реализация:** отдельный скрипт или транзакция с явными `DELETE` в нужном порядке; либо временное отключение FK (если СУБД позволяет), удаление, включение FK. Пока — **без реализации**, только стратегия.

### Определение админа

- По `User.phone == '+79031078685'` и `User.role == 'ADMIN'` (`balance_utils` 711–716, `reset_admin_password` 13–23, `example_users.csv`, `USER_CREATION_GUIDE`).

---

## 6. Checklist «готово к написанию seeder’а»

- [ ] Планы подписок есть (`subscription_plans`); при необходимости `create_subscription_plans` / `create_always_free_plan` или админка.  
- [ ] Регистрация мастера только через `POST /api/auth/register` с `city` и `timezone`.  
- [ ] Профиль мастера — через `GET/PUT /api/master/profile` и `GET /api/master/settings`.  
- [ ] Категории и услуги — только через `POST /api/master/categories` и `POST /api/master/services`.  
- [ ] Расписание — через `POST /api/master/schedule/rules` и при необходимости `POST /api/master/schedule/bulk-create`.  
- [ ] Слоты — через `GET /api/bookings/available-slots-repeat` (или `available-slots`).  
- [ ] Брони — через `POST /api/client/bookings/` или `temporary` + `confirm-payment`; при необходимости `POST /api/bookings/public`.  
- [ ] Подписка/баланс — через `calculate` → `init` → Robokassa → result или `apply-upgrade-free`; без прямого пополнения (deposit endpoints → 410).  
- [ ] Очистка: не трогать `subscription_plans`, `service_functions`, админа `+79031078685`; остальное удалять в порядке, обратном FK.  
- [ ] Нет прямых INSERT/UPDATE в таблицы для тест-данных; все операции идут через API или разрешённые сервисные функции.

---

## 7. Web vs mobile, разное

- **Регистрация:** web — `AuthModal` явно передаёт `city`/`timezone` для мастера; mobile — тот же `POST /api/auth/register`, наличие city/timezone в UI по коду.  
- **Профиль:** и web, и mobile используют `GET /api/master/settings` и `PUT /api/master/profile`. Канонический путь общий.  
- **Подписки/баланс:** mobile дергает те же эндпоинты (`/api/balance/`, `subscription-status`, `subscription/features`, `subscriptions`).  

Если в каком-то месте есть два варианта (например, веб-форма и мобильная), **каноническим** считаем общий контракт API; отличия только в том, кто и как собирает payload.

---

## 8. Чего нет (и как обойти)

- **Bulk API только для расписания:** массовое создание слотов — `bulk-create` по датам. Чтобы «заполнить год», можно вызывать его по месяцам или итеративно (медленно, но через существующие методы).  
- **Прямое создание клиента без брони:** нет отдельного «создать клиента» API; клиент создаётся при первом бронировании (`/api/bookings/public` по `client_phone` или при записи через авторизованный `POST /api/client/bookings/`). Для тестов — создавать клиентов через сценарии бронирования.  
- **Маппинг MasterService ↔ Service при брони с персональной страницы:** в домене отдаётся MasterService; в бронировании используется Service. Необходимо опереться на текущую реализацию (domain vs client/bookings) при проектировании сценариев записи с персональной страницы мастера.

- **Расписание rules vs bulk-create:** правила сохраняют в `fixed_schedule` поля `start`/`end` в `weekdays` (`routers/master.py` 1429–1464, 1718–1719). `create_schedule_from_settings` (`utils/schedule_conflicts.py` 280–285) читает `open`/`close`. При использовании **только** rules созданных слотов (без отдельного bulk-create) слоты уже есть; bulk-create задействуется для доп. диапазонов. При вызове bulk-create после rules стоит проверить совпадение ключей (start/end vs open/close) в `fixed_schedule`.

---

## 9. Ключевые ссылки на модели и роутеры

| Что | Файл | Строки |
|-----|------|--------|
| User, Master, IndieMaster, Service, Booking | `backend/models.py` | 47–50, 160–200, 202–228, 137–158, 247–287 |
| MasterSchedule, MasterScheduleSettings, AvailabilitySlot | `backend/models.py` | 291–313, 316–329, 440–451 |
| Subscription, UserBalance, BalanceTransaction, DailySubscriptionCharge | `backend/models.py` | 647–690, 834–857, 795–823, 867–892 |
| SubscriptionPlan | `backend/models.py` | 1781–1783 |
| UserCreate, BookingCreate, MasterServiceCreate | `backend/schemas.py` | 21–30, 348–356, 761–766 |
| Роутеры auth, master, client, bookings, subscriptions, payments, balance | `backend/main.py` | 100–124 |
| get_available_slots, create_schedule_from_settings | `backend/services/scheduling.py`, `backend/utils/schedule_conflicts.py` | 138–212, 193–280 |
| get_admin_user_id (+79031078685) | `backend/utils/balance_utils.py` | 711–717 |

---

*Аудит выполнен в режиме READ-ONLY; изменения в коде не вносились. Ссылки на файлы и строки приведены по состоянию репозитория на момент аудита.*
