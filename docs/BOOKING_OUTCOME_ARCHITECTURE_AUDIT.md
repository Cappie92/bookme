# Аудит архитектуры подтверждения/отклонения записи (booking outcome)

## 1. Бизнес-логика: статусы и поля

### 1.1 BookingStatus (enum)

**Файл:** `backend/models.py`, строки 230-238

```
CREATED = "created"                    # Новая запись
AWAITING_CONFIRMATION = "awaiting_confirmation"  # Время прошло, ждёт решения мастера
COMPLETED = "completed"                # Мастер подтвердил: "Прошла"
CANCELLED = "cancelled"                # Мастер отклонил: "Не состоялась" (или клиент отменил)
CANCELLED_BY_CLIENT_EARLY = "cancelled_by_client_early"
CANCELLED_BY_CLIENT_LATE = "cancelled_by_client_late"
AWAITING_PAYMENT = "awaiting_payment"
PAYMENT_EXPIRED = "payment_expired"
```

### 1.2 Дополнительные поля Booking

**Файл:** `backend/models.py`, строки 268-270

- `cancelled_by_user_id` — кто отменил
- `cancellation_reason` — причина: `client_requested`, `client_no_show`, `mutual_agreement`, `master_unavailable`

### 1.3 BookingConfirmation (отдельная сущность)

**Файл:** `backend/models.py`, строки 1736-1752

- Создаётся при "Прошла" (confirm)
- Связывает `booking_id`, `master_id`, `confirmed_income`
- Используется для учёта дохода в разделе "Финансы"

### 1.4 requires_confirmation

**Источник:** `master.auto_confirm_bookings` (bool)

- `auto_confirm_bookings = true` → записи сразу в COMPLETED, подтверждение не требуется
- `auto_confirm_bookings = false` → для прошедших записей нужны кнопки "Прошла" / "Не состоялась"

**Файл:** `backend/models.py`, строка 180

---

## 2. Backend endpoints

### 2a) "Прошла" (подтвердить завершение услуги)

| Параметр | Значение |
|----------|----------|
| **Метод** | POST |
| **Path** | `/api/master/accounting/confirm-booking/{booking_id}` |
| **Файл** | `backend/routers/accounting.py`, строки 684-817 |
| **Payload** | нет (только booking_id в path) |
| **Ограничения** | MASTER/INDIE; `booking.status == AWAITING_CONFIRMATION` в БД; запись принадлежит мастеру; нет существующей BookingConfirmation |
| **Действия в БД** | Создаётся BookingConfirmation, Income; списание/начисление баллов; `booking.status = COMPLETED` |

**Важно:** Endpoint проверяет `Booking.status == AWAITING_CONFIRMATION` в БД. При этом переход CREATED → AWAITING_CONFIRMATION делается только в памяти (`utils/booking_status.py`, `apply_effective_status_to_bookings`) и не сохраняется. Для записей, реально имеющих в БД CREATED, confirm вернёт 404.

### 2b) "Не состоялась" (отклонить)

| Параметр | Значение |
|----------|----------|
| **Метод** | POST |
| **Path** | `/api/master/accounting/cancel-booking/{booking_id}?cancellation_reason={reason}` |
| **Файл** | `backend/routers/accounting.py`, строки 869-924 |
| **Query** | `cancellation_reason` (обязательно): `client_requested` \| `client_no_show` \| `mutual_agreement` \| `master_unavailable` |
| **Ограничения** | MASTER/INDIE; `booking.status in [CREATED, AWAITING_CONFIRMATION]`; нет BookingConfirmation |
| **Действия в БД** | `booking.status = CANCELLED`; `cancellation_reason`, `cancelled_by_user_id`; сброс loyalty_points_used |

**Важно:** cancel принимает и CREATED, и AWAITING_CONFIRMATION — работает для прошедших CREATED-записей.

### 2c) "Подтвердить" (то же, что "Прошла")

Это то же действие, что 2a. Дополнительные endpoints:

- `POST /api/master/accounting/confirm-all` — подтвердить все
- `POST /api/master/accounting/cancel-all` — отменить все (без выбора причины в cancel-all)

