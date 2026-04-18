# Исправление расчета ширины сетки от реального layout width

**Дата:** 2026-01-27  
**Файл:** `mobile/src/components/loyalty/DiscountsQuickTab.tsx`

---

## ПРИЧИНА ОБРЕЗКИ (ДО ИСПРАВЛЕНИЯ)

### Проблема: расчет от screenWidth вместо реального layout width

**Что было:**
- Использовался `useWindowDimensions().width` для расчета `availableWidth`
- Формула: `availableWidth = screenWidth - 2 * CONTAINER_PADDING`
- Предполагалось, что `CONTAINER_PADDING = 16` всегда соответствует реальному padding

**Почему это не работало:**
1. `screenWidth` - это ширина всего экрана, а не контейнера сетки
2. Реальная ширина контейнера может отличаться из-за:
   - Safe area insets (notch, status bar)
   - Дополнительные padding/margin от родительских контейнеров
   - Различия в рендеринге между iOS и Android
3. `CONTAINER_PADDING = 16` - это предположение, которое может не совпадать с реальностью
4. Результат: `availableWidth` был больше реальной ширины → переполнение → обрезка справа

**Пример:**
- `screenWidth = 375px` (iPhone SE)
- `availableWidth = 375 - 32 = 343px` (предполагаемая)
- Реальная ширина контейнера: `340px` (из-за safe area или других факторов)
- `ITEM_WIDTH = Math.floor((343 - 12) / 2) = 165px`
- Сумма: `2*165 + 12 = 342px > 340px` → **переполнение!**

---

## РЕШЕНИЕ

### 1. Использование onLayout для получения реальной ширины

**Добавлено:**
```tsx
const [listWidth, setListWidth] = useState<number | null>(null);

<View 
  onLayout={(e) => {
    const width = e.nativeEvent.layout.width;
    if (width > 0 && width !== listWidth) {
      setListWidth(width);
    }
  }}
  style={styles.templatesContainer}
>
  {ITEM_WIDTH > 0 ? (
    <FlatList ... />
  ) : null}
</View>
```

**Результат:** Получаем реальную ширину контейнера сетки после всех layout вычислений.

### 2. Пересчет ITEM_WIDTH от listWidth

**Было:**
```tsx
const availableWidth = screenWidth - 2 * CONTAINER_PADDING;
const ITEM_WIDTH = Math.floor((availableWidth - COL_GAP) / 2);
```

**Стало:**
```tsx
const availableWidth = listWidth ?? 0;
const ITEM_WIDTH = availableWidth > 0 ? Math.floor((availableWidth - COL_GAP) / 2) : 0;
```

**Результат:** `ITEM_WIDTH` рассчитывается от реальной ширины контейнера, а не от предположений.

### 3. Условный рендеринг только когда listWidth > 0

**Добавлено:**
```tsx
{ITEM_WIDTH > 0 ? (
  <FlatList ... />
) : null}
```

**Результат:** Карточки рендерятся только после измерения реальной ширины, нет прыжков.

### 4. Отладочная проверка

**Добавлено:**
```tsx
if (__DEV__ && listWidth !== null && ITEM_WIDTH > 0) {
  const check = 2 * ITEM_WIDTH + COL_GAP;
  console.log('Grid layout:', { listWidth, ITEM_WIDTH, check, isValid: check <= listWidth });
}
```

**Результат:** В dev режиме видно, что математика всегда корректна.

---

## UNIFIED DIFF

### mobile/src/components/loyalty/DiscountsQuickTab.tsx

