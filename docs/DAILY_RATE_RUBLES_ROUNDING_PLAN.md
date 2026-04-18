# План перехода к рублёвому округлению daily_rate

## Часть 1 — Диагностика текущих типов и мест использования

### 1.1 Типы и единицы

| Объект | Тип | Единицы | Комментарий |
|--------|-----|---------|-------------|
| `user_balances.balance` | Float | Рубли | Миграция `20250128_convert_balance_to_rubles` перевела из копеек |
| `subscription_plans.price_*months` | Float | Рубли за 1 месяц | price_1month, price_3months и т.д. |
| `subscriptions.price` | Float | Рубли (total_price) | Полная стоимость периода |
| `subscriptions.daily_rate` | Float | Рубли | Сейчас total_price / duration_days (16.67 для Basic 500/30) |
| `balance_transactions.amount` | Float | Рубли | Положительное = пополнение, отрицательное = списание |
| `daily_subscription_charges.amount`, `daily_rate` | Float | Рубли | |

### 1.2 Места расчёта total_price

| Файл | Функция/место | Формула |
|------|---------------|---------|
| `routers/dev_testdata.py` | `_plan_total_price` | `ceil(monthly_price) * duration_months` |
| `routers/subscriptions.py` | `calculate_subscription` (~930) | `monthly_price * duration_months` (monthly = ceil(raw)) |
| `routers/subscriptions.py` | apply-upgrade-free (~1222) | из snapshot.total_price |
| `routers/subscriptions.py` | apply-upgrade (legacy, ~273) | из calculated_price |
| `routers/payments.py` | apply после Robokassa (~466) | `snapshot.total_price` |
| `routers/admin.py` | retry_apply_failed (~153) | `snapshot.total_price` |

### 1.3 Места расчёта daily_rate

| Файл | Строка/место | Формула |
|------|--------------|---------|
| `routers/dev_testdata.py` | `set_subscription` ~239 | `total_price / duration_days` (float) |
| `routers/subscriptions.py` | `apply-upgrade-free` ~1224 | `total_price_full / total_days` |
| `routers/subscriptions.py` | apply-upgrade legacy ~277 | `total_price / total_days` |
| `routers/subscriptions.py` | `calculate_subscription` ~940 | `ceil(total_price / duration_days)` — только для daily_price в расчёте, не в subscription |
| `routers/payments.py` | apply ~467 | `total_price_full / _duration_days` |
| `routers/admin.py` | retry_apply ~154 | `total_price_full / total_days` |
| `utils/balance_utils.py` | `calculate_subscription_daily_rate` | `subscription.price / total_days` (fallback, SSoT — subscription.daily_rate) |

### 1.4 Места списания daily_rate из balance

| Файл | Функция | Действие |
|------|---------|----------|
| `utils/balance_utils.py` | `process_daily_charge` | `add_balance_transaction(amount=-daily_rate)` |
| | | `balance_before < daily_rate` → FAIL, деактивация |

### 1.5 Места отображения баланса/цен в UI

| Файл | Что показывается |
|------|------------------|
| `mobile/app/index.tsx` | `formatMoney(balance.available_balance)` |
| `mobile/app/subscriptions/index.tsx` | `formatMoney(subscription.daily_rate)` |
| `frontend/src/pages/MasterDashboard.jsx` | `formatMoney(balance)` |
| `frontend/src/pages/AdminFunctions.jsx` | `plan.price_*months`, `subscription.price` |
| `frontend/src/utils/formatMoney.js` | `amount.toFixed(2)` — всегда 2 знака |
| `mobile/src/utils/money.ts` | округление до целых рублей |

---

## Часть 2 — Ответы на вопросы

### A) Подписки с daily_rate = 16.67

