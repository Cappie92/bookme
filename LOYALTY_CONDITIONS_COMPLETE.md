# LOYALTY Conditions: Complete Truth Table + Fixes

**Дата:** 2026-01-21  
**Статус:** ✅ P0 исправлен, дублирование убрано

---

## 1. Enum LoyaltyConditionType (100% истина)

**Файл:** `backend/models.py:1014-1041`

### Все допустимые значения:

| Enum значение | Строковое значение | Категория |
|--------------|-------------------|-----------|
| `FIRST_VISIT` | `"first_visit"` | Quick |
| `REGULAR_VISITS` | `"regular_visits"` | Quick |
| `RETURNING_CLIENT` | `"returning_client"` | Quick |
| `BIRTHDAY` | `"birthday"` | Quick |
| `HAPPY_HOURS` | `"happy_hours"` | Quick |
| `SERVICE_DISCOUNT` | `"service_discount"` | Quick |
| `VISIT_COUNT` | `"visit_count"` ⚠️ | Complex |
| `SPENT_AMOUNT` | `"spent_amount"` | Complex |
| `DAYS_SINCE_LAST_VISIT` | `"days_since_last_visit"` | Complex |
| `BIRTHDAY_RANGE` | `"birthday_range"` | Complex |
| `TIME_SLOT` | `"time_slot"` | Complex |
| `DAY_OF_WEEK` | `"day_of_week"` | Complex |
| `SEASON` | `"season"` | Complex |
| `ADVANCE_BOOKING` | `"advance_booking"` | Complex |
| `SERVICE_CATEGORY` | `"service_category"` | Complex |
| `SPECIFIC_SERVICE` | `"specific_service"` | Complex |
| `MULTIPLE_SERVICES` | `"multiple_services"` | Complex |
| `REFERRAL_COUNT` | `"referral_count"` | Complex |
| `PROMO_CODE` | `"promo_code"` | Complex |
| `SOCIAL_ACTIVITY` | `"social_activity"` | Complex |
| `ONLINE_PAYMENT` | `"online_payment"` | Complex |
| `PACKAGE_PURCHASE` | `"package_purchase"` | Complex |
| `CHECK_AMOUNT` | `"check_amount"` | Complex |
| `REPEAT_SERVICE` | `"repeat_service"` | Complex |

**⚠️ КРИТИЧНО:** Backend использует `VISIT_COUNT = "visit_count"` (НЕ `"visits_count"`!)

---

## 2. Таблица: UI type → backend condition_type → parameters schema

| UI type (frontend/mobile) | Backend condition_type | Parameters schema | Обрабатывается в evaluate? | Источник parameters |
|---------------------------|----------------------|-------------------|----------------------------|---------------------|
| `"visits_count"` | `"visit_count"` | `{"visits_count": int, "operator": ">="\|">"\|"="\|"<"\|"<="}` | ❌ НЕТ | Предположение (на основе UI) |
| `"total_spent"` | `"spent_amount"` | `{"amount": float, "operator": ">="\|...}` | ❌ НЕТ | Предположение (на основе UI) |
| `"days_since_last"` | `"days_since_last_visit"` | `{"days": int, "operator": ">="\|...}` | ❌ НЕТ | Предположение (на основе UI) |
| `"service_category"` | `"service_category"` | `{"category_ids": [int]}` | ❌ НЕТ | Предположение (на основе UI) |

**Обрабатываемые типы (из кода `evaluate_discount_candidates`):**

| Backend condition_type | Parameters schema (из кода) | Файл/Строка |
|----------------------|----------------------------|-------------|
| `"first_visit"` | `{}` | `loyalty_discounts.py:259` |
| `"returning_client"` | `{"days_since_last_visit": int}` | `loyalty_discounts.py:267-278` |
| `"regular_visits"` | `{"visits_count": int, "period": "week"\|"month"\|"year"}` | `loyalty_discounts.py:280-299` |
| `"happy_hours"` | `{"start_time": "HH:MM", "end_time": "HH:MM", "days_of_week": [int]}` | `loyalty_discounts.py:301-316` |
| `"service_discount"` | `{"service_ids": [int], "category_ids": [int]}` | `loyalty_discounts.py:318-330` |

---

## 3. Код интерпретации conditions

**Файл:** `backend/utils/loyalty_discounts.py:230-334`

### Как читается conditions:

```python
# Строка 231-233
condition = rule.conditions or {}
condition_type = condition.get("condition_type")  # строка из enum
parameters = condition.get("parameters", {})     # dict с параметрами
```

### Обработка каждого типа:

**FIRST_VISIT (строка 259-265):**
- Параметры: `{}` (пустой)
- Логика: `visits == 0` (нет завершённых визитов)

**RETURNING_CLIENT (строка 267-278):**
- Параметры: `{"days_since_last_visit": int}`
- Логика: `delta_days >= days_since`

