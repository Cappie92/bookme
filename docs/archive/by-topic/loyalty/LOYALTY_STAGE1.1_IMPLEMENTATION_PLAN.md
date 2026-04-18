# Stage 1.1: Mobile Implementation Plan - Полный Parity с WEB

**Дата:** 2026-01-21  
**Цель:** Реализовать MOBILE "Лояльность → Скидки" функционально идентичным WEB

---

## ШАГ 0: WEB Ground Truth ✅

**Документ:** `LOYALTY_STAGE1.1_WEB_GROUND_TRUTH.md`

**Ключевые находки:**
1. **API Calls:** 9 эндпоинтов (GET templates, GET status, CRUD quick/complex/personal)
2. **UI Behavior:** 3 подтаба, шаблоны, inline редактирование, формы создания
3. **Mismatch:** WEB отправляет массив conditions для complex, backend ожидает dict (но SQLAlchemy JSON принимает оба)

---

## ШАГ 1: Backend Verification ✅

### Confirmed Types

**LoyaltyDiscount:**
- `conditions: dict` (JSON column в БД)
- `is_active: bool` (default True)
- `priority: int` (1-10, default 1)

**PersonalDiscount:**
- `client_phone: str` (pattern: `^\+?1?\d{9,15}$`)
- `is_active: bool` (default True)

**Endpoints:**
- `PUT /api/loyalty/quick-discounts/{id}` - обновление (любые поля из LoyaltyDiscountUpdate)
- `PUT /api/loyalty/complex-discounts/{id}` - обновление (любые поля)
- `PUT /api/loyalty/personal-discounts/{id}` - обновление (любые поля из PersonalDiscountUpdate)

**ВАЖНО:** В WEB НЕТ использования PUT для обновления is_active/priority/max_discount_amount - только discount_percent для quick. Но endpoints поддерживают обновление всех полей.

---

## ШАГ 2: Mobile Implementation Plan

### 2.1 API Layer (доработать)

**Файл:** `mobile/src/services/api/loyalty_discounts.ts`

**Добавить функции:**
1. `updateComplexDiscount(id, data)` - PUT /api/loyalty/complex-discounts/{id}
2. `updatePersonalDiscount(id, data)` - PUT /api/loyalty/personal-discounts/{id}

**Обработка ошибок:**
- 400 → throw с `error.response?.data?.detail`
- 401 → throw (auth gating должен предотвратить)
- 403 → throw с деталью
- 404 → throw с деталью
- 409 → throw с деталью (SCHEMA_OUTDATED)

---

### 2.2 Types (вынести в отдельный файл)

**Файл:** `mobile/src/types/loyalty_discounts.ts` (новый)

**Типы:**
- Все enum и interface из `loyalty_discounts.ts`
- Дополнительно: типы для форм (ComplexDiscountForm, PersonalDiscountForm)

---

### 2.3 Auth Gating

**Текущее состояние:**
- `useAuth()` предоставляет `token`, `isAuthenticated`, `isLoading`
- В `loadDiscounts()` есть проверка `if (!token || !isAuthenticated) return;`

**Доработка:**
- Добавить проверку `isLoading` - не делать запросы, пока auth загружается
- Использовать `isLoading` из `useAuth()` в условиях загрузки

---

### 2.4 Компоненты (создать)

**Структура:**
```
mobile/app/master/loyalty.tsx (обновить)
  └─ DiscountsQuickTab (новый компонент)
  └─ DiscountsComplexTab (новый компонент)
  └─ DiscountsPersonalTab (новый компонент)
  └─ DiscountCard (переиспользуемый)
  └─ ConditionRenderer (утилита для отображения conditions)
```

**DiscountsQuickTab:**
- Сетка шаблонов (как в WEB)
- Режим редактирования процента шаблона
- Список активных скидок
- Режим редактирования процента активной скидки
- Кнопка удаления

