# Stage 1.1: WEB Ground Truth - Инвентаризация

**Дата:** 2026-01-21  
**Цель:** Снять "истину" из WEB компонента перед реализацией MOBILE parity

---

## ШАГ 0: WEB Ground Truth

### 0.1 Файлы WEB

**Основной компонент:**
- `frontend/src/components/LoyaltySystem.jsx` (1104 строки)

**Подкомпоненты (внутри файла):**
- `QuickDiscountsTab` (строки 472-674)
- `ComplexDiscountsTab` (строки 677-933)
- `PersonalDiscountsTab` (строки 936-1104)

**Импорты:**
- `getApiUrl` из `../utils/config`
- `getAuthHeaders` из `../utils/api` (через `getAuthHeaders` prop)
- `Button`, `Tabs` из `./ui`
- `MasterLoyalty` из `./MasterLoyalty` (для таба "Баллы")

---

### 0.2 API Calls & Payloads (WEB → Network)

#### **1. GET /api/loyalty/templates**

**Когда:** При загрузке страницы (в `loadData()`)

**Method:** GET  
**Headers:** `getAuthHeaders()` (Authorization: Bearer <token>, Content-Type: application/json)  
**Query params:** Нет

**Response (200 OK):**
```json
[
  {
    "id": "first_visit",
    "name": "Новый клиент",
    "description": "Скидка за первую запись",
    "icon": "🎁",
    "conditions": {
      "condition_type": "first_visit",
      "parameters": {}
    },
    "default_discount": 10.0
  },
  {
    "id": "regular_visits",
    "name": "Регулярные визиты",
    "description": "Скидка за регулярные посещения",
    "icon": "⭐",
    "conditions": {
      "condition_type": "regular_visits",
      "parameters": {
        "visits_count": 5,
        "period": "month"
      }
    },
    "default_discount": 15.0
  },
  // ... еще 4 шаблона
]
```

**Response (404/403):** Игнорируется, `setTemplates([])`

**Используемые поля в UI:**
- `template.id` - ключ для map
- `template.name` - заголовок карточки
- `template.description` - описание под заголовком
- `template.icon` - эмодзи иконка
- `template.conditions.condition_type` - для проверки `isActive` (сравнение с `discount.conditions?.condition_type`)
- `template.default_discount` - процент скидки по умолчанию
- `template.conditions` - передаётся в `handleCreateQuickDiscount` как есть

**Обработка ошибок:**
- 404/403 → `setTemplates([])`, не показывается ошибка
- Network error → `console.warn` в DEV, `setTemplates([])`

---

#### **2. GET /api/loyalty/status**

**Когда:** При загрузке страницы (в `loadData()`)

**Method:** GET  
**Headers:** `getAuthHeaders()`  
**Query params:** Нет

**Response (200 OK):**
```json
{
  "quick_discounts": [
    {
      "id": 1,
      "master_id": 123,
      "salon_id": null,
      "discount_type": "quick",
      "name": "Новый клиент",
      "description": "Скидка за первую запись",
      "discount_percent": 10.0,
      "max_discount_amount": null,
      "conditions": {
        "condition_type": "first_visit",
        "parameters": {}
      },
      "is_active": true,
      "priority": 1,
      "created_at": "2026-01-21T10:00:00Z",
      "updated_at": "2026-01-21T10:00:00Z"
    }
  ],
  "complex_discounts": [...],
  "personal_discounts": [
    {
      "id": 1,
      "master_id": 123,
      "salon_id": null,
      "client_phone": "+79991234567",
      "discount_percent": 15.0,
      "max_discount_amount": 500.0,
      "description": "VIP клиент",
      "is_active": true,
      "created_at": "2026-01-21T10:00:00Z",
      "updated_at": "2026-01-21T10:00:00Z"
    }
  ],
  "total_discounts": 5,
  "active_discounts": 4
}
```

