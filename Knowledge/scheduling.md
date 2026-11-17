---
type: Knowledge
project: DeDato
knowledge_class: living
environment: common
status: active
last_verified: 2026-11-17
---

# Scheduling and availability

Канон repository-known расчёта рабочих окон, доступных слотов и пересечений. Booking lifecycle находится в [Booking](booking.md).

## 1. Источники расписания

Для master path сосуществуют:

- `MasterSchedule`: date-specific интервалы, обычно материализованные 30-минутными rows;
- `AvailabilitySlot`: weekly base windows (`day_of_week` 1–7);
- `MasterScheduleSettings.fixed_schedule`: JSON правил/настроек; Alembic migration для settings является no-op, таблица существует в model/runtime lineage;
- legacy `IndieMasterSchedule`.

При расчёте master availability наличие active `MasterSchedule` rows на дату имеет приоритет над weekly `AvailabilitySlot`. Если date-specific rows отсутствуют, используется weekly base; если нет обоих источников — слотов нет.

Schedule rule endpoints (`weekdays`, `monthdays`, `shift`) материализуют date-specific rows. Day update защищает 30-minute alignment и не позволяет убрать schedule slots, покрывающие active bookings.

Current HTTP surface: weekly, monthly, day, rules, create/update/bulk. Legacy `GET /api/master/schedule` и `POST /api/master/schedule` retired (`404`): product consumers не найдены, handlers были несовместимы с актуальной моделью.

**Source:** `backend/models.py` — schedule models; `backend/routers/master.py` — schedule/rules, weekly/day/bulk endpoints; `backend/services/scheduling.py`; `backend/tests/test_master_schedule_day.py`; `backend/tests/test_legacy_master_schedule_retired.py`; `backend/alembic/versions/07de82665594_add_master_schedule_settings.py`.

## 2. Slot generation and calendar interval grid (канон)

**CONFIRMED, 2026-11-14 (утверждение владельца):** все **календарные** интервалы
записи (online/client, manual master, public) и **личных дел** (calendar blocks)
должны иметь **начало и конец** на сетке **:00 / :30**, **секунды и доли секунды =
0**, **длительность — положительное кратное 30 мин**. Без legacy exemption:
off-grid wall time отклоняется на API (`BOOKING_INTERVAL_OFF_GRID`) и на SQLite
через UDF-триггеры (`dedato_sqlite_validate_*`) на `bookings` (wall + optional
canonical) и `calendar_blocks` (UTC us + zone). UDF регистрируются на каждом
app/test `connect`; без UDF SQLite/CLI fail closed. Пустые интервалы и частичные
NULL reject; canonical elapsed проверяется по UTC микросекундам (DST-safe), wall
согласуется с zone без обнуления subsecond. `enforce_calendar_interval_wall_grid`
для **aware** instant сравнивает положительный UTC-elapsed, а не naive
`end <= start` (fall-back aware 01:30→01:00 с тем же `ZoneInfo` допустим при
30‑мин UTC span, как SQL guard). `request_interval` сначала независимо
нормализует каждую границу (naive → `resolve_wall_datetime`, aware →
`canonical_instant`; DST fold ambiguity → `BOOKING_TIME_INVALID`), затем
`enforce_calendar_interval_wall_grid` на aware wall в zone владельца; смешанный
naive+aware в одном запросе поддерживается. `duration_minutes` на сыром mixed
вводе отклоняет с `CalendarIntervalGridError`, а не `TypeError`.
`service_duration_allowed_for_grid` — строго
положительное целое, кратное 30 (без `int(30.9)` и неположительных). Migration `20261114_calendar_grid_guard`
— fail-fast на dirty legacy; `Base.metadata.after_create` ставит DDL только для
**впервые созданных** `bookings` / `calendar_blocks` в текущем `create_all`
(повторный `create_all` на существующую dirty `bookings` не переустанавливает
booking triggers). UDF: `deterministic=True`.
Каталожная `MasterService.duration` / выбранная длительность manual, задающая
конец интервала, должна быть кратна 30 мин; иначе 4xx без скрытого округления.

Master day agenda **не** синтезирует «нейтральные промежутки» и не показывает
клиентскую availability — только bookings и personal blocks из API (включая
awaiting), без подписей про «неподтверждённую доступность»
([Web architecture](web.md)).

`get_available_slots` принимает owner, date, service duration и optional branch.
Candidate starts выравниваются на `:00`/`:30` и идут с шагом 30 минут. Конец
услуги должен помещаться в availability window и лежать на той же сетке.
Date argument for HTTP availability/reschedule is strict `YYYY-MM-DD`. Adjacent
half-open occupancy is allowed; current booking is excluded from GET collision
checks on reschedule. Weekend is not a hard-ban at this layer.

Для date-specific master schedule service duration округляется вверх до числа
последовательных 30-minute rows, после чего из найденного окна снова
генерируются starts с реальной duration. Несмежные rows не образуют общее окно.

