# Phase 1 Implementation Report: POST-visit без finance-guard

## 1. Diff-summary по файлам

### backend/routers/accounting.py

**Изменения:**
- **pending-confirmations**: удалён `_ensure_finance_access`; добавлен `owner_cond` (get_booking_owner_ids + _booking_owner_filter) вместо фильтра только по `master_id` — поддержка indie-мастеров.
- **confirm-booking**: удалён `_ensure_finance_access`.
- **confirm-all**: удалён `_ensure_finance_access`.
- **cancel-booking**: удалён `_ensure_finance_access`.
- **cancel-all**: удалён `_ensure_finance_access`.

**Без изменений (остаются под finance-guard):**
- update-booking-status
- summary
- expenses (GET/POST/PUT/DELETE)
- operations
- export

### backend/tests/test_accounting_post_visit_phase1.py (новый файл)

- 10 тестов: POST-visit без finance (5 тестов), finance endpoints 403 (3 теста), indie master (2 теста).

### backend/tests/test_confirm_booking_created.py

- `test_update_booking_status_future_awaiting_confirmation_returns_400`: добавлена подписка с finance для мастера, т.к. update-booking-status остаётся под finance-guard.

---

## 2. Endpoints: guard снят / оставлен

| Endpoint | Guard снят? |
|----------|-------------|
| GET /api/master/accounting/pending-confirmations | ✅ Да |
| POST /api/master/accounting/confirm-booking/{id} | ✅ Да |
| POST /api/master/accounting/confirm-all | ✅ Да |
| POST /api/master/accounting/cancel-booking/{id} | ✅ Да |
| POST /api/master/accounting/cancel-all | ✅ Да |
| POST /api/master/accounting/update-booking-status/{id} | ❌ Нет (finance) |
| GET /api/master/accounting/summary | ❌ Нет (finance) |
| GET/POST/PUT/DELETE /api/master/accounting/expenses | ❌ Нет (finance) |
| GET /api/master/accounting/operations | ❌ Нет (finance) |
| GET /api/master/accounting/export | ❌ Нет (finance) |

---

## 3. Smoke Checklist

### Web

- [ ] **Free plan:** Войти как мастер без finance.
- [ ] **Дашборд:** Загружается без 403, счётчик неподтверждённых в сайдбаре отображается (0 или N).
- [ ] **Блок подтверждений:** На дашборде показывается блок «На подтверждении» (BookingConfirmations), запрос к pending-confirmations возвращает 200.
- [ ] **Подтверждение:** При наличии прошедшей записи AWAITING_CONFIRMATION — кнопка «Подтвердить» работает, запись переходит в COMPLETED.
- [ ] **Отклонение:** Кнопка «Отклонить» с выбором причины работает.
- [ ] **Финансы:** Вкладка «Финансы» в сайдбаре — 403 или disabled; при прямом переходе на accounting — 403 на summary/operations.

### Mobile

- [ ] **Free plan:** Войти как мастер без finance.
- [ ] **Дашборд:** Загружается без 403.
- [ ] **Прошедшие записи:** Блок «На подтверждении» показывается, кнопки «Прошла» / «Не состоялась» работают.
- [ ] **Финансы:** Раздел финансов недоступен (403 или скрыт).

### Indie-мастер

- [ ] Создать запись с `indie_master_id`, `master_id=NULL`, статус AWAITING_CONFIRMATION, `start_time` в прошлом.
- [ ] GET pending-confirmations возвращает эту запись.
- [ ] POST confirm-booking переводит её в COMPLETED.

---

## 4. Тесты

```bash
cd backend && python3 -m pytest tests/test_accounting_post_visit_phase1.py tests/test_confirm_booking_created.py tests/test_clients_finance_guards.py -v
```

Ожидаемо: **19 passed**.
