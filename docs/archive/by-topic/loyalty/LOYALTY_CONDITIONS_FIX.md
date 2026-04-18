# LOYALTY Conditions Fix: Исправление нормализации

**Дата:** 2026-01-21  
**Основано на:** `LOYALTY_CONDITIONS_TRUTH.md`

---

## 1. Маппинг UI type → backend condition_type

**Источник:** `LOYALTY_CONDITIONS_TRUTH.md`, раздел 5

```javascript
const UI_TO_BACKEND_TYPE_MAP = {
  "visits_count": "visit_count",
  "total_spent": "spent_amount",
  "days_since_last": "days_since_last_visit",
  "service_category": "service_category",
}
```

---

## 2. Parameters schema для каждого UI type

**Источник:** `LOYALTY_CONDITIONS_TRUTH.md`, раздел 6 + предположения для необрабатываемых типов

| UI type | Backend condition_type | Parameters schema |
|---------|----------------------|-------------------|
| `"visits_count"` | `"visit_count"` | `{"visits_count": int, "operator": ">="\|">"\|"="\|"<"\|"<="}` |
| `"total_spent"` | `"spent_amount"` | `{"amount": float, "operator": ">="\|...}` |
| `"days_since_last"` | `"days_since_last_visit"` | `{"days": int, "operator": ">="\|...}` |
| `"service_category"` | `"service_category"` | `{"category_ids": [int]}` |

---

## 3. Новая функция normalizeConditionsForApi (WEB)

**Файл:** `frontend/src/utils/loyaltyConditions.js`

```javascript
/**
 * Нормализует условия скидки для отправки на API
 * 
 * @param {any} input - Входные данные условий (может быть null, undefined, object, array)
 * @returns {object} - Dict с condition_type и parameters (не Array!)
 */
export function normalizeConditionsForApi(input) {
  // Маппинг UI type → backend condition_type
  const UI_TO_BACKEND_TYPE_MAP = {
    "visits_count": "visit_count",
    "total_spent": "spent_amount",
    "days_since_last": "days_since_last_visit",
    "service_category": "service_category",
  }

  // Если null или undefined → пустой dict
  if (input == null) {
    return {}
  }

  // Если уже объект с condition_type и parameters → вернуть как есть
  if (typeof input === 'object' && !Array.isArray(input)) {
    if (input.condition_type && input.parameters) {
      return input
    }
    // Если объект без condition_type/parameters → попробовать преобразовать
    if (input.type) {
      return _convertUIFormatToBackend(input)
    }
    // Иначе → вернуть как есть (может быть уже правильный формат)
    return input
  }

  // Если массив → взять первое условие и преобразовать
  if (Array.isArray(input)) {
    if (input.length === 0) {
      return {}
    }
    const first = input[0]
    return _convertUIFormatToBackend(first)
  }

  // Если другой тип → пустой dict
  if (__DEV__) {
    console.warn('[loyaltyConditions] Unexpected input type, returning empty dict:', typeof input, input)
  }
  return {}
}

/**
 * Преобразует UI формат условия в backend формат
 * @param {object} uiCondition - {type, operator, value, description}
 * @returns {object} - {condition_type, parameters}
 */
function _convertUIFormatToBackend(uiCondition) {
  const UI_TO_BACKEND_TYPE_MAP = {
    "visits_count": "visit_count",
    "total_spent": "spent_amount",
    "days_since_last": "days_since_last_visit",
    "service_category": "service_category",
  }

  const uiType = uiCondition.type || uiCondition.condition_type
  const backendType = UI_TO_BACKEND_TYPE_MAP[uiType] || uiType

  // Формируем parameters в зависимости от типа
  let parameters = {}

  if (backendType === "visit_count") {
    parameters = {
      visits_count: parseInt(uiCondition.value) || 0,
      operator: uiCondition.operator || ">=",
    }
  } else if (backendType === "spent_amount") {
    parameters = {
      amount: parseFloat(uiCondition.value) || 0,
      operator: uiCondition.operator || ">=",
    }
  } else if (backendType === "days_since_last_visit") {
    parameters = {
      days: parseInt(uiCondition.value) || 0,
      operator: uiCondition.operator || ">=",
    }
  } else if (backendType === "service_category") {
    // Если value - массив, использовать его; иначе пустой массив
    parameters = {
      category_ids: Array.isArray(uiCondition.value) ? uiCondition.value : [],
    }
  } else {
    // Для неизвестных типов - минимальный формат
    parameters = {
      value: uiCondition.value,
      operator: uiCondition.operator,
    }
  }

  return {
    condition_type: backendType,
    parameters: parameters,
  }
}
```