---

## 3. Реализация на фронтендах

### 3.1 Mobile Dashboard ("Прошедшие записи")

| Параметр | Значение |
|----------|----------|
| **Файл** | `mobile/app/index.tsx` |
| **Строки** | 116-124 (needsConfirmation), 297-312 (handleConfirmBooking), 411-425 (кнопки) |
| **API** | `confirmBooking(bookingId)` и `cancelBookingConfirmation(bookingId, 'client_no_show')` из `@src/services/api/master.ts` |
| **Кнопки** | "Прошла" → `handleConfirmBooking(id, true)` → `confirmBooking(id)` |
| **Кнопки** | "Не состоялась" → `handleConfirmBooking(id, false)` → `cancelBookingConfirmation(id, 'client_no_show')` |
| **Правило показа** | `needsConfirmation = requiresConfirmation && (recent содержит COMPLETED или AWAITING_CONFIRMATION)`. Кнопки показываются только при `needsConfirmation` (строка 411). |

**Замечание:** В `loadPastBookings` (строки 120-123) `unconfirmed` включает `COMPLETED`. Логически COMPLETED — уже подтверждённые записи, для них кнопки показывать не нужно. Возможная логическая ошибка.

### 3.2 Mobile Modal "Все записи" (AllBookingsModal)

| Параметр | Значение |
|----------|----------|
| **Файл** | `mobile/src/components/dashboard/AllBookingsModal.tsx` |
| **Строки** | 96-122 (handleConfirmBooking), 124-137 (needsConfirmation), 167-177 (кнопка) |
| **API** | только `confirmBooking(bookingId)` |
| **Кнопка** | Одна — "Подтвердить" (Прошла). Кнопки "Не состоялась" нет. |
| **Правило показа** | `requiresConfirmation && isPast && (AWAITING_CONFIRMATION || COMPLETED)` |

**Несогласованность:** В модалке нет кнопки "Не состоялась", в отличие от дашборда.

### 3.3 Web

#### AllBookingsModal

| Параметр | Значение |
|----------|----------|
| **Файл** | `frontend/src/components/AllBookingsModal.jsx` |
| **Строки** | 117-132 (handleConfirmBooking), 136-139 (needsConfirmation), 213-221 (кнопка) |
| **API** | `apiPost('/api/master/accounting/confirm-booking/${bookingId}')` |
| **Кнопка** | Только "Подтвердить". Кнопки "Не состоялась" нет. |
| **Правило** | `requiresConfirmation && isPast && (awaiting_confirmation || completed)` |

#### BookingConfirmations (отдельный блок)

| Параметр | Значение |
|----------|----------|
| **Файл** | `frontend/src/components/BookingConfirmations.jsx` |
| **Использование** | `frontend/src/components/MasterDashboardStats.jsx`, строка 306 |
| **API** | `confirm-booking` и `cancel-booking` (с выбором причины через prompt) |
| **Кнопки** | "Подтвердить" и "Отклонить" (причина: 1–4 в prompt) |
| **Данные** | `GET /api/master/accounting/pending-confirmations` — только AWAITING_CONFIRMATION в БД |

**Важно:** `pending-confirmations` фильтрует по `Booking.status == AWAITING_CONFIRMATION` в БД. Записи с CREATED в БД (но с effective AWAITING_CONFIRMATION) туда не попадут.

---

## 4. Правила "требует подтверждения"

### 4.1 Текущие условия

| Компонент | Условие |
|-----------|---------|
| Mobile Dashboard | `!auto_confirm_bookings` И наличие в `pastBookings` записей со статусом COMPLETED или AWAITING_CONFIRMATION |
| Mobile AllBookingsModal | `!auto_confirm_bookings` И `start_time < now` И `(AWAITING_CONFIRMATION \|\| COMPLETED)` |
| Web AllBookingsModal | `!auto_confirm_bookings` И `booking.isPast` И `(awaiting_confirmation \|\| completed)` |
| Web BookingConfirmations | Отдельный API; только статус AWAITING_CONFIRMATION в БД |

### 4.2 Effective status (в памяти, без сохранения в БД)

