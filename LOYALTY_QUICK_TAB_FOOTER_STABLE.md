# Рефакторинг футера: стабильная схема с нижним воздухом

**Дата:** 2026-01-27  
**Файл:** `mobile/src/components/loyalty/DiscountsQuickTab.tsx`

---

## ПРОБЛЕМА

- Кнопка "Активировать" прижата к нижней границе карточки и визуально режется/сливается с рамкой
- ✏️ рядом с кнопкой выглядит так, будто "наезжает" на неё
- Нужен стабильный футер: нормальный нижний воздух, кнопка и ✏️ в одной строке без пересечений

---

## ИЗМЕНЕНИЯ

### 1) templateCardInner

**Было:**
```typescript
templateCardInner: {
  flex: 1,
  padding: 10,
  paddingBottom: 14,
  justifyContent: 'space-between',  // ← управление вертикалью
},
```

**Стало:**
```typescript
templateCardInner: {
  flex: 1,
  padding: 10,
  paddingBottom: 12,  // ← отдельный paddingBottom
  // justifyContent убран
},
```

**Результат:**
- Убрано управление вертикалью через `justifyContent: 'space-between'`
- Контентный блок растёт, футер опускается вниз через `marginTop: 'auto'` (см. п.2)
- `paddingBottom: 12` создаёт нижний воздух

### 2) templateFooter

**Было:**
```typescript
templateFooter: {
  marginTop: 8,
},
```

**Стало:**
```typescript
templateFooter: {
  marginTop: 'auto',  // ← футер всегда внизу
  paddingTop: 8,     // ← отделяет от "Скидка: X%"
},
```

**Результат:**
- `marginTop: 'auto'` опускает футер вниз с учётом `paddingBottom` templateCardInner
- `paddingTop: 8` отделяет от текста "Скидка: X%"
- Футер не абсолютный, работает через flex

### 3) templateFooterRow

**Было:**
```typescript
templateFooterRow: {
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'space-between',  // ← gap через space-between
  marginTop: 8,
},
```

**Стало:**
```typescript
templateFooterRow: {
  flexDirection: 'row',
  alignItems: 'center',
  height: 40,        // ← стабильная высота ряда
  marginTop: 8,
  // justifyContent убран, gap через marginRight у кнопки
},
```

**Результат:**
- `height: 40` обеспечивает стабильную высоту ряда
- `justifyContent: 'space-between'` убран, gap через `marginRight` у кнопки
- `marginTop: 8` отделяет от текста "Скидка: X%"

### 4) activateButton

**Было:**
```typescript
activateButton: {
  backgroundColor: '#4CAF50',
  height: 38,
  borderRadius: 8,
  alignItems: 'center',
  justifyContent: 'center',
  flex: 1,        // ← не оптимально
  minWidth: 0,
  // width: '100%' не было, но нужно убедиться
},
```

**Стало:**
```typescript
activateButton: {
  backgroundColor: '#4CAF50',
  height: 38,
  borderRadius: 10,      // ← совпадает с ✏️
  alignItems: 'center',
  justifyContent: 'center',
  flexGrow: 1,          // ← занимает всё доступное пространство
  flexShrink: 1,        // ← может сжиматься
  flexBasis: 0,         // ← критично для правильной работы flex
  minWidth: 0,          // ← позволяет правильно сжиматься
  marginRight: 10,      // ← gap между кнопкой и ✏️
  // width: '100%' НЕТ
},
```

**Результат:**
- `flexGrow: 1`, `flexShrink: 1`, `flexBasis: 0` обеспечивают правильную работу flex
- `marginRight: 10` создаёт gap между кнопкой и ✏️
- `borderRadius: 10` совпадает с ✏️ для визуальной согласованности
- Нет `width: '100%'`, кнопка не залезает на ✏️

**Текст кнопки:**
- `numberOfLines={1}` ✅
- `ellipsizeMode="tail"` (неявно, через numberOfLines)
- `fontSize: 13` ✅

### 5) editIconButtonFooter

**Было:**
```typescript
editIconButton: {
  width: 40,
  height: 38,
  alignItems: 'center',
  justifyContent: 'center',
  marginLeft: 10,
  flexShrink: 0,
},
```