**Варианты:**
1. **Мигрировать все active** — `daily_rate = ceil(existing_daily_rate)` → 17. Пользователь заплатит за период 17×30=510 вместо 500 (10₽ доплата).
2. **Оставить старые как есть** — новая логика только для новых подписок. Старые продолжают списывать float. Минимальный риск, но два режима в системе.
3. **Мигрировать с round** — 16.67 → 17. Та же формула, что и ceil.

**Рекомендация:** вариант 2 — «новая логика только для новых подписок». Старые подписки не трогать. При следующем продлении/обновлении получится новая подписка с int daily_rate.

### B) Каноническое правило округления daily_rate

**Формулы:**
- `total_price` — без изменений: `ceil(monthly_price) * duration_months`
- `daily_rate` (int рубли): `ceil(total_price / duration_days)`

**Обоснование ceil:**
- `floor` — недобор: 500/30=16.67→16, за 30 дней 480₽, меньше total_price.
- `round` — в среднем ок, но возможен недобор (16.67→17, 17×30=510 > 500).
- `ceil` — гарантирует, что сумма списаний за период ≥ total_price. Пользователь никогда не переплачивает «системе» в смысле недобора; возможна небольшая переплата (~10₽ на 500₽), зато списание целыми рублями.

**Альтернатива:** `daily_rate = round(total_price / duration_days)` — минимальная системная ошибка, но возможны копейки (например, 16.67→17). Для «целых рублей» нужен именно int, поэтому round даёт 17, ceil — тоже 17 для Basic 500/30. Для 501/30: round=17, ceil=17. Для 499/30: round=17, ceil=17. Разница только на граничных случаях.

**Итог:** `daily_rate = ceil(total_price / duration_days)` — целые рубли, сумма списаний ≥ total_price.

### C) Списание: daily_rate (int) vs. учёт остатка/последний день

**Текущая модель:** депозит, daily charge = фиксированная сумма. Не требуется `sum(charges) == total_price`.

**Рекомендация:** списывать фиксированный `daily_rate` (int). Допустимо, что `sum(charges) > total_price` на небольшую величину (из-за ceil). Ограничение: `sum(charges) <= total_price` усложнит логику (последний день — остаток) и даст дробные списания. Оставляем простую модель: каждый день списываем одинаковый int daily_rate.

---

## Часть 3 — Минимальная реализация

### 3.1 При создании/продлении подписки

**Правило:** `daily_rate = math.ceil(total_price / duration_days)` → int.

**Файлы и правки:**

| Файл | Изменение |
|------|-----------|
| `routers/dev_testdata.py` | `daily_rate = math.ceil(total_price / duration_days)` (если 0, то 0) |
| `routers/subscriptions.py` | apply-upgrade-free: `daily_rate = int(math.ceil(total_price_full / total_days))` |
| `routers/subscriptions.py` | apply-upgrade legacy: аналогично |
| `routers/payments.py` | apply: `daily_rate = int(math.ceil(total_price_full / _duration_days))` |
| `routers/admin.py` | retry_apply: `daily_rate = int(math.ceil(total_price_full / total_days))` |

**Модель:** `subscriptions.daily_rate` остаётся Float в БД (SQLite). Сохраняем целое как float (17.0). Миграция схемы не нужна.

### 3.2 process_daily_charge

| Файл | Изменение |
|------|-----------|
| `utils/balance_utils.py` | `charge_amount = int(round(subscription.daily_rate))` или `charge_amount = max(0, int(subscription.daily_rate))` — для защиты от float drift использовать int при списании |

По сути списываем `int(round(daily_rate))` — для старых подписок 16.67→17, для новых 17.0→17. Без изменения логики хранения.

### 3.3 Тесты

| Тест | Ожидание |
|------|----------|
| Basic 500/30 | `daily_rate = 17` (ceil(500/30)=17) |
| Pro 3000/30 | `daily_rate = 100` (уже целое) |
| Standard 1400×3=4200 / 90 | `daily_rate = 47` (ceil(4200/90)=47) |

