# LOYALTY: Whitelist Supported Condition Types

**Дата:** 2026-01-21  
**Статус:** ✅ Реализовано

---

## 1. Backend: SUPPORTED_CONDITION_TYPES

**Файл:** `backend/utils/loyalty_discounts.py:23-30`

```python
# Whitelist поддерживаемых condition_type (реально обрабатываются в evaluate_discount_candidates)
SUPPORTED_CONDITION_TYPES = {
    LoyaltyConditionType.FIRST_VISIT.value,
    LoyaltyConditionType.RETURNING_CLIENT.value,
    LoyaltyConditionType.REGULAR_VISITS.value,
    LoyaltyConditionType.HAPPY_HOURS.value,
    LoyaltyConditionType.SERVICE_DISCOUNT.value,
}
```

**Источник:** Строки 259-330 в `evaluate_discount_candidates` — только эти типы обрабатываются, остальные попадают в "unknown_condition".

---

## 2. Backend: Валидация и логирование

**Файл:** `backend/routers/loyalty.py:535-561`

**Добавлено:**
- ✅ Валидация `condition_type` перед созданием
- ✅ Логирование `condition_type` при создании (INFO)
- ✅ Предупреждение при неподдерживаемом типе (WARNING)
- ✅ HTTP 400 с понятным сообщением при неподдерживаемом типе

**Пример лога:**
```
INFO: POST /api/loyalty/complex-discounts: user_id=1, master_id=1, condition_type=first_visit, discount_name=VIP
WARNING: POST /api/loyalty/complex-discounts: Unsupported condition_type=visit_count for user_id=1, master_id=1. Supported types: {'first_visit', 'returning_client', 'regular_visits', 'happy_hours', 'service_discount'}
```

---

## 3. Frontend (WEB): Ограничение UI

**Файл:** `frontend/src/utils/loyaltyConditions.js`

**Добавлено:**
- ✅ `SUPPORTED_CONDITION_TYPES` — константа с поддерживаемыми типами
- ✅ `isConditionTypeSupported(conditionType)` — функция проверки
- ✅ `getSupportedConditionTypesForUI()` — список для UI

**Файл:** `frontend/src/components/LoyaltySystem.jsx`

**Изменено:**
- ✅ Список типов в select обновлён: только поддерживаемые типы
  - Было: `visits_count`, `total_spent`, `days_since_last`, `service_category`
  - Стало: `first_visit`, `returning_client`, `regular_visits`, `happy_hours`, `service_discount`
- ✅ Дефолтный тип: `first_visit` (вместо `visits_count`)
- ✅ Валидация перед отправкой: проверка `isConditionTypeSupported()`
- ✅ Логирование в DEV: `console.log` с `condition_type` и `parameters`

---

## 4. Mobile: Ограничение UI

**Файл:** `mobile/src/utils/loyaltyConditions.ts`

**Добавлено:**
- ✅ `SUPPORTED_CONDITION_TYPES` — константа с поддерживаемыми типами
- ✅ `isConditionTypeSupported(conditionType)` — функция проверки
- ✅ `getSupportedConditionTypesForUI()` — список для UI

**Файл:** `mobile/src/components/loyalty/DiscountsComplexTab.tsx`

**Изменено:**
- ✅ Список типов обновлён: используется `getSupportedConditionTypesForUI()`
- ✅ Дефолтный тип: `first_visit` (вместо `visits_count`)
- ✅ Валидация перед отправкой: проверка всех условий через `isConditionTypeSupported()`
- ✅ Логирование в DEV: `console.log` с `condition_type` и `parameters`

**Файл:** `mobile/src/services/api/loyalty_discounts.ts`

**Изменено:**
- ✅ Валидация в API слое: проверка `isConditionTypeSupported()` перед отправкой
- ✅ Логирование в DEV: `console.log` с `condition_type` и `parameters`
- ✅ Выброс ошибки при неподдерживаемом типе (с понятным сообщением)

