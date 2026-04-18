# Гайд: пересоздание тестовых данных (reseed)

## Модуль «Клиенты»

После reseed создаются 40 клиентов на мастера (телефоны `+7999{master_idx}{client_idx:06d}`: после `+7` — `999` + индекс мастера + 6 цифр клиента = 10 цифр) и прошедшие COMPLETED-бронирования. Клиенты появляются в списке «Клиенты»; первый клиент каждого мастера — VIP (12 визитов, top_services заполнен). Часть клиентов имеет cancelled-записи для breakdown по причинам.

## Таблица тестовых аккаунтов (после reseed)

**Каноничный source of truth** (роли, телефоны, планы, баланс, пароли, флаги `has_*` с API) перезаписывается автоматически:

→ **[`docs/TEST_DATA_ACCOUNTS.md`](TEST_DATA_ACCOUNTS.md)** — обновляется скриптом `reseed_local_test_data.py` после каждого успешного прогона (блок 10b).

Ниже — краткая сводка матрицы мастеров (10 шт.):

| Role | Phone | Plan | Balance type | Примечание |
|------|-------|------|--------------|------------|
| admin | +79031078685 | — | — | NOT DELETED при reset |
| master | +79990000000 … +79990000001 | Free | — | can_continue=true |
| master | +79990000002 … +79990000003 | Basic | normal / low | low → деактивация после daily job |
| master | +79990000004 … +79990000005 | Standard | normal / low | то же |
| master | +79990000006 … +79990000007 | Pro | normal / low | **те же индексы, что в регрессионных скриптах** |
| master | +79990000008 … +79990000009 | **Premium** | normal / low | макс. коммерческий тариф (premium-фичи) |
| client | +79990000100 … +79990000102 | — | — | legacy, пароль test123 |

Полные email, `Expected behavior`, колонки доступов — только в **`TEST_DATA_ACCOUNTS.md`**.

---

## ⚠️ ВАЖНЫЕ ОГРАНИЧЕНИЯ RESEED (READ THIS)

1) **Low balance**
- Low-balance мастера **НЕ деактивируются сразу**
- `can_continue=False` и деактивация происходят **только после выполнения daily job**
- Для проверки сценария нужно:
  - либо дождаться следующего дня (запущенный backend)
  - либо вручную вызвать daily job

2) **Бронирования**
- Создание брони — **best effort**
- Гарантии «1 бронь на мастера в день» **НЕТ**
- При отсутствии валидных слотов или конфликтов день пропускается
- В stdout будет запись `[reseed] booking fail master=... day=... status=... body=...`

3) **Расписание**
- Слоты создаются **ТОЛЬКО через rules**
- `bulk-create` фактически не участвует (несовпадение `type`/`schedule_type` и `start`/`end` vs `open`/`close` в fixed_schedule)
- Это ожидаемое поведение в текущей версии

---

## Gap-list (анализ до правок)

| Требование | Было | Стало |
|------------|------|-------|
| A) Reset без subscription_plans | ✅ reset_non_admin_users | без изменений |
| B) Планы Free/Basic/Standard/Pro + low balance | Хардкод plan_id, баланс `daily_rate*2` | API `subscription-plans/available`, low = `daily_rate*1.5-0.01` |
| C) Телефоны мастеров | +79990000000..07 (8) | +79990000000..09 (10), + Premium в матрице |
| D) Профиль city/timezone/timezone_confirmed | ✅ при регистрации | без изменений |
| E) 4 услуги, 2 категории | ✅ | без изменений |
| F) Расписание 35 дней, 3 дня/нед, 8 ч | ✅ rules + bulk-create | rules только (bulk-create не участвует) |
| G) Клиенты через брони | ✅ | без изменений |
| H) 1 бронь/мастер/день, 14–30 дней | 14 дней, 1 слот | 30 дней, перебор слотов при ошибке |
| Валидация | нет | проверки + subscription-status |
| Планы по API | частично | resolve_plan + fallback Standard/Standart |

## Как запустить backend

1. **Для reseed и dev-testdata** задайте оба флага:
   ```bash
   export ENVIRONMENT=development
   export ENABLE_DEV_TESTDATA=1
   ```
   Оба обязательны. Роутер `/api/dev/testdata/*` подключается только при `ENVIRONMENT=development` и `ENABLE_DEV_TESTDATA=1`.
3. Из корня проекта:
   ```bash
   cd backend && uvicorn main:app --host 0.0.0.0 --port 8000
   ```
   или через `python -m uvicorn main:app --host 0.0.0.0 --port 8000` из `backend/`.

