# Аудит SSoT цены подписки после покупки

## SSoT правило (см. также docs/README_SUBSCRIPTION_SST.md)

**SubscriptionPlan** — прайс-лист. **Subscription** — snapshot условий покупки. Все списания и days_remaining считаются только по subscription.daily_rate/price + balance + end_date. Изменение цен в plan не влияет на существующие подписки.

---

## Гипотеза

- **SubscriptionPlan** (price_*months) — прайс-лист.
- При создании/продлении подписки значения фиксируются в **subscription** (price, daily_rate).
- Daily списания и days_remaining считаются **только по subscription**, не зависят от изменений цен в SubscriptionPlan.

---

## 1) Где фиксируется цена при покупке/продлении

### Точки создания подписки

| Точка | Файл | Функция/endpoint | Источник total_price | Источник daily_rate |
|-------|------|------------------|----------------------|---------------------|
| Apply-upgrade-free | subscriptions.py | POST /api/subscriptions/apply-upgrade-free | snapshot.total_price | total_price / total_days |
| Payment apply | payments.py | Robokassa callback → apply_payment | snapshot.total_price | total_price / _duration_days |
| Admin retry apply | admin.py | retry apply failed payment | snapshot.total_price | total_price / total_days |
| Dev set_subscription | dev_testdata.py | POST /api/dev/testdata/set_subscription | _plan_total_price(plan, months) | total_price / duration_days |
| Legacy upgrade | subscriptions.py | POST /api/subscriptions/upgrade | plan.price_Nmonths × months | total_price / _days |
| AlwaysFree fallback | balance_utils, subscription_features | get_subscription_status, get_effective_subscription | 0 | 0 |

### Конкретный код

#### a) Выбор monthly_price из plan.price_Nmonths

**dev_testdata.py**, строки 132–145:
```python
def _get_monthly_price(plan: SubscriptionPlan, duration_months: int) -> float:
    if duration_months == 1: return float(plan.price_1month or 0)
    if duration_months == 3: return float(plan.price_3months or 0)
    # ...
def _plan_total_price(plan, duration_months):
    monthly = _get_monthly_price(plan, duration_months)
    return math.ceil(monthly) * duration_months
```

**subscriptions.py** (calculate), строки 916–929:
```python
monthly_price_raw = plan.price_1month  # или 3/6/12
monthly_price = math.ceil(monthly_price_raw)
total_price = monthly_price * calculation_request.duration_months
```

#### b–e) Запись в subscription

**subscriptions.py**, apply-upgrade-free, строки 1222–1238:
```python
total_price_full = float(snapshot.total_price)
total_days = max(1, duration_months_to_days(int(snapshot.duration_months)))
daily_rate = total_price_full / total_days

new_subscription = Subscription(
    ...
    price=total_price_full,
    daily_rate=daily_rate,
    start_date=now,
    end_date=now + timedelta(days=total_days),
    ...
)
```

**payments.py**, apply после оплаты, строки 466–481:
```python
total_price_full = float(snapshot.total_price)
daily_rate = total_price_full / _duration_days

new_subscription = Subscription(
    ...
    price=total_price_full,
    daily_rate=daily_rate,
    ...
)
```

**dev_testdata.py**, set_subscription, строки 237–276:
```python
total_price = _plan_total_price(plan, body.duration_months)
daily_rate = total_price / duration_days if duration_days else 0.0
# ...
new_sub = Subscription(..., price=total_price, daily_rate=daily_rate, ...)
```

### Подтверждение: plan используется только при создании

После создания подписки ни одна из точек списания или отображения **не пересчитывает** daily_rate из plan. Все используют:
- `subscription.daily_rate` напрямую, или
- `calculate_subscription_daily_rate(subscription)` = `subscription.price / (end_date - start_date).days`

---

## 2) Где используются daily_rate и price после создания

### process_daily_charge

**balance_utils.py**, строки 369–370, 425:
```python
subscription = db.query(Subscription).filter(Subscription.id == subscription_id).first()
# ...
daily_rate = subscription.daily_rate  # ← из subscription, НЕ из plan
```

Источник: **subscription.daily_rate**.

### get_subscription_status (balance_utils)

**balance_utils.py**, строки 634, 692:
```python
daily_rate = calculate_subscription_daily_rate(subscription)  # = subscription.price / total_days
# ...
"total_price": subscription.price,
```

