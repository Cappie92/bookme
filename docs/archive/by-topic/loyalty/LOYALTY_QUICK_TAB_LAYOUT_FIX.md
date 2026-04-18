# Исправление верстки "Быстрые скидки": Unified Diff и Checklist

**Дата:** 2026-01-21  
**Файл:** `mobile/src/components/loyalty/DiscountsQuickTab.tsx`

---

## ПРИЧИНЫ "ПОЕХАВШЕГО" UI

1. **Кнопка "Активировать" переносилась на 2 строки:**
   - `paddingHorizontal: 16` недостаточно для текста "Активировать" (11 символов)
   - Отсутствовал `numberOfLines={1}` на тексте кнопки
   - Не было фиксированной высоты кнопки (`minHeight`)
   - Кнопка не занимала всю ширину карточки (не было `alignSelf: 'stretch'`)

2. **Разный размер карточек:**
   - Фиксированная `minHeight: 200`, но контент разный
   - `templateDescription` с `flex: 1` растягивался непредсказуемо
   - Footer не был прижат к низу → разная высота карточек

3. **Элементы не выровнены:**
   - Использование `gap` может быть нестабильно на старых версиях RN
   - Не было четких margins между элементами
   - Карточки в колонках могли иметь разную ширину из-за `flex: 1` без контроля

4. **Конфликты по ширине:**
   - Режим редактирования мог не помещаться в одну строку
   - Кнопки и инпуты не имели четких ограничений ширины

---

## ПРИМЕНЁННЫЕ ПРИНЦИПЫ

1. **Убрали `gap`, заменили на margin:**
   - Стабильная поддержка на всех версиях RN
   - Четкий контроль отступов

2. **3-секционная структура карточки:**
   - Header (icon + badge) — фиксированная высота
   - Content (name + description) — `flex: 1` для растяжения
   - Footer (actions) — `marginTop: 'auto'` для прижатия к низу

3. **Фиксация кнопки "Активировать":**
   - `minHeight: 36` — фиксированная высота
   - `alignSelf: 'stretch'` — занимает всю ширину
   - `numberOfLines={1}` — запрет переноса текста
   - `paddingHorizontal: 8` — компактный padding
   - `fontSize: 11` — чуть меньше для помещения текста

4. **Ограничение строк текста:**
   - `templateName`: `numberOfLines={2}`
   - `templateDescription`: `numberOfLines={2}` (было 3, стало компактнее)
   - Все кнопки: `numberOfLines={1}`

5. **Компактные отступы:**
   - `padding: 12` вместо `16` в карточке
   - Уменьшены margins между элементами
   - Компактные размеры шрифтов (11-14 вместо 12-16)

6. **Стабильная сетка:**
   - `templateCardWrapper` с `flex: 1` и `marginHorizontal: 6`
   - `templatesRow` с `justifyContent: 'space-between'` и `marginBottom: 12`
   - Убрали `gap` из `templatesGrid` и `templatesRow`

7. **Режим редактирования:**
   - `flexWrap: 'wrap'` для переноса на 2 строки при необходимости
   - Фиксированная ширина инпута (`width: 64`)
   - Компактные кнопки с `minHeight: 32`
   - `marginBottom: 6` для элементов при переносе

---

## UNIFIED DIFF

### mobile/src/components/loyalty/DiscountsQuickTab.tsx