**Обновить:**
- `tests/test_subscription_days_remaining.py` — хелпер `_create_master_with_subscription` уже задаёт daily_rate явно, проверить ожидания
- `tests/test_subscription_price_sst.py` — Pro 1500/30 → daily_rate 50 (целое), без изменений
- `scripts/reseed_local_test_data.py` — low-balance: `balance = ceil(daily_rate * 1.2)`; при daily_rate=17 → balance≥21; при 100 → 120

### 3.4 Миграция существующих данных

**Стратегия: только новые подписки**

- Не мигрируем старые записи.
- Код при списании: `charge_amount = int(round(float(subscription.daily_rate)))` — старые 16.67 дают 17, новые 17.0 дают 17.
- Единообразие: старые подписки продолжают работать; при продлении создаётся новая с int daily_rate.

**Альтернатива (опционально, dev-only):** Alembic-миграция `UPDATE subscriptions SET daily_rate = ceil(daily_rate) WHERE daily_rate != ceil(daily_rate) AND is_active = 1` — только для dev, по желанию.

---

## 4. Diff-план (конкретные файлы)

| # | Файл | Патч |
|---|------|------|
| 1 | `backend/routers/dev_testdata.py` | `daily_rate = math.ceil(total_price / duration_days) if duration_days else 0` (уже import math) |
| 2 | `backend/routers/subscriptions.py` | apply-upgrade-free: `daily_rate = int(math.ceil(total_price_full / total_days)) if total_days else 0` |
| 3 | `backend/routers/subscriptions.py` | apply-upgrade (если используется): то же |
| 4 | `backend/routers/payments.py` | `daily_rate = int(math.ceil(total_price_full / _duration_days)) if _duration_days else 0` |
| 5 | `backend/routers/admin.py` | `daily_rate = int(math.ceil(total_price_full / total_days)) if total_days else 0` |
| 6 | `backend/utils/balance_utils.py` | `charge_amount = max(0, int(round(float(subscription.daily_rate))))`; везде использовать charge_amount вместо daily_rate при списании |
| 7 | `backend/scripts/reseed_local_test_data.py` | Проверить: low-balance при daily_rate=17 (Basic) — balance≥21 |
| 8 | `backend/tests/test_subscription_days_remaining.py` | При необходимости обновить ожидания (daily_rate int) |
| 9 | `backend/tests/test_subscription_price_sst.py` | Без изменений (Pro 50 — целое) |

---

## 5. Риск-оценка

| Риск | Вероятность | Митигация |
|------|-------------|-----------|
| Старые подписки: 16.67→17 при списании | Низкая | Используем int(round(...)), 16.67→17. Разница 0.33₽/день. При 30 днях ≈10₽. Приемлемо для депозитной модели. |
| total_price < sum(charges) для новых | Ожидаемо | По дизайну при ceil. Допускаем небольшую переплату (до 29₽ на 500₽ за 30 дней). |
| Регрессия тестов | Средняя | Прогнать full_regression_subscriptions.py после изменений |
| Несовпадение с snapshot (calculate) | Низкая | В calculate_subscription daily_price для UI — ceil. В subscription сохраняем daily_rate. Разные цели, ок. |

---

## 6. Самый безопасный вариант

**Рекомендация:** «Только для новых подписок» + `int(round(daily_rate))` при списании.

1. Все точки создания подписки пишут `daily_rate = ceil(total_price/days)` (int, храним как float).
2. `process_daily_charge` списывает `int(round(subscription.daily_rate))` — совместимость со старыми подписками.
3. Не трогаем старые записи в БД.
4. Прогоняем `full_regression_subscriptions.py` и тесты.
5. При необходимости — отдельная миграция для dev (опционально).

**Порядок внедрения:**
1. Патчи 1–5 (создание подписки)
2. Патч 6 (списание)
3. Патчи 7–9 (тесты, reseed)
4. Ручная проверка на stable/low/free