```diff
--- a/mobile/src/components/loyalty/DiscountsQuickTab.tsx
+++ b/mobile/src/components/loyalty/DiscountsQuickTab.tsx
@@ -1,5 +1,5 @@
-import React from 'react';
-import { View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView, Alert, FlatList, useWindowDimensions, ViewStyle } from 'react-native';
+import React, { useState } from 'react';
+import { View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView, Alert, FlatList, ViewStyle } from 'react-native';
 import { Card } from '@src/components/Card';
 import { PrimaryButton } from '@src/components/PrimaryButton';
@@ -37,13 +37,20 @@ export function DiscountsQuickTab({
   editTemplateValue,
   setEditTemplateValue,
 }: DiscountsQuickTabProps) {
-  const { width: screenWidth } = useWindowDimensions();
+  // Реальная ширина контейнера сетки (получаем через onLayout)
+  const [listWidth, setListWidth] = useState<number | null>(null);
   
   // Константы для сетки
-  const CONTAINER_PADDING = 16; // padding от styles.container (единственный источник горизонтального padding)
   const COL_GAP = 12; // Расстояние между колонками
   const ROW_GAP = 12; // Расстояние между рядами
-  const availableWidth = screenWidth - 2 * CONTAINER_PADDING;
-  // ITEM_WIDTH без border (border будет на wrapper, не влияет на ширину)
-  // Гарантируем: 2*ITEM_WIDTH + COL_GAP <= availableWidth
-  const ITEM_WIDTH = Math.floor((availableWidth - COL_GAP) / 2);
+  // ITEM_WIDTH считаем от реальной ширины контейнера (listWidth)
+  // listWidth уже учитывает все padding родительских контейнеров
+  const availableWidth = listWidth ?? 0;
+  const ITEM_WIDTH = availableWidth > 0 ? Math.floor((availableWidth - COL_GAP) / 2) : 0;
+  
+  // Отладочная проверка (в dev)
+  if (__DEV__ && listWidth !== null && ITEM_WIDTH > 0) {
+    const check = 2 * ITEM_WIDTH + COL_GAP;
+    console.log('Grid layout:', { listWidth, ITEM_WIDTH, check, isValid: check <= listWidth });
+  }
@@ -102,7 +109,20 @@ export function DiscountsQuickTab({
       {/* Сетка шаблонов (2 колонки) */}
       {templates.length > 0 && (
-        <FlatList
+        <View 
+          onLayout={(e) => {
+            const width = e.nativeEvent.layout.width;
+            if (width > 0 && width !== listWidth) {
+              setListWidth(width);
+            }
+          }}
+          style={styles.templatesContainer}
+        >
+          {ITEM_WIDTH > 0 ? (
+            <FlatList
               scrollEnabled={false}
               removeClippedSubviews={false}
               nestedScrollEnabled={true}
               data={templates}
               numColumns={2}
               keyExtractor={(item) => item.id}
               contentContainerStyle={styles.templatesGrid}
               columnWrapperStyle={styles.templatesRow}
               renderItem={({ item: template, index }) => {
@@ -200,7 +220,9 @@ export function DiscountsQuickTab({
             );
           }}
-        />
+            />
+          ) : null}
+        </View>
       )}
@@ -322,6 +344,9 @@ const styles = StyleSheet.create({
   description: {
     fontSize: 14,
     color: '#666',
   },
+  templatesContainer: {
+    // Контейнер для измерения реальной ширины сетки
+  },
   templatesGrid: {
     paddingBottom: 8,
   },
```

---

## ПОЧЕМУ ТЕПЕРЬ НЕ БУДЕТ ОБРЕЗАТЬСЯ

### 1. Реальная ширина контейнера

- `listWidth` получается через `onLayout` после всех layout вычислений
- Учитывает все padding, margin, safe area insets
- Точная ширина области, где рендерится сетка

### 2. Точный расчет ITEM_WIDTH

- `ITEM_WIDTH = Math.floor((listWidth - COL_GAP) / 2)`
- Гарантия: `2*ITEM_WIDTH + COL_GAP <= listWidth` всегда выполняется
- Нет предположений о padding/margin

### 3. Условный рендеринг

- Карточки рендерятся только после измерения ширины
- Нет прыжков при первом рендере
- `ITEM_WIDTH > 0` гарантирует корректный расчет

### 4. Отладочная проверка

- В dev режиме видно, что математика всегда корректна
- `check <= listWidth` всегда true

---

## ПРОВЕРКА МАТЕМАТИКИ

### Пример 1: Реальная ширина = 340px
- `listWidth = 340px`
- `ITEM_WIDTH = Math.floor((340 - 12) / 2) = 164px`
- Проверка: `2*164 + 12 = 340px <= 340px` ✅
- **Точно вписывается!**