**Стало:**
```typescript
editIconButtonFooter: {
  width: 38,              // ← фиксированная ширина
  height: 38,             // ← совпадает с кнопкой
  borderRadius: 10,      // ← совпадает с кнопкой
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,         // ← не сжимается
  backgroundColor: '#F2F2F2',  // ← чтобы не "висела в воздухе"
},
```

**Результат:**
- Фиксированная ширина и высота обеспечивают стабильность
- `borderRadius: 10` совпадает с кнопкой для визуальной согласованности
- `backgroundColor: '#F2F2F2'` делает ✏️ более заметной
- `flexShrink: 0` гарантирует, что ✏️ не сжимается

---

## UNIFIED DIFF

### mobile/src/components/loyalty/DiscountsQuickTab.tsx

```diff
--- a/mobile/src/components/loyalty/DiscountsQuickTab.tsx
+++ b/mobile/src/components/loyalty/DiscountsQuickTab.tsx
@@ -258,7 +258,7 @@ export function DiscountsQuickTab({
                             {showEdit && (
                               <TouchableOpacity
-                                style={styles.editIconButton}
+                                style={styles.editIconButtonFooter}
                                 onPress={() => {
                                   setEditingTemplate(template.id);
                                   setEditTemplateValue(template.default_discount.toString());
@@ -415,8 +415,7 @@ const styles = StyleSheet.create({
   templateCardInner: {
     flex: 1,
     padding: 10,
-    paddingBottom: 14,
-    justifyContent: 'space-between',
+    paddingBottom: 12,
   },
   templateHeader: {
     marginBottom: 8,
@@ -471,12 +470,15 @@ const styles = StyleSheet.create({
   templateFooter: {
-    marginTop: 8,
+    marginTop: 'auto',
+    paddingTop: 8,
   },
   templateFooterRow: {
     flexDirection: 'row',
     alignItems: 'center',
-    justifyContent: 'space-between',
+    height: 40,
     marginTop: 8,
   },
   templateDiscountText: {
     fontSize: 12,
     color: '#666',
     marginBottom: 4,
   },
   editIconButton: {
     width: 40,
     height: 38,
     alignItems: 'center',
     justifyContent: 'center',
     marginLeft: 10,
     flexShrink: 0,
   },
+  editIconButtonFooter: {
+    width: 38,
+    height: 38,
+    borderRadius: 10,
+    alignItems: 'center',
+    justifyContent: 'center',
+    flexShrink: 0,
+    backgroundColor: '#F2F2F2',
+  },
   editIcon: {
     fontSize: 16,
   },
   activateButton: {
     backgroundColor: '#4CAF50',
     height: 38,
-    borderRadius: 8,
+    borderRadius: 10,
     alignItems: 'center',
     justifyContent: 'center',
-    flex: 1,
+    flexGrow: 1,
+    flexShrink: 1,
+    flexBasis: 0,
     minWidth: 0,
+    marginRight: 10,
   },
   activateButtonDisabled: {
     backgroundColor: '#E0E0E0',
```

---

## ОБЪЯСНЕНИЕ ИЗМЕНЕНИЙ

### 1. templateCardInner

**Изменения:**
- Убрано `justifyContent: 'space-between'` (управление вертикалью)
- Изменено `paddingBottom: 14` → `12`

**Почему:**
- `justifyContent: 'space-between'` создавало проблемы с вертикальным распределением
- Теперь контентный блок растёт, футер опускается вниз через `marginTop: 'auto'`
- `paddingBottom: 12` создаёт нижний воздух под кнопкой

### 2. templateFooter

**Изменения:**
- Добавлено `marginTop: 'auto'` (футер всегда внизу)
- Добавлено `paddingTop: 8` (отделяет от "Скидка: X%")

**Почему:**
- `marginTop: 'auto'` опускает футер вниз с учётом `paddingBottom` templateCardInner
- `paddingTop: 8` создаёт визуальное разделение между текстом "Скидка: X%" и кнопкой
- Футер не абсолютный, работает через flex

### 3. templateFooterRow

**Изменения:**
- Добавлено `height: 40` (стабильная высота ряда)
- Убрано `justifyContent: 'space-between'` (gap через marginRight у кнопки)

**Почему:**
- `height: 40` обеспечивает стабильную высоту ряда (кнопка 38 + небольшой запас)
- `justifyContent: 'space-between'` убран, gap создаётся через `marginRight: 10` у кнопки
- Это более предсказуемо и стабильно

