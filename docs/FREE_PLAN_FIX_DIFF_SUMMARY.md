# Free Plan Fix — Diff-Summary и Smoke Checklist

## Часть 1: Диагностика pending-confirmations

**Вердикт:** Backend возвращает записи со статусом `AWAITING_CONFIRMATION` без фильтра по `start_time < now`. Дубли по owner-filter исключены (`_booking_owner_filter`). Логирование добавлено.

**Изменения:**
- `backend/routers/accounting.py`: в ответ pending-confirmations добавлено поле `status`, в лог пишется `booking_id`, `start_time`, `status`, `is_past`.
- `frontend/BookingConfirmations.jsx`: dev-only `console.debug` с `id`, `start_time`, `status`.
- `docs/PENDING_CONFIRMATIONS_DIAGNOSTIC_VERDICT.md`: описание диагностики.

---

## Часть 2: PRE-visit gate + toggle

### Backend
- `backend/models.py`: добавлено поле `pre_visit_confirmations_enabled` (Boolean, default=False).
- `backend/alembic/versions/20260205_add_pre_visit_confirmations_enabled.py`: миграция.
- `backend/routers/master.py`: GET `/settings` и PUT `/profile` поддерживают `pre_visit_confirmations_enabled`.

### Frontend
- `MasterDashboardStats.jsx`: `canShowPreVisitConfirm = hasExtendedStats && (masterSettings?.master?.pre_visit_confirmations_enabled ?? false)`. Pre-visit кнопка рендерится только при `canShowPreVisitConfirm`.
- `AllBookingsModal.jsx`: добавлен prop `canShowPreVisitConfirm`, pre-visit button/action скрыт при `!canShowPreVisitConfirm`.
- `PopupCard.jsx`: тот же gate.
- `MasterScheduleCalendar.jsx`: прокидывает `canShowPreVisitConfirm` в PopupCard.
- `MasterSettings.jsx`: чекбокс «Подтверждение записей до визита» (только при `hasExtendedStats`).
- `MasterDashboard.jsx`: прокидывает `canShowPreVisitConfirm` в MasterScheduleCalendar.

### POST-visit
- Без изменений: `BookingConfirmations`, `confirm-booking`, `cancel-booking` работают на всех планах.

---

## Часть 3: Серый lock + «Тестовый доступ»

- `frontend/components/LockedNavItem.jsx`: новый компонент — серый пункт меню + popover с «Тестовый доступ», планом, «Открыть демо», «Перейти к тарифам».
- `MasterDashboard.jsx` (внутренний MasterSidebar): Stats, Finance, Loyalty, Clients, Rules при `!hasAccess` заменены на `LockedNavItem`. Добавлен prop `hasExtendedStats`.

---

## Изменённые файлы (сводка)

| Файл | Изменения |
|------|-----------|
| `backend/routers/accounting.py` | `status` в ответ pending-confirmations, логирование |
| `backend/models.py` | `pre_visit_confirmations_enabled` |
| `backend/routers/master.py` | GET settings + PUT profile с `pre_visit_confirmations_enabled` |
| `backend/alembic/versions/20260205_add_pre_visit_confirmations_enabled.py` | Новая миграция |
| `frontend/components/BookingConfirmations.jsx` | Dev-log pending |
| `frontend/components/MasterDashboardStats.jsx` | Gate pre-visit по `canShowPreVisitConfirm` |
| `frontend/components/AllBookingsModal.jsx` | Prop `canShowPreVisitConfirm`, gate pre-visit |
| `frontend/components/PopupCard.jsx` | Prop `canShowPreVisitConfirm`, gate pre-visit |
| `frontend/components/MasterScheduleCalendar.jsx` | Prop `canShowPreVisitConfirm` для PopupCard |
| `frontend/components/MasterSettings.jsx` | Чекбокс `pre_visit_confirmations_enabled` |
| `frontend/components/LockedNavItem.jsx` | Новый компонент |
| `frontend/pages/MasterDashboard.jsx` | LockedNavItem, hasExtendedStats в sidebar, canShowPreVisitConfirm |
| `docs/PENDING_CONFIRMATIONS_DIAGNOSTIC_VERDICT.md` | Отчёт по диагностике |
| `docs/FREE_PLAN_FIX_DIFF_SUMMARY.md` | Этот файл |

---

## Smoke Checklist

### Free plan
- [ ] Войти как мастер free (без finance, без extended stats).
- [ ] Дашборд: нет 403. GET pending-confirmations — 200.
- [ ] Клик по «Будущие записи»: pre-visit кнопки не отображаются, POST update-booking-status не вызывается.
- [ ] Блок «Услуги на подтверждении» (BookingConfirmations): пост-visit подтверждение/отмена работает.
- [ ] Пункты Stats, Finance, Loyalty, Rules, Clients: серые, при клике — popover «Тестовый доступ», «Открыть демо», «Перейти к тарифам».
- [ ] «Открыть демо» → переход в раздел, показ DemoAccessBanner и демо-контента.

### Standard/Premium
- [ ] PRE-visit: в настройках включён «Подтверждение записей до визита», кнопки pre-visit отображаются и работают.
- [ ] POST-visit: подтверждение и отмена продолжают работать.

### Regression
- [ ] POST-visit confirm/cancel на free plan работает.
- [ ] Финансовые эндпоинты (summary, operations) возвращают 403 на free.
