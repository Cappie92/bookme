# Аудит тестовых аккаунтов (READ-ONLY)

Цель: подготовить точный план «правильного» пересоздания тестовых аккаунтов с нуля. Код не менялся.

---

## 1. Где создаются тестовые пользователи и аккаунты

### 1.1. Скрипты `backend/scripts/`

| Скрипт | Что создаёт | Файл, ключевые строки |
|--------|-------------|------------------------|
| **setup_test_accounts.py** | Не создаёт пользователей. Ищет `User` по телефонам из `TEST_ACCOUNTS`, зачисляет баланс (через `get_or_create_user_balance` + `add_balance_transaction`), создаёт/обновляет `Subscription` на заданный план. | 21–31 (конфиг), 66–167 (логика). Импортирует `rubles_to_kopecks` из `balance_utils` (см. п. 3). |
| **create_test_users_balance_system.py** | `User` (MASTER) через `ensure_test_user`, `Master` через создание профиля, `UserBalance` + `BalanceTransaction`, `Subscription`, `SubscriptionReservation`, `DailySubscriptionCharge`, `SubscriptionFreeze`. Зависит от планов из БД. | 53–127 (`ensure_test_user`), 130–152 (`ensure_user_balance`), 154–283 (`create_test_subscription`, `create_subscription_reservation`), 297–371 (`create_daily_charge`, `create_subscription_freeze`), 381–1262 (`create_test_users_balance_system`). |
| **create_simple_test_users.py** | Только `User` (MASTER) по списку телефонов +79990000001…16. Пароль `test123`. Никаких `Master`, подписок, балансов. | 17–35 (список), 36–98 (`create_test_users`). |
| **fix_test_accounts_subscriptions.py** | `User` (MASTER), `Master`, `Subscription` для аккаунтов из `TEST_ACCOUNTS` и `NEW_PREMIUM_ACCOUNTS`. Ищет/создаёт пользователя, при отсутствии — создаёт `Master` (без city/timezone). Создаёт подписки с `duration` через `timedelta(days=365)` или до 2099 для Always Free. | 20–97 (конфиг), 99–327 (логика). Master: 146–151, 269–274. |
| **create_test_bookings_for_master.py** | Ищет мастера по `+79435774911`, при отсутствии тестового клиента создаёт `User` (CLIENT) `+79999999999`. Создаёт `Booking`. Не создаёт мастеров. | 22–69 (поиск мастера, создание клиента), 71–139 (создание записей). |
| **create_test_accounting_data.py** | Ищет `User` по `+79435774916`. Создаёт `MasterExpense`, `BookingConfirmation`, `Income` и т.п. Не создаёт пользователей. | 17–24 (поиск мастера), 26–260 (бухгалтерские сущности). |
| **create_subscription_plans.py** | `SubscriptionPlan` (Free, Basic, Pro, Premium). Не создаёт пользователей. | 14–148. |
| **create_always_free_plan.py** | `SubscriptionPlan` AlwaysFree (копия Premium, `is_active=False`). Не создаёт пользователей. | 20–92. |
| **sync_subscription_plans.py** | Синхронизация планов из JSON. Не создаёт пользователей. | — |
| **verify_test_users.py** | Только чтение. Проверяет пользователей +79990000001…16, подписки, балансы, резервы, списания, заморозки. Использует `kopecks_to_rubles`, `reserved_kopecks` (см. п. 3). | 18–145. |

### 1.2. Фикстуры в `backend/tests/`

| Фикстура | Файл | Что создаёт |
|----------|------|-------------|
| **test_user**, **test_admin**, **test_master**, **test_salon** | `conftest.py` 52–116 | `User` с ролью CLIENT/ADMIN/MASTER/SALON. Пароль `testpassword`. **Master не создаётся** для `test_master`. |
| **master_user** | `test_subscription_features.py` 21–46 | `User` (MASTER) + `Master` (без city/timezone). |
| **master_user_with_subscription** | `test_master_page_modules.py` 13–72 | `User` (MASTER) + `Master` (без city/timezone) + `SubscriptionPlan` (использует `price_monthly`/`price_yearly` — устаревшие поля) + `Subscription`. |
| **master_user**, **master** | `test_loyalty_discounts.py` 35–52 | `User` (MASTER) + `Master` (без city/timezone). |
| **master_user**, **master_no_timezone**, **master_with_timezone**, **master_with_city_timezone** | `test_master_profile_timezone.py` 77–128 | `User` (MASTER) + `Master` с разными комбинациями city/timezone для тестов онбординга. |
| **master_user**, **master_profile** | `test_accounting_master_id_consistency.py` 26–49 | `User` (MASTER) + `Master`. |
| Локальные **admin_user**, **master_user** | `test_subscription_plans.py` | Удалены; используются `admin_auth_headers` / `master_auth_headers` из conftest. |

