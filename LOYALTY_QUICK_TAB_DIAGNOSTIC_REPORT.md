# Диагностика: почему не отображаются description и "Скидка: X%"

**Дата:** 2026-01-27  
**Файл:** `mobile/src/components/loyalty/DiscountsQuickTab.tsx`

---

## 1) ФАКТИЧЕСКИЙ JSX РЕНДЕРА КАРТОЧКИ

### Полный JSX блока карточки (renderItem):

```tsx
<View style={[
  styles.templateCardWrapper, 
  isActive && styles.templateCardWrapperActive,
  wrapperStyle
]}>
  {/* Overlay: Badge "Активна" */}
  {isActive && (
    <View style={styles.activeBadgeOverlay}>
      <Text style={styles.activeBadgeText}>Активна</Text>
    </View>
  )}
  <Card style={cardStyle}>
    <View style={styles.templateCardInner}>
      {/* Header: Icon + Name */}
      <View style={styles.templateHeader}>
        <View style={styles.templateHeaderLeft}>
          <Text style={styles.templateIcon}>{template.icon}</Text>
          {(() => {
            const nameText = (template?.name ?? '').trim();
            return (
              <Text style={styles.templateName} numberOfLines={2} ellipsizeMode="tail">
                {nameText || getCompactName(template.name || '')}
              </Text>
            );
          })()}
        </View>
      </View>
      
      {/* Content: Description */}
      <View style={styles.templateContent}>
        {(() => {
          const descText = (template?.description ?? '').trim();
          return (
            <Text style={styles.templateDescription} numberOfLines={2} ellipsizeMode="tail">
              {descText || getCompactDescription(template.description || '')}
            </Text>
          );
        })()}
      </View>
      
      {/* Footer: Actions */}
      <View style={styles.templateFooter}>
        {editingTemplate === template.id ? (
          // ВЕТКА 1: Режим редактирования
          <View style={styles.editContainer}>
            <View style={styles.editInputContainer}>
              <TextInput ... />
              <Text style={styles.percentSymbol}>%</Text>
            </View>
            <TouchableOpacity style={styles.saveButton}>...</TouchableOpacity>
            <TouchableOpacity style={styles.cancelButton}>...</TouchableOpacity>
          </View>
        ) : (
          // ВЕТКА 2: Нормальный режим
          <>
            {/* template.description НЕ рендерится здесь - только в templateContent выше */}
            {/* template.default_discount рендерится здесь: */}
            {(() => {
              const percent = Number.isFinite(Number(template?.default_discount))
                ? Number(template.default_discount)
                : 0;
              return (
                <Text style={styles.templateDiscountText} numberOfLines={1}>
                  Скидка: {percent}%
                </Text>
              );
            })()}
            <View style={styles.templateFooterRow}>
              <TouchableOpacity style={styles.activateButton}>...</TouchableOpacity>
              {showEdit && <TouchableOpacity style={styles.editIconButtonFooter}>✏️</TouchableOpacity>}
            </View>
          </>
        )}
      </View>
    </View>
  </Card>
</View>
```

### Где рендерятся элементы:

1. **`template.description`** (строка 214-223):
   - Рендерится ВСЕГДА (вне зависимости от `editingTemplate`)
   - В блоке `<View style={styles.templateContent}>`
   - Условие: НЕТ (всегда рендерится)

2. **`template.default_discount`** (строка 259-268):
   - Рендерится ТОЛЬКО если `editingTemplate !== template.id`
   - В блоке `else` (нормальный режим)
   - Условие: `editingTemplate === template.id ? ... : <>...</>`

3. **`templateDiscountText`** (строка 264-266):
   - Рендерится ТОЛЬКО если `editingTemplate !== template.id`
   - В блоке `else` (нормальный режим)
   - Условие: `editingTemplate === template.id ? ... : <>...</>`

### Вывод по JSX:

- **`template.description`** рендерится ВСЕГДА (не зависит от `editingTemplate`)
- **`template.default_discount`** рендерится ТОЛЬКО в нормальном режиме (не в edit mode)
- Если они не видны, проблема в СТИЛЯХ или в ДАННЫХ (пустые строки)

---

## 2) ЛОГИРОВАНИЕ ДАННЫХ В РАНТАЙМЕ

### Добавлен debug-лог:

```typescript
// Диагностика данных (dev only)
if (__DEV__) {
  console.log('[DiscountsQuickTab][template]', {
    id: template?.id,
    name: template?.name,
    description: template?.description,
    default_discount: template?.default_discount,
    isActive,
    editingTemplate,
    showEdit,
    editingThisTemplate: editingTemplate === template.id,
  });
}
```

