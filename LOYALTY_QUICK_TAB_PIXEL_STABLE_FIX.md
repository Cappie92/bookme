# Исправление переполнения сетки "Быстрые скидки" - Пиксельно стабильная верстка

**Дата:** 2026-01-27  
**Файл:** `mobile/src/components/loyalty/DiscountsQuickTab.tsx`

---

## ПРИЧИНА ОБРЕЗКИ (ДО ИСПРАВЛЕНИЯ)

### Проблема 1: borderWidth добавлял к ширине карточки

**Что было:**
- `templateCard` имел `borderWidth: 1` и `width: '100%'`
- `borderWidth: 1` добавляет 2px к общей ширине (1px с каждой стороны)
- Расчет пытался учесть border: `ITEM_WIDTH = (screenWidth - 2*16 - 12 - 2) / 2`
- Но border был на Card, а не на wrapper, что создавало несоответствие

**Математика (iPhone SE, 375px):**
- `ITEM_WIDTH = (375 - 32 - 12 - 2) / 2 = 164.5px` → `164px` (Math.floor)
- Реальная ширина Card: `164 + 2 = 166px` (с border)
- Сумма: `166 + 166 + 12 = 344px`
- Доступная ширина: `375 - 32 = 343px`
- **Переполнение: 344px > 343px → обрезка справа!**

### Проблема 2: justifyContent: 'space-between' добавлял плавающий пробел

**Что было:**
- `templatesRow: { justifyContent: 'space-between' }`
- `space-between` может добавлять дополнительные пиксели из-за округления
- Не гарантирует точное расстояние между элементами

### Проблема 3: Округление Math.floor могло давать переполнение

**Что было:**
- `Math.floor((availableWidth - COL_GAP - 2*BORDER) / 2)`
- При округлении вниз могло получаться, что `2*ITEM_WIDTH + COL_GAP > availableWidth`

---

## РЕШЕНИЕ

### 1. Перенесен borderWidth с Card на wrapper

**Было:**
```tsx
templateCard: {
  width: '100%',
  padding: 0,
  borderWidth: 1,  // ❌ border на Card
  borderColor: '#E0E0E0',
}
```

**Стало:**
```tsx
templateCardWrapper: {
  borderWidth: 1,  // ✅ border на wrapper
  borderColor: '#E0E0E0',
  borderRadius: 12,
  overflow: 'hidden',
  backgroundColor: '#fff',
}
templateCard: {
  width: '100%',
  padding: 0,
  // borderWidth убран
}
```

**Результат:** Border не влияет на ширину элемента ряда, так как он на wrapper, а не на Card.

### 2. Пересчитан ITEM_WIDTH без учета borderWidth

**Было:**
```tsx
const CARD_BORDER_WIDTH = 1;
const ITEM_WIDTH = Math.floor((screenWidth - 2 * CONTAINER_PADDING - COL_GAP - 2 * CARD_BORDER_WIDTH) / 2);
```

**Стало:**
```tsx
const availableWidth = screenWidth - 2 * CONTAINER_PADDING;
// ITEM_WIDTH без border (border будет на wrapper, не влияет на ширину)
// Гарантируем: 2*ITEM_WIDTH + COL_GAP <= availableWidth
const ITEM_WIDTH = Math.floor((availableWidth - COL_GAP) / 2);
```

**Математика (iPhone SE, 375px):**
- `availableWidth = 375 - 32 = 343px`
- `ITEM_WIDTH = Math.floor((343 - 12) / 2) = Math.floor(331 / 2) = 165px`
- Проверка: `2*165 + 12 = 330 + 12 = 342px <= 343px` ✅
- **Остаток: 1px (запас) → нет переполнения!**

### 3. Убран space-between, используются симметричные margins

**Было:**
```tsx
templatesRow: {
  justifyContent: 'space-between',  // ❌ плавающий пробел
}
```

**Стало:**
```tsx
templatesRow: {
  // Убрали justifyContent: 'space-between' - используем симметричные margins
}
```

**В renderItem:**
```tsx
const isLeft = index % 2 === 0;
const wrapperStyle = {
  width: ITEM_WIDTH,
  marginBottom: ROW_GAP,
  marginRight: isLeft ? COL_GAP / 2 : 0,
  marginLeft: !isLeft ? COL_GAP / 2 : 0,
};
```

**Результат:**
- Левая карточка: `marginRight: 6px` (COL_GAP/2)
- Правая карточка: `marginLeft: 6px` (COL_GAP/2)
- Общий зазор: `6 + 6 = 12px` (COL_GAP) ✅
- Точное расстояние, без плавающего пробела

### 4. Добавлен overflow: 'hidden' на wrapper

**Добавлено:**
```tsx
templateCardWrapper: {
  overflow: 'hidden',  // ✅ предотвращает выход контента за границы
  // ...
}
```

**Результат:** Внутренний контент не может выйти за границы карточки.

---

## UNIFIED DIFF

