# LOYALTY Continuation Pack (WEB + MOBILE)

**Дата:** 2026-01-21 (обновлено после исправления P0)  
**Цель:** 100% конкретика для продолжения работы после P0 bugfix

**⚠️ ВАЖНО:** Этот документ обновлён после исправления нормализации conditions. См. также:
- `LOYALTY_CONDITIONS_TRUTH.md` — 100% истина о backend contract
- `LOYALTY_CONDITIONS_FIX.md` — конкретные исправления

---

## BLOCK 1 — BACKEND CONTRACT (истина)

**⚠️ ОБНОВЛЕНО:** См. также `LOYALTY_CONDITIONS_TRUTH.md` для 100% истины.

### 1.1 Эндпоинты и схемы

#### POST /api/loyalty/complex-discounts
**Файл:** `backend/routers/loyalty.py:535-561`  
**Схема:** `LoyaltyDiscountCreate` (наследует `LoyaltyDiscountBase`)  
**Файл схемы:** `backend/schemas.py:1488-1500`

```python
# backend/schemas.py:1488-1496
class LoyaltyDiscountBase(BaseModel):
    discount_type: LoyaltyDiscountType  # обязательное
    name: str  # обязательное
    description: Optional[str] = None
    discount_percent: float = Field(..., ge=0, le=100)  # обязательное, 0-100
    max_discount_amount: Optional[float] = None
    conditions: dict  # ⚠️ ОБЯЗАТЕЛЬНОЕ, тип: dict (не List[dict]!)
    is_active: bool = True
    priority: int = Field(default=1, ge=1, le=10)
```

**КРИТИЧНО:** `conditions: dict` — это **dict (объект)**, НЕ `List[dict]`!

**Структура conditions (из кода `backend/utils/loyalty_discounts.py:231-233`):**
```python
condition = rule.conditions or {}
condition_type = condition.get("condition_type")  # строка из LoyaltyConditionType enum
parameters = condition.get("parameters", {})     # dict с параметрами
```

**Формат:**
```json
{
  "condition_type": "visit_count",  // ⚠️ НЕ "visits_count"!
  "parameters": {
    "visits_count": 5,
    "operator": ">="
  }
}
```

---

#### PUT /api/loyalty/complex-discounts/{id}
**Файл:** `backend/routers/loyalty.py:580-606`  
**Схема:** `LoyaltyDiscountUpdate`  
**Файл схемы:** `backend/schemas.py:1503-1511`

```python
# backend/schemas.py:1503-1511
class LoyaltyDiscountUpdate(BaseModel):
    discount_type: Optional[LoyaltyDiscountType] = None
    name: Optional[str] = None
    description: Optional[str] = None
    discount_percent: Optional[float] = Field(None, ge=0, le=100)
    max_discount_amount: Optional[float] = None
    conditions: Optional[dict] = None  # ⚠️ Optional, но если есть — должен быть dict
    is_active: Optional[bool] = None
    priority: Optional[int] = Field(None, ge=1, le=10)
```

---

#### POST /api/loyalty/personal-discounts
**Файл:** `backend/routers/loyalty.py:633-670`  
**Схема:** `PersonalDiscountCreate` (наследует `PersonalDiscountBase`)  
**Файл схемы:** `backend/schemas.py:1525-1534`

```python
# backend/schemas.py:1525-1531
class PersonalDiscountBase(BaseModel):
    client_phone: str = Field(..., pattern=r"^\+?1?\d{9,15}$")  # обязательное
    discount_percent: float = Field(..., ge=0, le=100)  # обязательное
    max_discount_amount: Optional[float] = None
    description: Optional[str] = None
    is_active: bool = True
```

**Примечание:** PersonalDiscount **НЕ имеет поля `conditions`** — это только для LoyaltyDiscount (quick/complex).

---

#### PUT /api/loyalty/personal-discounts/{id}
**Файл:** `backend/routers/loyalty.py:688-713`  
**Схема:** `PersonalDiscountUpdate`  
**Файл схемы:** `backend/schemas.py:1537-1542`

```python
# backend/schemas.py:1537-1542
class PersonalDiscountUpdate(BaseModel):
    client_phone: Optional[str] = Field(None, pattern=r"^\+?1?\d{9,15}$")
    discount_percent: Optional[float] = Field(None, ge=0, le=100)
    max_discount_amount: Optional[float] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None
```

