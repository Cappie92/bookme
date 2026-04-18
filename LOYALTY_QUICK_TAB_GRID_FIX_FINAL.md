# Исправление сетки "Быстрые скидки": Финальный отчет

**Дата:** 2026-01-27  
**Файл:** `mobile/src/components/loyalty/DiscountsQuickTab.tsx`

---

## 0) ДИАГНОСТИКА: ЧТО БЫЛО СДЕЛАНО И ЧТО НЕ ДОДЕЛАНО

### Что было сделано в предыдущем чате:

1. ✅ Добавлен `useWindowDimensions()` для получения ширины экрана
2. ✅ Добавлены константы для сетки (H_PADDING, COL_GAP, ROW_GAP, ITEM_WIDTH)
3. ✅ В `renderItem` используется явная ширина: `width: ITEM_WIDTH` и `marginBottom: ROW_GAP`
4. ✅ В `contentContainerStyle` добавлен `paddingHorizontal: H_PADDING`
5. ✅ В `templateCard` установлен `width: '100%'`
6. ✅ Убран `flex: 1` и `marginHorizontal` из `templateCardWrapper`
7. ✅ Добавлен `columnWrapperStyle` с `justifyContent: 'space-between'`

### Что НЕ было доделано (найдено при проверке):

1. ❌ **Конфликт padding**: Расчет `ITEM_WIDTH` не учитывал двойной padding:
   - `container` имеет `padding: 16`
   - `templatesGrid` добавляет `paddingHorizontal: 16`
   - Итого: 32px с каждой стороны, но расчет учитывал только 16px
   - **Результат**: карточки были шире, чем нужно, что могло вызывать обрезку справа

2. ❌ **Размеры элементов режима редактирования**:
   - `editInputContainer`: `width: 72, height: 36` - слишком маленькие
   - `saveButton` и `cancelButton`: `minHeight: 36` - можно увеличить до 40
   - **Требование**: `inputWidth = 72–84`, `minHeight 36–40`

---

## 1) ПРИМЕНЁННЫЕ ИСПРАВЛЕНИЯ

### 1.1 Исправление математики ширины

**Проблема:** Расчет `ITEM_WIDTH` не учитывал padding от `container`, что приводило к неправильной ширине карточек.

**Решение:** Уточнен расчет с учетом обоих padding:

```typescript
// БЫЛО:
const H_PADDING = 16;
const ITEM_WIDTH = Math.floor((screenWidth - 2 * H_PADDING - COL_GAP) / 2);

// СТАЛО:
const CONTAINER_PADDING = 16; // padding от styles.container
const GRID_PADDING = 16; // paddingHorizontal от templatesGrid
const TOTAL_H_PADDING = CONTAINER_PADDING + GRID_PADDING; // Итого 32px с каждой стороны
const ITEM_WIDTH = Math.floor((screenWidth - 2 * TOTAL_H_PADDING - COL_GAP) / 2);
```

**Почему это важно:**
- `container` имеет `padding: 16`, что дает отступ 16px с каждой стороны
- `templatesGrid` добавляет `paddingHorizontal: 16`, что дает еще 16px с каждой стороны
- Итого: 32px с каждой стороны от края экрана
- Если не учесть оба padding, карточки будут шире, чем доступное пространство
- Это приводит к обрезке справа и "выпиранию" карточек

**Математика (пример для iPhone SE, width = 375px):**
- До исправления: `ITEM_WIDTH = (375 - 2*16 - 12) / 2 = 165.5px`
  - Но реальная доступная ширина = 375 - 2*32 = 311px
  - Сумма: 165.5 + 165.5 + 12 = 343px > 311px → **ПЕРЕПОЛНЕНИЕ**
- После исправления: `ITEM_WIDTH = (375 - 2*32 - 12) / 2 = 149.5px`
  - Реальная доступная ширина = 375 - 2*32 = 311px
  - Сумма: 149.5 + 149.5 + 12 = 311px → **ТОЧНО ВПОПАД**

### 1.2 Увеличение размеров элементов режима редактирования

**Проблема:** Элементы режима редактирования были слишком маленькими, что ухудшало UX.

**Решение:** Увеличены размеры согласно требованиям:

