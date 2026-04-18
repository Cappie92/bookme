# Verdict Report: Pre/Post-visit подтверждения и тарифные guards

## 1. Таблица Endpoint → назначение → текущий guard → должный guard

| Endpoint | Метод | Бизнес-функция | Текущий guard | Должный guard |
|----------|-------|----------------|---------------|---------------|
| `/api/master/accounting/pending-confirmations` | GET | **POST-visit** — список прошлых записей, ожидающих "Прошла/Не состоялась" | `_ensure_finance_access` | **Нет guard** (базовая функция) |
| `/api/master/accounting/confirm-booking/{id}` | POST | **POST-visit** — подтвердить, что услуга прошла | `_ensure_finance_access` | **Нет guard** |
| `/api/master/accounting/confirm-all` | POST | **POST-visit** — массовое подтверждение | `_ensure_finance_access` | **Нет guard** |
| `/api/master/accounting/cancel-booking/{id}` | POST | **POST-visit** — отклонить (не состоялась) | `_ensure_finance_access` | **Нет guard** |
| `/api/master/accounting/cancel-all` | POST | **POST-visit** — массовое отклонение | `_ensure_finance_access` | **Нет guard** |
| `/api/master/accounting/update-booking-status/{id}` | POST | **Универсальный** (post + pre-visit) | `_ensure_finance_access` | **Условный**: при `new_status=confirmed` для **будущей** записи → `has_extended_stats`; в остальных случаях → **нет guard** |
| `/api/master/accounting/summary` | GET | Финансы (сводка доходов/расходов) | `_ensure_finance_access` | `has_finance_access` ✓ |
| `/api/master/accounting/expenses` | GET/POST/PUT/DELETE | Финансы (расходы) | `_ensure_finance_access` | `has_finance_access` ✓ |
| `/api/master/accounting/operations` | GET | Финансы (операции) | `_ensure_finance_access` | `has_finance_access` ✓ |
| `/api/master/accounting/export` | GET | Финансы (экспорт) | `_ensure_finance_access` | `has_finance_access` ✓ |

**Итог:**
- **Ошибочно защищены finance-guard'ом:** `pending-confirmations`, `confirm-booking`, `confirm-all`, `cancel-booking`, `cancel-all`, `update-booking-status` (частично).
- **Правильно защищены:** `summary`, `expenses`, `operations`, `export` — finance остается.

---

## 2. Хранение toggle PRE-visit подтверждений

| Вопрос | Ответ |
|--------|-------|
| **Где хранится флаг?** | **Не хранится.** Отдельного поля `pre_visit_confirmations_enabled` нет. |
| **Что есть сейчас?** | Только `master.auto_confirm_bookings` — управляет post-visit ("Вручную" vs "Автоматически"). |
| **Gap?** | **Да.** Нужно добавить поле, например `masters.pre_visit_confirmations_enabled` (bool, default=False). |

**Предлагаемое место хранения:** `masters.pre_visit_confirmations_enabled` (миграция Alembic).

| Проверка | Статус |
|----------|--------|
| UI для включения/выключения (Web) | **Нет** |
| UI для включения/выключения (Mobile) | **Нет** |
| API для чтения | Нет (сейчас в `/api/master/settings` нет такого поля) |
| API для изменения | Нет (в `PUT /api/master/...` нет такого поля) |
| Влияние на показ pre-visit UI | Нет (сейчас UI зависит от `auto_confirm_bookings` и статуса записи) |
| Влияние на прогноз в статистике | Нет (прогноз не учитывает этот флаг) |

---

## 3. Как сейчас считается прогноз и что нужно изменить

### 3.1 Текущая реализация

**Dashboard stats** (`GET /api/master/dashboard/stats`):
- `periods_data` (weeks_data): считает **все** записи в периоде — **без фильтра по статусу**. Включает CREATED, CONFIRMED, AWAITING_CONFIRMATION, COMPLETED, CANCELLED.
- `future_bookings` / `next_bookings_list`: все будущие записи (без фильтра по статусу для расчёта количества).
- Guard: **нет** (базовая статистика доступна всем).

**Extended stats** (`GET /api/master/stats/extended`):
- Guard: `has_extended_stats` ✓
- Прогноз строится по **среднему прошлых периодов** (только `COMPLETED`). Будущие записи **не участвуют** в расчёте прогноза.

**Вывод:** Сейчас "прогноз" в extended stats — это экстраполяция прошлого, а не сумма будущих записей. В dashboard `periods_data` для будущих периодов просто считает все будущие брони (без учёта статуса).

### 3.2 Требование по продукту

| Режим | Прогноз (future bookings / expected income) | UI статистики |
|-------|---------------------------------------------|---------------|
| PRE-visit **включены** | Учитывать только **подтверждённые** (CONFIRMED) будущие записи | Обычное отображение |
| PRE-visit **выключены** | Учитывать **все** будущие записи | Баннер: «Система учитывает ВСЕ будущие записи в прогнозе, потому что подтверждение записей до визита выключено» + CTA «Включить» |

### 3.3 Необходимые изменения

1. **Добавить флаг** `pre_visit_confirmations_enabled` и использовать его.
2. **При расчёте прогноза/периодов:**
   - если `pre_visit_confirmations_enabled = true`: для будущих периодов учитывать только `status IN (CONFIRMED)` (и при необходимости `AWAITING_CONFIRMATION` — уточнить продукт);
   - если `pre_visit_confirmations_enabled = false`: учитывать все будущие записи (CREATED, CONFIRMED, …).
