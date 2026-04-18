# Bleed grid: заметно более широкие карточки «Быстрые скидки»

## Диагностика

- **Главный horizontal padding страницы**: задаётся в `ScreenContainer` (`mobile/src/components/ScreenContainer.tsx`) — `scrollContent` имеет `padding: 16`. Страница loyalty использует `<ScreenContainer scrollable>`, поэтому контент получает **16px** слева и справа.
- **В DiscountsQuickTab** раньше был `container.paddingHorizontal: 2` (после предыдущего фикса). Итого от края экрана до контента сетки: **16 + 2 = 18px** с каждой стороны, карточки были узкими.
- **Решение**: расширить только зону сетки к краям экрана (bleed), оставив заголовок и описание с обычными отступами.

## Константы

- **SCREEN_PADDING = 16** — берётся из `ScreenContainer` (`scrollContent.padding: 16`). Используется для отрицательного margin сетки и для `container.paddingHorizontal` (заголовок/текст остаются с отступом 16).
- **GRID_GUTTER = 8** — внутренний отступ только у контейнера сетки, чтобы карточки не вплотную к краю экрана.

## Изменения (unified diff)

### 1) Импорт и константы

```diff
 import React, { useState } from 'react';
-import { View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView, Alert, FlatList, ViewStyle, Switch } from 'react-native';
+import { View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView, Alert, FlatList, ViewStyle, Switch, Dimensions } from 'react-native';
+
+// Отступ страницы (ScreenContainer scrollContent padding) — для bleed только сетки
+const SCREEN_PADDING = 16;
+const GRID_GUTTER = 8;
```

### 2) Расчёт доступной ширины

```diff
   const COL_GAP = 8;
   const ROW_GAP = 12;
-  const availableWidth = listWidth ?? 0;
+  const availableWidth = listWidth != null && listWidth > 0 ? listWidth - 2 * GRID_GUTTER : 0;
   const ITEM_WIDTH = availableWidth > 0 ? Math.floor((availableWidth - COL_GAP) / 2) : 0;
```

### 3) Контейнер сетки — bleed

```diff
-      {/* Сетка шаблонов (2 колонки) */}
+      {/* Сетка шаблонов (2 колонки) — bleed к краям экрана */}
       {templates.length > 0 && (
         <View 
           onLayout={...}
-          style={styles.templatesContainer}
+          style={[
+            styles.templatesContainer,
+            {
+              marginHorizontal: -SCREEN_PADDING,
+              width: Dimensions.get('window').width,
+              paddingHorizontal: GRID_GUTTER,
+            },
+          ]}
         >
```

### 4) Контейнер страницы — нормальный отступ для заголовка

```diff
 const styles = StyleSheet.create({
   container: {
-    paddingHorizontal: 2,
+    paddingHorizontal: SCREEN_PADDING,
     paddingVertical: 16,
   },
```

### 5) Edit-блок — компактнее, без раздувания

- **editInputRow**: `marginBottom: 6` → `4`
- **editInputContainer**: `height: 40` → `36`
- **editActionsRow**: добавлен `flexWrap: 'nowrap'`
- **saveButton / cancelButton / saveButtonSmall / cancelButtonSmall**: `height: 36` → `34`

```diff
   editInputRow: {
     flexDirection: 'row',
     alignItems: 'center',
-    marginBottom: 6,
+    marginBottom: 4,
   },
   editInputContainer: {
     ...
-    height: 40,
+    height: 36,
   },
   editActionsRow: {
     flexDirection: 'row',
+    flexWrap: 'nowrap',
     alignItems: 'center',
     width: '100%',
     minWidth: 0,
   },
   saveButton: {
     ...
-    height: 36,
+    height: 34,
   },
   cancelButton: {
     ...
-    height: 36,
+    height: 34,
   },
   saveButtonSmall: {
     ...
-    height: 36,
+    height: 34,
   },
   cancelButtonSmall: {
     ...
-    height: 36,
+    height: 34,
   },
```

## Как это работает

1. **container** имеет `paddingHorizontal: 16` — заголовок «Быстрые скидки» и описание остаются с отступом 16 от краёв (как вся страница).
2. **templatesContainer**:
   - `marginHorizontal: -16` — выезжает на 16px влево и вправо и компенсирует padding контейнера, сетка доходит до краёв области контента (фактически до краёв экрана с учётом SafeArea).
   - `width: Dimensions.get('window').width` — контейнер сетки занимает всю ширину экрана.
   - `paddingHorizontal: GRID_GUTTER` (8) — внутри сетки остаётся небольшой отступ 8px от краёв, карточки не вплотную к экрану.
3. **onLayout** возвращает ширину этого контейнера = ширина экрана. Для расчёта карточек используется **availableWidth = listWidth - 2*GRID_GUTTER** (ширина контента между gutters).
4. **ITEM_WIDTH** и **wrapperStyle** (левая/правая колонка с COL_GAP/2) не менялись — COL_GAP и ROW_GAP остаются 8 и 12.

Пример для iPhone SE (ширина 320):  
Раньше: listWidth ≈ 284 (320 - 32 - 4), ITEM_WIDTH ≈ 138.  
Теперь: listWidth = 320, availableWidth = 304, ITEM_WIDTH = 148.  
Карточка шире на **10px** — визуально заметно.

## Smoke-check

- [x] **Карточки заметно шире** — сетка тянется к краям экрана (bleed), доступная ширина = screen - 2*GRID_GUTTER.
- [x] **COL_GAP и ROW_GAP не менялись** — 8 и 12, расстояние между карточками и рядами то же.
- [x] **Расширена только сетка** — заголовок и описание с `paddingHorizontal: SCREEN_PADDING` (16).
- [x] **Edit-режим не раздувает карточку** — кнопки 34px, input 36px, `editInputRow` marginBottom 4, `flexWrap: 'nowrap'` у кнопок.
- [x] **Кнопки не вылезают** — flex: 1, minWidth: 0, width: '100%' у editActionsRow, текст с ellipsizeMode.
- [x] **iPhone SE / узкие экраны** — карточки шире, gap не уменьшен, в edit кнопки в одну строку и внутри карточки.

Файл: `mobile/src/components/loyalty/DiscountsQuickTab.tsx`