### 1.3. Сиды, миграции, админка

| Источник | Что делает |
|----------|------------|
| **seed.py** | `create_test_data`: `User` (ADMIN, SALON, MASTER, INDIE, CLIENT), `Salon`, `Master`, `IndieMaster`, `Service`, `Booking`. Мастера — без city/timezone. Нет подписок, балансов, резервов. |
| **routers/auth.py** | `POST /api/auth/register`: при `role=MASTER` создаёт `User` и `Master` с **city**, **timezone**, **timezone_confirmed** (обязательны, иначе 400). Единственное «каноническое» создание мастера с онбордингом. |
| **Миграции** | Нет сидов пользователей. Есть данные для `service_functions`, обновления статусов/настроек. |

---

## 2. Карта зависимостей и правильный порядок создания (тестовый мастер)

Итоговая последовательность для **полноценного тестового мастера** (stats, loyalty, finance, UI без костылей):

1. **SubscriptionPlan**  
   Должны существовать планы (Free, Basic, Pro, Premium / AlwaysFree). Источник: `create_subscription_plans`, `create_always_free_plan` или админка.  
   Использовать **price_1month**, **price_3months**, **price_6months**, **price_12months** и **duration_months_to_days** (30/90/180/360).

2. **User** (role=MASTER)  
   Обязательны: `phone`, `hashed_password`, `is_active`, `is_verified`. Для логина в тестах — единый пароль (например `testpassword` или `test123`).

3. **Master** (профиль мастера)  
   Обязательны для онбординга и loyalty: **city**, **timezone**, **timezone_confirmed=True**. Иначе:
   - Loyalty: `_require_master_onboarding_completed` → 400 при создании/обновлении скидок (`routers/loyalty.py` 223–244, `master_loyalty`).
   - Рекомендуется задавать и `domain` (например через `generate_unique_domain`), если используется персонализация страницы.  
   Остальное: `can_work_independently`, `can_work_in_salon`, `bio`, `experience_years` по необходимости.

4. **UserBalance**  
   `get_or_create_user_balance(db, user_id)`. **balance** в **рублях** (Float). В MVP это остаток депозита подписки. Пополнение — только через сценарии подписки (Robokassa / apply-upgrade-free).

5. **Subscription** (active)  
   - `plan_id`, `user_id`, `subscription_type=MASTER`  
   - **start_date**, **end_date**: через `timedelta(days=duration_days)`, где `duration_days = duration_months_to_days(1|3|6|12)` (30/90/180/360).  
   - **daily_rate** = `total_price / duration_days` (рубли).  
   - **price** = полная стоимость периода (рубли).  
   - **status=ACTIVE**, **is_active=True**.  
   Не использовать «календарные месяцы» и жёстко заданные 365 дней без привязки к плану.

6. **DailySubscriptionCharge** (по желанию)  
   История списаний. Создаётся daily job’ом; для тестов можно вручную добавлять записи с `status=success`/`failed`, `reason` при failed.

7. **SubscriptionReservation**  
   В MVP **вне бизнес-логики**. Не использовать для определения «остатка» или доступа. При пересоздании тест-аккаунтов можно не создавать или создавать с `reserved_amount=0`.

8. **SubscriptionPriceSnapshot**  
   Только при тестах сценариев calculate/apply-upgrade-free. В обычном пересоздании тест-аккаунтов не обязателен.

9. **Прочее для UI и фич**  
   - **Stats / Extended stats**: нужны `Master` (и при indie — `IndieMaster`), подписка с фичами (например Pro/Premium для extended).  
   - **Loyalty**: `Master` с **city**, **timezone**, **timezone_confirmed=True**.  
   - **Finance**: доступ по подписке (`has_finance_access`). Бухгалтерия использует `User.id` для `MasterExpense`/`BookingConfirmation`/`TaxRate` и `Master.id` для владения `Booking` (см. `routers/accounting.py`).  
   - **Bookings**: `Booking` с `master_id` = `masters.id`; у мастера — услуги, расписание при необходимости.

---

## 3. Что «ломает архитектуру» в текущих тестовых аккаунтах

### 3.1. Master без city / timezone

| Место | Проблема |
|-------|----------|
| **create_test_users_balance_system.py** | `ensure_test_user` создаёт `Master` без `city`, `timezone`, `timezone_confirmed` (79–91, 109–124). |
| **fix_test_accounts_subscriptions.py** | `Master` создаётся только с `user_id`, `can_work_independently` (146–151, 269–274). |
| **seed.py** | `Master` без city/timezone (75–78). |
| **conftest.py** | `test_master` — только `User`, профиля `Master` нет. |
| **test_subscription_features**, **test_master_page_modules**, **test_loyalty_discounts**, **test_accounting_master_id_consistency** | Локальные `Master` без city/timezone. |

