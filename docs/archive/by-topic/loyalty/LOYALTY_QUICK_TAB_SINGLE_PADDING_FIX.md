# Исправление двойного padding в сетке "Быстрые скидки"

**Дата:** 2026-01-27  
**Файл:** `mobile/src/components/loyalty/DiscountsQuickTab.tsx`

---

## ПРИЧИНА РЕГРЕССИИ

### Что было не так:

**Двойной padding** - плохой подход, который был применен в предыдущем исправлении:
- `styles.container` имеет `padding: 16` (дает горизонтальный padding 16px с каждой стороны)
- `contentContainerStyle` FlatList добавлял `paddingHorizontal: GRID_PADDING` (еще 16px с каждой стороны)
- В расчете `ITEM_WIDTH` учитывались оба padding: `TOTAL_H_PADDING = CONTAINER_PADDING + GRID_PADDING = 32px`

**Проблемы этого подхода:**
1. **Неявность:** Неочевидно, что padding применяется дважды
2. **Хрупкость:** Если изменить padding в одном месте, нужно помнить изменить расчет
3. **Путаница:** Два источника padding создают путаницу при отладке
4. **Неправильная архитектура:** Padding должен быть в одном месте

### Почему теперь стабильнее:

1. **Один источник правды:** Только `styles.container` с `padding: 16` задает горизонтальный padding
2. **Простая математика:** `ITEM_WIDTH = (screenWidth - 2*16 - 12) / 2` - понятно и очевидно
3. **Легко поддерживать:** Если нужно изменить padding, меняем только в одном месте
4. **Предсказуемость:** Нет скрытых зависимостей между разными padding

---

## UNIFIED DIFF

### mobile/src/components/loyalty/DiscountsQuickTab.tsx

```diff
--- a/mobile/src/components/loyalty/DiscountsQuickTab.tsx
+++ b/mobile/src/components/loyalty/DiscountsQuickTab.tsx
@@ -39,11 +39,9 @@ export function DiscountsQuickTab({
   const { width: screenWidth } = useWindowDimensions();
   
   // Константы для сетки
-  // Учитываем padding контейнера (16px) + paddingHorizontal templatesGrid (16px) = 32px с каждой стороны
-  const CONTAINER_PADDING = 16; // padding от styles.container
-  const GRID_PADDING = 16; // paddingHorizontal от templatesGrid
-  const TOTAL_H_PADDING = CONTAINER_PADDING + GRID_PADDING; // Итого 32px с каждой стороны
+  const CONTAINER_PADDING = 16; // padding от styles.container (единственный источник горизонтального padding)
   const COL_GAP = 12; // Расстояние между колонками
   const ROW_GAP = 12; // Расстояние между рядами
-  const ITEM_WIDTH = Math.floor((screenWidth - 2 * TOTAL_H_PADDING - COL_GAP) / 2);
+  const ITEM_WIDTH = Math.floor((screenWidth - 2 * CONTAINER_PADDING - COL_GAP) / 2);
 
   const handleCreateFromTemplate = async (template: QuickDiscountTemplate, customPercent?: number) => {
@@ -108,7 +106,7 @@ export function DiscountsQuickTab({
           data={templates}
           numColumns={2}
           keyExtractor={(item) => item.id}
-          contentContainerStyle={[styles.templatesGrid, { paddingHorizontal: GRID_PADDING }]}
+          contentContainerStyle={styles.templatesGrid}
           columnWrapperStyle={styles.templatesRow}
           renderItem={({ item: template }) => {
             const isActive = isTemplateActive(template, discounts);
-            
+            const cardStyle: ViewStyle = isActive 
+              ? StyleSheet.flatten([styles.templateCard, styles.templateCardActive])
+              : styles.templateCard;
+            
             return (
               <View style={[styles.templateCardWrapper, { width: ITEM_WIDTH, marginBottom: ROW_GAP }]}>
-                <Card style={isActive ? [styles.templateCard, styles.templateCardActive] as ViewStyle : styles.templateCard}>
+                <Card style={cardStyle}>
```

---

## ЧТО ИЗМЕНИЛОСЬ

### 1. Убран двойной padding

**Было:**
- `CONTAINER_PADDING = 16` (от `styles.container`)
- `GRID_PADDING = 16` (добавлялся в `contentContainerStyle`)
- `TOTAL_H_PADDING = 32` (сумма обоих)
- `ITEM_WIDTH = (screenWidth - 2*32 - 12) / 2`

**Стало:**
- `CONTAINER_PADDING = 16` (единственный источник)
- `ITEM_WIDTH = (screenWidth - 2*16 - 12) / 2`
- `contentContainerStyle` больше не добавляет `paddingHorizontal`

### 2. Упрощена математика ширины

**Формула:**
```
ITEM_WIDTH = Math.floor((screenWidth - 2 * CONTAINER_PADDING - COL_GAP) / 2)
```

**Пример для iPhone SE (width = 375px):**
- До: `ITEM_WIDTH = (375 - 2*32 - 12) / 2 = 149.5px` (неправильно, учитывал несуществующий padding)
- После: `ITEM_WIDTH = (375 - 2*16 - 12) / 2 = 165.5px` (правильно)
- Доступная ширина: `375 - 2*16 = 343px`
- Сумма: `165.5 + 165.5 + 12 = 343px` ✅ **ТОЧНО**

### 3. Исправлена типизация Card style

**Было:**
```tsx
<Card style={isActive ? [styles.templateCard, styles.templateCardActive] as ViewStyle : styles.templateCard}>
```

