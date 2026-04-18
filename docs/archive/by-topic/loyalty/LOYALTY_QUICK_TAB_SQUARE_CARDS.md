# Улучшение визуала: более широкие и квадратные карточки

**Дата:** 2026-01-27  
**Файл:** `mobile/src/components/loyalty/DiscountsQuickTab.tsx`

---

## ЦЕЛИ

1. ✅ Сделать карточки шире (уменьшить боковые отступы и gap между колонками)
2. ✅ Сделать карточки ближе к квадрату (за счет aspectRatio)
3. ✅ Убрать обрезание CTA ("Активирова...")

---

## ИЗМЕНЕНИЯ

### A) Расширяем доступную ширину сетки

**Было:**
- `paddingHorizontal: 8`
- `COL_GAP: 12`

**Стало:**
- `paddingHorizontal: 6` (уменьшено на 2px с каждой стороны = +4px для карточек)
- `COL_GAP: 8` (уменьшено на 4px между колонками = +2px для каждой карточки)

**Результат:**
- Карточки стали шире на 6px (4px от padding + 2px от gap)
- Больше места для контента
- `ITEM_WIDTH = Math.floor((listWidth - COL_GAP) / 2)` остается корректной

### B) Делаем карточки ближе к квадрату

**Было:**
- `templateCardWrapper` без фиксированной высоты/aspectRatio
- Карточки имели произвольную высоту

**Стало:**
- `templateCardWrapper.aspectRatio: 1` (карточки теперь квадратные)
- `templateContent.flex: 1` (добавлено для лучшего распределения пространства)

**Результат:**
- Карточки стали квадратными (ширина = высота)
- Более единообразный и аккуратный вид
- Footer всегда внизу благодаря `templateCardInner.justifyContent: 'space-between'` (уже было)

### C) CTA без обрезания

**Было:**
```tsx
<View style={styles.templateFooterRow}>
  <TouchableOpacity style={styles.activateButton}>
    Активировать
  </TouchableOpacity>
  {showEdit && <TouchableOpacity style={styles.editIconButton}>✏️</TouchableOpacity>}
</View>
```
- Кнопка имела `maxWidth: '85%'` и `flexShrink: 1`
- ✏️ была отдельной кнопкой рядом

**Стало:**
```tsx
<TouchableOpacity style={styles.activateButton}>
  <View style={styles.activateButtonContent}>
    <Text>Активировать</Text>
    {showEdit && <TouchableOpacity style={styles.editIconInButton}>✏️</TouchableOpacity>}
  </View>
</TouchableOpacity>
```
- Кнопка имеет `width: '100%'` (без maxWidth)
- ✏️ встроена внутрь кнопки справа
- `activateButtonContent` с `flexDirection: 'row'` для размещения текста и ✏️

**Результат:**
- Кнопка всегда полной ширины, текст не обрезается
- ✏️ внутри кнопки выглядит чище и логичнее
- Нет конкуренции за пространство между кнопкой и ✏️

---

## UNIFIED DIFF

### mobile/src/components/loyalty/DiscountsQuickTab.tsx