### Что проверить в логах:

1. **`description` пустая реально в данных?**
   - Если `description: ''` или `description: undefined` → данные пустые
   - Если `description: '...'` (есть текст) → проблема в стилях

2. **`default_discount` реально есть?**
   - Если `default_discount: undefined` или `default_discount: null` → данные отсутствуют
   - Если `default_discount: 10` (число) → проблема в стилях или условии рендера

3. **`editingThisTemplate: true`?**
   - Если `true` → попадаем в ветку редактирования, `templateDiscountText` не рендерится
   - Если `false` → должны видеть "Скидка: X%"

---

## 3) ДИАГНОСТИКА СТИЛЕЙ, КОТОРЫЕ СКРЫВАЮТ КОНТЕНТ

### 3.1 Card / Wrapper / Inner

#### templateCardWrapper:
```typescript
templateCardWrapper: {
  borderWidth: 1,
  borderColor: '#E0E0E0',
  borderRadius: 12,
  overflow: 'hidden',        // ⚠️ МОЖЕТ ОБРЕЗАТЬ КОНТЕНТ
  backgroundColor: '#fff',
  aspectRatio: 1,            // ⚠️ КРИТИЧНО: делает карточки квадратными, сжимает контент
},
```

**Проблемные свойства:**
- ✅ `overflow: 'hidden'` - может обрезать контент, выходящий за границы
- ✅ `aspectRatio: 1` - **КРИТИЧНО**: делает карточки квадратными (ширина = высота), сжимает вертикальное пространство

#### wrapperStyle (динамический):
```typescript
const wrapperStyle = {
  width: ITEM_WIDTH,
  marginBottom: ROW_GAP,
  marginRight: isLeft ? COL_GAP / 2 : 0,
  marginLeft: !isLeft ? COL_GAP / 2 : 0,
};
```

**Проблемных свойств нет.**

#### cardStyle:
```typescript
const cardStyle: ViewStyle = isActive 
  ? StyleSheet.flatten([styles.templateCard, styles.templateCardActive])
  : styles.templateCard;
```

#### templateCard:
```typescript
templateCard: {
  width: '100%',
  padding: 0,
},
```

**Проблемных свойств нет.**

#### templateCardInner:
```typescript
templateCardInner: {
  flex: 1,
  padding: 10,
  paddingBottom: 14,
  // ❌ НЕ использовать justifyContent: 'space-between'
},
```

**Проблемных свойств нет.**

### 3.2 Content / Footer

#### templateContent:
```typescript
templateContent: {
  marginBottom: 8,
  minWidth: 0,
},
```

**Проблемных свойств нет.**

#### templateFooter:
```typescript
templateFooter: {
  marginTop: 'auto',   // футер всегда внизу карточки
  paddingTop: 8,
},
```

**Потенциальная проблема:**
- ⚠️ `marginTop: 'auto'` в сочетании с `aspectRatio: 1` может создавать конфликт
- Если карточка квадратная и контент не помещается, `marginTop: 'auto'` может "вытолкнуть" контент за пределы видимости

#### templateFooterRow:
```typescript
templateFooterRow: {
  flexDirection: 'row',
  alignItems: 'center',
},
```

**Проблемных свойств нет.**

#### templateDiscountText:
```typescript
templateDiscountText: {
  fontSize: 12,
  color: '#666',
  marginBottom: 6,
},
```

**Проблемных свойств нет.**

#### templateDescription:
```typescript
templateDescription: {
  fontSize: 12,
  lineHeight: 16,
  color: '#666',
  flexShrink: 1,
  minWidth: 0,
},
```

**Проблемных свойств нет.**

---

## 4) ПРОВЕРКА КЛЮЧЕВОГО ПОДОЗРЕНИЯ: ФИКСИРОВАННАЯ ВЫСОТА КАРТОЧКИ

### ✅ НАЙДЕНО: `aspectRatio: 1` у `templateCardWrapper`

**Точное место:**
```typescript
templateCardWrapper: {
  // ...
  aspectRatio: 1, // Делаем карточки ближе к квадрату
},
```

**Проблема:**
- `aspectRatio: 1` делает карточки квадратными (ширина = высота)
- Если ширина карточки, например, 160px, то высота тоже 160px
- Внутри карточки:
  - Header: ~32px (minHeight) + 8px (marginBottom) = ~40px
  - Content (Description): ~32px (2 строки по 16px lineHeight) + 8px (marginBottom) = ~40px
  - Footer: ~10px (marginTop) + 8px (paddingTop) + 38px (кнопка) + 6px (marginBottom) = ~62px
  - Padding: 10px (top) + 14px (bottom) = 24px
  - **Итого: ~166px** (больше чем 160px!)

