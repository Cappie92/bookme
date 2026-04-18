# Read-only аудит: подписки, баланс, депозит, списания, длительности

Цель: MVP «депозит подписки = UserBalance.balance», один кошелёк, пополнение только через подписку, ежедневные списания, 30/90/180/360 дней.

---

## 1. Сущности и таблицы

### Баланс / депозит / транзакции

| Сущность | Таблица | Модель (файл) | Описание |
|----------|---------|----------------|----------|
| **UserBalance** | `user_balances` | `models.UserBalance` | `user_id` (unique), `balance` (руб), `currency`. Единый счёт. **MVP: это и есть депозит подписки.** |
| **BalanceTransaction** | `balance_transactions` | `models.BalanceTransaction` | `user_id`, `amount`, `transaction_type` (DEPOSIT, WITHDRAWAL, REFUND, UPGRADE, SUB_DAILY_FEE, SERV_FEE), `subscription_id`, `balance_before`, `balance_after`, `description`, `created_at`. История операций. |

### Подписка, планы, резерв, списания, платежи

| Сущность | Таблица | Модель | Описание |
|----------|---------|--------|----------|
| **SubscriptionPlan** | `subscription_plans` | `models.SubscriptionPlan` | Планы (Free, Pro, …). `price_1month`, `price_3months`, `price_6months`, `price_12months`, `freeze_days_*`, `features`, `limits`, `display_order`. |
| **Subscription** | `subscriptions` | `models.Subscription` | `user_id`, `subscription_type` (MASTER/SALON), `status`, `plan_id`, `start_date`, `end_date`, `price`, `daily_rate`, `is_active`, `auto_renewal`, … |
| **SubscriptionReservation** | `subscription_reservations` | `models.SubscriptionReservation` | `user_id`, `subscription_id`, `reserved_amount`. **Сейчас:** часть баланса «зарезервирована» под подписку; available = balance − Σ reserved. **MVP:** вывести из бизнес-логики, остаток = UserBalance.balance. |
| **SubscriptionPriceSnapshot** | `subscription_price_snapshots` | `models.SubscriptionPriceSnapshot` | Снимок расчёта: `plan_id`, `duration_months`, `total_price`, `final_price`, `upgrade_type`, `reserved_balance`, `credit_amount`, `expires_at` (TTL ~30 мин). |
| **SubscriptionFreeze** | `subscription_freezes` | `models.SubscriptionFreeze` | Заморозка подписки (даты, `freeze_days`). |
| **DailySubscriptionCharge** | `daily_subscription_charges` | `models.DailySubscriptionCharge` | `subscription_id`, `charge_date`, `amount`, `daily_rate`, `balance_before`, `balance_after`, `status` (SUCCESS/FAILED/PENDING). История списаний. |
| **Payment** | `payments` | `models.Payment` | Robokassa: `user_id`, `amount`, `status`, `payment_type` (subscription/deposit), `robokassa_invoice_id`, `subscription_apply_status`, `payment_metadata`, … |

---

## 2. Эндпоинты

### /api/balance/*

| Метод | Путь | Файл | Описание |
|-------|------|------|----------|
| GET | `/api/balance/` | `routers/balance.py` → `get_balance` | `balance`, `currency`, `available_balance`, `reserved_total`. |
| POST | `/api/balance/deposit` | `routers/balance.py` → `deposit_balance_endpoint` | **Сейчас:** 410, текст «Пополнение только через оплату подписки…». |
| GET | `/api/balance/transactions` | `routers/balance.py` → `get_transaction_history` | История `BalanceTransaction`. |
| GET | `/api/balance/subscription-status` | `routers/balance.py` → `get_subscription_status_endpoint` | Статус подписки: дни, дневная ставка, баланс, can_continue, plan_name, … |
| GET | `/api/balance/low-balance-warning` | `routers/balance.py` → `get_low_balance_warning` | Предупреждение о низком балансе. |
| POST | `/api/balance/test-daily-charge` | `routers/balance.py` → `test_daily_charge` | Ручной запуск daily charge (dev). |

### /api/subscriptions/*

