# RCA: Статистика mobile — фиксы «Изменение 0%» и «График по дням не кликается»

## Карта архитектуры

### Mobile
- **Экран:** `mobile/app/master/stats.tsx`
- **Компонент графика:** `mobile/src/components/stats/BarLineChart.tsx` (кастомный, на View/Pressable)
- **API:** `getDashboardStats(period, offset)` → `GET /api/master/dashboard/stats?period=&offset=`
- **DTO:** `DashboardStats` (current_week_bookings, previous_week_bookings, weeks_data, …)

### Web
- **Страница:** `frontend/src/components/MasterStats.jsx`
- **Графики:** recharts (ComposedChart, Bar, XAxis)
- **API:** тот же `/api/master/dashboard/stats`

### Backend
- **Endpoint:** `GET /api/master/dashboard/stats` (master.py)
- **Периоды:** day (5 дней), week (5 недель), month (5 месяцев), quarter (5 кварталов), year (5 лет)
- **weeks_data:** массив `{ period_label, bookings, income, is_current, is_past, is_future }`

---

## Bug 1: «Изменение 0%» при Yesterday=0

### Root cause
`calcPercent(current, previous)` возвращал `0`, когда `previous <= 0`:
```ts
if (!previous || previous <= 0) return 0;
```
При сегодня=3 и вчера=0 это давало 0%, что некорректно (деление на 0 не определено).

### Решение
- Введена функция `calcChange(current, previous)` в `mobile/src/utils/statsChange.ts`.
- При `previous=0` и `current>0`: `percent=null`, `label="рост от нулевой базы"`, `absoluteDelta=current`.
- При `previous>0` и `current=0`: `percent=-100`.
- При `previous=0` и `current=0`: `percent=0`.
- KPI и tooltip графика используют эту логику и показывают либо процент, либо подпись.

---

## Bug 2: График по дням не кликается / не скроллится

### Root cause (гипотезы)
1. **Размер hit zones:** при 5 точках ширина зоны ≈ `w/5`. На узких экранах это могло быть слишком мало.
2. **Жесты:** вертикальный ScrollView мог перехватывать касания.
3. **Отсутствие горизонтального скролла:** при >5 точках график не было возможности прокручивать.

### Решение
1. Минимальная ширина hit zone: `Math.max(step, 44)`.
2. `collapsable={false}` у контейнера графика.
3. `delayPressIn={0}` у Pressable.
4. `nestedScrollEnabled: true` и `keyboardShouldPersistTaps: 'handled'` у родительского ScrollView (stats).
5. Для `data.length > 5` график оборачивается в горизонтальный ScrollView с `contentContainerStyle={{ width: chartContentWidth }}`.
6. Гарантированная минимальная ширина контента: `56px` на точку.

---

## Изменённые файлы

| Файл | Изменения |
|------|-----------|
| `mobile/src/utils/statsChange.ts` | Новый util `calcChange` |
| `mobile/src/utils/statsChange.ts` | — |
| `mobile/app/master/stats.tsx` | calcChange вместо calcPercent, KPI/tooltip по новой логике, scrollViewProps |
| `mobile/src/components/stats/BarLineChart.tsx` | lineLabel, ScrollView horizontal при >5 точках, hit zones min 44px, delayPressIn |
| `mobile/__tests__/unit/utils/statsChange.test.ts` | Unit-тесты calcChange |

---

## Чеклист ручной проверки

1. **KPI — today=3, yesterday=0:** показывает «рост от нулевой базы» и «+3», без 0%.
2. **KPI — today=0, yesterday=3:** показывает -100%.
3. **KPI — today=3, yesterday=3:** показывает 0%.
4. **KPI — today=0, yesterday=0:** показывает 0% или «—».
5. **График — период «Неделя»:** тап по столбику показывает tooltip.
6. **График — период «День»:** тап по столбику показывает tooltip.
7. **Tooltip — previous=0:** вместо «+X%» показывается «рост от нулевой базы».
8. **iOS и Android:** тапы и скролл работают в обоих режимах.
