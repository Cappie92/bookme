# Read-first аудит: биллинг, подписки, баланс, payment_url, длительности

Перед реализацией MVP «баланс = депозит подписки».

---

## 1. Сущности / таблицы / модели и API

### Balance / budget / user_balance / transactions

| Сущность | Таблица | Модель | Описание |
|----------|---------|--------|----------|
| **UserBalance** | `user_balances` | `models.UserBalance` | `user_id`, `balance` (руб), `currency`. Единый счёт пользователя. |
| **BalanceTransaction** | `balance_transactions` | `models.BalanceTransaction` | `user_id`, `amount`, `transaction_type` (DEPOSIT, WITHDRAWAL, REFUND, UPGRADE, SUB_DAILY_FEE, SERV_FEE), `subscription_id`, `balance_before`, `balance_after`, `description`, `created_at`. История операций по балансу. |
| **SubscriptionReservation** | `subscription_reservations` | `models.SubscriptionReservation` | `user_id`, `subscription_id`, `reserved_amount`. Резерв под конкретную подписку. Доступный баланс = `UserBalance.balance - sum(reserved_amount)` по пользователю. |

**API:**

| Метод | Путь | Файл | Описание |
|-------|------|------|----------|
| GET | `/api/balance/` | `routers/balance.py` → `get_balance` | Возвращает `balance`, `currency`, `available_balance`, `reserved_total`. |
| POST | `/api/balance/deposit` | `routers/balance.py` → `deposit_balance_endpoint` | **MVP:** всегда 410. «Пополнение только через оплату подписки (Продлить/Апгрейд)». |
| GET | `/api/balance/transactions` | `routers/balance.py` → `get_transaction_history` | История `BalanceTransaction`. |
| GET | `/api/balance/subscription-status` | `routers/balance.py` → `get_subscription_status_endpoint` | Статус подписки (дни, дневная ставка, баланс, can_continue и т.д.). |
| GET | `/api/balance/low-balance-warning` | `routers/balance.py` → `get_low_balance_warning` | Предупреждение о низком балансе. |
| POST | `/api/balance/test-daily-charge` | `routers/balance.py` → `test_daily_charge` | Ручной запуск ежедневного списания (dev). |

**Утилиты:** `utils/balance_utils.py` — `get_or_create_user_balance`, `get_user_reserved_total`, `get_user_available_balance`, `move_available_to_reserve`, `reserve_full_subscription_price`, `deposit_balance`, `withdraw_balance`, `add_balance_transaction`, `process_daily_charge`, `get_subscription_status`, `sync_reserve_for_user`, …

---

### Subscription: plan, subscription, reservation, payment, apply-upgrade, calculate, features

| Сущность | Таблица | Модель | Описание |
|----------|---------|--------|----------|
| **SubscriptionPlan** | `subscription_plans` | `models.SubscriptionPlan` | Планы (Free, Pro, …). `price_1month`, `price_3months`, `price_6months`, `price_12months`, `freeze_days_*`, `features`, `limits`, `display_order`. |
| **Subscription** | `subscriptions` | `models.Subscription` | `user_id`, `subscription_type` (MASTER/SALON), `status`, `plan_id`, `start_date`, `end_date`, `price`, `daily_rate`, `is_active`, `auto_renewal`, … |
| **SubscriptionReservation** | см. выше | | Резерв под подписку. |
| **SubscriptionPriceSnapshot** | `subscription_price_snapshots` | `models.SubscriptionPriceSnapshot` | Снимок расчёта: `plan_id`, `duration_months`, `total_price`, `final_price`, `upgrade_type`, `expires_at`. TTL ~30 мин. |
| **SubscriptionFreeze** | `subscription_freezes` | `models.SubscriptionFreeze` | Заморозка подписки (даты, `freeze_days`). |
| **DailySubscriptionCharge** | `daily_subscription_charges` | `models.DailySubscriptionCharge` | Ежедневное списание: `subscription_id`, `charge_date`, `amount`, `daily_rate`, `balance_before`, `balance_after`, `status`. |
| **Payment** | `payments` | `models.Payment` | Платежи Robokassa: `user_id`, `amount`, `status`, `payment_type` (subscription/deposit), `robokassa_invoice_id`, `subscription_apply_status`, `payment_metadata`, … |

**API:**

