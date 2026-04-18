# План пересоздания тестовых данных (reseed)

## Этап 1: Подписка и баланс без Robokassa

### Решение

В коде **нет** существующих API для произвольной установки баланса или подписки без Robokassa (админка управляет только `is_always_free` и планом для always-free). Поэтому используются **dev-only эндпоинты**.

- **Роутер:** `backend/routers/dev_testdata.py`, префикс `/api/dev/testdata`.
- **Подключение:** только при `ENVIRONMENT=development` **и** `ENABLE_DEV_TESTDATA=1` (`main.py`).
- **Доступ:** только пользователь с ролью **ADMIN** (через `require_admin`). Дополнительно каждый эндпоинт проверяет `_is_dev()` (env + flag); иначе 404.

### Контракт эндпоинтов

#### 1. `POST /api/dev/testdata/set_balance`

Устанавливает баланс пользователя в рублях через `deposit_balance` / `withdraw_balance` (и далее `add_balance_transaction`). Прямой записи в БД нет.

**Тело (JSON):**

```json
{
  "user_id": 123,       // опционально, если есть phone
  "phone": "+79990000001",  // опционально, если есть user_id
  "balance_rub": 5000.0
}
```

Один из `user_id` или `phone` обязателен.

**Ответ:** `{ "success": true, "user_id": ..., "phone": ..., "balance_rub": ... }`

#### 2. `POST /api/dev/testdata/set_subscription`

Создаёт или обновляет подписку мастера: те же правила расчёта, что и в apply (plan, duration_months → total_price, daily_rate). Текущие активные подписки пользователя помечаются как `EXPIRED` / `is_active=False`. Создаётся новая `Subscription` и `SubscriptionReservation` с `reserved_amount=0`.

**Тело (JSON):**

```json
{
  "user_id": 123,
  "phone": "+79990000001",
  "plan_id": 2,
  "duration_months": 1,
  "start_date": "2025-01-28"
}
```

- `user_id` или `phone` — обязательно один.
- `plan_id` — ID плана из `subscription_plans` (MASTER, is_active).
- `duration_months` — 1, 3, 6 или 12 (30/90/180/360 дней).
- `start_date` — опционально, `YYYY-MM-DD`; по умолчанию «сегодня».

**Ответ:** `{ "success": true, "user_id", "subscription_id", "plan_id", "plan_name", "duration_days", "total_price", "daily_rate", "start_date", "end_date", ... }`

#### 3. `POST /api/dev/testdata/reset_non_admin_users`

Удаляет всех пользователей **кроме** админа с `phone = +79031078685`. Каскадное удаление в порядке FK. Таблицы `subscription_plans`, `service_functions` и сам админ **не трогаются**.

**Ответ:** `{ "success": true, "deleted_users": N }`

#### 4. `POST /api/dev/testdata/ensure_test_salon`

Создаёт тестовый салон (User + Salon + Branch + ServiceCategory «Услуги»), если его ещё нет. Идемпотентно. Нужен для бронирований: мастер привязывается к салону и к Service.

**Ответ:** `{ "success": true, "salon_id", "user_id", "branch_id", "category_id" }`

#### 5. `POST /api/dev/testdata/create_service_and_link_master`

Создаёт `Service` в тестовом салоне, привязывает мастера к салону (`salon_masters`) и к услуге (`master_services`). Сначала вызывать `ensure_test_salon`.

**Тело (JSON):** `{ "master_id": int, "name": str, "duration": int, "price": float, "description": str? }`

**Ответ:** `{ "success": true, "service_id", "master_id" }`

### Безопасность

- Роутер подключается **только** при `ENVIRONMENT=development` **и** `ENABLE_DEV_TESTDATA=1` (проверка в `main.py`). Без флага эндпоинты не существуют (404/405).
- Все перечисленные эндпоинты требуют **ADMIN** (`require_admin`) и дополнительно проверяют `_is_dev()` (env + ENABLE_DEV_TESTDATA); иначе **404**.

### Ссылки на код

| Элемент | Файл | Строки |
|--------|------|--------|
| Роутер dev_testdata | `backend/routers/dev_testdata.py` | — |
| set_balance | `backend/routers/dev_testdata.py` | POST /set_balance |
| set_subscription | `backend/routers/dev_testdata.py` | POST /set_subscription |
| reset_non_admin_users | `backend/routers/dev_testdata.py` | POST /reset_non_admin_users |
| Подключение роутера | `backend/main.py` | `include_router` при `ENVIRONMENT=development` и `ENABLE_DEV_TESTDATA=1` |
| deposit/withdraw | `backend/utils/balance_utils.py` | deposit_balance, withdraw_balance, add_balance_transaction |
