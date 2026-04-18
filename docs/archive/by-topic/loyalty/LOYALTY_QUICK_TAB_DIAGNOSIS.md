# Диагностика верстки "Быстрые скидки" (ШАГ 0)

**Дата:** 2026-01-27  
**Файл:** `mobile/src/components/loyalty/DiscountsQuickTab.tsx`

---

## ТЕКУЩИЙ КОД ВЕРСТКИ

### 1. JSX разметка карточки (строки 116-201)

```tsx
<View style={[styles.templateCardWrapper, { width: ITEM_WIDTH, marginBottom: ROW_GAP }]}>
  <Card style={cardStyle}>
    <View style={styles.templateCardInner}>
      {/* Header: Icon + Actions (Badge + Edit) */}
      <View style={styles.templateHeader}>
        <Text style={styles.templateIcon}>{template.icon}</Text>
        <View style={styles.templateHeaderActions}>
          {isActive && (
            <View style={styles.activeBadge}>
              <Text style={styles.activeBadgeText}>Активна</Text>
            </View>
          )}
          {!isActive && editingTemplate !== template.id && (
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
      </View>
      
      {/* Content: Name + Description */}
      <View style={styles.templateContent}>
        <Text style={styles.templateName} numberOfLines={2}>{template.name}</Text>
        <Text style={styles.templateDescription} numberOfLines={2}>{template.description}</Text>
      </View>
      
      {/* Footer: Actions */}
      <View style={styles.templateFooter}>
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
              <Text style={styles.saveButtonText} numberOfLines={1}>Сохранить</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => {
                setEditingTemplate(null);
                setEditTemplateValue('');
              }}
            >
              <Text style={styles.cancelButtonText} numberOfLines={1}>Отмена</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <Text style={styles.templateDiscountText} numberOfLines={1}>
              Скидка: {template.default_discount}%
            </Text>
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
      </View>
    </View>
  </Card>
</View>
```

### 2. FlatList props (строки 101-109)

```tsx
<FlatList
  scrollEnabled={false}
  removeClippedSubviews={false}
  nestedScrollEnabled={true}
  data={templates}
  numColumns={2}
  keyExtractor={(item) => item.id}
  contentContainerStyle={styles.templatesGrid}
  columnWrapperStyle={styles.templatesRow}
  renderItem={({ item: template }) => { ... }}
/>
```

### 3. Константы для сетки (строки 39-45)

```tsx
const { width: screenWidth } = useWindowDimensions();

// Константы для сетки
const CONTAINER_PADDING = 16; // padding от styles.container (единственный источник горизонтального padding)
const COL_GAP = 12; // Расстояние между колонками
const ROW_GAP = 12; // Расстояние между рядами
const ITEM_WIDTH = Math.floor((screenWidth - 2 * CONTAINER_PADDING - COL_GAP) / 2);
```

### 4. Стили, влияющие на сетку и карточку

```tsx
const styles = StyleSheet.create({
  container: {
    padding: 16,  // Горизонтальный padding для всего контейнера
  },
  templatesGrid: {
    paddingBottom: 8,
  },
  templatesRow: {
    justifyContent: 'space-between',  // Распределяет элементы в ряду
  },
  templateCardWrapper: {
    // width задается динамически через inline style: { width: ITEM_WIDTH, marginBottom: ROW_GAP }
  },
  templateCard: {
    width: '100%',
    padding: 0,  // Padding перенесен в templateCardInner
    borderWidth: 1,  // ⚠️ ПРОБЛЕМА: borderWidth добавляет 2px к ширине (1px с каждой стороны)
    borderColor: '#E0E0E0',
  },
  templateCardActive: {
    borderColor: '#4CAF50',
    backgroundColor: '#E8F5E9',
  },
  templateCardInner: {
    flex: 1,
    padding: 12,
    justifyContent: 'space-between',
  },
  templateHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    minHeight: 32,
  },
  templateHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  templateIcon: {
    fontSize: 28,
  },
  templateContent: {
    flexGrow: 1,
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
  templateFooter: {
    marginTop: 12,
  },
  activateButton: {
    backgroundColor: '#4CAF50',
    height: 44,
    width: '100%',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // ... остальные стили
});
```

