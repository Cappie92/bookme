# Проверка и улучшение Switch в DiscountsQuickTab

**Дата:** 2026-01-27  
**Файл:** `mobile/src/components/loyalty/DiscountsQuickTab.tsx`

---

## СТАТУС

✅ **Код уже использует стандартный Switch** — кастомный segmented toggle отсутствует.

✅ **Структура правильная:**
- Switch обёрнут в `switchWrap` (width: 44) для компактности
- `toggleRow` с `flex: 1`, `minWidth: 0`, `marginRight: 10`
- `toggleLabel` с `minWidth: 36` для защиты текста
- `editIconButtonFooter` с правильными размерами и прозрачным фоном

✅ **Нет transform: scale** — Switch компактный через layout, а не масштабирование.

---

## ВНЕСЁННЫЕ УЛУЧШЕНИЯ

### 1) Добавлен `flexShrink: 1` в `toggleLabel`

**Было:**
```typescript
toggleLabel: {
  marginLeft: 8,
  fontSize: 13,
  fontWeight: '500',
  minWidth: 36,
}
```

**Стало:**
```typescript
toggleLabel: {
  marginLeft: 8,
  fontSize: 13,
  fontWeight: '500',
  minWidth: 36, // Гарантирует место для текста "Вкл/Выкл"
  flexShrink: 1, // Позволяет сжиматься, но minWidth защищает от обрезания
}
```

**Результат:** Текст может сжиматься при необходимости, но `minWidth: 36` гарантирует, что "Вкл/Выкл" всегда поместится.

### 2) Добавлен `ellipsizeMode="tail"` в JSX

**Было:**
```tsx
<Text style={styles.toggleLabel} numberOfLines={1}>
  {isActive ? 'Вкл' : 'Выкл'}
</Text>
```

**Стало:**
```tsx
<Text style={styles.toggleLabel} numberOfLines={1} ellipsizeMode="tail">
  {isActive ? 'Вкл' : 'Выкл'}
</Text>
```

**Результат:** Если текст всё же не поместится (крайне маловероятно с `minWidth: 36`), он корректно обрежется с многоточием.

---

## ТЕКУЩАЯ СТРУКТУРА ФУТЕРА

```tsx
<View style={styles.templateFooterRow}>
  <View style={styles.toggleRow}>
    <View style={styles.switchWrap}>
      <Switch
        value={isActive}
        onValueChange={(nextValue) => {
          if (nextValue) {
            handleCreateFromTemplate(template);
          }
        }}
        disabled={isActive}
      />
    </View>
    <Text style={styles.toggleLabel} numberOfLines={1} ellipsizeMode="tail">
      {isActive ? 'Вкл' : 'Выкл'}
    </Text>
  </View>
  {showEdit && (
    <TouchableOpacity style={styles.editIconButtonFooter} ...>
      <Text style={styles.editIcon}>✏️</Text>
    </TouchableOpacity>
  )}
</View>
```

---

## СТИЛИ

```typescript
templateFooterRow: {
  flexDirection: 'row',
  alignItems: 'center',
  paddingRight: 10, // Отступ от правого края карточки для ✏️
},
toggleRow: {
  flexDirection: 'row',
  alignItems: 'center',
  flex: 1,
  minWidth: 0,
  marginRight: 10, // Разрыв между toggleRow и ✏️
},
switchWrap: {
  width: 44,
  alignItems: 'flex-start',
  justifyContent: 'center',
},
toggleLabel: {
  marginLeft: 8,
  fontSize: 13,
  fontWeight: '500',
  minWidth: 36, // Гарантирует место для текста "Вкл/Выкл"
  flexShrink: 1, // Позволяет сжиматься, но minWidth защищает от обрезания
},
editIconButtonFooter: {
  width: 34,
  height: 34,
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
  backgroundColor: 'transparent', // Прозрачный фон
},
```

---

## UNIFIED DIFF

```diff
--- a/mobile/src/components/loyalty/DiscountsQuickTab.tsx
+++ b/mobile/src/components/loyalty/DiscountsQuickTab.tsx
@@ -277,7 +277,7 @@ export function DiscountsQuickTab({
                               </View>
-                              <Text style={styles.toggleLabel} numberOfLines={1}>
+                              <Text style={styles.toggleLabel} numberOfLines={1} ellipsizeMode="tail">
                                 {isActive ? 'Вкл' : 'Выкл'}
                               </Text>
                             </View>
@@ -520,6 +520,7 @@ const styles = StyleSheet.create({
     fontSize: 13,
     fontWeight: '500',
     minWidth: 36, // Гарантирует место для текста "Вкл/Выкл"
+    flexShrink: 1, // Позволяет сжиматься, но minWidth защищает от обрезания
   },
   templateDiscountText: {
     fontSize: 12,
```

---

## ОБЪЯСНЕНИЕ: ПОЧЕМУ ТЕПЕРЬ ЛУЧШЕ

**Текущее состояние:**
- ✅ Используется стандартный Switch (не кастомный toggle)
- ✅ Switch компактный через `switchWrap` (width: 44) — БЕЗ transform: scale
- ✅ Текст "Вкл/Выкл" защищён `minWidth: 36` — всегда поместится
- ✅ ✏️ не прилипает к краю благодаря `paddingRight: 10` на `templateFooterRow`
- ✅ Правильная flex-структура: `toggleRow` (flex: 1) + ✏️ (flexShrink: 0)

**Внесённые улучшения:**
1. **`flexShrink: 1`** в `toggleLabel` — позволяет тексту сжиматься при необходимости, но `minWidth: 36` защищает от обрезания до "В"
2. **`ellipsizeMode="tail"`** — корректное обрезание текста, если он всё же не поместится (крайне маловероятно)

**Итог:** Футер стабилен, текст "Вкл/Выкл" всегда виден полностью, ✏️ не прилипает к краю, Switch компактный без transform.

---

## SMOKE CHECKLIST

### iPhone SE / узкие экраны:

- ✅ Текст "Вкл" полностью виден (не обрезается до "В")
- ✅ Текст "Выкл" полностью виден (не обрезается)
- ✅ ✏️ всегда справа, не прилипает к краю карточки (есть отступ 10px)
- ✅ ✏️ не обрезается, не "ездит"
- ✅ Switch компактный (ограничен контейнером 44px), но стандартный размер
- ✅ Нет пустот/провалов по вертикали под футером
- ✅ При включении Switch активируется скидка (когда `!isActive`)
- ✅ Switch disabled когда `isActive === true` (выключение не поддерживается)

---

## ПРИМЕЧАНИЯ

- Логика не изменена (только UI-улучшения)
- Сетка не изменена (`ITEM_WIDTH`, `numColumns=2`, `COL_GAP`, `ROW_GAP`, `onLayout`)
- Бизнес-логика не изменена (`handleCreateFromTemplate` вызывается при включении Switch)
- Выключение не поддерживается (когда `isActive === true`, Switch disabled)
- Фон ✏️ остался прозрачным (`backgroundColor: 'transparent'`)
- **НЕТ transform: scale** — компактность через layout (фиксированная ширина контейнера)
