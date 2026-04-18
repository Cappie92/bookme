# Замена кнопки "Активировать" на Switch (Вкл/Выкл)

**Дата:** 2026-01-27  
**Файл:** `mobile/src/components/loyalty/DiscountsQuickTab.tsx`

---

## ПРОБЛЕМА

- Кнопка "Активировать" постоянно ломается по ширине: текст не помещается, появляются пустые места
- Нужно заменить на стабильный Switch (переключатель Вкл/Выкл)

---

## UNIFIED DIFF

### mobile/src/components/loyalty/DiscountsQuickTab.tsx

```diff
--- a/mobile/src/components/loyalty/DiscountsQuickTab.tsx
+++ b/mobile/src/components/loyalty/DiscountsQuickTab.tsx
@@ -1,6 +1,6 @@
 import React, { useState } from 'react';
-import { View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView, Alert, FlatList, ViewStyle } from 'react-native';
+import { View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView, Alert, FlatList, ViewStyle, Switch } from 'react-native';
 import { Card } from '@src/components/Card';
 import { PrimaryButton } from '@src/components/PrimaryButton';
 import type { LoyaltyDiscount, QuickDiscountTemplate } from '@src/types/loyalty_discounts';
@@ -263,15 +263,20 @@ export function DiscountsQuickTab({
                           })()}
                           <View style={styles.templateFooterRow}>
-                            <TouchableOpacity
-                              style={[styles.activateButton, isActive ? styles.activateButtonDisabled : null]}
-                              onPress={() => handleCreateFromTemplate(template)}
-                              disabled={isActive}
-                            >
-                              <Text style={[styles.activateButtonText, isActive ? styles.activateButtonTextDisabled : null]} numberOfLines={1} ellipsizeMode="tail">
-                                {isActive ? 'Активна' : 'Активировать'}
-                              </Text>
-                            </TouchableOpacity>
+                            <View style={styles.toggleRow}>
+                              <Switch
+                                value={isActive}
+                                onValueChange={(nextValue) => {
+                                  if (nextValue) {
+                                    handleCreateFromTemplate(template);
+                                  }
+                                  // Выключение не поддерживается - Switch disabled когда isActive
+                                }}
+                                disabled={isActive}
+                              />
+                              <Text style={styles.toggleLabel}>
+                                {isActive ? 'Вкл' : 'Выкл'}
+                              </Text>
+                            </View>
                             {showEdit && (
                               <TouchableOpacity
                                 style={styles.editIconButtonFooter}
@@ -429,7 +434,7 @@ const styles = StyleSheet.create({
   templateCardInner: {
     flex: 1,
     padding: 10,
-    paddingBottom: 14,
+    paddingBottom: 12, // Уменьшен для плотной верстки
     // ❌ НЕ использовать justifyContent: 'space-between'
   },
@@ -492,7 +497,7 @@ const styles = StyleSheet.create({
     flexShrink: 1,
     minWidth: 0,
   },
   templateFooter: {
-    // marginTop убран - прижатие через flexGrow у templateContent
+    marginTop: 8, // Небольшой отступ от контента
   },
   templateFooterRow: {
     flexDirection: 'row',
     alignItems: 'center',
   },
+  toggleRow: {
+    flexDirection: 'row',
+    alignItems: 'center',
+    flexGrow: 1,
+    minWidth: 0,
+  },
+  toggleLabel: {
+    fontSize: 13,
+    color: '#333',
+    marginLeft: 8,
+    fontWeight: '500',
+  },
   templateDiscountText: {
     fontSize: 12,
     color: '#666',
@@ -512,7 +517,7 @@
     alignItems: 'center',
     justifyContent: 'center',
     flexShrink: 0,
-    marginLeft: 6, // Уменьшен gap для большего места кнопке
-    // backgroundColor убран - прозрачная кнопка
+    marginLeft: 8,
+    backgroundColor: 'transparent', // Прозрачный фон
   },
   editIcon: {
     fontSize: 16,
   },
-  activateButton: {
-    backgroundColor: '#4CAF50',
-    height: 36,
-    borderRadius: 10,
-    alignItems: 'center',
-    justifyContent: 'center',
-    flexGrow: 1,
-    flexShrink: 1,
-    flexBasis: 0,
-    minWidth: 0,
-    paddingHorizontal: 10, // Уменьшаем padding для большего места тексту
-    // ❌ НЕТ width: '100%'
-  },
-  activateButtonDisabled: {
-    backgroundColor: '#E0E0E0',
-  },
-  activateButtonText: {
-    color: '#fff',
-    fontSize: 12,
-    fontWeight: '600',
-  },
-  activateButtonTextDisabled: {
-    color: '#999',
-  },
   editContainer: {
     flexDirection: 'row',
```

