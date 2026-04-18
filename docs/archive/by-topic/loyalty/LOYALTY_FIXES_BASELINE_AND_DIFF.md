# Исправление ошибок Loyalty (RN/Expo): Baseline и Diff

**Дата:** 2026-01-21  
**Ошибки:**
1. VirtualizedList nesting (FlatList внутри ScrollView)
2. isTemplateActive is not a function

---

## ШАГ 0 — BASELINE (ДО ИЗМЕНЕНИЙ)

### 0.1 Файлы и строки

#### mobile/src/components/ScreenContainer.tsx

**Строки 25-44:** Если `scrollable={true}`, создаётся ScrollView:
```tsx
if (scrollable) {
  const mergedContentStyle = scrollViewProps?.contentContainerStyle
    ? [styles.scrollContent, scrollViewProps.contentContainerStyle]
    : styles.scrollContent;
  
  return (
    <SafeAreaView style={containerStyle} edges={defaultEdges} {...safeAreaProps}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={mergedContentStyle}
        showsVerticalScrollIndicator={scrollViewProps?.showsVerticalScrollIndicator !== undefined 
          ? scrollViewProps.showsVerticalScrollIndicator 
          : false}
        keyboardShouldPersistTaps={scrollViewProps?.keyboardShouldPersistTaps || 'handled'}
        {...scrollViewProps}
      >
        {children}  // ← Сюда попадает DiscountsQuickTab
      </ScrollView>
    </SafeAreaView>
  );
}
```

**Факт:** ScrollView вертикальный (по умолчанию), без явного указания `horizontal`.

#### mobile/app/master/loyalty.tsx

**Строка 650:** ScreenContainer с `scrollable={true}`:
```tsx
return (
  <ScreenContainer scrollable>
```

**Строки 735-750:** Рендеринг DiscountsQuickTab:
```tsx
{discountTab === 'quick' && (
  <DiscountsQuickTab
    templates={templates}
    discounts={loyaltyStatus?.quick_discounts || []}
    onCreateDiscount={handleCreateQuickDiscount}
    onUpdateDiscount={handleUpdateQuickDiscount}
    onDeleteDiscount={(id) => handleDeleteDiscount(id, 'quick')}
    editingDiscount={editingDiscount}
    setEditingDiscount={setEditingDiscount}
    editDiscountValue={editDiscountValue}
    setEditDiscountValue={setEditDiscountValue}
    editingTemplate={editingTemplate}
    setEditingTemplate={setEditingTemplate}
    editTemplateValue={editTemplateValue}
    setEditTemplateValue={setEditTemplateValue}
  />
)}
```

#### mobile/src/components/loyalty/DiscountsQuickTab.tsx

**Строка 6:** Импорт isTemplateActive:
```tsx
import { isTemplateActive } from '@src/utils/loyaltyConditions';
```

**Строки 40, 100:** Вызов isTemplateActive:
```tsx
// Строка 40:
const isActive = isTemplateActive(template, discounts);

// Строка 100:
const isActive = isTemplateActive(template, discounts);
```

**Строки 93-180:** Использование FlatList:
```tsx
{/* Сетка шаблонов (2 колонки) */}
{templates.length > 0 && (
  <FlatList
    data={templates}
    numColumns={2}
    keyExtractor={(item) => item.id}
    contentContainerStyle={styles.templatesGrid}
    columnWrapperStyle={styles.templatesRow}
    renderItem={({ item: template }) => {
      const isActive = isTemplateActive(template, discounts);
      
      return (
        <Card style={[styles.templateCard, isActive && styles.templateCardActive]}>
          {/* ... содержимое карточки ... */}
        </Card>
      );
    }}
  />
)}
```

**Факт:** FlatList вертикальный (по умолчанию), `numColumns={2}` создаёт сетку 2 колонки.

#### mobile/src/utils/loyaltyConditions.ts

