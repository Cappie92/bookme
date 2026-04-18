# Исправление верстки edit-режима в карточке скидки (DiscountsQuickTab)

## Почему карточка переставала быть компактной

1. **`flexWrap: 'wrap'`** — контейнер edit-режима был `flexDirection: 'row'` с переносом. При узкой ширине карточки input и две кнопки не помещались в одну строку, кнопки переносились вниз и карточка росла по высоте.
2. **Лишние отступы** — у `editInputContainer` и у обеих кнопок стояли `marginBottom: 6` и `marginRight: 6`. Это добавляло вертикальный «ступень» и визуально раздувало блок.
3. **Нет явного ряда для кнопок** — кнопки «Сохранить» и «Отмена» были просто следующими flex-элементами в одном ряду с input; при переносе они оказывались друг под другом.

В итоге при входе в edit высота карточки заметно увеличивалась и сетка «прыгала».

---

## Внесённые изменения (unified diff)

### 1) JSX — карточки шаблонов (editingTemplate === template.id)

**Было:**
```jsx
<View style={styles.editContainer}>
  <View style={styles.editInputContainer}>
    <TextInput ... />
    <Text style={styles.percentSymbol}>%</Text>
  </View>
  <TouchableOpacity style={styles.saveButton} onPress={...}>
    <Text ...>Сохранить</Text>
  </TouchableOpacity>
  <TouchableOpacity style={styles.cancelButton} onPress={...}>
    <Text ...>Отмена</Text>
  </TouchableOpacity>
</View>
```

**Стало:**
```jsx
<View style={styles.editContainer}>
  <View style={styles.editInputRow}>
    <View style={styles.editInputContainer}>
      <TextInput ... />
      <Text style={styles.percentSymbol}>%</Text>
    </View>
  </View>
  <View style={styles.editActionsRow}>
    <TouchableOpacity style={styles.saveButton} onPress={...}>
      <Text ...>Сохранить</Text>
    </TouchableOpacity>
    <TouchableOpacity style={styles.cancelButton} onPress={...}>
      <Text ...>Отмена</Text>
    </TouchableOpacity>
  </View>
</View>
```

### 2) JSX — блок активных скидок (editingDiscount === discount.id)

Та же структура: `editContainer` → `editInputRow` (input + %) и `editActionsRow` (Сохранить | Отмена) в одну строку. Кнопки используют `saveButtonSmall` / `cancelButtonSmall`.

### 3) Стили

**editContainer:**
- Было: `flexDirection: 'row'`, `flexWrap: 'wrap'`, `alignItems: 'center'`, `marginTop: 0`.
- Стало: `flexDirection: 'column'`, `alignItems: 'flex-start'` (без wrap и лишних отступов).

**Новые стили:**
- `editInputRow`: `flexDirection: 'row'`, `alignItems: 'center'`, `marginBottom: 6` (единственный небольшой отступ между строкой input и строкой кнопок).
- `editActionsRow`: `flexDirection: 'row'`, `alignItems: 'center'`, `gap: 8`.

**editInputContainer:**
- Убраны `marginRight: 6` и `marginBottom: 6` (ширина и отступы задаются через `editInputRow`).

**saveButton / cancelButton:**
- Фиксированная высота `height: 36` вместо `minHeight: 40` и `paddingVertical: 8`.
- Убраны `marginRight` и `marginBottom` (расстояние между кнопками — через `gap: 8` в `editActionsRow`).

**saveButtonSmall / cancelButtonSmall:**
- `height: 36`, выравнивание `alignItems: 'center'`, `justifyContent: 'center'`.
- У `cancelButtonSmall` добавлен `backgroundColor: '#E0E0E0'`, убраны `marginLeft` (используется `gap` в ряду).

---

## Smoke-check

- [x] **Edit-режим не раздувает карточку** — два ряда (input и кнопки) с одним небольшим `marginBottom: 6` между ними; лишние отступы у элементов убраны.
- [x] **Кнопки в одну линию** — «Сохранить» и «Отмена» лежат в `editActionsRow` с `flexDirection: 'row'` и `gap: 8`.
- [x] **Сетка не прыгает при входе/выходе из редактирования** — высота edit-блока близка к высоте обычного футера (одна строка текста + один ряд со Switch/✏️); фиксированная высота карточки и grid не менялись.
- [x] Бизнес-логика, Switch, отображение ✏️ и сетка (ITEM_WIDTH, numColumns) не менялись.

Файл: `mobile/src/components/loyalty/DiscountsQuickTab.tsx`.
