# Патч: matching + year-wrap

## 1. Изменённые файлы

| Файл | Изменения |
|------|-----------|
| `mobile/src/utils/loyaltyConditions.ts` | `stableStringify`: null/undefined→`'null'`, примитивы→`JSON.stringify`, ключи объектов→`JSON.stringify(k)` |
| `frontend/src/utils/loyaltyConditions.js` | То же для `stableStringify` |
| `backend/utils/loyalty_params.py` | `normalize_service_discount`: сортировка `out_items` только по `service_id` (`lambda x: x["service_id"]`) в обоих местах |
| `backend/utils/loyalty_discounts.py` | `_birthday_in_window`: переход года — `_ref_date_in_year`, логика Dec+Jan / Jan+Dec |
| `backend/tests/test_loyalty_discounts.py` | Два теста: `test_birthday_year_wrap_before`, `test_birthday_year_wrap_after` |

## 2. Unified diff

См. **`LOYALTY_MATCHING_AND_YEARWRAP.patch`**.

## 3. Smoke-check (что проверить вручную)

- [ ] **Тесты:** `pytest backend/tests/test_loyalty_discounts.py -v` — все 20 тестов зелёные (в т.ч. 2 новых year-wrap).
- [ ] **Матчинг web/mobile:** один и тот же набор шаблонов и скидок — «Активна»/«Не активно» совпадает; скидки с разными `parameters` (например разные `percent` в `items`) при том же `condition_type` не считаются одной и той же.
- [ ] **Бронирование:** returning min/max, regular_visits period_days, service_discount per-item percent работают как раньше; birthday в окне и на стыке года (ДР 2 янв / бронь 30 дек, ДР 30 дек / бронь 2 янв) применяется.