**DiscountsComplexTab:**
- Кнопка "Создать сложную скидку"
- Форма создания (name, description, discount_percent, conditions)
- Список активных скидок (name, description, percent, conditions)
- Кнопка удаления

**DiscountsPersonalTab:**
- Кнопка "Добавить пользователя"
- Форма создания (phone, percent, max_amount, description)
- Список персональных скидок
- Кнопка удаления

**ConditionRenderer:**
- Функция для отображения conditions в человекочитаемом виде
- Для quick: показывать condition_type
- Для complex: показывать массив conditions через description

---

### 2.5 Обработка ошибок

**Типы ошибок:**
1. **409 SCHEMA_OUTDATED:**
   - Header: `X-Error-Code: SCHEMA_OUTDATED`
   - UI: Warning Alert с сообщением + hint

2. **404 Master not found:**
   - UI: Error Alert с инструкцией перелогиниться

3. **403 Forbidden:**
   - Если `X-Error-Code === 'SUBSCRIPTION_REQUIRED'`:
     - UI: Locked state с CTA "Управление подпиской"
   - Иначе:
     - UI: Error Alert с деталью

4. **400 Validation Error:**
   - UI: Error Alert с `error.response?.data?.detail`

5. **Network Error:**
   - UI: Error Alert "Ошибка подключения к серверу"

---

## ШАГ 3: Детальный план реализации

### Файл 1: `mobile/src/types/loyalty_discounts.ts` (новый)

**Содержимое:**
- Все enum и interface из текущего `loyalty_discounts.ts`
- Дополнительные типы для форм

---

### Файл 2: `mobile/src/services/api/loyalty_discounts.ts` (доработать)

**Добавить:**
```typescript
export async function updateComplexDiscount(
  id: number,
  data: LoyaltyDiscountUpdate
): Promise<LoyaltyDiscount> {
  const response = await apiClient.put<LoyaltyDiscount>(
    `/api/loyalty/complex-discounts/${id}`,
    data
  );
  return response.data;
}

export async function updatePersonalDiscount(
  id: number,
  data: PersonalDiscountUpdate
): Promise<PersonalDiscount> {
  const response = await apiClient.put<PersonalDiscount>(
    `/api/loyalty/personal-discounts/${id}`,
    data
  );
  return response.data;
}
```

**Улучшить обработку ошибок:**
- Все функции должны пробрасывать ошибки с деталями
- 404 для templates - возвращать пустой массив (как сейчас)

---

### Файл 3: `mobile/app/master/loyalty.tsx` (полная переработка таба "Скидки")

**Структура:**
1. Верхние табы: "Скидки" / "Баллы" (уже есть)
2. Подтабы "Скидки": "Быстрые" / "Сложные" / "Персональные" (уже есть)
3. Заменить текущие компоненты на полноценные (как в WEB)

**Состояние:**
- `loyaltyStatus: LoyaltySystemStatus | null`
- `templates: QuickDiscountTemplate[]`
- `discountsLoading: boolean`
- `discountsError: string | null`
- `editingDiscount: number | null` (для quick)
- `editDiscountValue: string`
- `editingTemplate: string | null` (id шаблона)
- `editTemplateValue: string`
- `showComplexForm: boolean`
- `complexForm: { name, description, discount_percent, conditions[] }`
- `showPersonalForm: boolean`
- `personalForm: { client_phone, discount_percent, max_discount_amount, description }`

**Функции:**
- `loadDiscounts()` - GET status + templates
- `handleCreateQuickDiscount(template, customPercent?)` - POST quick-discounts
- `handleUpdateQuickDiscount(id, percent)` - PUT quick-discounts/{id}
- `handleDeleteQuickDiscount(id)` - DELETE quick-discounts/{id}
- `handleCreateComplexDiscount(form)` - POST complex-discounts
- `handleDeleteComplexDiscount(id)` - DELETE complex-discounts/{id}
- `handleCreatePersonalDiscount(form)` - POST personal-discounts
- `handleDeletePersonalDiscount(id)` - DELETE personal-discounts/{id}

