# Диагностика ошибок Loyalty (RN / Expo)

**Дата:** 2026-01-21  
**Ошибки:** 
1. VirtualizedList вложенность (FlatList внутри ScrollView)
2. `isTemplateActive is not a function`

---

## ЧАСТЬ 1. FlatList / ScrollView

### 1. Полный компонент DiscountsQuickTab.tsx

**Файл:** `mobile/src/components/loyalty/DiscountsQuickTab.tsx`  
**Строки:** 1-499

**Ключевые факты:**
- **Строка 2:** Импортируется `ScrollView` (но НЕ используется в компоненте)
- **Строка 2:** Импортируется `FlatList`
- **Строка 93-180:** Используется `<FlatList>` для отображения шаблонов (2 колонки, вертикальный скролл)
- **Строка 83:** Корневой элемент — `<View style={styles.container}>`, НЕТ ScrollView внутри компонента

**Вывод:** В самом `DiscountsQuickTab.tsx` НЕТ ScrollView, но есть FlatList.

### 2. Использование ScrollView внутри DiscountsQuickTab

**ФАКТ:** ScrollView НЕ используется внутри `DiscountsQuickTab.tsx`.

**ФАКТ:** FlatList используется на строке 93:
```tsx
<FlatList
  data={templates}
  numColumns={2}
  keyExtractor={(item) => item.id}
  contentContainerStyle={styles.templatesGrid}
  columnWrapperStyle={styles.templatesRow}
  renderItem={({ item: template }) => { ... }}
/>
```

**Ориентация скролла:** Вертикальный (по умолчанию для FlatList с `numColumns={2}`)

### 3. Иерархия компонентов (поднимаемся вверх)

**Файл:** `mobile/app/master/loyalty.tsx`

**Строка 650:**
```tsx
<ScreenContainer scrollable>
```

**Файл:** `mobile/src/components/ScreenContainer.tsx`

**Строки 25-44:** Если `scrollable={true}`, то:
```tsx
<SafeAreaView>
  <ScrollView ...>
    {children}  // ← Сюда попадает DiscountsQuickTab
  </ScrollView>
</SafeAreaView>
```

**Строка 736 в loyalty.tsx:**
```tsx
{discountTab === 'quick' && (
  <DiscountsQuickTab
    templates={templates}
    discounts={loyaltyStatus?.quick_discounts || []}
    ...
  />
)}
```

**Полная иерархия:**
```
ScreenContainer (scrollable=true)
  └─ ScrollView (вертикальный)
      └─ View (styles.content)
          └─ DiscountsQuickTab
              └─ View (styles.container)
                  └─ FlatList (вертикальный, numColumns={2})  ← ВЛОЖЕННОСТЬ!
```

### 4. Где именно возникает вложенность

**ПРОБЛЕМА:** VirtualizedList (FlatList) вложен в ScrollView.

**Внешний скролл:** `ScrollView` из `ScreenContainer` (строка 32 в ScreenContainer.tsx)

**Внутренний скролл:** `FlatList` в `DiscountsQuickTab.tsx` (строка 93)

**Можно ли безопасно убрать внешний ScrollView?**

**НЕТ, нельзя просто убрать**, потому что:
- `ScreenContainer scrollable` используется для всего экрана (включая другие табы: complex, personal, points)
- В табе "points" (строка 776) есть отдельный `<ScrollView>` для контента с баллами
- Если убрать `scrollable` из ScreenContainer, другие табы сломаются

**РЕШЕНИЕ:** Нужно изменить `DiscountsQuickTab`, чтобы он НЕ использовал FlatList внутри ScrollView.

### 5. Конкретное решение

**ВАРИАНТ 1 (РЕКОМЕНДУЕТСЯ):** Заменить FlatList на обычный `map()` для шаблонов

**Обоснование:**
- Шаблонов обычно немного (2-10 штук)
- `numColumns={2}` можно реализовать через `flexDirection: 'row'` и `flexWrap: 'wrap'`
- Нет необходимости в виртуализации для малого количества элементов

**Файл:** `mobile/src/components/loyalty/DiscountsQuickTab.tsx`

**Что менять:**
- **Удалить:** строки 93-180 (весь блок `<FlatList>`)
- **Заменить на:** обычный `map()` с View и flexbox

