# Шаг 1 — Временное бронирование и фиксация скидки

## 1.1 Анализ (read-only)

### Текущий поток

| Этап | Файл | Действие |
|------|------|----------|
| Создание temporary | `routers/client.py` ~659 | `evaluate_and_prepare_applied_discount` → сохраняем только `payment_amount` в `TemporaryBooking` |
| Подтверждение | `routers/client.py` ~765 | Снова вызывается `evaluate_and_prepare_applied_discount` → создаётся `Booking` + `AppliedDiscount` из **повторной** оценки |

### Модель TemporaryBooking

- `backend/models.py` 1291–1318: `temporary_bookings` — нет полей для скидки.
- Хранится: `payment_amount`, `expires_at`, `status`, `master_id`, `client_id`, `service_id`, `start_time`, `end_time`.

### Расхождение со спецификацией

- **Спека:** скидка фиксируется при **старте** бронирования; действует на весь таймаут; деактивация **после** старта не отменяет скидку в этом бронировании.
- **Сейчас:** скидка пересчитывается при **confirm**. Если между create и confirm правило деактивировали — при confirm может применяться другая скидка или вообще не применяться.

### Вывод

- Нужно **фиксировать** скидку при создании temporary и **не пересчитывать** при confirm.
- В temporary нужно хранить не только `payment_amount`, но и данные для `AppliedDiscount`: `rule_type`, `rule_id`, `discount_percent`, `discount_amount`.

---

## 1.2 План изменений (минимальные правки)

1. **Миграция:** добавить в `temporary_bookings` nullable-поля:
   - `fixed_discount_rule_type` (String),
   - `fixed_discount_rule_id` (Integer),
   - `fixed_discount_percent` (Float),
   - `fixed_discount_amount` (Float).
2. **Модель:** добавить эти поля в `TemporaryBooking`.
3. **create_temporary:** после `evaluate_and_prepare_applied_discount` сохранять `applied_discount_data` в новые поля (если скидка была).
4. **confirm:** не вызывать `evaluate_and_prepare_applied_discount`. Использовать `temporary_booking.payment_amount` и сохранённую скидку; создавать `AppliedDiscount` только из этих данных.
5. Обратная совместимость: старые temporary без полей скидки → при confirm не создаём `AppliedDiscount`, `payment_amount` уже сохранён в TB.

---

## 1.3 Отчёт после реализации

- **Миграция:** `alembic/versions/20260128_add_fixed_discount_to_temporary_bookings.py` — добавлены `fixed_discount_rule_type`, `fixed_discount_rule_id`, `fixed_discount_percent`, `fixed_discount_amount` (все nullable).
- **Модель:** `models.TemporaryBooking` — те же поля.
- **create_temporary:** после `evaluate_and_prepare_applied_discount` сохраняем данные скидки в `fixed_*` и в `payment_amount`.
- **confirm:** скидка **не пересчитывается**. Используются `payment_amount` и `fixed_*` из temporary; `AppliedDiscount` создаётся только из них. В ответе выставляется `booking.applied_discount` через `build_applied_discount_info`.
- **Обратная совместимость:** старые temporary без `fixed_*` → при confirm `has_fixed_discount` false, `AppliedDiscount` не создаётся, `payment_amount` берётся из TB.
- **Тесты:** `pytest tests/test_loyalty_discounts.py` — 24/24 зелёные.

---

## 1.4 Smoke checklist (шаг 1 — temporary + фиксация скидки)

- [ ] `python3 -m pytest backend/tests/test_loyalty_discounts.py -v` — все зелёные.
- [ ] `alembic upgrade head` — миграция `20260128_tb_fixed_discount` применяется без ошибок.
- [ ] **Create temporary с скидкой:** клиент с предоплатой создаёт temporary → в ответе `payment_amount` со скидкой. В БД у `temporary_bookings` заполнены `fixed_discount_*`.
- [ ] **Confirm без пересчёта:** confirm той же temporary → создаётся `Booking` с `payment_amount` и `applied_discount`, совпадающими с temporary. Скидка **не** пересчитывается.
- [ ] **Деактивация не ломает:** создать temporary (скидка активна) → деактивировать правило → confirm. В бронировании по-прежнему должна быть зафиксированная скидка и та же `payment_amount`.
- [ ] **Temporary без скидки:** создание temporary, когда скидка не матчится → `fixed_discount_*` null, `payment_amount` = базовая цена. После confirm — `AppliedDiscount` нет, `payment_amount` без скидки.