**Auth gating:**
- Все функции проверяют: `if (!token || !isAuthenticated || isLoading) return;`
- `loadDiscounts()` вызывается только если `token && isAuthenticated && !isLoading`

---

### Файл 4: `mobile/src/components/loyalty/DiscountsQuickTab.tsx` (новый)

**Пропсы:**
```typescript
interface DiscountsQuickTabProps {
  templates: QuickDiscountTemplate[];
  discounts: LoyaltyDiscount[];
  onCreateDiscount: (template: QuickDiscountTemplate, customPercent?: number) => Promise<void>;
  onUpdateDiscount: (id: number, percent: number) => Promise<void>;
  onDeleteDiscount: (id: number) => Promise<void>;
  editingDiscount: number | null;
  setEditingDiscount: (id: number | null) => void;
  editDiscountValue: string;
  setEditDiscountValue: (value: string) => void;
  editingTemplate: string | null;
  setEditingTemplate: (id: string | null) => void;
  editTemplateValue: string;
  setEditTemplateValue: (value: string) => void;
}
```

**UI:**
1. Заголовок "Быстрые скидки" + описание
2. Сетка шаблонов (ScrollView horizontal или FlatList)
3. Для каждого шаблона:
   - Карточка с иконкой, названием, описанием, процентом
   - Бейдж "Активна" (если isActive)
   - Кнопка редактирования процента (✏️, если не активна)
   - Кнопка "Активировать" или "Активна" (disabled если активна)
4. Режим редактирования процента шаблона:
   - Input number (0-100, step 0.1)
   - Кнопки "Сохранить" / "Отмена"
5. Список активных скидок:
   - Карточка с названием, описанием, процентом
   - Кнопка редактирования процента (✏️)
   - Кнопка удаления (🗑️)
6. Режим редактирования процента активной скидки:
   - Input number
   - Кнопки "Сохранить" / "Отмена"

**Логика:**
- `isActive = discounts.some(d => d.conditions?.condition_type === template.conditions.condition_type)`
- При создании: `onCreateDiscount(template)` или `onCreateDiscount(template, parseFloat(editTemplateValue))`
- При редактировании: `onUpdateDiscount(discount.id, parseFloat(editDiscountValue))`
- При удалении: Alert.alert с confirm → `onDeleteDiscount(id)`

---

### Файл 5: `mobile/src/components/loyalty/DiscountsComplexTab.tsx` (новый)

**Пропсы:**
```typescript
interface DiscountsComplexTabProps {
  discounts: LoyaltyDiscount[];
  onCreateDiscount: (form: ComplexDiscountForm) => Promise<boolean>;
  onDeleteDiscount: (id: number) => Promise<void>;
}
```

**Состояние (внутри компонента):**
- `showForm: boolean`
- `form: { name, description, discount_percent, conditions[] }`
- `newCondition: { type, operator, value, description }`

**UI:**
1. Заголовок "Сложные скидки" + описание
2. Кнопка "Создать сложную скидку" (показывает форму)
3. Форма создания:
   - Input название (required)
   - Textarea описание (required)
   - Input процент (0-100, step 0.1, required)
   - Секция условий:
     - Список существующих условий (каждое с кнопкой удаления)
     - Форма добавления нового условия:
       - Select типа: visits_count, total_spent, days_since_last, service_category
       - Select оператора: >=, >, =, <, <=
       - Input значения (number)
       - Input описания (text, required)
       - Кнопка "Добавить"
   - Кнопки "Создать скидку" / "Отмена"
4. Список активных скидок:
   - Карточка с названием, описанием, процентом
   - Условия (массив, каждое через description)
   - Кнопка удаления (🗑️)

**Логика:**
- Условия хранятся как массив объектов: `{ type, operator, value, description }`
- При создании: отправлять массив (как в WEB, даже если это несоответствие схеме)
- Валидация: `name && description && discount_percent && conditions.length > 0`

---

### Файл 6: `mobile/src/components/loyalty/DiscountsPersonalTab.tsx` (новый)

