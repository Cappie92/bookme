# Шаг 5 — Тесты: timezone, winner rule_id, deactivated в бронированиях

## Добавленные тесты

| Тест | Описание |
|------|----------|
| `test_winner_selection_min_rule_id` | Два правила first_visit с одинаковым %; оба матчатся. Победитель — с меньшим `rule_id`. |
| `test_timezone_master_local_happy_hours` | Happy hours по локальному времени мастера. Master `Europe/Moscow` (UTC+3), интервал 12:00–14:00 Пн. Бронь 10:00 UTC = 13:00 Moscow → match; 08:00 UTC = 11:00 → no match. В тестах не используем `Etc/GMT-*` (inverted sign). |
| `test_applied_discount_unchanged_after_rule_deactivation` | Booking + AppliedDiscount по loyalty-правилу. Деактивация правила (`is_active=False`). AppliedDiscount остаётся, `discount_id` / `discount_percent` / `discount_amount` не меняются. |

## Уже покрыто (ранее)

- `test_require_master_timezone_rejects_empty` — timezone обязателен для создания скидок.
- `test_deactivated_rule_not_applied` — неактивное правило не попадает в `best_candidate`.
- `test_happy_hours_end_exclusive` — end exclusive для happy hours.
- `test_winner_selection_condition_priority` — при равном % побеждает по приоритету `condition_type` (birthday > first_visit).
- `test_winner_selection_condition_type_priority_equal_percent` — birthday vs happy_hours, оба матчатся, одинаковый % → побеждает birthday.
- `test_regular_visits_b1_inject_now` — B1 окно от «сейчас», inject `now`.

## Запуск

```bash
pytest backend/tests/test_loyalty_discounts.py -v
```

Ожидание: **30 passed** (включая `test_winner_selection_condition_type_priority_equal_percent` и др.).
