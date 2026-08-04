---
type: Knowledge
status: active
project: DeDato
last_runtime_check: 2026-08-04
---

# Scheduling and availability

Канон repository-known расчёта рабочих окон, доступных слотов и пересечений. Booking lifecycle находится в [Booking](../booking/README.md).

## 1. Источники расписания

Для master path сосуществуют:

- `MasterSchedule`: date-specific интервалы, обычно материализованные 30-минутными rows;
- `AvailabilitySlot`: weekly base windows (`day_of_week` 1–7);
- `MasterScheduleSettings.fixed_schedule`: JSON правил/настроек; Alembic migration для settings является no-op, таблица существует в model/runtime lineage;
- legacy `IndieMasterSchedule`.

При расчёте master availability наличие active `MasterSchedule` rows на дату имеет приоритет над weekly `AvailabilitySlot`. Если date-specific rows отсутствуют, используется weekly base; если нет обоих источников — слотов нет.

Schedule rule endpoints (`weekdays`, `monthdays`, `shift`) материализуют date-specific rows. Day update защищает 30-minute alignment и не позволяет убрать schedule slots, покрывающие active bookings.

**Source:** `backend/models.py` — schedule models; `backend/routers/master.py` — schedule/rules, weekly/day/bulk endpoints; `backend/services/scheduling.py`; `backend/tests/test_master_schedule_day.py`; `backend/alembic/versions/07de82665594_add_master_schedule_settings.py`.

## 2. Slot generation

`get_available_slots` принимает owner, date, service duration и optional branch. Candidate starts выравниваются на `:00`/`:30` и идут с шагом 30 минут. Конец услуги должен помещаться в availability window.

Для date-specific master schedule service duration округляется вверх до числа последовательных 30-minute rows, после чего из найденного окна снова генерируются starts с реальной duration. Несмежные rows не образуют общее окно.

Public master availability использует `MasterService.duration`, вызывает общий `get_available_slots` по каждой дате и отбрасывает уже начавшиеся slots.

**Source:** `backend/services/scheduling.py` — `_get_slots_for_duration`, `get_available_slots`; `backend/routers/public_master.py` — `get_public_availability`; `backend/models.py` — `MasterService`.

## 3. Working hours

`check_master_working_hours` проверяет, что весь booking interval покрыт schedule:

- salon work — хотя бы одним date-specific salon interval;
- personal work — одним или несколькими строго последовательными personal intervals.

Отсутствие соответствующего расписания означает `false`; weekly `AvailabilitySlot` здесь не является fallback. Поэтому create path, использующий working-hours guard, может быть строже availability path с weekly fallback.

**Source:** `backend/services/scheduling.py` — `check_master_working_hours`.

## 4. Timezone semantics

Master schedule хранит local date/time без offset. Scheduling helper интерпретирует naive booking datetime как wall time в `Master.timezone`, а aware datetime переводит в эту timezone. Invalid/missing timezone внутри low-level helper fallback-ится в `Europe/Moscow`; основной public availability/create path отдельно требует настроенную timezone и отклоняет missing value.

Public API возвращает aware ISO timestamps в timezone мастера и фильтрует past slots относительно `now` в той же zone. Другие compatibility endpoints могут принимать/возвращать naive values; единого repository-wide datetime contract пока нет.

**Source:** `backend/services/scheduling.py` — `_resolve_master_zoneinfo`, `_as_master_local_datetime`; `backend/routers/public_master.py` — timezone guards and slot conversion; `backend/routers/client.py` — timezone guard.

## 5. Blocking predicate и overlap

Общий conflict/availability service считает blocking все Booking rows, кроме raw status `cancelled` и несуществующего в enum `rejected`. Пересечение half-open по смыслу: `start < other_end` и `end > other_start`.

Следствия текущего predicate:

- `cancelled_by_client_early/late` продолжают блокировать slots;
- `payment_expired` продолжает блокировать;
- temporary bookings вообще не входят в общий query;
- completed rows на той же дате остаются занятостью своего исторического интервала.

Schedule materialization routes используют другой cancelled set и исключают все три cancellation statuses. Client/temporary compatibility create paths проверяют только равенство `start_time`, поэтому могут пропустить частичное пересечение.

**Source:** `backend/services/scheduling.py` — `check_booking_conflicts`, `get_available_slots`; `backend/routers/master.py` — schedule conflict filtering; `backend/routers/client.py` — create/temporary conflict queries; `backend/models.py` — `BookingStatus`.

## 6. Any-master allocation

Salon any-master availability объединяет weekly windows подходящих salon masters, выбирает одного кандидата на одинаковый start по наименьшему числу bookings за день и наружу возвращает только time interval. При равенстве текущая реализация заменяет предыдущего кандидата последним рассмотренным. `get_best_master_for_slot` проверяет weekly coverage и выбирает minimum occupied count.

Это compatibility salon algorithm, не правило основного master-only public page.

**Source:** `backend/services/scheduling.py` — `get_available_slots_any_master_logic`, `get_best_master_for_slot`; `backend/routers/bookings.py` — any-master endpoints.

## 7. Concurrency и UNKNOWN

Availability — вычисляемая проекция, не reservation. Общий DB constraint, запрещающий overlap, отсутствует; pre-check и INSERT разделены. Temporary hold не виден основному calculator.

- **UNKNOWN:** фактическая нагрузка и частота races.
- **UNKNOWN:** используются ли weekly `AvailabilitySlot` внешними clients как primary source после materialized schedule rollout.
- **CONFIRMED debt:** predicates и create paths расходятся; см. [Debt](../../Debt/booking-scheduling.md).