---

## 4. Новая функция normalizeConditionsForApi (MOBILE)

**Файл:** `mobile/src/utils/loyaltyConditions.ts`

```typescript
/**
 * Нормализует условия скидки для отправки на API
 * 
 * @param input - Входные данные условий (может быть null, undefined, object, array)
 * @returns Dict с condition_type и parameters (не Array!)
 */
export function normalizeConditionsForApi(input: any): Record<string, any> {
  // Маппинг UI type → backend condition_type
  const UI_TO_BACKEND_TYPE_MAP: Record<string, string> = {
    "visits_count": "visit_count",
    "total_spent": "spent_amount",
    "days_since_last": "days_since_last_visit",
    "service_category": "service_category",
  }

  // Если null или undefined → пустой dict
  if (input == null) {
    return {}
  }

  // Если уже объект с condition_type и parameters → вернуть как есть
  if (typeof input === 'object' && !Array.isArray(input)) {
    if (input.condition_type && input.parameters) {
      return input
    }
    // Если объект без condition_type/parameters → попробовать преобразовать
    if (input.type) {
      return _convertUIFormatToBackend(input)
    }
    // Иначе → вернуть как есть
    return input
  }

  // Если массив → взять первое условие и преобразовать
  if (Array.isArray(input)) {
    if (input.length === 0) {
      return {}
    }
    const first = input[0]
    return _convertUIFormatToBackend(first)
  }

  // Если другой тип → пустой dict
  if (__DEV__) {
    console.warn('[loyaltyConditions] Unexpected input type, returning empty dict:', typeof input, input)
  }
  return {}
}

/**
 * Преобразует UI формат условия в backend формат
 */
function _convertUIFormatToBackend(uiCondition: any): Record<string, any> {
  const UI_TO_BACKEND_TYPE_MAP: Record<string, string> = {
    "visits_count": "visit_count",
    "total_spent": "spent_amount",
    "days_since_last": "days_since_last_visit",
    "service_category": "service_category",
  }

  const uiType = uiCondition.type || uiCondition.condition_type
  const backendType = UI_TO_BACKEND_TYPE_MAP[uiType] || uiType

  // Формируем parameters в зависимости от типа
  let parameters: Record<string, any> = {}

  if (backendType === "visit_count") {
    parameters = {
      visits_count: parseInt(uiCondition.value) || 0,
      operator: uiCondition.operator || ">=",
    }
  } else if (backendType === "spent_amount") {
    parameters = {
      amount: parseFloat(uiCondition.value) || 0,
      operator: uiCondition.operator || ">=",
    }
  } else if (backendType === "days_since_last_visit") {
    parameters = {
      days: parseInt(uiCondition.value) || 0,
      operator: uiCondition.operator || ">=",
    }
  } else if (backendType === "service_category") {
    parameters = {
      category_ids: Array.isArray(uiCondition.value) ? uiCondition.value : [],
    }
  } else {
    // Для неизвестных типов - минимальный формат
    parameters = {
      value: uiCondition.value,
      operator: uiCondition.operator,
    }
  }

  return {
    condition_type: backendType,
    parameters: parameters,
  }
}
```

---

## 5. Убрать дублирование нормализации в MOBILE

**Рекомендация:** Оставить нормализацию в API слое, убрать из UI компонентов.