**Используемые поля в UI:**
- `statusData.quick_discounts` → `setQuickDiscounts()`
- `statusData.complex_discounts` → `setComplexDiscounts()`
- `statusData.personal_discounts` → `setPersonalDiscounts()`
- `total_discounts`, `active_discounts` - НЕ используются в UI (только в backend)

**Обработка ошибок:**
- **409 SCHEMA_OUTDATED:**
  - Header: `X-Error-Code: SCHEMA_OUTDATED`
  - Response: `{ detail: "...", hint: "Run alembic upgrade head", debug?: {...} }`
  - UI: Warning блок (жёлтый) с сообщением `detail + hint`
- **404 Master not found:**
  - Response: `{ detail: "Master profile not found for user" }`
  - UI: Error блок с сообщением + инструкция перелогиниться
- **403 Forbidden:**
  - Header: `X-Error-Code: SUBSCRIPTION_REQUIRED` (опционально)
  - Если `X-Error-Code === 'SUBSCRIPTION_REQUIRED'` → `setSubscriptionRequired(true)`, показывается жёлтый блок с CTA
  - Иначе → Error блок с `detail`
- **Другие ошибки:** Error блок с `detail`

**После успеха:** `await loadData()` (refetch всего)

---

#### **3. POST /api/loyalty/quick-discounts**

**Когда:** При создании быстрой скидки из шаблона (`handleCreateQuickDiscount`)

**Method:** POST  
**Headers:** `getAuthHeaders()` + `Content-Type: application/json`  
**Body:**
```json
{
  "discount_type": "quick",
  "name": "Новый клиент",  // из template.name
  "description": "Скидка за первую запись",  // из template.description
  "discount_percent": 10.0,  // customDiscountPercent || template.default_discount
  "max_discount_amount": null,  // всегда null
  "conditions": {  // из template.conditions (как есть)
    "condition_type": "first_visit",
    "parameters": {}
  },
  "is_active": true,  // всегда true
  "priority": 1  // всегда 1
}
```

**Response (200 OK):**
```json
{
  "id": 123,
  "master_id": 456,
  "salon_id": null,
  "discount_type": "quick",
  "name": "Новый клиент",
  "description": "Скидка за первую запись",
  "discount_percent": 10.0,
  "max_discount_amount": null,
  "conditions": {...},
  "is_active": true,
  "priority": 1,
  "created_at": "...",
  "updated_at": "..."
}
```

**После успеха:**
- `await loadData()` - полный refetch статуса
- `setEditingTemplate(null)`
- `setEditTemplateValue('')`

**Обработка ошибок:**
- Error → `setError(errorData.detail || 'Ошибка создания скидки')`
- Error блок показывается в UI

---

#### **4. PUT /api/loyalty/quick-discounts/{id}**

**Когда:** При редактировании процента быстрой скидки (`handleUpdateQuickDiscount`)

**Method:** PUT  
**Headers:** `getAuthHeaders()` + `Content-Type: application/json`  
**Path param:** `{id}` - ID скидки  
**Body:**
```json
{
  "discount_percent": 15.0  // parseFloat(newDiscountPercent)
}
```

**Response (200 OK):** Полный объект `LoyaltyDiscount`

**После успеха:**
- `await loadData()` - полный refetch
- `setEditingDiscount(null)`
- `setEditDiscountValue('')`

**Обработка ошибок:**
- Error → `setError(errorData.detail || 'Ошибка обновления скидки')`

**ВАЖНО:** В WEB редактируется ТОЛЬКО `discount_percent`, другие поля (is_active, priority, max_discount_amount) НЕ редактируются через этот endpoint.

---

#### **5. DELETE /api/loyalty/quick-discounts/{id}**

**Когда:** При удалении быстрой скидки (`handleDeleteQuickDiscount`)

**Method:** DELETE  
**Headers:** `getAuthHeaders()`  
**Path param:** `{id}` - ID скидки

**Response (200 OK):** Пустое тело или 204

