# Шаг 0 — Архитектурный ресёрч (loyalty, TZ, evaluate, start_time)

**Дата:** 2026-01-28

---

## Как сейчас

- **Timezone мастера:** в `Master` есть поле `timezone` (default `"Europe/Moscow"`). Аналогично у `Salon`, `IndieMaster`. У `User` нет. В `client.py` используются `get_master_timezone(booking)` (master/salon/indie) и `get_current_time_in_timezone(tz)` через `pytz`.
- **evaluate_and_prepare_applied_discount** вызывается из: `bookings.py` (POST `/`, POST `/public`) и `client.py` (создание бронирования, создание временной брони, подтверждение оплаты временной). Везде передаются `master_id`, `client_id`/`client_phone`, `booking_start`, `service_id`, `db`.
- **evaluate_discount_candidates** вызывается из `evaluate_and_prepare_applied_discount` и из `routers/loyalty` (POST `/evaluate`). Принимает `booking_payload` с `start_time`, `service_id`, `category_id`; сам мастер хранится только в контексте вызова (master_id есть).
- **start_time:** в проекте даты/время в БД и при создании бронирований — в основном `datetime.utcnow()` и naive `datetime`. В `client.py` при сравнении с «текущим временем мастера» naive трактуется как **UTC**: `pytz.UTC.localize(b.start_time).astimezone(pytz.timezone(master_timezone))`.
- **Выбор лучшего кандидата:** сейчас сортировка `(-priority, rule_id)`. Нужно заменить на: (1) max `discount_percent`, (2) приоритет по `condition_type` (birthday > returning_client > regular_visits > first_visit > happy_hours > service_discount), (3) min `rule_id`.
- **regular_visits:** окно считается от `booking_start` (`window_start = booking_start - period_days`). Нужно: окно от «сейчас» в локальном времени мастера (`window_end = now_master_local`, `window_start = window_end - period_days`).
- **birthday / happy_hours:** используют `booking_start` напрямую (date, time, isoweekday) без приведения к таймзоне мастера. Нужно: везде использовать локальную дату/время мастера.
- **happy_hours:** проверка `st <= booking_time <= et` (включительно с обеих сторон). Нужно: **end exclusive** — `st <= booking_time < et`.
- **service_discount:** сейчас `items[]` (service_id + percent) и `category_ids[]`. Нужно упростить до одного `service_id` **или** одного `category_id` на правило, percent из `rule.discount_percent`.
- **Валидация service_discount:** в `_validate_quick_discount_conditions` проверяется принадлежность `service_id` из `items` мастеру через `master_services`. При переходе на `service_id`/`category_id` потребуется проверка и для `category_id` (хотя бы одна услуга мастера в этой категории).
- **Legacy service_discount:** при create/update нужно 422 на невалидные форматы; при eval — `match=False`, `reason="invalid_parameters"` для legacy с >1 element в items/service_ids/category_ids.

---

## Что нужно поправить

1. Ввести `get_master_local_now(master_id, db)` и `to_master_local(dt, master_id, db)`; при отсутствии TZ у мастера — fallback на UTC + TODO в коде.
2. Передавать в eval «сейчас» (или inject в тестах) и использовать его для B1 (regular_visits). Возможность подмены `now` в тестах.
3. Для birthday и happy_hours использовать дату/время в локали мастера; happy_hours — end exclusive.
4. Заменить выбор best candidate на новый порядок (max % → condition_type → min rule_id).
5. Обновить `normalize_service_discount` и eval под контракт `service_id` | `category_id`; добавить `validate_service_discount` и legacy/invalid-обработку.
6. Документировать: naive datetimes в проекте считаются UTC при конвертации в local.
