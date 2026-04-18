# Улучшение верстки карточек "Быстрые скидки"

**Дата:** 2026-01-27  
**Файл:** `mobile/src/components/loyalty/DiscountsQuickTab.tsx`

---

## ПРОБЛЕМЫ (ДО ИСПРАВЛЕНИЯ)

1. **Кнопка "Активировать" обрезалась/уезжала** в правой карточке
   - Причина: отсутствие единого контейнера с `flex: 1` и `justifyContent: 'space-between'`
   - Footer не был прижат к низу карточки

2. **Иконка карандаша "плавала" в середине контента**
   - Причина: карандаш находился в footer (в `templateDiscountRow`), а не в header
   - Добавлял визуальный шум

3. **Карточки выглядели рыхло и неаккуратно**
   - Причина: неправильная структура без четкого разделения Header/Content/Footer
   - `templateActions` использовал `marginTop: 'auto'` без поддержки flex-контейнера

---

## РЕШЕНИЕ

### 1. Единый контейнер внутри Card

Добавлен `templateCardInner` с правильной структурой:
- `flex: 1` - занимает всю высоту Card
- `justifyContent: 'space-between'` - распределяет Header, Content, Footer
- `padding: 12` - единый padding для всего содержимого

**Результат:** Footer всегда прижат к низу, кнопка не обрезается.

### 2. Header: Icon + Actions справа

Переструктурирован header:
- Слева: иконка (`templateIcon`)
- Справа: actions (`templateHeaderActions`) - badge "Активна" + карандаш
- Карандаш показывается только если `!isActive && editingTemplate !== template.id`

**Результат:** Карандаш строго в header справа, не "плавает" в контенте.

### 3. Content: Name + Description

- `flexGrow: 1` - растягивается между header и footer
- `numberOfLines={2}` для обоих текстов
- Компактные отступы

### 4. Footer: Actions

**Нормальный режим:**
- Строка "Скидка: X%" (без карандаша - он в header)
- Кнопка "Активировать" / "Активна":
  - `height: 44` (вместо `minHeight: 40`)
  - `width: '100%'` (вместо `alignSelf: 'stretch'`)
  - `numberOfLines={1}`

**Edit-mode:**
- Input + кнопки (могут переноситься на 2 строки)
- Элементы не выходят за границы

---

## UNIFIED DIFF

### mobile/src/components/loyalty/DiscountsQuickTab.tsx

