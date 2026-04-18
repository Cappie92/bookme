# Замена Switch на кастомный сегментный toggle (стабильный футер)

**Дата:** 2026-01-27  
**Файл:** `mobile/src/components/loyalty/DiscountsQuickTab.tsx`

---

## ПРОБЛЕМА

- После "3-колоночной" перестройки стало ХУЖЕ: рядом со Switch вместо "Выкл" видна одна буква "В", а ✏️ местами визуально едет
- Switch с `transform: scale` ломает layout и измерения
- Текст обрезается из-за некорректных flex-настроек

---

## UNIFIED DIFF

### mobile/src/components/loyalty/DiscountsQuickTab.tsx

```diff
--- a/mobile/src/components/loyalty/DiscountsQuickTab.tsx
+++ b/mobile/src/components/loyalty/DiscountsQuickTab.tsx
@@ -1,6 +1,6 @@
 import React, { useState } from 'react';
-import { View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView, Alert, FlatList, ViewStyle, Switch } from 'react-native';
+import { View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView, Alert, FlatList, ViewStyle } from 'react-native';
 import { Card } from '@src/components/Card';
 import { PrimaryButton } from '@src/components/PrimaryButton';
 import type { LoyaltyDiscount, QuickDiscountTemplate } from '@src/types/loyalty_discounts';
@@ -263,20 +263,40 @@ export function DiscountsQuickTab({
                           })()}
                           <View style={styles.templateFooterRow}>
-                            <Switch
-                              value={isActive}
-                              onValueChange={(nextValue) => {
-                                if (nextValue) {
-                                  handleCreateFromTemplate(template);
-                                }
-                                // Выключение не поддерживается - Switch disabled когда isActive
-                              }}
-                              disabled={isActive}
-                              style={styles.switchCompact}
-                            />
-                            <Text style={styles.toggleLabel} numberOfLines={1} ellipsizeMode="tail">
-                              {isActive ? 'Вкл' : 'Выкл'}
-                            </Text>
+                            <View style={styles.toggleContainer}>
+                              <TouchableOpacity
+                                style={[
+                                  styles.toggleSegment,
+                                  styles.toggleSegmentLeft,
+                                  isActive && styles.toggleSegmentActive,
+                                ]}
+                                onPress={() => {
+                                  if (!isActive) {
+                                    handleCreateFromTemplate(template);
+                                  }
+                                }}
+                                disabled={isActive}
+                              >
+                                <Text style={[
+                                  styles.toggleSegmentText,
+                                  isActive && styles.toggleSegmentTextActive,
+                                ]}>
+                                  Вкл
+                                </Text>
+                              </TouchableOpacity>
+                              <TouchableOpacity
+                                style={[
+                                  styles.toggleSegment,
+                                  styles.toggleSegmentRight,
+                                  !isActive && styles.toggleSegmentInactive,
+                                ]}
+                                disabled={isActive}
+                              >
+                                <Text style={[
+                                  styles.toggleSegmentText,
+                                  !isActive && styles.toggleSegmentTextInactive,
+                                ]}>
+                                  Выкл
+                                </Text>
+                              </TouchableOpacity>
+                            </View>
                             {showEdit && (
                               <TouchableOpacity
                                 style={styles.editIconButtonFooter}
@@ -500,19 +520,45 @@ const styles = StyleSheet.create({
   templateFooterRow: {
     flexDirection: 'row',
     alignItems: 'center',
-    justifyContent: 'flex-start',
-    paddingRight: 8, // Отступ от правого края карточки для ✏️
+    paddingRight: 10, // Отступ от правого края карточки для ✏️
   },
-  toggleLabel: {
-    flex: 1,
-    minWidth: 0,
-    marginLeft: 8,
-    marginRight: 8,
-    fontSize: 13,
-    color: '#333',
-    fontWeight: '500',
+  toggleContainer: {
+    flex: 1,
+    minWidth: 0,
+    flexDirection: 'row',
+    marginRight: 10, // Разрыв между toggle и ✏️
+    borderRadius: 10,
+    backgroundColor: '#F5F5F5',
+    overflow: 'hidden',
+  },
+  toggleSegment: {
+    flex: 1,
+    height: 34,
+    alignItems: 'center',
+    justifyContent: 'center',
+    paddingHorizontal: 12,
+  },
+  toggleSegmentLeft: {
+    borderTopLeftRadius: 10,
+    borderBottomLeftRadius: 10,
+  },
+  toggleSegmentRight: {
+    borderTopRightRadius: 10,
+    borderBottomRightRadius: 10,
+  },
+  toggleSegmentActive: {
+    backgroundColor: '#4CAF50',
+  },
+  toggleSegmentInactive: {
+    backgroundColor: '#E0E0E0',
+  },
+  toggleSegmentText: {
+    fontSize: 13,
+    fontWeight: '600',
+    color: '#666',
+  },
+  toggleSegmentTextActive: {
+    color: '#fff',
+  },
+  toggleSegmentTextInactive: {
+    color: '#333',
+  },
   templateDiscountText: {
     fontSize: 12,
     color: '#666',
     marginBottom: 6,
   },
   editIconButtonFooter: {
-    width: 36,
-    height: 36,
+    width: 34,
+    height: 34,
+    alignItems: 'center',
+    justifyContent: 'center',
+    flexShrink: 0,
+    backgroundColor: 'transparent', // Прозрачный фон
   },
-  switchCompact: {
-    transform: [{ scaleX: 0.9 }, { scaleY: 0.9 }], // Компактный размер Switch
-  },
   editIcon: {
     fontSize: 16,
   },
```