```typescript
// БЫЛО:
editInputContainer: {
  width: 72,
  height: 36,
  // ...
},
saveButton: {
  minHeight: 36,
  // ...
},
cancelButton: {
  minHeight: 36,
  // ...
},

// СТАЛО:
editInputContainer: {
  width: 84,  // было 72, стало 84 (в диапазоне 72-84)
  height: 40, // было 36, стало 40 (в диапазоне 36-40)
  // ...
},
saveButton: {
  minHeight: 40, // было 36, стало 40
  // ...
},
cancelButton: {
  minHeight: 40, // было 36, стало 40
  // ...
},
```

**Почему это важно:**
- Больший размер инпута улучшает читаемость и удобство ввода
- Больший размер кнопок улучшает доступность (легче нажимать)
- Соответствует требованиям задачи: `inputWidth = 72–84`, `minHeight 36–40`

---

## 2) UNIFIED DIFF

### mobile/src/components/loyalty/DiscountsQuickTab.tsx

```diff
--- a/mobile/src/components/loyalty/DiscountsQuickTab.tsx
+++ b/mobile/src/components/loyalty/DiscountsQuickTab.tsx
@@ -39,8 +39,12 @@ export function DiscountsQuickTab({
   const { width: screenWidth } = useWindowDimensions();
   
   // Константы для сетки
-  const H_PADDING = 16; // Горизонтальный padding контейнера
+  // Учитываем padding контейнера (16px) + paddingHorizontal templatesGrid (16px) = 32px с каждой стороны
+  const CONTAINER_PADDING = 16; // padding от styles.container
+  const GRID_PADDING = 16; // paddingHorizontal от templatesGrid
+  const TOTAL_H_PADDING = CONTAINER_PADDING + GRID_PADDING; // Итого 32px с каждой стороны
   const COL_GAP = 12; // Расстояние между колонками
   const ROW_GAP = 12; // Расстояние между рядами
-  const ITEM_WIDTH = Math.floor((screenWidth - 2 * H_PADDING - COL_GAP) / 2);
+  const ITEM_WIDTH = Math.floor((screenWidth - 2 * TOTAL_H_PADDING - COL_GAP) / 2);
@@ -108,7 +112,7 @@ export function DiscountsQuickTab({
           data={templates}
           numColumns={2}
           keyExtractor={(item) => item.id}
-          contentContainerStyle={[styles.templatesGrid, { paddingHorizontal: H_PADDING }]}
+          contentContainerStyle={[styles.templatesGrid, { paddingHorizontal: GRID_PADDING }]}
           columnWrapperStyle={styles.templatesRow}
@@ -403,7 +407,7 @@ const styles = StyleSheet.create({
     borderColor: '#4CAF50',
     borderRadius: 4,
     paddingHorizontal: 8,
-    width: 72,
-    height: 36,
+    width: 84,
+    height: 40,
     marginRight: 6,
     marginBottom: 6,
   },
@@ -430,7 +434,7 @@ const styles = StyleSheet.create({
     paddingVertical: 8,
     paddingHorizontal: 12,
     borderRadius: 4,
-    minHeight: 36,
+    minHeight: 40,
     marginRight: 6,
     marginBottom: 6,
     alignItems: 'center',
     justifyContent: 'center',
   },
@@ -446,7 +450,7 @@ const styles = StyleSheet.create({
     paddingVertical: 8,
     paddingHorizontal: 12,
     borderRadius: 4,
-    minHeight: 36,
+    minHeight: 40,
     marginBottom: 6,
     alignItems: 'center',
     justifyContent: 'center',
   },
```

---

## 3) ОБЪЯСНЕНИЕ ИЗМЕНЕНИЙ

### Что ломало сетку (причина регрессии):

1. **Неправильный расчет ширины:**
   - Расчет `ITEM_WIDTH` учитывал только один padding (16px), но реально было два (16px от container + 16px от templatesGrid = 32px)
   - Это приводило к тому, что карточки были шире, чем доступное пространство
   - Результат: карточки "выпирали", правая карточка обрезалась, сетка выглядела нестабильной

2. **Маленькие размеры элементов режима редактирования:**
   - Инпут и кнопки были слишком маленькими (72x36 вместо 84x40)
   - Это ухудшало UX и не соответствовало требованиям

### Почему выбран подход с явной математикой:

- **Предсказуемость:** Каждый элемент имеет точную ширину, вычисленную через явную формулу
- **Стабильность:** Не зависит от flex-логики или контента
- **Контроль:** Можно точно проверить, что сумма ширин = доступная ширина
- **Отладка:** Легко понять, почему что-то не работает, если математика не сходится

### Почему важно учитывать оба padding:

