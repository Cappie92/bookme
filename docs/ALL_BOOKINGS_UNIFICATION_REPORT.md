# Отчёт: унификация «Все записи» WEB + MOBILE

## Выбранный вариант API (Вариант 1)

WEB и MOBILE используют одни и те же endpoints:
- **Future:** `GET /api/master/bookings/future?page=N&limit=20`
- **Past:** `GET /api/master/past-appointments?page=N&limit=20`

- `future` — возвращает будущие записи, **включая cancelled** при `start_time > now` (см. секцию Cancelled in future)
- `past-appointments` — возвращает все прошедшие, **включая cancelled** (нет фильтра по статусу)

MOBILE переведён с `detailed` на эти endpoints для дашборда и модалки «Все записи».

## Diff-summary (изменённые файлы)

### WEB
- **frontend/src/components/MasterDashboardStats.jsx**
  - Переименован заголовок «Ближайшие записи» → «Будущие записи»
  - Добавлен state `allBookingsModalMode` ('future' | 'past')
  - Кнопка «Все записи» под Будущими открывает модалку с `initialMode='future'`
  - Кнопка «Все записи» под Прошедшими открывает модалку с `initialMode='past'`
  - `onConfirmSuccess` вызывает `loadDashboardStats` и `loadPastBookings`

- **frontend/src/components/AllBookingsModal.jsx**
  - Полная переработка: режим future/past, пагинация 20/стр
  - Props: `initialMode?: 'future' | 'past'`
  - Убраны «Показать ещё», фильтры, SectionBlock
  - Добавлен `PaginationControls`: Prev/Next, ввод страницы, Применить
  - Загрузка: future → `/api/master/bookings/future`, past → `/api/master/past-appointments`
  - Внутри страницы сортировка: «На подтверждении» сверху, затем по времени
  - Dev-логирование cancelled в past-режиме

### MOBILE
- **mobile/app/index.tsx**
  - «Ближайшие записи» → «Будущие записи»
  - `loadUpcomingBookings` переведён на `getFutureBookingsPaged(1, 5)`
  - Три группы: «На подтверждении», «Подтверждённые», «Отменено»; для cancelled скрыты кнопки
  - `loadPastBookings` переведён на `getPastAppointmentsPaged(1, 3)`
  - Добавлен state `allBookingsModalMode`
  - Две кнопки «Все записи» с разными `initialMode`

- **mobile/src/components/dashboard/AllBookingsModal.tsx**
  - Полная переработка: props `initialMode: 'future' | 'past'`
  - Загрузка через `getFutureBookingsPaged` / `getPastAppointmentsPaged`
  - Пагинация 20/стр: Prev/Next, ввод страницы, Применить
  - Future: три группы (На подтверждении / Подтверждённые / Отменено), SectionList
  - Cancelled: бейдж «Отменено», без кнопок confirm/cancel
  - NoteSheet, CancelReasonSheet, BookingCardCompact сохранены
  - Dev-логирование cancelled

- **mobile/src/services/api/master.ts**
  - Добавлены `getFutureBookingsPaged(page, limit=20)` и `getPastAppointmentsPaged(page, limit=20)`
  - Интерфейсы: `FutureBookingItem`, `PastAppointmentItem`, `FutureBookingsPagedResponse`, `PastAppointmentsPagedResponse`

### Backend
- `past-appointments` уже возвращает cancelled.
- **future endpoint:** теперь включает cancelled при `start_time > now` (см. Cancelled in future).

## Гарантии

- **cancelled не теряются:** `past-appointments` возвращает все прошедшие записи без фильтра по статусу
- **Состав WEB = MOBILE:** оба используют одни endpoints
- **NotePopover / NoteSheet, alias/account:** сохранены
- **Бейджи:** «На подтверждении» / «Подтверждено» / «Отменено» — без изменений
- **duration/price в BookingCardCompact:** не добавлялись (минимализм сохранён)

## Чеклист ручного теста

1. **WEB**
   - [ ] Дашборд: заголовок «Будущие записи»
   - [ ] «Все записи» под Будущими открывает future-mode с пагинацией 20/стр
   - [ ] «Все записи» под Прошедшими открывает past-mode с пагинацией 20/стр
   - [ ] Prev/Next, ввод страницы + Применить работают
   - [ ] В прошедших видны отменённые записи (cancelled)
   - [ ] Подтвердить/Отменить работают
   - [ ] NotePopover по клику на иконку заметки

2. **MOBILE**
   - [ ] Заголовок «Будущие записи»
   - [ ] «Все записи» (Будущие) → future-mode, пагинация
   - [ ] «Все записи» (Прошедшие) → past-mode, пагинация
   - [ ] cancelled в прошедших совпадают с WEB
   - [ ] NoteSheet, CancelReasonSheet
   - [ ] alias/account отображаются

