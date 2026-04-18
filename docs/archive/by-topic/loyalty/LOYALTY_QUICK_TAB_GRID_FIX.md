# Исправление сетки "Быстрые скидки": Unified Diff и Checklist

**Дата:** 2026-01-21  
**Файл:** `mobile/src/components/loyalty/DiscountsQuickTab.tsx`

---

## ПРИЧИНА РЕГРЕССИИ

### Что ломало сетку

1. **`flex: 1` на `templateCardWrapper` + `marginHorizontal: 6`:**
   - При `numColumns={2}` FlatList ожидает фиксированные ширины элементов
   - `flex: 1` даёт непредсказуемую ширину в зависимости от контента
   - `marginHorizontal: 6` добавляет 12px к ширине каждого элемента
   - **Математика:** Если ширина экрана = 375px, padding = 16px:
     - Доступная ширина = 375 - 2*16 = 343px
     - С `flex: 1` + `marginHorizontal: 6`: каждый элемент ≈ 165.5px + 12px margin = 177.5px
     - Сумма: 177.5 + 177.5 + 12 = 367px > 343px → **ПЕРЕПОЛНЕНИЕ**
   - Результат: карточки "выпирают", правая обрезается, некоторые занимают почти всю ширину

2. **Отсутствие `paddingHorizontal` в `templatesGrid`:**
   - Нет контроля горизонтальных отступов
   - Зависимость от padding контейнера, который может быть разным

3. **Комбинация `justifyContent: 'space-between'` + `flex: 1`:**
   - Конфликт стратегий layout
   - `justifyContent: 'space-between'` работает лучше с фиксированными ширинами

### Почему выбран подход с ITEM_WIDTH

- **Явная математика:** `ITEM_WIDTH = (screenWidth - 2*H_PADDING - COL_GAP) / 2`
- **Предсказуемость:** Каждый элемент имеет точную ширину
- **Стабильность:** Не зависит от контента или flex-логики
- **Контроль:** Можно точно вычислить, что сумма ширин = доступная ширина

---

## UNIFIED DIFF

### mobile/src/components/loyalty/DiscountsQuickTab.tsx

```diff
--- a/mobile/src/components/loyalty/DiscountsQuickTab.tsx
+++ b/mobile/src/components/loyalty/DiscountsQuickTab.tsx
@@ -1,6 +1,6 @@
 import React from 'react';
-import { View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView, Alert, FlatList } from 'react-native';
+import { View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView, Alert, FlatList, useWindowDimensions } from 'react-native';
 import { Card } from '@src/components/Card';
 import { PrimaryButton } from '@src/components/PrimaryButton';
 import type { LoyaltyDiscount, QuickDiscountTemplate } from '@src/types/loyalty_discounts';
@@ -38,6 +38,13 @@ export function DiscountsQuickTab({
   editTemplateValue,
   setEditTemplateValue,
 }: DiscountsQuickTabProps) {
+  const { width: screenWidth } = useWindowDimensions();
+  
+  // Константы для сетки
+  const H_PADDING = 16; // Горизонтальный padding контейнера
+  const COL_GAP = 12; // Расстояние между колонками
+  const ROW_GAP = 12; // Расстояние между рядами
+  const ITEM_WIDTH = Math.floor((screenWidth - 2 * H_PADDING - COL_GAP) / 2);
+
   const handleCreateFromTemplate = async (template: QuickDiscountTemplate, customPercent?: number) => {
+
   const handleCreateFromTemplate = async (template: QuickDiscountTemplate, customPercent?: number) => {
     const isTemplateActive = isTemplateActive(template, discounts);
     if (isActive) {
@@ -105,7 +111,7 @@ export function DiscountsQuickTab({
             const isActive = isTemplateActive(template, discounts);
             
             return (
-              <View style={styles.templateCardWrapper}>
+              <View style={[styles.templateCardWrapper, { width: ITEM_WIDTH, marginBottom: ROW_GAP }]}>
                 <Card style={[styles.templateCard, isActive && styles.templateCardActive]}>
                   {/* Header: Icon + Badge */}
                   <View style={styles.templateHeader}>
@@ -100,7 +106,7 @@ export function DiscountsQuickTab({
           data={templates}
           numColumns={2}
           keyExtractor={(item) => item.id}
-          contentContainerStyle={styles.templatesGrid}
+          contentContainerStyle={[styles.templatesGrid, { paddingHorizontal: H_PADDING }]}
           columnWrapperStyle={styles.templatesRow}
           renderItem={({ item: template }) => {
             const isActive = isTemplateActive(template, discounts);
@@ -291,10 +297,7 @@ const styles = StyleSheet.create({
   templatesGrid: {
     paddingBottom: 8,
   },
   templatesRow: {
     justifyContent: 'space-between',
   },
   templateCardWrapper: {
+    // width задается динамически через inline style
   },
   templateCard: {
+    width: '100%',
     padding: 12,
     borderWidth: 1,
     borderColor: '#E0E0E0',
@@ -337,13 +340,13 @@ const styles = StyleSheet.create({
     lineHeight: 20,
   },
   templateName: {
-    fontSize: 14,
+    fontSize: 15,
     fontWeight: '600',
     color: '#333',
     marginBottom: 6,
-    lineHeight: 18,
+    lineHeight: 20,
   },
   templateDescription: {
-    fontSize: 11,
+    fontSize: 12,
     color: '#666',
-    lineHeight: 15,
+    lineHeight: 16,
   },
   templateActions: {
     marginTop: 'auto',
@@ -358,7 +361,7 @@ const styles = StyleSheet.create({
     flex: 1,
   },
   templateDiscountText: {
-    fontSize: 11,
+    fontSize: 12,
     color: '#666',
     flex: 1,
   },
@@ -370,15 +373,15 @@ const styles = StyleSheet.create({
   },
   activateButton: {
     backgroundColor: '#4CAF50',
-    minHeight: 36,
-    paddingVertical: 8,
-    paddingHorizontal: 8,
+    minHeight: 40,
+    paddingVertical: 10,
+    paddingHorizontal: 12,
     borderRadius: 8,
     alignItems: 'center',
     justifyContent: 'center',
     alignSelf: 'stretch',
   },
   activateButtonText: {
     color: '#fff',
-    fontSize: 11,
+    fontSize: 13,
     fontWeight: '600',
   },
   editInputContainer: {
     flexDirection: 'row',
     alignItems: 'center',
     borderWidth: 1,
     borderColor: '#4CAF50',
     borderRadius: 4,
+    paddingHorizontal: 8,
+    width: 72,
+    height: 36,
     marginRight: 6,
     marginBottom: 6,
   },
   editInput: {
     flex: 1,
+    fontSize: 12,
     textAlign: 'center',
     paddingVertical: 0,
     paddingHorizontal: 4,
   },
   percentSymbol: {
+    fontSize: 10,
     color: '#666',
     marginLeft: 2,
   },
   saveButton: {
     backgroundColor: '#4CAF50',
+    paddingVertical: 8,
+    paddingHorizontal: 12,
     borderRadius: 4,
+    minHeight: 36,
     marginRight: 6,
     marginBottom: 6,
     alignItems: 'center',
     justifyContent: 'center',
   },
   saveButtonText: {
     color: '#fff',
+    fontSize: 12,
     fontWeight: '600',
   },
   cancelButton: {
     backgroundColor: '#E0E0E0',
+    paddingVertical: 8,
+    paddingHorizontal: 12,
     borderRadius: 4,
+    minHeight: 36,
     marginBottom: 6,
     alignItems: 'center',
     justifyContent: 'center',
   },
   cancelButtonText: {
     color: '#666',
+    fontSize: 12,
   },
 });
```

