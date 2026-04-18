# MASTER_ONLY MVP — предварительный скан

## 1. Таблица: area | file | function | risk | proposed change

| area | file | function | risk | proposed change |
|------|------|----------|------|-----------------|
| backend | `routers/client.py` | `create_booking` (client) | HIGH | При MODE=1: если `indie_master_id` — резолвить в master_id, писать только master_id |
| backend | `routers/bookings.py` | `create_booking_public` | HIGH | При MODE=1: если `indie_master_id` — резолвить в master_id, 400 если нельзя |
| backend | `routers/bookings.py` | `confirm_booking` | HIGH | Аналогично — owner_type_str из indie → резолв |
| backend | `utils/booking_factory.py` | `normalize_booking_fields` | HIGH | При MODE=1: owner_type='indie' → резолв indie→master, писать master_id; добавить owner_type='master' (solo) |
| backend | `routers/dev_testdata.py` | `create_indie_service` | MED | При MODE=1: 400 "indie services disabled in master-only MVP" |
| backend | `routers/dev_testdata.py` | `create_completed_bookings_bulk` | MED | При MODE=1: is_indie=True → резолв в master_id, писать только master_id |
| backend | `routers/dev_testdata.py` | `ensure_indie_master` | LOW | Оставить (bridge), при MODE=1 вызывается только с --legacy-indie-bookings |
| backend | `routers/client.py` | POST/DELETE favorites | LOW | Guards уже есть (400/410) |
| backend | `routers/client.py` | GET bookings/past | LOW | Уже BookingPastShortCanon при MODE=1 |
| backend | `routers/client.py` | `get_client_dashboard` | LOW | top_indie_masters — при MODE=1 заменить на top_masters (master_id) |
| backend | `routers/client.py` | `get_indie_master_profile` | LOW | При MODE=1: 410 или редирект на master |
| backend | `models.py` | Master | — | Добавить is_solo (bool), migration |
| backend | `scripts/reseed_local_test_data.py` | main | LOW | Выставлять is_solo=1 мастерам |
| backend | `scripts/verify_master_canon.py` | verify_db | — | Добавить FAIL если indie_master_id NOT NULL > 0 |
| mobile | `api/bookings.ts` | types | LOW | indie_master_id уже optional, master-only не шлёт |
| mobile | `api/favorites.ts` | — | LOW | Уже master-only |
| docs | — | — | — | MASTER_ONLY_MVP_REPORT, MASTER_ONLY_MVP_CHECKLIST |

## 2. Write-path для Booking creation

| Вход | Endpoint | Где master_id vs indie_master_id |
|------|----------|-----------------------------------|
| Client API | POST /api/client/bookings/ | `booking_in.indie_master_id` или `booking_in.master_id` → owner_type_str, owner_id_val → normalize_booking_fields |
| Public API | POST /api/bookings/public | `booking.master_id` / `booking.indie_master_id` → owner_type, owner_id → check_conflicts, затем create |
| Master confirm | POST /api/bookings/.../confirm | `booking.indie_master_id` / `booking.master_id` → normalize |
| Dev testdata | POST /api/dev/testdata/create_completed_bookings | is_indie → owner_type='indie', owner_id=indie_master_id |
| Reseed | create via /api/bookings/public | master_id (master-only) или indie_master_id (legacy) |

## 3. Порядок работ

1. **Guardrails booking_factory** — при MODE=1: indie→master резолв, owner_type='master' для solo
2. **Guards в client/bookings routers** — при MODE=1 reject или резолв indie_master_id
3. **create_indie_service** — 400 при MODE=1
4. **create_completed_bookings** — резолв is_indie→master_id
5. **is_solo** — migration + reseed
6. **verify** — indie_master_id NOT NULL = 0 как FAIL
7. **Docs** — REPORT + CHECKLIST
8. **pytest** — legacy indie create → master_id в DB

## 4. Риск-лист

- **Риск 1:** Services с salon_id=NULL для solo — normalize требует salon для 'salon'. Решение: owner_type='master' с salon_id=NULL.
- **Риск 2:** check_master_working_hours для indie_master_id — при резолве используем master_id для проверки.
- **Риск 3:** evaluate_and_prepare_applied_discount принимает master_id — при резолве передаём master_id.