Итог: loyalty и онбординг-зависимые сценарии на таких аккаунтах не работают корректно.

### 3.2. Ручное выставление Pro-фич без реальной подписки

- **setup_test_accounts**, **fix_test_accounts_subscriptions**: создают `Subscription` с выбранным планом (в т.ч. Pro/Premium) и произвольными датами/`daily_rate`, часто без согласования с **UserBalance** и без прохождения оплаты.  
- **test_master_page_modules**: подписка и план создаются вручную; при этом план использует **price_monthly** / **price_yearly** вместо **price_1month**…**price_12months** (`test_master_page_modules.py` 42–54). Модель и API давно перешли на MVP-поля — фикстура устарела.

### 3.3. Несогласованность balance / subscription / daily_charges

- **MVP**: `UserBalance.balance` = остаток депозита; списания уменьшают его; при `balance < daily_rate` подписка деактивируется.  
- **setup_test_accounts**: зачисляет «тестовый» баланс (1 000 000 ₽) **напрямую**, без сценария подписки. Плюс использует **копейки** (см. ниже).  
- **create_test_users_balance_system**: опирается на **резерв** (`SubscriptionReservation`, `move_available_to_reserve`, `reserve_full_subscription_price`), тогда как в MVP резерв выведен из бизнес-логики. Много сценариев с «доступным балансом» и резервом — не совпадают с текущей моделью.

### 3.4. Копейки vs рубли, устаревшие поля

| Место | Проблема |
|-------|----------|
| **balance_utils** | Конвертация копеек удалена; всё в **рублях** (комментарий стр. 21–22). |
| **setup_test_accounts.py** | Импортирует `rubles_to_kopecks` из `balance_utils` (16), использует `TEST_BALANCE_KOPECKS` и сравнивает/добавляет к `balance` в копейках (34, 89–104). **Импорт и логика сломаны**: баланс в рублях, скрипт оперирует копейками. |
| **verify_test_users.py** | Импортирует `kopecks_to_rubles` из `balance_utils` (14), вызывает `kopecks_to_rubles(balance.balance)` и `reservation.reserved_kopecks` (101, 107–108). Функций в `balance_utils` нет; у `SubscriptionReservation` остаётся **reserved_amount** (рубли). **Скрипт неработоспособен** в текущем виде. |

### 3.5. Остатки reservation и устаревшие договорённости

- **create_test_users_balance_system**: активно использует `SubscriptionReservation`, `move_available_to_reserve`, `reserve_full_subscription_price`, `get_user_available_balance`.  
- **daily_charges** / **balance_utils**: в MVP списание идёт из `UserBalance.balance`; `ensure_reserve_for_remaining_days` не вызывается.  
- Резерв по-прежнему есть в БД и в части кода (в т.ч. админка, платежи), но для **новых тест-аккаунтов** и «правильной» модели его не следует использовать как источник истины.

---

## 4. Таблица: сущность → где создаётся → как правильно → что не так

| Сущность | Где создаётся | Как правильно | Что не так сейчас |
|----------|----------------|---------------|-------------------|
| **User** (MASTER) | scripts: create_simple_test_users, create_test_users_balance_system, fix_test_accounts, seed; auth/register; тесты (conftest, фикстуры) | phone, hashed_password, is_active, is_verified; единый тестовый пароль | Разные пароли (test123 / testpassword / password123); часть скриптов не создаёт мастеров вовсе |
| **Master** | create_test_users_balance_system, fix_test_accounts, seed, auth/register, тесты | city, timezone, timezone_confirmed=True; domain при необходимости | Почти везде без city/timezone; conftest test_master вообще без Master |
| **SubscriptionPlan** | create_subscription_plans, create_always_free_plan, sync, админка | price_1month…price_12months, duration через 30/90/180/360 | test_master_page_modules использует price_monthly/price_yearly |
| **Subscription** | setup_test_accounts, create_test_users_balance_system, fix_test_accounts | plan_id, duration_days через duration_months_to_days, daily_rate=total_price/days, согласованность с balance | Произвольные даты/длительности; нередко без связи с balance и daily_charges; резерв используется по-старому |
| **UserBalance** | get_or_create_user_balance (скрипты/сервисы) | balance в **рублях**; пополнение только через подписку | setup_test_accounts считает в копейках и «льёт» мимо подписки; импорт rubles_to_kopecks сломан |
| **BalanceTransaction** | add_balance_transaction | amount в рублях | setup_test_accounts передаёт копейки |
| **SubscriptionReservation** | create_test_users_balance_system, apply подписки (исторически) | В MVP не использовать для логики; при необходимости reserved_amount=0 | Скрипты активно опираются на резерв; verify ссылается на reserved_kopecks |
| **DailySubscriptionCharge** | daily job, create_test_users_balance_system (ручные записи) | success/failed, reason при failed; даты списаний | Старые сценарии с резервом и «доступным балансом» не совпадают с MVP |
| **SubscriptionFreeze** | create_test_users_balance_system | По необходимости для тестов заморозки | — |

