# LOYALTY Conditions: 100% Truth (Backend Contract)

**Дата:** 2026-01-21  
**Цель:** Точные данные для исправления нормализации conditions

---

## 1. Enum LoyaltyConditionType (источник истины)

**Файл:** `backend/models.py:1014-1041`  
**Файл:** `backend/schemas.py:1458-1485` (дубликат)

### Все допустимые значения:

```python
class LoyaltyConditionType(str, enum.Enum):
    # Быстрые скидки
    FIRST_VISIT = "first_visit"
    REGULAR_VISITS = "regular_visits"
    RETURNING_CLIENT = "returning_client"
    BIRTHDAY = "birthday"
    HAPPY_HOURS = "happy_hours"
    SERVICE_DISCOUNT = "service_discount"
    
    # Сложные скидки
    VISIT_COUNT = "visit_count"                    # ⚠️ НЕ "visits_count"!
    SPENT_AMOUNT = "spent_amount"
    DAYS_SINCE_LAST_VISIT = "days_since_last_visit"
    BIRTHDAY_RANGE = "birthday_range"
    TIME_SLOT = "time_slot"
    DAY_OF_WEEK = "day_of_week"
    SEASON = "season"
    ADVANCE_BOOKING = "advance_booking"
    SERVICE_CATEGORY = "service_category"
    SPECIFIC_SERVICE = "specific_service"
    MULTIPLE_SERVICES = "multiple_services"
    REFERRAL_COUNT = "referral_count"
    PROMO_CODE = "promo_code"
    SOCIAL_ACTIVITY = "social_activity"
    ONLINE_PAYMENT = "online_payment"
    PACKAGE_PURCHASE = "package_purchase"
    CHECK_AMOUNT = "check_amount"
    REPEAT_SERVICE = "repeat_service"
```

---

## 2. Код интерпретации conditions (eligibility check)

**Файл:** `backend/utils/loyalty_discounts.py:230-334`

### Как читается conditions:

```python
# Строка 231-233
condition = rule.conditions or {}
condition_type = condition.get("condition_type")
parameters = condition.get("parameters", {}) if isinstance(condition, dict) else {}
```

**Структура conditions (dict):**
```json
{
  "condition_type": "regular_visits",  // строка из LoyaltyConditionType enum
  "parameters": {                     // dict с параметрами
    "visits_count": 5,
    "period": "month"
  }
}
```

### Поддерживаемые condition_type в evaluate_discount_candidates:

**Обрабатываются (строки 259-330):**
1. `FIRST_VISIT` (строка 259) — параметры: `{}` (пустой)
2. `RETURNING_CLIENT` (строка 267) — параметры: `{"days_since_last_visit": int}`
3. `REGULAR_VISITS` (строка 280) — параметры: `{"visits_count": int, "period": "week"|"month"|"year"}`
4. `HAPPY_HOURS` (строка 301) — параметры: `{"start_time": "HH:MM", "end_time": "HH:MM", "days_of_week": [1,2,3,4,5]}`
5. `SERVICE_DISCOUNT` (строка 318) — параметры: `{"service_ids": [int], "category_ids": [int]}`

**НЕ обрабатываются (попадают в "unknown_condition", строка 332-334):**
- `VISIT_COUNT` ("visit_count")
- `SPENT_AMOUNT` ("spent_amount")
- `DAYS_SINCE_LAST_VISIT` ("days_since_last_visit")
- И все остальные complex discount типы

**⚠️ ВАЖНО:** Complex discounts с этими condition_type можно создать, но они не будут применяться при бронировании (попадут в "unknown_condition").

---

## 3. Таблица: UI type → backend condition_type → parameters schema

| UI type (frontend/mobile) | Backend condition_type | Parameters schema | Обрабатывается в evaluate? |
|---------------------------|----------------------|-------------------|---------------------------|
| `"visits_count"` | `"visit_count"` | `{}` (неизвестно, т.к. не обрабатывается) | ❌ НЕТ |
| `"total_spent"` | `"spent_amount"` | `{}` (неизвестно, т.к. не обрабатывается) | ❌ НЕТ |
| `"days_since_last"` | `"days_since_last_visit"` | `{}` (неизвестно, т.к. не обрабатывается) | ❌ НЕТ |
| `"service_category"` | `"service_category"` | `{}` (неизвестно, т.к. не обрабатывается) | ❌ НЕТ |