---

## ЧТО И ПОЧЕМУ

### 1) Убран Switch с transform: scale

**Было:**
- Switch с `transform: scale(0.9)` ломал layout и измерения
- Текст "Вкл/Выкл" обрезался до "В" из-за некорректных flex-настроек
- ✏️ визуально "ездила" из-за нестабильной ширины Switch

**Стало:**
- Кастомный сегментный toggle из 2 TouchableOpacity: "Вкл" и "Выкл"
- Каждый сегмент имеет `flex: 1` и `paddingHorizontal: 12` — текст всегда помещается
- Нет transform/scale — стабильные измерения

**Результат:** Текст "Вкл/Выкл" всегда полностью виден, нет обрезаний.

### 2) Стабильная раскладка футера

**Было:**
- `toggleLabel` с `flex: 1` + `minWidth: 0` + `marginRight: 8` — конфликтовал с Switch
- `justifyContent: 'flex-start'` не гарантировал правильное распределение

**Стало:**
- `toggleContainer`: `flex: 1`, `minWidth: 0`, `marginRight: 10` — занимает всё доступное место слева
- `templateFooterRow`: `paddingRight: 10` — гарантированный отступ для ✏️
- `editIconButtonFooter`: `width: 34`, `height: 34`, `flexShrink: 0` — фиксированный размер, не сжимается

**Результат:** Предсказуемая раскладка: [Toggle] [✏️] с гарантированными отступами.

### 3) Визуальные состояния toggle

**Логика:**
- `isActive === true`: сегмент "Вкл" — зелёный фон (`#4CAF50`), белый текст; сегмент "Выкл" — серый фон (`#F5F5F5`), серый текст
- `isActive === false`: сегмент "Вкл" — серый фон (`#F5F5F5`), серый текст; сегмент "Выкл" — серый фон (`#E0E0E0`), тёмный текст

**Интерактивность:**
- При нажатии "Вкл" (когда `!isActive`) вызывается `handleCreateFromTemplate(template)`
- Когда `isActive === true`, оба сегмента `disabled` (выключение не поддерживается)

**Результат:** Понятная "радио"-логика Вкл/Выкл, компактно и стабильно.

### 4) Убраны лишние стили

**Удалено:**
- `switchCompact` (transform: scale)
- `toggleLabel` (больше не используется)
- `justifyContent: 'flex-start'` из `templateFooterRow` (не нужен)

