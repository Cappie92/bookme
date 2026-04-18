# Baseline: Верстка "Быстрые скидки" (ДО исправлений)

**Дата:** 2026-01-21  
**Файл:** `mobile/src/components/loyalty/DiscountsQuickTab.tsx`

---

## 0) BASELINE ФАКТЫ

### 0.1 Структура сетки

**FlatList (строки 93-183):**
```tsx
<FlatList
  scrollEnabled={false}
  removeClippedSubviews={false}
  nestedScrollEnabled={true}
  data={templates}
  numColumns={2}
  keyExtractor={(item) => item.id}
  contentContainerStyle={styles.templatesGrid}  // gap: 12
  columnWrapperStyle={styles.templatesRow}    // justifyContent: 'space-between', gap: 12
  renderItem={({ item: template }) => { ... }}
/>
```

**Стили сетки (строки 284-291):**
```tsx
templatesGrid: {
  paddingBottom: 8,
  gap: 12,  // ⚠️ Может быть нестабильно на старых версиях RN
},
templatesRow: {
  justifyContent: 'space-between',
  gap: 12,  // ⚠️ Может быть нестабильно
},
```

**Проблемы:**
- Используется `gap` (требует RN 0.71+), может быть нестабильно
- Карточки используют `flex: 1` без четких margins, могут "уезжать"
- Нет контроля ширины карточек на узких экранах

### 0.2 Структура карточки

**JSX структура (строки 106-180):**
```tsx
<Card style={[styles.templateCard, isActive && styles.templateCardActive]}>
  {/* Header */}
  <View style={styles.templateHeader}>
    <Text style={styles.templateIcon}>{template.icon}</Text>
    {isActive && <View style={styles.activeBadge}>...</View>}
  </View>
  
  {/* Content */}
  <Text style={styles.templateName}>{template.name}</Text>
  <Text style={styles.templateDescription} numberOfLines={3}>{template.description}</Text>
  
  {/* Footer/Actions */}
  <View style={styles.templateActions}>
    {editingTemplate === template.id ? (
      // Режим редактирования
    ) : (
      // Обычный режим
    )}
  </View>
</Card>
```

**Стили карточки (строки 292-303):**
```tsx
templateCard: {
  flex: 1,
  minHeight: 200,  // ⚠️ Фиксированная минимальная высота
  padding: 16,
  borderWidth: 1,
  borderColor: '#E0E0E0',
  marginBottom: 12,
},
```

**Проблемы:**
- `minHeight: 200` фиксированная, но контент разный → карточки разной высоты
- Нет структуры для прижатия footer к низу
- `templateDescription` имеет `flex: 1` (строка 334), что может вызывать проблемы

### 0.3 Кнопка "Активировать"

**JSX (строки 168-176):**
```tsx
<TouchableOpacity
  style={[styles.activateButton, isActive && styles.activateButtonDisabled]}
  onPress={() => handleCreateFromTemplate(template)}
  disabled={isActive}
>
  <Text style={[styles.activateButtonText, isActive && styles.activateButtonTextDisabled]}>
    {isActive ? 'Активна' : 'Активировать'}
  </Text>
</TouchableOpacity>
```

**Стили (строки 355-372):**
```tsx
activateButton: {
  backgroundColor: '#4CAF50',
  paddingVertical: 8,
  paddingHorizontal: 16,  // ⚠️ Может быть недостаточно для "Активировать"
  borderRadius: 8,
  alignItems: 'center',
},
activateButtonText: {
  color: '#fff',
  fontSize: 12,
  fontWeight: '600',
  // ⚠️ НЕТ numberOfLines={1}
},
```

**Проблемы:**
- `paddingHorizontal: 16` может быть недостаточно для длинного текста "Активировать"
- Нет `numberOfLines={1}` на тексте → переносится на 2 строки
- Нет фиксированной высоты кнопки
- Нет `alignSelf: 'stretch'` → кнопка может не занимать всю ширину

### 0.4 Режим редактирования (editingTemplate)

**JSX (строки 121-149):**
```tsx
<View style={styles.editContainer}>
  <View style={styles.editInputContainer}>
    <TextInput ... />
    <Text style={styles.percentSymbol}>%</Text>
  </View>
  <TouchableOpacity style={styles.saveButton}>...</TouchableOpacity>
  <TouchableOpacity style={styles.cancelButton}>...</TouchableOpacity>
</View>
```

