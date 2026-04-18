# Компактизация карточек "Быстрые скидки"

**Дата:** 2026-01-27  
**Файл:** `mobile/src/components/loyalty/DiscountsQuickTab.tsx`

---

## ИЗМЕНЕНИЯ

### 1. Кнопка "Активировать" - компактнее

**Было:**
- `height: 44`
- `width: '100%'`
- `fontSize: 13`

**Стало:**
- `height: 36` (уменьшено на 8px)
- `paddingHorizontal: 14` (вместо `width: '100%'`)
- `alignSelf: 'flex-start'` (не на всю ширину)
- `fontSize: 12` (уменьшено на 1px)
- `ellipsizeMode="tail"` (если текст не помещается)

**Результат:** Кнопка компактнее, не занимает всю ширину, больше "воздуха" в карточке.

### 2. Карандаш перенесен из header в footer

**Было:**
- Карандаш в `templateHeaderActions` (header справа)
- Показывался только когда `!isActive && editingTemplate !== template.id`

**Стало:**
- Карандаш в `templateFooterRow` (footer рядом с кнопкой)
- Показывается только когда `!isActive && editingTemplate !== template.id`
- В режиме редактирования не показывается (как и раньше)
- Размер иконки: `fontSize: 16` (было 14 в header)
- `hitSlop: { top: 8, bottom: 8, left: 8, right: 8 }` для удобства нажатия

**Структура footer (когда НЕ editing):**
```
[Кнопка "Активировать"] [✏️] (gap: 8px)
```

**Результат:** Карандаш рядом с кнопкой, не в header, более логичное расположение.

### 3. Название уменьшено

**Было:**
- `fontSize: 14`
- `lineHeight: 18`

**Стало:**
- `fontSize: 12` (уменьшено на 2px)
- `lineHeight: 16` (уменьшено на 2px)
- `numberOfLines={2}` сохранено
- `flex: 1` сохранено

**Результат:** Название компактнее, больше места для контента.

### 4. Уменьшены вертикальные отступы

**Было:**
- `templateFooter: { marginTop: 12 }`
- `templateDiscountText: { marginBottom: 8 }`

**Стало:**
- `templateFooter: { marginTop: 8 }` (уменьшено на 4px)
- `templateDiscountText: { marginBottom: 6 }` (уменьшено на 2px)

**Результат:** Меньше вертикальных отступов, карточка компактнее.

---

## UNIFIED DIFF

### mobile/src/components/loyalty/DiscountsQuickTab.tsx

```diff
--- a/mobile/src/components/loyalty/DiscountsQuickTab.tsx
+++ b/mobile/src/components/loyalty/DiscountsQuickTab.tsx
@@ -158,13 +158,7 @@ export function DiscountsQuickTab({
                       </View>
                       <View style={styles.templateHeaderActions}>
                         {isActive && (
                           <View style={styles.activeBadge}>
                             <Text style={styles.activeBadgeText}>Активна</Text>
                           </View>
                         )}
-                        {!isActive && editingTemplate !== template.id && (
-                          <TouchableOpacity
-                            style={styles.editIconButton}
-                            onPress={() => {
-                              setEditingTemplate(template.id);
-                              setEditTemplateValue(template.default_discount.toString());
-                            }}
-                          >
-                            <Text style={styles.editIcon}>✏️</Text>
-                          </TouchableOpacity>
-                        )}
                       </View>
                     </View>
                     
@@ -215,15 +209,27 @@ export function DiscountsQuickTab({
                       ) : (
                         <>
                           <Text style={styles.templateDiscountText} numberOfLines={1}>
                             Скидка: {template.default_discount}%
                           </Text>
-                          <TouchableOpacity
-                            style={[styles.activateButton, isActive ? styles.activateButtonDisabled : null]}
-                            onPress={() => handleCreateFromTemplate(template)}
-                            disabled={isActive}
-                          >
-                            <Text style={[styles.activateButtonText, isActive ? styles.activateButtonTextDisabled : null]} numberOfLines={1}>
-                              {isActive ? 'Активна' : 'Активировать'}
-                            </Text>
-                          </TouchableOpacity>
+                          <View style={styles.templateFooterRow}>
+                            <TouchableOpacity
+                              style={[styles.activateButton, isActive ? styles.activateButtonDisabled : null]}
+                              onPress={() => handleCreateFromTemplate(template)}
+                              disabled={isActive}
+                            >
+                              <Text style={[styles.activateButtonText, isActive ? styles.activateButtonTextDisabled : null]} numberOfLines={1} ellipsizeMode="tail">
+                                {isActive ? 'Активна' : 'Активировать'}
+                              </Text>
+                            </TouchableOpacity>
+                            {!isActive && editingTemplate !== template.id && (
+                              <TouchableOpacity
+                                style={styles.editIconButtonFooter}
+                                onPress={() => {
+                                  setEditingTemplate(template.id);
+                                  setEditTemplateValue(template.default_discount.toString());
+                                }}
+                                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
+                              >
+                                <Text style={styles.editIconFooter}>✏️</Text>
+                              </TouchableOpacity>
+                            )}
+                          </View>
                         </>
                       )}
                     </View>
@@ -416,7 +422,7 @@ const styles = StyleSheet.create({
   templateName: {
-    fontSize: 14,
+    fontSize: 12,
     fontWeight: '600',
     color: '#333',
-    lineHeight: 18,
+    lineHeight: 16,
     flex: 1,
   },
   templateDescription: {
@@ -425,19 +431,35 @@ const styles = StyleSheet.create({
     lineHeight: 16,
   },
   templateFooter: {
-    marginTop: 12,
+    marginTop: 8,
   },
   templateDiscountText: {
     fontSize: 12,
     color: '#666',
-    marginBottom: 8,
+    marginBottom: 6,
   },
+  templateFooterRow: {
+    flexDirection: 'row',
+    alignItems: 'center',
+    justifyContent: 'flex-start',
+    gap: 8,
+  },
   editIconButton: {
     padding: 4,
   },
   editIcon: {
     fontSize: 14,
   },
+  editIconButtonFooter: {
+    padding: 4,
+    alignSelf: 'center',
+  },
+  editIconFooter: {
+    fontSize: 16,
+  },
   activateButton: {
     backgroundColor: '#4CAF50',
-    height: 44,
-    width: '100%',
+    height: 36,
+    paddingHorizontal: 14,
     borderRadius: 8,
     alignItems: 'center',
     justifyContent: 'center',
+    alignSelf: 'flex-start',
   },
   activateButtonDisabled: {
     backgroundColor: '#E0E0E0',
   },
   activateButtonText: {
     color: '#fff',
-    fontSize: 13,
+    fontSize: 12,
     fontWeight: '600',
   },
```