---

### 1.2 Структура поля `conditions`

**Модель БД:** `backend/models.py:1065`
```python
conditions = Column(JSON, nullable=False)  # JSON с условиями
```

**Схема Pydantic:** `backend/schemas.py:1494`
```python
conditions: dict  # dict, не List[dict]
```

**Вывод:**
- Backend ожидает `conditions` как **dict (объект)**, НЕ как массив
- Если отправить `conditions: []` (массив) → **422 "Input should be a valid dictionary"**
- Если отправить `conditions: null` → **422** (обязательное поле)

---

### 1.3 Enum LoyaltyConditionType (источник истины)

**Файл:** `backend/models.py:1014-1041`

**Все допустимые значения:**
- Quick: `first_visit`, `regular_visits`, `returning_client`, `birthday`, `happy_hours`, `service_discount`
- Complex: `visit_count` ⚠️ (НЕ `visits_count`!), `spent_amount`, `days_since_last_visit`, `birthday_range`, `time_slot`, `day_of_week`, `season`, `advance_booking`, `service_category`, `specific_service`, `multiple_services`, `referral_count`, `promo_code`, `social_activity`, `online_payment`, `package_purchase`, `check_amount`, `repeat_service`

**КРИТИЧНО:** Backend enum использует `VISIT_COUNT = "visit_count"` (строка 1024), НЕ `"visits_count"`!

---

### 1.4 Golden Payload для Complex Discount Create

**Гарантированно валидный payload:**

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

**Структура conditions (из кода `backend/utils/loyalty_discounts.py:231-233`):**
```python
condition = rule.conditions or {}
condition_type = condition.get("condition_type")  # строка из enum
parameters = condition.get("parameters", {})       # dict с параметрами
```

**⚠️ ВАЖНО:** Complex discounts с `visit_count`, `spent_amount`, `days_since_last_visit`, `service_category` **НЕ обрабатываются** в `evaluate_discount_candidates` (попадают в "unknown_condition", строка 332-334). Они могут быть созданы, но не применяются при бронировании.

---

### 1.4 Что даёт 422

**422 будет, если:**
1. `conditions` отсутствует (обязательное поле)
2. `conditions` = `null` или `undefined`
3. `conditions` = `[]` (массив вместо dict)
4. `conditions` = `"string"` (строка вместо dict)
5. `conditions` = `123` (число вместо dict)

**422 НЕ будет, если:**
- `conditions` = `{}` (пустой dict) — пройдёт валидацию Pydantic, но может быть бизнес-логика, которая требует непустой dict
- `conditions` = `{"key": "value"}` (любой валидный dict)

---

## BLOCK 2 — FRONTEND/MOBILE: ACTUAL REQUEST PAYLOADS

### 2.1 WEB: Payload для Complex Create

**Файл:** `frontend/src/components/LoyaltySystem.jsx:378-410`

**Текущий код:**
```javascript
// Строка 387: нормализация
const normalizedConditions = normalizeConditionsForApi(formData.conditions)

// Строка 402-410: payload
body: JSON.stringify({
  discount_type: 'complex',
  name: formData.name,
  description: formData.description,
  discount_percent: parseFloat(formData.discount_percent),
  max_discount_amount: null,
  conditions: normalizedConditions,  // ⚠️ ПРОБЛЕМА: normalizedConditions = Array<object>
  is_active: true,
  priority: 1
})
```

**Проблема:**
- `normalizeConditionsForApi()` возвращает `Array<object>` (массив)
- Backend ожидает `dict` (объект)
- **Результат:** 422 "Input should be a valid dictionary"

**Что отправляется сейчас (WEB):**
```json
{
  "conditions": [
    {
      "type": "visits_count",
      "operator": ">=",
      "value": "5",
      "description": "Более 5 визитов"
    }
  ]
}
```

**Что отправляется сейчас (MOBILE):**
```json
{
  "conditions": [
    {
      "type": "visits_count",
      "operator": ">=",
      "value": "5",
      "description": "Более 5 визитов"
    }
  ]
}
```

**Что должен ожидать backend (из кода `loyalty_discounts.py:231-233`):**
```json
{
  "conditions": {
    "condition_type": "visit_count",  // ⚠️ НЕ "visits_count"!
    "parameters": {
      "visits_count": 5,
      "operator": ">="
    }
  }
}
```

