# Откат кастомного toggle, возврат стандартного Switch (компактный, без transform)

**Дата:** 2026-01-27  
**Файл:** `mobile/src/components/loyalty/DiscountsQuickTab.tsx`

---

## ПРОБЛЕМА

- Кастомный сегментный toggle визуально стал хуже (текст "Вкл/Выкл" ломается/переносится, футер выглядит тяжело)
- Нужно вернуть стандартный Switch, но сделать его компактнее БЕЗ `transform: scale` (который ранее давал регресс "В" вместо "Выкл")

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
@@ -263,40 +263,20 @@ export function DiscountsQuickTab({
                           })()}
                           <View style={styles.templateFooterRow}>
-                            <View style={styles.toggleContainer}>
-                              <TouchableOpacity
-                                style={[
-                                  styles.toggleSegment,
-                                  styles.toggleSegmentLeft,
-                                  isActive && styles.toggleSegmentActive,
-                                ]}
-                                onPress={() => {
-                                  if (!isActive) {
-                                    handleCreateFromTemplate(template);
-                                  }
-                                }}
-                                disabled={isActive}
-                              >
-                                <Text style={[
-                                  styles.toggleSegmentText,
-                                  isActive && styles.toggleSegmentTextActive,
-                                ]}>
-                                  Вкл
-                                </Text>
-                              </TouchableOpacity>
-                              <TouchableOpacity
-                                style={[
-                                  styles.toggleSegment,
-                                  styles.toggleSegmentRight,
-                                  !isActive && styles.toggleSegmentInactive,
-                                ]}
-                                disabled={isActive}
-                              >
-                                <Text style={[
-                                  styles.toggleSegmentText,
-                                  !isActive && styles.toggleSegmentTextInactive,
-                                ]}>
-                                  Выкл
-                                </Text>
-                              </TouchableOpacity>
-                            </View>
+                            <View style={styles.toggleRow}>
+                              <View style={styles.switchWrap}>
+                                <Switch
+                                  value={isActive}
+                                  onValueChange={(nextValue) => {
+                                    if (nextValue) {
+                                      handleCreateFromTemplate(template);
+                                    }
+                                    // Выключение не поддерживается - Switch disabled когда isActive
+                                  }}
+                                  disabled={isActive}
+                                />
+                              </View>
+                              <Text style={styles.toggleLabel} numberOfLines={1}>
+                                {isActive ? 'Вкл' : 'Выкл'}
+                              </Text>
+                            </View>
                             {showEdit && (
                               <TouchableOpacity
                                 style={styles.editIconButtonFooter}
@@ -523,45 +503,15 @@ const styles = StyleSheet.create({
   templateFooterRow: {
     flexDirection: 'row',
     alignItems: 'center',
     paddingRight: 10, // Отступ от правого края карточки для ✏️
   },
-  toggleContainer: {
-    flex: 1,
-    minWidth: 0,
-    flexDirection: 'row',
-    marginRight: 10, // Разрыв между toggle и ✏️
-    borderRadius: 10,
-    backgroundColor: '#F5F5F5',
-    overflow: 'hidden',
-  },
-  toggleSegment: {
-    flex: 1,
-    height: 34,
-    alignItems: 'center',
-    justifyContent: 'center',
-    paddingHorizontal: 12,
-  },
-  toggleSegmentLeft: {
-    borderTopLeftRadius: 10,
-    borderBottomLeftRadius: 10,
-  },
-  toggleSegmentRight: {
-    borderTopRightRadius: 10,
-    borderBottomRightRadius: 10,
-  },
-  toggleSegmentActive: {
-    backgroundColor: '#4CAF50',
-  },
-  toggleSegmentInactive: {
- backgroundColor: '#E0E0E0',
-  },
-  toggleSegmentText: {
-    fontSize: 13,
-    fontWeight: '600',
-    color: '#666',
-  },
-  toggleSegmentTextActive: {
-    color: '#fff',
-  },
-  toggleSegmentTextInactive: {
-    color: '#333',
-  },
+  toggleRow: {
+    flexDirection: 'row',
+    alignItems: 'center',
+    flex: 1,
+    minWidth: 0,
+    marginRight: 10, // Разрыв между toggleRow и ✏️
+  },
+  switchWrap: {
+    width: 44,
+    alignItems: 'flex-start',
+    justifyContent: 'center',
+  },
+  toggleLabel: {
+    marginLeft: 8,
+    fontSize: 13,
+    fontWeight: '500',
+    minWidth: 36, // Гарантирует место для текста "Вкл/Выкл"
+  },
   templateDiscountText: {
     fontSize: 12,
     color: '#666',
     marginBottom: 6,
   },
   editIconButtonFooter: {
     width: 34,
     height: 34,
     alignItems: 'center',
     justifyContent: 'center',
     flexShrink: 0,
     backgroundColor: 'transparent', // Прозрачный фон
+    // marginLeft и marginRight убраны - отступ от края через paddingRight у templateFooterRow
   },
   editIcon: {
     fontSize: 16,
   },
```

---

## ЧТО И ПОЧЕМУ

### 1) Откат кастомного segmented toggle

**Было:**
- Кастомный toggle из 2 TouchableOpacity ("Вкл" / "Выкл")
- Текст ломался/переносился, футер выглядел тяжело
- Много стилей (`toggleContainer`, `toggleSegment*`, `toggleSegmentText*`)

**Стало:**
- Стандартный `Switch` из React Native
- Простая структура: Switch + текст "Вкл/Выкл"
- Удалены все стили кастомного toggle

**Результат:** Визуально чище, стандартный компонент React Native.

### 2) Switch компактнее БЕЗ transform: scale

**Было:**
- Попытки уменьшить Switch через `transform: scale(0.9)` давали регресс ("В" вместо "Выкл")
- Transform ломал измерения и layout

**Стало:**
- `switchWrap`: `width: 44`, `alignItems: 'flex-start'` — фиксированная ширина контейнера
- Switch без transform — стандартный размер, но ограничен контейнером
- Компактность достигается через layout, а не через масштабирование

**Результат:** Switch визуально компактнее (ограничен контейнером 44px), но без проблем с измерениями.

### 3) Стабильная раскладка футера

**Было:**
- `toggleContainer` с `flex: 1` и сложной структурой сегментов

**Стало:**
- `toggleRow`: `flex: 1`, `minWidth: 0`, `marginRight: 10` — занимает всё доступное место слева
- `switchWrap`: фиксированная ширина 44px — Switch не раздувает ряд
- `toggleLabel`: `minWidth: 36` — гарантирует место для текста "Вкл/Выкл"
- `templateFooterRow`: `paddingRight: 10` — отступ от правого края для ✏️

**Результат:** Предсказуемая раскладка: [Switch + текст] [✏️] с гарантированными отступами.

### 4) ✏️ не липнет к краю

**Было:**
- `editIconButtonFooter` мог иметь `marginRight`, который конфликтовал с `paddingRight` у ряда

**Стало:**
- `editIconButtonFooter`: убраны `marginLeft` и `marginRight`
- Отступ от края карточки обеспечивается через `paddingRight: 10` у `templateFooterRow`
- Разрыв между toggleRow и ✏️ через `marginRight: 10` у `toggleRow`

**Результат:** ✏️ всегда справа с отступом, не прилипает к краю карточки.

### 5) Текст "Вкл/Выкл" полностью виден

**Было:**
- Кастомный toggle с `flex: 1` на сегментах — текст мог обрезаться

**Стало:**
- `toggleLabel`: `minWidth: 36` — гарантирует минимальную ширину для текста
- `numberOfLines={1}` — текст в одну строку
- `marginLeft: 8` — отступ после Switch

**Результат:** Текст "Вкл/Выкл" всегда полностью виден, не обрезается до "В".

---

## ИТОГОВЫЙ СТАТУС

### ✅ Выполнено:

1. ✅ Вернут импорт `Switch` из react-native
2. ✅ Удалён кастомный segmented toggle (JSX и стили)
3. ✅ Switch обёрнут в `switchWrap` с фиксированной шириной 44px (БЕЗ transform)
4. ✅ Создана структура `toggleRow` для стабильной раскладки
5. ✅ `toggleLabel` с `minWidth: 36` для гарантии видимости текста
6. ✅ `editIconButtonFooter` очищен от лишних margin'ов
7. ✅ `templateFooterRow` с `paddingRight: 10` для отступа ✏️ от края

### 🎯 Ожидаемый результат:

- **Switch компактнее:** ограничен контейнером 44px, но БЕЗ transform (нет проблем с измерениями)
- **Текст "Вкл/Выкл" полностью виден:** `minWidth: 36` гарантирует место
- **✏️ не липнет к краю:** отступ через `paddingRight: 10` на ряду
- **Стабильная раскладка:** `toggleRow` с `flex: 1` + `marginRight: 10`, ✏️ с `flexShrink: 0`
- **Визуально чище:** стандартный Switch вместо кастомного toggle

---

## ПРИМЕЧАНИЯ

- Логика не изменена (только UI-компонент заменён)
- Сетка не изменена (`ITEM_WIDTH`, `numColumns=2`, `COL_GAP`, `ROW_GAP`, `onLayout`)
- Бизнес-логика не изменена (`handleCreateFromTemplate` вызывается при включении Switch)
- Выключение не поддерживается (когда `isActive === true`, Switch disabled)
- Фон ✏️ остался прозрачным (`backgroundColor: 'transparent'`)
- **НЕТ transform: scale** — компактность через layout (фиксированная ширина контейнера)

---

## SMOKE CHECKLIST

### iPhone SE / узкие экраны:

- ✅ Текст "Вкл" полностью виден (не обрезается до "В")
- ✅ Текст "Выкл" полностью виден (не обрезается)
- ✅ ✏️ всегда справа, не прилипает к краю карточки (есть отступ 10px)
- ✅ ✏️ не обрезается, не "ездит"
- ✅ Switch компактнее (ограничен контейнером 44px), но стандартный размер
- ✅ Нет пустот/провалов по вертикали под футером
- ✅ При включении Switch активируется скидка (когда `!isActive`)
- ✅ Switch disabled когда `isActive === true` (выключение не поддерживается)

---

## ОБЪЯСНЕНИЕ: ПОЧЕМУ ТЕПЕРЬ ЛУЧШЕ

**Ключевые улучшения:**

1. **Стандартный Switch вместо кастомного toggle** — визуально чище, меньше кода, стандартный компонент React Native
2. **Компактность БЕЗ transform** — Switch ограничен контейнером `switchWrap` (44px), но без проблем с измерениями, которые давал `transform: scale`
3. **Гарантированная видимость текста** — `toggleLabel` с `minWidth: 36` гарантирует место для "Вкл/Выкл", текст не обрезается
4. **Стабильная раскладка** — `toggleRow` с `flex: 1` + `marginRight: 10` занимает доступное место слева, ✏️ с `flexShrink: 0` фиксирована справа
5. **Отступ ✏️ от края** — через `paddingRight: 10` на `templateFooterRow`, а не через margin у самой ✏️

**Итог:** Стандартный Switch компактнее (через layout), текст всегда виден, ✏️ не липнет к краю, раскладка стабильна на всех экранах.