---

## ПРИМЕНЁННЫЕ ПРИНЦИПЫ

1. **Явная математика ширины:**
   - `ITEM_WIDTH = Math.floor((screenWidth - 2*H_PADDING - COL_GAP) / 2)`
   - Каждый элемент имеет точную ширину, не зависит от flex

2. **Убрали `flex: 1` и `marginHorizontal`:**
   - Заменили на явную `width: ITEM_WIDTH` через inline style
   - `marginBottom: ROW_GAP` для расстояния между рядами

3. **Добавили `paddingHorizontal` в `templatesGrid`:**
   - Контроль горизонтальных отступов
   - Единообразие с остальным layout

4. **Карточка внутри wrapper:**
   - `width: '100%'` на Card (занимает всю ширину wrapper)
   - Wrapper имеет фиксированную ширину `ITEM_WIDTH`

5. **Минимальная полировка:**
   - Увеличили fontSize обратно (12-15 вместо 11-14)
   - Увеличили `minHeight` кнопок (40 вместо 36)
   - Улучшили padding кнопок для лучшей читаемости

---

## SMOKE CHECKLIST

- [ ] **1. iOS: все карточки в 2 колонки, без обрезки справа**
  - Открыть экран "Система лояльности → Скидки → Быстрые" на iOS
  - Проверить, что все карточки имеют одинаковую ширину (примерно половина экрана)
  - Проверить, что правая карточка не обрезается
  - Проверить, что нет "полноширинных" карточек при `numColumns={2}`

- [ ] **2. Android: то же самое**
  - Открыть экран на Android
  - Проверить 2 колонки с одинаковой шириной
  - Проверить отсутствие обрезки справа
  - Проверить отсутствие "полноширинных" карточек

- [ ] **3. editingTemplate: не ломает ширину**
  - Нажать на иконку карандаша у шаблона
  - Проверить, что режим редактирования не меняет ширину карточки
  - Проверить, что элементы (инпут + кнопки) не выходят за границы карточки
  - Проверить, что если переносится на 2 строки, всё помещается внутри

- [ ] **4. Длинные названия/описания не ломают сетку**
  - Если есть шаблоны с длинными названиями/описаниями, проверить:
  - Карточки остаются одинаковой ширины
  - Текст обрезается с многоточием (`numberOfLines={2}`)
  - Сетка не "разъезжается"

- [ ] **5. Разные размеры экранов**
  - Проверить на узком экране (iPhone SE, маленький Android)
  - Проверить на широком экране (iPhone Pro Max, большой Android)
  - Убедиться, что математика ширины работает корректно на всех размерах

- [ ] **6. Кнопка "Активировать" в 1 строку**
  - Проверить, что кнопка "Активировать" не переносится на 2 строки
  - Проверить, что текст полностью виден
  - Проверить, что кнопка занимает всю ширину карточки

- [ ] **7. Стабильность сетки**
  - Прокрутить список шаблонов
  - Проверить, что карточки не "прыгают"
  - Проверить, что отступы между карточками стабильные

- [ ] **8. Нет warning про VirtualizedList nesting**
  - Открыть консоль разработчика
  - Проверить, что нет warning: "VirtualizedLists should never be nested..."
  - Проверить, что `scrollEnabled={false}` у FlatList сохранён

- [ ] **9. Визуальная полировка**
  - Проверить, что карточки выглядят аккуратно и компактно
  - Проверить, что текст читаемый (fontSize не слишком маленький)
  - Проверить, что кнопки имеют адекватный размер для нажатия

- [ ] **10. Математика ширины**
  - Проверить вручную: `ITEM_WIDTH + ITEM_WIDTH + COL_GAP + 2*H_PADDING` должно быть ≈ `screenWidth`
  - Убедиться, что нет переполнения или недобора ширины
