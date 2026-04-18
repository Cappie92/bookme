# Рефакторинг визуала карточек "Быстрые скидки"

**Дата:** 2026-01-27  
**Файл:** `mobile/src/components/loyalty/DiscountsQuickTab.tsx`

---

## ИЗМЕНЕНИЯ

### 1. ✏️ возвращена в HEADER справа

**Было:**
- ✏️ находилась в footer рядом с кнопкой
- Использовался `templateFooterRow` с `space-between`

**Стало:**
- ✏️ в `templateHeaderActions` (header справа)
- Рядом с badge "Активна" (если активна) или отдельно (если не активна)
- Условие показа: `showEdit = !isActive && editingTemplate !== template.id`
- `hitSlop` сохранен для удобства нажатия

**Результат:** ✏️ в логичном месте (header), не мешает кнопке в footer.

### 2. Кнопка "Активировать" на всю ширину, читаемая

**Было:**
- `flexShrink: 1`, `maxWidth: '85%'` (кнопка сжималась)
- Текст обрезался: "Активи..."
- `ellipsizeMode="tail"` на тексте

**Стало:**
- `width: '100%'` (на всю ширину карточки)
- `height: 38` (было 36, чуть выше для читаемости)
- `fontSize: 13` (было 12, лучше читаемость)
- Убран `ellipsizeMode="tail"` (текст всегда целиком)
- Убран `templateFooterRow` (больше не нужен)

**Результат:** Кнопка читаемая, текст "Активировать" всегда целиком, не обрезается.

### 3. Компактизация вертикали

**Изменения:**
- `templateCardInner.padding`: `12 → 10` (уменьшено на 2px)
- `templateHeader.marginBottom`: `10 → 8` (уменьшено на 2px)
- `templateContent.marginBottom`: `10 → 8` (уменьшено на 2px)
- `templateDiscountText.marginBottom`: `6 → 4` (уменьшено на 2px)

**Результат:** Карточки компактнее по вертикали, больше контента помещается.

### 4. Текстовые фиксы RN сохранены

- `minWidth: 0` + `flexShrink: 1` у всех текстовых контейнеров
- `ellipsizeMode="tail"` для name и description
- Правильное обрезание текста с многоточием

### 5. Сетка не тронута

- `ITEM_WIDTH`, `listWidth`, `onLayout` - не изменены
- `COL_GAP`, `ROW_GAP` - не изменены
- `numColumns={2}`, `scrollEnabled={false}` - не изменены

---

## UNIFIED DIFF

### mobile/src/components/loyalty/DiscountsQuickTab.tsx