### 4. activateButton

**Изменения:**
- Изменено `flex: 1` → `flexGrow: 1`, `flexShrink: 1`, `flexBasis: 0`
- Добавлено `marginRight: 10` (gap между кнопкой и ✏️)
- Изменено `borderRadius: 8` → `10` (совпадает с ✏️)
- Убедились, что нет `width: '100%'`

**Почему:**
- `flexGrow: 1`, `flexShrink: 1`, `flexBasis: 0` обеспечивают правильную работу flex
- `flexBasis: 0` критично для того, чтобы кнопка занимала всё доступное пространство, но не ломала ряд
- `marginRight: 10` создаёт gap между кнопкой и ✏️ (вместо gap в row)
- `borderRadius: 10` совпадает с ✏️ для визуальной согласованности
- Нет `width: '100%'`, кнопка не залезает на ✏️

### 5. editIconButtonFooter

**Изменения:**
- Создан новый стиль `editIconButtonFooter` (отдельно от `editIconButton`)
- `width: 38`, `height: 38` (фиксированные размеры)
- `borderRadius: 10` (совпадает с кнопкой)
- `backgroundColor: '#F2F2F2'` (чтобы не "висела в воздухе")
- `flexShrink: 0` (не сжимается)

**Почему:**
- Фиксированная ширина и высота обеспечивают стабильность
- `borderRadius: 10` совпадает с кнопкой для визуальной согласованности
- `backgroundColor: '#F2F2F2'` делает ✏️ более заметной и не "висящей в воздухе"
- `flexShrink: 0` гарантирует, что ✏️ не сжимается

---

## SMOKE CHECKLIST

- [ ] **1. Кнопка не касается нижней рамки**
  - Открыть экран "Система лояльности → Скидки → Быстрые"
  - Проверить, что кнопка "Активировать" не касается нижней рамки карточки
  - Проверить, что есть визуальный отступ снизу (paddingBottom: 12)

- [ ] **2. ✏️ не наезжает на кнопку**
  - Проверить, что ✏️ находится справа от кнопки
  - Проверить, что между кнопкой и ✏️ есть gap (marginRight: 10)
  - Проверить, что ✏️ не перекрывается кнопкой

- [ ] **3. Футер стабильный**
  - Проверить, что кнопка и ✏️ в одной строке
  - Проверить, что ряд имеет стабильную высоту (height: 40)
  - Проверить, что футер всегда внизу (marginTop: 'auto')

- [ ] **4. На узких экранах**
  - Проверить на iPhone SE / узких экранах
  - Проверить, что кнопка не режется по радиусу (overflow hidden не обрезает контент)
  - Проверить, что текст кнопки правильно обрезается с многоточием

---

## ИТОГОВЫЙ СТАТУС

### ✅ Выполнено:

1. ✅ `templateCardInner`: убрано `justifyContent: 'space-between'`, `paddingBottom: 12`
2. ✅ `templateFooter`: добавлено `marginTop: 'auto'`, `paddingTop: 8`
3. ✅ `templateFooterRow`: добавлено `height: 40`, убрано `justifyContent: 'space-between'`
4. ✅ `activateButton`: `flexGrow: 1`, `flexShrink: 1`, `flexBasis: 0`, `marginRight: 10`, `borderRadius: 10`, нет `width: '100%'`
5. ✅ `editIconButtonFooter`: `width: 38`, `height: 38`, `borderRadius: 10`, `backgroundColor: '#F2F2F2'`, `flexShrink: 0`

### 🎯 Ожидаемый результат:

- Кнопка не касается нижней рамки (есть нижний воздух через paddingBottom: 12)
- ✏️ не наезжает на кнопку (gap через marginRight: 10)
- Футер стабильный (height: 40, marginTop: 'auto')
- На узких экранах всё работает корректно

---

## ПРИМЕЧАНИЯ

- `marginTop: 'auto'` опускает футер вниз с учётом `paddingBottom` templateCardInner
- `flexBasis: 0` критично для правильной работы flex в кнопке
- `borderRadius: 10` совпадает у кнопки и ✏️ для визуальной согласованности
- `backgroundColor: '#F2F2F2'` у ✏️ делает её более заметной
- Бизнес-логика не изменена
