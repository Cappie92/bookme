# Аудит логики стоимости тарифов и daily списаний

## 1) Источник цен и длительности тарифов

### 1.1 Хранение цен в БД

**Модель:** `SubscriptionPlan` (models.py:1781)

| Поле | Описание |
|------|----------|
| `price_1month` | Цена за 1 месяц в пакете на 1 месяц (Float, рубли) |
| `price_3months` | Цена за 1 месяц в пакете на 3 месяца |
| `price_6months` | Цена за 1 месяц в пакете на 6 месяцев |
| `price_12months` | Цена за 1 месяц в пакете на 12 месяцев |

**Формула total_price:**  
`total_price = monthly_price * duration_months`  
где `monthly_price` берётся из соответствующего поля по длительности (1/3/6/12).

**Валюта:** Float, рубли (не копейки). Миграция `20250128_convert_balance_to_rubles.py` перевела всё в рубли.

### 1.2 Админка (web)

- **Endpoint планов:** `GET /api/subscription-plans/...` (admin, subscription_plans)
- **Компоненты:** AdminUsers, SubscriptionPlanForm и т.п.
- Ошибок пересчёта в админке по коду не видно; цены читаются напрямую из SubscriptionPlan.

---

## 2) Создание подписки и total_price

### 2.1 Выбор длительности и цены

- **Payments (Robokassa):** `routers/payments.py` — snapshot.total_price, duration из payment_request
- **Admin apply:** `routers/admin.py:153` — snapshot.total_price, total_days из start_date/end_date
- **Subscriptions apply:** `routers/subscriptions.py:1191` — snapshot.total_price
- **Dev testdata:** `routers/dev_testdata.py:238` — `_plan_total_price(plan, duration_months)`

### 2.2 Поля подписки (Subscription)

| Поле | Описание |
|------|----------|
| `price` | Общая стоимость в рублях (total_price) |
| `daily_rate` | Стоимость одного дня (руб/день) |
| `start_date`, `end_date` | Период подписки |

### 2.3 Расчёт при создании

**payments.py:467-477:**
```python
total_price_full = float(snapshot.total_price)
daily_rate = total_price_full / _duration_days
new_subscription = Subscription(
    ...
    price=total_price_full,
    daily_rate=daily_rate,
)
```

**subscriptions.py:1191-1202:**
```python
daily_rate = total_price_full / total_days
```

**Правило:** `daily_rate = total_price / duration_days` (30/90/180/360).

---

## 3) daily_rate и daily списание

### 3.1 Где считается daily_rate

- **При создании подписки:** `daily_rate = total_price / duration_days` (см. выше)
- **При списании:** `process_daily_charge` использует `subscription.daily_rate` из БД (balance_utils.py:307, 398, 425)
- **В get_subscription_status:** `calculate_subscription_daily_rate(subscription)` = `price / total_days` (balance_utils.py:298-303, 458)

**Несогласованность:** daily_charge берёт `subscription.daily_rate`, а get_subscription_status пересчитывает через `price / total_days`. При корректных данных они совпадают.

### 3.2 Округление

- `daily_rate` — Float, без явного округления до копеек
- При `duration_days` = 30 и `price` = 1000: `daily_rate = 33.333...`
- `balance // daily_rate` при balance=25: `25 // 33.33 ≈ 0` — ок
- Риск: при очень малом `daily_rate` (деление на большое количество дней или малая цена) `balance // daily_rate` может дать завышенный результат. Защита: `daily_rate > 0` перед делением.

### 3.3 Списание

**balance_utils.py:362-509** (`process_daily_charge`):

1. Берётся `subscription.daily_rate`
2. Проверка: `balance_before < daily_rate` → FAILED, деактивация подписки
3. Иначе: `add_balance_transaction(amount=-daily_rate)`, создаётся `DailySubscriptionCharge`

---

## 4) "Дней осталось" на mobile

### 4.1 Источники данных

| Данные | Endpoint | Источник |
|--------|----------|----------|
| Баланс | `GET /api/balance/` | UserBalance.balance, available_balance |
| Подписка | `GET /api/subscriptions/my` | get_effective_subscription |
| days_remaining | — | **НЕ из API** — mobile считает сам |

### 4.2 Mobile расчёт "Дней осталось"

**mobile/app/index.tsx:447-448:**
```jsx
<Text style={styles.financeValue}>{getDaysRemaining(subscription.end_date)}</Text>
```

**mobile/src/services/api/subscriptions.ts:192-199:**
```ts
export function getDaysRemaining(endDate: string): number {
  const end = new Date(endDate);
  const now = new Date();
  const diffTime = end.getTime() - now.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return Math.max(0, diffDays);
}
```