**Стили (строки 373-419):**
```tsx
editContainer: {
  flexDirection: 'row',
  alignItems: 'center',
  gap: 8,  // ⚠️ Может быть нестабильно
  marginTop: 8,
},
editInputContainer: {
  flexDirection: 'row',
  alignItems: 'center',
  borderWidth: 1,
  borderColor: '#4CAF50',
  borderRadius: 4,
  paddingHorizontal: 8,
  minWidth: 60,  // ⚠️ Может быть недостаточно
},
```

**Проблемы:**
- Используется `gap: 8` → может быть нестабильно
- Элементы в одну строку могут не помещаться на узких экранах
- Нет контроля переноса на 2 строки

### 0.5 Текст и переносы

**templateName (строки 324-329):**
```tsx
templateName: {
  fontSize: 16,
  fontWeight: '600',
  color: '#333',
  marginBottom: 4,
  // ⚠️ НЕТ numberOfLines
},
```

**templateDescription (строки 330-335):**
```tsx
templateDescription: {
  fontSize: 12,
  color: '#666',
  marginBottom: 12,
  flex: 1,  // ⚠️ Может вызывать проблемы
},
// В JSX: numberOfLines={3}
```

**Проблемы:**
- `templateName` не имеет `numberOfLines` → может ломать верстку
- `templateDescription` имеет `flex: 1` → может растягиваться непредсказуемо

### 0.6 Card компонент

**Файл:** `mobile/src/components/Card.tsx`

**Реализация:**
```tsx
export function Card({ children, style, padding = 16 }: CardProps) {
  return (
    <View style={[styles.card, { padding }, style]}>
      {children}
    </View>
  );
}
```

**Дефолтные стили:**
```tsx
card: {
  backgroundColor: '#fff',
  borderRadius: 12,
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.1,
  shadowRadius: 4,
  elevation: 3,
},
```

**Факт:** Card добавляет `padding: 16` по умолчанию, но в `templateCard` переопределяется через `style` prop.

### 0.7 Состояния, ломающие верстку

1. **editingTemplate === template.id:**
   - Режим редактирования может не помещаться в одну строку
   - Элементы могут выходить за границы карточки

2. **isActive:**
   - Бейдж "Активна" появляется/исчезает → header "прыгает"
   - Кнопка меняется на disabled → может менять размер

3. **Отсутствие description:**
   - `templateDescription` с `flex: 1` может вести себя странно

4. **Длинный title/description:**
   - `templateName` без `numberOfLines` может ломать верстку
   - `templateDescription` с `numberOfLines={3}` но `flex: 1` может быть проблемой

5. **Маленькие экраны:**
   - Карточки с `flex: 1` могут быть слишком узкими
   - Кнопка "Активировать" переносится на 2 строки

---

## ВЫВОДЫ ПО ПРОБЛЕМАМ

1. **Сетка:** `gap` нестабилен, нет четких margins между карточками
2. **Карточка:** Нет 3-секционной структуры, footer не прижат к низу
3. **Кнопка "Активировать":** Нет защиты от переноса текста, недостаточный padding
4. **Режим редактирования:** Использует `gap`, может не помещаться
5. **Текст:** `templateName` без ограничения строк, `templateDescription` с `flex: 1`

---

## ПРИЧИНЫ "ПОЕХАВШЕГО" UI

1. **Кнопка "Активировать" переносится:**
   - `paddingHorizontal: 16` недостаточно для текста "Активировать" (11 символов)
   - Нет `numberOfLines={1}` на тексте
   - Нет фиксированной высоты кнопки
   - Кнопка не занимает всю ширину карточки

2. **Разный размер карточек:**
   - `minHeight: 200` фиксированная, но контент разный
   - `templateDescription` с `flex: 1` растягивается по-разному
   - Footer не прижат к низу → разная высота

3. **Элементы не выровнены:**
   - Использование `gap` может быть нестабильно
   - Нет четких margins между элементами
   - Карточки в колонках могут иметь разную ширину из-за `flex: 1` без контроля

4. **Конфликты по ширине:**
   - Режим редактирования может не помещаться
   - Кнопки и инпуты не имеют четких ограничений ширины