**Файл:** `backend/utils/booking_status.py`

- CREATED + `now >= start_time + 1 min` → для отображения считается AWAITING_CONFIRMATION
- Изменение только в объекте, в БД статус не обновляется
- `apply_effective_status_to_bookings` вызывается в: `get_bookings`, `get_detailed_bookings`, `get_past_appointments`

### 4.3 Сводка

- **По времени:** `start_time < now` (запись в прошлом).
- **По статусу:** effective status = AWAITING_CONFIRMATION (в т.ч. CREATED + прошло время) или COMPLETED (что сомнительно для показа кнопок).
- **По флагу:** `!master.auto_confirm_bookings`.

---

## 5. Предложение по унификации (Single Source of Truth)

### 5.1 Два действия для прошедших записей

1. **"Прошла"** — `POST /api/master/accounting/confirm-booking/{id}`
2. **"Не состоялась"** — `POST /api/master/accounting/cancel-booking/{id}?cancellation_reason=...`

### 5.2 Фикс backend

**Проблема:** confirm требует AWAITING_CONFIRMATION в БД, а переход CREATED → AWAITING_CONFIRMATION не сохраняется.

**Рекомендация:** В `confirm_booking` считать допустимыми и CREATED, и AWAITING_CONFIRMATION при `start_time < now` (по аналогии с `cancel_booking`).

### 5.3 Маппинг статусов и лейблов

| Статус | UI label (RU) | Показывать кнопки? |
|--------|----------------|--------------------|
| CREATED (прошло) | Ожидает подтверждения | Да |
| AWAITING_CONFIRMATION | Ожидает подтверждения | Да |
| COMPLETED | Завершено | Нет |
| CANCELLED | Отменено | Нет |

### 5.4 Условие показа кнопок (единое)

```
showConfirmButtons = 
  !master.auto_confirm_bookings 
  AND start_time < now 
  AND status IN (CREATED, AWAITING_CONFIRMATION)
  AND status NOT IN (COMPLETED, CANCELLED)
```

**Примечание:** COMPLETED и CANCELLED исключены — для них кнопки не показываем.

### 5.5 UI-кнопки во всех точках

| Точка | Сейчас | Должно быть |
|-------|--------|-------------|
| Mobile Dashboard | "Прошла" + "Не состоялась" | Оставить |
| Mobile AllBookingsModal | Только "Подтвердить" | Добавить "Не состоялась" |
| Web AllBookingsModal | Только "Подтвердить" | Добавить "Отклонить" (с выбором причины или client_no_show по умолчанию) |
| Web BookingConfirmations | "Подтвердить" + "Отклонить" | Оставить |

### 5.6 Выбор причины "Не состоялась"

- **client_no_show** — "Клиент не пришёл"
- **client_requested** — "Клиент попросил отменить"
- **mutual_agreement** — "Обоюдное согласие"
- **master_unavailable** — "Мастер не может оказать услугу"

Для Mobile можно использовать `client_no_show` по умолчанию (как в Dashboard) или добавить выбор причины (как в Web BookingConfirmations).

---

## 6. Ссылки на ключевые файлы

| Сущность | Файл | Строки |
|----------|------|--------|
| BookingStatus enum | backend/models.py | 230-238 |
| auto_confirm_bookings | backend/models.py | 180 |
| confirm_booking | backend/routers/accounting.py | 684-817 |
| cancel_booking | backend/routers/accounting.py | 869-924 |
| get_effective_booking_status | backend/utils/booking_status.py | 10-36 |
| Mobile Dashboard кнопки | mobile/app/index.tsx | 411-425 |
| Mobile AllBookingsModal | mobile/src/components/dashboard/AllBookingsModal.tsx | 167-177 |
| Web AllBookingsModal | frontend/src/components/AllBookingsModal.jsx | 213-221 |
| Web BookingConfirmations | frontend/src/components/BookingConfirmations.jsx | 40-77, 169-183 |
| master.confirmBooking | mobile/src/services/api/master.ts | 482-486 |
| master.cancelBookingConfirmation | mobile/src/services/api/master.ts | 492-499 |