**Подтверждение:** `confirm('Вы уверены, что хотите удалить эту скидку?')`

**После успеха:**
- `await loadData()` - полный refetch

**Обработка ошибок:**
- Error → `setError(errorData.detail || 'Ошибка удаления скидки')`

---

#### **6. POST /api/loyalty/complex-discounts**

**Когда:** При создании сложной скидки (`handleCreateComplexDiscount`)

**Method:** POST  
**Headers:** `getAuthHeaders()` + `Content-Type: application/json`  
**Body:**
```json
{
  "discount_type": "complex",
  "name": "VIP клиенты",  // из form.name
  "description": "Описание условий скидки",  // из form.description
  "discount_percent": 20.0,  // parseFloat(form.discount_percent)
  "max_discount_amount": null,  // всегда null
  "conditions": [  // из form.conditions (массив объектов)
    {
      "type": "visits_count",
      "operator": ">=",
      "value": "5",
      "description": "Более 5 визитов"
    }
  ],
  "is_active": true,  // всегда true
  "priority": 1  // всегда 1
}
```

**ВАЖНО:** В WEB форма сложной скидки создаёт массив условий с полями `type`, `operator`, `value`, `description`, но backend ожидает структуру `conditions` как dict (не массив). Нужно проверить, как backend обрабатывает это.

**Response (200 OK):** Полный объект `LoyaltyDiscount`

**После успеха:**
- `await loadData()` - полный refetch
- `setShowComplexForm(false)`
- `setComplexForm({ name: '', description: '', discount_percent: '', conditions: [] })`
- Возвращает `true`

**Обработка ошибок:**
- Error → `setError(errorData.detail || 'Ошибка создания сложной скидки')`
- Возвращает `false`

---

#### **7. DELETE /api/loyalty/complex-discounts/{id}**

**Когда:** При удалении сложной скидки (`handleDeleteComplexDiscount`)

**Method:** DELETE  
**Headers:** `getAuthHeaders()`  
**Path param:** `{id}` - ID скидки

**Response (200 OK):** Пустое тело

**Подтверждение:** `confirm('Вы уверены, что хотите удалить эту скидку?')`

**После успеха:**
- `await loadData()` - полный refetch

**Обработка ошибок:**
- Error → `setError(errorData.detail || 'Ошибка удаления скидки')`

---

#### **8. POST /api/loyalty/personal-discounts**

**Когда:** При создании персональной скидки (`handleCreatePersonalDiscount`)

**Method:** POST  
**Headers:** `getAuthHeaders()` + `Content-Type: application/json`  
**Body:**
```json
{
  "client_phone": "+79991234567",  // из formData.client_phone
  "discount_percent": 15.0,  // parseFloat(formData.discount_percent)
  "max_discount_amount": 500.0,  // parseFloat(formData.max_discount_amount) или null
  "description": "VIP клиент",  // formData.description || null
  "is_active": true  // всегда true
}
```

**Response (200 OK):** Полный объект `PersonalDiscount`

**После успеха:**
- `await loadData()` - полный refetch
- Возвращает `true`

**Обработка ошибок:**
- Error → `setError(errorData.detail || 'Ошибка создания персональной скидки')`
- Возвращает `false`

---

#### **9. DELETE /api/loyalty/personal-discounts/{id}**

**Когда:** При удалении персональной скидки (используется `handleDeleteQuickDiscount`)

**Method:** DELETE  
**Headers:** `getAuthHeaders()`  
**Path param:** `{id}` - ID скидки

**Response (200 OK):** Пустое тело

**Подтверждение:** `confirm('Вы уверены, что хотите удалить эту скидку?')`

**После успеха:**
- `await loadData()` - полный refetch

**Обработка ошибок:**
- Error → `setError(errorData.detail || 'Ошибка удаления скидки')`

---

### 0.3 UI Behavior (WEB)

#### **Структура табов:**

1. **Верхние табы:**
   - "Скидки" (по умолчанию, `mainTab === 'discounts'`)
   - "Баллы" (`mainTab === 'points'`)

