---
type: Knowledge
status: active
project: DeDato
last_runtime_check: 2026-08-04
---

# Booking

Канон текущего repository-known жизненного цикла записи. Расчёт доступности принадлежит [Scheduling](../scheduling/README.md), HTTP-границы — [booking API contract](../../Contracts/booking-api.md), подтверждённые ограничения — [booking and scheduling debt](../../Debt/booking-scheduling.md).

## 1. Сущность и стороны

`Booking` связывает клиента (`client_id`), услугу (`service_id`), временной интервал и исполнителя. Runtime допускает три owner-представления: `master_id`, legacy `indie_master_id` и salon context (`salon_id`, `branch_id`). Основной master-only write path нормализует владельца через `normalize_booking_fields`; legacy indie отключён, если не включён отдельный compatibility flag.

Для самостоятельного мастера нормализация оставляет `master_id` без salon/branch. Для salon service она сохраняет мастера, выводит salon из услуги и выбирает branch по текущей factory-логике. DB CHECK для owner shape создаётся только в PostgreSQL migration; production SQLite опирается на write-path validation.

**Source:** `backend/models.py` — `Booking`, `BookingStatus`; `backend/utils/booking_factory.py`; `backend/alembic/versions/20260128_add_booking_owner_check_constraints.py`; `backend/tests/test_booking_factory.py`.

## 2. Create paths

Create paths не являются взаимозаменяемыми:

| Путь | Текущий смысл | Initial raw status | Проверка времени |
|------|---------------|--------------------|------------------|
| `POST /api/public/masters/{slug}/bookings` | Основная web/mobile публичная запись `/m/{slug}`; активный client session | `created` | working hours + atomic interval overlap |
| `POST /api/client/bookings/` | Client-cabinet compatibility path | значение схемы, default `created` | тот же atomic interval overlap (не exact start) |
| `POST /api/bookings/` | Generic authenticated compatibility path | `created`, но отдельная auto-confirm ветка пишет `completed` | working hours + atomic interval overlap |
| `POST /api/bookings/public` | Legacy public-by-phone path с account/bootstrap response | `created`, но отдельная auto-confirm ветка пишет `completed` | working hours + atomic interval overlap; User+Booking в одной txn |
| `POST /api/bookings/create-with-any-master` | Public salon allocation; **unauthenticated (security debt)** | `created` | racy pre-check + INSERT; не входит в atomic create |
| `/api/client/bookings/temporary*` | Compatibility hold/prepayment path | temporary `pending`; confirmation создаёт Booking со статусом `completed` | только совпадение начала у temporary/regular rows |

Основной web route — `frontend/src/App.jsx` → `MasterPublicBookingPage` → `PublicBookingWizard`; mobile использует `mobile/app/(public)/m/[slug].tsx`. Снятый web `/domain/{subdomain}` и `MasterBookingModule` не определяют основной публичный контракт.

Цена создаваемой записи хранится в `payment_amount` после скидки. `loyalty_points_used` является резервом до отмены или completion; это синхронная зависимость Booking path от Loyalty, а не событие.

Четыре основных create path вызывают `create_booking_atomic` после read-only orchestration. Connection владеет SQLite `BEGIN IMMEDIATE` / `commit` / `rollback`. Canonical Service для public create создаётся в той же txn, что Booking. PostgreSQL writer strategy не реализована и должна fail clearly. TemporaryBooking hold UX и `create-with-any-master` остаются вне этого atomic create boundary. Reschedule / restore / edit-accept / temp confirm не входят в этот слой.

После merge verify-first коллеги `_create_specific_public_booking_after_proof` (и будущий `_create_any_master_public_booking_after_proof`) не должны делать собственный conflict SELECT → отдельный INSERT/commit; они должны вызывать atomic creation boundary.

**Source:** `backend/services/booking_creation.py`; `backend/routers/public_master.py` — `create_public_booking`; `backend/routers/client.py` — `create_booking`; `backend/routers/bookings.py` — create functions; `frontend/src/App.jsx`; `frontend/src/components/booking/PublicBookingWizard.jsx`; `mobile/app/(public)/m/[slug].tsx`; `backend/utils/public_booking_loyalty.py`.

## 3. Raw и effective status

Raw status хранится в `bookings.status`. Enum объявляет:

- `created`, `confirmed`, `awaiting_confirmation`, `completed`;
- `cancelled`, `cancelled_by_client_early`, `cancelled_by_client_late`;
- `awaiting_payment`, `payment_expired`.

Effective status — read-time projection, не самостоятельный persisted workflow:

- future `awaiting_confirmation` показывается как `confirmed` для legacy rows;
- past `created` после `start_time + 1 minute` показывается как `awaiting_confirmation`;
- остальные значения возвращаются без изменения.

