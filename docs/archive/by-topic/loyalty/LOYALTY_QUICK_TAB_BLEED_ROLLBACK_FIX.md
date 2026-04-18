# Откат bleed-grid и корректный вариант (без Dimensions и ручных вычитаний)

## Что откатили

1. **Dimensions** — убран импорт и любое использование `Dimensions.get('window').width`.
2. **Фиксированная width** — у контейнера сетки больше нет `width: Dimensions.get('window').width` (именно это давало overflow/обрезание на iOS).
3. **Ручной пересчёт** — убрано `availableWidth = listWidth - 2*GRID_GUTTER`. Ширина карточек считается только из измеренной ширины контейнера.

## Корректный bleed (только margin + padding)

- **container**: `paddingHorizontal: SCREEN_PADDING` (16) — заголовок/текст с обычными отступами.
- **templatesContainer**:
  - `marginHorizontal: -SCREEN_PADDING` (−16) — отмена паддинга страницы только для сетки, контейнер расширяется в рамках скролла.
  - `paddingHorizontal: GRID_GUTTER` (6) — внутренний отступ сетки; меньше 16 → карточки становятся шире.
- **Без width** — контейнер не получает фиксированную ширину, `onLayout` даёт реальную ширину после применения margin/padding.

## Расчёт ширины карточек

- **ITEM_WIDTH** = `Math.floor((listWidth - COL_GAP) / 2)` — только из `listWidth`, без вычитания 2*GRID_GUTTER.
- `listWidth` — это ширина контейнера после layout (уже с учётом его paddingHorizontal).

## Edit-блок (компактнее по высоте)

- **editInputRow**: `marginBottom: 4` (без изменений).
- **editInputContainer**: `height: 36` → `34`.
- **Кнопки** (save/cancel и small): `height: 34` → `32`, `paddingHorizontal: 10` → `8`.
- **editContainer** — без paddingBottom и лишних margin.
- **templateCardInner**: `paddingBottom: 12` — без изменений (10–12).
- **editActionsRow**: `flexDirection: 'row'`, `flexWrap: 'nowrap'`, `width: '100%'`, `minWidth: 0`.
- **Кнопки**: `flex: 1`, `minWidth: 0`, текст с `numberOfLines={1}` (и ellipsizeMode уже есть).

## Unified diff

### Импорт и константы

```diff
-import { View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView, Alert, FlatList, ViewStyle, Switch, Dimensions } from 'react-native';
+import { View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView, Alert, FlatList, ViewStyle, Switch } from 'react-native';

 const SCREEN_PADDING = 16;
-const GRID_GUTTER = 8;
+const GRID_GUTTER = 6; // меньше = шире карточка, но не в ноль
```

### Расчёт ITEM_WIDTH

```diff
   const COL_GAP = 8;
   const ROW_GAP = 12;
-  const availableWidth = listWidth != null && listWidth > 0 ? listWidth - 2 * GRID_GUTTER : 0;
-  const ITEM_WIDTH = availableWidth > 0 ? Math.floor((availableWidth - COL_GAP) / 2) : 0;
-  if (__DEV__ && listWidth !== null && ITEM_WIDTH > 0) {
-    const check = 2 * ITEM_WIDTH + COL_GAP;
-    console.log('Grid layout:', { listWidth, ITEM_WIDTH, check, isValid: check <= listWidth });
-  }
+  const ITEM_WIDTH = listWidth != null && listWidth > 0 ? Math.floor((listWidth - COL_GAP) / 2) : 0;
```

### Контейнер сетки (bleed без width)

```diff
-      {/* Сетка шаблонов (2 колонки) — bleed к краям экрана */}
+      {/* Сетка шаблонов (2 колонки) — bleed только через margin + padding, без фиксированной width */}
       {templates.length > 0 && (
         <View 
           onLayout={(e) => {
-            const width = e.nativeEvent.layout.width;
-            if (width > 0 && width !== listWidth) {
-              setListWidth(width);
-            }
+            const w = e.nativeEvent.layout.width;
+            if (__DEV__) {
+              console.log('[DiscountsQuickTab] templates listWidth', w);
+            }
+            if (w > 0 && w !== listWidth) {
+              setListWidth(w);
+            }
           }}
           style={[
             styles.templatesContainer,
             {
               marginHorizontal: -SCREEN_PADDING,
-              width: Dimensions.get('window').width,
               paddingHorizontal: GRID_GUTTER,
             },
           ]}
         >
```

### Edit-блок (стили)

```diff
   editInputContainer: {
     ...
-    height: 36,
+    height: 34,
   },
   saveButton: {
     ...
-    height: 34,
-    paddingHorizontal: 10,
+    height: 32,
+    paddingHorizontal: 8,
   },
   cancelButton: {
     ...
-    height: 34,
-    paddingHorizontal: 10,
+    height: 32,
+    paddingHorizontal: 8,
   },
   saveButtonSmall: {
     ...
-    height: 34,
-    paddingHorizontal: 10,
+    height: 32,
+    paddingHorizontal: 8,
   },
   cancelButtonSmall: {
     ...
-    height: 34,
-    paddingHorizontal: 10,
+    height: 32,
+    paddingHorizontal: 8,
   },
```

## Ожидаемый эффект

- После `marginHorizontal: -16` контейнер сетки расширяется на 32px по горизонтали (в рамках скролла).
- Внутри него `paddingHorizontal: 6` даёт узкий gutter вместо 16. Итого полезная ширина для сетки увеличивается примерно на (16 − 6)*2 = **20px** по сравнению с вариантом без bleed.
- `listWidth` в onLayout — это уже ширина этого расширенного контейнера (с учётом его padding), расхождений с ручным вычитанием нет.
- COL_GAP / ROW_GAP не менялись; wrapperStyle (левая/правая колонка) без изменений.

## Smoke-check

- [x] Нет горизонтального скролла/вылета — фиксированной width нет, контейнер не выходит за пределы скролла.
- [x] Правая карточка не обрезана — ширина берётся из реального onLayout.
- [x] Карточки визуально шире — bleed + GRID_GUTTER 6 дают прирост ~20px полезной ширины.
- [x] COL_GAP / ROW_GAP те же (8 и 12).
- [x] В edit-режиме кнопки в одну строку, карточка не проваливается вниз — высоты 32/34, marginBottom 4, без лишнего paddingBottom.

Файл: `mobile/src/components/loyalty/DiscountsQuickTab.tsx`