**Пропсы:**
```typescript
interface DiscountsPersonalTabProps {
  discounts: PersonalDiscount[];
  onCreateDiscount: (form: PersonalDiscountForm) => Promise<boolean>;
  onDeleteDiscount: (id: number) => Promise<void>;
}
```

**Состояние (внутри компонента):**
- `showForm: boolean`
- `form: { client_phone, discount_percent, max_discount_amount, description }`

**UI:**
1. Заголовок "Персональные скидки" + описание
2. Кнопка "Добавить пользователя" (показывает форму)
3. Форма создания:
   - Input телефон (tel, required, placeholder: "+7 (999) 123-45-67")
   - Input процент (0-100, step 0.1, required)
   - Input максимальная сумма (number, min 0, step 0.01, optional, placeholder: "Оставьте пустым...")
   - Textarea описание (optional)
   - Кнопки "Создать скидку" / "Отмена"
4. Список персональных скидок:
   - Карточка с телефоном, описанием, процентом, максимальной суммой
   - Кнопка удаления (🗑️)
5. Пустое состояние: "Персональные скидки не настроены"

**Логика:**
- При создании: `onCreateDiscount({ client_phone, discount_percent: parseFloat, max_discount_amount: parseFloat || null, description || null, is_active: true })`
- Валидация телефона: мягкая (только required), backend проверит pattern

---

### Файл 7: `mobile/src/utils/loyaltyConditions.ts` (новый, утилита)

**Функции:**
```typescript
/**
 * Отобразить condition в человекочитаемом виде
 */
export function renderCondition(condition: any): string {
  // Для quick: показывать condition_type
  // Для complex: показывать description из массива условий
  // Fallback: JSON.stringify если структура неизвестна
}

/**
 * Проверить, активна ли скидка из шаблона
 */
export function isTemplateActive(
  template: QuickDiscountTemplate,
  discounts: LoyaltyDiscount[]
): boolean {
  return discounts.some(
    d => d.conditions?.condition_type === template.conditions.condition_type
  );
}
```

---

## ШАГ 4: Network Trace

### Сценарий 1: Открытие таба "Скидки"

**Порядок запросов:**
1. `GET /api/loyalty/status` (если `token && isAuthenticated && !isLoading`)
2. `GET /api/loyalty/templates` (параллельно, если status OK)

**После успеха:**
- `setLoyaltyStatus(status)`
- `setTemplates(templatesData)` или `setTemplates([])` если 404

---

### Сценарий 2: Создание быстрой скидки из шаблона

**Порядок запросов:**
1. `POST /api/loyalty/quick-discounts` с body из шаблона
2. Если успех → `GET /api/loyalty/status` (refetch)

**После успеха:**
- `setEditingTemplate(null)`
- `setEditTemplateValue('')`
- Обновление списка скидок

---

### Сценарий 3: Редактирование процента быстрой скидки

**Порядок запросов:**
1. `PUT /api/loyalty/quick-discounts/{id}` с body `{ discount_percent: <value> }`
2. Если успех → `GET /api/loyalty/status` (refetch)

**После успеха:**
- `setEditingDiscount(null)`
- `setEditDiscountValue('')`
- Обновление списка скидок

---

### Сценарий 4: Удаление скидки

**Порядок запросов:**
1. Alert.alert с confirm
2. Если подтверждено → `DELETE /api/loyalty/quick-discounts/{id}` (или complex/personal)
3. Если успех → `GET /api/loyalty/status` (refetch)

---

### Сценарий 5: Создание сложной скидки

**Порядок запросов:**
1. Пользователь заполняет форму
2. `POST /api/loyalty/complex-discounts` с body:
   ```json
   {
     "discount_type": "complex",
     "name": "...",
     "description": "...",
     "discount_percent": 20.0,
     "max_discount_amount": null,
     "conditions": [
       { "type": "visits_count", "operator": ">=", "value": "5", "description": "..." }
     ],
     "is_active": true,
     "priority": 1
   }
   ```
