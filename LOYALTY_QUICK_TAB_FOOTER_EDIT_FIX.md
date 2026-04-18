# Упрощение UI: ✏️ в footer рядом с кнопкой

**Дата:** 2026-01-27  
**Файл:** `mobile/src/components/loyalty/DiscountsQuickTab.tsx`

---

## ЦЕЛЬ

Сделать кнопку редактирования (✏️) стабильной и простой: разместить её рядом с кнопкой "Активировать" в footer карточки.

---

## ИЗМЕНЕНИЯ

### A) Убрать ✏️ из header

**Было:**
- ✏️ как overlay (`position: 'absolute'`, `top: 8, right: 8`)
- Overlay поверх карточки, не участвует в flow layout

**Стало:**
- ✏️ полностью убрана из header
- Header содержит только: icon + название скидки (2 строки)
- Badge "Активна" осталась как overlay (не тронута)

**Результат:**
- Header стал проще и стабильнее
- Название получает максимум места (без конкуренции с ✏️)

### B) Footer: кнопка + карандаш в одну строку

**Было:**
```tsx
<View style={styles.templateFooter}>
  <Text>Скидка: X%</Text>
  <TouchableOpacity style={styles.activateButton}>
    Активировать
  </TouchableOpacity>
</View>
```

**Стало:**
```tsx
<View style={styles.templateFooter}>
  <Text>Скидка: X%</Text>
  <View style={styles.templateFooterRow}>
    <TouchableOpacity style={styles.activateButton}>
      Активировать
    </TouchableOpacity>
    {showEdit && (
      <TouchableOpacity style={styles.editIconButton}>
        ✏️
      </TouchableOpacity>
    )}
  </View>
</View>
```

**Результат:**
- ✏️ теперь в footer рядом с кнопкой
- Используется `flexDirection: 'row'` с `justifyContent: 'space-between'`
- Кнопка может сжиматься (`flexShrink: 1`, `maxWidth: '85%'`)
- ✏️ не сжимается (`flexShrink: 0`)

### C) Стили

**Добавлен `templateFooterRow`:**
```typescript
templateFooterRow: {
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'space-between',
},
```

**Обновлен `activateButton`:**
```typescript
activateButton: {
  // ... существующие стили
  width: '100%',
  maxWidth: '85%',  // ← добавлено
  flexShrink: 1,    // ← добавлено
},
```

**Обновлен `editIconButton`:**
```typescript
editIconButton: {
  padding: 4,
  marginLeft: 8,    // ← добавлено
  flexShrink: 0,    // ← добавлено
},
```

**Удален `editIconOverlay`:**
- Больше не используется (✏️ не overlay)

---

## UNIFIED DIFF

### mobile/src/components/loyalty/DiscountsQuickTab.tsx

```diff
--- a/mobile/src/components/loyalty/DiscountsQuickTab.tsx
+++ b/mobile/src/components/loyalty/DiscountsQuickTab.tsx
@@ -190,15 +190,7 @@ export function DiscountsQuickTab({
                 wrapperStyle
               ]}>
-                {/* Overlay: Badge "Активна" и ✏️ */}
+                {/* Overlay: Badge "Активна" */}
                 {isActive && (
                   <View style={styles.activeBadgeOverlay}>
                     <Text style={styles.activeBadgeText}>Активна</Text>
                   </View>
                 )}
-                {showEdit && (
-                  <TouchableOpacity
-                    style={styles.editIconOverlay}
-                    onPress={() => {
-                      setEditingTemplate(template.id);
-                      setEditTemplateValue(template.default_discount.toString());
-                    }}
-                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
-                  >
-                    <Text style={styles.editIcon}>✏️</Text>
-                  </TouchableOpacity>
-                )}
                 <Card style={cardStyle}>
                   <View style={styles.templateCardInner}>
                     {/* Header: Icon + Name */}
@@ -255,13 +247,25 @@ export function DiscountsQuickTab({
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
+                              <Text style={[styles.activateButtonText, isActive ? styles.activateButtonTextDisabled : null]} numberOfLines={1}>
+                                {isActive ? 'Активна' : 'Активировать'}
+                              </Text>
+                            </TouchableOpacity>
+                            {showEdit && (
+                              <TouchableOpacity
+                                style={styles.editIconButton}
+                                onPress={() => {
+                                  setEditingTemplate(template.id);
+                                  setEditTemplateValue(template.default_discount.toString());
+                                }}
+                                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
+                              >
+                                <Text style={styles.editIcon}>✏️</Text>
+                              </TouchableOpacity>
+                            )}
+                          </View>
                         </>
                       )}
                     </View>
@@ -442,10 +446,6 @@ const styles = StyleSheet.create({
     fontSize: 9,
     fontWeight: '600',
   },
-  editIconOverlay: {
-    position: 'absolute',
-    top: 8,
-    right: 8,
-    padding: 4,
-    zIndex: 10,
-  },
   templateContent: {
     flexGrow: 1,
     marginBottom: 8,
@@ -475,6 +475,10 @@ const styles = StyleSheet.create({
   templateFooter: {
     marginTop: 8,
   },
+  templateFooterRow: {
+    flexDirection: 'row',
+    alignItems: 'center',
+    justifyContent: 'space-between',
+  },
   templateDiscountText: {
     fontSize: 12,
     color: '#666',
     marginBottom: 4,
   },
   editIconButton: {
     padding: 4,
+    marginLeft: 8,
+    flexShrink: 0,
   },
   editIcon: {
     fontSize: 16,
   },
   activateButton: {
     backgroundColor: '#4CAF50',
     height: 38,
     width: '100%',
+    maxWidth: '85%',
     borderRadius: 8,
     alignItems: 'center',
     justifyContent: 'center',
+    flexShrink: 1,
   },
```