**REGULAR_VISITS (строка 280-299):**
- Параметры: `{"visits_count": int, "period": "week"|"month"|"year"}`
- Логика: `visits >= visits_count` в периоде

**HAPPY_HOURS (строка 301-316):**
- Параметры: `{"start_time": "HH:MM", "end_time": "HH:MM", "days_of_week": [int]}`
- Логика: `in_day and in_time`

**SERVICE_DISCOUNT (строка 318-330):**
- Параметры: `{"service_ids": [int], "category_ids": [int]}`
- Логика: `service_id in service_ids OR category_id in category_ids`

**Остальные типы (строка 332-334):**
- Попадают в `"unknown_condition"` — не обрабатываются

---

## 4. Новая функция normalizeConditionsForApi

### 4.1 WEB

**Файл:** `frontend/src/utils/loyaltyConditions.js`

**Логика:**
1. Если `input = null/undefined` → `{}`
2. Если `input = object` с `condition_type` и `parameters` → вернуть как есть
3. Если `input = array` → взять первое условие и преобразовать через `_convertUIFormatToBackend()`

**Маппинг типов:**
```javascript
const UI_TO_BACKEND_TYPE_MAP = {
  "visits_count": "visit_count",
  "total_spent": "spent_amount",
  "days_since_last": "days_since_last_visit",
  "service_category": "service_category",
}
```

**Формирование parameters:**
- `visit_count`: `{"visits_count": parseInt(value), "operator": operator}`
- `spent_amount`: `{"amount": parseFloat(value), "operator": operator}`
- `days_since_last_visit`: `{"days": parseInt(value), "operator": operator}`
- `service_category`: `{"category_ids": Array.isArray(value) ? value : []}`

### 4.2 MOBILE

**Файл:** `mobile/src/utils/loyaltyConditions.ts`

**Логика:** Аналогично WEB

---

## 5. Убрано дублирование нормализации

**Оставлено в API слое:**
- ✅ `mobile/src/services/api/loyalty_discounts.ts:createComplexDiscount` — нормализация добавлена

**Убрано из UI:**
- ✅ `mobile/src/components/loyalty/DiscountsComplexTab.tsx` — нормализация удалена
- ✅ `mobile/app/master/loyalty.tsx` — нормализация удалена

**Результат:** Нормализация выполняется один раз в API слое перед отправкой.

---

## 6. Пример payload после исправления

**Вход (UI):**
```javascript
formData.conditions = [
  {
    type: "visits_count",
    operator: ">=",
    value: "5",
    description: "Более 5 визитов"
  }
]
```

**Выход (после normalizeConditionsForApi):**
```json
{
  "condition_type": "visit_count",
  "parameters": {
    "visits_count": 5,
    "operator": ">="
  }
}
```

**Payload для POST /api/loyalty/complex-discounts:**
```json
{
  "discount_type": "complex",
  "name": "VIP клиенты",
  "description": "Для постоянных клиентов",
  "discount_percent": 15.0,
  "max_discount_amount": null,
  "conditions": {
    "condition_type": "visit_count",
    "parameters": {
      "visits_count": 5,
      "operator": ">="
    }
  },
  "is_active": true,
  "priority": 1
}
```

---

## 7. Статус исправлений

✅ **P0 исправлен:** `normalizeConditionsForApi()` возвращает `dict` с правильным форматом  
✅ **Маппинг типов:** `"visits_count"` → `"visit_count"` реализован  
✅ **Дублирование убрано:** Нормализация только в API слое (MOBILE)  
✅ **Готово к тестированию:** Создание complex discount должно работать без 422

---

## 8. Файлы изменены

- ✅ `frontend/src/utils/loyaltyConditions.js` — обновлена функция
- ✅ `mobile/src/utils/loyaltyConditions.ts` — обновлена функция
- ✅ `mobile/src/services/api/loyalty_discounts.ts` — добавлена нормализация
- ✅ `mobile/src/components/loyalty/DiscountsComplexTab.tsx` — убрана нормализация
- ✅ `mobile/app/master/loyalty.tsx` — убрана нормализация
- ✅ `frontend/src/components/LoyaltySystem.jsx` — обновлена проверка пустых conditions

---

## 9. Важные замечания

1. **Complex discounts с `visit_count`, `spent_amount` и т.д. НЕ обрабатываются** в `evaluate_discount_candidates` — они попадают в "unknown_condition" и не применяются при бронировании.

2. **Для MVP:** Можно создавать complex discounts, но они не будут работать до добавления обработки в backend.

3. **Рекомендация:** Либо добавить обработку complex discount типов в `evaluate_discount_candidates`, либо ограничить UI только обрабатываемыми типами.

---

**Статус:** ✅ **READY FOR TESTING**
