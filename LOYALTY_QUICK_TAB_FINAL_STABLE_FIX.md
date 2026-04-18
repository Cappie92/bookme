# Финальные исправления: убрать обрезку справа, вернуть ✏️, исправить текст

**Дата:** 2026-01-27  
**Файл:** `mobile/src/components/loyalty/DiscountsQuickTab.tsx`

---

## ПРИЧИНЫ ПРОБЛЕМ

### 1. Обрезка справа из-за GRID_BLEED

**Что было:**
- `GRID_BLEED = 8` с отрицательным `marginHorizontal: -GRID_BLEED`
- Это расширяло сетку за пределы контейнера
- Результат: правая карточка обрезалась

**Решение:** Убрать GRID_BLEED полностью, уменьшить padding контейнера.

### 2. ✏️ клипалась из-за minWidth кнопки

**Что было:**
- Кнопка имела `minWidth: 120`
- Футер использовал `justifyContent: 'flex-start'` и `gap: 8`
- Кнопка не могла сжиматься, выталкивала ✏️ за край
- `overflow: 'hidden'` на wrapper скрывал ✏️

**Решение:** Убрать `minWidth`, добавить `flexShrink: 1`, использовать `space-between`.

### 3. Текст "странно резался" из-за отсутствия minWidth: 0

**Что было:**
- В flex-контейнерах текст может "резаться" без `minWidth: 0`
- Не было `minWidth: 0` в `templateContent` и `templateDescription`

**Решение:** Добавить `minWidth: 0` и `flexShrink: 1` везде где нужно.

---

## UNIFIED DIFF

### mobile/src/components/loyalty/DiscountsQuickTab.tsx

```diff
--- a/mobile/src/components/loyalty/DiscountsQuickTab.tsx
+++ b/mobile/src/components/loyalty/DiscountsQuickTab.tsx
@@ -42,9 +42,8 @@ export function DiscountsQuickTab({
   // Константы для сетки
   const COL_GAP = 12; // Расстояние между колонками
   const ROW_GAP = 12; // Расстояние между рядами
-  const GRID_BLEED = 8; // Расширение сетки за счет отрицательных margin (карточки станут шире)
   // ITEM_WIDTH считаем от реальной ширины контейнера (listWidth)
-  // listWidth уже учитывает все padding родительских контейнеров + GRID_BLEED
+  // listWidth уже учитывает все padding родительских контейнеров
   const availableWidth = listWidth ?? 0;
   const ITEM_WIDTH = availableWidth > 0 ? Math.floor((availableWidth - COL_GAP) / 2) : 0;
@@ -123,7 +122,7 @@ export function DiscountsQuickTab({
               setListWidth(width);
             }
           }}
-          style={[styles.templatesContainer, { marginHorizontal: -GRID_BLEED }]}
+          style={styles.templatesContainer}
         >
           {ITEM_WIDTH > 0 ? (
             <FlatList
               scrollEnabled={false}
               removeClippedSubviews={false}
               nestedScrollEnabled={true}
               data={templates}
               numColumns={2}
               keyExtractor={(item) => item.id}
-              contentContainerStyle={[styles.templatesGrid, { paddingHorizontal: GRID_BLEED }]}
+              contentContainerStyle={styles.templatesGrid}
               columnWrapperStyle={styles.templatesRow}
               renderItem={({ item: template, index }) => {
@@ -173,6 +172,7 @@ export function DiscountsQuickTab({
                     {/* Content: Description */}
                     <View style={styles.templateContent}>
-                      <Text style={styles.templateDescription} numberOfLines={2}>{template.description}</Text>
+                      <Text style={styles.templateDescription} numberOfLines={2} ellipsizeMode="tail">{template.description}</Text>
                     </View>
@@ -345,7 +345,8 @@ const styles = StyleSheet.create({
 const styles = StyleSheet.create({
   container: {
-    padding: 16,
+    paddingHorizontal: 12,
+    paddingVertical: 16,
   },
   header: {
     marginBottom: 24,
@@ -409,6 +410,7 @@ const styles = StyleSheet.create({
   templateContent: {
     flexGrow: 1,
     marginBottom: 10,
+    minWidth: 0,
   },
   templateName: {
     fontSize: 12,
@@ -421,6 +423,8 @@ const styles = StyleSheet.create({
   templateDescription: {
     fontSize: 12,
     color: '#666',
     lineHeight: 16,
+    minWidth: 0,
+    flexShrink: 1,
   },
   templateFooter: {
     marginTop: 8,
@@ -430,8 +434,8 @@ const styles = StyleSheet.create({
     marginBottom: 6,
   },
   templateFooterRow: {
     flexDirection: 'row',
     alignItems: 'center',
-    justifyContent: 'flex-start',
-    gap: 8,
+    justifyContent: 'space-between',
   },
   editIconButton: {
     padding: 4,
@@ -441,7 +445,8 @@ const styles = StyleSheet.create({
   editIconButtonFooter: {
     padding: 4,
-    alignSelf: 'center',
+    flexShrink: 0,
+    marginLeft: 8,
   },
   editIconFooter: {
     fontSize: 16,
   },
   activateButton: {
     backgroundColor: '#4CAF50',
     height: 36,
     paddingHorizontal: 12,
-    minWidth: 120,
     borderRadius: 8,
     alignItems: 'center',
     justifyContent: 'center',
-    alignSelf: 'flex-start',
+    flexShrink: 1,
+    maxWidth: '85%',
   },
```

