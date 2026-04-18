# MASTER_ONLY MVP Report

## Что сделано

### 1. Guardrails: master-only write path

- **booking_factory**: При MASTER_CANON_MODE=1 (по умолчанию) owner_type='indie' резолвится в master_id через indie_masters.master_id. Запись создаётся только с master_id, indie_master_id=NULL.
- **owner_type='master'**: Добавлен для solo (master_id без salon_id).
- **client/bookings routers**: При indie_master_id в MODE=1 — резолв в master_id; owner_type master/salon в зависимости от service.salon_id.
- **create_indie_service**: При MODE=1 → 400 "Indie services disabled in master-only MVP".
- **create_completed_bookings**: При MODE=1 и is_indie=True — skip (не создаём indie-записи).

### 2. Solo флаг

- **can_work_independently**: Используется как маркер solo. Reseed выставляет can_work_independently=1 для тестовых мастеров (+79990000000…+79990000007).

### 3. Verify + Reseed

- **verify_master_canon.py**: bookings.indie_master_id NOT NULL = 0 как FAIL.
- **reseed**: can_work_independently=1 для мастеров; mode, completed count, sanity summary.

### 4. Тесты

- **test_booking_factory**: test_normalize_indie_resolves_to_master_when_mode_1 — legacy indie create → запись с master_id, indie_master_id=None.

## Почему безопасно

- IndieMaster таблица/модели не удалены.
- При MODE=0 сохраняется обратная совместимость.
- Все write-path проходят через normalize_booking_fields с резолвом.
- Reseed по умолчанию master-only; legacy через --legacy-indie-bookings.