3. Если успех → `GET /api/loyalty/status` (refetch)

**После успеха:**
- `setShowComplexForm(false)`
- `setComplexForm({ name: '', description: '', discount_percent: '', conditions: [] })`

---

### Сценарий 6: Создание персональной скидки

**Порядок запросов:**
1. Пользователь заполняет форму
2. `POST /api/loyalty/personal-discounts` с body:
   ```json
   {
     "client_phone": "+79991234567",
     "discount_percent": 15.0,
     "max_discount_amount": 500.0,
     "description": "VIP клиент",
     "is_active": true
   }
   ```
3. Если успех → `GET /api/loyalty/status` (refetch)

**После успеха:**
- `setShowPersonalForm(false)`
- `setPersonalForm({ client_phone: '', discount_percent: '', max_discount_amount: '', description: '' })`

---

## ШАГ 5: Smoke Checklist (>=20 проверок)

### Быстрые скидки (7 проверок)

1. ✅ Открытие таба "Быстрые" → загружаются шаблоны и активные скидки
2. ✅ Создание скидки из шаблона (кнопка "Активировать") → скидка создаётся, шаблон помечается как "Активна"
3. ✅ Создание скидки с кастомным процентом (редактирование шаблона) → скидка создаётся с кастомным процентом
4. ✅ Редактирование процента активной скидки → процент обновляется
5. ✅ Удаление быстрой скидки → скидка удаляется, шаблон больше не "Активна"
6. ✅ Граничные значения процента (0, 1, 100, 101) → валидация работает
7. ✅ Шаблоны 404 → показывается пустая сетка, нет ошибок

### Сложные скидки (6 проверок)

8. ✅ Открытие таба "Сложные" → загружаются активные скидки
9. ✅ Создание сложной скидки (форма) → скидка создаётся
10. ✅ Добавление условий в форму → условия добавляются в список
11. ✅ Удаление условия из формы → условие удаляется
12. ✅ Валидация формы (пустые поля) → форма не отправляется
13. ✅ Удаление сложной скидки → скидка удаляется

### Персональные скидки (5 проверок)

14. ✅ Открытие таба "Персональные" → загружаются активные скидки
15. ✅ Создание персональной скидки (форма) → скидка создаётся
16. ✅ Валидация телефона (пустой) → форма не отправляется
17. ✅ Максимальная сумма (пустая vs заполненная) → null vs число
18. ✅ Удаление персональной скидки → скидка удаляется

### Обработка ошибок (5 проверок)

19. ✅ 400 Validation Error → показывается Alert с деталью
20. ✅ 401 Unauthorized → запросы не отправляются до authReady
21. ✅ 403 Forbidden (SUBSCRIPTION_REQUIRED) → показывается locked state с CTA
22. ✅ 404 Master not found → показывается Alert с инструкцией
23. ✅ 409 SCHEMA_OUTDATED → показывается Warning Alert с hint

### Edge cases (2 проверки)

24. ✅ Пустые списки (нет скидок) → показывается пустое состояние
25. ✅ Одновременное редактирование (несколько пользователей) → последний save wins

---

## Итоговый список файлов

### Новые файлы:
1. `mobile/src/types/loyalty_discounts.ts` - типы
2. `mobile/src/components/loyalty/DiscountsQuickTab.tsx` - компонент быстрых скидок
3. `mobile/src/components/loyalty/DiscountsComplexTab.tsx` - компонент сложных скидок
4. `mobile/src/components/loyalty/DiscountsPersonalTab.tsx` - компонент персональных скидок
5. `mobile/src/utils/loyaltyConditions.ts` - утилиты для conditions

### Обновлённые файлы:
1. `mobile/src/services/api/loyalty_discounts.ts` - добавить updateComplexDiscount, updatePersonalDiscount
2. `mobile/app/master/loyalty.tsx` - полная переработка таба "Скидки"

---

**Готово к реализации!** 🚀