**Проблема:** UI позволяет создавать complex discounts с типами, которые не обрабатываются в `evaluate_discount_candidates`.

**Рекомендация:** Для MVP использовать только те типы, которые обрабатываются, или добавить обработку в backend.

---

## 4. Примеры из шаблонов (quick discounts)

**Файл:** `backend/routers/loyalty.py:138-214`

### Пример 1: REGULAR_VISITS
```json
{
  "condition_type": "regular_visits",
  "parameters": {
    "visits_count": 5,
    "period": "month"
  }
}
```

### Пример 2: RETURNING_CLIENT
```json
{
  "condition_type": "returning_client",
  "parameters": {
    "days_since_last_visit": 30,
    "period": "days"
  }
}
```

### Пример 3: HAPPY_HOURS
```json
{
  "condition_type": "happy_hours",
  "parameters": {
    "start_time": "09:00",
    "end_time": "12:00",
    "days_of_week": [1, 2, 3, 4, 5]
  }
}
```

---

## 5. Маппинг UI type → backend condition_type

**Из UI (WEB):** `frontend/src/components/LoyaltySystem.jsx:830`
- `type: 'visits_count'`

**Из UI (MOBILE):** `mobile/src/components/loyalty/DiscountsComplexTab.tsx:28, 184, 192, 200, 208`
- `type: 'visits_count'`
- `type: 'total_spent'`
- `type: 'days_since_last'`
- `type: 'service_category'`

**Маппинг:**
```javascript
const UI_TO_BACKEND_TYPE_MAP = {
  "visits_count": "visit_count",           // UI → backend
  "total_spent": "spent_amount",
  "days_since_last": "days_since_last_visit",
  "service_category": "service_category",
}
```

---

## 6. Parameters schema для каждого типа (из кода evaluate)

### FIRST_VISIT
```json
{
  "condition_type": "first_visit",
  "parameters": {}
}
```

### RETURNING_CLIENT
```json
{
  "condition_type": "returning_client",
  "parameters": {
    "days_since_last_visit": 30  // int, обязательное
  }
}
```

### REGULAR_VISITS
```json
{
  "condition_type": "regular_visits",
  "parameters": {
    "visits_count": 5,           // int, обязательное
    "period": "week"|"month"|"year"  // string, обязательное
  }
}
```

### HAPPY_HOURS
```json
{
  "condition_type": "happy_hours",
  "parameters": {
    "start_time": "09:00",       // string "HH:MM", обязательное
    "end_time": "12:00",         // string "HH:MM", обязательное
    "days_of_week": [1, 2, 3, 4, 5]  // array[int], обязательное (1-7, где 1=понедельник)
  }
}
```

### SERVICE_DISCOUNT
```json
{
  "condition_type": "service_discount",
  "parameters": {
    "service_ids": [1, 2, 3],    // array[int], опциональное (может быть [])
    "category_ids": [4, 5]       // array[int], опциональное (может быть [])
  }
}
```

### VISIT_COUNT, SPENT_AMOUNT, DAYS_SINCE_LAST_VISIT, SERVICE_CATEGORY
**⚠️ Неизвестно** — не обрабатываются в `evaluate_discount_candidates`, нет примеров в коде.

**Предположение (на основе UI):**
- `VISIT_COUNT`: `{"visits_count": int, "operator": ">="|">"|"="|"<"|"<="}`
- `SPENT_AMOUNT`: `{"amount": float, "operator": ">="|...}`
- `DAYS_SINCE_LAST_VISIT`: `{"days": int, "operator": ">="|...}`
- `SERVICE_CATEGORY`: `{"category_ids": [int]}`

---

## 7. Выводы

1. **Backend ожидает:** `conditions: dict` с `condition_type` и `parameters`
2. **Frontend отправляет:** `conditions: Array<object>` с `type/operator/value/description`
3. **Несовпадение типов:** UI `"visits_count"` vs backend `"visit_count"`
4. **Complex discounts:** Большинство типов не обрабатываются в evaluate (попадают в "unknown_condition")

**Рекомендация:** Исправить нормализацию, но предупредить, что complex discounts с `VISIT_COUNT` и другими не будут применяться при бронировании до добавления обработки в backend.
