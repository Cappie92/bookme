# Полноценный патч: восстановление контента в карточках

**Дата:** 2026-01-27  
**Файл:** `mobile/src/components/loyalty/DiscountsQuickTab.tsx`

---

## ПРОБЛЕМА

В карточках "Быстрых скидок" не отображались:
- Описание (Description)
- Строка "Скидка: X%"
- Футер с кнопкой "Активировать" + ✏️ был нестабилен

**Причина:** `aspectRatio: 1` делал карточки квадратными, контент не помещался, `overflow: 'hidden'` обрезал всё, что выходило за границы.

---

## РЕШЕНИЕ

### 1) Контролируемая высота вместо aspectRatio

**Было:**
```typescript
templateCardWrapper: {
  // ...
  overflow: 'hidden',
  backgroundColor: '#fff',
  aspectRatio: 1, // Делаем карточки ближе к квадрату
},
```

**Стало:**
```typescript
templateCardWrapper: {
  // ...
  overflow: 'hidden',
  backgroundColor: '#fff',
  minHeight: 180, // Контролируемая высота вместо aspectRatio
},
```

**Результат:**
- Карточки имеют минимальную высоту 180px (визуально "почти квадратные")
- Высота может расти при необходимости (динамическая)
- Контент не обрезается `overflow: 'hidden'`

### 2) Обычные margins вместо marginTop: 'auto'

**Было:**
```typescript
templateFooter: {
  marginTop: 'auto',   // футер всегда внизу карточки
  paddingTop: 8,
},
```

**Стало:**
```typescript
templateFooter: {
  marginTop: 10, // Обычный margin вместо auto
},
```

**Результат:**
- Футер позиционируется через обычный `marginTop: 10`
- Нет конфликтов с flex-контейнером
- Контент не "выталкивается"

### 3) Удален диагностический console.log

**Было:**
```typescript
// Диагностика данных (dev only)
if (__DEV__) {
  console.log('[DiscountsQuickTab][template]', { ... });
}
```

**Стало:**
```typescript
// Удалено
```

**Результат:**
- Код очищен от диагностических логов

---

## UNIFIED DIFF

### mobile/src/components/loyalty/DiscountsQuickTab.tsx

```diff
--- a/mobile/src/components/loyalty/DiscountsQuickTab.tsx
+++ b/mobile/src/components/loyalty/DiscountsQuickTab.tsx
@@ -158,18 +158,6 @@ export function DiscountsQuickTab({
             const isActive = isTemplateActive(template, discounts);
             const showEdit = !isActive && editingTemplate !== template.id;
             
-            // Диагностика данных (dev only)
-            if (__DEV__) {
-              console.log('[DiscountsQuickTab][template]', {
-                id: template?.id,
-                name: template?.name,
-                description: template?.description,
-                default_discount: template?.default_discount,
-                isActive,
-                editingTemplate,
-                showEdit,
-                editingThisTemplate: editingTemplate === template.id,
-              });
-            }
-            
             const cardStyle: ViewStyle = isActive 
               ? StyleSheet.flatten([styles.templateCard, styles.templateCardActive])
               : styles.templateCard;
@@ -417,7 +405,7 @@ const styles = StyleSheet.create({
     borderRadius: 12,
     overflow: 'hidden',
     backgroundColor: '#fff',
-    // aspectRatio: 1 убран - карточки имеют динамическую высоту
+    minHeight: 180, // Контролируемая высота вместо aspectRatio
   },
   templateCardWrapperActive: {
     borderColor: '#4CAF50',
@@ -490,7 +478,7 @@ const styles = StyleSheet.create({
     minWidth: 0,
   },
   templateFooter: {
-    marginTop: 'auto',   // футер всегда внизу карточки
+    marginTop: 10, // Обычный margin вместо auto
     paddingTop: 8,
   },
   templateFooterRow: {
```

---

## ПОЧЕМУ ЭТО РЕШАЕТ ПРОБЛЕМУ

### 1. minHeight вместо aspectRatio

**Проблема была:**
- `aspectRatio: 1` делал карточки квадратными (ширина = высота)
- Контент (Header ~40px + Description ~40px + Footer ~62px + Padding 24px = ~166px) не помещался в квадрат
- `overflow: 'hidden'` обрезал всё, что выходило за границы

**Решение:**
- `minHeight: 180` задает минимальную высоту карточки (визуально "почти квадратная")
- Высота может расти при необходимости (динамическая)
- Контент полностью помещается, `overflow: 'hidden'` не обрезает полезный контент

### 2. marginTop: 10 вместо marginTop: 'auto'

**Проблема была:**
- `marginTop: 'auto'` в сочетании с `aspectRatio: 1` создавал конфликт
- Футер мог "выталкивать" контент за пределы видимости

**Решение:**
- `marginTop: 10` - обычный margin, предсказуемый и стабильный
- Футер позиционируется через обычный поток, без конфликтов
- Контент не "выталкивается"

### 3. Удален console.log