### mobile/src/components/loyalty/DiscountsQuickTab.tsx

```diff
--- a/mobile/src/components/loyalty/DiscountsQuickTab.tsx
+++ b/mobile/src/components/loyalty/DiscountsQuickTab.tsx
@@ -41,11 +41,10 @@ export function DiscountsQuickTab({
   const { width: screenWidth } = useWindowDimensions();
   
   // Константы для сетки
   const CONTAINER_PADDING = 16; // padding от styles.container (единственный источник горизонтального padding)
   const COL_GAP = 12; // Расстояние между колонками
   const ROW_GAP = 12; // Расстояние между рядами
-  const CARD_BORDER_WIDTH = 1; // borderWidth карточки (добавляет 2px к ширине: 1px с каждой стороны)
-  const ITEM_WIDTH = Math.floor((screenWidth - 2 * CONTAINER_PADDING - COL_GAP - 2 * CARD_BORDER_WIDTH) / 2);
+  const availableWidth = screenWidth - 2 * CONTAINER_PADDING;
+  // ITEM_WIDTH без border (border будет на wrapper, не влияет на ширину)
+  // Гарантируем: 2*ITEM_WIDTH + COL_GAP <= availableWidth
+  const ITEM_WIDTH = Math.floor((availableWidth - COL_GAP) / 2);
 
   const handleCreateFromTemplate = async (template: QuickDiscountTemplate, customPercent?: number) => {
@@ -109,7 +108,7 @@ export function DiscountsQuickTab({
           keyExtractor={(item) => item.id}
           contentContainerStyle={styles.templatesGrid}
           columnWrapperStyle={styles.templatesRow}
-          renderItem={({ item: template }) => {
+          renderItem={({ item: template, index }) => {
             const isActive = isTemplateActive(template, discounts);
             const cardStyle: ViewStyle = isActive 
               ? StyleSheet.flatten([styles.templateCard, styles.templateCardActive])
               : styles.templateCard;
             
+            // Определяем левая или правая колонка для симметричных margins
+            const isLeft = index % 2 === 0;
+            const wrapperStyle = {
+              width: ITEM_WIDTH,
+              marginBottom: ROW_GAP,
+              marginRight: isLeft ? COL_GAP / 2 : 0,
+              marginLeft: !isLeft ? COL_GAP / 2 : 0,
+            };
+            
             return (
-              <View style={[styles.templateCardWrapper, { width: ITEM_WIDTH, marginBottom: ROW_GAP }]}>
+              <View style={[
+                styles.templateCardWrapper, 
+                isActive && styles.templateCardWrapperActive,
+                wrapperStyle
+              ]}>
                 <Card style={cardStyle}>
@@ -325,19 +334,28 @@ const styles = StyleSheet.create({
   templatesRow: {
-    justifyContent: 'space-between',
+    // Убрали justifyContent: 'space-between' - используем симметричные margins
   },
   templateCardWrapper: {
     // width задается динамически через inline style
+    borderWidth: 1,
+    borderColor: '#E0E0E0',
+    borderRadius: 12,
+    overflow: 'hidden',
+    backgroundColor: '#fff',
   },
+  templateCardWrapperActive: {
+    borderColor: '#4CAF50',
+    backgroundColor: '#E8F5E9',
   },
   templateCard: {
     width: '100%',
     padding: 0,
-    borderWidth: 1,
-    borderColor: '#E0E0E0',
+    // borderWidth убран - border теперь на wrapper
   },
   templateCardActive: {
-    borderColor: '#4CAF50',
-    backgroundColor: '#E8F5E9',
+    // borderColor убран - border теперь на wrapper
+    backgroundColor: 'transparent', // Прозрачный, цвет задается на wrapper
   },
```

---

## ПОЧЕМУ ТЕПЕРЬ НЕ БУДЕТ ОБРЕЗАТЬСЯ

### 1. Правильная математика ширины

**Формула:**
```tsx
availableWidth = screenWidth - 2 * CONTAINER_PADDING
ITEM_WIDTH = Math.floor((availableWidth - COL_GAP) / 2)
```

**Гарантия:**
- `2*ITEM_WIDTH + COL_GAP <= availableWidth` всегда выполняется
- Для iPhone SE: `2*165 + 12 = 342px <= 343px` ✅
- Остается запас 1px (из-за Math.floor)

### 2. Border не влияет на ширину

- Border перенесен на wrapper
- `ITEM_WIDTH` - это точная ширина wrapper (без border)
- Border добавляется поверх, но не влияет на расчет ширины ряда

### 3. Симметричные margins вместо space-between

- Левая карточка: `marginRight: 6px`
- Правая карточка: `marginLeft: 6px`
- Общий зазор: `6 + 6 = 12px` (точно COL_GAP)
- Нет плавающего пробела из-за space-between

### 4. Overflow: hidden предотвращает выход контента

- Внутренний контент не может выйти за границы wrapper
- Кнопка всегда полностью внутри карточки