**Пример замены:**
```tsx
{/* Сетка шаблонов (2 колонки) */}
{templates.length > 0 && (
  <View style={styles.templatesGrid}>
    {templates.map((template) => {
      const isActive = isTemplateActive(template, discounts);
      
      return (
        <View key={template.id} style={styles.templateCardWrapper}>
          <Card style={[styles.templateCard, isActive && styles.templateCardActive]}>
            {/* ... содержимое карточки ... */}
          </Card>
        </View>
      );
    })}
  </View>
)}
```

**Обновить стили:**
```tsx
templatesGrid: {
  flexDirection: 'row',
  flexWrap: 'wrap',
  gap: 12,
  paddingBottom: 8,
},
templateCardWrapper: {
  width: '48%', // Примерно половина ширины с учетом gap
},
```

**ВАРИАНТ 2 (если элементов много):** Использовать FlatList как корневой скролл с ListHeaderComponent

**Не рекомендуется**, потому что:
- Нужно будет переделать всю структуру компонента
- Сложнее поддерживать
- Для малого количества элементов избыточно

---

## ЧАСТЬ 2. isTemplateActive

### 6. Все упоминания isTemplateActive

**Файл:** `mobile/src/components/loyalty/DiscountsQuickTab.tsx`

**Строка 6:**
```tsx
import { isTemplateActive } from '@src/utils/loyaltyConditions';
```

**Строка 40:**
```tsx
const isActive = isTemplateActive(template, discounts);
```

**Строка 100:**
```tsx
const isActive = isTemplateActive(template, discounts);
```

**Других упоминаний нет.**

### 7. Файл, где ожидается реализация isTemplateActive

**Файл:** `mobile/src/utils/loyaltyConditions.ts`  
**Строки:** 1-131

**ПОЛНЫЙ ФАЙЛ:**
```typescript
/**
 * Нормализует условия скидки для отправки на API
 * 
 * @param input - Входные данные условий (может быть null, undefined, object, array)
 * @returns Dict с condition_type и parameters (не Array!)
 */
export function normalizeConditionsForApi(input: any): Record<string, any> {
  // ... реализация ...
}

/**
 * Преобразует UI формат условия в backend формат
 */
function _convertUIFormatToBackend(uiCondition: any, typeMap: Record<string, string>): Record<string, any> {
  // ... реализация ...
}

/**
 * Whitelist поддерживаемых condition_type (реально обрабатываются в backend)
 * Источник: backend/utils/loyalty_discounts.py (строки 259-330)
 */
export const SUPPORTED_CONDITION_TYPES = [
  "first_visit",
  "returning_client",
  "regular_visits",
  "happy_hours",
  "service_discount",
]

/**
 * Проверяет, поддерживается ли condition_type в backend
 * @param conditionType - Backend condition_type
 * @returns boolean
 */
export function isConditionTypeSupported(conditionType: string): boolean {
  return SUPPORTED_CONDITION_TYPES.includes(conditionType)
}

/**
 * Получает список поддерживаемых типов для UI
 * @returns Array<{uiType: string, backendType: string, label: string}>
 */
export function getSupportedConditionTypesForUI() {
  return [
    { uiType: "first_visit", backendType: "first_visit", label: "Первая запись" },
    { uiType: "returning_client", backendType: "returning_client", label: "Возвращение клиента" },
    { uiType: "regular_visits", backendType: "regular_visits", label: "Регулярные визиты" },
    { uiType: "happy_hours", backendType: "happy_hours", label: "Счастливые часы" },
    { uiType: "service_discount", backendType: "service_discount", label: "Скидка на услуги" },
  ]
}
```

### 8. Экспорт функции

**ФАКТ:** В файле `loyaltyConditions.ts` НЕТ функции `isTemplateActive`.

**Экспортируемые функции:**
- ✅ `normalizeConditionsForApi` (named export)
- ✅ `isConditionTypeSupported` (named export)
- ✅ `getSupportedConditionTypesForUI` (named export)
- ✅ `SUPPORTED_CONDITION_TYPES` (named export constant)
- ❌ `isTemplateActive` — **ОТСУТСТВУЕТ**

**Barrel-файл (index.ts):** Не найден в `mobile/src/utils/`

### 9. Import в DiscountsQuickTab.tsx

**Строка 6:**
```tsx
import { isTemplateActive } from '@src/utils/loyaltyConditions';
```

**Сравнение с реальным экспортом:**
- Импорт: `{ isTemplateActive }` (named import)
- Реальный экспорт: функции `isTemplateActive` НЕТ в файле