| Метод | Путь | Файл | Описание |
|-------|------|------|----------|
| GET | `/api/subscriptions/my` | `routers/subscriptions.py` → `get_my_subscription` | Текущая подписка (effective). |
| GET | `/api/subscription-plans/available` | `routers/subscription_plans*.py` | Доступные планы. |
| POST | `/api/subscriptions/calculate` | `routers/subscriptions.py` → `calculate_subscription` | Расчёт по `plan_id`, `duration_months`, `upgrade_type`. Создаёт snapshot. |
| DELETE | `/api/subscriptions/calculate/{id}` | `routers/subscriptions.py` → `delete_calculation_snapshot` | Удаление snapshot. |
| POST | `/api/subscriptions/apply-upgrade-free` | `routers/subscriptions.py` → `apply_upgrade_free` | Применить апгрейд без оплаты (final_price ≤ 0) по `calculation_id`. |
| POST | `/api/payments/subscription/init` | `routers/payments.py` → `init_subscription_payment` | Инит платежа подписки → `payment_id`, `payment_url` (Robokassa). |
| POST | `/api/payments/deposit/init` | `routers/payments.py` → `init_deposit_payment` | **MVP:** всегда 410. Тот же текст, что и для `/api/balance/deposit`. |
| POST | `/api/payments/robokassa/result` | `routers/payments.py` → `robokassa_result` | Callback Robokassa: помечает paid, начисляет депозит, применяет подписку. |
| GET | `/api/master/subscription/features` | `routers/master.py` → `get_master_subscription_features` | Фичи мастера (`has_extended_stats`, `plan_name`, …). |

---

## 2. Где формируется payment_url и откуда success/fail/result

**Файл:** `backend/routers/payments.py`  
**Функция:** `init_subscription_payment` (эндпоинт `POST /api/payments/subscription/init`).

**Конфиг:** `utils/robokassa.get_robokassa_config()` читает env:

- `ROBOKASSA_MERCHANT_LOGIN`
- `ROBOKASSA_PASSWORD_1`, `ROBOKASSA_PASSWORD_2`
- `ROBOKASSA_IS_TEST`
- `ROBOKASSA_RESULT_URL` — ResultURL (callback)
- `ROBOKASSA_SUCCESS_URL` — успешная оплата (редирект)
- `ROBOKASSA_FAIL_URL` — неуспешная оплата (редирект)

**Фрагмент кода, собирающий URL:**

```python
# backend/routers/payments.py, init_subscription_payment
config = get_robokassa_config()
success_url_full = f"{config['success_url']}?payment_id={payment.id}"
fail_url_full = f"{config['fail_url']}?payment_id={payment.id}"
payment_url = generate_payment_url(
    merchant_login=config["merchant_login"],
    amount=total_price,
    invoice_id=invoice_id,
    description=description,
    password_1=config["password_1"],
    is_test=config["is_test"],
    result_url=config["result_url"],
    success_url=success_url_full,
    fail_url=fail_url_full,
)
```

**Генерация самого URL:** `utils/robokassa.generate_payment_url`. Базовый URL жёстко задан: `https://auth.robokassa.ru/Merchant/Index.aspx` (и test, и prod). Параметры: `MerchantLogin`, `OutSum`, `InvId`, `Description`, `SignatureValue`; при `is_test` — `IsTest=1`; при наличии — `ResultURL`, `SuccessURL`, `FailURL`.

**Пример лог-строки `payment_url_diag`** (при `PAYMENT_URL_DEBUG=1` или `ENVIRONMENT=development`):

```
payment_url_diag user_id=42 phone=+79991234567 env=development merchant=my_shop... is_test=True payment_url_domain=https://auth.robokassa.ru/Merchant/Index.aspx result_url_domain=http://localhost:8000/api/payments/robokassa/result success_url_domain=http://localhost:5173/payment/success fail_url_domain=http://localhost:5173/payment/failed
```

**Где смотреть:**

- **Backend:** stdout/stderr процесса API (uvicorn/gunicorn) или централизованные логи приложения.
- **Mobile (DEV):** в консоли Metro/Expo при нажатии «Перейти к оплате» логируется `[PAYMENT] Opening payment_url` с `domain` / `origin` (см. `SubscriptionPurchaseModal`).

---

## 3. Длительности пакетов (1 / 3 / 6 / 12 месяцев)

Жёстко заданы в коде и UI. Ниже — все найденные места.

### Backend