## Как запустить скрипт

Backend должен быть запущен с `ENABLE_DEV_TESTDATA=1`. Админ должен существовать (если нет — см. ниже).

```bash
# Если админ отсутствует или пароль забыт:
ENVIRONMENT=development python3 backend/scripts/reset_admin_password_dev.py

# Полный reseed (салон, услуги, расписание, брони)
python backend/scripts/reseed_local_test_data.py --base-url http://localhost:8000

# Только подписки (мастера, балансы, клиенты) — без салона, услуг, броней. Для daily charges regression.
python backend/scripts/reseed_local_test_data.py --base-url http://localhost:8000 --no-salon
```

Опции:
- `--base-url` — базовый URL API (по умолчанию `http://localhost:8000`).
- `--admin-password` — пароль админа (по умолчанию `test123`; устанавливается через `reset_admin_password_dev.py`).
- `--no-salon` — режим «только подписки»: мастера, балансы, клиенты. Без салона, услуг, расписаний, броней. Подходит для `full_regression_subscriptions.py` и тестов daily charges.
- `--verbose`, `-v` — подробный вывод (в т.ч. testdata container salon_id/category_id).

**Exit code:**
- `0` — успех, все проверки пройдены
- `1` — ошибка (логин, reset, планы, регистрация)
- `2` — частичный успех (валидация не пройдена: мало броней, категорий, расписания)

## Режимы reseed

| Режим | Флаг | Создаётся |
|-------|------|-----------|
| **Полный** | (по умолчанию) | Reset, планы, **test salon**, **10 мастеров** (в т.ч. 2×Premium), услуги, расписание, клиенты, брони; **`docs/TEST_DATA_ACCOUNTS.md`** |
| **Только подписки** | `--no-salon` | Reset, планы, 10 мастеров, 3 legacy-клиента; артефакт **`TEST_DATA_ACCOUNTS.md`**; без салона/услуг/броней |

**Test salon (salon_id=1, category_id=1):** технический контейнер для генерации услуг и броней. Нужен только в полном режиме. В продукте «салоны» могут быть отключены — test salon используется исключительно как testdata container для `create_service_and_link_master` и бронирований. С `--verbose` выводится как `Testdata container: salon_id=..., category_id=...`.

## Что делает reseed

1. **Reset:** удаляет всех пользователей кроме админа `+79031078685`. Не трогает `subscription_plans`, `service_functions`, цены.
2. **Plans:** получает планы через `GET /api/subscription-plans/available?subscription_type=master` (без хардкода id).
3. **Test salon** (только без `--no-salon`): создаёт тестовый салон через `ensure_test_salon` (User+Salon+Branch+ServiceCategory). Контейнер для услуг и броней.
4. **Masters:** 10 мастеров `+79990000000` … `+79990000009`, пароль `test123`:
   - 2 Free, 2 Basic, 2 Standard, 2 Pro, **2 Premium** (нормальный + low balance на платных)
   - Индексы **6–7** по-прежнему Pro (совместимость с `full_regression_subscriptions.py` и др.)
5. **Артефакт:** после прогона перезаписывается **`docs/TEST_DATA_ACCOUNTS.md`** (флаги из `GET /api/master/subscription/features`).
6. **Профиль:** full_name, email, city, timezone, timezone_confirmed=true.
7. **Услуги** (только без `--no-salon`): категории мастера (2), MasterService (4), salon Services через `create_service_and_link_master`.
8. **Расписание** (только без `--no-salon`): правила (Tue/Thu/Sat 10:00–18:00) на 35 дней.
9. **Клиенты:** legacy +79990000100…102; в полном режиме ещё 40 клиентов на каждого мастера (см. `TEST_DATA_ACCOUNTS.md`).
10. **Брони** (только без `--no-salon`): best effort — 1 на мастера на каждый активный день за 30 дней.

## Проверка через API

- **Логин мастера:**  
  `POST /api/auth/login`  
  `{"phone": "+79990000002", "password": "test123"}`  
  → `access_token`.

- **Профиль:**  
  `GET /api/master/settings`  
  с заголовком `Authorization: Bearer <access_token>`.

- **Баланс и подписка:**  
  `GET /api/balance/subscription-status`  
  (тот же header) — `can_continue`, `days_remaining`, `balance`, `daily_rate`.