**Sources:** `backend/utils/calendar_interval_grid.py`,
`backend/utils/sqlite_calendar_grid_triggers.py`,
`backend/services/booking_admission.py` (`request_interval`),
`backend/routers/dev_e2e.py` (on-grid fixtures),
`frontend/src/utils/masterDayAgenda.js`.

Public master availability использует `MasterService.duration`, вызывает общий `get_available_slots` по каждой дате, отбрасывает уже начавшиеся slots и дополнительно отфильтровывает candidate slots, которые `check_master_working_hours` отвергнет на create. Это закрывает weekly-only GET slot, который public MASTER POST гарантированно отклонит. Изменение ограничено public MASTER availability route; salon/private scheduling consumers не менялись.

**Source:** `backend/services/scheduling.py` — `_get_slots_for_duration`, `get_available_slots`; `backend/routers/public_master.py` — `get_public_availability`; `backend/models.py` — `MasterService`; `backend/tests/test_public_master.py`.

## 3. Working hours

`check_master_working_hours` проверяет, что весь booking interval покрыт schedule:

- salon work — хотя бы одним date-specific salon interval;
- personal work — одним или несколькими строго последовательными personal intervals.

Отсутствие соответствующего расписания означает `false`; weekly `AvailabilitySlot` здесь не является fallback. Public MASTER GET availability now applies the same working-hours guard before returning a slot; salon/private consumers of `get_available_slots` were not changed. Remaining deferred mismatch: a long single `MasterSchedule` window can still be accepted by POST while GET slot-generation does not present it. Weekly `AvailabilitySlot` as a second scheduling source of truth still requires a separate redesign. These are not current release blockers.

**Source:** `backend/services/scheduling.py` — `check_master_working_hours`; `backend/routers/public_master.py` — public availability filter.

## 4. Timezone semantics

Master schedule хранит local date/time без offset. Business calendar определяется `Master.timezone`; invalid/missing timezone внутри low-level helper fallback-ится в `Europe/Moscow`. Timezone production host не определяет календарный день/неделю мастера. Основной public availability/create path отдельно требует настроенную timezone и отклоняет missing value.

Web/mobile используют request-generation/current-period protection, чтобы поздний A-response не перезаписывал уже выбранный B/C. Stabilized client paths include Week → конкретный день → «Открыть слот», «Закрыть слоты», Day calendar, Sunday ↔ Monday, selected date across refetch/week change, past-date submission, UTC truncation, midnight day assignment and out-of-order schedule responses.

Public API возвращает aware ISO timestamps в timezone мастера и фильтрует past slots относительно `now` в той же zone. Другие compatibility endpoints могут принимать/возвращать naive values; единого repository-wide datetime contract пока нет.

**Source:** `backend/services/scheduling.py` — `_resolve_master_zoneinfo`, `_as_master_local_datetime`; `backend/routers/public_master.py` — timezone guards and slot conversion; `backend/routers/client.py` — timezone guard; `frontend/src/components/MasterScheduleCalendar.jsx`; `mobile/app/(master)/master/schedule.tsx`.

## 5. Blocking predicate и overlap

Общий helper `backend/utils/booking_occupancy.py` задаёт один predicate для conflict и availability: пересечение half-open `existing.start < requested.end AND existing.end > requested.start`. Соприкасающиеся границы разрешены.

Следствия legacy predicate (режим по умолчанию вне локального запускателя):

- `cancelled`, `cancelled_by_client_early/late`, `payment_expired` и compatibility status `rejected` не блокируют slots;
- temporary bookings вообще не входят в общий query;
- `completed` остаётся занимающим статусом, включая future auto-confirm rows.

Schedule materialization, client create, temporary payment confirmation, public/subdomain create и any-master selection используют тот же occupancy helper. Поэтому availability и create одинаково трактуют overlap и non-occupying statuses.

**Source:** `backend/services/scheduling.py` — `check_booking_conflicts`, `get_available_slots`; `backend/routers/master.py` — schedule conflict filtering; `backend/routers/client.py` — create/temporary conflict queries; `backend/models.py` — `BookingStatus`.

## 6. Any-master allocation

Salon any-master availability объединяет weekly windows подходящих salon masters, выбирает одного кандидата на одинаковый start по наименьшему числу bookings за день и наружу возвращает только time interval. При равенстве текущая реализация заменяет предыдущего кандидата последним рассмотренным. `get_best_master_for_slot` проверяет weekly coverage и выбирает minimum occupied count.

Это compatibility salon algorithm, не правило основного master-only public page.

**Source:** `backend/services/scheduling.py` — `get_available_slots_any_master_logic`, `get_best_master_for_slot`; `backend/routers/bookings.py` — any-master endpoints.

## 7. Concurrency и UNKNOWN

Availability — вычисляемая проекция, не reservation. DB constraint, запрещающий overlap, отсутствует, но актуальные SQLite create paths начинают одну request-owned `BEGIN IMMEDIATE` transaction до conflict/limit reads и сохраняют side effects вместе с Booking. Writer serialization закрывает same-slot race; busy contention возвращает retryable `503`. В legacy-режиме temporary hold не виден основному calculator до payment confirmation; в unified pending non-expired holds включены в occupancy.

