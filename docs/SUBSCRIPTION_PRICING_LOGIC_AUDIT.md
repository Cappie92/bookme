# Аудит бизнес-логики цен подписки по длительности

## 1) Выбор цены тарифа по длительности

### Где происходит выбор

| Файл | Функция/участок | Строки |
|------|-----------------|--------|
| `backend/routers/subscriptions.py` | `calculate_subscription` (POST /api/subscriptions/calculate) | 916–924 |
| `backend/routers/subscriptions.py` | `_price_for_period` (внутренняя) | 996–1003 |
| `backend/routers/dev_testdata.py` | `_get_monthly_price` | 132–139 |
| `backend/routers/payments.py` | fallback при отсутствии snapshot | 118–126 |
| `backend/routers/subscriptions.py` | upgrade endpoint (legacy) | 328–335 |
| `backend/routers/admin.py` | apply upgrade от админа | 127–132 |

### Входные данные

- **duration_months** (1, 3, 6, 12)
- **plan_id** — ID плана SubscriptionPlan

### Маппинг duration_months → поле плана

```
duration_months == 1  → plan.price_1month
duration_months == 3  → plan.price_3months
duration_months == 6  → plan.price_6months
duration_months == 12 → plan.price_12months
```

### Семантика полей (по модели и комментариям)

Из `backend/models.py` строки 1789–1792:

```python
price_1month   = Column(Float, nullable=False)  # Цена за 1 месяц в пакете на 1 месяц
price_3months  = Column(Float, nullable=False)  # Цена за 1 месяц в пакете на 3 месяца
price_6months  = Column(Float, nullable=False)  # Цена за 1 месяц в пакете на 6 месяцев
price_12months = Column(Float, nullable=False)  # Цена за 1 месяц в пакете на 12 месяцев
```

**Вывод:** все четыре поля — это **цена за один месяц** для соответствующего пакета, а не цена за весь период.

---

## 2) Формула total_price

### Основной путь (calculate → apply / payment apply)

**Файл:** `backend/routers/subscriptions.py`, строки 916–930

```python
# Выбор месячной цены
if calculation_request.duration_months == 1:
    monthly_price_raw = plan.price_1month
elif calculation_request.duration_months == 3:
    monthly_price_raw = plan.price_3months
# ... аналогично для 6 и 12

monthly_price = math.ceil(monthly_price_raw)
total_price = monthly_price * calculation_request.duration_months
```

**Формула:**  
`total_price = ceil(monthly_price_raw) * duration_months`

То есть **total_price — это цена за весь период** = (цена за месяц) × (количество месяцев).

### Dev testdata (set_subscription)

**Файл:** `backend/routers/dev_testdata.py`, строки 142–145

```python
def _plan_total_price(plan: SubscriptionPlan, duration_months: int) -> float:
    monthly = _get_monthly_price(plan, duration_months)
    return math.ceil(monthly) * duration_months
```

Та же логика.

### Fallback в payments (без snapshot)

**Файл:** `backend/routers/payments.py`, строки 118–126

```python
if payment_request.duration_months == 12:
    monthly_price = plan.price_12months
# ... 6, 3, else 1
total_price = float(monthly_price) * float(payment_request.duration_months)
```

Аналогично.

### Legacy upgrade endpoint

**Файл:** `backend/routers/subscriptions.py`, строки 328–334

```python
if upgrade_request.payment_period == 'year':
    monthly_price = plan.price_12months
    total_price = monthly_price * 12
else:
    monthly_price = plan.price_1month
    total_price = monthly_price  # для 1 месяца
```

Поддерживаются только 1 и 12 месяцев; для `year` формула та же.

---

## 3) Расчёт daily_rate

### Где считается

| Место | Файл | Строки | Формула |
|-------|------|--------|---------|
| calculate | subscriptions.py | 938–940 | `daily_price = total_price / duration_days_val` |
| apply-upgrade-free | subscriptions.py | 1222–1224 | `daily_rate = total_price_full / total_days` |
| payments apply | payments.py | 460–467 | `daily_rate = total_price_full / _duration_days` |
| dev set_subscription | dev_testdata.py | 237–239 | `daily_rate = total_price / duration_days` |
| balance_utils | balance_utils.py | 298–304 | `subscription.price / (end_date - start_date).days` |

### duration_months → duration_days

**Файл:** `backend/constants.py`, строки 6–19

```python
DURATION_DAYS = {
    1: 30,
    3: 90,
    6: 180,
    12: 360,
}
def duration_months_to_days(months: int) -> int:
    return DURATION_DAYS.get(months, months * DAYS_PER_MONTH)
```

### Итоговая формула

```
daily_rate = total_price / duration_days
```

где `duration_days` = 30, 90, 180 или 360.

**Нет** формул вида `monthly_price / 30` для расчёта daily_rate — везде используется `total_price / duration_days`.

### balance_utils.calculate_subscription_daily_rate

**Файл:** `backend/utils/balance_utils.py`, строки 298–304

```python
def calculate_subscription_daily_rate(subscription: Subscription) -> float:
    total_days = (subscription.end_date - subscription.start_date).days
    if total_days <= 0:
        return 0
    return subscription.price / total_days
```

Используется `subscription.price` и фактическая длительность подписки в днях, а не сохранённый `subscription.daily_rate`. Это подходит для расчётов по уже созданной подписке (например, upgrade).

---