```diff
--- a/mobile/src/components/loyalty/DiscountsQuickTab.tsx
+++ b/mobile/src/components/loyalty/DiscountsQuickTab.tsx
@@ -116,30 +116,40 @@ export function DiscountsQuickTab({
             return (
               <View style={[styles.templateCardWrapper, { width: ITEM_WIDTH, marginBottom: ROW_GAP }]}>
                 <Card style={cardStyle}>
-                  {/* Header: Icon + Badge */}
-                  <View style={styles.templateHeader}>
-                    <Text style={styles.templateIcon}>{template.icon}</Text>
-                    {isActive && (
-                      <View style={styles.activeBadge}>
-                        <Text style={styles.activeBadgeText}>Активна</Text>
-                      </View>
-                    )}
-                  </View>
-                  
-                  {/* Content: Name + Description */}
-                  <View style={styles.templateContent}>
-                    <Text style={styles.templateName} numberOfLines={2}>{template.name}</Text>
-                    <Text style={styles.templateDescription} numberOfLines={2}>{template.description}</Text>
-                  </View>
-                  
-                  {/* Footer: Actions */}
-                  <View style={styles.templateActions}>
+                  <View style={styles.templateCardInner}>
+                    {/* Header: Icon + Actions (Badge + Edit) */}
+                    <View style={styles.templateHeader}>
+                      <Text style={styles.templateIcon}>{template.icon}</Text>
+                      <View style={styles.templateHeaderActions}>
+                        {isActive && (
+                          <View style={styles.activeBadge}>
+                            <Text style={styles.activeBadgeText}>Активна</Text>
+                          </View>
+                        )}
+                        {!isActive && editingTemplate !== template.id && (
+                          <TouchableOpacity
+                            style={styles.editIconButton}
+                            onPress={() => {
+                              setEditingTemplate(template.id);
+                              setEditTemplateValue(template.default_discount.toString());
+                            }}
+                          >
+                            <Text style={styles.editIcon}>✏️</Text>
+                          </TouchableOpacity>
+                        )}
+                      </View>
+                    </View>
+                    
+                    {/* Content: Name + Description */}
+                    <View style={styles.templateContent}>
+                      <Text style={styles.templateName} numberOfLines={2}>{template.name}</Text>
+                      <Text style={styles.templateDescription} numberOfLines={2}>{template.description}</Text>
+                    </View>
+                    
+                    {/* Footer: Actions */}
+                    <View style={styles.templateFooter}>
                     {editingTemplate === template.id ? (
                       <View style={styles.editContainer}>
                         <View style={styles.editInputContainer}>
@@ -167,24 +177,15 @@ export function DiscountsQuickTab({
                         </TouchableOpacity>
                       </View>
                     ) : (
                       <>
-                        <View style={styles.templateDiscountRow}>
-                          <Text style={styles.templateDiscountText} numberOfLines={1}>
-                            Скидка: {template.default_discount}%
-                          </Text>
-                          {!isActive && (
-                            <TouchableOpacity
-                              style={styles.editIconButton}
-                              onPress={() => {
-                                setEditingTemplate(template.id);
-                                setEditTemplateValue(template.default_discount.toString());
-                              }}
-                            >
-                              <Text style={styles.editIcon}>✏️</Text>
-                            </TouchableOpacity>
-                          )}
-                        </View>
+                        <Text style={styles.templateDiscountText} numberOfLines={1}>
+                          Скидка: {template.default_discount}%
+                        </Text>
                         <TouchableOpacity
                           style={[styles.activateButton, isActive ? styles.activateButtonDisabled : null]}
                           onPress={() => handleCreateFromTemplate(template)}
                           disabled={isActive}
                         >
                           <Text style={[styles.activateButtonText, isActive ? styles.activateButtonTextDisabled : null]} numberOfLines={1}>
                             {isActive ? 'Активна' : 'Активировать'}
                           </Text>
                         </TouchableOpacity>
                       </>
                     )}
-                  </View>
+                    </View>
+                  </View>
                 </Card>
               </View>
             );
@@ -311,13 +312,23 @@ const styles = StyleSheet.create({
   templateCard: {
     width: '100%',
-    padding: 12,
+    padding: 0,
     borderWidth: 1,
     borderColor: '#E0E0E0',
   },
   templateCardActive: {
     borderColor: '#4CAF50',
     backgroundColor: '#E8F5E9',
   },
+  templateCardInner: {
+    flex: 1,
+    padding: 12,
+    justifyContent: 'space-between',
+  },
   templateHeader: {
     flexDirection: 'row',
     justifyContent: 'space-between',
     alignItems: 'center',
     marginBottom: 10,
     minHeight: 32,
   },
+  templateHeaderActions: {
+    flexDirection: 'row',
+    alignItems: 'center',
+    gap: 6,
+  },
   templateIcon: {
     fontSize: 28,
   },
@@ -340,24 +351,19 @@ const styles = StyleSheet.create({
   },
   templateContent: {
-    flex: 1,
+    flexGrow: 1,
     marginBottom: 10,
   },
   templateName: {
     fontSize: 15,
     fontWeight: '600',
     color: '#333',
     marginBottom: 6,
     lineHeight: 20,
   },
   templateDescription: {
     fontSize: 12,
     color: '#666',
     lineHeight: 16,
   },
-  templateActions: {
-    marginTop: 'auto',
-  },
-  templateDiscountRow: {
-    flexDirection: 'row',
-    alignItems: 'center',
-    justifyContent: 'space-between',
-    marginBottom: 8,
-  },
   templateDiscountText: {
     fontSize: 12,
     color: '#666',
-    flex: 1,
+    marginBottom: 8,
   },
   editIconButton: {
     padding: 4,
-    marginLeft: 4,
   },
   editIcon: {
     fontSize: 14,
   },
   activateButton: {
     backgroundColor: '#4CAF50',
-    minHeight: 40,
-    paddingVertical: 10,
-    paddingHorizontal: 12,
+    height: 44,
+    width: '100%',
     borderRadius: 8,
     alignItems: 'center',
     justifyContent: 'center',
-    alignSelf: 'stretch',
   },
   activateButtonDisabled: {
     backgroundColor: '#E0E0E0',
   },
+  templateFooter: {
+    marginTop: 12,
+  },
   editContainer: {
     flexDirection: 'row',
     flexWrap: 'wrap',
```

---

## ЧТО ИЗМЕНИЛОСЬ

### Структура карточки

**Было:**
```
Card (padding: 12)
  ├─ Header (icon + badge)
  ├─ Content (name + description)
  └─ Actions (marginTop: 'auto' - не работало)
      ├─ DiscountRow (скидка + карандаш)
      └─ ActivateButton
```

**Стало:**
```
Card (padding: 0)
  └─ templateCardInner (flex: 1, padding: 12, justifyContent: 'space-between')
      ├─ Header (icon + actions справа: badge + карандаш)
      ├─ Content (flexGrow: 1, name + description)
      └─ Footer (marginTop: 12)
          ├─ DiscountText (скидка)
          └─ ActivateButton (height: 44, width: '100%')
```