---

## ОБЪЯСНЕНИЕ ИЗМЕНЕНИЙ

### 1. ✏️ теперь в footer рядом с CTA

**Что изменилось:**
- ✏️ убрана из overlay (header)
- ✏️ перемещена в footer рядом с кнопкой "Активировать"
- Используется `flexDirection: 'row'` с `justifyContent: 'space-between'`

**Почему это лучше:**
- Проще и понятнее: ✏️ логически связана с действием (активацией)
- Стабильнее: не зависит от absolute positioning
- Предсказуемее: всегда в одном месте (footer)

**Как работает:**
- Кнопка "Активировать" имеет `flexShrink: 1` и `maxWidth: '85%'` (может сжиматься)
- ✏️ имеет `flexShrink: 0` и `marginLeft: 8` (не сжимается, всегда видна)
- `justifyContent: 'space-between'` распределяет пространство между кнопкой и ✏️

### 2. Header стал стабильнее

**Что изменилось:**
- ✏️ убрана из header (больше не overlay)
- Header содержит только: icon + название скидки

**Почему это лучше:**
- Название получает максимум места (без конкуренции с ✏️)
- Header проще и понятнее
- Нет зависимости от absolute positioning

**Результат:**
- Название может занимать всю доступную ширину
- Меньше вероятность обрезания текста
- Более стабильный layout

---

## SMOKE CHECKLIST

- [ ] **1. ✏️ в footer рядом с кнопкой**
  - Открыть экран "Система лояльности → Скидки → Быстрые"
  - Проверить, что ✏️ находится в footer рядом с кнопкой "Активировать"
  - Проверить, что ✏️ видна у всех неактивных карточек
  - Проверить, что ✏️ скрыта у активных карточек

- [ ] **2. Header стабильнее**
  - Проверить, что header содержит только icon + название
  - Проверить, что ✏️ не отображается в header
  - Проверить, что название занимает максимум места

- [ ] **3. Кнопка и ✏️ в одну строку**
  - Проверить, что кнопка "Активировать" и ✏️ в одной строке
  - Проверить, что кнопка может сжиматься (при длинном тексте)
  - Проверить, что ✏️ всегда видна (не сжимается)

- [ ] **4. Badge "Активна" осталась overlay**
  - Активировать шаблон (создать скидку)
  - Проверить, что badge "Активна" находится в левом верхнем углу карточки
  - Проверить, что badge не мешает контенту

- [ ] **5. Сетка не тронута**
  - Проверить, что сетка остается 2-колоночной
  - Проверить, что карточки не обрезаются справа
  - Проверить на разных размерах экранов

---

## ИТОГОВЫЙ СТАТУС

### ✅ Выполнено:

1. ✅ ✏️ убрана из header (overlay удален)
2. ✅ ✏️ перемещена в footer рядом с кнопкой "Активировать"
3. ✅ Добавлен `templateFooterRow` с `flexDirection: 'row'` и `justifyContent: 'space-between'`
4. ✅ Кнопка имеет `flexShrink: 1` и `maxWidth: '85%'`
5. ✅ ✏️ имеет `flexShrink: 0` и `marginLeft: 8`
6. ✅ Удален неиспользуемый стиль `editIconOverlay`
7. ✅ Сетка не тронута (ITEM_WIDTH, listWidth, onLayout)

### 🎯 Ожидаемый результат:

- ✏️ теперь в footer рядом с кнопкой (стабильнее и проще)
- Header стал стабильнее (название получает максимум места)
- Кнопка и ✏️ в одну строку с правильным распределением пространства

---

## ПРИМЕЧАНИЯ

- ✏️ показывается только если `!isActive && editingTemplate !== template.id`
- Badge "Активна" осталась как overlay (не тронута)
- Сетка (`ITEM_WIDTH`, `onLayout`) не тронута
- Бизнес-логика не изменена