```diff
--- a/mobile/src/components/loyalty/DiscountsQuickTab.tsx
+++ b/mobile/src/components/loyalty/DiscountsQuickTab.tsx
@@ -65,7 +65,7 @@ export function DiscountsQuickTab({
   const [listWidth, setListWidth] = useState<number | null>(null);
   
   // Константы для сетки
-  const COL_GAP = 12; // Расстояние между колонками
+  const COL_GAP = 8; // Расстояние между колонками
   const ROW_GAP = 12; // Расстояние между рядами
   // ITEM_WIDTH считаем от реальной ширины контейнера (listWidth)
   // listWidth уже учитывает все padding родительских контейнеров
@@ -365,7 +365,7 @@ const styles = StyleSheet.create({
 const styles = StyleSheet.create({
   container: {
-    paddingHorizontal: 8,
+    paddingHorizontal: 6,
     paddingVertical: 16,
   },
   // ... остальные стили
@@ -392,6 +392,7 @@ const styles = StyleSheet.create({
     borderRadius: 12,
     overflow: 'hidden',
     backgroundColor: '#fff',
+    aspectRatio: 1, // Делаем карточки ближе к квадрату
   },
   // ... остальные стили
@@ -450,6 +451,7 @@ const styles = StyleSheet.create({
   templateContent: {
     flexGrow: 1,
     marginBottom: 8,
     minWidth: 0,
+    flex: 1,
   },
   // ... остальные стили
@@ -243,18 +243,25 @@ export function DiscountsQuickTab({
                           <Text style={styles.templateDiscountText} numberOfLines={1}>
                             Скидка: {template.default_discount}%
                           </Text>
-                          <View style={styles.templateFooterRow}>
-                            <TouchableOpacity
-                              style={[styles.activateButton, isActive ? styles.activateButtonDisabled : null]}
-                              onPress={() => handleCreateFromTemplate(template)}
-                              disabled={isActive}
-                            >
-                              <Text style={[styles.activateButtonText, isActive ? styles.activateButtonTextDisabled : null]} numberOfLines={1}>
-                                {isActive ? 'Активна' : 'Активировать'}
-                              </Text>
-                            </TouchableOpacity>
-                            {showEdit && (
-                              <TouchableOpacity
-                                style={styles.editIconButton}
-                                onPress={() => {
-                                  setEditingTemplate(template.id);
-                                  setEditTemplateValue(template.default_discount.toString());
-                                }}
-                                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
-                              >
-                                <Text style={styles.editIcon}>✏️</Text>
-                              </TouchableOpacity>
-                            )}
-                          </View>
+                          <TouchableOpacity
+                            style={[styles.activateButton, isActive ? styles.activateButtonDisabled : null]}
+                            onPress={() => handleCreateFromTemplate(template)}
+                            disabled={isActive}
+                          >
+                            <View style={styles.activateButtonContent}>
+                              <Text style={[styles.activateButtonText, isActive ? styles.activateButtonTextDisabled : null]} numberOfLines={1}>
+                                {isActive ? 'Активна' : 'Активировать'}
+                              </Text>
+                              {showEdit && (
+                                <TouchableOpacity
+                                  style={styles.editIconInButton}
+                                  onPress={(e) => {
+                                    e.stopPropagation();
+                                    setEditingTemplate(template.id);
+                                    setEditTemplateValue(template.default_discount.toString());
+                                  }}
+                                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
+                                >
+                                  <Text style={styles.editIcon}>✏️</Text>
+                                </TouchableOpacity>
+                              )}
+                            </View>
+                          </TouchableOpacity>
                         </>
                       )}
                     </View>
@@ -475,10 +482,6 @@ const styles = StyleSheet.create({
   templateFooter: {
     marginTop: 8,
   },
-  templateFooterRow: {
-    flexDirection: 'row',
-    alignItems: 'center',
-    justifyContent: 'space-between',
-  },
   templateDiscountText: {
     fontSize: 12,
     color: '#666',
     marginBottom: 4,
   },
   editIconButton: {
     padding: 4,
     marginLeft: 8,
     flexShrink: 0,
   },
   editIcon: {
     fontSize: 16,
   },
   activateButton: {
     backgroundColor: '#4CAF50',
     height: 38,
     width: '100%',
-    maxWidth: '85%',
     borderRadius: 8,
     alignItems: 'center',
     justifyContent: 'center',
-    flexShrink: 1,
   },
+  activateButtonContent: {
+    flexDirection: 'row',
+    alignItems: 'center',
+    justifyContent: 'center',
+    width: '100%',
+  },
+  editIconInButton: {
+    marginLeft: 8,
+    padding: 2,
+  },
   activateButtonDisabled: {
     backgroundColor: '#E0E0E0',
   },
```

---

## ОБЪЯСНЕНИЕ ИЗМЕНЕНИЙ

### 1. Карточки стали шире

**Изменения:**
- `paddingHorizontal: 8` → `6` (уменьшено на 2px с каждой стороны)
- `COL_GAP: 12` → `8` (уменьшено на 4px между колонками)

**Почему это работает:**
- Уменьшение padding дает +4px для карточек (2px с каждой стороны)
- Уменьшение COL_GAP дает +2px для каждой карточки (4px / 2)
- Итого: карточки стали шире на 6px
- `ITEM_WIDTH = Math.floor((listWidth - COL_GAP) / 2)` автоматически пересчитывается с новыми значениями
- `listWidth` получается через `onLayout`, который учитывает новый padding

