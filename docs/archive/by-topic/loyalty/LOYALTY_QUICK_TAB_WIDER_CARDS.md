# Улучшение визуала: более широкие карточки и компактные тексты

**Дата:** 2026-01-27  
**Файл:** `mobile/src/components/loyalty/DiscountsQuickTab.tsx`

---

## ЦЕЛИ

1. ✅ Сделать карточки шире (без обрезки справа)
2. ✅ Укоротить заголовки и описания для гарантированного влезания в 2-колоночной сетке
3. ✅ Сетка не тронута (numColumns=2, ITEM_WIDTH от listWidth/onLayout)

---

## ИЗМЕНЕНИЯ

### A) Карточки шире

**Было:**
- `styles.container.paddingHorizontal: 12`

**Стало:**
- `styles.container.paddingHorizontal: 8`

**Результат:**
- Карточки стали шире на 8px (4px с каждой стороны)
- Больше места для контента внутри карточек
- `listWidth` (onLayout) автоматически пересчитается с новым padding

**Почему не используется GRID_BLEED:**
- GRID_BLEED с отрицательными margin создает нестабильность и обрезку справа
- Уменьшение padding контейнера — безопасный способ увеличить ширину карточек

### B) Компактные тексты

**Добавлены функции-мэпперы:**

```typescript
function getCompactName(name: string): string {
  const mapping: Record<string, string> = {
    'Регулярные визиты': 'Повторные визиты',
    'Возвращение клиента': 'Возврат клиента',
    'Скидка за первую запись': 'На первую запись',
    'Скидка за регулярные посещения': 'За повторные визиты',
    'Скидка для клиентов, которые давно не были': 'Если давно не были',
    'Скидка в день рождения клиента': 'В день рождения',
  };
  return mapping[name] || name;
}

function getCompactDescription(description: string): string {
  const mapping: Record<string, string> = {
    'Скидка за первую запись': 'Скидка при первой записи',
    'Скидка за регулярные посещения': 'Скидка за повторные визиты',
    'Скидка для клиентов, которые давно не были': 'Скидка для давно не посещавших',
    'Скидка в день рождения клиента': 'Скидка в день рождения',
  };
  return mapping[description] || description;
}
```

**Использование в JSX:**

**Было:**
```tsx
<Text style={styles.templateName}>{template.name}</Text>
<Text style={styles.templateDescription}>{template.description}</Text>
```

**Стало:**
```tsx
<Text style={styles.templateName}>{getCompactName(template.name)}</Text>
<Text style={styles.templateDescription}>{getCompactDescription(template.description)}</Text>
```

**Результат:**
- Заголовки и описания короче, гарантированно влезают в 2 строки на узких экранах
- Данные в API не изменены (только отображение)
- Если текст не найден в мэппинге, используется оригинал

### C) Вёрстка текста (без изменений)

- Заголовок: `numberOfLines={2}`, `ellipsizeMode="tail"`, `minWidth:0`, `flexShrink:1` ✅
- Описание: `numberOfLines={2}`, `ellipsizeMode="tail"`, `minWidth:0`, `flexShrink:1` ✅
- Overlay ✏️ и badge не тронуты ✅

---

## UNIFIED DIFF

### mobile/src/components/loyalty/DiscountsQuickTab.tsx

```diff
--- a/mobile/src/components/loyalty/DiscountsQuickTab.tsx
+++ b/mobile/src/components/loyalty/DiscountsQuickTab.tsx
@@ -1,6 +1,28 @@
 import React, { useState } from 'react';
 import { View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView, Alert, FlatList, ViewStyle } from 'react-native';
 import { Card } from '@src/components/Card';
 import { PrimaryButton } from '@src/components/PrimaryButton';
 import type { LoyaltyDiscount, QuickDiscountTemplate } from '@src/types/loyalty_discounts';
 import { isTemplateActive } from '@src/utils/loyaltyConditions';
 
+// Функции для компактных версий текстов (для узких экранов)
+function getCompactName(name: string): string {
+  const mapping: Record<string, string> = {
+    'Регулярные визиты': 'Повторные визиты',
+    'Возвращение клиента': 'Возврат клиента',
+    'Скидка за первую запись': 'На первую запись',
+    'Скидка за регулярные посещения': 'За повторные визиты',
+    'Скидка для клиентов, которые давно не были': 'Если давно не были',
+    'Скидка в день рождения клиента': 'В день рождения',
+  };
+  return mapping[name] || name;
+}
+
+function getCompactDescription(description: string): string {
+  const mapping: Record<string, string> = {
+    'Скидка за первую запись': 'Скидка при первой записи',
+    'Скидка за регулярные посещения': 'Скидка за повторные визиты',
+    'Скидка для клиентов, которые давно не были': 'Скидка для давно не посещавших',
+    'Скидка в день рождения клиента': 'Скидка в день рождения',
+  };
+  return mapping[description] || description;
+}
+
 interface DiscountsQuickTabProps {
   // ... без изменений
@@ -189,7 +211,7 @@ export function DiscountsQuickTab({
                     <View style={styles.templateHeader}>
                       <View style={styles.templateHeaderLeft}>
                         <Text style={styles.templateIcon}>{template.icon}</Text>
-                        <Text style={styles.templateName} numberOfLines={2} ellipsizeMode="tail">{template.name}</Text>
+                        <Text style={styles.templateName} numberOfLines={2} ellipsizeMode="tail">{getCompactName(template.name)}</Text>
                       </View>
                     </View>
                     
                     {/* Content: Description */}
                     <View style={styles.templateContent}>
-                      <Text style={styles.templateDescription} numberOfLines={2} ellipsizeMode="tail">{template.description}</Text>
+                      <Text style={styles.templateDescription} numberOfLines={2} ellipsizeMode="tail">{getCompactDescription(template.description)}</Text>
                     </View>
@@ -340,7 +362,7 @@ const styles = StyleSheet.create({
 const styles = StyleSheet.create({
   container: {
-    paddingHorizontal: 12,
+    paddingHorizontal: 8,
     paddingVertical: 16,
   },
   // ... остальные стили без изменений
```