- **Слоты:**  
  `GET /api/bookings/available-slots-repeat?owner_type=master&owner_id=<id>&year=...&month=...&day=...&service_duration=60`

- **Брони:**  
  `GET /api/master/bookings` (с токеном мастера).

## Проверка через UI

- Открыть веб-приложение, войти под мастером (`+79990000002` / `test123`).
- Проверить: дашборд, «Мой тариф», баланс, «Дней осталось», расписание, брони.

## Пересоздание

Просто снова запустить скрипт — он сам вызывает reset и создаёт всё заново.

## Smoke checklist (10 пунктов)

1. **Логин админом:** `POST /api/auth/login` с `+79031078685` → 200, `access_token`.
2. **Логин каждым мастером:** `+79990000000` … `+79990000009` с `test123` → 200.
2b. **Логин клиентом:** `+79990000100` с `test123` → 200, `access_token`.
3. **Профиль мастера:** `GET /api/master/settings` → city, timezone, timezone_confirmed.
4. **Подписка:** `GET /api/balance/subscription-status` → у Free `can_continue=true`, у low-balance `days_remaining` 1–2.
5. **Услуги:** `GET /api/master/services` → 4 услуги, 2 категории.
6. **Расписание:** `GET /api/master/schedule/weekly` или `monthly` → слоты на Tue/Thu/Sat.
7. **Доступные слоты:** `GET /api/bookings/available-slots-repeat` для любой даты в ближайшие 30 дней → не пусто.
8. **Брони:** `GET /api/master/bookings` → минимум 1 бронь на активный день за последние 30 дней.
9. **Клиенты:** созданы через брони (проверить в БД или через админку).
10. **Low balance:** мастер с low balance (напр. +79990000003) — **только после daily job** `can_continue` станет false.

## Как использовать тестовые аккаунты

### Как войти под мастером

1. `POST /api/auth/login` с `{"phone": "+79990000002", "password": "test123"}`.
2. Сохранить `access_token` из ответа.
3. В UI: логин по телефону и паролю `test123`.

### Как войти под клиентом

1. `POST /api/auth/login` с `{"phone": "+79990000100", "password": "test123"}`.
2. Ответ: `{"access_token": "...", "refresh_token": "...", "token_type": "bearer"}`.
3. Клиенты регистрируются в reseed с паролем `test123` перед созданием бронирований.

### Как проверить подписку

1. Залогиниться мастером.
2. `GET /api/balance/subscription-status` с заголовком `Authorization: Bearer <token>`.
3. Проверить: `can_continue`, `days_remaining`, `balance`, `daily_rate`.
4. Для Free: `can_continue=true`, `days_remaining` не показывается.
5. Для normal: `days_remaining` ≥ 20.

### Как проверить low-balance сценарий

1. Войти мастером с low balance (напр. +79990000003).
2. `GET /api/balance/subscription-status` → `days_remaining` 1–2, `can_continue=true`.
3. **Деактивация:** дождаться следующего дня (daily job) или вручную вызвать daily job. После списания `can_continue=false`.
4. Без daily job сценарий деактивации **не проверяется**.

### Как проверить брони и расписание

1. **Расписание:** `GET /api/master/schedule/weekly` или `monthly` → слоты на Tue/Thu/Sat.
2. **Слоты:** `GET /api/bookings/available-slots-repeat?owner_type=master&owner_id=<id>&year=...&month=...&day=...&service_duration=60` → не пусто для активных дней.
3. **Брони:** `GET /api/master/bookings` → список броней. Количество зависит от best-effort создания (см. ограничения выше).

### Какие сценарии НЕ стоит тестировать без daily job

- Деактивация low-balance мастера (подписка станет неактивной только после списания).
- «Дней осталось» = 0 и блокировка Pro-фич после исчерпания депозита.

## Проверка daily списаний локально

### Entrypoint

- **Фоновая задача:** `run_daily_charges_task()` в `main.py` — запускается при старте backend, ждёт до 00:01 следующего дня, вызывает `process_all_daily_charges()`.
- **Ручной вызов:** dev-endpoint `POST /api/dev/testdata/run_daily_charges` (ENV=development, admin).
- **Скрипт:** `python backend/services/daily_charges.py` — вызывает `run_daily_charges_manual()` на `date.today()`.

### Команды для локального запуска

**1) Через dev-endpoint (рекомендуется):**

Требуется `export ENABLE_DEV_TESTDATA=1` и запущенный backend.

