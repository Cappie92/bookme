# Диагностика регрессии сетки "Быстрые скидки"

**Дата:** 2026-01-21  
**Проблема:** После последних правок карточки стали занимать почти всю ширину строки вместо половины

---

## 0) BASELINE (ТЕКУЩЕЕ СОСТОЯНИЕ ПОСЛЕ РЕГРЕССИИ)

### 0.1 Текущий код renderItem wrapper

**Файл:** `mobile/src/components/loyalty/DiscountsQuickTab.tsx`

**Строки 106-187:**
```tsx
<View style={styles.templateCardWrapper}>
  <Card style={[styles.templateCard, isActive && styles.templateCardActive]}>
    {/* ... содержимое карточки ... */}
  </Card>
</View>
```

**Стили wrapper (строки 298-301):**
```tsx
templateCardWrapper: {
  flex: 1,
  marginHorizontal: 6,
},
```

### 0.2 Стили FlatList

**contentContainerStyle (строки 291-293):**
```tsx
templatesGrid: {
  paddingBottom: 8,
  // ⚠️ НЕТ paddingHorizontal
},
```

**columnWrapperStyle (строки 294-297):**
```tsx
templatesRow: {
  justifyContent: 'space-between',
  marginBottom: 12,
},
```

### 0.3 Причина регрессии

**ПРОБЛЕМА 1: `flex: 1` + `marginHorizontal: 6` ломает математику ширины**

Когда FlatList с `numColumns={2}` использует `columnWrapperStyle` с `justifyContent: 'space-between'`, он ожидает, что каждый элемент в `renderItem` будет иметь определенную ширину. Но:

- `flex: 1` на wrapper означает "занять доступное пространство"
- `marginHorizontal: 6` добавляет 12px к ширине (6px слева + 6px справа)
- При `justifyContent: 'space-between'` FlatList пытается распределить элементы, но `flex: 1` + margin может давать непредсказуемый результат

**Математика:**
- Если ширина экрана = 375px (iPhone SE)
- Если есть padding контейнера = 16px (из ScreenContainer или container)
- То доступная ширина = 375 - 2*16 = 343px
- С `flex: 1` + `marginHorizontal: 6` каждый элемент пытается занять (343 - 12) / 2 = 165.5px, но margin добавляет еще 12px → 177.5px
- Сумма: 177.5 + 177.5 + 12 = 367px > 343px → **ПЕРЕПОЛНЕНИЕ**

**ПРОБЛЕМА 2: Нет явного контроля ширины**

- Нет `paddingHorizontal` в `templatesGrid` → отступы неконтролируемые
- Нет явной ширины элемента → зависимость от `flex: 1` и margin

**ПРОБЛЕМА 3: `justifyContent: 'space-between'` с `flex: 1`**

- `justifyContent: 'space-between'` работает лучше с фиксированными ширинами
- `flex: 1` может давать разные результаты в зависимости от контента

---

## ВЫВОД: ЧТО ЛОМАЕТ СЕТКУ

1. **`flex: 1` на `templateCardWrapper`** — непредсказуемая ширина
2. **`marginHorizontal: 6`** — добавляет лишние пиксели к ширине
3. **Отсутствие `paddingHorizontal` в `templatesGrid`** — нет контроля отступов
4. **Комбинация `justifyContent: 'space-between'` + `flex: 1`** — конфликт стратегий layout

---

## РЕШЕНИЕ: ЯВНАЯ МАТЕМАТИКА ШИРИНЫ

Использовать `useWindowDimensions()` для вычисления `ITEM_WIDTH` и явно задавать ширину каждого элемента.