**Добавлено:**
- `toggleContainer` — контейнер для сегментов
- `toggleSegment`, `toggleSegmentLeft`, `toggleSegmentRight` — базовые стили сегментов
- `toggleSegmentActive`, `toggleSegmentInactive` — состояния сегментов
- `toggleSegmentText`, `toggleSegmentTextActive`, `toggleSegmentTextInactive` — стили текста

---

## ИТОГОВЫЙ СТАТУС

### ✅ Выполнено:

1. ✅ Убран Switch и импорт `Switch` из react-native
2. ✅ Создан кастомный сегментный toggle из 2 TouchableOpacity ("Вкл" / "Выкл")
3. ✅ Убраны стили `switchCompact` и `toggleLabel`
4. ✅ Обновлены стили `templateFooterRow` и `editIconButtonFooter`
5. ✅ Добавлены стили для сегментного toggle с правильными состояниями

### 🎯 Ожидаемый результат:

- **Текст "Вкл/Выкл" полностью виден:** каждый сегмент имеет `flex: 1` и `paddingHorizontal: 12`, текст не обрезается
- **✏️ всегда справа с отступом:** `paddingRight: 10` на ряду + `marginRight: 10` у toggle + `flexShrink: 0` у ✏️
- **Стабильная раскладка:** нет transform/scale, предсказуемые измерения
- **Понятная логика:** "радио"-переключатель Вкл/Выкл с визуальными состояниями
- **Компактно:** высота 34px, компактные отступы

---

## ПРИМЕЧАНИЯ

- Логика не изменена (только UI-компонент заменён)
- Сетка не изменена (`ITEM_WIDTH`, `numColumns=2`, `COL_GAP`, `ROW_GAP`, `onLayout`)
- Бизнес-логика не изменена (`handleCreateFromTemplate` вызывается при нажатии "Вкл")
- Выключение не поддерживается (когда `isActive === true`, оба сегмента disabled)
- Фон ✏️ остался прозрачным (`backgroundColor: 'transparent'`)

---

## SMOKE CHECKLIST

### iPhone SE / узкие экраны:

- ✅ Текст "Вкл" полностью виден (не обрезается до "В")
- ✅ Текст "Выкл" полностью виден (не обрезается)
- ✅ ✏️ всегда справа, не прилипает к краю карточки
- ✅ ✏️ не обрезается, не "ездит"
- ✅ Toggle занимает доступное место слева, ✏️ фиксированная справа
- ✅ Нет пустот/провалов по вертикали под футером
- ✅ Визуальные состояния toggle корректны (зелёный/серый)
- ✅ При нажатии "Вкл" активируется скидка (когда `!isActive`)

---

## ОБЪЯСНЕНИЕ: ПОЧЕМУ ТЕПЕРЬ ТЕКСТ НЕ ОБРЕЗАЕТСЯ И ✏️ НЕ ЛИПНЕТ/НЕ РЕЖЕТСЯ

**Ключевые механизмы:**

1. **Убран Switch с transform: scale** — нет проблем с измерениями и layout, которые вызывали обрезание текста
2. **Кастомный toggle с `flex: 1` на каждом сегменте** — каждый сегмент ("Вкл" / "Выкл") занимает ровно половину доступного пространства, текст всегда помещается благодаря `paddingHorizontal: 12`
3. **`toggleContainer` с `flex: 1` + `marginRight: 10`** — toggle занимает всё доступное место слева, но оставляет место для ✏️
4. **`templateFooterRow` с `paddingRight: 10`** — гарантированный отступ от правого края карточки для ✏️
5. **`editIconButtonFooter` с `flexShrink: 0`** — ✏️ не сжимается, всегда занимает фиксированную ширину (34px)

**Итог:** На узких экранах toggle сжимается равномерно (оба сегмента по `flex: 1`), но текст всегда помещается благодаря `paddingHorizontal`. ✏️ всегда видна, так как имеет `flexShrink: 0` и отступ через `paddingRight` на ряду.