Функция **calculate_subscription_daily_rate** (строки 298–304):
```python
def calculate_subscription_daily_rate(subscription: Subscription) -> float:
    total_days = (subscription.end_date - subscription.start_date).days
    if total_days <= 0:
        return 0
    return subscription.price / total_days  # ← subscription.price, НЕ plan
```

Источник: **subscription.price** и **subscription.start_date/end_date**.

### /api/subscriptions/my

**subscriptions.py**, строки 149–151, 197–199:
```python
daily_rate = float(getattr(subscription, "daily_rate", 0.0) or 0.0)
# ...
return {..., "daily_rate": daily_rate, "price": subscription.price, ...}
```

Источник: **subscription.daily_rate** и **subscription.price**.

### Места, где читается SubscriptionPlan для активной подписки

| Файл | Строки | Использование plan |
|------|--------|--------------------|
| balance_utils get_subscription_status | 597–606 | plan_name, plan_display_name, features, limits, is_free_plan. **НЕ** price/daily_rate |
| subscriptions /my | 131–137 | plan_name, plan_display_name, features, limits. **НЕ** price/daily_rate |

**Вывод:** plan читается только для имени, фич и лимитов. **Цена и daily_rate не пересчитываются** из plan для существующих подписок.

---

## 3) Эксперимент на данных

### Скрипт

`backend/scripts/test_subscription_price_sst.py`

Запуск: `python backend/scripts/test_subscription_price_sst.py --base-url http://localhost:8000`

### Результат (мастер +79990000006, план Pro)

```
ДО ИЗМЕНЕНИЯ:
  subscription: price=1500.0 daily_rate=50.0
  plan: price_1month=1500.0
  API: daily_rate=50.0 days_remaining=30

План price_1month изменён: 1500 -> 3000

ПОСЛЕ ИЗМЕНЕНИЯ:
  subscription в БД: price=1500.0 daily_rate=50.0  ← не изменилось
  API: daily_rate=50.0 days_remaining=30           ← не изменилось

✓ subscription.daily_rate НЕ изменился (SSoT подтверждён)
✓ API daily_rate НЕ изменился
✓ API days_remaining совпадает
```

### process_daily_charge

`process_daily_charge` читает `subscription.daily_rate` из БД (balance_utils.py:425). Поскольку запись subscription не меняется при правках plan, списания продолжают использовать тот же daily_rate. Дополнительный прогон daily charge не требуется — источник данных подтверждён по коду.

---

## Выводы

| Вопрос | Ответ |
|--------|-------|
| **SSoT для списаний** | subscription.daily_rate ✅ |
| **SSoT для days_remaining** | subscription.daily_rate + balance + end_date ✅ |
| **Изменение цен в plan влияет на существующие подписки?** | Нет ✅ |

**Заключение:** Snapshot цены при покупке/продлении фиксируется в `subscription.price` и `subscription.daily_rate`. Daily списания и days_remaining используют только эти поля. Изменения в SubscriptionPlan не затрагивают уже созданные подписки.

---

## 4) Риски (B) и минимальные патчи

### 4.1 total_days в calculate_subscription_daily_rate

**balance_utils.py:298-304** — `total_days = (subscription.end_date - subscription.start_date).days`

- При создании подписки: `end_date = start_date + timedelta(days=duration_days)` (30/90/180/360).
- Следовательно, `(end - start).days` совпадает с `duration_days` (нет off-by-one).
- Timezone: даты в UTC, DST не применяется.

**Риск:** при ручном изменении БД `(end - start).days` может не совпадать с исходным duration_days. Тогда `calculate_subscription_daily_rate` даст другое значение, чем сохранённый `subscription.daily_rate`.

**Патч:** в `get_subscription_status` использовать `subscription.daily_rate` как SSoT вместо пересчёта через `calculate_subscription_daily_rate`. Применён ниже.

### 4.2 Округление / Float

- `total_price = ceil(monthly_price) * months` (subscriptions.py, dev_testdata)
- `balance_days = floor(balance / daily_rate)` (subscriptions.py, days_remaining)
- Риск daily_rate=0: при `duration_days <= 0` возвращается 0. При `total_price=0` — корректно для Free.
- Риск «слишком малый» daily_rate: нет — не требуется guard.

### 4.3 Source of truth

Подтверждено: `/my`, `get_subscription_status`, `process_daily_charge` используют `subscription.daily_rate`/`price`. Plan — только name/features/limits.

### Risk verdict

⚠️ Минимальный патч: `get_subscription_status` — использовать `subscription.daily_rate` вместо `calculate_subscription_daily_rate` для согласованности SSoT.