| Метод | Путь | Файл | Описание |
|-------|------|------|----------|
| GET | `/api/subscriptions/my` | `routers/subscriptions.py` → `get_my_subscription` | Текущая подписка (effective). |
| POST | `/api/subscriptions/calculate` | `routers/subscriptions.py` → `calculate_subscription` | Расчёт: `plan_id`, `duration_months`, `upgrade_type` → snapshot, `final_price`, `requires_immediate_payment`. |
| DELETE | `/api/subscriptions/calculate/{id}` | `routers/subscriptions.py` | Удаление snapshot. |
| POST | `/api/subscriptions/apply-upgrade-free` | `routers/subscriptions.py` → `apply_upgrade_free` | Применить апгрейд при `final_price ≤ 0` по `calculation_id`. |

### /api/payments/*

| Метод | Путь | Файл | Описание |
|-------|------|------|----------|
| POST | `/api/payments/subscription/init` | `routers/payments.py` → `init_subscription_payment` | Инит платежа подписки → `payment_id`, `payment_url` (Robokassa). |
| POST | `/api/payments/deposit/init` | `routers/payments.py` → `init_deposit_payment` | **Сейчас:** 410. Раньше — пополнение «просто так» через Robokassa. |
| POST | `/api/payments/robokassa/result` | `routers/payments.py` → `robokassa_result` | Callback Robokassa: пометить paid, начислить депозит (UserBalance), применить подписку. |

### Другие

- `GET /api/subscription-plans/available` — планы.
- `GET /api/master/subscription/features` — фичи мастера (`has_extended_stats`, `plan_name`, …).

---

## 3. Схема потоков

### Целевой поток (MVP)

```
Выбор плана (1/3/6/12 мес.)
    → POST /api/subscriptions/calculate (plan_id, duration_months, upgrade_type)
    → snapshot, final_price, requires_immediate_payment

Если final_price > 0:
    → POST /api/payments/subscription/init (calculation_id, …)
    → payment_id, payment_url (Robokassa)
    → редирект на Robokassa, оплата

Robokassa callback:
    → POST /api/payments/robokassa/result (OutSum, InvId, SignatureValue, …)
    → проверка подписи
    → Payment.status = paid
    → начисление в UserBalance.balance (add_balance_transaction DEPOSIT)
    → создание/обновление Subscription (plan, start_date, end_date, daily_rate)
    → [сейчас ещё SubscriptionReservation, move_available_to_reserve при apply]

Ежедневный job (daily_charges.process_all_daily_charges):
    → для каждой активной подписки process_daily_charge
    → [сейчас] списание из SubscriptionReservation.reserved_amount, add_balance_transaction SUB_DAILY_FEE
    → [MVP] списание из UserBalance.balance; при balance < daily_rate → деактивация, запись в историю (FAILED + reason)
```

### Текущие отличия от MVP

- **Два «остатка»:** `UserBalance.balance` и `SubscriptionReservation.reserved_amount`. available = balance − reserved. Списания идут из резерва, баланс тоже уменьшается через SUB_DAILY_FEE.
- **MVP:** один остаток = `UserBalance.balance`. Резерв не использовать в calculate/apply/charge.
- **Пополнение:** `POST /balance/deposit` и `POST /payments/deposit/init` уже 410. UI: убрать любые «пополнить баланс» не через подписку.

---

## 4. Длительности 1/3/6/12 месяцев и days-per-month

Единый источник: **`backend/constants.py`** — `DURATION_DAYS = {1:30, 3:90, 6:180, 12:360}`, `duration_months_to_days(months)`.

### Backend

| Файл | Строки / контекст |
|------|-------------------|
| `backend/constants.py` | 5–17: `DURATION_DAYS`, `DAYS_PER_MONTH`, `duration_months_to_days`. |
| `backend/routers/subscriptions.py` | 35, 82, 238, 304, 878–917, 967–981, 1030–1034, 1062, 1079, 1203: проверка 1/3/6/12, `duration_months_to_days`, `price_1month`…`price_12months`, snapshot. |
| `backend/routers/payments.py` | 31, 107, 120–128, 167, 181, 437–445, 461–462: `duration_months`, `duration_months_to_days`, цены по периодам. |
| `backend/schemas.py` | 988, 997, 2363–2368, 2385–2388, 2521: `duration_months`, `price_1month`…`price_12months`. |
| `backend/models.py` | 718, 721–724, 1786–1793: `SubscriptionPriceSnapshot.duration_months`; `SubscriptionPlan` price_*/freeze_days_*. |
| `backend/routers/subscription_plans.py` | 162–176, 282–292: валидация цен, «пакет 1 месяц» и т.д. |
| `backend/routers/admin.py` | 111, 125, 147, 153: `DAYS_PER_MONTH`, `duration_months`, `timedelta`. |
| `backend/tests/test_apply_upgrade_free.py` | 25–28, 55–56, 88–92, 120–121, …: планы `{"1":…,"3":…,"6":…,"12":…}`, `duration_months`. |
| `backend/tests/test_subscription_calculate_contract.py` | 13–16, 43–44, 66, 78, 84, 95–97, 102: то же. |
| `backend/scripts/create_test_users_balance_system.py` | `DAYS_PER_MONTH`, 12*DAYS, 1 month = 30. |