List helper временно меняет ORM object для формирования ответа, но не commit-ит это значение. Поэтому UI-статус нельзя использовать как доказательство persisted transition.

**Source:** `backend/utils/booking_status.py` — `get_effective_booking_status`, `apply_effective_status_to_bookings`; `backend/tests/test_booking_status_effective.py`; migration `backend/alembic/versions/20260128_fix_future_awaiting_confirmation_legacy.py`.

## 4. Фактический lifecycle

### Pre-visit

В manual mode accounting endpoint допускает для будущей записи `created | awaiting_confirmation → confirmed`. В auto mode этот ручной переход отклоняется. Флаг `pre_visit_confirmations_enabled` синхронизируется с manual mode при наличии extended stats, но серверный переход проверяет прежде всего future time, raw status и `auto_confirm_bookings`.

### Post-visit

Для manual mode прошедшие raw `created | confirmed | awaiting_confirmation` считаются ожидающими исхода. Подтверждение вызывает общий finalize path и устанавливает `completed`; отклонение устанавливает `cancelled`. Массовые confirm/cancel выбирают только raw `awaiting_confirmation`, поэтому read-time effective `awaiting_confirmation` сам по себе не делает row участником bulk operation.

Переключение с auto на manual вызывает отдельный compatibility helper: он переводит существующие raw `awaiting_confirmation` в `completed` и создаёт `BookingConfirmation`, но не использует общий finalize path. Это зафиксировано как debt.

### Cancellation

Runtime использует общий `cancelled` и две client cancellation категории. Accounting reasons: `client_requested`, `client_no_show`, `mutual_agreement`, `master_unavailable`. Не все paths записывают initiator/reason: client DELETE очищает loyalty reserve и ставит общий `cancelled` без детализации.

Отмена сохраняет Booking в основных client/accounting flows. Generic `DELETE /api/bookings/{id}` ограничен admin-only hard delete чистой будущей брони; остаточный critical gap касается edit-request mutations и описан в [Debt](../../Debt/booking-scheduling.md#critical-generic-booking-mutation-authorization).

### Reschedule

В репозитории сосуществуют direct `BookingUpdate` и `BookingEditRequest`. Direct update и edit-request acceptance меняют `start_time`/`end_time`; enforcement и conflict semantics различаются по router family. Единого runtime state machine или единого reschedule service нет.

**Source:** `backend/routers/accounting.py` — `update_booking_status`, `confirm_booking`, `confirm_all_bookings`, cancellation endpoints, `auto_confirm_awaiting_on_manual_switch`; `backend/routers/master.py` — settings update and `get_past_appointments`; `backend/routers/client.py`; `backend/routers/bookings.py`; `backend/utils/booking_loyalty_reserve.py`.

## 5. Transition declaration

`backend/utils/booking_status.py::is_status_transition_allowed` объявляет компактный граф переходов, но runtime routers его не вызывают. Реальное enforcement определяется endpoint-specific guards и иногда прямым присваиванием `BookingUpdate.status`. Этот helper — не SSOT state machine.

**Source:** `backend/utils/booking_status.py`; repository call-site search; `backend/schemas.py` — `BookingUpdate`; booking/client/accounting routers.

## 6. Concurrency и транзакции

Четыре основных create path входят в SQLite `BEGIN IMMEDIATE` на отдельной Connection. Session только query/add/flush; Connection владеет commit/rollback. Overlap SELECT и write живут в одной txn. Конфликт интервала → `409 BOOKING_SLOT_CONFLICT`. SQLite busy → `503 BOOKING_SLOT_BUSY`. Не-SQLite dialect → `BOOKING_ATOMIC_UNSUPPORTED`. DB exclusion constraint по-прежнему отсутствует; PostgreSQL writer strategy не реализована.

`create-with-any-master`, reschedule, status restore, edit-request accept и TemporaryBooking confirm пока не используют этот writer. `BookingConfirmation.booking_id` уникален и является главным DB guard повторной финализации, но `Income.booking_id` не unique. Temporary rows не участвуют в общем availability/conflict SELECT.

**Source:** `backend/services/booking_atomic_txn.py`, `booking_creation.py`, `booking_occupancy.py`; `backend/models.py` — `BookingConfirmation`, `Income`, `TemporaryBooking`; [completion side effects](completion-side-effects.md).

## 7. UNKNOWN и границы

- **UNKNOWN:** какие compatibility endpoints имеют внешних клиентов вне tracked web/mobile.
- **UNKNOWN:** фактическая частота concurrent slot races.
- `MissedRevenue` связан с Booking моделью, но не создаётся автоматически общим completion/cancellation lifecycle; его writers принадлежат expenses/accounting API и будут детализированы в finance package.
- Оплата услуги клиентом мастеру не является SaaS subscription billing и не описывается контрактом Robokassa подписок.