```diff
--- a/mobile/src/components/loyalty/DiscountsQuickTab.tsx
+++ b/mobile/src/components/loyalty/DiscountsQuickTab.tsx
@@ -103,30 +103,35 @@ export function DiscountsQuickTab({
             const isActive = isTemplateActive(template, discounts);
             
             return (
-              <Card style={[styles.templateCard, isActive && styles.templateCardActive]}>
+              <View style={styles.templateCardWrapper}>
+                <Card style={[styles.templateCard, isActive && styles.templateCardActive]}>
+                  {/* Header: Icon + Badge */}
                   <View style={styles.templateHeader}>
                     <Text style={styles.templateIcon}>{template.icon}</Text>
                     {isActive && (
                       <View style={styles.activeBadge}>
                         <Text style={styles.activeBadgeText}>Активна</Text>
                       </View>
                     )}
                   </View>
                   
-                <Text style={styles.templateName}>{template.name}</Text>
-                <Text style={styles.templateDescription} numberOfLines={3}>{template.description}</Text>
+                  {/* Content: Name + Description */}
+                  <View style={styles.templateContent}>
+                    <Text style={styles.templateName} numberOfLines={2}>{template.name}</Text>
+                    <Text style={styles.templateDescription} numberOfLines={2}>{template.description}</Text>
+                  </View>
                   
+                  {/* Footer: Actions */}
                   <View style={styles.templateActions}>
                     {editingTemplate === template.id ? (
                       <View style={styles.editContainer}>
                         <View style={styles.editInputContainer}>
                           <TextInput
                             style={styles.editInput}
                             value={editTemplateValue}
                             onChangeText={setEditTemplateValue}
                             keyboardType="numeric"
                             placeholder="0"
                             maxLength={5}
                           />
                           <Text style={styles.percentSymbol}>%</Text>
                         </View>
                         <TouchableOpacity
                           style={styles.saveButton}
                           onPress={() => handleCreateFromTemplate(template, parseFloat(editTemplateValue))}
                           disabled={isActive}
                         >
-                          <Text style={styles.saveButtonText}>Сохранить</Text>
+                          <Text style={styles.saveButtonText} numberOfLines={1}>Сохранить</Text>
                         </TouchableOpacity>
                         <TouchableOpacity
                           style={styles.cancelButton}
                           onPress={() => {
                             setEditingTemplate(null);
                             setEditTemplateValue('');
                           }}
                         >
-                          <Text style={styles.cancelButtonText}>Отмена</Text>
+                          <Text style={styles.cancelButtonText} numberOfLines={1}>Отмена</Text>
                         </TouchableOpacity>
                       </View>
                     ) : (
                       <>
                         <View style={styles.templateDiscountRow}>
-                          <Text style={styles.templateDiscountText}>
+                          <Text style={styles.templateDiscountText} numberOfLines={1}>
                             Скидка: {template.default_discount}%
                           </Text>
                           {!isActive && (
                             <TouchableOpacity
                               style={styles.editIconButton}
                               onPress={() => {
                                 setEditingTemplate(template.id);
                                 setEditTemplateValue(template.default_discount.toString());
                               }}
                             >
                               <Text style={styles.editIcon}>✏️</Text>
                             </TouchableOpacity>
                           )}
                         </View>
                         <TouchableOpacity
                           style={[styles.activateButton, isActive && styles.activateButtonDisabled]}
                           onPress={() => handleCreateFromTemplate(template)}
                           disabled={isActive}
                         >
-                          <Text style={[styles.activateButtonText, isActive && styles.activateButtonTextDisabled]}>
+                          <Text style={[styles.activateButtonText, isActive && styles.activateButtonTextDisabled]} numberOfLines={1}>
                             {isActive ? 'Активна' : 'Активировать'}
                           </Text>
                         </TouchableOpacity>
                       </>
                     )}
                   </View>
-              </Card>
+                </Card>
+              </View>
             );
           }}
         />
@@ -284,54 +289,77 @@ const styles = StyleSheet.create({
   templatesGrid: {
     paddingBottom: 8,
-    gap: 12,
   },
   templatesRow: {
     justifyContent: 'space-between',
-    gap: 12,
+    marginBottom: 12,
   },
+  templateCardWrapper: {
+    flex: 1,
+    marginHorizontal: 6,
   },
   templateCard: {
-    flex: 1,
-    minHeight: 200,
-    padding: 16,
+    flex: 1,
+    padding: 12,
     borderWidth: 1,
     borderColor: '#E0E0E0',
-    marginBottom: 12,
   },
   templateCardActive: {
     borderColor: '#4CAF50',
     backgroundColor: '#E8F5E9',
   },
   templateHeader: {
     flexDirection: 'row',
     justifyContent: 'space-between',
     alignItems: 'center',
-    marginBottom: 12,
+    marginBottom: 10,
+    minHeight: 32,
   },
   templateIcon: {
-    fontSize: 32,
+    fontSize: 28,
   },
   activeBadge: {
     backgroundColor: '#4CAF50',
-    paddingHorizontal: 8,
-    paddingVertical: 4,
+    paddingHorizontal: 6,
+    paddingVertical: 3,
     borderRadius: 12,
   },
   activeBadgeText: {
     color: '#fff',
-    fontSize: 10,
+    fontSize: 9,
     fontWeight: '600',
   },
+  templateContent: {
+    flex: 1,
+    marginBottom: 10,
+  },
   templateName: {
-    fontSize: 16,
+    fontSize: 14,
     fontWeight: '600',
     color: '#333',
-    marginBottom: 4,
+    marginBottom: 6,
+    lineHeight: 18,
   },
   templateDescription: {
-    fontSize: 12,
+    fontSize: 11,
     color: '#666',
-    marginBottom: 12,
-    flex: 1,
+    lineHeight: 15,
   },
   templateActions: {
-    marginTop: 12,
+    marginTop: 'auto',
   },
   templateDiscountRow: {
     flexDirection: 'row',
     alignItems: 'center',
-    gap: 8,
+    justifyContent: 'space-between',
     marginBottom: 8,
   },
   templateDiscountText: {
-    fontSize: 12,
+    fontSize: 11,
     color: '#666',
+    flex: 1,
   },
   editIconButton: {
     padding: 4,
+    marginLeft: 4,
   },
   editIcon: {
     fontSize: 14,
   },
   activateButton: {
     backgroundColor: '#4CAF50',
-    paddingVertical: 8,
-    paddingHorizontal: 16,
+    minHeight: 36,
+    paddingVertical: 8,
+    paddingHorizontal: 8,
     borderRadius: 8,
     alignItems: 'center',
+    justifyContent: 'center',
+    alignSelf: 'stretch',
   },
   activateButtonDisabled: {
     backgroundColor: '#E0E0E0',
   },
   activateButtonText: {
     color: '#fff',
-    fontSize: 12,
+    fontSize: 11,
     fontWeight: '600',
   },
   activateButtonTextDisabled: {
     color: '#999',
   },
   editContainer: {
     flexDirection: 'row',
+    flexWrap: 'wrap',
     alignItems: 'center',
-    gap: 8,
-    marginTop: 8,
+    marginTop: 0,
   },
   editInputContainer: {
     flexDirection: 'row',
     alignItems: 'center',
     borderWidth: 1,
     borderColor: '#4CAF50',
     borderRadius: 4,
     paddingHorizontal: 8,
-    minWidth: 60,
+    width: 64,
+    height: 32,
+    marginRight: 6,
+    marginBottom: 6,
   },
   editInput: {
     flex: 1,
-    fontSize: 12,
+    fontSize: 11,
     textAlign: 'center',
-    paddingVertical: 4,
+    paddingVertical: 0,
+    paddingHorizontal: 4,
   },
   percentSymbol: {
-    fontSize: 10,
+    fontSize: 9,
     color: '#666',
-    marginLeft: 4,
+    marginLeft: 2,
   },
   saveButton: {
     backgroundColor: '#4CAF50',
-    paddingVertical: 6,
-    paddingHorizontal: 12,
+    paddingVertical: 6,
+    paddingHorizontal: 10,
+    borderRadius: 4,
+    minHeight: 32,
+    marginRight: 6,
+    marginBottom: 6,
+    alignItems: 'center',
+    justifyContent: 'center',
   },
   saveButtonText: {
     color: '#fff',
-    fontSize: 12,
+    fontSize: 11,
     fontWeight: '600',
   },
   cancelButton: {
     backgroundColor: '#E0E0E0',
-    paddingVertical: 6,
-    paddingHorizontal: 12,
+    paddingVertical: 6,
+    paddingHorizontal: 10,
+    paddingHorizontal: 10,
     borderRadius: 4,
+    minHeight: 32,
+    marginBottom: 6,
+    alignItems: 'center',
+    justifyContent: 'center',
   },
   cancelButtonText: {
     color: '#666',
-    fontSize: 12,
+    fontSize: 11,
   },
 });
```

