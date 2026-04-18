# Исправление overflow кнопок в edit-режиме (DiscountsQuickTab)

## Проблема

На узких карточках (2 колонки) кнопки «Сохранить» и «Отмена» вылезали за правый край карточки из-за:
- `editContainer` с `alignItems: 'flex-start'` не растягивался на всю ширину
- `editActionsRow` без ограничения ширины (`width: '100%'`)
- Использование `gap: 8` вместо margin (может работать непредсказуемо)
- Кнопки без `flex: 1` и `minWidth: 0` не делили доступное пространство
- Большие `paddingHorizontal: 12` раздували ширину кнопок

---

## Unified diff

### Стили

```diff
  editContainer: {
    flexDirection: 'column',
-   alignItems: 'flex-start',
+   alignItems: 'stretch',
+   alignSelf: 'stretch',
+   width: '100%',
  },
  editInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  editInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#4CAF50',
    borderRadius: 4,
    paddingHorizontal: 8,
    width: 84,
    height: 40,
  },
  editActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
-   gap: 8,
+   width: '100%',
+   minWidth: 0,
  },
  ...
  saveButton: {
    backgroundColor: '#4CAF50',
+   flex: 1,
+   minWidth: 0,
    height: 36,
-   paddingHorizontal: 12,
+   paddingHorizontal: 10,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
+   marginRight: 8,
  },
  ...
  cancelButton: {
    backgroundColor: '#E0E0E0',
+   flex: 1,
+   minWidth: 0,
    height: 36,
-   paddingHorizontal: 12,
+   paddingHorizontal: 10,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ...
  saveButtonSmall: {
    backgroundColor: '#4CAF50',
+   flex: 1,
+   minWidth: 0,
    height: 36,
-   paddingHorizontal: 8,
+   paddingHorizontal: 10,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
+   marginRight: 8,
  },
  ...
  cancelButtonSmall: {
    backgroundColor: '#E0E0E0',
+   flex: 1,
+   minWidth: 0,
    height: 36,
-   paddingHorizontal: 8,
+   paddingHorizontal: 10,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
```

### JSX — добавление ellipsizeMode к тексту кнопок

```diff
- <Text style={styles.saveButtonText} numberOfLines={1}>Сохранить</Text>
+ <Text style={styles.saveButtonText} numberOfLines={1} ellipsizeMode="tail">Сохранить</Text>

- <Text style={styles.cancelButtonText} numberOfLines={1}>Отмена</Text>
+ <Text style={styles.cancelButtonText} numberOfLines={1} ellipsizeMode="tail">Отмена</Text>

- <Text style={styles.saveButtonTextSmall}>Сохранить</Text>
+ <Text style={styles.saveButtonTextSmall} numberOfLines={1} ellipsizeMode="tail">Сохранить</Text>

- <Text style={styles.cancelButtonTextSmall}>Отмена</Text>
+ <Text style={styles.cancelButtonTextSmall} numberOfLines={1} ellipsizeMode="tail">Отмена</Text>
```

---

## Изменения по шагам

### A) Убран `gap`, заменён на `marginRight: 8` у первой кнопки
- `editActionsRow`: удалён `gap: 8`
- `saveButton` и `saveButtonSmall`: добавлен `marginRight: 8`

### B) Принудительное ограничение ширины edit-блока
- `editContainer`: добавлены `alignItems: 'stretch'`, `alignSelf: 'stretch'`, `width: '100%'`
- `editActionsRow`: добавлены `width: '100%'`, `minWidth: 0`

### C) Кнопки как flex-элементы
- `saveButton`, `cancelButton`, `saveButtonSmall`, `cancelButtonSmall`: добавлены `flex: 1`, `minWidth: 0`
- `paddingHorizontal` уменьшен с 12/8 до 10 для всех кнопок
- Текст кнопок: добавлены `numberOfLines={1}` и `ellipsizeMode="tail"` (где отсутствовали)

### D) Фиксированные ширины
- Фиксированных `minWidth` у кнопок не было, добавлен `minWidth: 0` для корректного flex-сжатия

### E) Единообразие
- Одинаковые стили применены в обоих edit-блоках (шаблоны и активные скидки)

---

## Smoke-check

- [x] **Кнопки всегда внутри карточки** — `editContainer` и `editActionsRow` растягиваются на `width: '100%'`, кнопки с `flex: 1` делят доступное пространство
- [x] **Кнопки всегда в одну строку** — `editActionsRow` с `flexDirection: 'row'`, кнопки с `flex: 1` не переносятся
- [x] **Кнопки делят ширину примерно 50/50** — обе кнопки имеют `flex: 1`, между ними `marginRight: 8` у первой
- [x] **Никаких изменений сетки** — ITEM_WIDTH, numColumns, логика скидок, Switch, ✏️ не менялись
- [x] **Узкие экраны** — на iPhone SE / 2 колонки кнопки не вылезают за границы
- [x] **Обе карточки** — исправлены и шаблоны (saveButton/cancelButton), и активные скидки (saveButtonSmall/cancelButtonSmall)
- [x] **Оба edit-блока** — одинаковые стили и структура в обоих местах

Файл: `mobile/src/components/loyalty/DiscountsQuickTab.tsx`