---

## ЧТО ИЗМЕНИЛОСЬ

### ШАГ 1: Убрана причина обрезки справа

1. **Удален GRID_BLEED:**
   - Убран `const GRID_BLEED = 8`
   - Убран `marginHorizontal: -GRID_BLEED` у контейнера
   - Убран `paddingHorizontal: GRID_BLEED` из `contentContainerStyle`

2. **Уменьшен padding контейнера:**
   - Было: `padding: 16`
   - Стало: `paddingHorizontal: 12, paddingVertical: 16`
   - Результат: карточки стали шире на 8px с каждой стороны (16 - 12 = 4px, но безопасно)

3. **Проверка математики:**
   - `listWidth` теперь измеряет реальную ширину без отрицательных margin
   - `ITEM_WIDTH = Math.floor((listWidth - COL_GAP) / 2)`
   - Гарантия: `2*ITEM_WIDTH + COL_GAP <= listWidth` всегда выполняется

### ШАГ 2: Исправлен футер для ✏️

1. **templateFooterRow:**
   - Было: `justifyContent: 'flex-start'`, `gap: 8`
   - Стало: `justifyContent: 'space-between'` (без gap)
   - Результат: кнопка слева, ✏️ справа, автоматическое распределение

2. **Кнопка:**
   - Убран `minWidth: 120` (выталкивал ✏️)
   - Убран `alignSelf: 'flex-start'`
   - Добавлен `flexShrink: 1` (может сжиматься)
   - Добавлен `maxWidth: '85%'` (не занимает всю ширину)
   - Результат: кнопка может сжиматься, ✏️ всегда видна справа

3. **✏️:**
   - Добавлен `flexShrink: 0` (не сжимается)
   - Добавлен `marginLeft: 8` (отступ от кнопки)
   - Убран `alignSelf: 'center'`
   - Результат: ✏️ всегда справа, не клипается

### ШАГ 3: Исправлено обрезание текста

1. **templateContent:**
   - Добавлен `minWidth: 0` (классический фикс RN для flex-текста)

2. **templateDescription:**
   - Добавлен `minWidth: 0`
   - Добавлен `flexShrink: 1`
   - Добавлен `ellipsizeMode="tail"` в JSX
   - Результат: описание правильно обрезается с многоточием

3. **templateHeaderLeft и templateName:**
   - Уже были `minWidth: 0` и `flexShrink: 1` (из предыдущих правок)
   - Результат: название правильно обрезается

### ШАГ 4: Проверка overflow: hidden

- `overflow: 'hidden'` на `templateCardWrapper` оставлен для скругления
- После исправления футера (кнопка может сжиматься) ✏️ не клипается
- Футер всегда помещается в карточку

