# Перестройка футера на 3-колоночную раскладку (стабильный футер)

**Дата:** 2026-01-27  
**Файл:** `mobile/src/components/loyalty/DiscountsQuickTab.tsx`

---

## ПРОБЛЕМА

- После компактного Switch ✏️ частично обрезается/липнет к краю карточки на узких экранах
- Текущая схема `toggleRow` (flexGrow:1) + `editIcon` не гарантирует место для ✏️
- `paddingRight` в `toggleRow` уменьшает доступную ширину и ломает раскладку

---

## UNIFIED DIFF

### mobile/src/components/loyalty/DiscountsQuickTab.tsx

```diff
--- a/mobile/src/components/loyalty/DiscountsQuickTab.tsx
+++ b/mobile/src/components/loyalty/DiscountsQuickTab.tsx
@@ -263,20 +263,20 @@ export function DiscountsQuickTab({
                           })()}
                           <View style={styles.templateFooterRow}>
-                            <View style={styles.toggleRow}>
-                              <Switch
-                                value={isActive}
-                                onValueChange={(nextValue) => {
-                                  if (nextValue) {
-                                    handleCreateFromTemplate(template);
-                                  }
-                                  // Выключение не поддерживается - Switch disabled когда isActive
-                                }}
-                                disabled={isActive}
-                                style={styles.switchCompact}
-                              />
-                              <Text style={styles.toggleLabel}>
-                                {isActive ? 'Вкл' : 'Выкл'}
-                              </Text>
-                            </View>
+                            <Switch
+                              value={isActive}
+                              onValueChange={(nextValue) => {
+                                if (nextValue) {
+                                  handleCreateFromTemplate(template);
+                                }
+                                // Выключение не поддерживается - Switch disabled когда isActive
+                              }}
+                              disabled={isActive}
+                              style={styles.switchCompact}
+                            />
+                            <Text style={styles.toggleLabel} numberOfLines={1} ellipsizeMode="tail">
+                              {isActive ? 'Вкл' : 'Выкл'}
+                            </Text>
                             {showEdit && (
                               <TouchableOpacity
                                 style={styles.editIconButtonFooter}
@@ -502,11 +502,8 @@ const styles = StyleSheet.create({
   templateFooterRow: {
     flexDirection: 'row',
     alignItems: 'center',
+    justifyContent: 'flex-start',
+    paddingRight: 8, // Отступ от правого края карточки для ✏️
   },
-  toggleRow: {
-    flexDirection: 'row',
-    alignItems: 'center',
-    flexGrow: 1,
-    minWidth: 0,
-    paddingRight: 10, // Отступ между Switch и ✏️
-  },
   toggleLabel: {
+    flex: 1,
+    minWidth: 0,
+    marginLeft: 8,
+    marginRight: 8,
     fontSize: 13,
     color: '#333',
-    marginLeft: 8,
     fontWeight: '500',
   },
@@ -532,9 +529,7 @@ const styles = StyleSheet.create({
     alignItems: 'center',
     justifyContent: 'center',
     flexShrink: 0,
-    marginLeft: 8,
-    marginRight: 5, // Отступ от правого края карточки
     backgroundColor: 'transparent', // Прозрачный фон
   },
   switchCompact: {
```

---

## ЧТО И ПОЧЕМУ

### 1) Убрана вложенность toggleRow

**Было:**
- `templateFooterRow` → `toggleRow` (flexGrow: 1) → Switch + Text
- `toggleRow` имел `paddingRight: 10`, что уменьшало доступную ширину
- ✏️ была вне `toggleRow`, но из-за `flexGrow: 1` у `toggleRow` могла обрезаться

**Стало:**
- `templateFooterRow` напрямую содержит: Switch + Text + ✏️
- Убрана промежуточная вложенность `toggleRow`
- Прямая 3-колоночная раскладка: фиксированный Switch → гибкий Text → фиксированная ✏️

**Результат:** Предсказуемая раскладка без конфликтов flex-свойств.

### 2) Лейбл получил flex: 1 с ограничениями

**Было:**
- `toggleLabel` имел только `marginLeft: 8`
- Не мог сжиматься, мог "выталкивать" ✏️

