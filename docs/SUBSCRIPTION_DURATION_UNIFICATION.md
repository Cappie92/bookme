# Унификация длительностей пакетов подписки (30/90/180/360 дней)

## Источник истины

**`backend/constants.py`:**

```python
DURATION_DAYS = {1: 30, 3: 90, 6: 180, 12: 360}
DAYS_PER_MONTH = 30  # обратная совместимость

def duration_months_to_days(months: int) -> int:
    return DURATION_DAYS.get(months, months * DAYS_PER_MONTH)
```

- 1 месяц = **30** дней  
- 3 месяца = **90** дней  
- 6 месяцев = **180** дней  
- 12 месяцев = **360** дней  

Календарные месяцы и `relativedelta(months=...))` не используются. Только `timedelta(days=...)` с этими константами.

---

## Где заменено (шаг 1)

| Файл | Изменения |
|------|-----------|
| `backend/constants.py` | Уже есть `DURATION_DAYS`, `duration_months_to_days`. |
| `backend/routers/subscriptions.py` | Использует `duration_months_to_days` для calculate, apply-upgrade-free, get_my, upgrade. |
| `backend/routers/payments.py` | Использует `duration_months_to_days` в apply подписки после Robokassa. |
| `backend/routers/admin.py` | Импорт `duration_months_to_days`; retry-subscription-apply: `total_days = duration_months_to_days(_dm)`, `end_date` по дням. |
| `backend/tests/test_apply_upgrade_free.py` | `duration_months_to_days` для `daily_price`, `daily_rate` в хелперах. |
| `backend/scripts/create_test_users_balance_system.py` | Убрана локальная `DAYS_PER_MONTH`; `duration_months_to_days(1)`, `duration_months_to_days(12)` и расчёты reserve. |
| `backend/scripts/setup_test_accounts.py` | `duration_months_to_days(1)` для `daily_rate`. |

---

## UI: «1 месяц / 3 месяца / …»

Тексты в UI (выбор периода) оставлены как есть: «1 месяц», «3 месяца», «6 месяцев», «12 месяцев». Расчёты и хранение — только в днях (30/90/180/360) через `duration_months_to_days`.

---

## Проверка

- `pytest tests/test_constants.py tests/test_apply_upgrade_free.py tests/test_deposit_410.py -v` — проходят.
- `test_subscription_calculate_contract` может падать из‑за фикстуры `test_master_token` (KeyError `access_token`), не из‑за длительностей.
