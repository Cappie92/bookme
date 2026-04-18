# Онбординг мастера: город/таймзона, блокировка Loyalty

**Дата:** 2026-01-28

## Аудит (A1–A2)

См. `docs/LOYALTY_ONBOARDING_AUDIT.md`.

- **A1.** Priority `condition_type`: меньше = выше; порядок birthday → … → service_discount соблюдён. Фикс не требовался.
- **A2.** Точки создания/обновления мастера: регистрация (auth), `PUT /api/master/profile`, `PATCH /api/salon/masters/:id/settings` (не трогает city/timezone). Раньше при создании применялся default `Europe/Moscow`; мастер мог не выбирать город/таймзону.

---

## Изменения

### Backend

| Файл | Изменения |
|------|-----------|
| `alembic/versions/20260128_add_timezone_confirmed_and_remove_default.py` | Миграция: `masters.timezone_confirmed` (NOT NULL, default 0). UPDATE для существующих с city+timezone → 1. |
| `models.py` | `Master`: `timezone` без default (nullable); добавлен `timezone_confirmed` (Boolean, default False). |
| `routers/auth.py` | Создание мастера при регистрации: явно `city=None`, `timezone=None`, `timezone_confirmed=False`. |
| `routers/master.py` | В `update_master_profile`: после обновления city/timezone выставляется `timezone_confirmed = (has_city && has_tz)`. В ответ `GET /api/master/settings` добавлено `master.timezone_confirmed`. |
| `routers/loyalty.py` | `_require_master_onboarding_completed` (проверка timezone + timezone_confirmed). Вызов во всех create/update quick, complex, personal. Иначе 400 «Выберите город и часовой пояс…». |

### Frontend (web)

| Файл | Изменения |
|------|-----------|
| `LoyaltySystem.jsx` | `onboardingCompleted = masterSettings?.timezone_confirmed`; `createDisabled = hasLoyaltyAccess && !onboardingCompleted`. Текст баннера: «Выберите город и часовой пояс… до завершения». |
| `MasterSettings.jsx` | Форма: `timezone` по умолчанию `''` вместо `'Europe/Moscow'`. |

### Mobile

| Файл | Изменения |
|------|-----------|
| `services/api/master.ts` | В типе мастера: `timezone` nullable, `timezone_confirmed?: boolean`. |
| `app/master/loyalty.tsx` | `onboardingCompleted = masterSettings?.master?.timezone_confirmed`; `createDisabled` по нему. Текст баннера обновлён. |

### Тесты

| Файл | Изменения |
|------|-----------|
| `tests/test_loyalty_discounts.py` | `test_require_master_onboarding_completed_rejects_incomplete`: пустой/отсутствующий timezone и `timezone_confirmed=False` → 400; при `timezone_confirmed` True и city — не бросает. |
| `tests/test_master_profile_timezone.py` | `test_update_profile_city_and_timezone_sets_confirmed` (PUT city+timezone → `timezone_confirmed` True); `test_loyalty_create_rejects_when_onboarding_incomplete` (POST quick-discounts при `timezone_confirmed=False` → 400). |

---

## Список файлов (для patch/diff)

```
backend/alembic/versions/20260128_add_timezone_confirmed_and_remove_default.py  (новый)
backend/models.py
backend/routers/auth.py
backend/routers/master.py
backend/routers/loyalty.py
frontend/src/components/LoyaltySystem.jsx
frontend/src/components/MasterSettings.jsx
mobile/src/services/api/master.ts
mobile/app/master/loyalty.tsx
backend/tests/test_loyalty_discounts.py
backend/tests/test_master_profile_timezone.py
docs/LOYALTY_ONBOARDING_AUDIT.md
docs/LOYALTY_ONBOARDING_IMPLEMENTATION_REPORT.md
```

---

## Smoke checklist

### API

- [ ] `alembic upgrade head` — миграция `20260128_tz_confirmed` применяется без ошибок.
- [ ] `pytest backend/tests/test_loyalty_discounts.py backend/tests/test_master_profile_timezone.py -v` — все тесты зелёные.
- [ ] Регистрация мастером → в БД `masters`: `timezone` NULL, `city` NULL, `timezone_confirmed` 0.
- [ ] `PUT /api/master/profile` с `city` + `timezone` → 200; `timezone_confirmed` = 1.
- [ ] `POST /api/loyalty/quick-discounts` при `timezone_confirmed=0` → 400, в `detail` упоминание города/часового пояса.
- [ ] После установки city+timezone и `timezone_confirmed=1` создание quick/complex/personal скидок разрешено.

### Web

- [ ] Мастер без city/timezone (новый после регистрации): в Loyalty — баннер «Выберите город и часовой пояс…», кнопки создания скидок неактивны, есть переход в настройки.
- [ ] В настройках заданы город и часовой пояс → возврат в Loyalty → баннер скрыт, создание скидок доступно.
- [ ] Форма настроек: поле часового пояса по умолчанию пустое (не «Europe/Moscow»).

### Mobile

- [ ] Аналогично web: баннер и блокировка Loyalty при не пройденном онбординге; после выбора города и таймзоны в настройках — разблокировка.

### Брони и temporary

- [ ] Существующие брони и temporary booking не затронуты: создание/подтверждение записей работает как раньше. Изменения только в онбординге мастера и в создании/обновлении скидок.
