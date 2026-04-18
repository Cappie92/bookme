# Endpoints подтверждения записи (confirm)

## Таблица endpoints

| Endpoint | Метод | Тип | Статусы входа | Условие по времени | Параметры | Результат |
|----------|-------|-----|---------------|--------------------|-----------|-----------|
| `/api/master/accounting/confirm-booking/{id}` | POST | **post-visit** (outcome) | CREATED, AWAITING_CONFIRMATION | **Только прошлые** (start_time <= now) | path: booking_id | status→COMPLETED, BookingConfirmation, Income |
| `/api/master/accounting/update-booking-status/{id}` | POST | Универсальный | любые | Нет проверки | path: booking_id, query: new_status, cancellation_reason? | Меняет status напрямую |

## Pre-visit vs post-visit

| Тип | Описание | Endpoint | Когда показывать |
|-----|----------|----------|------------------|
| **pre-visit** | Мастер принимает будущую запись | `update-booking-status?new_status=confirmed` | Будущие записи, CREATED, auto_confirm_bookings=false |
| **post-visit** | Мастер подтверждает, что услуга состоялась | `confirm-booking` | Прошлые записи, CREATED/AWAITING_CONFIRMATION, auto_confirm_bookings=false |

## Contract gap

**Pre-visit confirm:** Используем `update-booking-status` с `new_status=confirmed` для будущих записей в статусе CREATED. Статус CONFIRMED = «Подтверждено» (мастер принял запись).

## Debug

`DEBUG_CONFIRM_UI = false` в bookingOutcome — при `true` логируется `debugConfirmUI()` с полями: bookingId, status, start_time, now, isPast, auto_confirm_bookings, confirmType, showConfirmPreVisit, showConfirmPostVisit.