```diff
--- a/mobile/src/components/loyalty/DiscountsQuickTab.tsx
+++ b/mobile/src/components/loyalty/DiscountsQuickTab.tsx
@@ -175,7 +175,17 @@ export function DiscountsQuickTab({
                       <View style={styles.templateHeaderActions}>
                         {isActive && (
                           <View style={styles.activeBadge}>
                             <Text style={styles.activeBadgeText}>Активна</Text>
                           </View>
                         )}
+                        {showEdit && (
+                          <TouchableOpacity
+                            style={styles.editIconButton}
+                            onPress={() => {
+                              setEditingTemplate(template.id);
+                              setEditTemplateValue(template.default_discount.toString());
+                            }}
+                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
+                          >
+                            <Text style={styles.editIcon}>✏️</Text>
+                          </TouchableOpacity>
+                        )}
                       </View>
                     </View>
                     
@@ -222,20 +232,11 @@ export function DiscountsQuickTab({
                           <Text style={styles.templateDiscountText} numberOfLines={1}>
                             Скидка: {template.default_discount}%
                           </Text>
-                          <View style={styles.templateFooterRow}>
-                            <TouchableOpacity
-                              style={[styles.activateButton, isActive ? styles.activateButtonDisabled : null]}
-                              onPress={() => handleCreateFromTemplate(template)}
-                              disabled={isActive}
-                            >
-                              <Text style={[styles.activateButtonText, isActive ? styles.activateButtonTextDisabled : null]} numberOfLines={1} ellipsizeMode="tail">
-                                {isActive ? 'Активна' : 'Активировать'}
-                              </Text>
-                            </TouchableOpacity>
-                            {showEdit && (
-                              <TouchableOpacity
-                                style={styles.editIconButtonFooter}
-                                onPress={() => {
-                                  setEditingTemplate(template.id);
-                                  setEditTemplateValue(template.default_discount.toString());
-                                }}
-                                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
-                              >
-                                <Text style={styles.editIconFooter}>✏️</Text>
-                              </TouchableOpacity>
-                            )}
-                          </View>
+                          <TouchableOpacity
+                            style={[styles.activateButton, isActive ? styles.activateButtonDisabled : null]}
+                            onPress={() => handleCreateFromTemplate(template)}
+                            disabled={isActive}
+                          >
+                            <Text style={[styles.activateButtonText, isActive ? styles.activateButtonTextDisabled : null]} numberOfLines={1}>
+                              {isActive ? 'Активна' : 'Активировать'}
+                            </Text>
+                          </TouchableOpacity>
                         </>
                       )}
                     </View>
@@ -391,7 +392,7 @@ const styles = StyleSheet.create({
   templateCardInner: {
     flex: 1,
-    padding: 12,
+    padding: 10,
     justifyContent: 'space-between',
   },
   templateHeader: {
     flexDirection: 'row',
     justifyContent: 'space-between',
     alignItems: 'center',
-    marginBottom: 10,
+    marginBottom: 8,
     minHeight: 32,
   },
   templateHeaderActions: {
     flexDirection: 'row',
     alignItems: 'center',
     gap: 6,
     flexShrink: 0,
   },
   templateIcon: {
     fontSize: 24,
     marginRight: 8,
   },
   activeBadge: {
     backgroundColor: '#4CAF50',
     paddingHorizontal: 6,
     paddingVertical: 3,
     borderRadius: 10,
   },
   activeBadgeText: {
     color: '#fff',
     fontSize: 9,
     fontWeight: '600',
   },
   templateContent: {
     flexGrow: 1,
-    marginBottom: 10,
+    marginBottom: 8,
     minWidth: 0,
   },
   templateName: {
     fontSize: 12,
     fontWeight: '600',
     color: '#333',
     lineHeight: 16,
     flex: 1,
     flexShrink: 1,
     minWidth: 0,
   },
   templateDescription: {
     fontSize: 12,
     color: '#666',
     lineHeight: 16,
     minWidth: 0,
     flexShrink: 1,
   },
   templateFooter: {
     marginTop: 8,
   },
   templateDiscountText: {
     fontSize: 12,
     color: '#666',
-    marginBottom: 6,
+    marginBottom: 4,
   },
-  templateFooterRow: {
-    flexDirection: 'row',
-    alignItems: 'center',
-    justifyContent: 'space-between',
-  },
   editIconButton: {
     padding: 4,
+    marginLeft: 6,
   },
   editIcon: {
-    fontSize: 14,
+    fontSize: 16,
   },
-  editIconButtonFooter: {
-    padding: 4,
-    flexShrink: 0,
-    marginLeft: 8,
-  },
-  editIconFooter: {
-    fontSize: 16,
-  },
   activateButton: {
     backgroundColor: '#4CAF50',
-    height: 36,
-    paddingHorizontal: 12,
+    height: 38,
+    width: '100%',
     borderRadius: 8,
     alignItems: 'center',
     justifyContent: 'center',
-    flexShrink: 1,
-    maxWidth: '85%',
   },
   activateButtonDisabled: {
     backgroundColor: '#E0E0E0',
   },
   activateButtonText: {
     color: '#fff',
-    fontSize: 12,
+    fontSize: 13,
     fontWeight: '600',
   },
```

---

