# Фаза 0: Инвентаризация

## 1. Client phone в booking

- **Booking** имеет `client_id` (FK → users.id), **не** client_phone.
- Телефон берётся через `booking.client.phone` (User.phone).
- Для клиентов без client_id (публичное бронирование по телефону) — client создаётся при бронировании с этим телефоном.

**Файлы:** `backend/models.py` (Booking), User.phone

## 2. Cancellation reason

- **bookings.cancellation_reason** (String 255)
- **bookings.cancelled_by_user_id** (FK users)
- Значения: `client_requested`, `client_no_show`, `mutual_agreement`, `master_unavailable`
- `utils/booking_status.py` — `get_cancellation_reasons()`
- `utils/client_restrictions.py` — `get_cancellation_reasons()` (дубликат)

**Файлы:** `backend/models.py`, `backend/utils/booking_status.py`, `backend/routers/accounting.py`

## 3. Master settings

- **masters.auto_confirm_bookings** и др.
- `GET /api/master/settings` — `routers/master.py`
- `Master` model: auto_confirm_bookings, city, timezone, etc.

**Файлы:** `backend/routers/master.py` (get_master_settings), `backend/models.py` (Master)

## 4. Restrictions

- **ClientRestriction** — client_restrictions (client_phone, indie_master_id, salon_id, restriction_type, reason)
- **ClientRestrictionRule** — автоматические правила (master_id, cancellation_reason, cancel_count, period_days, restriction_type)
- Master API: `GET/POST/PUT/DELETE /api/master/restrictions` — но использует **indie_master_id**
- `check_client_restrictions()` — находит IndieMaster по Master.user_id
- Типы: blacklist, advance_payment_only

**Файлы:** `backend/models.py`, `backend/routers/master.py` (2644+), `backend/utils/client_restrictions.py`, `frontend/src/components/ClientRestrictionsManager.jsx`, `mobile/app/master/client-restrictions.tsx`

## 5. Master–client metadata (alias, note)

- **ClientMasterNote** — client_id, master_id, salon_id, note (400 chars). **Нет поля alias.**
- **ClientMasterNote** требует salon_id (unique по client_id, master_id, salon_id).
- Миграция `6cdcf96609b1` сделала salon_id nullable.
- Для индивидуальных мастеров: нужна поддержка master без salon. Скорее salon_id=null.

**Нужно:** Добавить `master_client_notes` или расширить логику: alias_name + note (280). Вариант: новая таблица `master_client_metadata` (master_id, client_phone или client_id, alias_name, note).

## 6. Существующие экраны Clients

- **frontend/src/pages/Clients.jsx** — заглушка «Раздел в разработке»
- **frontend/src/components/ClientRestrictionsManager.jsx** — ограничения
- **mobile** — client-restrictions есть, раздела Clients списком нет

## 7. Точки интеграции

| Где | Что добавить |
|-----|--------------|
| Sidebar web | Пункт «Клиенты» (уже может быть) |
| Master dashboard | — |
| Bookings list/detailed | Индикатор заметки (i) |
| AllBookingsModal | Индикатор заметки |
| PopupCard (calendar) | Индикатор заметки |
| DayDrawer mobile | Индикатор заметки |
| Mobile bottom nav | Вкладка «Клиенты» |

## 8. Client key

- `client_id` если есть (User.id)
- Иначе — нормализованный `client_phone` (из User.phone по booking.client_id)
- Для агрегации: группировка по (client_id или client_phone)

## 9. Restrictions и master

- ClientRestriction привязан к **indie_master_id**.
- Мастер в ЛК — `Master` (user_id). Связь: IndieMaster.user_id == Master.user_id.
- Для Clients API будем использовать **master_id** (masters.id); при работе с restrictions — получать indie_master_id через user_id.
