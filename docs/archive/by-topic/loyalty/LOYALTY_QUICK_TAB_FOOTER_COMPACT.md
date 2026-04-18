# Финальная донастройка футера карточек (Switch компактнее, отступы)

**Дата:** 2026-01-27  
**Файл:** `mobile/src/components/loyalty/DiscountsQuickTab.tsx`

---

## ПРОБЛЕМА

- Switch визуально слишком крупный и занимает много горизонтального места
- Из-за этого ✏️ почти прилипает к правому краю карточки
- Нужны визуальные правки для баланса футера

---

## UNIFIED DIFF

### mobile/src/components/loyalty/DiscountsQuickTab.tsx

```diff
--- a/mobile/src/components/loyalty/DiscountsQuickTab.tsx
+++ b/mobile/src/components/loyalty/DiscountsQuickTab.tsx
@@ -264,6 +264,7 @@ export function DiscountsQuickTab({
                               <Switch
                                 value={isActive}
                                 onValueChange={(nextValue) => {
                                   if (nextValue) {
                                     handleCreateFromTemplate(template);
                                   }
                                   // Выключение не поддерживается - Switch disabled когда isActive
                                 }}
                                 disabled={isActive}
+                                style={styles.switchCompact}
                               />
                               <Text style={styles.toggleLabel}>
                                 {isActive ? 'Вкл' : 'Выкл'}
                               </Text>
@@ -505,6 +506,7 @@ const styles = StyleSheet.create({
   toggleRow: {
     flexDirection: 'row',
     alignItems: 'center',
     flexGrow: 1,
     minWidth: 0,
+    paddingRight: 10, // Отступ между Switch и ✏️
   },
   toggleLabel: {
     fontSize: 13,
@@ -530,6 +532,10 @@ const styles = StyleSheet.create({
     alignItems: 'center',
     justifyContent: 'center',
     flexShrink: 0,
     marginLeft: 8,
+    marginRight: 5, // Отступ от правого края карточки
     backgroundColor: 'transparent', // Прозрачный фон
   },
+  switchCompact: {
+    transform: [{ scaleX: 0.9 }, { scaleY: 0.9 }], // Компактный размер Switch
+  },
   editIcon: {
     fontSize: 16,
   },
```

---

## ЧТО И ПОЧЕМУ

### 1) Switch стал компактнее

**Было:**
- Switch стандартного размера, занимал много места

**Стало:**
- Добавлен стиль `switchCompact` с `transform: [{ scaleX: 0.9 }, { scaleY: 0.9 }]`
- Switch уменьшен до 90% от стандартного размера
- Визуально более аккуратный и занимает меньше места

**Результат:** Switch компактнее, освобождается горизонтальное пространство.

### 2) Добавлены отступы для баланса

**Было:**
- ✏️ почти прилипала к правому краю карточки
- Не было визуального разделения между Switch и ✏️

**Стало:**
- `toggleRow.paddingRight: 10` — отступ между Switch+текстом и ✏️
- `editIconButtonFooter.marginRight: 5` — отступ от правого края карточки

**Результат:** Визуально сбалансированный футер: Switch + текст → воздух → ✏️ → воздух → край карточки.

---

## ИТОГОВЫЙ СТАТУС

### ✅ Выполнено:

1. ✅ Switch уменьшен до 90% через `transform: scale`
2. ✅ Добавлен `paddingRight: 10` в `toggleRow` (отступ между Switch и ✏️)
3. ✅ Добавлен `marginRight: 5` у `editIconButtonFooter` (отступ от края карточки)
4. ✅ Создан стиль `switchCompact` для компактного Switch

### 🎯 Ожидаемый результат:

- Switch выглядит компактно и аккуратно (90% размера)
- ✏️ больше не прижата к правому краю карточки (есть отступ 5px)
- Между Switch и ✏️ есть визуальный зазор (10px paddingRight)
- Футер визуально сбалансирован
- Нет пустот, дублирования, обрезаний
- UX финальный и "чистый"

---

## ПРИМЕЧАНИЯ

- Логика не изменена (только визуальные правки)
- Сетка не изменена (`ITEM_WIDTH`, `numColumns=2`, `COL_GAP`, `ROW_GAP`, `onLayout`)
- Бизнес-логика не изменена
- Фон ✏️ остался прозрачным (`backgroundColor: 'transparent'`)