Формула: `days_remaining = end_date - today` (календарные дни).

### 4.3 Backend /api/subscriptions/my

**routers/subscriptions.py:153-154:**
```python
days_remaining = max(0, int(((subscription.end_date - datetime.utcnow()).total_seconds() + 86399) // 86400))
```

Тоже календарные дни, API не отдаёт balance-based значение.

### 4.4 Backend get_subscription_status (balance_utils)

**balance_utils.py:455-456:**
```python
daily_rate = calculate_subscription_daily_rate(subscription)
days_remaining = int(user_balance.balance // daily_rate) if daily_rate > 0 else 0
```

Формула: `days_remaining = balance / daily_rate` (целочисленное деление).

---

## 5) Причина кейса "25₽, 29 дней"

### 5.1 Причина

Mobile показывает `getDaysRemaining(subscription.end_date)` = **календарные дни** (end_date − today).

По логике daily списаний "дней осталось" должно быть `balance / daily_rate`:

- Pro: daily_rate ~100₽/день, balance 25₽ → **0 дней**
- При 25₽ и daily_rate 1₽/день → 25 дней (но для Pro это нереально)

То есть UI считает по end_date, а не по balance.

### 5.2 Тестовые данные (reseed)

Мастер Pro: +79990000006 (normal), +79990000007 (low).  
Low balance: `daily_rate * 1.5 - 0.01` (TEST_DATA_RESEED_GUIDE).

Для воспроизведения "25₽, 29 дней":

- Либо balance=25 при end_date через ~29 дней (вручную или через reseed)
- Либо баланс был списан, end_date остался в будущем, а days считается по end_date

### 5.3 Место ошибки

| Компонент | Сейчас | Нужно |
|-----------|--------|-------|
| Mobile "Дней осталось" | `getDaysRemaining(end_date)` = calendar | balance-based: min(calendar, balance/daily_rate) |
| /api/subscriptions/my | `days_remaining = end_date - today` | balance-based для платных планов |

---

## 6) Минимальный фикс

### Фикс 1: /api/subscriptions/my — balance-based days_remaining для платных планов

**Файл:** `backend/routers/subscriptions.py`

**Было (стр. 149-155):**
```python
daily_rate = float(getattr(subscription, "daily_rate", 0.0) or 0.0)
...
days_remaining = max(0, int(((subscription.end_date - datetime.utcnow()).total_seconds() + 86399) // 86400))
```

**Сделать:**
```python
daily_rate = float(getattr(subscription, "daily_rate", 0.0) or 0.0)
...
if daily_rate > 0:
    from utils.balance_utils import get_or_create_user_balance
    user_balance = get_or_create_user_balance(db, current_user.id)
    balance_days = int(user_balance.balance // daily_rate)
    calendar_days = max(0, int(((subscription.end_date - datetime.utcnow()).total_seconds() + 86399) // 86400))
    days_remaining = max(0, min(balance_days, calendar_days))
else:
    days_remaining = None  # Free plan
```

### Фикс 2: Mobile — использовать days_remaining из API

**Файл:** `mobile/app/index.tsx`

**Было:**
```jsx
{getDaysRemaining(subscription.end_date)}
```

**Сделать:**
```jsx
{subscription.days_remaining != null ? subscription.days_remaining : getDaysRemaining(subscription.end_date)}
```

Для Free и legacy случаев — fallback на календарные дни.

### Фикс 3 (опционально): защита daily_rate от 0

**Файл:** `backend/utils/balance_utils.py`, `calculate_subscription_daily_rate`:

Уже есть `if total_days <= 0: return 0`. Добавить проверку при записи в Subscription при создании — не допускать daily_rate = 0 для платных планов (или явно падать с ошибкой).

---

## Затронутые файлы

| Файл | Изменения |
|------|-----------|
| `backend/routers/subscriptions.py` | balance-based days_remaining в /my |
| `mobile/app/index.tsx` | использовать subscription.days_remaining при наличии |
| `backend/utils/balance_utils.py` | при необходимости — доп. проверки daily_rate |

---

## Чеклист для проверки

1. [ ] Pro план, баланс 25₽: "Дней осталось" = 0 (не 29)
2. [ ] Pro план, баланс 500₽, daily_rate 100: "Дней осталось" = 5
3. [ ] Free план: days_remaining не показывается или = null (как сейчас)
4. [ ] После daily charge при balance < daily_rate подписка деактивируется
5. [ ] /api/subscriptions/my и /api/balance/subscription-status дают согласованный days_remaining для платных планов
