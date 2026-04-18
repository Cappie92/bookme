# Исправление обрезания названий: ✏️ и badge как overlay

**Дата:** 2026-01-27  
**Файл:** `mobile/src/components/loyalty/DiscountsQuickTab.tsx`

---

## ПРОБЛЕМА

**Что было:**
- ✏️ находилась в `templateHeaderActions` (header справа)
- Badge "Активна" тоже в header справа
- Они отнимали ширину у `templateHeaderLeft` (Icon + Name)
- Результат: названия резались слишком рано, не хватало места для 2 строк

**Почему резалось:**
- `templateHeaderLeft` имел `flex: 1`, но справа был `templateHeaderActions` с `flexShrink: 0`
- `templateHeaderActions` занимал фиксированное место (badge + ✏️)
- Название получало меньше места, чем могло бы

---

## РЕШЕНИЕ

### 1. ✏️ и badge как overlay (position: absolute)

**Было:**
- ✏️ и badge в `templateHeaderActions` (в flow layout)
- Отнимали ширину у header

**Стало:**
- ✏️ и badge как overlay поверх карточки (`position: 'absolute'`)
- ✏️: `top: 8, right: 8`
- Badge: `top: 8, left: 8`
- `zIndex: 10` для отображения поверх контента

**Результат:** ✏️ и badge не отнимают ширину у header, названия получают больше места.

### 2. Header упрощен: только Icon + Name

**Было:**
```tsx
<View style={styles.templateHeader}>
  <View style={styles.templateHeaderLeft}>
    Icon + Name
  </View>
  <View style={styles.templateHeaderActions}>
    Badge + ✏️
  </View>
</View>
```

**Стало:**
```tsx
<View style={styles.templateHeader}>
  <View style={styles.templateHeaderLeft}>
    Icon + Name
  </View>
</View>
```

**Результат:** Header занимает всю доступную ширину, названия получают максимум места.

### 3. Улучшено название

**Было:**
- `fontSize: 12`
- `lineHeight: 16`

**Стало:**
- `fontSize: 13` (читаемее)
- `lineHeight: 17` (пропорционально)

**Результат:** Название читаемее, лучше видно.

### 4. Иконка уменьшена

**Было:**
- `fontSize: 24`

**Стало:**
- `fontSize: 22`

**Результат:** Иконка компактнее, больше места для названия.

---

## UNIFIED DIFF

### mobile/src/components/loyalty/DiscountsQuickTab.tsx

```diff
--- a/mobile/src/components/loyalty/DiscountsQuickTab.tsx
+++ b/mobile/src/components/loyalty/DiscountsQuickTab.tsx
@@ -161,25 +161,30 @@ export function DiscountsQuickTab({
               <View style={[
                 styles.templateCardWrapper, 
                 isActive && styles.templateCardWrapperActive,
                 wrapperStyle
               ]}>
+                {/* Overlay: Badge "Активна" и ✏️ */}
+                {isActive && (
+                  <View style={styles.activeBadgeOverlay}>
+                    <Text style={styles.activeBadgeText}>Активна</Text>
+                  </View>
+                )}
+                {showEdit && (
+                  <TouchableOpacity
+                    style={styles.editIconOverlay}
+                    onPress={() => {
+                      setEditingTemplate(template.id);
+                      setEditTemplateValue(template.default_discount.toString());
+                    }}
+                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
+                  >
+                    <Text style={styles.editIcon}>✏️</Text>
+                  </TouchableOpacity>
+                )}
                 <Card style={cardStyle}>
                   <View style={styles.templateCardInner}>
-                    {/* Header: Icon + Name + Actions (Badge + Edit) */}
+                    {/* Header: Icon + Name */}
                     <View style={styles.templateHeader}>
                       <View style={styles.templateHeaderLeft}>
                         <Text style={styles.templateIcon}>{template.icon}</Text>
                         <Text style={styles.templateName} numberOfLines={2} ellipsizeMode="tail">{template.name}</Text>
                       </View>
-                      <View style={styles.templateHeaderActions}>
-                        {isActive && (
-                          <View style={styles.activeBadge}>
-                            <Text style={styles.activeBadgeText}>Активна</Text>
-                          </View>
-                        )}
-                        {showEdit && (
-                          <TouchableOpacity
-                            style={styles.editIconButton}
-                            onPress={() => {
-                              setEditingTemplate(template.id);
-                              setEditTemplateValue(template.default_discount.toString());
-                            }}
-                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
-                          >
-                            <Text style={styles.editIcon}>✏️</Text>
-                          </TouchableOpacity>
-                        )}
-                      </View>
                     </View>
                     
                     {/* Content: Description */}
@@ -394,20 +399,25 @@ const styles = StyleSheet.create({
   templateHeader: {
-    flexDirection: 'row',
-    justifyContent: 'space-between',
-    alignItems: 'center',
     marginBottom: 8,
     minHeight: 32,
   },
   templateHeaderLeft: {
     flexDirection: 'row',
     alignItems: 'center',
     flex: 1,
+    minWidth: 0,
   },
-  templateHeaderActions: {
-    flexDirection: 'row',
-    alignItems: 'center',
-    gap: 6,
-    flexShrink: 0,
-  },
   templateIcon: {
-    fontSize: 24,
+    fontSize: 22,
     marginRight: 8,
   },
-  activeBadge: {
+  activeBadgeOverlay: {
+    position: 'absolute',
+    top: 8,
+    left: 8,
     backgroundColor: '#4CAF50',
     paddingHorizontal: 6,
     paddingVertical: 3,
     borderRadius: 10,
+    zIndex: 10,
   },
   activeBadgeText: {
     color: '#fff',
     fontSize: 9,
     fontWeight: '600',
   },
+  editIconOverlay: {
+    position: 'absolute',
+    top: 8,
+    right: 8,
+    padding: 4,
+    zIndex: 10,
   },
   templateName: {
-    fontSize: 12,
+    fontSize: 13,
     fontWeight: '600',
     color: '#333',
-    lineHeight: 16,
+    lineHeight: 17,
     flex: 1,
     flexShrink: 1,
     minWidth: 0,
   },
```

