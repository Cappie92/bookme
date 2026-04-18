# AllBookingsModal — detailed endpoint + key fix

## Изменения

### 1. Backend: `/api/master/bookings/detailed`
В ответ добавлены поля:
- `client_master_alias` (string|null) — имя от мастера (alias из MasterClientMetadata)
- `client_account_name` (string|null) — имя из аккаунта (full_name из User)

**Файл:** `backend/routers/master.py`

Примечание: `future` и `past-appointments` уже содержали эти поля. AllBookingsModal сейчас использует `future` + `past-appointments`, но `detailed` используется в SalonWorkSchedule и MasterScheduleCalendar. На случай переключения источника данных поля добавлены и в `detailed`.

### 2. Блок B «Прошедшие — требуют подтверждения»
Логика берётся из `getBookingTab` / `needsOutcome` (`bookingOutcome.js`):

- **Условие:** `needsOutcome(booking, master, now) === true`
- **Поля:**
  - `booking.status` — один из `['created', 'confirmed', 'awaiting_confirmation']`
  - `booking.start_time` — используется в `isPast()` (start_time < now)
  - `master.auto_confirm_bookings === false` (ручное подтверждение)

В блок B попадают только прошлые записи с этими статусами и при включённом ручном подтверждении.

### 3. React key для строк
Формат: `getBookingKey(b)` → `${booking.id}-${booking.start_time}-${client_id|client_phone}`

- Уникальность: `id` + `start_time` + `client_id`/`client_phone`
- Одинаковый между рендерами (без idx, без scope)
- Стабилен при пагинации и смене фильтров

---

## Шаги для ручной проверки

1. Открыть DevTools → Network.
2. Открыть модалку «Все записи».
3. Проверить запросы: `future`, `past-appointments` (или `detailed`, если источник изменён).
4. В ответах `detailed` / `future` / `past-appointments` — наличие полей `client_master_alias`, `client_account_name`.
5. Проверить отсутствие React-предупреждений: `Warning: Encountered two children with the same key`.
6. Блок B: отображаются только прошлые записи со статусом `created`/`confirmed`/`awaiting_confirmation` при ручном подтверждении.