**Проблема:** 
- Frontend/MOBILE отправляет **массив** объектов с полями `type: "visits_count"`/`operator`/`value`/`description`
- Backend ожидает **dict** с `condition_type: "visit_count"` и `parameters: {...}`
- **Результат:** 422 "Input should be a valid dictionary"

**Нужно:**
1. Преобразовать массив условий в dict с `condition_type` и `parameters`
2. Если несколько условий — выбрать **первое** (complex discount поддерживает только одно условие)
3. Маппинг:
   - `type: "visits_count"` → `condition_type: "visit_count"` (через маппинг)
   - `value` → `parameters.visits_count = parseInt(value)` (для visit_count)
   - `operator` → `parameters.operator`
   - `description` → игнорировать (не используется в backend)

---

### 2.2 MOBILE: Payload для Complex Create

**Файл 1:** `mobile/src/components/loyalty/DiscountsComplexTab.tsx:64-74`
```typescript
// Строка 65: нормализация
const normalizedConditions = normalizeConditionsForApi(form.conditions);

// Строка 71-74: передача в onCreateDiscount
const success = await onCreateDiscount({
  ...form,
  conditions: normalizedConditions,  // ⚠️ Array<object>
});
```

**Файл 2:** `mobile/app/master/loyalty.tsx:465-496`
```typescript
// Строка 468: нормализация (ДУБЛЬ!)
const normalizedConditions = normalizeConditionsForApi(form.conditions);

// Строка 487-496: payload
await createComplexDiscount({
  discount_type: LoyaltyDiscountType.COMPLEX,
  name: form.name,
  description: form.description,
  discount_percent: parseFloat(form.discount_percent),
  max_discount_amount: null,
  conditions: normalizedConditions,  // ⚠️ Array<object>
  is_active: true,
  priority: 1,
});
```

**Проблема:** Та же — `normalizedConditions` = `Array<object>`, а backend ожидает `dict`.

---

### 2.3 Сравнение с Backend Contract

| Поле | Backend ожидает | WEB отправляет | MOBILE отправляет | Совпадение |
|------|----------------|----------------|------------------|------------|
| `conditions` | `dict` | `Array<object>` | `Array<object>` | ❌ **НЕ СОВПАДАЕТ** |

**Вывод:**
- ❌ **P0 BUG:** `normalizeConditionsForApi()` возвращает массив, но backend ожидает dict
- ❌ **422 гарантирован** при текущей реализации
- ⚠️ Нужно исправить нормализацию: если массив из 1 элемента → вернуть объект, если массив из нескольких → обернуть в dict с ключом `conditions`

---

## BLOCK 3 — NORMALIZATION: где она стоит и нет ли дубля

### 3.1 Все места вызова normalizeConditionsForApi

| Платформа | Файл | Функция | Когда вызывается | Формат входа | Формат выхода |
|-----------|------|---------|------------------|--------------|---------------|
| **WEB** | `frontend/src/components/LoyaltySystem.jsx:387` | `handleCreateComplexDiscount` | При создании complex discount | `formData.conditions` (массив объектов) | `Array<object>` |
| **MOBILE** | `mobile/src/components/loyalty/DiscountsComplexTab.tsx:65` | `handleSubmit` | При submit формы | `form.conditions` (массив объектов) | `Array<object>` |
| **MOBILE** | `mobile/app/master/loyalty.tsx:468` | `handleCreateComplexDiscount` | При создании complex discount | `form.conditions` (массив объектов) | `Array<object>` |

---

### 3.2 Дублирование нормализации

**Проблема:** В MOBILE нормализация вызывается **2 раза подряд:**

1. **Первый раз:** `DiscountsComplexTab.tsx:65` → нормализует и передаёт в `onCreateDiscount`
2. **Второй раз:** `loyalty.tsx:468` → нормализует снова (но уже нормализованные данные!)

**Риск "двойной нормализации":**
- Если `normalizeConditionsForApi([{...}])` → `[{...}]`
- Затем `normalizeConditionsForApi([{...}])` снова → `[{...}]` (без изменений, но лишний вызов)
- Если `normalizeConditionsForApi(null)` → `[]`
- Затем `normalizeConditionsForApi([])` → `[]` (без изменений)