---

## ЧТО И ПОЧЕМУ

### 1) Заменена кнопка на Switch

**Было:**
- Кнопка "Активировать" с текстом, который не помещался по ширине
- Проблемы с обрезанием текста и пустыми местами

**Стало:**
- Switch (переключатель) с текстом "Вкл"/"Выкл" рядом
- Switch стабилен по ширине, не зависит от длины текста
- Текст "Вкл"/"Выкл" короткий и всегда помещается

**Логика:**
- `value={isActive}` — состояние Switch соответствует активности скидки
- `onValueChange` — при включении вызывается `handleCreateFromTemplate(template)`
- `disabled={isActive}` — когда скидка активна, Switch disabled (выключение не поддерживается)

### 2) Убрана пустота снизу

**Было:**
- `paddingBottom: 14` в `templateCardInner`
- `templateFooter` без `marginTop`

**Стало:**
- `paddingBottom: 12` (уменьшен на 2px)
- `marginTop: 8` в `templateFooter` (небольшой отступ от контента)

**Результат:** Верстка стала плотнее, без лишних пустот снизу.

### 3) Убрана серая подложка у ✏️

**Было:**
- `backgroundColor` не был явно задан (мог быть серый)

**Стало:**
- `backgroundColor: 'transparent'` — явно прозрачный фон
- `marginLeft: 8` — нормальный gap

**Результат:** ✏️ без серой подложки, прозрачная кнопка.

### 4) Удалены неиспользуемые стили

**Удалено:**
- `activateButton`
- `activateButtonDisabled`
- `activateButtonText`
- `activateButtonTextDisabled`

**Добавлено:**
- `toggleRow` — контейнер для Switch и текста
- `toggleLabel` — стиль для текста "Вкл"/"Выкл"

---

## ИТОГОВЫЙ СТАТУС

### ✅ Выполнено:

1. ✅ Добавлен импорт `Switch` из `react-native`
2. ✅ Заменена кнопка на Switch с текстом "Вкл"/"Выкл"
3. ✅ Удалены стили кнопки (`activateButton`, `activateButtonDisabled`, `activateButtonText`, `activateButtonTextDisabled`)
4. ✅ Добавлены стили для Switch (`toggleRow`, `toggleLabel`)
5. ✅ Убрана пустота снизу (`paddingBottom: 12`, `marginTop: 8`)
6. ✅ Убрана серая подложка у ✏️ (`backgroundColor: 'transparent'`)

### 🎯 Ожидаемый результат:

- Switch стабилен по ширине, не ломается
- Текст "Вкл"/"Выкл" всегда помещается
- Верстка плотная, без лишних пустот снизу
- ✏️ без серой подложки (прозрачная)
- Сетка не менялась (`ITEM_WIDTH`, `numColumns=2`, `COL_GAP`, `ROW_GAP`, `onLayout`)

---

## ПРИМЕЧАНИЯ

- Switch disabled когда `isActive === true` (выключение не поддерживается)
- При включении вызывается `handleCreateFromTemplate(template)` (существующая функция)
- ✏️ показывается только если `showEdit` (логика сохранена)
- Сетка не изменена
- Бизнес-логика не изменена (только UI)
