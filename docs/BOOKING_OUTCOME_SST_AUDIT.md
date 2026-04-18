# Аудит SSoT Booking Outcome (Regression + Architecture Sanity Check)

## 1) Helpers: единый источник правды

### 1.1 Поле времени

| Файл | Поле | Строка |
|------|------|--------|
| mobile `bookingOutcome.ts` | `start_time` | 23: `booking.start_time` |
| web `bookingOutcome.js` | `start_time` или `date` | 12: `booking.start_time \|\| booking.date` |

**Различие:** web использует fallback `booking.date`, mobile — только `start_time`. Web AllBookingsModal для future строит `start_time` из `date`+`time` (строки 76, 82).

**DTO:**
- mobile: `/api/master/bookings/detailed` → `start_time` ISO string ✅
- web future: `/api/master/bookings/future` → `start_time` ISO ✅, date/time для совместимости
- web past: `/api/master/past-appointments` → `start_time` ISO string ✅

**Риск (закрыт):** backend `/bookings/future` теперь отдаёт `start_time` в ISO; frontend использует его приоритетно.

---

### 1.2 Защита от null/undefined start_time

| Файл | Guard | Риск |
|------|-------|------|
| mobile | Нет | `new Date(undefined)` → Invalid Date, `getTime()` → NaN, `NaN < x` → false. Не падает, но логика может быть неверной |
| web | `booking.start_time \|\| booking.date` | Аналогично при полном отсутствии полей |

**Рекомендация:** Добавить явный guard — при отсутствии валидного времени возвращать `false` в `isPast` и `needsOutcome`.

---

### 1.3 Сравнение времени

- Оба helper используют `new Date(...).getTime()` и `now.getTime()` — сравнение по числу ✅
- Сортировки в AllBookingsModal: `new Date(a.start_time).getTime() - new Date(b.start_time).getTime()` ✅

---

### 1.4 master undefined

- mobile: `if (!master) return false;` (строка 36) ✅
- web: `if (!master) return false;` (строка 22) ✅

---

### 1.5 needsOutcome и COMPLETED

**Условие (mobile, строки 36–43):**
```ts
return (
  requiresManual &&
  past &&
  OUTCOME_PENDING_STATUSES.includes(status)  // ['created','awaiting_confirmation']
);
```

COMPLETED **не включён** ✅

---

## 2) Mobile AllBookingsModal

### 2.1 Дефолтная вкладка

- `setActiveTab(hasPending ? 'pending' : 'future')` вызывается **только** в `loadInitialData` (строка 88).
- `loadInitialData` вызывается **только** при `visible=true` (useEffect [visible], строка 67).
- При последующих ререндерах (например, после confirm) `loadInitialData` не вызывается, `activeTab` не переключается ✅

**Риск:** если модалку закрыть и открыть снова, `loadInitialData` вызовется заново и вкладка выставится по данным.

---

### 2.2 Сортировки

| Вкладка | Код (строки 55–57) | Логика |
|---------|--------------------|--------|
| pending | `new Date(b.start_time).getTime() - new Date(a.start_time).getTime()` | DESC ✅ |
| future | `new Date(a.start_time).getTime() - new Date(b.start_time).getTime()` | ASC ✅ |
| past | `new Date(b.start_time).getTime() - new Date(a.start_time).getTime()` | DESC ✅ |

Сортировка по числовому времени ✅

---

### 2.3 Кнопки "Прошла" / "Не состоялась"

- `showActions = activeTab === 'pending' && needsOutcome(item, ...)` (строка 144) ✅
- Кнопки отображаются только на вкладке pending и только при `needsOutcome` ✅

---

### 2.4 cancel endpoint

- `cancelBookingConfirmation(bookingId, 'client_no_show')` (строка 127) ✅

---

### 2.5 Обработчик 404 для CREATED

- Обработчик 404 (строки 109–116) после backend-фикса по сути лишний.
- Можно упростить: при 404 показывать общий текст ошибки, без отдельной ветки для CREATED.

---

## 3) Mobile Dashboard (index.tsx)

### 3.1 "Прошла/Не состоялась"

- `needsOutcome(booking, masterSettings?.master ?? null)` (строка 421) ✅

### 3.2 Логика отображения клиента

- `client_name !== 'клиент'` (case-insensitive) → показывается имя ✅
- иначе → `client_phone` ✅
- fallback: `(condition) && (...)` — при отсутствии обоих ничего не выводится (нет "—" или "Клиент") ⚠️

**Риск:** при `client_name='Клиент'` и `client_phone=null` строка не показывается. При необходимости можно добавить fallback `"—"`.

### 3.3 client_phone с backend

- `/api/master/bookings/detailed` возвращает `client_phone` (master.py:185).
- Mobile использует `getPastBookings` → `getUserBookings` → `/api/master/bookings/detailed` ✅

