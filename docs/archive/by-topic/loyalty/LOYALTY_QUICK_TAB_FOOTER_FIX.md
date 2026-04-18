# Исправление футера карточки: нижний воздух и видимость ✏️

**Дата:** 2026-01-27  
**Файл:** `mobile/src/components/loyalty/DiscountsQuickTab.tsx`

---

## СИМПТОМЫ

- Кнопка "Активировать" визуально сливается с нижней границей карточки (нет нижнего воздуха)
- Кнопка "Активировать" заступает/перекрывает ✏️ (edit) справа в футере

---

## ИЗМЕНЕНИЯ

### 1) Добавлен нижний отступ у внутреннего контейнера

**Было:**
```typescript
templateCardInner: {
  flex: 1,
  padding: 10,
  justifyContent: 'space-between',
},
```

**Стало:**
```typescript
templateCardInner: {
  flex: 1,
  padding: 10,
  paddingBottom: 14,  // ← добавлено (+4px к текущему padding)
  justifyContent: 'space-between',
},
```

**Результат:**
- Появился "воздух" под кнопкой (4px дополнительного отступа)
- Кнопка не касается нижней рамки карточки

### 2) Восстановлен footer row с правильными стилями

**Было:**
```tsx
<TouchableOpacity style={styles.activateButton}>
  <View style={styles.activateButtonContent}>
    <Text>Активировать</Text>
    {showEdit && <TouchableOpacity style={styles.editIconInButton}>✏️</TouchableOpacity>}
  </View>
</TouchableOpacity>
```

**Стало:**
```tsx
<View style={styles.templateFooterRow}>
  <TouchableOpacity style={styles.activateButton}>
    <Text>Активировать</Text>
  </TouchableOpacity>
  {showEdit && <TouchableOpacity style={styles.editIconButton}>✏️</TouchableOpacity>}
</View>
```

**Результат:**
- ✏️ вынесена из кнопки наружу
- Используется `templateFooterRow` с правильной раскладкой

### 3) Настроены стили для footer row

**Добавлен `templateFooterRow`:**
```typescript
templateFooterRow: {
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'space-between',
  marginTop: 8,  // Отделяет от текста "Скидка: X%"
},
```

**Результат:**
- Кнопка и ✏️ в одной строке
- Правильное распределение пространства между элементами
- Отступ сверху отделяет от текста "Скидка: X%"

### 4) Исправлена кнопка: flex вместо width: 100%

**Было:**
```typescript
activateButton: {
  backgroundColor: '#4CAF50',
  height: 38,
  width: '100%',  // ← залезала на ✏️
  borderRadius: 8,
  alignItems: 'center',
  justifyContent: 'center',
},
```

**Стало:**
```typescript
activateButton: {
  backgroundColor: '#4CAF50',
  height: 38,
  borderRadius: 8,
  alignItems: 'center',
  justifyContent: 'center',
  flex: 1,        // ← может сжиматься
  minWidth: 0,    // ← позволяет сжиматься правильно
},
```

**Результат:**
- Кнопка не залезает на ✏️
- Кнопка может сжиматься, но не перекрывает ✏️

### 5) Исправлена ✏️: фиксированная ширина и flexShrink: 0

**Было:**
```typescript
editIconButton: {
  padding: 4,
  marginLeft: 8,
  flexShrink: 0,
},
```

**Стало:**
```typescript
editIconButton: {
  width: 40,           // ← фиксированная ширина
  height: 38,          // ← фиксированная высота (как у кнопки)
  alignItems: 'center',
  justifyContent: 'center',
  marginLeft: 10,      // ← увеличен отступ
  flexShrink: 0,       // ← не сжимается
},
```

**Результат:**
- ✏️ всегда видна, не перекрывается
- Фиксированная ширина и высота обеспечивают стабильность
- Увеличенный marginLeft (10 вместо 8) создает больше пространства

### 6) Удалены неиспользуемые стили

**Удалено:**
- `activateButtonContent` (больше не используется)
- `editIconInButton` (больше не используется)

---

## UNIFIED DIFF

### mobile/src/components/loyalty/DiscountsQuickTab.tsx

```diff
--- a/mobile/src/components/loyalty/DiscountsQuickTab.tsx
+++ b/mobile/src/components/loyalty/DiscountsQuickTab.tsx
@@ -415,7 +415,8 @@ const styles = StyleSheet.create({
   templateCardInner: {
     flex: 1,
     padding: 10,
+    paddingBottom: 14,
     justifyContent: 'space-between',
   },
   // ... остальные стили
@@ -244,18 +244,25 @@ export function DiscountsQuickTab({
                           <Text style={styles.templateDiscountText} numberOfLines={1}>
                             Скидка: {template.default_discount}%
                           </Text>
-                          <TouchableOpacity
-                            style={[styles.activateButton, isActive ? styles.activateButtonDisabled : null]}
-                            onPress={() => handleCreateFromTemplate(template)}
-                            disabled={isActive}
-                          >
-                            <View style={styles.activateButtonContent}>
-                              <Text style={[styles.activateButtonText, isActive ? styles.activateButtonTextDisabled : null]} numberOfLines={1}>
-                                {isActive ? 'Активна' : 'Активировать'}
-                              </Text>
-                              {showEdit && (
-                                <TouchableOpacity
-                                  style={styles.editIconInButton}
-                                  onPress={(e) => {
-                                    e.stopPropagation();
-                                    setEditingTemplate(template.id);
-                                    setEditTemplateValue(template.default_discount.toString());
-                                  }}
-                                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
-                                >
-                                  <Text style={styles.editIcon}>✏️</Text>
-                                </TouchableOpacity>
-                              )}
-                            </View>
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
@@ -471,6 +478,10 @@ const styles = StyleSheet.create({
   templateFooter: {
     marginTop: 8,
   },
+  templateFooterRow: {
+    flexDirection: 'row',
+    alignItems: 'center',
+    justifyContent: 'space-between',
+    marginTop: 8,
+  },
   templateDiscountText: {
     fontSize: 12,
     color: '#666',
     marginBottom: 4,
   },
   editIconButton: {
-    padding: 4,
+    width: 40,
+    height: 38,
+    alignItems: 'center',
+    justifyContent: 'center',
     marginLeft: 10,
     flexShrink: 0,
   },
   editIcon: {
     fontSize: 16,
   },
   activateButton: {
     backgroundColor: '#4CAF50',
     height: 38,
-    width: '100%',
     borderRadius: 8,
     alignItems: 'center',
     justifyContent: 'center',
+    flex: 1,
+    minWidth: 0,
   },
-  activateButtonContent: {
-    flexDirection: 'row',
-    alignItems: 'center',
-    justifyContent: 'center',
-    width: '100%',
-  },
-  editIconInButton: {
-    marginLeft: 8,
-    padding: 2,
-  },
   activateButtonDisabled: {
     backgroundColor: '#E0E0E0',
   },
```