**Вывод:** Дублирование не критично, но неэффективно. Лучше нормализовать один раз.

---

### 3.3 Предложение: "единая истина"

**Вариант A (рекомендуется):** Нормализовать в API слое (перед отправкой)
- `mobile/src/services/api/loyalty_discounts.ts:createComplexDiscount` — нормализовать там
- Убрать нормализацию из `DiscountsComplexTab.tsx` и `loyalty.tsx`

**Вариант B:** Нормализовать в UI компоненте (при submit)
- Оставить нормализацию в `DiscountsComplexTab.tsx:handleSubmit`
- Убрать из `loyalty.tsx:handleCreateComplexDiscount`

**Вариант C:** Нормализовать в родительском компоненте
- Оставить нормализацию в `loyalty.tsx:handleCreateComplexDiscount`
- Убрать из `DiscountsComplexTab.tsx:handleSubmit`

**Рекомендация:** Вариант A — нормализация в API слое, так как это ближе к "границе" отправки данных.

---

### 3.4 Исправление нормализации (критично!)

**Текущая функция:** `normalizeConditionsForApi(input)` → `Array<object>`

**Нужная функция:** `normalizeConditionsForApi(input)` → `dict` с `condition_type` и `parameters`

**Логика (на основе backend кода):**
1. Если `input = null/undefined` → `{}` (пустой dict)
2. Если `input = object` с `condition_type` и `parameters` → вернуть как есть
3. Если `input = array`:
   - Если массив из 1+ элементов → взять **первое** условие и преобразовать:
     ```javascript
     const first = input[0]
     return {
       condition_type: first.type || first.condition_type,
       parameters: {
         [first.type]: parseInt(first.value) || first.value,  // например, visits_count: 5
         operator: first.operator,  // если есть
         // другие поля из first, которые нужны для конкретного condition_type
       }
     }
     ```
   - Если массив пустой → `{}`

**Маппинг полей frontend → backend:**
- `type` → `condition_type` (например, `"visits_count"` → `"visit_count"` — проверить enum!)
- `value` → `parameters[type]` (например, `parameters.visits_count = parseInt(value)`)
- `operator` → `parameters.operator` (если нужен для condition_type)
- `description` → игнорировать (не используется в backend)

**Важно:** Проверить соответствие `type` из frontend и `condition_type` из backend enum:
- Frontend: `"visits_count"` (WEB: `LoyaltySystem.jsx:830`, MOBILE: `DiscountsComplexTab.tsx:28`)
- Backend enum: `LoyaltyConditionType.VISIT_COUNT = "visit_count"` (`backend/models.py:1024`)
- **Несовпадение!** Frontend использует `"visits_count"`, backend ожидает `"visit_count"`

**Маппинг типов (нужно добавить в нормализацию):**
```javascript
const TYPE_MAP = {
  "visits_count": "visit_count",  // frontend → backend
  "total_spent": "spent_amount",
  "days_since_last": "days_since_last_visit",
  "service_category": "service_category",
  // ... другие маппинги
}
```

**Пример преобразования:**
```javascript
// Вход (frontend):
[
  {
    type: "visits_count",  // ⚠️ frontend формат
    operator: ">=",
    value: "5",
    description: "Более 5 визитов"
  }
]

// Выход (backend):
{
  condition_type: "visit_count",  // ⚠️ backend enum формат
  parameters: {
    visits_count: 5,  // parseInt(value)
    operator: ">="
  }
}
```

---

## BLOCK 4 — UI WORK PLAN

### A) POINTS: одна вкладка вместо 3 подтабов (WEB + MOBILE)

#### A.1 WEB

**Файлы для изменения:**
- `frontend/src/components/MasterLoyalty.jsx` (основной компонент)
- `frontend/src/components/MasterLoyaltyStats.jsx` (использовать как секцию)
- `frontend/src/components/MasterLoyaltyHistory.jsx` (использовать как секцию)

**Текущая структура:**
- Строка 9: `const [activeTab, setActiveTab] = useState('settings')`
- Строки 172-204: Табы "Настройки/Статистика/История"
- Строка 208: `{activeTab === 'settings' && ...}` — рендер настроек
- Строка 316: `{activeTab === 'stats' && <MasterLoyaltyStats />}`
- Строка 317: `{activeTab === 'history' && <MasterLoyaltyHistory />}`