| Файл | Строки / контекст |
|------|-------------------|
| `routers/subscriptions.py` | `DAYS_PER_MONTH = 30`; проверка `duration_months not in [1, 3, 6, 12]`; выбор `price_1month` / `price_3months` / …; `duration_days = duration_months * DAYS_PER_MONTH`; `timedelta(days=...)`. |
| `routers/payments.py` | Fallback по `duration_months` (1/3/6/12) для `monthly_price`; `DAYS_PER_MONTH = 30`; `timedelta(days=int(snapshot.duration_months) * DAYS_PER_MONTH)`. |
| `routers/admin.py` | `DAYS_PER_MONTH = 30`; `timedelta(days=...* DAYS_PER_MONTH)`. |
| `schemas.py` | `duration_months: int` (1, 3, 6, 12); `price_1month` … `price_12months`, `freeze_days_1month` … `freeze_days_12months`. |
| `models.py` | `SubscriptionPriceSnapshot.duration_months`; `SubscriptionPlan`: `price_1month` … `price_12months`, `freeze_days_1month` … `freeze_days_12months`. |
| `utils/balance_utils.py` | Длительности через `subscription.start_date` / `end_date` и `daily_rate` (считаются в подписке). |
| `scripts/create_test_users_balance_system.py` | `DAYS_PER_MONTH = 30`; 12 месяцев = `12 * DAYS_PER_MONTH` (360), 1 месяц = 30. |
| `tests/test_apply_upgrade_free.py`, `test_subscription_calculate_contract.py` | Планы с `{"1":..., "3":..., "6":..., "12":...}`; вызовы API с `duration_months` 1 или 3. |
| `routers/subscription_plans.py` | Валидация `price_1month` ≥ `price_3months` ≥ …; тексты «пакет 1 месяц», «3 месяца» и т.д. |

### Web (frontend)

| Файл | Строки / контекст |
|------|-------------------|
| `components/SubscriptionModal.jsx` | `[1, 3, 6, 12].map(...)`; `duration_months`; `price_1month` … `price_12months`. |
| `pages/MasterTariff.jsx` | `<option value="1">1 месяц</option>` и аналоги для 3, 6, 12. |
| `components/SubscriptionPlanForm.jsx` | Валидации и подписи «пакет 1 месяц», «3 месяца», …; `freeze_days_1month` … `freeze_days_12months`. |

### Mobile

| Файл | Строки / контекст |
|------|-------------------|
| `SubscriptionPurchaseModal.tsx` | `DURATIONS: Array<1 \| 3 \| 6 \| 12> = [1, 3, 6, 12]`; `duration_months`; `price_1month` … `price_12months`. |
| `services/api/subscriptions.ts` | Типы `duration_months: 1 \| 3 \| 6 \| 12` и т.п. |
| `utils/featureAccess.ts` | Использование `price_1month` для «самого дешёвого» плана. |

### Админка / страницы покупки

| Файл | Контекст |
|------|----------|
| `SubscriptionPlanForm.jsx` | Форма планов (цены 1/3/6/12 мес., заморозки). |
| `MasterTariff.jsx` | Выбор периода 1/3/6/12 мес. |
| `SubscriptionModal.jsx` | Выбор длительности и расчёт. |
| `AdminUsers.jsx` | Отображение `plan.price_1month` и т.п. |

### Константы и валидации

- **Backend:** `duration_months in [1, 3, 6, 12]`; «Продолжительность должна быть 1, 3, 6 или 12 месяцев».
- **Фактическая длительность в днях:** везде `duration_months * DAYS_PER_MONTH` при `DAYS_PER_MONTH = 30` ⇒ 30 / 90 / 180 / 360 дней.
- **Важно:** используются `timedelta(days=...)`. `relativedelta(months=...)` в подписном биллинге не используется.

---

## 4. Краткие выводы для MVP

- **Баланс:** сейчас есть «абстрактное» пополнение через `POST /api/balance/deposit` (DepositModal) и отдельно Robokassa через `POST /api/payments/deposit/init` и `subscription/init`. Оба пути увеличивают `UserBalance.balance`.
- **Резерв:** `SubscriptionReservation.reserved_amount` — часть баланса, зарезервированная под подписку. Ежедневное списание уменьшает резерв и баланс (`process_daily_charge`).
- **Платёжный поток:** `payment_url` собирается в `payments.init_subscription_payment`; success/fail/result берутся из env (`ROBOKASSA_*_URL`). Лог `payment_url_diag` выводится в backend; в mobile DEV — лог при открытии ссылки.
- **Длительности:** повсеместно 1/3/6/12 месяцев; в расчётах — 30/90/180/360 дней через `DAYS_PER_MONTH = 30`. Для MVP достаточно зафиксировать 30/90/180/360 явно и убрать расхождения, если найдутся.