2. **Подтабы "Скидки":**
   - "Быстрые скидки" (`activeTab === 'quick'`)
   - "Сложные скидки" (`activeTab === 'complex'`)
   - "Персональные скидки" (`activeTab === 'personal'`)

---

#### **Быстрые скидки (QuickDiscountsTab):**

**UI элементы:**
1. **Сетка шаблонов** (grid 1/2/3 колонки):
   - Карточка шаблона:
     - Иконка (template.icon, text-2xl)
     - Бейдж "Активна" (если `isActive`)
     - Название (template.name)
     - Описание (template.description)
     - Процент скидки (template.default_discount)
     - Кнопка "Активировать" или "Активна" (disabled если активна)
     - Кнопка редактирования процента (✏️, только если не активна)

2. **Режим редактирования процента шаблона:**
   - Input number (0-100, step 0.1) с символом %
   - Кнопка "Сохранить" (создаёт скидку с кастомным процентом)
   - Кнопка "Отмена"

3. **Список активных быстрых скидок:**
   - Карточка скидки:
     - Название (discount.name)
     - Описание (discount.description)
     - Процент скидки (discount.discount_percent) + кнопка редактирования (✏️)
     - Кнопка удаления (🗑️)

4. **Режим редактирования процента активной скидки:**
   - Input number (0-100, step 0.1) с символом %
   - Кнопка "Сохранить" (PUT /api/loyalty/quick-discounts/{id})
   - Кнопка "Отмена"

**Логика:**
- `isActive = discounts.some(d => d.conditions?.condition_type === template.conditions.condition_type)`
- При создании из шаблона: `onCreateDiscount(template)` или `onCreateDiscount(template, customPercent)`
- При редактировании процента: `onUpdateDiscount(discount.id, editDiscountValue)`
- При удалении: `onDeleteDiscount(discount.id)` с confirm

**Дефолты:**
- `is_active: true`
- `priority: 1`
- `max_discount_amount: null`

**Поля, которые НЕ редактируются:**
- `is_active` - нет toggle в UI
- `priority` - нет редактирования в UI
- `max_discount_amount` - всегда null
- `conditions` - берутся из шаблона, не редактируются

---

#### **Сложные скидки (ComplexDiscountsTab):**

**UI элементы:**
1. **Кнопка "Создать сложную скидку"** (показывает/скрывает форму)

2. **Форма создания:**
   - Название скидки (input text, required)
   - Описание (textarea, required)
   - Размер скидки % (input number, 0-100, step 0.1, required)
   - Условия скидки:
     - Список существующих условий (каждое с кнопкой удаления)
     - Форма добавления нового условия:
       - Select типа условия: "visits_count", "total_spent", "days_since_last", "service_category"
       - Select оператора: ">=", ">", "=", "<", "<="
       - Input значения (number)
       - Input описания (text, placeholder: "Описание условия")
       - Кнопка "Добавить"
   - Кнопки "Создать скидку" / "Отмена"

3. **Список активных сложных скидок:**
   - Карточка скидки:
     - Название (discount.name)
     - Описание (discount.description)
     - Процент скидки (discount.discount_percent)
     - Условия (discount.conditions.map → condition.description)
     - Кнопка удаления (🗑️)

**Логика:**
- Условия хранятся как массив объектов: `{ type, operator, value, description }`
- При создании: `onCreateDiscount(form)` где `form.conditions` - массив
- При удалении: `onDeleteDiscount(discount.id)` с confirm

**Дефолты:**
- `is_active: true`
- `priority: 1`
- `max_discount_amount: null`

**Поля, которые НЕ редактируются:**
- `is_active` - нет toggle в UI
- `priority` - нет редактирования в UI
- `max_discount_amount` - всегда null
- Существующие скидки - только просмотр и удаление (нет редактирования)

