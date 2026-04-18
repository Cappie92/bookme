# LOYALTY Conditions: Final Summary (100% Truth + Fixes)

**Дата:** 2026-01-21  
**Статус:** ✅ P0 исправлен, дублирование убрано

---

## 1. 100% Truth: Backend Contract

### 1.1 Enum LoyaltyConditionType

**Файл:** `backend/models.py:1014-1041`

**Все допустимые значения:**
- Quick: `first_visit`, `regular_visits`, `returning_client`, `birthday`, `happy_hours`, `service_discount`
- Complex: `visit_count` ⚠️ (НЕ `visits_count`!), `spent_amount`, `days_since_last_visit`, `birthday_range`, `time_slot`, `day_of_week`, `season`, `advance_booking`, `service_category`, `specific_service`, `multiple_services`, `referral_count`, `promo_code`, `social_activity`, `online_payment`, `package_purchase`, `check_amount`, `repeat_service`

### 1.2 Структура conditions (dict)

**Файл:** `backend/utils/loyalty_discounts.py:231-233`

```python
condition = rule.conditions or {}
condition_type = condition.get("condition_type")  # строка из enum
parameters = condition.get("parameters", {})     # dict с параметрами
```

**Формат:**
```json
{
  "condition_type": "visit_count",
  "parameters": {
    "visits_count": 5,
    "operator": ">="
  }
}
```

### 1.3 Обрабатываемые condition_type в evaluate

**Файл:** `backend/utils/loyalty_discounts.py:259-330`

**Обрабатываются:**
- `first_visit` — параметры: `{}`
- `returning_client` — параметры: `{"days_since_last_visit": int}`
- `regular_visits` — параметры: `{"visits_count": int, "period": "week"|"month"|"year"}`
- `happy_hours` — параметры: `{"start_time": "HH:MM", "end_time": "HH:MM", "days_of_week": [int]}`
- `service_discount` — параметры: `{"service_ids": [int], "category_ids": [int]}`

**НЕ обрабатываются (попадают в "unknown_condition"):**
- `visit_count`, `spent_amount`, `days_since_last_visit`, `service_category` и все остальные complex типы

**⚠️ ВАЖНО:** Complex discounts с этими типами можно создать, но они не применяются при бронировании.

---

## 2. Таблица: UI type → backend condition_type → parameters

| UI type (frontend/mobile) | Backend condition_type | Parameters schema | Обрабатывается? |
|---------------------------|----------------------|-------------------|-----------------|
| `"visits_count"` | `"visit_count"` | `{"visits_count": int, "operator": ">="\|...}` | ❌ НЕТ |
| `"total_spent"` | `"spent_amount"` | `{"amount": float, "operator": ">="\|...}` | ❌ НЕТ |
| `"days_since_last"` | `"days_since_last_visit"` | `{"days": int, "operator": ">="\|...}` | ❌ НЕТ |
| `"service_category"` | `"service_category"` | `{"category_ids": [int]}` | ❌ НЕТ |

---

## 3. Исправления применены

### 3.1 normalizeConditionsForApi обновлена

**WEB:** `frontend/src/utils/loyaltyConditions.js`
- ✅ Возвращает `dict` вместо `Array<object>`
- ✅ Маппинг типов: `"visits_count"` → `"visit_count"`
- ✅ Формирует `parameters` по схеме для каждого типа

**MOBILE:** `mobile/src/utils/loyaltyConditions.ts`
- ✅ То же самое

### 3.2 Дублирование убрано

**Оставлено в API слое:**
- ✅ `mobile/src/services/api/loyalty_discounts.ts:createComplexDiscount` — нормализация добавлена

**Убрано из UI:**
- ✅ `mobile/src/components/loyalty/DiscountsComplexTab.tsx` — нормализация удалена
- ✅ `mobile/app/master/loyalty.tsx` — нормализация удалена

### 3.3 Проверка пустых conditions обновлена

**WEB:** `frontend/src/components/LoyaltySystem.jsx:390`
- ✅ Проверка изменена: `!normalizedConditions.condition_type` вместо `normalizedConditions.length === 0`

---

## 4. Пример payload после исправления

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

## 5. Статус

✅ **P0 исправлен:** `normalizeConditionsForApi()` возвращает `dict` с правильным форматом  
✅ **Дублирование убрано:** Нормализация только в API слое  
✅ **Готово к тестированию:** Создание complex discount должно работать без 422

**Следующие шаги:**
1. Протестировать создание complex discount → проверить Network tab
2. Продолжить UI работу (Points одна страница, Quick grid 2x3)

---

## 6. Файлы изменены

- ✅ `frontend/src/utils/loyaltyConditions.js` — обновлена функция
- ✅ `mobile/src/utils/loyaltyConditions.ts` — обновлена функция
- ✅ `mobile/src/services/api/loyalty_discounts.ts` — добавлена нормализация
- ✅ `mobile/src/components/loyalty/DiscountsComplexTab.tsx` — убрана нормализация
- ✅ `mobile/app/master/loyalty.tsx` — убрана нормализация
- ✅ `frontend/src/components/LoyaltySystem.jsx` — обновлена проверка пустых conditions