3. **В разделе Статистика (extended stats и/или dashboard):**
   - если `pre_visit_confirmations_enabled = false` и есть `has_extended_stats`: показывать баннер + CTA «Включить».

---

## 4. Уточнение: что именно pre/post в текущей архитектуре

### POST-visit (после визита)
- **Назначение:** Мастер подтверждает, что услуга состоялась («Прошла») или не состоялась («Не состоялась»).
- **Время:** Только **прошлые** записи (`start_time < now`).
- **Статусы в БД:** CREATED, AWAITING_CONFIRMATION (effective: CREATED + прошло время).
- **Endpoints:** `confirm-booking`, `confirm-all`, `cancel-booking`, `cancel-all`, `pending-confirmations`.
- **Должен быть доступен:** всегда, на любом тарифе.

### PRE-visit (до визита)
- **Назначение:** Мастер принимает будущую запись («Подтвердить» / «Отменить» до визита).
- **Время:** Только **будущие** записи (`start_time > now`).
- **Статусы:** CREATED → CONFIRMED (или CANCELLED).
- **Endpoint:** `update-booking-status?new_status=confirmed` (и аналогично для `cancelled`).
- **Должен быть доступен:** только при `has_extended_stats` + `pre_visit_confirmations_enabled = true`.

### pending-confirmations — только POST-visit
- Запрос: `Booking.status == AWAITING_CONFIRMATION` и нет `BookingConfirmation`.
- `AWAITING_CONFIRMATION` для будущих записей в БД запрещён (`update-booking-status` возвращает 400).
- На практике возвращаются только **прошлые** записи, ожидающие post-visit outcome.
- **Вывод:** `pending-confirmations` — чисто POST-visit, не должен зависеть от finance.

---

## 5. План исправлений (без кода)

### Фаза 1: Снятие лишних guards (минимальный фикс 403)

1. **Backend: accounting.py**
   - Убрать `_ensure_finance_access` у: `pending-confirmations`, `confirm-booking`, `confirm-all`, `cancel-booking`, `cancel-all`.
   - Для `update-booking-status`: добавить условную проверку: если `booking.start_time > now` и `new_status in ('confirmed', 'cancelled', ...)` — требовать `has_extended_stats`; иначе — не вызывать finance guard.

**Результат:** В бесплатном плане перестанет возвращаться 403 на `pending-confirmations` и post-visit confirm/cancel.

### Фаза 2: Toggle PRE-visit

2. **Backend: models + миграция**
   - Добавить `masters.pre_visit_confirmations_enabled` (Boolean, default=False).

3. **Backend: API**
   - Добавить поле в `GET /api/master/settings` (или аналог).
   - Добавить в `PUT /api/master/...` (обновление настроек мастера).

4. **Backend: update-booking-status**
   - При PRE-visit (будущая запись, new_status=confirmed): проверять `has_extended_stats` **и** `pre_visit_confirmations_enabled`.

5. **Web: MasterSettings**
   - Добавить переключатель «Подтверждение записей до визита» (вкл/выкл).

6. **Mobile: настройки мастера**
   - Аналогичный переключатель.

### Фаза 3: UI pre-visit

7. **Web + Mobile**
   - Показывать блок pre-visit («На подтверждении», кнопки «Подтвердить»/«Отменить») только если `pre_visit_confirmations_enabled = true` **и** `has_extended_stats`.
   - Если `pre_visit_confirmations_enabled = false`: не показывать pre-visit UI (или read-only подсказку).

### Фаза 4: Прогноз и баннер в статистике

8. **Backend: dashboard/stats, extended stats**
   - При расчёте future bookings / expected income учитывать `pre_visit_confirmations_enabled`:
     - включено → только CONFIRMED (и при необходимости AWAITING_CONFIRMATION);
     - выключено → все будущие записи.

9. **Web: раздел Статистика**
   - Если `pre_visit_confirmations_enabled = false` и `has_extended_stats`: показывать баннер + CTA «Включить».

---

## 6. Риски и регрессии

| Риск | Митигация |
|------|-----------|
| Мастера на free плане получат доступ к post-visit confirm — **ожидаемое поведение** (базовая функция) | Нет |
| Разделение `update-booking-status` на post/pre по времени и статусу | Явные проверки, покрыть тестами |
| Инди-мастера: `pending-confirmations` фильтрует по `Booking.master_id`; у инди-записей `indie_master_id` | **Доп. баг:** нужно учитывать `indie_master_id` в запросе |
| Фронт вызывает `pending-confirmations` до загрузки features | Обработать 403 gracefully или не вызывать при отсутствии настроек; после фазы 1 — 403 не будет |

---

## 7. Дополнительные замечания

1. **Инди-мастера и pending-confirmations:** Сейчас запрос использует `Booking.master_id == master_row_id`. Для инди-мастеров записи имеют `indie_master_id`. Нужно расширить фильтр по аналогии с `_booking_owner_filter`: `master_id == X OR indie_master_id == Y`.

2. **Документация:** Обновить `docs/BOOKING_CONFIRM_ENDPOINTS.md` и `docs/BOOKING_OUTCOME_ARCHITECTURE_AUDIT.md` после внедрения изменений.