- `container` имеет `padding: 16` для всего содержимого (header, templatesGrid, activeDiscountsSection)
- `templatesGrid` добавляет `paddingHorizontal: 16` специально для сетки
- Если не учесть оба, карточки будут шире, чем нужно
- Это приводит к переполнению и обрезке

---

## 4) SMOKE CHECKLIST

- [ ] **1. iOS: все карточки в 2 колонки, без обрезки справа**
  - Открыть экран "Система лояльности → Скидки → Быстрые" на iOS
  - Проверить, что все карточки имеют одинаковую ширину (примерно половина экрана)
  - Проверить, что правая карточка не обрезается
  - Проверить, что нет "полноширинных" карточек при `numColumns={2}`

- [ ] **2. Android: то же самое**
  - Открыть экран на Android
  - Проверить 2 колонки с одинаковой шириной
  - Проверить отсутствие обрезки справа
  - Проверить отсутствие "полноширинных" карточек

- [ ] **3. editingTemplate: не ломает ширину**
  - Нажать на иконку карандаша у шаблона
  - Проверить, что режим редактирования не меняет ширину карточки
  - Проверить, что элементы (инпут + кнопки) не выходят за границы карточки
  - Проверить, что если переносится на 2 строки, всё помещается внутри
  - Проверить, что инпут и кнопки имеют достаточный размер (84x40)

- [ ] **4. Длинные названия/описания не ломают сетку**
  - Если есть шаблоны с длинными названиями/описаниями, проверить:
  - Карточки остаются одинаковой ширины
  - Текст обрезается с многоточием (`numberOfLines={2}`)
  - Сетка не "разъезжается"

- [ ] **5. Разные размеры экранов**
  - Проверить на узком экране (iPhone SE, маленький Android)
  - Проверить на широком экране (iPhone Pro Max, большой Android)
  - Убедиться, что математика ширины работает корректно на всех размерах

- [ ] **6. Кнопка "Активировать" в 1 строку**
  - Проверить, что кнопка "Активировать" не переносится на 2 строки
  - Проверить, что текст полностью виден
  - Проверить, что кнопка занимает всю ширину карточки

- [ ] **7. Стабильность сетки**
  - Прокрутить список шаблонов
  - Проверить, что карточки не "прыгают"
  - Проверить, что отступы между карточками стабильные

- [ ] **8. Нет warning про VirtualizedList nesting**
  - Открыть консоль разработчика
  - Проверить, что нет warning: "VirtualizedLists should never be nested..."
  - Проверить, что `scrollEnabled={false}` у FlatList сохранён

- [ ] **9. Визуальная полировка**
  - Проверить, что карточки выглядят аккуратно и компактно
  - Проверить, что текст читаемый (fontSize не слишком маленький)
  - Проверить, что кнопки имеют адекватный размер для нажатия

- [ ] **10. Математика ширины**
  - Проверить вручную: `ITEM_WIDTH + ITEM_WIDTH + COL_GAP + 2*TOTAL_H_PADDING` должно быть ≈ `screenWidth`
  - Убедиться, что нет переполнения или недобора ширины

---

## 5) ИТОГОВЫЙ СТАТУС

### ✅ Выполнено:

1. ✅ Исправлен расчет `ITEM_WIDTH` с учетом обоих padding (container + templatesGrid)
2. ✅ Увеличены размеры элементов режима редактирования (inputWidth: 72→84, height: 36→40, minHeight кнопок: 36→40)
3. ✅ Сохранена явная математика ширины через `ITEM_WIDTH`
4. ✅ Сохранены все требования: `scrollEnabled={false}`, `numColumns={2}`, бизнес-логика не тронута
5. ✅ Исправлены ошибки TypeScript с условным применением стилей

### 📝 Что было исправлено по сравнению с предыдущим чатом:

1. **Математика ширины:** Теперь правильно учитывает оба padding (32px с каждой стороны вместо 16px)
2. **Размеры элементов:** Увеличены до требуемых значений (84x40 вместо 72x36)

### 🎯 Ожидаемый результат:

- Стабильная 2-колоночная сетка без "полноширинных" карточек
- Отсутствие обрезки справа
- Правильные размеры элементов режима редактирования
- Работа на всех размерах экранов (iOS/Android)

---

## 6) ПРИМЕЧАНИЯ

- Все изменения касаются только верстки, бизнес-логика не тронута
- Не добавлены новые зависимости
- `scrollEnabled={false}` сохранён для избежания warning про вложенность
- Размеры шрифтов остались разумными (12-15, не уменьшены до 11)
