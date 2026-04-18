# Changelog: рефакторинг loyalty (backend = source of truth, единый матчинг web/mobile)

**Дата:** 2026-01-28

- **Backend:** Новая модель `service_discount`: один селекшен (`service_id` | `category_id`), percent из rule. Legacy items/service_ids/category_ids с 1 элементом конвертируются; >1 → invalid_parameters, 422 при create/update.
- **Backend:** Выбор winner: макс. `discount_percent` → приоритет `condition_type` (birthday → … → service_discount) → мин. `rule_id`. `rule.priority` не используется для winner.
- **Backend:** regular_visits (B1): окно от «сейчас» (локальное время мастера), не от даты бронирования.
- **Backend:** happy_hours: end exclusive; несколько интервалов; дата/время по локальному времени мастера.
- **Backend:** birthday: локальная дата мастера, year-wrap без изменений.
- **Backend:** TZ: `get_master_local_now`, `to_master_local`, `_master_local_to_utc`; `Master.timezone`, fallback UTC.
- **Backend:** `evaluate_discount_candidates` и `evaluate_and_prepare_applied_discount` принимают опциональный `now` для тестов.
- **Backend:** `_validate_service_discount` в `routers/loyalty`: проверка service_id ∈ master_services, category_id у услуг мастера.
- **Frontend (web + mobile):** `normalizeParametersForComparison` для `service_discount` приведён к `{ service_id }` | `{ category_id }` | `_invalid`. Спец-правило: шаблон service_discount с `_invalid` матчит любую валидную скидку этого типа.
- **UI:** Подсказка «При совпадении нескольких правил применяется одна скидка с максимальным процентом» в быстрых скидках (web + mobile).
- **Тесты:** happy_hours end exclusive, service_discount legacy invalid, winner по condition_type, regular_visits B1 с inject `now`, правки happy_hours/service_discount под TZ и новую модель.