### Пример 2: Реальная ширина = 343px
- `listWidth = 343px`
- `ITEM_WIDTH = Math.floor((343 - 12) / 2) = 165px`
- Проверка: `2*165 + 12 = 342px <= 343px` ✅
- **Остаток: 1px (запас)**

### Пример 3: Реальная ширина = 360px
- `listWidth = 360px`
- `ITEM_WIDTH = Math.floor((360 - 12) / 2) = 174px`
- Проверка: `2*174 + 12 = 360px <= 360px` ✅
- **Точно вписывается!**

**Вывод:** Математика гарантирует, что `2*ITEM_WIDTH + COL_GAP <= listWidth` на любых реальных ширинах контейнера.

---

## SMOKE CHECKLIST

- [ ] **1. iOS: карточки стабильные, ничего не обрезается**
  - Открыть экран "Система лояльности → Скидки → Быстрые" на iOS
  - Проверить, что все карточки имеют одинаковую ширину
  - Проверить, что правая карточка не обрезается
  - Проверить, что кнопка "Активировать" полностью видна и не обрезается
  - Проверить консоль (dev режим): должно быть `isValid: true`

- [ ] **2. Android: то же самое**
  - Открыть экран на Android
  - Проверить стабильность сетки
  - Проверить отсутствие обрезки кнопки
  - Проверить консоль (dev режим): должно быть `isValid: true`

- [ ] **3. iPhone SE (узкий экран)**
  - Проверить на iPhone SE (375px)
  - Убедиться, что карточки не выходят за границы
  - Убедиться, что кнопка не обрезается
  - Убедиться, что математика ширины работает корректно
  - Проверить консоль: `check <= listWidth` должно быть true

- [ ] **4. Нет прыжков при первом рендере**
  - Открыть экран
  - Проверить, что карточки не "прыгают" при первом рендере
  - Проверить, что сетка появляется сразу после измерения ширины

- [ ] **5. Длинные названия/описания**
  - Если есть шаблоны с длинными названиями/описаниями, проверить:
  - Название обрезается на 2 строки с многоточием
  - Описание обрезается на 2 строки с многоточием
  - Карточки остаются одинаковой ширины
  - Контент не выходит за границы (overflow: hidden работает)

- [ ] **6. Режим редактирования (edit-mode)**
  - Нажать на иконку карандаша у шаблона
  - Проверить, что режим редактирования не меняет ширину карточки
  - Проверить, что элементы (инпут + кнопки) не выходят за границы карточки

- [ ] **7. Отладочная проверка (dev режим)**
  - Открыть консоль разработчика
  - Проверить логи: `Grid layout: { listWidth, ITEM_WIDTH, check, isValid: true }`
  - Убедиться, что `isValid` всегда `true`
  - Убедиться, что `check <= listWidth` всегда выполняется

---

## ИТОГОВЫЙ СТАТУС

### ✅ Выполнено:

1. ✅ Добавлен `useState` для `listWidth` и `onLayout` на контейнер сетки
2. ✅ Пересчитан `ITEM_WIDTH` от `listWidth` вместо `screenWidth`
3. ✅ Рендеринг карточек только когда `listWidth > 0`
4. ✅ Добавлена отладочная проверка в dev режиме
5. ✅ Убран неиспользуемый импорт `useWindowDimensions`

### 🎯 Ожидаемый результат:

- Стабильная 2-колоночная сетка без обрезки справа на любых ширинах
- Расчет от реальной ширины контейнера, а не от предположений
- Одинаковые отступы между колонками/рядами (12px)
- Кнопка всегда полностью видна
- Нет прыжков при первом рендере

---

## ПРИМЕЧАНИЯ

- Все изменения касаются только верстки, бизнес-логика не изменена
- `FlatList` остался с `numColumns={2}` и `scrollEnabled={false}`
- `onLayout` вызывается после всех layout вычислений, поэтому `listWidth` точный
- Отладочный `console.log` работает только в dev режиме (`__DEV__`)