**Стало:**
```tsx
const cardStyle: ViewStyle = isActive 
  ? StyleSheet.flatten([styles.templateCard, styles.templateCardActive])
  : styles.templateCard;
<Card style={cardStyle}>
```

**Почему:** `Card` принимает `style?: ViewStyle`, а не массив. `StyleSheet.flatten` корректно объединяет стили и возвращает `ViewStyle`.

### 4. Проверка wrapper и columnWrapperStyle

**Wrapper (renderItem):**
```tsx
<View style={[styles.templateCardWrapper, { width: ITEM_WIDTH, marginBottom: ROW_GAP }]}>
  <Card style={cardStyle}>
```
✅ Строгая ширина через `width: ITEM_WIDTH`  
✅ Нет `flex: 1`, `marginHorizontal`, `alignSelf: 'stretch'` на wrapper

**columnWrapperStyle:**
```tsx
templatesRow: {
  justifyContent: 'space-between',
}
```
✅ Простой стиль, только `justifyContent: 'space-between'`  
✅ Нет `gap` в `columnWrapperStyle`

---

## ПРОВЕРКА ИЗМЕНЕНИЙ

### 1. Источники horizontal padding для templates

**Найдено:**
- ✅ `styles.container`: `padding: 16` - **ЕДИНСТВЕННЫЙ источник**
- ✅ `styles.templatesGrid`: только `paddingBottom: 8` - нет горизонтального padding
- ✅ `contentContainerStyle`: больше не добавляет `paddingHorizontal`

### 2. Расчет ITEM_WIDTH

**Формула:**
```typescript
const CONTAINER_PADDING = 16;
const COL_GAP = 12;
const ITEM_WIDTH = Math.floor((screenWidth - 2 * CONTAINER_PADDING - COL_GAP) / 2);
```

✅ Учитывает только реальный padding от `container`  
✅ Не учитывает несуществующие дополнительные padding

### 3. Wrapper строгий

✅ `width: ITEM_WIDTH` - явная ширина  
✅ `marginBottom: ROW_GAP` - отступ между рядами  
✅ Нет `flex: 1`, `marginHorizontal`, `alignSelf: 'stretch'`

### 4. columnWrapperStyle простой

✅ Только `justifyContent: 'space-between'`  
✅ Нет `gap`

### 5. Card style типизирован корректно

✅ Используется `StyleSheet.flatten` для объединения стилей  
✅ Тип `ViewStyle` корректен  
✅ Стили реально применяются

### 6. Режим редактирования

✅ Размеры сохранены: `input 84x40`, `кнопки minHeight 40`  
✅ Не ухудшено

---

## SMOKE CHECKLIST

- [ ] **1. iOS: стабильная 2-колоночная сетка**
  - Открыть экран "Система лояльности → Скидки → Быстрые" на iOS
  - Проверить, что все карточки имеют одинаковую ширину
  - Проверить, что правая карточка не обрезается
  - Проверить, что нет "полноширинных" карточек при `numColumns={2}`

- [ ] **2. Android: то же самое**
  - Открыть экран на Android
  - Проверить 2 колонки с одинаковой шириной
  - Проверить отсутствие обрезки справа
  - Проверить отсутствие "полноширинных" карточек

- [ ] **3. Узкий экран (iPhone SE, маленький Android)**
  - Проверить на узком экране
  - Убедиться, что карточки не выходят за границы
  - Убедиться, что математика ширины работает корректно

- [ ] **4. Длинные названия/описания**
  - Если есть шаблоны с длинными названиями/описаниями, проверить:
  - Карточки остаются одинаковой ширины
  - Текст обрезается с многоточием (`numberOfLines={2}`)
  - Сетка не "разъезжается"

- [ ] **5. Режим редактирования (edit mode)**
  - Нажать на иконку карандаша у шаблона
  - Проверить, что режим редактирования не меняет ширину карточки
  - Проверить, что элементы (инпут + кнопки) не выходят за границы карточки
  - Проверить, что если переносится на 2 строки, всё помещается внутри

- [ ] **6. Стабильность сетки**
  - Прокрутить список шаблонов
  - Проверить, что карточки не "прыгают"
  - Проверить, что отступы между карточками стабильные

- [ ] **7. Математика ширины**
  - Проверить вручную: `ITEM_WIDTH + ITEM_WIDTH + COL_GAP + 2*CONTAINER_PADDING` должно быть ≈ `screenWidth`
  - Убедиться, что нет переполнения или недобора ширины

---

## ИТОГОВЫЙ СТАТУС

### ✅ Выполнено:

1. ✅ Убран двойной padding - теперь только один источник (`styles.container`)
2. ✅ Пересчитан `ITEM_WIDTH` только с `CONTAINER_PADDING = 16`
3. ✅ Убран `paddingHorizontal` из `contentContainerStyle` FlatList
4. ✅ Проверен wrapper - строгий, без `flex: 1` и `marginHorizontal`
5. ✅ Проверен `columnWrapperStyle` - простой, только `justifyContent: 'space-between'`
6. ✅ Исправлена типизация Card style через `StyleSheet.flatten`
7. ✅ Режим редактирования сохранен (размеры не ухудшены)

### 🎯 Ожидаемый результат:

- Стабильная 2-колоночная сетка без "полноширинных" карточек
- Отсутствие обрезки справа
- Один источник горизонтального padding (легко поддерживать)
- Правильная математика ширины
- Работа на всех размерах экранов (iOS/Android)

---

## ПРИМЕЧАНИЯ

- Все изменения касаются только верстки, бизнес-логика не тронута
- Не добавлены новые зависимости
- `scrollEnabled={false}` сохранён для избежания warning про вложенность
- Размеры элементов режима редактирования сохранены (84x40, minHeight 40)