**Результат:**
- Больше места для контента внутри карточек
- Карточки визуально шире и просторнее

### 2. Карточки стали ближе к квадрату

**Изменения:**
- `templateCardWrapper.aspectRatio: 1` (добавлено)
- `templateContent.flex: 1` (добавлено для лучшего распределения)

**Почему это работает:**
- `aspectRatio: 1` заставляет карточку быть квадратной (ширина = высота)
- Высота автоматически рассчитывается от ширины
- `templateCardInner` уже имеет `flex: 1` и `justifyContent: 'space-between'`, что обеспечивает footer всегда внизу
- `templateContent.flex: 1` помогает равномерно распределить пространство между header, content и footer

**Результат:**
- Карточки стали квадратными (единообразный вид)
- Footer всегда внизу благодаря flex layout
- Более аккуратный и предсказуемый внешний вид

### 3. CTA без обрезания

**Изменения:**
- Кнопка: убраны `maxWidth: '85%'` и `flexShrink: 1`, оставлен `width: '100%'`
- ✏️ встроена внутрь кнопки справа (вместо отдельной кнопки рядом)
- Добавлен `activateButtonContent` с `flexDirection: 'row'` для размещения текста и ✏️

**Почему это работает:**
- `width: '100%'` гарантирует, что кнопка всегда полной ширины
- Текст "Активировать" не обрезается, так как кнопка не сжимается
- ✏️ внутри кнопки выглядит логичнее (редактирование связано с активацией)
- `e.stopPropagation()` предотвращает срабатывание родительской кнопки при клике на ✏️

**Результат:**
- Кнопка всегда полной ширины, текст не обрезается
- ✏️ внутри кнопки выглядит чище и логичнее
- Нет конкуренции за пространство между элементами

---

## SMOKE CHECKLIST

- [ ] **1. Карточки шире**
  - Открыть экран "Система лояльности → Скидки → Быстрые"
  - Проверить, что карточки стали шире (больше места для контента)
  - Проверить на узком экране (iPhone SE)

- [ ] **2. Карточки квадратные**
  - Проверить, что карточки имеют квадратную форму (ширина = высота)
  - Проверить, что footer всегда внизу карточки
  - Проверить на разных размерах экранов

- [ ] **3. CTA без обрезания**
  - Проверить, что кнопка "Активировать" всегда полной ширины
  - Проверить, что текст не обрезается (нет "Активирова...")
  - Проверить, что ✏️ находится внутри кнопки справа
  - Проверить, что клик на ✏️ открывает редактирование (не активирует скидку)

- [ ] **4. Сетка стабильна**
  - Проверить, что сетка остается 2-колоночной
  - Проверить, что карточки не обрезаются справа
  - Проверить, что отступы между карточками правильные

---

## ИТОГОВЫЙ СТАТУС

### ✅ Выполнено:

1. ✅ `paddingHorizontal` уменьшен с 8 до 6
2. ✅ `COL_GAP` уменьшен с 12 до 8
3. ✅ `aspectRatio: 1` добавлен к `templateCardWrapper`
4. ✅ `flex: 1` добавлен к `templateContent`
5. ✅ Кнопка имеет `width: '100%'` (без maxWidth)
6. ✅ ✏️ встроена внутрь кнопки справа
7. ✅ Сетка не тронута (numColumns=2, listWidth/onLayout)

### 🎯 Ожидаемый результат:

- Карточки шире на 6px (больше места для контента)
- Карточки квадратные (единообразный вид)
- Кнопка "Активировать" всегда полной ширины, текст не обрезается
- ✏️ внутри кнопки выглядит чище и логичнее

---

## ПРИМЕЧАНИЯ

- `aspectRatio: 1` делает карточки квадратными, что может быть слишком высоко на узких экранах. Если нужно, можно использовать `minHeight` вместо `aspectRatio`.
- ✏️ внутри кнопки использует `e.stopPropagation()` для предотвращения активации скидки при клике на редактирование.
- Сетка (`ITEM_WIDTH`, `onLayout`) автоматически пересчитывается с новыми значениями padding и COL_GAP.
- Бизнес-логика не изменена.
