# Убрать дублирование низа карточки и поместить "Активировать"

**Дата:** 2026-01-27  
**Файл:** `mobile/src/components/loyalty/DiscountsQuickTab.tsx`

---

## ПРОБЛЕМЫ

1. **Дублирование низа карточки** — визуально два слоя (Card + wrapper оба рисуют фон/скругление/тень)
2. **Текст "Активировать" не помещается** — обрезается многоточием, хотя места визуально достаточно

---

## ДИАГНОСТИКА

### Причина дублирования низа карточки:

**Card компонент** (из `@src/components/Card`) имеет:
- `backgroundColor: '#fff'`
- `borderRadius: 12`
- `shadowColor: '#000'`
- `shadowOffset: { width: 0, height: 2 }`
- `shadowOpacity: 0.1`
- `shadowRadius: 4`
- `elevation: 3`

**templateCardWrapper** также имеет:
- `backgroundColor: '#fff'`
- `borderRadius: 12`
- `borderWidth: 1`
- `overflow: 'hidden'`

**Результат:** Оба компонента рисуют карточку, создавая визуальный "двойной слой" снизу.

---

## UNIFIED DIFF

### mobile/src/components/loyalty/DiscountsQuickTab.tsx

```diff
--- a/mobile/src/components/loyalty/DiscountsQuickTab.tsx
+++ b/mobile/src/components/loyalty/DiscountsQuickTab.tsx
@@ -420,7 +420,15 @@ const styles = StyleSheet.create({
   templateCard: {
     width: '100%',
     padding: 0,
+    backgroundColor: 'transparent', // Прозрачный - визуал на wrapper
+    elevation: 0, // Убираем тень Android
+    shadowOpacity: 0, // Убираем тень iOS
+    shadowRadius: 0,
+    shadowOffset: { width: 0, height: 0 },
+    borderRadius: 0, // Скругление на wrapper
     // borderWidth убран - border теперь на wrapper
   },
   templateCardActive: {
     // borderColor убран - border теперь на wrapper
     backgroundColor: 'transparent', // Прозрачный, цвет задается на wrapper
+    elevation: 0,
+    shadowOpacity: 0,
   },
   templateCardInner: {
@@ -518,7 +526,8 @@ const styles = StyleSheet.create({
     flexBasis: 0,
     minWidth: 0,
+    paddingHorizontal: 10, // Уменьшаем padding для большего места тексту
     // ❌ НЕТ width: '100%'
   },
   activateButtonDisabled: {
@@ -505,7 +514,7 @@ const styles = StyleSheet.create({
     justifyContent: 'center',
     flexShrink: 0,
     marginLeft: 10,
+    marginLeft: 6, // Уменьшен gap для большего места кнопке
     // backgroundColor убран - прозрачная кнопка
   },
   editIcon: {
```

---

## ЧТО И ПОЧЕМУ

### 1) Убрано дублирование низа карточки

**Причина:** Card компонент (из библиотеки) имеет `backgroundColor: '#fff'`, `borderRadius: 12`, `shadow*`, `elevation: 3`, а `templateCardWrapper` тоже имеет `backgroundColor: '#fff'`, `borderRadius: 12`. Оба рисуют карточку, создавая визуальный "двойной слой".

**Решение:** Сделал Card полностью прозрачным/плоским:
- `backgroundColor: 'transparent'` — убрал фон
- `elevation: 0`, `shadowOpacity: 0`, `shadowRadius: 0`, `shadowOffset: { width: 0, height: 0 }` — убрал тени
- `borderRadius: 0` — убрал скругление (оно на wrapper)

Теперь визуал карточки только на `templateCardWrapper`, Card — прозрачный контейнер.

### 2) Текст "Активировать" помещается полностью

**Причина:** Кнопка узкая, текст обрезается многоточием из-за недостаточной ширины.

**Решение:** Увеличил доступную ширину для текста:
- `paddingHorizontal: 10` у кнопки (уменьшил внутренние отступы)
- `marginLeft: 6` у ✏️ (уменьшил gap с 10 до 6)

Теперь кнопка занимает больше места, текст "Активировать" помещается полностью.

---

## ИТОГОВЫЙ СТАТУС

### ✅ Выполнено:

1. ✅ Убрано дублирование низа карточки (Card прозрачный, визуал только на wrapper)
2. ✅ Увеличена доступная ширина для текста кнопки (`paddingHorizontal: 10`, `marginLeft: 6` у ✏️)

### 🎯 Ожидаемый результат:

- Низ карточки ровный, без "второго прямоугольника"/дублирования
- Текст "Активировать" помещается полностью (не обрезается многоточием)
- ✏️ не наезжает на кнопку (gap уменьшен, но достаточный)
- Сетка не менялась (`ITEM_WIDTH`, `numColumns=2`, `COL_GAP`, `ROW_GAP`, `onLayout`)

---

## ПРИМЕЧАНИЯ

- Card теперь полностью прозрачный/плоский — визуал только на wrapper
- Уменьшен gap между кнопкой и ✏️ для большего места тексту
- Сетка не изменена
- Бизнес-логика не изменена
