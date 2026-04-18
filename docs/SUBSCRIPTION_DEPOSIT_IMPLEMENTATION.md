# MVP «баланс = депозит подписки» — реализация

## Что изменено

### Backend

| Файл | Изменения |
|------|-----------|
| `backend/constants.py` | **Новый.** `DURATION_DAYS = {1:30, 3:90, 6:180, 12:360}`, `duration_months_to_days(months)`. |
| `backend/routers/balance.py` | `POST /deposit` → всегда 410, текст: «Пополнение только через оплату подписки…». Убраны вызовы `deposit_balance`, `sync_reserve_for_user`. |
| `backend/routers/payments.py` | `POST /deposit/init` → всегда 410, тот же текст. В apply подписки после Robokassa: `duration_months_to_days`, `_duration_days` вместо `DAYS_PER_MONTH`. |
| `backend/routers/subscriptions.py` | Импорт `duration_months_to_days`. В `calculate`: проверка 1/3/6/12, `duration_days_val`, `daily_price = total_price / duration_days_val`, даты через `timedelta(days=duration_days_val)`. В `get_my_subscription`, `upgrade_subscription`, `apply_upgrade_free`: использование `duration_months_to_days`. MVP: кредит из резерва отключён; в apply-upgrade-free резерв не используется. |
| `backend/utils/balance_utils.py` | Ежедневное списание из `UserBalance.balance`. При `balance < daily_rate` → деактивация, `DailySubscriptionCharge` с `status=FAILED`, `reason`. `get_subscription_status`: `days_remaining = balance // daily_rate`, `reserved_days = days_remaining`, `can_continue = balance >= daily_rate`. |
| `backend/services/daily_charges.py` | Убраны `ensure_reserve_for_remaining_days`, импорт `or_`. |
| `backend/models.py` | В `DailySubscriptionCharge` добавлено поле `reason` (Text, nullable). |
| `backend/alembic/versions/20260128_add_reason_to_daily_subscription_charges.py` | Миграция: колонка `reason`. |
| `backend/tests/test_deposit_410.py` | **Новый.** Тесты: `POST /balance/deposit` и `POST /payments/deposit/init` → 410. |

### Web

| Файл | Изменения |
|------|-----------|
| `frontend/src/pages/MasterDashboard.jsx` | Удалены `DepositModal`, «Пополнить баланс». Карточка: «Баланс» + «Дней осталось» + кнопка «Продлить / Апгрейд» → `setShowSubscriptionModal(true)`. |

### Mobile

| Файл | Изменения |
|------|-----------|
| `mobile/app/index.tsx` | В карточке подписки: «Баланс» + «Дней осталось» (через `getDaysRemaining(subscription.end_date)` при `subscription?.end_date`). |

---

## MVP-модель баланса

В MVP **`UserBalance.balance`** — это **текущий остаток депозита подписки** (не «первоначально оплаченная сумма» и не «общий кошелёк»). Деньги уже получены нами; для продукта ведём учёт остатка и ежедневных списаний.

- **Ежедневное списание:** `balance -= daily_rate` (списание из остатка депозита).
- **При `balance < daily_rate`:** подписка деактивируется (переход в Base), в `DailySubscriptionCharge` создаётся запись с `status=FAILED` и `reason`.
- **Пополнение:** только через оплату подписки/продления/апгрейда (Robokassa). Вывод и произвольное пополнение недоступны.

**Примеры расчёта:**

1. Оплата 3000 ₽ за 1 месяц (30 дней) → `balance += 3000`, `daily_rate = 100`. Каждый день `balance -= 100`; через 30 дней остаток 0. При `balance < 100` до конца периода — деактивация.
2. Остаток 500 ₽, `daily_rate = 50` → `days_remaining = 500 // 50 = 10` дней.
3. Остаток 30 ₽, `daily_rate = 50` → списание не проходит → подписка деактивируется, в истории `reason`: «daily_rate > balance (недостаточно средств на депозите)».

---

## Депозит, остаток, списания

- **Депозит** = `UserBalance.balance` (единственный остаток). Резерв в MVP не используется.
- **Дней осталось:** `subscription_status.days_remaining` = `balance // daily_rate` (floor); в mobile также `getDaysRemaining(end_date)` при отображении.
- **Ежедневное списание:** `process_daily_charge` списывает `daily_rate` из `UserBalance.balance`. При `balance < daily_rate` → подписка деактивируется, в `DailySubscriptionCharge` запись с `status=FAILED` и `reason`.

---

## Upgrade / renew

- **Расчёт:** `POST /api/subscriptions/calculate` (plan_id, duration_months 1/3/6/12, upgrade_type). Длительность в днях через `duration_months_to_days` → 30/90/180/360.
- **Оплата:** `POST /api/payments/subscription/init` → `payment_url` (Robokassa). Callback `robokassa/result` → начисление в `UserBalance.balance`, создание/обновление подписки. Резерв не используется.
- **Бесплатное применение:** при `final_price <= 0` — `POST /api/subscriptions/apply-upgrade-free` по `calculation_id`.

---

## payment_url и payment_url_diag

- **Формирование:** `backend/routers/payments.py`, `init_subscription_payment`. Вызов `generate_payment_url(...)` с `config` из `get_robokassa_config()` (env: `ROBOKASSA_*`).
- **Пример лога:** `TAG: payment_url_diag user_id=... phone=... env=... merchant_login=... is_test=... payment_url_domain=... success_url_domain=... fail_url_domain=... result_url_domain=...`  
  Подробно: `docs/SUBSCRIPTION_PAYMENT_URL_DIAG.md`.
- **Где смотреть:** логи backend (stdout/stderr uvicorn); в __DEV__ mobile — лог `[PAYMENT] Opening payment_url` в `SubscriptionPurchaseModal` перед `Linking.openURL`.

---

## Smoke checklist

1. **Оплата → депозит вырос → подписка активна:** оплата через Robokassa по счёту подписки → `UserBalance.balance` увеличился, подписка активна, фичи Pro доступны.
2. **Ежедневное списание:** подписка активна → daily job → в `daily_subscription_charges` запись, `UserBalance.balance` уменьшился.
3. **Апгрейд меняет дневную цену:** upgrade → новый `daily_rate`, списания по новой ставке.
4. **Списание > остатка → отключение Pro:** при `balance < daily_rate` подписка деактивируется, Pro недоступен, в UI «нужно пополнить»/апгрейд.
5. **«Баланс» только как депозит:** нет отдельного пополнения «просто так»; `POST /balance/deposit` и `POST /payments/deposit/init` → 410.
6. **30/90/180/360 в UI и расчётах:** везде длительности пакетов 1/3/6/12 мес. соответствуют 30/90/180/360 дней в бэкенде и в отображении «дней осталось».
7. **payment_url_diag:** при `PAYMENT_URL_DEBUG=1` или `ENVIRONMENT=development` в логах есть `TAG: payment_url_diag` с доменами (см. `docs/SUBSCRIPTION_PAYMENT_URL_DIAG.md`).