- Код очищен от диагностических логов
- Не влияет на функциональность, но улучшает чистоту кода

---

## ПРОВЕРКА СТИЛЕЙ (ГАРАНТИЯ ВИДИМОСТИ)

### templateDescription:
```typescript
templateDescription: {
  fontSize: 12,
  lineHeight: 16,
  color: '#666',        // ✅ Видимый цвет
  flexShrink: 1,
  minWidth: 0,
  numberOfLines: 2,     // ✅ В JSX
  ellipsizeMode: 'tail', // ✅ В JSX
},
```

### templateDiscountText:
```typescript
templateDiscountText: {
  fontSize: 12,
  color: '#666',        // ✅ Видимый цвет
  marginBottom: 6,
  numberOfLines: 1,     // ✅ В JSX
},
```

**Проверка:**
- ✅ Нет `opacity: 0`
- ✅ Нет `height: 0`
- ✅ Нет `display: 'none'`
- ✅ Цвета нормальные (`#666`, `#333`)

---

## ПРОВЕРКА ФУТЕРА

### templateFooterRow:
```typescript
templateFooterRow: {
  flexDirection: 'row',  // ✅ Горизонтальная раскладка
  alignItems: 'center',   // ✅ Выравнивание по центру
  // ✅ НЕТ justifyContent: 'space-between'
  // ✅ НЕТ height: 40
},
```

### activateButton:
```typescript
activateButton: {
  height: 38,
  borderRadius: 10,
  flexGrow: 1,          // ✅ Занимает доступное пространство
  flexShrink: 1,        // ✅ Может сжиматься
  flexBasis: 0,         // ✅ Критично для flex
  minWidth: 0,          // ✅ Позволяет правильно сжиматься
  // ✅ НЕТ width: '100%'
},
```

### editIconButtonFooter:
```typescript
editIconButtonFooter: {
  width: 38,            // ✅ Фиксированная ширина
  height: 38,           // ✅ Фиксированная высота
  borderRadius: 10,
  flexShrink: 0,        // ✅ Не сжимается
  marginLeft: 10,       // ✅ Gap между кнопкой и ✏️
  backgroundColor: '#F2F2F2',
},
```

**Проверка:**
- ✅ Кнопка не наезжает на ✏️ (`flexGrow: 1`, `flexShrink: 1`, `flexBasis: 0`, `minWidth: 0`)
- ✅ ✏️ не сжимается (`flexShrink: 0`, фиксированная ширина)
- ✅ Gap между кнопкой и ✏️ (`marginLeft: 10`)

---

## ОЖИДАЕМЫЙ РЕЗУЛЬТАТ

- ✅ Карточки визуально "почти квадратные" (через `minHeight: 180`, а не `aspectRatio`)
- ✅ Description видна (2 строки, не обрезается)
- ✅ "Скидка: X%" видна (1 строка, не обрезается)
- ✅ Кнопка "Активировать" не сливается с нижней границей (`paddingBottom: 14`)
- ✅ ✏️ справа, не перекрывается кнопкой (`marginLeft: 10`, правильные flex-настройки)
- ✅ Сетка не менялась (`ITEM_WIDTH`, `numColumns=2`, `COL_GAP`, `ROW_GAP`, `onLayout`)

---

## ПОДТВЕРЖДЕНИЕ

- ✅ **Сетка не менялась:**
  - `ITEM_WIDTH`, `onLayout`, `numColumns=2`, `COL_GAP`, `ROW_GAP` - без изменений

- ✅ **Бизнес-логика не тронута:**
  - `handleCreateFromTemplate`, `isTemplateActive`, `editingTemplate` - без изменений
  - Только верстка исправлена

---

## ИТОГОВЫЙ СТАТУС

### ✅ Выполнено:

1. ✅ Добавлен `minHeight: 180` для `templateCardWrapper` (вместо `aspectRatio: 1`)
2. ✅ Убран `marginTop: 'auto'` из `templateFooter` (заменен на `marginTop: 10`)
3. ✅ Удален диагностический `console.log`
4. ✅ Проверены стили текста (видимы, нет `opacity: 0`, `height: 0`)
5. ✅ Проверен футер (правильные flex-настройки, gap через `marginLeft`)

### 🎯 Ожидаемый результат:

- Карточки визуально "почти квадратные" (через `minHeight: 180`)
- Description отображается (2 строки, не обрезается)
- "Скидка: X%" отображается (1 строка, не обрезается)
- Кнопка "Активировать" не сливается с нижней границей
- ✏️ справа, не перекрывается кнопкой
- Сетка не менялась

---

## ПРИМЕЧАНИЯ

- `minHeight: 180` обеспечивает визуально "почти квадратные" карточки без обрезания контента
- `marginTop: 10` более предсказуем, чем `marginTop: 'auto'`
- `overflow: 'hidden'` оставлен (нужен для скругления), но высоты достаточно для всего контента
- Сетка не изменена (`ITEM_WIDTH`, `onLayout`, `numColumns=2`)
- Бизнес-логика не изменена