---

## ЧТО НЕ ИЗМЕНЕНО

- ✅ Сетка: `ITEM_WIDTH`, `COL_GAP`, `ROW_GAP`, `onLayout` - не тронуто
- ✅ `FlatList`: `numColumns={2}`, `scrollEnabled={false}` - не тронуто
- ✅ Бизнес-логика: `handleCreateFromTemplate`, `isTemplateActive`, `editingTemplate` - не тронуто
- ✅ Структура header: Icon + Name + Actions (Badge) - сохранена
- ✅ Структура content: Description - сохранена

---

## SMOKE CHECKLIST

- [ ] **1. iOS: карточки компактнее, ничего не режется**
  - Открыть экран "Система лояльности → Скидки → Быстрые" на iOS
  - Проверить, что кнопка "Активировать" компактнее (не на всю ширину)
  - Проверить, что карандаш находится в footer рядом с кнопкой
  - Проверить, что ничего не режется внутри карточек
  - Проверить, что кнопка и карандаш влезают в одну строку

- [ ] **2. Android: то же самое**
  - Открыть экран на Android
  - Проверить компактность карточек
  - Проверить расположение кнопки и карандаша

- [ ] **3. Узкий экран (iPhone SE)**
  - Проверить на узком экране
  - Убедиться, что кнопка и карандаш влезают в одну строку
  - Убедиться, что ничего не режется
  - Убедиться, что карточка не "распирается"

- [ ] **4. Длинные названия**
  - Если есть шаблоны с длинными названиями, проверить:
  - Название обрезается на 2 строки с многоточием
  - Название компактнее (fontSize 12)
  - Карточка не "распирается"

- [ ] **5. Активная карточка**
  - Активировать шаблон (создать скидку)
  - Проверить, что карандаш скрыт у активного шаблона
  - Проверить, что кнопка показывает "Активна" и disabled (серый цвет)
  - Проверить, что кнопка компактная (не на всю ширину)

- [ ] **6. Режим редактирования (edit-mode)**
  - Нажать на иконку карандаша у шаблона
  - Проверить, что карандаш скрыт в режиме редактирования
  - Проверить, что элементы (инпут + кнопки) не выходят за границы карточки
  - Проверить, что режим редактирования не меняет ширину карточки

- [ ] **7. Компактность**
  - Проверить, что карточки выглядят компактнее
  - Проверить, что есть больше "воздуха" в карточке
  - Проверить, что вертикальные отступы уменьшены
  - Проверить, что кнопка не занимает всю ширину

---

## ИТОГОВЫЙ СТАТУС

### ✅ Выполнено:

1. ✅ Кнопка "Активировать" компактнее (height: 36, paddingHorizontal: 14, fontSize: 12, не на всю ширину)
2. ✅ Карандаш перенесен из header в footer рядом с кнопкой
3. ✅ Название уменьшено (fontSize: 12, lineHeight: 16)
4. ✅ Уменьшены вертикальные отступы (marginTop: 8, marginBottom: 6)
5. ✅ Сетка и бизнес-логика не тронуты

### 🎯 Ожидаемый результат:

- Карточки компактнее и чище
- Кнопка не на всю ширину, больше "воздуха"
- Карандаш логично расположен рядом с кнопкой
- Ничего не режется внутри карточек
- Название компактнее

---

## ПРИМЕЧАНИЯ

- Все изменения касаются только верстки, бизнес-логика не изменена
- Сетка (`ITEM_WIDTH`, `onLayout`) не тронута
- `FlatList` остался с `numColumns={2}` и `scrollEnabled={false}`
- Карандаш скрывается в тех же случаях, что и раньше (`!isActive && editingTemplate !== template.id`)
