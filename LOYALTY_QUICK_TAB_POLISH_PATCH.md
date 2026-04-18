# Аккуратный патч: рерайт текста, прижатие футера, убрать подложку

**Дата:** 2026-01-27  
**Файл:** `mobile/src/components/loyalty/DiscountsQuickTab.tsx`

---

## ПРОБЛЕМЫ

1. Слетел рерайт описания скидки — показывается "сырой" текст вместо компактной версии
2. Кнопка "Активировать" поднята — нужно опустить ниже (ближе к нижней границе)
3. У кнопки ✏️ есть серая подложка — нужно убрать

---

## UNIFIED DIFF

### mobile/src/components/loyalty/DiscountsQuickTab.tsx

```diff
--- a/mobile/src/components/loyalty/DiscountsQuickTab.tsx
+++ b/mobile/src/components/loyalty/DiscountsQuickTab.tsx
@@ -199,10 +199,12 @@ export function DiscountsQuickTab({
                       <View style={styles.templateHeaderLeft}>
                         <Text style={styles.templateIcon}>{template.icon}</Text>
                         {(() => {
-                          const nameText = (template?.name ?? '').trim();
+                          const raw = (template?.name ?? '').trim();
+                          const compact = getCompactName(raw);
+                          const text = compact?.trim() ? compact : raw;
                           return (
                             <Text style={styles.templateName} numberOfLines={2} ellipsizeMode="tail">
-                              {nameText || getCompactName(template.name || '')}
+                              {text}
                             </Text>
                           );
                         })()}
@@ -205,10 +207,12 @@ export function DiscountsQuickTab({
                     {/* Content: Description */}
                     <View style={styles.templateContent}>
                       {(() => {
-                        const descText = (template?.description ?? '').trim();
+                        const raw = (template?.description ?? '').trim();
+                        const compact = getCompactDescription(raw);
+                        const text = compact?.trim() ? compact : raw;
                         return (
                           <Text style={styles.templateDescription} numberOfLines={2} ellipsizeMode="tail">
-                            {descText || getCompactDescription(template.description || '')}
+                            {text}
                           </Text>
                         );
                       })()}
@@ -470,7 +474,8 @@ const styles = StyleSheet.create({
   templateContent: {
     marginBottom: 8,
     minWidth: 0,
+    flexGrow: 1, // Толкает футер вниз
   },
   templateFooter: {
-    marginTop: 10, // Обычный margin вместо auto
+    // marginTop убран - прижатие через flexGrow у templateContent
   },
   templateFooterRow: {
@@ -500,7 +505,6 @@ const styles = StyleSheet.create({
     justifyContent: 'center',
     flexShrink: 0,
     marginLeft: 10,
-    backgroundColor: '#F2F2F2',
+    // backgroundColor убран - прозрачная кнопка
   },
   editIcon: {
     fontSize: 16,
```

---

## ЧТО И ПОЧЕМУ

### 1) Вернул рерайт текста (приоритет за compact)

**Было:**
```typescript
const nameText = (template?.name ?? '').trim();
{nameText || getCompactName(template.name || '')}  // ❌ Приоритет у сырого текста
```

**Стало:**
```typescript
const raw = (template?.name ?? '').trim();
const compact = getCompactName(raw);
const text = compact?.trim() ? compact : raw;  // ✅ Приоритет у compact
```

**Почему:** Раньше сырой текст (`nameText`) перебивал компактную версию, потому что условие `nameText || getCompactName(...)` сначала проверяло сырой текст. Теперь приоритет у компактной версии, fallback на исходное только если compact пустой.

### 2) Опустил кнопку "Активировать" ниже (flexGrow на content)

**Было:**
```typescript
templateContent: { marginBottom: 8, minWidth: 0 },
templateFooter: { marginTop: 10 },
```

**Стало:**
```typescript
templateContent: { marginBottom: 8, minWidth: 0, flexGrow: 1 },  // ✅ Толкает футер вниз
templateFooter: { /* marginTop убран */ },
```

**Почему:** `flexGrow: 1` на `templateContent` заставляет его занимать всё доступное пространство между header и footer, "толкая" футер вниз. Это стабильнее, чем `marginTop: 'auto'`, и не создаёт конфликтов с layout.

### 3) Убрал серую подложку у ✏️

**Было:**
```typescript
editIconButtonFooter: {
  // ...
  backgroundColor: '#F2F2F2',  // ❌ Серая подложка
},
```

**Стало:**
```typescript
editIconButtonFooter: {
  // ...
  // backgroundColor убран - прозрачная кнопка
},
```

**Почему:** Убрана серая подложка, кнопка ✏️ теперь прозрачная, как на ранних скринах.

---

## ИТОГОВЫЙ СТАТУС

### ✅ Выполнено:

1. ✅ Исправлена логика рерайта — приоритет за `getCompactDescription`/`getCompactName`
2. ✅ Добавлен `flexGrow: 1` на `templateContent` — футер прижат вниз
3. ✅ Убран `backgroundColor` из `editIconButtonFooter` — прозрачная кнопка ✏️

### 🎯 Ожидаемый результат:

- Описание показывается через компактную версию (mapping работает)
- Кнопка "Активировать" опущена ниже (ближе к нижней границе)
- ✏️ без серой подложки (прозрачная)
- Сетка не менялась (`ITEM_WIDTH`, `numColumns=2`, `COL_GAP`, `ROW_GAP`, `onLayout`)

---

## ПРИМЕЧАНИЯ

- Приоритет за компактными версиями текста (mapping работает)
- `flexGrow: 1` на content стабильно прижимает футер вниз
- Прозрачная кнопка ✏️ выглядит чище
- Сетка не изменена
- Бизнес-логика не изменена
