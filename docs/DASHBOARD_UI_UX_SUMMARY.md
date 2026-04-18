# Дашборд мастера — UI/UX правки

## Изменения

### 1. `frontend/src/utils/bookingStatusDisplay.js` (новый)
- Общий маппинг `STATUS_LABELS` и helper `getStatusBadgeForPast(booking, master, now)`.
- Используется в AllBookingsModal и MasterDashboardStats.

### 2. `frontend/src/components/AllBookingsModal.jsx`
- `STATUS_LABELS` вынесен в bookingStatusDisplay, используется `getStatusBadgeForPast`.
- Иконка (i) перенесена рядом с именем клиента: обёртка `flex items-center gap-1` вокруг ClientDisplay + кнопка (i).
- Иконка: `text-gray-900`, `no-underline`.

### 3. `frontend/src/components/MasterDashboardStats.jsx`
- **Иконка (i):** рядом с именем клиента (`clientLabel` + кнопка в одной группе `flex items-center gap-1`).
- **Статус в «Прошедших записях»:** бейдж через `getStatusBadgeForPast` (Отменено/Завершено/Требует подтверждения и т.п.).
- **«Все записи»:** оформление как outline-кнопка, зелёная (`text-green-600`, `border-green-600/40`, `hover:bg-green-50`).
- **Статистика услуг:** «По записям» активный — `text-green-600`; номера #1/#2/#3 — `text-green-600`.
- **Кнопка «Статистика»:** `bg-green-600 hover:bg-green-700 focus:ring-green-500`.

---

## QA-чеклист

1. **Порядок в строке:** дата, время, услуга, **[имя клиента + (i) если есть заметка]**, [статус], [действия].
2. **«Прошедшие записи»:** у каждой строки есть бейдж (Отменено/Завершено/Требует подтверждения).
3. **Статистика услуг:** активный «По записям» и номера #1/#2/#3 — зелёные.
4. **Кнопка «Статистика»:** зелёная, с hover.
5. **«Все записи»:** кнопка (не ссылка), зелёная, в обоих блоках одинаково.
6. **Иконка (i):** без подчёркивания при hover, цвет `text-gray-900`.
7. **NotePopover:** открытие/закрытие (клик вне, Esc, повторный клик) без изменений.