---

## ОБЪЯСНЕНИЕ ИЗМЕНЕНИЙ

### 1. Padding уменьшен с 12 до 8

**Что изменилось:**
- `styles.container.paddingHorizontal: 12` → `8`
- Карточки стали шире на 8px (4px с каждой стороны)

**Почему это безопасно:**
- `listWidth` получается через `onLayout` контейнера `templatesContainer`
- `templatesContainer` находится внутри `container` с новым padding
- `onLayout` автоматически учитывает новый padding при расчете `listWidth`
- `ITEM_WIDTH` пересчитывается от реальной ширины: `(listWidth - COL_GAP) / 2`
- Результат: карточки шире, но сетка остается стабильной

**Почему не используется GRID_BLEED:**
- GRID_BLEED с отрицательными margin создает нестабильность
- Может привести к обрезке справа на некоторых экранах
- Уменьшение padding — безопасный и предсказуемый способ

### 2. Компактные тексты

**Что изменилось:**
- Добавлены функции `getCompactName()` и `getCompactDescription()`
- В JSX используются компактные версии вместо оригинальных текстов

**Мэппинг названий:**
- "Регулярные визиты" → "Повторные визиты"
- "Возвращение клиента" → "Возврат клиента"
- "Скидка за первую запись" → "На первую запись"
- "Скидка за регулярные посещения" → "За повторные визиты"
- "Скидка для клиентов, которые давно не были" → "Если давно не были"
- "Скидка в день рождения клиента" → "В день рождения"

**Мэппинг описаний:**
- "Скидка за первую запись" → "Скидка при первой записи"
- "Скидка за регулярные посещения" → "Скидка за повторные визиты"
- "Скидка для клиентов, которые давно не были" → "Скидка для давно не посещавших"
- "Скидка в день рождения клиента" → "Скидка в день рождения"

**Почему это работает:**
- Данные в API не изменены (только отображение)
- Если текст не найден в мэппинге, используется оригинал
- Компактные версии гарантированно влезают в 2 строки на узких экранах

---

## SMOKE CHECKLIST

- [ ] **1. Карточки шире**
  - Открыть экран "Система лояльности → Скидки → Быстрые"
  - Проверить, что карточки стали шире (больше места для контента)
  - Проверить, что нет обрезки справа
  - Проверить на узком экране (iPhone SE)

- [ ] **2. Компактные тексты**
  - Проверить, что заголовки отображаются в компактной версии
  - Проверить, что описания отображаются в компактной версии
  - Проверить, что все тексты влезают в 2 строки
  - Проверить, что длинные тексты правильно обрезаются с многоточием

- [ ] **3. Сетка стабильна**
  - Проверить, что сетка остается 2-колоночной
  - Проверить, что карточки не обрезаются справа
  - Проверить, что отступы между карточками правильные
  - Проверить на разных размерах экранов (узкий/широкий)

- [ ] **4. Overlay элементы**
  - Проверить, что ✏️ и badge "Активна" остались на месте
  - Проверить, что они не мешают тексту

---

## ИТОГОВЫЙ СТАТУС

### ✅ Выполнено:

1. ✅ Padding уменьшен с 12 до 8 (карточки шире)
2. ✅ Добавлены функции `getCompactName()` и `getCompactDescription()`
3. ✅ Компактные тексты используются в JSX
4. ✅ Сетка не тронута (numColumns=2, ITEM_WIDTH от listWidth/onLayout)
5. ✅ Вёрстка текста не изменена (numberOfLines, ellipsizeMode, minWidth, flexShrink)

### 🎯 Ожидаемый результат:

- Карточки шире на 8px (больше места для контента)
- Заголовки и описания короче, гарантированно влезают в 2 строки
- Нет обрезки справа
- Сетка остается стабильной

---

## ПРИМЕЧАНИЯ

- Padding уменьшен безопасно: `onLayout` автоматически учитывает новый padding
- Компактные тексты не изменяют данные в API (только отображение)
- Если текст не найден в мэппинге, используется оригинал
- Сетка (`ITEM_WIDTH`, `onLayout`) не тронута
- Бизнес-логика не изменена