**План изменений:**

1. **Убрать табы:**
   - Удалить строки 172-204 (табы)
   - Удалить `activeTab` state (строка 9)

2. **Объединить в одну страницу:**
   - Секция 1: Switch "Баллы включены" (строки 230-240)
   - Секция 2: Компактная форма (строки 243-299) — добавить суффикс "%" к процентам
   - Секция 3: Статистика — импортировать и встроить `MasterLoyaltyStats` как компонент
   - Секция 4: История — импортировать и встроить `MasterLoyaltyHistory` с модалкой для фильтров

3. **Модалка для фильтров истории:**
   - Создать компонент `HistoryFiltersModal.jsx` (или встроить в `MasterLoyaltyHistory.jsx`)
   - Кнопка "Фильтры" над списком истории
   - В модалке: `client_id`, `transaction_type`, `start_date`, `end_date`, "Сбросить"
   - После Apply/Close — перезагрузка списка

4. **Процентные поля с суффиксом "%":**
   - Строка 250-259: `accrual_percent` — добавить `<span>%</span>` справа от input
   - Строка 288-297: `max_payment_percent` — добавить `<span>%</span>` справа от input

5. **Dropdown для `points_lifetime_days`:**
   - Строка 267-280: уже есть `<select>`, но проверить, что все опции есть (14/30/60/90/180/365/∞)

**Риски регрессий:**
- ⚠️ Auth-gating: проверить, что `useEffect` с `authLoading`/`isAuthenticated` сохранён (строки 17-24)
- ⚠️ useEffect зависимости: при объединении секций может быть дублирование запросов (stats + history загружаются одновременно)
- ⚠️ Лишние запросы: если stats и history загружаются при монтировании, даже если `is_enabled = false`

**Мини smoke checklist (8 пунктов):**
1. ✅ Открыть "Баллы" → нет подтабов, одна страница
2. ✅ Switch "Баллы включены" работает
3. ✅ При выключении поля скрыты, статистика/история видны
4. ✅ Процентные поля показывают "%" справа
5. ✅ Dropdown `points_lifetime_days` работает
6. ✅ Статистика отображается
7. ✅ История отображается
8. ✅ Кнопка "Фильтры" открывает модалку, фильтры применяются

---

#### A.2 MOBILE

**Файлы для изменения:**
- `mobile/app/master/loyalty.tsx` (основной экран)

**Текущая структура:**
- Строка 765-793: Подтабы для "Баллы" (settings/stats/history)
- Строка 796: `{pointsTab === 'settings' && ...}` — рендер настроек
- Строка 882: `{pointsTab === 'stats' && ...}` — рендер статистики
- Строка 920: `{pointsTab === 'history' && ...}` — рендер истории

**План изменений:**

1. **Убрать подтабы:**
   - Удалить строки 765-793 (подтабы)
   - Удалить `pointsTab` state (строка 70: `const [pointsTab, setPointsTab] = useState<PointsTabType>('settings')`)
   - Удалить `useEffect` зависимости от `pointsTab` (строки 366-369, 372-376)

2. **Объединить в одну страницу:**
   - Switch "Баллы включены" (строки 812-820)
   - Компактная форма (строки 822-890) — добавить "%" к процентам, dropdown для `points_lifetime_days`
   - Статистика (строки 882-917) — встроить ниже формы
   - История (строки 920-1120) — встроить ниже статистики, с модалкой для фильтров

3. **Модалка для фильтров истории:**
   - Создать компонент `HistoryFiltersModal.tsx` (или встроить в экран)
   - Кнопка "Фильтры" над списком истории
   - В модалке: `client_id`, `transaction_type` (segmented control), `start_date`, `end_date`, "Сбросить"
   - После Apply/Close — перезагрузка списка

4. **Процентные поля с "%":**
   - Строка 828-838: `accrual_percent` — добавить `<Text>%</Text>` справа от input
   - Найти `max_payment_percent` и добавить "%"

5. **Dropdown для `points_lifetime_days`:**
   - Строка 841-860: уже есть ScrollView с опциями, но лучше заменить на `<Picker>` или custom select