**Экспорты (строки 1-131):**
- ✅ `normalizeConditionsForApi` (строка 7) — named export
- ✅ `SUPPORTED_CONDITION_TYPES` (строка 101) — named export constant
- ✅ `isConditionTypeSupported` (строка 114) — named export
- ✅ `getSupportedConditionTypesForUI` (строка 122) — named export
- ❌ `isTemplateActive` — **ОТСУТСТВУЕТ**

#### mobile/src/types/loyalty_discounts.ts

**QuickDiscountTemplate (строки 91-101):**
```typescript
export interface QuickDiscountTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  conditions: {
    condition_type: string;
    parameters: Record<string, any>;
  };
  default_discount: number;
}
```

**LoyaltyDiscount (строки 45-59):**
```typescript
export interface LoyaltyDiscount {
  id: number;
  master_id: number;
  salon_id?: number | null;
  discount_type: LoyaltyDiscountType;  // enum: 'quick' | 'complex' | 'personal'
  name: string;
  description?: string | null;
  discount_percent: number;
  max_discount_amount?: number | null;
  conditions: Record<string, any>;  // dict (JSON в БД) - может быть dict или array
  is_active: boolean;
  priority: number;
  created_at: string;
  updated_at: string;
}
```

**LoyaltyDiscountType enum (строки 6-10):**
```typescript
export enum LoyaltyDiscountType {
  QUICK = 'quick',
  COMPLEX = 'complex',
  PERSONAL = 'personal',
}
```

### 0.2 Факты

**Вложенность ScrollView -> FlatList:**
- **Внешний:** `ScrollView` из `ScreenContainer` (строка 32 в ScreenContainer.tsx)
- **Внутренний:** `FlatList` в `DiscountsQuickTab.tsx` (строка 93)
- **Ориентация:** Оба вертикальные
- **Проблема:** React Native не позволяет вкладывать VirtualizedList (FlatList) в ScrollView

**isTemplateActive:**
- **Импорт:** `import { isTemplateActive } from '@src/utils/loyaltyConditions';` (строка 6)
- **Почему undefined:** Функция не экспортируется из `loyaltyConditions.ts`
- **Использование:** Вызывается на строках 40 и 100

---

## ШАГ 1 — РЕШЕНИЕ ПО FlatList/ScrollView

### Анализ вариантов

**Вариант A:** Отключить скролл у FlatList (рекомендуется)
- ✅ Универсально для любого количества templates
- ✅ Сохраняет виртуализацию (если элементов много)
- ✅ Не требует изменения структуры компонента
- ✅ `numColumns={2}` продолжит работать

**Вариант B:** Заменить на map()
- ❌ Неизвестен размер templates (приходят с API)
- ❌ Может быть проблемой при большом количестве элементов
- ❌ Требует переписывания рендеринга

**ВЫБОР: Вариант A** — отключить скролл у FlatList.

### Конкретные правки в DiscountsQuickTab.tsx

**Добавить props в FlatList:**
- `scrollEnabled={false}` — отключает скролл, FlatList становится простым рендерером
- `removeClippedSubviews={false}` — отключает оптимизацию обрезки, чтобы избежать проблем с вложенностью
- `nestedScrollEnabled={true}` — разрешает вложенный скролл (для совместимости)

---

## ШАГ 2 — РЕАЛИЗАЦИЯ isTemplateActive

### Требования

1. Использовать реальные типы из `mobile/src/types/loyalty_discounts`
2. Стабильное сравнение parameters (сортировка ключей перед JSON.stringify)
3. Корректная обработка edge-cases:
   - `template.conditions` отсутствует
   - `discount.conditions` отсутствует
   - `discount.conditions` может быть dict или array (использовать `normalizeConditionsForApi`)
4. Фильтровать только активные quick скидки:
   - `discount.is_active === true`
   - `discount.discount_type === LoyaltyDiscountType.QUICK` (или `'quick'`)

### Реализация