**ВАЖНО:** В WEB форма создаёт условия с полями `type`, `operator`, `value`, `description`, но нужно проверить, как backend ожидает структуру `conditions` (dict или массив).

---

#### **Персональные скидки (PersonalDiscountsTab):**

**UI элементы:**
1. **Кнопка "Добавить пользователя"** (показывает/скрывает форму)

2. **Форма создания:**
   - Номер телефона клиента (input tel, required, placeholder: "+7 (999) 123-45-67")
   - Размер скидки % (input number, 0-100, step 0.1, required)
   - Максимальная сумма скидки (input number, min 0, step 0.01, optional, placeholder: "Оставьте пустым для неограниченной скидки")
   - Описание (textarea, optional)
   - Кнопки "Создать скидку" / "Отмена"

3. **Список персональных скидок:**
   - Карточка скидки:
     - Телефон (discount.client_phone)
     - Описание (discount.description)
     - Процент скидки (discount.discount_percent)
     - Максимальная сумма (discount.max_discount_amount, если есть)
     - Кнопка удаления (🗑️)

4. **Пустое состояние:**
   - "Персональные скидки не настроены" (если `discounts.length === 0 && !showForm`)

**Логика:**
- При создании: `onCreateDiscount(formData)` где:
  - `client_phone`: string
  - `discount_percent`: parseFloat
  - `max_discount_amount`: parseFloat или null
  - `description`: string || null
  - `is_active: true`
- При удалении: `onDeleteDiscount(discount.id)` (используется `handleDeleteQuickDiscount`)

**Дефолты:**
- `is_active: true`

**Поля, которые НЕ редактируются:**
- `is_active` - нет toggle в UI
- Существующие скидки - только просмотр и удаление (нет редактирования)

---

### 0.4 Маппинг condition_type → Label (если есть)

**В WEB:** Нет явного маппинга. Условия показываются через `condition.description` (текстовое поле, которое пользователь вводит сам).

**В шаблонах:** Условия приходят из backend с `condition_type` и `parameters`, но в UI используется только для проверки `isActive` (сравнение `d.conditions?.condition_type === template.conditions.condition_type`).

**В сложных скидках:** Пользователь сам вводит описание условия в поле "Описание условия", которое сохраняется в `condition.description`.

---

### 0.5 Обработка ошибок (WEB)

**Типы ошибок:**
1. **409 SCHEMA_OUTDATED:**
   - Header: `X-Error-Code: SCHEMA_OUTDATED`
   - UI: Warning блок (жёлтый) с `detail + hint`

2. **404 Master not found:**
   - UI: Error блок с сообщением + инструкция перелогиниться

3. **403 Forbidden:**
   - Если `X-Error-Code === 'SUBSCRIPTION_REQUIRED'`:
     - UI: Жёлтый блок `subscriptionRequired` с CTA "Обновить подписку"
   - Иначе:
     - UI: Error блок с `detail`

4. **400 Validation Error:**
   - UI: Error блок с `errorData.detail`

5. **Network Error:**
   - UI: Error блок "Ошибка подключения к серверу"

6. **Другие ошибки:**
   - UI: Error блок с `errorData.detail` или общее сообщение

---

### 0.6 Дефолты и валидация (WEB)

**Дефолты при создании:**
- `is_active: true` (всегда)
- `priority: 1` (для quick/complex, всегда)
- `max_discount_amount: null` (для quick/complex, всегда)
- `discount_type: 'quick'` или `'complex'` (из контекста)

**Валидация:**
- `discount_percent`: 0-100 (min/max в input)
- `client_phone`: required (required в input)
- `name`: required (для complex)
- `description`: required (для complex)
- `conditions.length > 0`: required (для complex)

**Граничные значения:**
- Процент: 0-100 (step 0.1)
- Максимальная сумма: min 0, step 0.01

---

## ШАГ 1: Backend Verification

### 1.1 Confirmed Types (backend/schemas.py)

