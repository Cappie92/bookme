# Loyalty smoke testing (`LOYALTY_SMOKE_2026_05`)

Отдельный идемпотентный seed для ручной и автоматической проверки:

- публичной записи с баллами;
- резерва на `booking.loyalty_points_used`;
- ЛК клиента (`available` / `reserved` / `amount_to_pay`);
- confirm мастером (`spent` / `earned`);
- mobile public booking.

**Скрипты:** `backend/scripts/reseed_local_test_data.py` (шаг **7e**, по умолчанию с full reseed) и отдельно `backend/scripts/seed_loyalty_smoke.py`

## Безопасность

- Без `--enable-smoke-seed` скрипт **ничего не меняет** (exit 0, сообщение No-op).
- Пользователи с `role=ADMIN` **только логируются**, не обновляются и не удаляются.
- Cleanup вызывает `AdminProtectionError`, если кандидат на удаление — ADMIN.
- Нет `truncate` / `drop` / общего reseed.
- Все smoke-сущности помечены тегом `LOYALTY_SMOKE_2026_05` (email, `loyalty_transactions.source`, `booking.notes`, domain).

## Создаваемые данные

| Сущность | Идентификатор |
|----------|----------------|
| Мастер (loyalty **выкл.**) | domain `loyalty-smoke-master`, login `+79990000911` |
| Мастер (loyalty **вкл.**) | domain `loyalty-smoke-enabled-master`, login `+79990000912` |
| Клиент с баллами | `+79990000901`, 100 earned у disabled-мастера |
| Клиент без баллов | `+79990000900` |
| Клиент enabled-мастера | `+79990000902`, 800 earned |
| Услуга | «Стрижка smoke» — 1000 ₽, 60 мин |
| Расписание | 15 дней вперёд, 08:00–20:00 MSK, **слоты по 30 мин** (иначе публичная запись покажет «Нет свободных дат») |
| `loyalty_settings` (disabled) | `is_enabled=false`, `max_payment_percent=NULL` |
| `loyalty_settings` (enabled) | `is_enabled=true`, `max_payment_percent=50`, `accrual_percent=10` |

Пароль клиентов и мастеров smoke: **`test123`** (как у основного reseed)

## Команды (локально)

### Основной reseed (рекомендуется)

Backend должен быть запущен на `--base-url` (по умолчанию `http://localhost:8000`).

```bash
# Full reseed: базовые мастера + шаг 7d (QA loyalty) + шаг 7e (публичные loyalty-smoke)
python3 backend/scripts/reseed_local_test_data.py --base-url http://localhost:8000

# Без публичных loyalty-smoke мастеров
python3 backend/scripts/reseed_local_test_data.py --base-url http://localhost:8000 --no-loyalty-public-smoke

# С прошлой записью и активным резервом
python3 backend/scripts/reseed_local_test_data.py --base-url http://localhost:8000 \
  --loyalty-create-past-booking --loyalty-create-active-reserve
```

После 7e reseed печатает self-check: `slots_count_next_14_days`, `first_available_date`, пример слотов. Если слотов 0 — reseed завершится с ошибкой.

### Отдельный ORM-seed (без полного reseed)

```bash
cd backend

# Базовый seed
python3 scripts/seed_loyalty_smoke.py --local --enable-smoke-seed

# + прошлая запись для confirm
python3 scripts/seed_loyalty_smoke.py --local --enable-smoke-seed --create-past-booking

# + будущая запись с резервом 100 баллов
python3 scripts/seed_loyalty_smoke.py --local --enable-smoke-seed --create-active-reserve

# Cleanup dry-run (по умолчанию)
python3 scripts/seed_loyalty_smoke.py --cleanup --enable-smoke-seed --local

# Cleanup выполнить
python3 scripts/seed_loyalty_smoke.py --cleanup --enable-smoke-seed --local --yes
```

## Prod / stage smoke

```bash
python3 scripts/seed_loyalty_smoke.py --prod-smoke --enable-smoke-seed --i-understand-this-writes-smoke-data
python3 scripts/seed_loyalty_smoke.py --prod-smoke --enable-smoke-seed --i-understand-this-writes-smoke-data --create-past-booking --create-active-reserve

python3 scripts/seed_loyalty_smoke.py --cleanup --prod-smoke --enable-smoke-seed --i-understand-this-writes-smoke-data --yes
```

## Ручные сценарии

### 1. Public booking / старые баллы / loyalty выкл.

1. http://localhost:5173/m/loyalty-smoke-master  
2. Логин `+79990000901` / `test123`  
3. Услуга, дата, слот → «Оплатить баллами»  
4. Ожидание: −100 ₽, к оплате 900 ₽  
5. Создать запись → резерв 100, `spent` в ledger ещё нет  

### 2. ЛК клиента / резерв

1. ЛК клиента после шага 1 (или `--create-active-reserve`)  
2. Баллы: доступно **0**, в резерве **100**  
3. Запись: **900 ₽**, строка «Баллами: −100 ₽»  

### 3. Отмена → возврат резерва

1. Отменить активную запись клиентом  
2. Доступно **100**, резерв **0**, `spent` нет  

### 4. Confirm прошлой записи

```bash
python3 scripts/seed_loyalty_smoke.py --local --enable-smoke-seed --create-past-booking
```

1. Логин мастера `+79990000911`  
2. Подтвердить визит вчерашней записи  
3. Ожидание: `spent` 100 создан; `earned` **не** создан (программа выкл.)  

### 5. Enabled master (опционально)

1. http://localhost:5173/m/loyalty-smoke-enabled-master  
2. Клиент `+79990000902`, 800 баллов, лимит 50%  
3. После confirm: `spent` + `earned`  

### 6. Mobile

1. `/m/loyalty-smoke-master` в приложении  
2. Те же шаги, что в сценарии 1–2  

## Диагностика (SQL / API)

**Резерв и available (Python):**

```python
from utils.public_booking_loyalty import effective_available_points, sum_active_loyalty_reserved_points
effective_available_points(db, master_id=..., client_id=...)
sum_active_loyalty_reserved_points(db, master_id=..., client_id=...)
```

**Booking:**

```sql
SELECT id, payment_amount, loyalty_points_used, status, notes
FROM bookings
WHERE notes LIKE '%LOYALTY_SMOKE_2026_05%';
```

**Ledger:**

```sql
SELECT id, master_id, client_id, booking_id, transaction_type, points, source
FROM loyalty_transactions
WHERE source = 'LOYALTY_SMOKE_2026_05'
   OR booking_id IN (SELECT id FROM bookings WHERE notes LIKE '%LOYALTY_SMOKE_2026_05%');
```

**API preview (авторизованный клиент):**

`GET /api/public/masters/loyalty-smoke-master/booking-price-preview?service_id=...&start_time=...&use_loyalty_points=true`

**API ЛК:**

- `GET /api/client/bookings/?full=true` → `payment_amount`, `loyalty_points_used`, `amount_to_pay`  
- `GET /api/client/loyalty/points` → `total_balance`, `total_reserved`  

## Тесты скрипта

```bash
cd backend && python3 -m pytest tests/test_seed_loyalty_smoke.py -q
```