- **UNKNOWN:** фактическая нагрузка и частота races.
- **UNKNOWN:** используются ли weekly `AvailabilitySlot` внешними clients как primary source после materialized schedule rollout.
- **CONFIRMED debt:** на уровне схемы всё ещё нет overlap constraint; гарантия сериализации относится к актуальным SQLite create paths. См. [Debt](booking-scheduling.md).

## Calendar B3 and unified admission

**CONFIRMED, 2026-11-14, код локальной B3-ветки:**
`CALENDAR_ADMISSION_MODE=unified` включает общий admission для master occupancy:
занимающие bookings, pending non-expired holds и личные calendar blocks.
Иное значение сохраняет legacy predicate. B3 write endpoints требуют unified
и иначе возвращают `503 CALENDAR_UNIFIED_REQUIRED`.

Канонический интервал хранится как UTC microseconds плюс IANA timezone; wall time
сохраняется для совместимости. Новый код пишет эти metadata и в legacy-mode
(shadow writes), но неизвестный timezone старых naive rows не угадывает.
Unresolved актуальные интервалы блокируют unified admission с
`BOOKING_TIME_UNRESOLVED`. Перед активацией используйте read-only
`backend/scripts/calendar_admission_readiness.py`, не произвольный backfill.

Manual booking и личный блок проверяют пересечения в общей SQLite writer
transaction. У блока в публичную доступность попадает занятость интервала;
название, описание и категория остаются приватными. Удаление блока — soft delete.
Mutations используют version, create поддерживает idempotency key. B3 не заменяет
настройку рабочих слотов: «Открыть слот» остаётся изменением availability.

**Источники:** `backend/services/booking_admission.py`, `calendar_admission.py`,
`calendar_availability.py`, `calendar_b3.py`, `calendar_readiness.py`;
`backend/tests/test_calendar_b3_backend.py`, `test_calendar_b2_unified_admission.py`.
API: [Booking API](booking-api.md#calendar-b3-master-api).

## Production grid-guard remediation plan (owner approval required)

**CONFIRMED, 2026-11-17, изолированная копия prod SQLite (backup `20261117_173441`):**
миграция `20261114_calendar_grid_guard` **падает** на **29** строках `bookings`.
Ниже — план **без** автоматического округления, удаления записей или ослабления
guard. Исполняемый отчёт: артефакт `prod-grid-report.json` (локальный анализ,
не в git).

### Сводка нарушений

| Класс | Count | Пример |
|-------|------:|--------|
| `end:off_grid_wall` + `duration_not_30_multiple` | 27 | 45‑мин окончание (:15/:45), чаще `created`/`completed` smoke |
| subsecond + off-grid start/end (**#145**) | 1 | `2026-04-14 22:02:38.047306` → `22:32:38.047306`, `completed`, `master_id=1` |
| `inverted_interval` (**#1067**) | 1 | `start 16:00` / `end 15:00`, `cancelled`, `master_id=9`, `client_id=14` |

**Происхождение (confidence):** для всех 29 строк в отчёте стоит
`INFERRED` (пакетные даты `2026-04-23`, `2026-06-04/07`, subsecond/inverted).
Это **не** доказательство тестовости: признак — совокупность метаданных, не
только `master_id` 11/15/16.

### Связанные сущности (копия prod)

Перед правкой на копии для каждого `id` проверять: `booking_confirmations`,
`incomes` / accounting, `loyalty_transactions`, canonical UTC columns.
В отчёте: у части `completed` есть `incomes` (напр. #912–914); у `created`
smoke — обычно без доходов; у #145 — confirmation без income; у #1067 — пусто.

### Предлагаемые действия (согласование владельца)

1. **Тип A (27× :15/:45 end, duration 45):** ручной repair **на копии** — для
   каждой строки зафиксировать целевой on-grid интервал (сдвиг **только** конца
   на ближайший допустимый :00/:30 **без** изменения бизнес-смысла, либо
   пересчёт `end` из `start` + service duration, кратной 30). Повторно прогнать
   `calendar_admission_readiness` / apply migration head на копии. Сверить
   incomes/loyalty; при расхождении — отдельное решение, не тихий delete.
2. **#145 (subsecond):** нормализация wall до целых секунд и сетки (напр.
   truncate subsecond → `22:00–22:30` или фактическая 30‑мин сетка по service);
   обновить canonical UTC **в той же транзакции**, что и wall; dry-run на копии.
3. **#1067 (inverted, cancelled):** минимальный fix `end > start` on-grid
   (напр. `16:00–16:30` или согласованный отменённый интервал); проверить, что
   статус `cancelled` сохранён и occupancy не меняется для активных слотов.

**Gate:** cutover `20261114_calendar_grid_guard` на prod разрешён только после
подтверждённого owner SQL/script на копии + зелёный full CI релиз-кандидата +
миграция dry-run на той же копии. См. [Production topology](production-topology.md#current-release-gate).
