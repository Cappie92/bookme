# RCA: Day-режим статистики mobile — скролл и тап не работали

## Root cause

**1. Скролл не работал**

- Контент горизонтального ScrollView не был обёрнут в View с явной шириной; при использовании fragment (`<>`) дочерние элементы могли не задавать корректную ширину контента.
- `chartContentWidth` считался, но ширина применялась только к `plotArea`, без общего контейнера — `contentContainerStyle` не получал надёжной ширины.
- На iOS вложенный горизонтальный ScrollView внутри вертикального мог конфликтовать из‑за жестов.

**2. Тап не работал**

- Hit-зоны (`Pressable`) могли перекрываться или не совпадать с визуальными столбиками при разной ширине шага.
- Не было `hitSlop` — узкие зоны на 19 точках снижали вероятность срабатывания.
- Не задавался начальный `selected_index` от API — блок деталей не отображался до первого тапа.

**3. График стартовал слева (v2)**

- При открытии Day ScrollView показывал x=0 — левый край окна, а не anchor/today.
- Не было автоскролла к selected_index.

**4. Day визуально отличался от Week (v2)**

- Подсветка: selected bar не всегда зелёный (использовался цвет из data).
- X-лейблы при 19 точках перегружали ось.

**5. Подсветка не работала / scroll телепорт (v3)**

- Сравнение selectedIndex === p.i могло ломаться (типы); bar с height=0 был невидим.
- scrollTo(animated: false) при тапе давал ощущение скачка.

## Исправления

1. **BarLineChart**
   - Один контейнер `View` с `width: chartContentWidth` вокруг plot + labels.
   - `ITEM_W = 48`, `contentWidth = max(viewport, data.length * 48)`.
   - `contentContainerStyle: { width, minWidth: chartContentWidth }`.
   - Hit-зоны: `hitSlop`, `width: max(48, step)`.
   - `initialSelectedIndex` от API.
   - **Auto-scroll**: ref + useEffect, scrollTo к центру selected бара при mount и смене selected_index.
   - **Подсветка**: selected bar всегда зелёный; `Number(selectedIndex) === Number(p.i)`; minHeight 4 + border при выборе.
   - **Скролл при тапе**: `scrollFromTapRef` → `animated: true`, `InteractionManager.runAfterInteractions`.
   - **Скролл при init**: `animated: false`; `lastScrolledIndexRef` чтобы не дублировать.

2. **stats.tsx**
   - `initialSelectedIndex`, `onBarSelect` для dev-лога (selected_index, anchor_date, range_start).
