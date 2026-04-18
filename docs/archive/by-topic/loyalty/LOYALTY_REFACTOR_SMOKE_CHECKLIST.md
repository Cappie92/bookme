# Smoke checklist: loyalty refactor

## pytest

```bash
cd backend && python3 -m pytest tests/test_loyalty_discounts.py -v
```

Ожидание: все тесты зелёные (в т.ч. `test_happy_hours_end_exclusive`, `test_service_discount_legacy_invalid`, `test_winner_selection_condition_priority`, `test_regular_visits_b1_inject_now`).

## API

- `GET /api/loyalty/templates` — 200, шаблоны с `conditions`.
- `GET /api/loyalty/status` — 200 (master), `quick_discounts` / `complex_discounts` / `personal_discounts`.
- `POST /api/loyalty/quick-discounts` с `condition_type: service_discount`, `parameters: { service_id: N }` (N — услуга мастера) — 200.
- То же с `parameters: { items: [ { service_id: 1 }, { service_id: 2 } ] }` — 422.
- `POST /api/loyalty/evaluate` с телом по контракту — 200, `candidates` / `best_candidate`.

## Booking flow

- Создание бронирования (авторизованным / публично) с клиентом и услугой, подходящими под first_visit / birthday / happy_hours / service_discount — в ответе `payment_amount` со скидкой, в БД есть `AppliedDiscount`.
- `GET /bookings/{id}` и `GET /client/bookings/...` — в ответе `applied_discount` с `rule_type`, `name`, `discount_percent`, `discount_amount`.

## UI (ручные проверки)

- **Web:** Страница лояльности → быстрые скидки. Подсказка «При совпадении нескольких правил…» видна. Активация шаблона → «Активна». Одинаковые шаблоны/скидки на web и mobile дают одинаковый «Активна»/«Не активна».
- **Mobile:** Экран лояльности → быстрые скидки. Та же подсказка. Активация/деактивация шаблонов, совпадение с web по «Активна».

## Обратная совместимость

- Старые скидки с `period`, `days_since_last_visit`, `start_time`/`end_time`/`days_of_week`, `items` (1 элемент) / `service_ids` (1) / `category_ids` (1) продолжают матчиться и отображаться.

## Timezone

- Используется `Master.timezone` (default `Europe/Moscow`). При отсутствии — fallback `UTC` в `_master_timezone`. Если в схеме БД не будет поля — добавить миграцию с `ALTER TABLE masters ADD COLUMN timezone VARCHAR DEFAULT 'Europe/Moscow'` и обновить модели.