## 4) Что записывается в subscriptions

### Модель Subscription

**Файл:** `backend/models.py`, строки 674–676

```python
price = Column(Float, nullable=False)  # Общая стоимость в рублях
daily_rate = Column(Float, nullable=False)  # Стоимость одного дня в рублях
```

### Заполнение при создании подписки

**Apply-upgrade-free** (`subscriptions.py`, 1226–1238):

```python
new_subscription = Subscription(
    ...
    start_date=now,
    end_date=now + timedelta(days=total_days),
    price=total_price_full,      # total_price из snapshot
    daily_rate=daily_rate,       # total_price_full / total_days
    ...
)
```

**Payments apply** (`payments.py`, 469–481):

```python
new_subscription = Subscription(
    ...
    price=total_price_full,
    daily_rate=total_price_full / _duration_days,
    ...
)
```

**Dev set_subscription** (`dev_testdata.py`, 267–276):

```python
new_sub = Subscription(
    ...
    price=total_price,    # _plan_total_price(plan, duration_months)
    daily_rate=daily_rate,  # total_price / duration_days
    ...
)
```

### Итого по полям subscriptions

| Поле | Значение | Единица |
|------|----------|---------|
| price | Общая стоимость пакета | ₽ за весь период |
| daily_rate | total_price / duration_days | ₽/день |
| start_date | Дата начала | datetime |
| end_date | start_date + duration_days | datetime |

`duration_days` в БД не хранится, но восстанавливается как `(end_date - start_date).days`.

---

## 5) Сверка с админкой

### Endpoint планов

- **Admin:** `GET /api/admin/subscription-plans`
- **Публичный:** `GET /api/subscription-plans/available?subscription_type=master`

Оба возвращают объекты с полями `price_1month`, `price_3months`, `price_6months`, `price_12months`.

### Где выводятся цены

| Компонент | Файл | Строки | Отображение |
|-----------|------|--------|-------------|
| SubscriptionPlanForm | SubscriptionPlanForm.jsx | 238–304 | «Цена за месяц (пакет N месяцев)», подсказка «Общая стоимость: price_Nmonths * N ₽» |
| AdminFunctions (таблица планов) | AdminFunctions.jsx | 1822–1826 | «1м: X₽», «3м: Y₽», «6м: Z₽», «12м: W₽» |
| AdminUsers | AdminUsers.jsx | 712 | `plan.price_1month` как «X₽/мес» |
| MasterSubscriptionPlans | MasterSubscriptionPlans.jsx | 146 | monthly: `price_1month`, yearly: `price_12months * 12` |
| SubscriptionModal | SubscriptionModal.jsx | 93–108 | `price_1month`, `price_3months` и т.д. |

### Потенциальная неоднозначность

В `AdminFunctions.jsx` (1822–1826) колонка показывает:

```
1м: 1500₽
3м: 1500₽
6м: 1500₽
12м: 1250₽
```

Без подписи «за месяц» может показаться, что 1м = 1500₽ за весь период. На самом деле 1500₽ — это цена за месяц в пакете на 1 месяц.

В `SubscriptionPlanForm.jsx` подписи корректные: «Цена за месяц (пакет N месяцев)».

---

## 6) Итоговые выводы

### Семантика полей

| Поле | Значение |
|------|----------|
| **plan.price_1month** | Цена за 1 месяц при покупке пакета на 1 месяц (₽/мес) |
| **plan.price_3months** | Цена за 1 месяц при покупке пакета на 3 месяца (₽/мес) |
| **plan.price_6months** | Цена за 1 месяц при покупке пакета на 6 месяцев (₽/мес) |
| **plan.price_12months** | Цена за 1 месяц при покупке пакета на 12 месяцев (₽/мес) |
| **subscription.price** | Полная стоимость купленного пакета (₽ за весь период) |
| **subscription.daily_rate** | `subscription.price / duration_days` (₽/день) |

### Формулы

```
monthly_price   = plan.price_Nmonths  (N = 1, 3, 6, 12)
total_price     = ceil(monthly_price) * duration_months
duration_days   = 30 | 90 | 180 | 360
daily_rate      = total_price / duration_days
```

### Про несостыковку Pro 1500 vs 3000

В БД план **Pro** имеет `price_1month=1500` (как в текущем seed/create_subscription_plans.py). Если где-то ожидалось 3000₽, то:

- Либо имелся в виду другой план (например, Premium с 3000₽),
- Либо планировались другие значения в seed/админке.

С точки зрения кода семантика полей везде согласована.

---

## 7) Рекомендации по однозначности

1. **Переименование в UI:**  
   Везде явно указывать «₽/мес» для `price_1month` … `price_12months`, например:  
   «1м: 1500 ₽/мес (45000 ₽ за год при помесячной оплате)».

2. **Документация/комментарии:**  
   В админке и API schema добавить краткое пояснение:  
   «Все цены — в рублях за один месяц при выборе соответствующего пакета».

3. **Отдельные поля для общей стоимости (опционально):**  
   Можно добавить вычисляемые поля `total_1m`, `total_3m`, … для отображения полной стоимости пакета, чтобы не путать с месячной ценой.

4. **Единый helper на backend:**  
   Вынести маппинг duration → price и формулу `total_price` в одну функцию (например, в `balance_utils` или отдельный модуль pricing), чтобы не дублировать логику в subscriptions, payments, dev_testdata, admin.