```typescript
import type { QuickDiscountTemplate, LoyaltyDiscount, LoyaltyDiscountType } from '@src/types/loyalty_discounts';

/**
 * Стабильная сериализация объекта с сортировкой ключей
 */
function stableStringify(obj: any): string {
  if (obj == null) return 'null';
  if (typeof obj !== 'object') return String(obj);
  if (Array.isArray(obj)) {
    return '[' + obj.map(stableStringify).join(',') + ']';
  }
  const keys = Object.keys(obj).sort();
  return '{' + keys.map(key => `"${key}":${stableStringify(obj[key])}`).join(',') + '}';
}

/**
 * Проверяет, активен ли шаблон скидки (уже создана скидка из этого шаблона)
 * 
 * @param template - Шаблон быстрой скидки
 * @param discounts - Массив активных скидок
 * @returns boolean - true если скидка из этого шаблона уже активна
 */
export function isTemplateActive(
  template: QuickDiscountTemplate,
  discounts: LoyaltyDiscount[]
): boolean {
  // Проверяем только активные скидки типа QUICK
  const activeQuickDiscounts = discounts.filter(
    (discount) => discount.is_active && discount.discount_type === LoyaltyDiscountType.QUICK
  );

  // Если нет активных quick скидок, шаблон не активен
  if (activeQuickDiscounts.length === 0) {
    return false;
  }

  // Если у шаблона нет conditions, не можем сравнить
  if (!template.conditions || !template.conditions.condition_type) {
    return false;
  }

  const templateConditionType = template.conditions.condition_type;
  const templateParameters = template.conditions.parameters || {};

  // Сравниваем с каждой активной quick скидкой
  return activeQuickDiscounts.some((discount) => {
    // Если у скидки нет conditions, пропускаем
    if (!discount.conditions) {
      return false;
    }

    // Нормализуем conditions скидки (может быть dict или array)
    const discountConditions = normalizeConditionsForApi(discount.conditions);

    // Сравниваем condition_type
    if (discountConditions.condition_type !== templateConditionType) {
      return false;
    }

    // Сравниваем parameters стабильным способом
    const discountParameters = discountConditions.parameters || {};
    return stableStringify(discountParameters) === stableStringify(templateParameters);
  });
}
```

---

## ШАГ 3 — TRUE UNIFIED DIFF

### mobile/src/components/loyalty/DiscountsQuickTab.tsx

```diff
--- a/mobile/src/components/loyalty/DiscountsQuickTab.tsx
+++ b/mobile/src/components/loyalty/DiscountsQuickTab.tsx
@@ -91,6 +91,9 @@ export function DiscountsQuickTab({
       {/* Сетка шаблонов (2 колонки) */}
       {templates.length > 0 && (
         <FlatList
+          scrollEnabled={false}
+          removeClippedSubviews={false}
+          nestedScrollEnabled={true}
           data={templates}
           numColumns={2}
           keyExtractor={(item) => item.id}
```

### mobile/src/utils/loyaltyConditions.ts