### 5.1 Добавить нормализацию в API слой

**Файл:** `mobile/src/services/api/loyalty_discounts.ts:98`

```typescript
export async function createComplexDiscount(data: LoyaltyDiscountCreate): Promise<LoyaltyDiscount> {
  // Нормализуем conditions перед отправкой
  const { normalizeConditionsForApi } = require('@src/utils/loyaltyConditions');
  const normalizedData = {
    ...data,
    conditions: normalizeConditionsForApi(data.conditions),
  };
  
  const response = await apiClient.post<LoyaltyDiscount>('/api/loyalty/complex-discounts', normalizedData);
  return response.data;
}
```

### 5.2 Убрать нормализацию из UI компонентов

**Файл 1:** `mobile/src/components/loyalty/DiscountsComplexTab.tsx:64-74`

**Было:**
```typescript
const normalizedConditions = normalizeConditionsForApi(form.conditions);
if (normalizedConditions.length === 0) {
  Alert.alert('Ошибка', 'Необходимо добавить хотя бы одно условие для сложной скидки');
  return;
}
const success = await onCreateDiscount({
  ...form,
  conditions: normalizedConditions,
});
```

**Стало:**
```typescript
if (form.conditions.length === 0) {
  Alert.alert('Ошибка', 'Необходимо добавить хотя бы одно условие для сложной скидки');
  return;
}
const success = await onCreateDiscount(form);  // Передаём как есть, нормализация в API слое
```

**Файл 2:** `mobile/app/master/loyalty.tsx:465-496`

**Было:**
```typescript
const { normalizeConditionsForApi } = require('@src/utils/loyaltyConditions');
const normalizedConditions = normalizeConditionsForApi(form.conditions);
if (normalizedConditions.length === 0) {
  Alert.alert('Ошибка', 'Необходимо добавить хотя бы одно условие для сложной скидки');
  return false;
}
await createComplexDiscount({
  ...form,
  conditions: normalizedConditions,
});
```

**Стало:**
```typescript
if (form.conditions.length === 0) {
  Alert.alert('Ошибка', 'Необходимо добавить хотя бы одно условие для сложной скидки');
  return false;
}
await createComplexDiscount({
  discount_type: LoyaltyDiscountType.COMPLEX,
  name: form.name,
  description: form.description,
  discount_percent: parseFloat(form.discount_percent),
  max_discount_amount: null,
  conditions: form.conditions,  // Передаём как есть, нормализация в API слое
  is_active: true,
  priority: 1,
});
```

---

## 6. Проверка пустых conditions (обновить)

**WEB:** `frontend/src/components/LoyaltySystem.jsx:390`

**Было:**
```javascript
if (normalizedConditions.length === 0) {
```

**Стало:**
```javascript
if (!normalizedConditions.condition_type || Object.keys(normalizedConditions.parameters || {}).length === 0) {
```

---

## 7. Итоговый план изменений

1. ✅ Обновить `frontend/src/utils/loyaltyConditions.js` — новая функция
2. ✅ Обновить `mobile/src/utils/loyaltyConditions.ts` — новая функция
3. ✅ Обновить `mobile/src/services/api/loyalty_discounts.ts:createComplexDiscount` — добавить нормализацию
4. ✅ Обновить `mobile/src/components/loyalty/DiscountsComplexTab.tsx` — убрать нормализацию
5. ✅ Обновить `mobile/app/master/loyalty.tsx` — убрать нормализацию
6. ✅ Обновить `frontend/src/components/LoyaltySystem.jsx` — исправить проверку пустых conditions

---

## 8. Тестирование

**После изменений:**
1. Создать complex discount с `type: "visits_count"` → проверить Network tab
2. Ожидаемый payload:
   ```json
   {
     "conditions": {
       "condition_type": "visit_count",
       "parameters": {
         "visits_count": 5,
         "operator": ">="
       }
     }
   }
   ```
3. Проверить, что нет 422
4. Проверить, что backend принимает запрос