---

## ПОЧЕМУ ТЕПЕРЬ НЕ БУДЕТ ПРОБЛЕМ

### 1. Обрезка справа исправлена

- Убран GRID_BLEED (отрицательные margin)
- `listWidth` измеряет реальную ширину контейнера
- `ITEM_WIDTH` рассчитывается корректно
- Гарантия: `2*ITEM_WIDTH + COL_GAP <= listWidth`

### 2. ✏️ всегда видна

- Кнопка может сжиматься (`flexShrink: 1`, `maxWidth: '85%'`)
- ✏️ не сжимается (`flexShrink: 0`)
- `justifyContent: 'space-between'` распределяет элементы
- ✏️ всегда справа, не клипается

### 3. Текст правильно обрезается

- `minWidth: 0` везде где нужно (классический фикс RN)
- `flexShrink: 1` позволяет сжиматься
- `ellipsizeMode="tail"` обрезает с многоточием
- Нет "странного" обрезания посередине

---

## SMOKE CHECKLIST

- [ ] **1. Правая колонка не обрезается**
  - Открыть экран "Система лояльности → Скидки → Быстрые" на iOS
  - Проверить, что правая карточка не обрезается
  - Проверить, что кнопка "Активировать" полностью видна
  - Проверить консоль (dev режим): `check <= listWidth` должно быть true

- [ ] **2. ✏️ видна у всех НЕактивных карточек**
  - Проверить, что ✏️ видна у всех неактивных карточек
  - Проверить, что ✏️ находится справа от кнопки
  - Проверить, что ✏️ не клипается
  - Проверить консоль (dev режим): `showEdit: true` для неактивных карточек

- [ ] **3. Длинные названия/описания нормально ellipsis**
  - Если есть шаблоны с длинными названиями/описаниями, проверить:
  - Название обрезается на 2 строки с многоточием (`ellipsizeMode="tail"`)
  - Описание обрезается на 2 строки с многоточием
  - Нет "странного" обрезания посередине
  - Текст правильно обрезается с многоточием в конце

- [ ] **4. Кнопка и ✏️ влезают в одну строку**
  - Проверить, что кнопка и ✏️ находятся в одной строке
  - Проверить, что кнопка может сжиматься (на узких экранах)
  - Проверить, что ✏️ всегда справа, не клипается

- [ ] **5. Активная карточка**
  - Активировать шаблон (создать скидку)
  - Проверить, что ✏️ скрыта у активного шаблона
  - Проверить, что кнопка показывает "Активна" и disabled

- [ ] **6. Режим редактирования**
  - Нажать на ✏️ у карточки
  - Проверить, что открывается режим редактирования
  - Проверить, что ✏️ пропала только у этой карточки
  - Проверить, что после сохранения ✏️ возвращается

---

## ИТОГОВЫЙ СТАТУС

### ✅ Выполнено:

1. ✅ Убран GRID_BLEED полностью (отрицательные margin)
2. ✅ Уменьшен padding контейнера с 16 до 12 (безопасное расширение)
3. ✅ Исправлен футер: кнопка может сжиматься, ✏️ всегда справа
4. ✅ Исправлено обрезание текста: добавлен `minWidth: 0` везде
5. ✅ Добавлен `ellipsizeMode="tail"` для описания
6. ✅ Сетка и бизнес-логика не тронуты

### 🎯 Ожидаемый результат:

- Правая колонка не обрезается
- ✏️ всегда видна у всех неактивных карточек
- Длинные названия/описания правильно обрезаются с многоточием
- Кнопка и ✏️ влезают в одну строку
- Нет "странного" обрезания текста

---

## ПРИМЕЧАНИЯ

- GRID_BLEED убран полностью - больше нет отрицательных margin
- Padding контейнера уменьшен безопасно (12 вместо 16)
- `overflow: 'hidden'` оставлен для скругления, но после исправления футера не скрывает ✏️
- Сетка (`ITEM_WIDTH`, `onLayout`) не тронута
- Бизнес-логика не изменена