---

## 5. Рекомендация: один канонический способ создавать тест-аккаунты

**Идея:** один скрипт или одна последовательность команд, которая создаёт тестовых мастеров с нуля в согласии с MVP и онбордингом.

**Предлагаемый порядок:**

1. **Планы**  
   Выполнить при необходимости:
   - `python scripts/create_subscription_plans.py`
   - `python scripts/create_always_free_plan.py`
   (или эквивалент через админку/API.)

2. **Единый скрипт пересоздания тест-аккаунтов** (реализовать отдельно, в рамках плана пересоздания):
   - Удалить или пересоздать только тестовых пользователей (по списку телефонов), чтобы не трогать прод.
   - Для каждого тестового мастера:
     - Создать **User** (MASTER) с фиксированным паролем.
     - Создать **Master** с **city**, **timezone**, **timezone_confirmed=True**, **domain**.
     - Вызвать **get_or_create_user_balance**; при необходимости задать **balance** в рублях вручную (имитация остатка после «оплаты»), с одной транзакцией **DEPOSIT** и пояснением в `description`.
     - Создать **Subscription** (active) с выбранным планом, **duration_days** через **duration_months_to_days**, **daily_rate** = total_price / duration_days, **start_date**/**end_date** через `timedelta(days=...)`.
     - **Не** создавать `SubscriptionReservation` или создавать с `reserved_amount=0`.
     - При необходимости добавить несколько **DailySubscriptionCharge** для сценариев истории.
   - Не использовать копейки, не опираться на резерв для определения доступа и «остатка».

3. **Команда/точка входа**  
   Одна команда вида:
   - `python scripts/recreate_test_accounts.py`  
   или пошаговая документация с указанием скриптов и порядка вызова.

4. **Тесты**  
   - Привести фикстуры к единым **master_auth_headers** / **admin_auth_headers** (уже частично сделано).  
   - Использовать **одного** канонического тестового мастера с **Master** (city, timezone, timezone_confirmed) для сценариев loyalty/онбординга.  
   - Планы в тестах — только **price_1month**…**price_12months** и **duration_months_to_days**; убрать **price_monthly**/**price_yearly**.

5. **Проверка**  
   - Обновить **verify_test_users** (или аналог): убрать `kopecks_to_rubles`, `reserved_kopecks`; проверять **balance** и **reserved_amount** в рублях.  
   - Отдельно поправить **setup_test_accounts**: убрать использование копеек и неподписочное зачисление баланса, либо пометить скрипт как устаревший и не использовать для «правильных» тест-аккаунтов.

**Итог:** один канонический способ — скрипт пересоздания тест-аккаунтов (+ при необходимости создание планов), с явным порядком сущностей и согласованностью с MVP, онбордингом (city/timezone) и текущей схемой (рубли, без опоры на резерв).

---

## Ссылки на файлы и строки (выборочно)

| Что | Файл | Строки |
|-----|------|--------|
| conftest User fixtures | `backend/tests/conftest.py` | 52–116 |
| _login, master_auth_headers | `backend/tests/conftest.py` | 119–161 |
| ensure_test_user, Master | `backend/scripts/create_test_users_balance_system.py` | 53–127 |
| create_test_subscription, reservation | `backend/scripts/create_test_users_balance_system.py` | 154–283 |
| setup_test_accounts баланс/подписки | `backend/scripts/setup_test_accounts.py` | 36–185 |
| fix_test_accounts User/Master/Subscription | `backend/scripts/fix_test_accounts_subscriptions.py` | 99–295 |
| create_simple_test_users | `backend/scripts/create_simple_test_users.py` | 36–98 |
| seed User/Master/IndieMaster | `backend/seed.py` | 22–201 |
| auth register Master city/timezone | `backend/routers/auth.py` | 64–77, 102–118 |
| loyalty onboarding check | `backend/routers/loyalty.py` | 223–244 |
| balance_utils, рубль, process_daily_charge | `backend/utils/balance_utils.py` | 21–22, 361–370, 420–465 |
| UserBalance, BalanceTransaction | `backend/models.py` | 834–857, 796–823 |
| Master city/timezone | `backend/models.py` | 176–178 |
| verify_test_users kopecks | `backend/scripts/verify_test_users.py` | 14, 99–108 |
| test_master_page_modules plan | `backend/tests/test_master_page_modules.py` | 41–70 |
| MVP, баланс, длительности | `docs/SUBSCRIPTION_DEPOSIT_IMPLEMENTATION.md` | 35–55, 58–64 |
