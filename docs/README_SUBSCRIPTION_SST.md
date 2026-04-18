# SSoT цены подписки — правило системы

## Правило (не нарушать)

**SubscriptionPlan** — это прайс-лист. Цены в нём могут меняться со временем.

**Subscription** (конкретного мастера) — это **snapshot условий** на момент покупки/продления:

- `subscription.price` = полная стоимость периода (total_price)
- `subscription.daily_rate` = total_price / duration_days
- `start_date` / `end_date` фиксируются при создании

Все списания и расчёт `days_remaining` используют **только** `subscription.daily_rate`, `subscription.price`, `user_balance.balance` и `subscription.end_date`. **SubscriptionPlan не участвует** в этих расчётах для уже созданных подписок.

**Изменение цен в SubscriptionPlan НЕ влияет на существующие подписки.** Влияет только на новые покупки и продления.

---

## Ключевые места в коде

| Действие | Файл | Функция/endpoint |
|----------|------|------------------|
| Фиксация snapshot при создании | `routers/subscriptions.py` | apply-upgrade-free, calculate |
| Фиксация snapshot при оплате | `routers/payments.py` | apply после Robokassa |
| Dev: фиксация snapshot | `routers/dev_testdata.py` | set_subscription |
| Daily списания | `utils/balance_utils.py` | process_daily_charge (использует subscription.daily_rate) |
| days_remaining | `routers/subscriptions.py` | GET /api/subscriptions/my |
| Статус подписки | `utils/balance_utils.py` | get_subscription_status |

**GET /api/subscriptions/my** — read-only; never creates subscriptions. Returns 404 `detail="no_subscription"` when none exists.

**Округление daily_rate/charge:** при создании подписки `daily_rate = ceil(total_price/days)` (целые рубли). При списании `charge_amount = int(round(subscription.daily_rate))`. Сумма списаний может быть чуть больше total_price — приемлемо.

---

## Регресс-тесты

- `backend/scripts/full_regression_subscriptions.py` — **full regression**: reseed + 8 мастеров + daily charges на 2 даты, таблица ожидаемо/фактически
- `backend/scripts/test_subscription_price_sst.py` — проверка, что изменение plan не затрагивает существующую подписку
- `backend/scripts/test_subscription_price_renewal_after_plan_change.py` — проверка BEFORE / AFTER / AFTER RENEWAL
- `backend/tests/test_subscription_price_sst.py` — pytest: plan change не влияет на subscription

### Full regression (подписки + daily charges)

```bash
python backend/scripts/full_regression_subscriptions.py --base-url http://localhost:8000
```

С опциями:
- `--no-reseed` — не запускать reseed в начале
- `--date1 2026-02-01 --date2 2026-02-02` — даты для daily charges

Требует: backend с ENVIRONMENT=development, админ +79031078685. Проверяет 8 мастеров (Free/stable/low), ожидает:
- low: day1 SUCCESS, day2 FAILED, после date2 no_subscription
- stable: day1/day2 SUCCESS
- free: SUCCESS с amount=0

## Подробности

См. `docs/SUBSCRIPTION_PRICE_SST_AUDIT.md`.
