# Отчёт: исправление 404 при подтверждении записи (WEB + MOBILE)

## Причина 404

Записи indie-мастера имеют `indie_master_id` и `master_id = NULL`. Роутер accounting проверял только `Booking.master_id == master_row_id`, из‑за чего записи indie не находились и возвращался 404.

## Backend fix

В `backend/routers/accounting.py`:
- Добавлены `get_booking_owner_ids()` и `_booking_owner_filter()` для проверки владения по `master_id` **или** `indie_master_id`.
- Обновлены endpoints: `update-booking-status`, `confirm-booking`, `cancel-booking`, `confirm-all`, `cancel-all`.

## Backend route (используется)

| Метод | Путь | Параметры |
|-------|------|-----------|
| POST | `/api/master/accounting/update-booking-status/{booking_id}` | Query: `new_status` (required), `cancellation_reason` (optional для cancelled) |
| POST | `/api/master/accounting/confirm-booking/{booking_id}` | — |
| POST | `/api/master/accounting/cancel-booking/{booking_id}` | Query: `cancellation_reason` (required) |

`new_status`: `created`, `confirmed`, `awaiting_confirmation`, `completed`, `cancelled`, `client_requested_early`, `client_requested_late`  
`cancellation_reason`: `client_requested`, `client_no_show`, `mutual_agreement`, `master_unavailable`

## Diff-summary

### Backend
- **routers/accounting.py**
  - Импорт `IndieMaster`
  - Функции `get_booking_owner_ids`, `_booking_owner_filter`
  - Обновлены `update_booking_status`, `confirm_booking`, `cancel_booking`, `confirm_all`, `cancel_all` — использование `or_(Booking.master_id, Booking.indie_master_id)`

### WEB
- **frontend/src/utils/api.js** — `console.error` для ответов 4xx
- **frontend/src/components/PastAppointments.jsx** — обработка 404/403 и `console.error` с url
- **frontend/src/components/BookingConfirmations.jsx** — `console.error` с url/status/detail

### MOBILE
- Без изменений. Endpoints и обработка ошибок в `master.ts` и `client.ts` уже корректны.

## Smoke-checklist

1. **WEB**
   - [ ] Будущие → «Все записи» → подтвердить запись (pre-visit): 200 OK, статус меняется
   - [ ] Прошедшие → «Все записи» → подтвердить запись (post-visit): 200 OK
   - [ ] Отменить запись → выбрать причину: 200 OK, статус «Отменено»
   - [ ] В Network: запрос на `/api/master/accounting/...` (через proxy на backend)

2. **MOBILE**
   - [ ] Подтвердить/отменить из карточек или модалки: без 404

3. **Indie-мастер**
   - [ ] Подтверждение будущей записи (indie-услуга) — 200 OK, а не 404