**ОШИБКА:** Импортируется несуществующая функция.

### 10. Точная причина ошибки

**ОШИБКА:** `isTemplateActive is not a function`

**Причина:** Функция `isTemplateActive` не экспортируется (и не существует) в файле `mobile/src/utils/loyaltyConditions.ts`.

**Что нужно исправить:**

**Добавить функцию `isTemplateActive` в `mobile/src/utils/loyaltyConditions.ts`:**

```typescript
import type { QuickDiscountTemplate, LoyaltyDiscount } from '@src/types/loyalty_discounts';

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
  return discounts
    .filter((discount) => discount.is_active && discount.discount_type === 'quick')
    .some((discount) => {
      // Сравниваем по условиям (conditions должны совпадать)
      if (discount.conditions && template.conditions) {
        // Нормализуем условия скидки (может быть dict или array)
        const discountConditions = normalizeConditionsForApi(discount.conditions);
        
        // У шаблона conditions уже в правильном формате { condition_type, parameters }
        const templateConditionType = template.conditions.condition_type;
        const templateParameters = template.conditions.parameters;
        
        // Сравниваем condition_type и parameters
        return (
          discountConditions.condition_type === templateConditionType &&
          JSON.stringify(discountConditions.parameters || {}) === JSON.stringify(templateParameters || {})
        );
      }
      
      return false;
    });
}
```

---

## ЧАСТЬ 3. Финал

### 11. Краткий список причин обеих ошибок

#### Ошибка 1: VirtualizedList вложенность

**Причина:**
- `ScreenContainer` с `scrollable={true}` создаёт `ScrollView`
- Внутри `DiscountsQuickTab` используется `FlatList`
- React Native не позволяет вкладывать VirtualizedList (FlatList) в ScrollView

**Решение:**
- Заменить `FlatList` на обычный `map()` с flexbox-сеткой (2 колонки)
- Или использовать `FlatList` с `scrollEnabled={false}` и `nestedScrollEnabled={true}` (не рекомендуется)

#### Ошибка 2: isTemplateActive is not a function

**Причина:**
- Функция `isTemplateActive` импортируется из `@src/utils/loyaltyConditions`
- Но эта функция не существует в файле `loyaltyConditions.ts`

**Решение:**
- Добавить функцию `isTemplateActive` в `mobile/src/utils/loyaltyConditions.ts`

### Минимальный diff

#### Файл 1: `mobile/src/components/loyalty/DiscountsQuickTab.tsx`

