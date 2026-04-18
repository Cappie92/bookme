# Шаг 3 — Фиксация поведения деактивации скидок

## 3.1 Фактическое поведение (как реализовано)

### Backend

- **Оценка скидок** (`utils/loyalty_discounts.evaluate_discount_candidates`): правила с `is_active=False` попадают в `candidates` с `reason="inactive"`, но в `applicable` не включаются (`applicable = [c for c in candidates if c["is_active"] and c["match"]]`). `best_candidate` берётся только из `applicable` → деактивированные правила не применяются к новым бронированиям.
- **AppliedDiscount**: хранится в `applied_discounts` по `booking_id`; ссылается на `discount_id` / `personal_discount_id`. Деактивация правила (is_active=false) не меняет и не удаляет записи в `applied_discounts` → уже оформленные брони сохраняют зафиксированную скидку.
- **Temporary booking** (шаг 1): скидка фиксируется при создании temporary; при confirm не пересчитывается. Деактивация после создания temporary не отменяет скидку в подтверждённом бронировании.

### Деактивация vs удаление

- **Спека:** «Любую скидку можно деактивировать, не удаляя правило.»
- **Реализация:** Деактивация = `PUT .../quick-discounts|complex-discounts|personal-discounts/:id` с `{ "is_active": false }`. Правило остаётся в БД. DELETE по-прежнему есть, но в UI «деактивация» (переключатель шаблона, кнопка в списке) вызывает только update.

## 3.2 Изменения в коде

### Web (`LoyaltySystem.jsx`)

- **Quick/Complex/Personal:** «Удалить» (корзина) и деактивация по шаблону → `apiPut(..., { is_active: false })` вместо `apiDelete`. Текст подтверждения: «Деактивировать скидку? Она перестанет применяться к новым записям. Уже оформленные записи не изменятся.»
- **handleDeletePersonalDiscount:** добавлен отдельный обработчик для персональных скидок (раньше ошибочно использовался quick).
- Списки «Активные быстрые / сложные / персональные скидки» рендерят только `discounts.filter(d => d.is_active)`.

### Mobile (`loyalty.tsx`, `DiscountsQuickTab`, `DiscountsComplexTab`, `DiscountsPersonalTab`)

- **handleDeleteDiscount:** для quick/complex/personal вызывается `updateQuickDiscount` / `updateComplexDiscount` / `updatePersonalDiscount` с `{ is_active: false }` вместо delete. Текст алерта — про деактивацию.
- Списки «Активные … скидки» фильтруются по `is_active`; в пустом состоянии учитывается только активные.

### Backend

- Логика eval без изменений. Добавлен тест `test_deactivated_rule_not_applied`: правило с `is_active=False` не попадает в `best_candidate`.

## 3.3 Smoke checklist (шаг 3 — деактивация)

- [ ] `pytest backend/tests/test_loyalty_discounts.py` — все тесты зелёные, в т.ч. `test_deactivated_rule_not_applied`.
- [ ] **Деактивация быстрой скидки:** активировать шаблон → деактивировать (переключатель или корзина) → скидка пропадает из «Активных …», правило остаётся в БД (is_active=false).
- [ ] **Новые брони:** после деактивации скидка не применяется к новым бронированиям.
- [ ] **Существующие брони:** бронирование с применённой скидкой → деактивировать правило → у этого бронирования `applied_discount` и `payment_amount` не меняются.
- [ ] **Temporary → confirm:** создать temporary со скидкой → деактивировать правило → confirm → в финальном бронировании сохранены скидка и сумма из temporary.
- [ ] **Web и Mobile:** одинаковое поведение (деактивация через update, списки только активные).