### Frontend (web)

| Файл | Строки / контекст |
|------|-------------------|
| `frontend/src/components/SubscriptionModal.jsx` | 93–99, 107–110, 184, 287, 486: `[1,3,6,12]`, `price_1month`…`price_12months`, `duration_months`. |
| `frontend/src/pages/MasterTariff.jsx` | 896–899: `<option value="1">1 месяц</option>` и т.д. |
| `frontend/src/components/SubscriptionPlanForm.jsx` | 145–153, 240–290, 312–371: валидации, «пакет 1 месяц»…«12 месяцев», `freeze_days_*`. |
| `frontend/src/pages/AdminUsers.jsx` | 712: `plan.price_1month`. |

### Mobile

| Файл | Строки / контекст |
|------|-------------------|
| `mobile/src/components/subscriptions/SubscriptionPurchaseModal.tsx` | 30, 44, 150–151, 331, 425, 439, 465: `DURATIONS [1,3,6,12]`, `price_1month`…`price_12months`, `duration_months`. |
| `mobile/src/services/api/subscriptions.ts` | 62, 70: типы `duration_months: 1|3|6|12`. |
| `mobile/src/utils/featureAccess.ts` | 47–50: `price_1month` для «самого дешёвого» плана. |

### Админка / доки

- `SubscriptionPlanForm.jsx` — форма планов (цены, заморозки).
- `docs/SUBSCRIPTION_DEPOSIT_AUDIT.md`, `SUBSCRIPTION_DEPOSIT_IMPLEMENTATION.md` — упоминания 1/3/6/12, 30/90/180/360.

---

## 5. Ежедневные списания (текущая логика)

- **Сервис:** `services/daily_charges.py` → `process_all_daily_charges(charge_date)`.
- **Ядро:** `utils/balance_utils.py` → `process_daily_charge(db, subscription_id, charge_date)`.
  - Заморозка: запись в `DailySubscriptionCharge` с `amount=0`, `status=PENDING`, balance без изменений.
  - Иначе: `daily_rate = subscription.daily_rate`, резерв = `SubscriptionReservation.reserved_amount`.
  - Если `reserved < daily_rate` → запись `DailySubscriptionCharge` с `status=FAILED`, `subscription.is_active = False`, возврат `subscription_deactivated: True`.
  - Иначе: `reservation.reserved_amount -= daily_rate`, `add_balance_transaction(…, amount=-daily_rate, SUB_DAILY_FEE)`, запись `DailySubscriptionCharge` с `status=SUCCESS`, `balance_before`/`balance_after`.

**MVP:** списывать из `UserBalance.balance`; при `balance < daily_rate` → деактивация, запись в историю с reason; резерв не использовать.

---

## 6. Где формируется payment_url

- **Файл:** `backend/routers/payments.py`.
- **Функция:** `init_subscription_payment` (POST `/api/payments/subscription/init`).
- **Конфиг:** `utils/robokassa.get_robokassa_config()` из env: `ROBOKASSA_MERCHANT_LOGIN`, `ROBOKASSA_PASSWORD_1/2`, `ROBOKASSA_IS_TEST`, `ROBOKASSA_RESULT_URL`, `ROBOKASSA_SUCCESS_URL`, `ROBOKASSA_FAIL_URL`.
- **Генерация URL:** `utils/robokassa.generate_payment_url(...)` → `https://auth.robokassa.ru/Merchant/Index.aspx?...`.

---

*Конец read-only аудита. Дальше — шаги 1–5 (правки кода, тесты, доки).*