**LoyaltyDiscount:**
```python
class LoyaltyDiscount(LoyaltyDiscountBase):
    id: int
    master_id: int
    salon_id: Optional[int] = None  # Legacy
    created_at: datetime
    updated_at: datetime

class LoyaltyDiscountBase:
    discount_type: LoyaltyDiscountType  # "quick" | "complex" | "personal"
    name: str
    description: Optional[str] = None
    discount_percent: float  # 0-100
    max_discount_amount: Optional[float] = None
    conditions: dict  # Dict, не массив!
    is_active: bool = True
    priority: int = Field(default=1, ge=1, le=10)
```

**PersonalDiscount:**
```python
class PersonalDiscount(PersonalDiscountBase):
    id: int
    master_id: int
    salon_id: Optional[int] = None  # Legacy
    created_at: datetime
    updated_at: datetime

class PersonalDiscountBase:
    client_phone: str  # Pattern: ^\+?1?\d{9,15}$
    discount_percent: float  # 0-100
    max_discount_amount: Optional[float] = None
    description: Optional[str] = None
    is_active: bool = True
```

**LoyaltySystemStatus:**
```python
class LoyaltySystemStatus:
    quick_discounts: List[LoyaltyDiscount]
    complex_discounts: List[LoyaltyDiscount]
    personal_discounts: List[PersonalDiscount]
    total_discounts: int
    active_discounts: int
```

**QuickDiscountTemplate:**
```python
class QuickDiscountTemplate:
    id: str
    name: str
    description: str
    icon: str
    conditions: dict  # { condition_type: str, parameters: dict }
    default_discount: float
```

**LoyaltyDiscountCreate:**
```python
class LoyaltyDiscountCreate(LoyaltyDiscountBase):
    pass  # Все поля из LoyaltyDiscountBase
```

**LoyaltyDiscountUpdate:**
```python
class LoyaltyDiscountUpdate:
    discount_type: Optional[LoyaltyDiscountType] = None
    name: Optional[str] = None
    description: Optional[str] = None
    discount_percent: Optional[float] = None  # 0-100
    max_discount_amount: Optional[float] = None
    conditions: Optional[dict] = None
    is_active: Optional[bool] = None
    priority: Optional[int] = None  # 1-10
```

**PersonalDiscountCreate:**
```python
class PersonalDiscountCreate(PersonalDiscountBase):
    pass  # Все поля из PersonalDiscountBase
```

**PersonalDiscountUpdate:**
```python
class PersonalDiscountUpdate:
    client_phone: Optional[str] = None
    discount_percent: Optional[float] = None  # 0-100
    max_discount_amount: Optional[float] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None
```

---

### 1.2 Mismatches (WEB vs Backend)

**⚠️ КРИТИЧЕСКИЙ MISMATCH: Структура conditions для complex discounts**

**WEB отправляет:**
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

**Backend ожидает:**
```python
conditions: dict  # Dict, не массив! (Column(JSON))
```

**Проблема:** WEB отправляет массив условий, но backend ожидает dict. Pydantic может принять массив и сохранить как JSON, но это несоответствие схеме.

**Решение для MOBILE:** 
- **Вариант A (1:1 с WEB):** Отправлять массив, как в WEB (даже если это несоответствие схеме)
- **Вариант B (правильно):** Отправлять dict, как ожидает backend

**РЕШЕНИЕ:** Выбираю Вариант A (1:1 с WEB), так как задача - повторить WEB логику точно. Если это вызовет ошибку - это будет видно при тестировании, и тогда можно будет исправить.

**Проверка:** Backend просто сохраняет `discount.conditions` в JSON колонку, SQLAlchemy может принять и массив, и dict. Но для consistency лучше проверить в тестах.

---

## Следующие шаги

1. Проверить, как backend обрабатывает `conditions` для complex discounts
2. Создать детальный план реализации MOBILE
3. Реализовать компоненты строго по WEB
4. Создать smoke checklist (>=20 проверок)
5. Описать network trace