---

## 4) Web: модалка и confirmations

### 4.1 Web AllBookingsModal — "Не состоялась"

- Кнопка "Не состоялась" есть (строка 229).
- `apiPost(\`/api/master/accounting/cancel-booking/${bookingId}?cancellation_reason=client_no_show\`)` (строка 135) ✅

### 4.2 Критерий показа кнопок

- AllBookingsModal: `needsOutcome(booking, masterSettings?.master ?? null)` (строка 196) ✅
- **BookingConfirmations:** `needsOutcome` **не используется**. Список — из `/api/master/accounting/pending-confirmations`, backend отдаёт только AWAITING_CONFIRMATION без COMPLETED. Кнопки показываются для всех элементов списка. Фактически SSoT — backend. ⚠️

### 4.3 COMPLETED в "требует подтверждения"

- pending-confirmations фильтрует `Booking.status == AWAITING_CONFIRMATION` и `BookingConfirmation.id == None` — COMPLETED не попадает ✅

---

## 5) Backend

### 5.1 confirm принимает CREATED и AWAITING_CONFIRMATION

```py
Booking.status.in_([BookingStatus.CREATED, BookingStatus.AWAITING_CONFIRMATION])
```
accounting.py, строки 698–701 ✅

### 5.2 confirm на future → 400

```py
if booking.start_time > datetime.utcnow():
    raise HTTPException(status_code=400, ...)
```
строки 721–725 ✅

### 5.3 confirm на COMPLETED → 200 идемпотентно

При `not booking` проверяется `existing.status == COMPLETED` и `conf`; при наличии возвращается 200 с `{"message": "Услуга уже подтверждена", ...}` (строки 704–718) ✅

### 5.4 cancel — согласованность с confirm

```py
Booking.status.in_([BookingStatus.CREATED, BookingStatus.AWAITING_CONFIRMATION])
```
строки 907–910 ✅

### 5.5 BookingConfirmation не плодится при идемпотентности

- При `existing_confirmation` — ранний `return` до `db.add(confirmation)` (строки 728–735) ✅
- При COMPLETED — проверка `conf` и `return` без добавления новой записи ✅

---

## 6) Регресс-чеклист

### Mobile Master Dashboard
1. [ ] Блок "Прошедшие записи": кнопки "Прошла"/"Не состоялась" только при `needsOutcome`.
2. [ ] Блок "Ближайшие записи": нет кнопок confirm/cancel.
3. [ ] "Клиент: Клиент +7999" не показывается; при `client_name='Клиент'` показывается телефон.
4. [ ] При отсутствии client_name и client_phone — проверка отсутствия краша.
5. [ ] confirm/cancel работают и обновляют список.

### Mobile AllBookingsModal
6. [ ] При открытии: если есть pending — выбран таб "Требующие подтверждения".
7. [ ] На вкладке "Требующие подтверждения" — только кнопки "Прошла"/"Не состоялась".
8. [ ] На "Будущие" и "Прошедшие" — только просмотр.
9. [ ] Сортировка: pending DESC, future ASC, past DESC.
10. [ ] cancel использует `client_no_show`.

### Web Modal / Confirmations
11. [ ] AllBookingsModal: "Подтвердить" и "Не состоялась" при `needsOutcome`.
12. [ ] Cancel вызывается с `cancellation_reason=client_no_show`.
13. [ ] BookingConfirmations: все элементы — кнопки "Подтвердить"/"Отклонить" (фильтр на backend).
14. [ ] Future bookings: корректный парсинг даты и отсутствие ложного `needsOutcome`.

### Backend API
15. [ ] confirm CREATED → 200, COMPLETED → 200, future → 400.
16. [ ] cancel CREATED и AWAITING_CONFIRMATION → 200.
17. [ ] pending-confirmations не возвращает COMPLETED.

---

## Минимальные патчи (рекомендуемые)

### Патч 1: guard в helpers при отсутствии start_time

**mobile/src/utils/bookingOutcome.ts** — в `isPast`:
```ts
const raw = booking?.start_time;
if (raw == null || raw === '') return false;
const start = new Date(raw).getTime();
if (Number.isNaN(start)) return false;
return start < now.getTime();
```

**frontend/src/utils/bookingOutcome.js** — в `isPast`:
```js
const raw = booking?.start_time || booking?.date;
if (raw == null || raw === '') return false;
const start = new Date(raw).getTime();
if (Number.isNaN(start)) return false;
return start < now.getTime();
```

### Патч 2: fallback для client при отсутствии обоих полей (mobile index.tsx)

Если `client_name='Клиент'` и `client_phone` нет — показывать "—" вместо пустоты.

### Патч 3: упростить 404 handler в AllBookingsModal (mobile)

Убрать специальное сообщение для CREATED — достаточно общего текста ошибки.