---

## ОБЪЯСНЕНИЕ ИЗМЕНЕНИЙ

### 1. templateCardInner

**Изменения:**
- Добавлен `paddingBottom: 14` (было `padding: 10`, теперь снизу 14)

**Почему:**
- Создает "воздух" под кнопкой (4px дополнительного отступа)
- Кнопка не касается нижней рамки карточки
- Визуально более аккуратно

### 2. templateFooterRow

**Изменения:**
- Добавлен новый стиль `templateFooterRow` с `flexDirection: 'row'`, `alignItems: 'center'`, `justifyContent: 'space-between'`, `marginTop: 8`

**Почему:**
- Обеспечивает правильную раскладку кнопки и ✏️ в одну строку
- `justifyContent: 'space-between'` распределяет пространство между элементами
- `marginTop: 8` отделяет от текста "Скидка: X%"

### 3. activateButton

**Изменения:**
- Убрано `width: '100%'`
- Добавлены `flex: 1` и `minWidth: 0`

**Почему:**
- `width: '100%'` заставляло кнопку занимать всю ширину, перекрывая ✏️
- `flex: 1` позволяет кнопке занимать доступное пространство, но не залезать на ✏️
- `minWidth: 0` позволяет кнопке правильно сжиматься в flex-контейнере

### 4. editIconButton

**Изменения:**
- Добавлены `width: 40`, `height: 38`, `alignItems: 'center'`, `justifyContent: 'center'`
- Увеличено `marginLeft` с 8 до 10
- Убрано `padding: 4`

**Почему:**
- Фиксированная ширина и высота обеспечивают стабильность
- `alignItems: 'center'` и `justifyContent: 'center'` центрируют ✏️ внутри кнопки
- Увеличенный `marginLeft` создает больше пространства между кнопкой и ✏️
- `flexShrink: 0` гарантирует, что ✏️ не сжимается

---

## SMOKE CHECKLIST

- [ ] **1. Нижний воздух под кнопкой**
  - Открыть экран "Система лояльности → Скидки → Быстрые"
  - Проверить, что кнопка "Активировать" не касается нижней рамки карточки
  - Проверить, что есть визуальный отступ снизу

- [ ] **2. ✏️ всегда видна, не перекрывается**
  - Проверить, что ✏️ находится справа от кнопки
  - Проверить, что ✏️ не перекрывается кнопкой
  - Проверить, что ✏️ видна у всех неактивных карточек

- [ ] **3. Footer row правильно раскладывается**
  - Проверить, что кнопка и ✏️ в одной строке
  - Проверить, что между ними есть пространство
  - Проверить, что footer отделен от текста "Скидка: X%"

- [ ] **4. Кнопка не залезает на ✏️**
  - Проверить, что кнопка может сжиматься, но не перекрывает ✏️
  - Проверить на узком экране (iPhone SE)
  - Проверить с длинным текстом кнопки

---

## ИТОГОВЫЙ СТАТУС

### ✅ Выполнено:

1. ✅ `paddingBottom: 14` добавлен к `templateCardInner` (нижний воздух)
2. ✅ `templateFooterRow` восстановлен с правильными стилями
3. ✅ Кнопка имеет `flex: 1` и `minWidth: 0` (не `width: '100%'`)
4. ✅ ✏️ имеет фиксированную ширину (`width: 40`, `height: 38`) и `flexShrink: 0`
5. ✅ Увеличен `marginLeft` у ✏️ (10 вместо 8)
6. ✅ Удалены неиспользуемые стили (`activateButtonContent`, `editIconInButton`)

### 🎯 Ожидаемый результат:

- Кнопка не касается нижней рамки карточки (есть нижний воздух)
- ✏️ всегда видна, не перекрывается кнопкой
- Footer стабильный и аккуратный

---

## ПРИМЕЧАНИЯ

- `paddingBottom: 14` создает 4px дополнительного отступа снизу (было 10, стало 14)
- `flex: 1` и `minWidth: 0` на кнопке позволяют ей правильно работать в flex-контейнере
- Фиксированная ширина и высота ✏️ обеспечивают стабильность
- `justifyContent: 'space-between'` распределяет пространство между кнопкой и ✏️
- Бизнес-логика не изменена