**Удалить строки 93-180:**
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
      // ... весь renderItem ...
    }}
  />
)}
```

**Добавить после строки 92:**
```tsx
{/* Сетка шаблонов (2 колонки) */}
{templates.length > 0 && (
  <View style={styles.templatesGrid}>
    {templates.map((template) => {
      const isActive = isTemplateActive(template, discounts);
      
      return (
        <View key={template.id} style={styles.templateCardWrapper}>
          <Card style={[styles.templateCard, isActive && styles.templateCardActive]}>
            <View style={styles.templateHeader}>
              <Text style={styles.templateIcon}>{template.icon}</Text>
              {isActive && (
                <View style={styles.activeBadge}>
                  <Text style={styles.activeBadgeText}>Активна</Text>
                </View>
              )}
            </View>
            
            <Text style={styles.templateName}>{template.name}</Text>
            <Text style={styles.templateDescription} numberOfLines={3}>{template.description}</Text>
            
            <View style={styles.templateActions}>
              {editingTemplate === template.id ? (
                <View style={styles.editContainer}>
                  <View style={styles.editInputContainer}>
                    <TextInput
                      style={styles.editInput}
                      value={editTemplateValue}
                      onChangeText={setEditTemplateValue}
                      keyboardType="numeric"
                      placeholder="0"
                      maxLength={5}
                    />
                    <Text style={styles.percentSymbol}>%</Text>
                  </View>
                  <TouchableOpacity
                    style={styles.saveButton}
                    onPress={() => handleCreateFromTemplate(template, parseFloat(editTemplateValue))}
                    disabled={isActive}
                  >
                    <Text style={styles.saveButtonText}>Сохранить</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.cancelButton}
                    onPress={() => {
                      setEditingTemplate(null);
                      setEditTemplateValue('');
                    }}
                  >
                    <Text style={styles.cancelButtonText}>Отмена</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <>
                  <View style={styles.templateDiscountRow}>
                    <Text style={styles.templateDiscountText}>
                      Скидка: {template.default_discount}%
                    </Text>
                    {!isActive && (
                      <TouchableOpacity
                        style={styles.editIconButton}
                        onPress={() => {
                          setEditingTemplate(template.id);
                          setEditTemplateValue(template.default_discount.toString());
                        }}
                      >
                        <Text style={styles.editIcon}>✏️</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                  <TouchableOpacity
                    style={[styles.activateButton, isActive && styles.activateButtonDisabled]}
                    onPress={() => handleCreateFromTemplate(template)}
                    disabled={isActive}
                  >
                    <Text style={[styles.activateButtonText, isActive && styles.activateButtonTextDisabled]}>
                      {isActive ? 'Активна' : 'Активировать'}
                    </Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          </Card>
        </View>
      );
    })}
  </View>
)}
```

**Обновить стили (добавить после строки 288):**
```tsx
templateCardWrapper: {
  width: '48%',
  marginBottom: 12,
},
```

**Изменить стиль `templatesGrid` (строка 281-284):**
```tsx
templatesGrid: {
  flexDirection: 'row',
  flexWrap: 'wrap',
  gap: 12,
  paddingBottom: 8,
},
```

**Удалить стиль `templatesRow` (строка 285-288):**
```tsx
// Удалить:
templatesRow: {
  justifyContent: 'space-between',
  gap: 12,
},
```

**Удалить импорт `FlatList` (строка 2):**
```tsx
// Было:
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView, Alert, FlatList } from 'react-native';

// Стало:
import { View, Text, StyleSheet, TouchableOpacity, TextInput, Alert } from 'react-native';
```

#### Файл 2: `mobile/src/utils/loyaltyConditions.ts`

**Добавить в начало файла (после импортов, если есть, или в начале):**
```typescript
import type { QuickDiscountTemplate, LoyaltyDiscount } from '@src/types/loyalty_discounts';
```

**Добавить в начало файла (после существующих импортов, если есть):**
```typescript
import type { QuickDiscountTemplate, LoyaltyDiscount } from '@src/types/loyalty_discounts';
```

**Добавить в конец файла (после функции `getSupportedConditionTypesForUI`):**
```typescript
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
  return discounts
    .filter((discount) => discount.is_active && discount.discount_type === 'quick')
    .some((discount) => {
      // Сравниваем по условиям (conditions должны совпадать)
      if (discount.conditions && template.conditions) {
        // Нормализуем условия скидки (может быть dict или array)
        const discountConditions = normalizeConditionsForApi(discount.conditions);
        
        // У шаблона conditions уже в правильном формате { condition_type, parameters }
        const templateConditionType = template.conditions.condition_type;
        const templateParameters = template.conditions.parameters;
        
        // Сравниваем condition_type и parameters
        return (
          discountConditions.condition_type === templateConditionType &&
          JSON.stringify(discountConditions.parameters || {}) === JSON.stringify(templateParameters || {})
        );
      }
      
      return false;
    });
}
```

### Порядок исправлений

1. **Сначала исправить `isTemplateActive`:**
   - Добавить функцию в `mobile/src/utils/loyaltyConditions.ts`
   - Это устранит ошибку "isTemplateActive is not a function"
   - Проверить, что приложение компилируется

2. **Затем исправить FlatList/ScrollView:**
   - Заменить `FlatList` на `map()` в `DiscountsQuickTab.tsx`
   - Обновить стили
   - Удалить неиспользуемые импорты
   - Это устранит ошибку вложенности VirtualizedList

3. **Проверить:**
   - Открыть экран лояльности
   - Переключиться на таб "Быстрые скидки"
   - Убедиться, что нет ошибок в консоли
   - Проверить, что шаблоны отображаются корректно (2 колонки)

---

## Итоговый чеклист

- [ ] Добавить функцию `isTemplateActive` в `loyaltyConditions.ts`
- [ ] Добавить импорт типов в `loyaltyConditions.ts`
- [ ] Заменить `FlatList` на `map()` в `DiscountsQuickTab.tsx`
- [ ] Обновить стили `templatesGrid` и добавить `templateCardWrapper`
- [ ] Удалить стиль `templatesRow`
- [ ] Удалить импорт `FlatList` и `ScrollView` из `DiscountsQuickTab.tsx`
- [ ] Протестировать на устройстве/эмуляторе