## ПОЧЕМУ ТЕПЕРЬ ВЫГЛЯДИТ ЛУЧШЕ

### 1. ✏️ в header - логичное расположение

- **Было:** ✏️ в footer рядом с кнопкой, мешала, клипалась
- **Стало:** ✏️ в header справа, рядом с badge "Активна"
- **Почему лучше:** Логичное место для действия редактирования, не мешает кнопке CTA

### 2. Кнопка "Активировать" читаемая

- **Было:** Кнопка сжималась (`maxWidth: '85%'`), текст обрезался "Активи..."
- **Стало:** Кнопка на всю ширину (`width: '100%'`), текст всегда целиком
- **Почему лучше:** CTA читаемый, пользователь видит полный текст действия

### 3. Карточки компактнее

- **Было:** `padding: 12`, `marginBottom: 10` - много вертикального пространства
- **Стало:** `padding: 10`, `marginBottom: 8/4` - компактнее
- **Почему лучше:** Больше контента помещается, карточки не "распираются"

### 4. Текстовые фиксы сохранены

- `minWidth: 0` + `flexShrink: 1` везде где нужно
- `ellipsizeMode="tail"` для правильного обрезания
- **Почему лучше:** Текст правильно обрезается, нет "странного" обрезания

---

## SMOKE CHECKLIST

- [ ] **1. ✏️ видна в header у всех НЕактивных карточек**
  - Открыть экран "Система лояльности → Скидки → Быстрые"
  - Проверить, что ✏️ видна в header справа у всех неактивных карточек
  - Проверить, что ✏️ находится рядом с badge "Активна" (если активна) или отдельно

- [ ] **2. Кнопка "Активировать" читаемая**
  - Проверить, что кнопка на всю ширину карточки
  - Проверить, что текст "Активировать" всегда целиком (не "Активи...")
  - Проверить, что кнопка имеет достаточную высоту (38px)

- [ ] **3. Карточки компактнее**
  - Проверить, что карточки компактнее по вертикали
  - Проверить, что больше контента помещается
  - Проверить, что карточки не "распираются"

- [ ] **4. Длинные названия/описания правильно обрезаются**
  - Если есть шаблоны с длинными названиями/описаниями, проверить:
  - Название обрезается на 2 строки с многоточием
  - Описание обрезается на 2 строки с многоточием
  - Нет "странного" обрезания посередине

- [ ] **5. Активная карточка**
  - Активировать шаблон (создать скидку)
  - Проверить, что ✏️ скрыта у активного шаблона
  - Проверить, что badge "Активна" видна в header
  - Проверить, что кнопка показывает "Активна" и disabled

- [ ] **6. Режим редактирования**
  - Нажать на ✏️ у карточки
  - Проверить, что открывается режим редактирования
  - Проверить, что ✏️ пропала только у этой карточки
  - Проверить, что после сохранения ✏️ возвращается

---

## ИТОГОВЫЙ СТАТУС

### ✅ Выполнено:

1. ✅ ✏️ возвращена в header справа (рядом с badge)
2. ✅ Кнопка "Активировать" на всю ширину, читаемая (`width: '100%'`, `fontSize: 13`)
3. ✅ Компактизация вертикали (padding: 10, marginBottom: 8/4)
4. ✅ Текстовые фиксы RN сохранены
5. ✅ Сетка не тронута

### 🎯 Ожидаемый результат:

- ✏️ в логичном месте (header), не мешает кнопке
- Кнопка "Активировать" читаемая, текст всегда целиком
- Карточки компактнее, больше контента помещается
- Длинные названия/описания правильно обрезаются

---

## ПРИМЕЧАНИЯ

- Все изменения касаются только верстки, бизнес-логика не изменена
- Сетка (`ITEM_WIDTH`, `onLayout`) не тронута
- `FlatList` остался с `numColumns={2}` и `scrollEnabled={false}`
- ✏️ показывается только когда `!isActive && editingTemplate !== template.id`