---

## ДИАГНОЗ: ЧТО ЛОМАЕТ LAYOUT

### Проблема 1: borderWidth добавляет к ширине карточки

**Текущая ситуация:**
- `templateCard` имеет `borderWidth: 1` и `width: '100%'`
- `borderWidth: 1` добавляет 2px к общей ширине (1px с каждой стороны)
- Итоговая ширина карточки = `ITEM_WIDTH + 2px` (из-за border)

**Математика:**
- `ITEM_WIDTH = (screenWidth - 2*16 - 12) / 2`
- Для iPhone SE (375px): `ITEM_WIDTH = (375 - 32 - 12) / 2 = 165.5px`
- Реальная ширина карточки: `165.5 + 2 = 167.5px` (из-за border)
- Сумма двух карточек: `167.5 + 167.5 + 12 = 347px`
- Доступная ширина: `375 - 32 = 343px`
- **Переполнение: 347px > 343px → обрезка справа!**

**Решение:** Учесть `borderWidth` в расчете `ITEM_WIDTH` или использовать `box-sizing: border-box` (но в RN нет такого свойства, нужно вычитать border из width).

### Проблема 2: Структура header не соответствует требованиям

**Текущая структура:**
```
Header:
  ├─ Icon (слева)
  └─ Actions (справа: badge + карандаш)

Content:
  ├─ Name (название)
  └─ Description
```

**Требуется:**
```
Header:
  ├─ Icon (слева, меньше, по центру)
  ├─ Name (название в 2 строки, справа от иконки)
  └─ Actions (справа: badge + карандаш)
```

**Проблема:** Название находится в Content, а должно быть в Header рядом с иконкой.

### Проблема 3: Возможные проблемы с overflow

- Card имеет `width: '100%'` внутри wrapper с `width: ITEM_WIDTH`
- Если есть какие-то внутренние margins/padding, которые не учтены, может быть переполнение
- `activateButton` имеет `width: '100%'`, что правильно, но если Card имеет border, то кнопка может выходить за границы

---

## ПЛАН ИСПРАВЛЕНИЙ

### ШАГ 1: Исправить сетку (учесть borderWidth)

1. Вычесть `borderWidth * 2` из `ITEM_WIDTH` или установить `width` на Card с учетом border
2. Альтернатива: обернуть Card в View без border, а border добавить на wrapper

### ШАГ 2: Переделать header

1. Переместить название из Content в Header
2. Структура: Icon (слева) + Name (справа от иконки, flex: 1) + Actions (справа)
3. Иконка меньше (24-28px) и по центру вертикально
4. Название `numberOfLines={2}`

### ШАГ 3: Улучшить footer и кнопку

1. Убедиться что кнопка не обрезается
2. Footer прижат к низу через flex контейнер

---

## ИСПОЛЬЗОВАНИЕ КОМПОНЕНТА

**Где используется:**
- `mobile/app/master/loyalty.tsx` (строки 735-750)
- Рендерится внутри `<View style={styles.content}>` (не ScrollView напрямую)
- Родительский контейнер имеет `padding: 16` (через ScreenContainer или напрямую)

**ScreenContainer:**
- `scrollable={true}` → ScrollView с `contentContainerStyle: { padding: 16 }`
- `scrollable={false}` → View с `padding: 16`

**Card компонент:**
- Дефолтный `padding = 16`, но в `templateCard` установлен `padding: 0`
- Padding перенесен в `templateCardInner: padding: 12`
- Card имеет `borderRadius: 12`, `shadowColor`, `elevation: 3`

---

## ВЫВОД

**Основные проблемы:**
1. ❌ `borderWidth: 1` добавляет 2px к ширине карточки → переполнение → обрезка справа
2. ❌ Структура header не соответствует требованиям (название должно быть в header, а не в content)
3. ⚠️ Возможные проблемы с overflow из-за неучтенных margins/padding

**Следующие шаги:**
1. Исправить расчет ширины с учетом borderWidth
2. Переделать структуру header (icon + name в одном ряду)
3. Убедиться что ничего не обрезается