3. **Smoke (после reseed master)**
   - [ ] Создать 25+ будущих и 25+ прошедших записей
   - [ ] Несколько cancelled среди прошедших
   - [ ] Проверить пагинацию на 2+ страницах
   - [ ] Проверить «На подтверждении» в прошедших (если есть)

## WEB fixes: date rendering + UI confirm/cancel + future grouping

### Дата на дашборде
- **Баг:** Пустая дата в блоке «Будущие записи» — использовалось `booking.date`, которое может отсутствовать.
- **Исправление:** Всегда вычислять дату/время из `start_time` (ISO) через `formatDateShort(b.start_time)` и `formatTimeShort(b.start_time)`, как в модалке. Fallback: при отсутствии `start_time` показать «—» и `console.warn` (dev).

### Убраны системные окна (alert/confirm/prompt)
- Добавлен `ToastContext` + `ToastProvider` (1 файл), подключён в App.
- **confirm:** toast success «Запись принята» / «Запись подтверждена».
- **cancel:** уже UI-модалка выбора причины (CANCELLATION_REASONS); после успеха — toast «Запись отменена».
- **ошибки:** toast error с `detail` вместо `alert`.

### Разделение будущих записей (pending / confirmed / cancelled)
- Блок «Будущие записи» на дашборде разбит на 3 группы:
  1. «На подтверждении» — `status` in [`created`, `awaiting_confirmation`]
  2. «Подтверждённые» — `status === 'confirmed'` и др. активные
  3. «Отменено» — `cancelled`, `cancelled_by_client_*`; бейдж «Отменено», без кнопок
- После confirm: запись переходит из pending в confirmed (refetch без перезагрузки).
- После cancel: запись остаётся в future, переходит в группу «Отменено» (см. Cancelled in future).

### Модалка «Будущие записи»
- Сортировка внутри страницы: pending → confirmed → cancelled, по времени asc внутри групп.
- После confirm/cancel: `loadPage(page)` + `onConfirmSuccess`, toast вместо alert.
- CancelReasonModal — UI-модалка (без `window.confirm`).

### Файлы
- `frontend/src/contexts/ToastContext.jsx` — новый
- `frontend/src/App.jsx` — ToastProvider
- `frontend/src/components/MasterDashboardStats.jsx` — date fix, split, toast
- `frontend/src/components/AllBookingsModal.jsx` — toast, сортировка future по isFuturePending

## Cancelled in future: product rationale + backend change + grouping rules

### Продуктовая логика

Отменённые мастером будущие записи **не должны исчезать**. Требования:

1. Пока `start_time` в будущем — запись остаётся в списке «Будущие записи», в группе «Отменено» (внизу).
2. После наступления `start_time` — запись автоматически появляется в «Прошедших» как cancelled.
3. Факт отмены сохраняется для клиентской карточки и лояльности.

### Backend

- **`GET /api/master/bookings/future`** — фильтр обновлён:
  - активные: `start_time >= today_start` и status ≠ cancelled
  - cancelled: `start_time > now_utc`
  - cancelled с `start_time <= now` не в future (попадают в past-appointments)
- **`next_bookings_list`** в dashboard stats — включает cancelled при `start_time > now` (лимит 5).

### Группировка future (WEB и MOBILE)

1. **«На подтверждении»** — `created`, `awaiting_confirmation`
2. **«Подтверждённые»** — `confirmed` и др. активные
3. **«Отменено»** — `cancelled`, `cancelled_by_client_early`, `cancelled_by_client_late`

- Сортировка внутри групп: по `start_time` (раньше выше).
- Cancelled: бейдж «Отменено», без кнопок confirm/cancel.
- После cancel запись остаётся в списке и перемещается в группу «Отменено».

### Тест-кейсы

1. Создать future booking (start_time завтра), отменить мастером → не исчезает, переходит в «Отменено».
2. Пагинация: cancelled на соответствующей странице (сортировка по start_time).
3. После наступления start_time → запись в past-appointments как cancelled, исчезает из future.
4. WEB и MOBILE показывают одинаковый список cancelled.

## Unit-тесты (опционально)

- Сортировка: в `bookingOutcome` / `getBookingTab` логика уже покрыта. Сортировка внутри страницы (awaiting_confirmation сверху) — в `useMemo` AllBookingsModal.
- Пагинация: hasNext = `returned.length === limit` или `page < total_pages`. Backend `past-appointments` возвращает `pages`.
- Backend: можно добавить `test_past_appointments_includes_cancelled` — проверить, что cancelled входят в ответ.