---

## 5. Таблица: Поддерживаемые типы

| UI type | Backend condition_type | Label | Обрабатывается в evaluate? |
|---------|----------------------|-------|----------------------------|
| `first_visit` | `"first_visit"` | Первая запись | ✅ ДА |
| `returning_client` | `"returning_client"` | Возвращение клиента | ✅ ДА |
| `regular_visits` | `"regular_visits"` | Регулярные визиты | ✅ ДА |
| `happy_hours` | `"happy_hours"` | Счастливые часы | ✅ ДА |
| `service_discount` | `"service_discount"` | Скидка на услуги | ✅ ДА |

**Удалены из UI (не поддерживаются):**
- ❌ `visits_count` → `visit_count` (не обрабатывается)
- ❌ `total_spent` → `spent_amount` (не обрабатывается)
- ❌ `days_since_last` → `days_since_last_visit` (не обрабатывается)
- ❌ `service_category` (не обрабатывается)

---

## 6. Логирование

### Backend (Python)
```python
logger.info(
    f"POST /api/loyalty/complex-discounts: user_id={current_user.id}, "
    f"master_id={master_id}, condition_type={condition_type}, "
    f"discount_name={discount.name}"
)
```

### Frontend (JavaScript)
```javascript
if (__DEV__) {
  console.log('[LoyaltySystem] Creating complex discount:', {
    condition_type: normalizedConditions.condition_type,
    parameters: normalizedConditions.parameters,
    discount_name: formData.name,
  })
}
```

### Mobile (TypeScript)
```typescript
if (__DEV__) {
  console.log('[DiscountsComplexTab] Creating complex discount:', {
    condition_type: normalized.condition_type,
    parameters: normalized.parameters,
    discount_name: form.name,
  });
}
```

---

## 7. Валидация

### Backend
- ✅ Проверка `condition_type in SUPPORTED_CONDITION_TYPES`
- ✅ HTTP 400 при неподдерживаемом типе
- ✅ Понятное сообщение с списком поддерживаемых типов

### Frontend (WEB)
- ✅ Проверка `isConditionTypeSupported()` перед отправкой
- ✅ Показ ошибки пользователю (красный блок)
- ✅ Блокировка отправки запроса

### Mobile
- ✅ Проверка всех условий в UI компоненте
- ✅ Проверка в API слое перед отправкой
- ✅ `Alert.alert` при неподдерживаемом типе
- ✅ Выброс ошибки в API слое

---

## 8. Файлы изменены

- ✅ `backend/utils/loyalty_discounts.py` — добавлен `SUPPORTED_CONDITION_TYPES`
- ✅ `backend/routers/loyalty.py` — валидация и логирование в `create_complex_discount`
- ✅ `frontend/src/utils/loyaltyConditions.js` — добавлены функции и константы
- ✅ `frontend/src/components/LoyaltySystem.jsx` — обновлён UI и валидация
- ✅ `mobile/src/utils/loyaltyConditions.ts` — добавлены функции и константы
- ✅ `mobile/src/components/loyalty/DiscountsComplexTab.tsx` — обновлён UI и валидация
- ✅ `mobile/src/services/api/loyalty_discounts.ts` — валидация и логирование

---

## 9. Тестирование

**Проверки:**
1. ✅ Создать complex discount с поддерживаемым типом → должно работать
2. ✅ Создать complex discount с неподдерживаемым типом → должна быть ошибка
3. ✅ Проверить логи (backend console, browser console, mobile console)
4. ✅ Проверить, что в UI только поддерживаемые типы

**Ожидаемые результаты:**
- Backend: HTTP 400 при неподдерживаемом типе
- Frontend: Ошибка в UI, запрос не отправляется
- Mobile: Alert при неподдерживаемом типе, запрос не отправляется
- Логи: `condition_type` виден во всех логах

---

**Статус:** ✅ **READY FOR TESTING**