```bash
# Логин админом
TOKEN=$(curl -s -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"phone":"+79031078685","password":"test123"}' | jq -r '.access_token')

# Списания на сегодня
curl -X POST "http://localhost:8000/api/dev/testdata/run_daily_charges" \
  -H "Authorization: Bearer $TOKEN"

# Списания на конкретную дату
curl -X POST "http://localhost:8000/api/dev/testdata/run_daily_charges?date_str=2026-01-29" \
  -H "Authorization: Bearer $TOKEN"
```

**2) Через Python (1 раз, произвольная дата):**

```bash
cd backend && python -c "
from services.daily_charges import process_all_daily_charges
from datetime import date
r = process_all_daily_charges(date.today())
print(r)
"
```

**3) Повторный запуск на ту же дату:**

Сервис не создаёт дубликаты: если списание за дату уже есть, вернётся `"error": "Списание за эту дату уже произведено"`. Для повторного теста используйте другую дату или сбросьте тестовые данные через reseed.

### Шаги до/после проверки low-balance

1. **До:** Войти мастером с low balance (+79990000003), `GET /api/balance/subscription-status` → `can_continue=true`, `days_remaining` 1–2.
2. **Запуск:** `POST /api/dev/testdata/run_daily_charges` (сегодня).
3. **После:** `GET /api/balance/subscription-status` → `can_continue=false`, `days_remaining` 0.
4. **История:** таблица `daily_subscription_charges` — записи с `charge_date`, `status` (success/failed).

### Пример ответа run_daily_charges

```json
{
  "processed_total": 8,
  "success_count": 6,
  "failed_count": 2,
  "deactivated_count": 2,
  "charge_date": "2026-01-29",
  "affected_users": [{"user_id": 2, "phone": "+79990000000"}, ...],
  "errors": []
}
```

## Troubleshooting

### «Login admin failed» / 401

- Админ с `+79031078685` должен существовать в БД.
- **Dev:** `ENVIRONMENT=development python3 backend/scripts/reset_admin_password_dev.py` — создаёт/сбрасывает админа, пароль `test123`.

### «Reset failed» / 500 / 404 / 405 на /api/dev/testdata/*

- Dev-эндпоинты доступны только при `ENVIRONMENT=development` **и** `ENABLE_DEV_TESTDATA=1`.
- Без флага: роутер не подключается → 404 или 405.
- Запуск: `export ENABLE_DEV_TESTDATA=1` перед стартом backend.

### «Missing plans: need Free, Basic, Pro»

- Должны существовать планы в `subscription_plans` (админка или seed-скрипты).
- `GET /api/subscription-plans/available?subscription_type=master` должен возвращать планы.
- «Standard» и «Standart» — маппинг с fallback.

### Слоты пустые

- У мастера должно быть расписание (rules создают слоты на 35 дней).
- Сравнение Date vs datetime в scheduling исправлено; если слоты пусты — проверить `master_schedules`.

### Брони не создаются (bookings=0)

- `client_phone` — query-параметр для `POST /api/bookings/public`.
- Тело — плоский объект брони (без обёртки).
- Перед каждой бронью вызывается `available-slots-repeat`; при ошибке логируется status/body.

### «Run ensure_test_salon first»

- Скрипт сам вызывает `ensure_test_salon` до `create_service_and_link_master` (только в полном режиме).
- При ручных вызовах dev-API соблюдайте порядок.
- В режиме `--no-salon` ensure_test_salon не вызывается — салон не нужен.### Self-check режима --no-salon- После reseed с `--no-salon` скрипт проверяет: `GET /api/balance/subscription-status` успешен для всех 8 мастеров.
- `full_regression_subscriptions.py` вызывает reseed с `--no-salon` — daily charges regression работает без салона/броней.

## Overlay enrichment для campaigns/contact-preferences QA

Базовый reseed остаётся каноническим. Для расширенного датасета под вкладку `Клиенты -> Рассылки` используйте отдельный overlay-слой:

```bash
# 1) baseline
python3 backend/scripts/reseed_local_test_data.py --base-url http://localhost:8000

# 2) overlay enrichment (добавляет только новые completed-кейсы)
python3 backend/scripts/enrich_campaign_test_data.py

# 3) verify-only (без изменений)
python3 backend/scripts/enrich_campaign_test_data.py --verify-only
```

One-shot: `make enrich-campaign-qa` (или `WITH_RESEED=1 make enrich-campaign-qa` — см. гайд).

Подробности: `docs/CAMPAIGN_ENRICHMENT_GUIDE.md`.