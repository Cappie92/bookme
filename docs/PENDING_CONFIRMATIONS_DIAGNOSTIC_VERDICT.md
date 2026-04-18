# Диагностика pending-confirmations

## Backend: что возвращает pending-confirmations

**Фильтр:** `Booking.status == AWAITING_CONFIRMATION` И нет `BookingConfirmation`, owner_cond (master_id OR indie_master_id).

**Важно:** Backend **не** фильтрует по `start_time < now_utc`. Если в БД есть записи с AWAITING_CONFIRMATION и start_time в будущем (legacy), они попадут в ответ.

**Почему pending=2:**
- Это прошедшие записи (start_time в прошлом) со статусом AWAITING_CONFIRMATION в БД.
- Они ожидают POST-visit подтверждения («Прошла»/«Не состоялась»).
- Дублей по owner-filter быть не должно: используется `_booking_owner_filter` (master_id OR indie_master_id), один owner на запись.

**Диагностика:** В логах backend при вызове pending-confirmations теперь пишется:
```
[pending-confirmations] master=X booking_id=Y start_time=... status=awaiting_confirmation is_past=True/False
```
По `is_past` видно, если в выборку попала будущая запись.

**Рекомендация (отдельная задача):** Добавить фильтр `Booking.start_time < datetime.utcnow()` в pending-confirmations для строгого соответствия post-visit (только прошлые).