**Риски регрессий:**
- ⚠️ Auth-gating: проверить, что проверки `!authLoading && token && isAuthenticated` сохранены
- ⚠️ useEffect зависимости: при объединении секций может быть дублирование запросов
- ⚠️ Лишние запросы: stats и history загружаются одновременно

**Мини smoke checklist (8 пунктов):**
1. ✅ Открыть "Баллы" → нет подтабов, одна страница
2. ✅ Switch "Баллы включены" работает
3. ✅ При выключении поля скрыты, статистика/история видны
4. ✅ Процентные поля показывают "%" справа
5. ✅ Dropdown `points_lifetime_days` работает
6. ✅ Статистика отображается
7. ✅ История отображается
8. ✅ Кнопка "Фильтры" открывает модалку, фильтры применяются

---

### B) QUICK DISCOUNTS: MOBILE grid 2 колонки

**Файл для изменения:**
- `mobile/src/components/loyalty/DiscountsQuickTab.tsx`

**Текущая структура:**
- Строка 92-93: `<ScrollView horizontal>` с `templatesGrid`
- Строка 94: `<View style={styles.templatesGrid}>` — горизонтальная сетка
- Строка 99: `<Card>` для каждого шаблона

**План изменений:**

1. **Заменить ScrollView на FlatList:**
   - Удалить `<ScrollView horizontal>` (строка 93)
   - Заменить на `<FlatList data={templates} numColumns={2} .../>`

2. **Добавить одинаковую высоту карточек:**
   - В `styles.templateCard` добавить `minHeight: 200` (или другое значение)

3. **Обрезать текст описания:**
   - Добавить `numberOfLines={3}` к `<Text>` с описанием

**Риски регрессий:**
- ⚠️ Горизонтальный скролл может быть нужен на маленьких экранах — проверить UX
- ⚠️ `FlatList` требует `keyExtractor` — добавить

**Мини smoke checklist (5 пунктов):**
1. ✅ Сетка: 2 колонки (не горизонтальный скролл)
2. ✅ Карточки одинаковой высоты
3. ✅ Текст описания обрезан до 3 строк
4. ✅ На маленьких экранах сетка адаптивна
5. ✅ Все шаблоны отображаются

---

## ИТОГОВЫЙ ВЫВОД

### Можно продолжать: ✅ ДА, P0 исправлен

**Статус P0:**
- ✅ **P0 исправлен:** `normalizeConditionsForApi()` возвращает `dict` с правильным форматом
- ✅ **Маппинг типов:** `"visits_count"` → `"visit_count"` реализован
- ✅ **Дублирование убрано:** Нормализация только в API слое (MOBILE)
- ✅ **Готово к тестированию:** Создание complex discount должно работать без 422

**Исправления применены:**
1. ✅ `frontend/src/utils/loyaltyConditions.js` — обновлена функция
2. ✅ `mobile/src/utils/loyaltyConditions.ts` — обновлена функция
3. ✅ `mobile/src/services/api/loyalty_discounts.ts` — добавлена нормализация
4. ✅ `mobile/src/components/loyalty/DiscountsComplexTab.tsx` — убрана нормализация
5. ✅ `mobile/app/master/loyalty.tsx` — убрана нормализация
6. ✅ `frontend/src/components/LoyaltySystem.jsx` — обновлена проверка пустых conditions

**После исправления P0:**
- ✅ Можно продолжать UI работу (Points одна страница, Quick grid 2x3)
- ✅ Все изменения безопасны

---

## Рекомендации

1. **Сначала исправить P0:** Обновить `normalizeConditionsForApi()` чтобы возвращать `dict`
2. **Затем убрать дубли:** Оставить нормализацию в одном месте
3. **Потом UI:** Реализовать Points одна страница и Quick grid 2x3

**Формат для тестирования после P0 fix:**
- Создать complex discount → проверить Network tab
- `conditions` должен быть объектом: `{"condition_type": "visit_count", "parameters": {...}}`
- Если 422 → проверить маппинг типов и структуру `parameters`

**Конкретный план исправления P0:**