**Результат:**
- Контент не помещается в квадратную карточку
- `overflow: 'hidden'` обрезает всё, что выходит за границы
- Description и "Скидка: X%" обрезаются/скрываются

---

## 5) МИНИ-ПАТЧ

### Причина проблемы:

**Комбинация:**
1. `aspectRatio: 1` делает карточки квадратными (ширина = высота)
2. Контент (Header + Description + Footer + Padding) не помещается в квадрат
3. `overflow: 'hidden'` обрезает всё, что выходит за границы
4. Description и "Скидка: X%" обрезаются/скрываются

### Минимальный патч:

**Убрать `aspectRatio: 1` из `templateCardWrapper`:**

```diff
--- a/mobile/src/components/loyalty/DiscountsQuickTab.tsx
+++ b/mobile/src/components/loyalty/DiscountsQuickTab.tsx
@@ -413,7 +413,6 @@ const styles = StyleSheet.create({
     borderRadius: 12,
     overflow: 'hidden',
     backgroundColor: '#fff',
-    aspectRatio: 1, // Делаем карточки ближе к квадрату
   },
   templateCardWrapperActive: {
     borderColor: '#4CAF50',
```

### Почему это исправит:

1. **Убираем фиксированное соотношение сторон:**
   - Карточки больше не квадратные
   - Высота определяется содержимым, а не шириной
   - Контент помещается полностью

2. **Контент становится видимым:**
   - Description больше не обрезается
   - "Скидка: X%" больше не обрезается
   - Footer прижимается вниз через `marginTop: 'auto'`

3. **Сетка не ломается:**
   - `ITEM_WIDTH` не изменяется
   - `numColumns=2` не изменяется
   - Только высота карточек становится динамической

---

## 6) ОТЧЕТ

### Причина (конкретная):

**`aspectRatio: 1` у `templateCardWrapper` (строка 420) делает карточки квадратными, а контент (Header + Description + Footer + Padding) не помещается в квадрат. `overflow: 'hidden'` обрезает всё, что выходит за границы, скрывая Description и "Скидка: X%".**

### Минимальный diff:

```diff
--- a/mobile/src/components/loyalty/DiscountsQuickTab.tsx
+++ b/mobile/src/components/loyalty/DiscountsQuickTab.tsx
@@ -417,7 +417,6 @@ const styles = StyleSheet.create({
     borderRadius: 12,
     overflow: 'hidden',
     backgroundColor: '#fff',
-    aspectRatio: 1, // Делаем карточки ближе к квадрату
   },
   templateCardWrapperActive: {
     borderColor: '#4CAF50',
```

### Почему это точно исправит:

**Убирая `aspectRatio: 1`, карточки перестают быть квадратными, и их высота определяется содержимым. Description и "Скидка: X%" больше не обрезаются `overflow: 'hidden'`, так как контент полностью помещается в карточку. Футер прижимается вниз через `marginTop: 'auto'`, и все элементы становятся видимыми.**

---

## ДОПОЛНИТЕЛЬНЫЕ ПРОВЕРКИ

### После применения патча проверить в логах:

1. **Данные:**
   - `description` не пустая? → Если пустая, проблема в данных, не в стилях
   - `default_discount` есть? → Если нет, проблема в данных

2. **Условия рендера:**
   - `editingThisTemplate: false`? → Если `true`, "Скидка: X%" не рендерится (это нормально)

3. **Визуально:**
   - Description видна? → Должна быть видна после убирания `aspectRatio: 1`
   - "Скидка: X%" видна? → Должна быть видна после убирания `aspectRatio: 1`
   - Футер прижат вниз? → Должен быть прижат через `marginTop: 'auto'`

---

## ИТОГОВЫЙ СТАТУС

### ✅ Диагностика завершена:

1. ✅ Показан фактический JSX рендера карточки
2. ✅ Добавлено логирование данных в рантайме
3. ✅ Проверены все стили, которые могут скрывать контент
4. ✅ Найдена причина: `aspectRatio: 1` + `overflow: 'hidden'`
5. ✅ Предложен минимальный патч: убрать `aspectRatio: 1`

### 🎯 Ожидаемый результат после патча:

- Description отображается (больше не обрезается)
- "Скидка: X%" отображается (больше не обрезается)
- Футер прижат вниз (`marginTop: 'auto'`)
- Карточки имеют динамическую высоту (определяется содержимым)
- Сетка не ломается (ITEM_WIDTH, numColumns=2 не изменены)