---

## ПОЧЕМУ ТЕПЕРЬ НАЗВАНИЯ НЕ РЕЖУТСЯ

### 1. ✏️ и badge не отнимают ширину

**Было:**
- `templateHeaderActions` с `flexShrink: 0` занимал фиксированное место
- Название получало: `availableWidth - iconWidth - actionsWidth`
- Результат: названия резались слишком рано

**Стало:**
- ✏️ и badge как overlay (`position: 'absolute'`)
- Они не участвуют в flow layout
- Название получает: `availableWidth - iconWidth` (максимум места)
- Результат: названия режутся намного реже, больше места для 2 строк

### 2. Header упрощен

**Было:**
- Header с `justifyContent: 'space-between'` и двумя блоками
- Левая часть конкурировала с правой за ширину

**Стало:**
- Header только с одной частью (Icon + Name)
- `templateHeaderLeft` занимает всю доступную ширину
- Результат: максимум места для названия

### 3. Название улучшено

- `fontSize: 13` (было 12) - читаемее
- `lineHeight: 17` (было 16) - пропорционально
- `numberOfLines={2}` + `ellipsizeMode="tail"` - правильно обрезается

### 4. Иконка компактнее

- `fontSize: 22` (было 24) - больше места для названия

---

## SMOKE CHECKLIST

- [ ] **1. Названия не режутся слишком рано**
  - Открыть экран "Система лояльности → Скидки → Быстрые"
  - Проверить, что названия занимают 2 строки и режутся намного реже
  - Проверить, что длинные названия правильно обрезаются с многоточием

- [ ] **2. ✏️ видна как overlay**
  - Проверить, что ✏️ находится в правом верхнем углу карточки
  - Проверить, что ✏️ не отнимает ширину у header
  - Проверить, что ✏️ видна у всех неактивных карточек

- [ ] **3. Badge "Активна" видна как overlay**
  - Активировать шаблон (создать скидку)
  - Проверить, что badge находится в левом верхнем углу карточки
  - Проверить, что badge не отнимает ширину у header

- [ ] **4. Header занимает всю ширину**
  - Проверить, что Icon + Name занимают всю доступную ширину
  - Проверить, что нет пустого места справа в header

- [ ] **5. Название читаемее**
  - Проверить, что название имеет `fontSize: 13` (читаемее чем 12)
  - Проверить, что название правильно обрезается на 2 строки

- [ ] **6. Иконка компактнее**
  - Проверить, что иконка имеет `fontSize: 22` (компактнее чем 24)

---

## ИТОГОВЫЙ СТАТУС

### ✅ Выполнено:

1. ✅ ✏️ убрана из header, сделана как overlay (`position: 'absolute'`, `top: 8, right: 8`)
2. ✅ Badge "Активна" сделана как overlay (`position: 'absolute'`, `top: 8, left: 8`)
3. ✅ Header упрощен: только Icon + Name (занимает всю ширину)
4. ✅ Название улучшено: `fontSize: 13`, `lineHeight: 17`
5. ✅ Иконка уменьшена: `fontSize: 22`
6. ✅ Сетка не тронута

### 🎯 Ожидаемый результат:

- Названия не режутся слишком рано, больше места для 2 строк
- ✏️ и badge не отнимают ширину у header
- Название читаемее (fontSize: 13)
- Иконка компактнее (fontSize: 22)

---

## ПРИМЕЧАНИЯ

- ✏️ и badge как overlay не влияют на layout header
- `zIndex: 10` гарантирует отображение поверх контента
- `overflow: 'hidden'` на wrapper не скрывает overlay (они внутри wrapper)
- Сетка (`ITEM_WIDTH`, `onLayout`) не тронута
- Бизнес-логика не изменена