**Стало:**
- `toggleLabel`: `flex: 1`, `minWidth: 0`, `marginLeft: 8`, `marginRight: 8`
- `numberOfLines={1}`, `ellipsizeMode="tail"` — текст обрезается, если не помещается

**Результат:** Лейбл занимает всё доступное пространство между Switch и ✏️, но не выталкивает ✏️ за границы.

### 3) ✏️ гарантированно видна (flexShrink: 0)

**Было:**
- `editIconButtonFooter` имел `marginLeft: 8`, `marginRight: 5`
- Могла обрезаться из-за `flexGrow: 1` у `toggleRow`

**Стало:**
- `editIconButtonFooter`: `flexShrink: 0` (уже было), убраны `marginLeft` и `marginRight`
- Отступ от края карточки через `paddingRight: 8` на `templateFooterRow`

**Результат:** ✏️ всегда видна, не обрезается, имеет отступ от правого края.

### 4) templateFooterRow получил paddingRight

**Было:**
- `templateFooterRow` без `paddingRight`
- Отступ от края был через `marginRight: 5` у ✏️

**Стало:**
- `templateFooterRow`: `justifyContent: 'flex-start'`, `paddingRight: 8`
- Отступ от края карточки гарантирован на уровне ряда

**Результат:** ✏️ всегда имеет отступ от правого края карточки, даже на узких экранах.

---

## ИТОГОВЫЙ СТАТУС

### ✅ Выполнено:

1. ✅ Убрана вложенность `toggleRow` (Switch + Text + ✏️ прямо в `templateFooterRow`)
2. ✅ `templateFooterRow`: `justifyContent: 'flex-start'`, `paddingRight: 8`
3. ✅ `toggleLabel`: `flex: 1`, `minWidth: 0`, `marginLeft: 8`, `marginRight: 8`, `numberOfLines={1}`, `ellipsizeMode="tail"`
4. ✅ `editIconButtonFooter`: убраны `marginLeft` и `marginRight`, оставлен `flexShrink: 0`
5. ✅ Удалены стили `toggleRow` (больше не используются)

### 🎯 Ожидаемый результат:

- **3-колоночная раскладка:** Switch (фиксированный) → Text (flex: 1) → ✏️ (flexShrink: 0)
- **✏️ гарантированно видна:** `flexShrink: 0` + `paddingRight: 8` на ряду
- **Лейбл не выталкивает ✏️:** `flex: 1` + `minWidth: 0` + `marginRight: 8` + `ellipsizeMode="tail"`
- **Стабильность на узких экранах:** предсказуемая раскладка без обрезаний
- **Нет пустот/смещений:** чистая 3-колоночная структура

---

## ПРИМЕЧАНИЯ

- Логика не изменена (только структура JSX и стили)
- Сетка не изменена (`ITEM_WIDTH`, `numColumns=2`, `COL_GAP`, `ROW_GAP`, `onLayout`)
- Бизнес-логика не изменена
- `switchCompact` (scale 0.9) оставлен как есть
- Фон ✏️ остался прозрачным (`backgroundColor: 'transparent'`)

---

## ОБЪЯСНЕНИЕ: ПОЧЕМУ ✏️ ГАРАНТИРОВАННО ВИДНА

**Ключевые механизмы:**

1. **`flexShrink: 0`** на `editIconButtonFooter` — ✏️ не сжимается, всегда занимает фиксированную ширину (36px)
2. **`flex: 1` + `minWidth: 0`** на `toggleLabel` — лейбл занимает всё доступное пространство, но может сжиматься до 0 (с обрезанием текста через `ellipsizeMode="tail"`)
3. **`paddingRight: 8`** на `templateFooterRow` — гарантированный отступ от правого края карточки для ✏️
4. **Убрана вложенность `toggleRow`** — нет конфликтов между `flexGrow: 1` у вложенного контейнера и `flexShrink: 0` у ✏️

**Итог:** На узких экранах лейбл сжимается и обрезается (`ellipsizeMode="tail"`), но ✏️ всегда видна, так как имеет `flexShrink: 0` и отступ через `paddingRight` на ряду.