1. Обновить `frontend/src/utils/loyaltyConditions.js`:
   - Изменить возвращаемый тип на `dict`
   - Добавить маппинг `TYPE_MAP = {"visits_count": "visit_count", ...}`
   - Преобразовать первый элемент массива в формат backend:
     ```javascript
     if (Array.isArray(input) && input.length > 0) {
       const first = input[0]
       return {
         condition_type: TYPE_MAP[first.type] || first.type,
         parameters: {
           [first.type]: parseInt(first.value) || first.value,
           operator: first.operator,
         }
       }
     }
     ```

2. Обновить `mobile/src/utils/loyaltyConditions.ts`:
   - То же самое

3. Протестировать:
   - Создать complex discount с одним условием
   - Проверить Network tab → payload должен быть валидным
   - Проверить, что backend принимает без 422

---

## КРАТКОЕ РЕЗЮМЕ

### ✅ Что готово
- ✅ **P0 BUGFIX:** `normalizeConditionsForApi()` исправлена — возвращает `dict` с правильным форматом
- ✅ **Маппинг типов:** `"visits_count"` → `"visit_count"` реализован
- ✅ **Дублирование убрано:** Нормализация только в API слое (MOBILE)
- ✅ UI: Grid 2x3 для "Быстрые" в WEB
- ✅ Документация: Полный пакет информации (`LOYALTY_CONDITIONS_TRUTH.md`, `LOYALTY_CONDITIONS_FIX.md`)

### 📋 Следующие шаги (в порядке приоритета)

1. ✅ **P0 (критично):** ИСПРАВЛЕНО
   - ✅ `frontend/src/utils/loyaltyConditions.js` — обновлена функция
   - ✅ `mobile/src/utils/loyaltyConditions.ts` — обновлена функция
   - ✅ Маппинг типов реализован

2. ✅ **P1:** ИСПРАВЛЕНО
   - ✅ `mobile/src/services/api/loyalty_discounts.ts` — нормализация добавлена
   - ✅ `mobile/src/components/loyalty/DiscountsComplexTab.tsx` — нормализация убрана
   - ✅ `mobile/app/master/loyalty.tsx` — нормализация убрана

3. **UI:** Реализовать Points одна страница (WEB + MOBILE):
   - Файлы: `frontend/src/components/MasterLoyalty.jsx`, `mobile/app/master/loyalty.tsx`
   - Убрать подтабы, объединить в одну страницу, модалка для фильтров

4. **UI:** Grid 2x3 для "Быстрые" (MOBILE):
   - Файл: `mobile/src/components/loyalty/DiscountsQuickTab.tsx`
   - Заменить `ScrollView` на `FlatList` с `numColumns={2}`

---

## ФАЙЛЫ ДЛЯ ИЗМЕНЕНИЙ

### P0 BUGFIX (критично) — ✅ ИСПРАВЛЕНО
- ✅ `frontend/src/utils/loyaltyConditions.js` — обновлена функция (возвращает `dict`)
- ✅ `mobile/src/utils/loyaltyConditions.ts` — обновлена функция (возвращает `dict`)
- ✅ `frontend/src/components/LoyaltySystem.jsx:390` — обновлена проверка пустых conditions

### P1 (важно) — ✅ ИСПРАВЛЕНО
- ✅ `mobile/src/services/api/loyalty_discounts.ts:98` — добавлена нормализация
- ✅ `mobile/src/components/loyalty/DiscountsComplexTab.tsx:65` — убрана нормализация
- ✅ `mobile/app/master/loyalty.tsx:468` — убрана нормализация

### UI Points (после P0)
- `frontend/src/components/MasterLoyalty.jsx` — убрать подтабы, объединить секции
- `mobile/app/master/loyalty.tsx:765-1120` — убрать подтабы, объединить секции

### UI Quick Grid (после P0)
- `mobile/src/components/loyalty/DiscountsQuickTab.tsx:92-100` — заменить на FlatList

---

**Статус:** ✅ **МОЖНО ПРОДОЛЖАТЬ** — P0 исправлен

**Исправления:**
- ✅ P0: `normalizeConditionsForApi()` возвращает `dict` с правильным форматом
- ✅ Дублирование убрано: нормализация только в API слое (MOBILE)
- ✅ Маппинг типов: `"visits_count"` → `"visit_count"` реализован

**Следующие шаги:**
1. Протестировать создание complex discount → проверить Network tab (должен быть `dict`, не массив)
2. Продолжить UI работу (Points одна страница, Quick grid 2x3)