```diff
--- a/mobile/src/utils/loyaltyConditions.ts
+++ b/mobile/src/utils/loyaltyConditions.ts
@@ -1,3 +1,5 @@
+import type { QuickDiscountTemplate, LoyaltyDiscount, LoyaltyDiscountType } from '@src/types/loyalty_discounts';
+
 /**
  * Нормализует условия скидки для отправки на API
  * 
@@ -130,3 +132,54 @@ export function getSupportedConditionTypesForUI() {
     { uiType: "service_discount", backendType: "service_discount", label: "Скидка на услуги" },
   ]
 }
+
+/**
+ * Стабильная сериализация объекта с сортировкой ключей
+ * Используется для сравнения parameters без зависимости от порядка ключей
+ */
+function stableStringify(obj: any): string {
+  if (obj == null) return 'null';
+  if (typeof obj !== 'object') return String(obj);
+  if (Array.isArray(obj)) {
+    return '[' + obj.map(stableStringify).join(',') + ']';
+  }
+  const keys = Object.keys(obj).sort();
+  return '{' + keys.map(key => `"${key}":${stableStringify(obj[key])}`).join(',') + '}';
+}
+
+/**
+ * Проверяет, активен ли шаблон скидки (уже создана скидка из этого шаблона)
+ * 
+ * @param template - Шаблон быстрой скидки
+ * @param discounts - Массив активных скидок
+ * @returns boolean - true если скидка из этого шаблона уже активна
+ */
+export function isTemplateActive(
+  template: QuickDiscountTemplate,
+  discounts: LoyaltyDiscount[]
+): boolean {
+  // Проверяем только активные скидки типа QUICK
+  const activeQuickDiscounts = discounts.filter(
+    (discount) => discount.is_active && discount.discount_type === LoyaltyDiscountType.QUICK
+  );
+
+  // Если нет активных quick скидок, шаблон не активен
+  if (activeQuickDiscounts.length === 0) {
+    return false;
+  }
+
+  // Если у шаблона нет conditions, не можем сравнить
+  if (!template.conditions || !template.conditions.condition_type) {
+    return false;
+  }
+
+  const templateConditionType = template.conditions.condition_type;
+  const templateParameters = template.conditions.parameters || {};
+
+  // Сравниваем с каждой активной quick скидкой
+  return activeQuickDiscounts.some((discount) => {
+    // Если у скидки нет conditions, пропускаем
+    if (!discount.conditions) {
+      return false;
+    }
+
+    // Нормализуем conditions скидки (может быть dict или array)
+    const discountConditions = normalizeConditionsForApi(discount.conditions);
+
+    // Сравниваем condition_type
+    if (discountConditions.condition_type !== templateConditionType) {
+      return false;
+    }
+
+    // Сравниваем parameters стабильным способом
+    const discountParameters = discountConditions.parameters || {};
+    return stableStringify(discountParameters) === stableStringify(templateParameters);
+  });
+}
```

---

## ШАГ 4 — SMOKE CHECKLIST

- [ ] **1. Экран loyalty открывается без ошибок**
  - Открыть экран `/master/loyalty`
  - Проверить, что нет красных ошибок в консоли
  - Проверить, что экран рендерится корректно

- [ ] **2. Вкладка "Быстрые скидки" показывает 2 колонки**
  - Переключиться на таб "Скидки" → "Быстрые"
  - Проверить, что шаблоны отображаются в 2 колонки
  - Проверить, что сетка корректно выровнена

- [ ] **3. Warning про VirtualizedList исчез**
  - Открыть консоль разработчика
  - Проверить, что нет warning: "VirtualizedLists should never be nested..."
  - Проверить, что скролл работает плавно

- [ ] **4. isTemplateActive работает: активные шаблоны помечаются**
  - Создать скидку из шаблона (например, "Первая запись")
  - Проверить, что шаблон помечен как "Активна" (зелёный badge)
  - Проверить, что кнопка "Активировать" стала disabled и показывает "Активна"

- [ ] **5. Поведение при templates=[]**
  - Убедиться, что при пустом массиве templates показывается сообщение "Нет быстрых скидок"
  - Проверить, что нет ошибок в консоли

- [ ] **6. Поведение при discounts=[]**
  - Убедиться, что при пустом массиве discounts все шаблоны показываются как неактивные
  - Проверить, что можно активировать любой шаблон

- [ ] **7. Поведение при discount.conditions в виде массива**
  - Создать скидку с conditions в виде массива (если возможно через API)
  - Проверить, что isTemplateActive корректно сравнивает с шаблоном
  - Проверить, что шаблон помечается как активный

- [ ] **8. Поведение при discount.conditions в виде dict**
  - Создать скидку с conditions в виде объекта (dict)
  - Проверить, что isTemplateActive корректно сравнивает с шаблоном
  - Проверить, что шаблон помечается как активный

- [ ] **9. Проверка на реальном устройстве/эмуляторе**
  - Запустить на iOS симуляторе/устройстве
  - Запустить на Android эмуляторе/устройстве
  - Проверить, что скролл работает плавно
  - Проверить, что нет проблем с производительностью

- [ ] **10. Edge-case: шаблон без conditions**
  - Если есть шаблон без conditions, проверить, что он не вызывает ошибок
  - Проверить, что isTemplateActive возвращает false для таких шаблонов