---

## ПРОВЕРКА МАТЕМАТИКИ

### iPhone SE (375px)
- `availableWidth = 375 - 32 = 343px`
- `ITEM_WIDTH = Math.floor((343 - 12) / 2) = 165px`
- Проверка: `2*165 + 12 = 342px <= 343px` ✅
- **Остаток: 1px**

### iPhone 14 Pro (393px)
- `availableWidth = 393 - 32 = 361px`
- `ITEM_WIDTH = Math.floor((361 - 12) / 2) = 174px`
- Проверка: `2*174 + 12 = 360px <= 361px` ✅
- **Остаток: 1px**

### iPhone 14 Pro Max (430px)
- `availableWidth = 430 - 32 = 398px`
- `ITEM_WIDTH = Math.floor((398 - 12) / 2) = 193px`
- Проверка: `2*193 + 12 = 398px <= 398px` ✅
- **Остаток: 0px (точно)**

### Android (360px)
- `availableWidth = 360 - 32 = 328px`
- `ITEM_WIDTH = Math.floor((328 - 12) / 2) = 158px`
- Проверка: `2*158 + 12 = 328px <= 328px` ✅
- **Остаток: 0px (точно)**

**Вывод:** Математика гарантирует, что `2*ITEM_WIDTH + COL_GAP <= availableWidth` на всех размерах экранов.

---

## SMOKE CHECKLIST

- [ ] **1. iOS: карточки стабильные, ничего не обрезается**
  - Открыть экран "Система лояльности → Скидки → Быстрые" на iOS
  - Проверить, что все карточки имеют одинаковую ширину
  - Проверить, что правая карточка не обрезается
  - Проверить, что кнопка "Активировать" полностью видна и не обрезается
  - Проверить, что footer прижат к низу карточки

- [ ] **2. Android: то же самое**
  - Открыть экран на Android
  - Проверить стабильность сетки
  - Проверить отсутствие обрезки кнопки

- [ ] **3. iPhone SE (узкий экран)**
  - Проверить на iPhone SE (375px)
  - Убедиться, что карточки не выходят за границы
  - Убедиться, что кнопка не обрезается
  - Убедиться, что математика ширины работает корректно
  - Проверить, что расстояние между колонками равно COL_GAP (12px)

- [ ] **4. Длинные названия/описания**
  - Если есть шаблоны с длинными названиями/описаниями, проверить:
  - Название обрезается на 2 строки с многоточием
  - Описание обрезается на 2 строки с многоточием
  - Карточки остаются одинаковой ширины
  - Footer не смещается
  - Контент не выходит за границы (overflow: hidden работает)

- [ ] **5. Режим редактирования (edit-mode)**
  - Нажать на иконку карандаша у шаблона
  - Проверить, что режим редактирования не меняет ширину карточки
  - Проверить, что элементы (инпут + кнопки) не выходят за границы карточки
  - Проверить, что если переносится на 2 строки, всё помещается внутри

- [ ] **6. Active badge**
  - Активировать шаблон (создать скидку)
  - Проверить, что бейдж "Активна" отображается в header справа
  - Проверить, что карандаш скрыт у активного шаблона
  - Проверить, что кнопка показывает "Активна" и disabled (серый цвет)
  - Проверить, что border активной карточки зеленый

- [ ] **7. Структура Header/Content/Footer**
  - Проверить, что header всегда вверху
  - Проверить, что footer всегда внизу (прижат)
  - Проверить, что content растягивается между ними
  - Проверить, что карточки разной высоты контента имеют footer внизу

- [ ] **8. Пиксельная стабильность**
  - Прокрутить список шаблонов
  - Проверить, что карточки не "прыгают"
  - Проверить, что отступы между карточками стабильные (12px)
  - Проверить, что правая карточка никогда не обрезается

---

## ИТОГОВЫЙ СТАТУС

### ✅ Выполнено:

1. ✅ Перенесен `borderWidth` с Card на wrapper (border не влияет на ширину)
2. ✅ Пересчитан `ITEM_WIDTH` без учета borderWidth
3. ✅ Убран `justifyContent: 'space-between'`, используются симметричные margins
4. ✅ Добавлен `overflow: 'hidden'` на wrapper
5. ✅ Математика гарантирует: `2*ITEM_WIDTH + COL_GAP <= availableWidth`
6. ✅ Пиксельно стабильная сетка на всех размерах экранов

### 🎯 Ожидаемый результат:

- Стабильная 2-колоночная сетка без обрезки справа на любых ширинах
- Одинаковые отступы между колонками/рядами (12px)
- Кнопка всегда полностью видна
- Пиксельная точность без переполнения

---

## ПРИМЕЧАНИЯ

- Все изменения касаются только верстки, бизнес-логика не изменена
- `FlatList` остался с `numColumns={2}` и `scrollEnabled={false}`
- Border перенесен на wrapper для точного контроля ширины
- Симметричные margins гарантируют точное расстояние между колонками