### Ключевые изменения

1. **templateCardInner:**
   - `flex: 1` - занимает всю высоту Card
   - `justifyContent: 'space-between'` - распределяет блоки
   - `padding: 12` - единый padding (перенесен с Card)

2. **Header:**
   - Добавлен `templateHeaderActions` для badge + карандаша
   - Карандаш перемещен из footer в header
   - `gap: 6` между элементами actions

3. **Content:**
   - `flexGrow: 1` вместо `flex: 1` (растягивается, но не сжимается)
   - Компактные отступы сохранены

4. **Footer:**
   - Убран `templateDiscountRow` (карандаш теперь в header)
   - `templateDiscountText` - просто текст, без flex
   - `activateButton`: `height: 44`, `width: '100%'` (вместо `minHeight: 40`, `alignSelf: 'stretch'`)

5. **Убрано:**
   - `templateActions` с `marginTop: 'auto'`
   - `templateDiscountRow`
   - `alignSelf: 'stretch'` на кнопке
   - `marginLeft: 4` у `editIconButton`

---

## SMOKE CHECKLIST

- [ ] **1. iOS: карточки стабильные, кнопка не обрезается**
  - Открыть экран "Система лояльности → Скидки → Быстрые" на iOS
  - Проверить, что все карточки имеют одинаковую ширину
  - Проверить, что правая карточка не обрезается
  - Проверить, что кнопка "Активировать" полностью видна и не обрезается
  - Проверить, что footer прижат к низу карточки

- [ ] **2. Android: то же самое**
  - Открыть экран на Android
  - Проверить стабильность сетки
  - Проверить отсутствие обрезки кнопки

- [ ] **3. Узкий экран (iPhone SE, маленький Android)**
  - Проверить на узком экране
  - Убедиться, что карточки не выходят за границы
  - Убедиться, что кнопка не обрезается

- [ ] **4. Длинные названия/описания**
  - Если есть шаблоны с длинными названиями/описаниями, проверить:
  - Текст обрезается с многоточием (`numberOfLines={2}`)
  - Карточки остаются одинаковой ширины
  - Footer не смещается

- [ ] **5. Карандаш в header**
  - Проверить, что карандаш находится строго в header справа
  - Проверить, что карандаш не "плавает" в контенте
  - Проверить, что карандаш скрыт когда `isActive` или `editingTemplate === template.id`

- [ ] **6. Режим редактирования (edit-mode)**
  - Нажать на иконку карандаша у шаблона
  - Проверить, что режим редактирования не меняет ширину карточки
  - Проверить, что элементы (инпут + кнопки) не выходят за границы карточки
  - Проверить, что если переносится на 2 строки, всё помещается внутри

- [ ] **7. Active badge**
  - Активировать шаблон (создать скидку)
  - Проверить, что бейдж "Активна" отображается в header справа
  - Проверить, что карандаш скрыт у активного шаблона
  - Проверить, что кнопка показывает "Активна" и disabled (серый цвет)

- [ ] **8. Структура Header/Content/Footer**
  - Проверить, что header всегда вверху
  - Проверить, что footer всегда внизу (прижат)
  - Проверить, что content растягивается между ними
  - Проверить, что карточки разной высоты контента имеют footer внизу

---

## ИТОГОВЫЙ СТАТУС

### ✅ Выполнено:

1. ✅ Добавлен единый контейнер `templateCardInner` с `flex: 1` и `justifyContent: 'space-between'`
2. ✅ Карандаш перемещен из footer в header (в `templateHeaderActions`)
3. ✅ Исправлена структура: Header / Content / Footer
4. ✅ Кнопка "Активировать" имеет `height: 44`, `width: '100%'` (не обрезается)
5. ✅ Footer прижат к низу через `justifyContent: 'space-between'`
6. ✅ Убран визуальный шум (карандаш не "плавает")
7. ✅ Сетка НЕ тронута (ITEM_WIDTH, CONTAINER_PADDING, columnWrapperStyle остались)

### 🎯 Ожидаемый результат:

- Карточки компактнее и чище
- Кнопка всегда внутри карточки, не обрезается
- Карандаш строго в header справа
- 3-блочная структура: Header / Content / Footer
- Footer прижат к низу карточки
- Предсказуемая геометрия без случайных смещений

---

## ПРИМЕЧАНИЯ

- Все изменения касаются только верстки карточек, сетка НЕ тронута
- Бизнес-логика не изменена
- Размеры элементов режима редактирования сохранены (84x40, minHeight 40)
- `numberOfLines={2}` для name и description сохранены