---

## SMOKE CHECKLIST

- [ ] **1. iOS: 2 колонки ровно, кнопка "Активировать" в 1 строку**
  - Открыть экран "Система лояльности → Скидки → Быстрые" на iOS
  - Проверить, что шаблоны отображаются в 2 ровные колонки
  - Проверить, что кнопка "Активировать" не переносится на 2 строки
  - Проверить, что текст кнопки полностью виден

- [ ] **2. Android: то же самое**
  - Открыть экран на Android
  - Проверить 2 колонки и кнопку "Активировать" в 1 строку
  - Проверить, что ничего не обрезается

- [ ] **3. editingTemplate: панель редактирования помещается**
  - Нажать на иконку карандаша у шаблона
  - Проверить, что инпут % + кнопки "Сохранить"/"Отмена" помещаются
  - Если переносится на 2 строки — проверить, что элементы не выходят за границы карточки
  - Проверить, что ничего не обрезается

- [ ] **4. Длинный title/description не ломает карточки**
  - Если есть шаблоны с длинными названиями/описаниями, проверить:
  - `templateName` обрезается на 2 строки с многоточием
  - `templateDescription` обрезается на 2 строки с многоточием
  - Карточки остаются ровными и не "разъезжаются"

- [ ] **5. Active template: бейдж + disabled корректно**
  - Активировать шаблон (создать скидку)
  - Проверить, что бейдж "Активна" отображается корректно
  - Проверить, что кнопка показывает "Активна" и disabled (серый цвет)
  - Проверить, что иконка карандаша скрыта у активного шаблона

- [ ] **6. Карточки одинаковой ширины и визуально ровные**
  - Проверить, что карточки в одной строке имеют одинаковую ширину
  - Проверить, что нижняя зона действий (footer) выровнена
  - Проверить, что карточки не "прыгают" при переключении состояний

- [ ] **7. Компактные отступы без тесноты**
  - Проверить, что padding карточек компактный (12px), но не тесный
  - Проверить, что элементы не "слипаются"
  - Проверить, что текст читаемый

- [ ] **8. Узкие экраны (iPhone SE, маленькие Android)**
  - Проверить на узком экране (если доступно)
  - Убедиться, что карточки не выходят за границы
  - Убедиться, что кнопка "Активировать" всё ещё в 1 строку
  - Убедиться, что режим редактирования помещается

- [ ] **9. Нет warning про VirtualizedList nesting**
  - Открыть консоль разработчика
  - Проверить, что нет warning: "VirtualizedLists should never be nested..."
  - Проверить, что скролл работает плавно

- [ ] **10. Визуальная полировка**
  - Проверить, что радиусы карточек единообразны
  - Проверить, что тени/бордеры аккуратные
  - Проверить, что справа во 2-й колонке элементы не "выпирают"
  - Проверить общее визуальное впечатление: аккуратно, компактно, чисто
