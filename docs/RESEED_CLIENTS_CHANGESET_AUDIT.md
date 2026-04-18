# Аудит changeset reseed/dev_testdata для модуля «Клиенты»

## Ответы по пунктам (с file:line)

### 1) Безопасность dev endpoint

**1.1 Подключение роутера** — `backend/main.py:129-137`
```python
def _dev_testdata_enabled() -> bool:
    env = os.getenv("ENVIRONMENT", "").strip().lower() == "development"
    flag = os.getenv("ENABLE_DEV_TESTDATA", "").strip() == "1"
    return env and flag

if _dev_testdata_enabled():
    app.include_router(dev_testdata.router, prefix="/api")
```
- **Условие:** `ENVIRONMENT == "development"` И `ENABLE_DEV_TESTDATA == "1"`.
- **Оба по умолчанию OFF:** `ENVIRONMENT` default `""`, `ENABLE_DEV_TESTDATA` default `""` — без явной установки роутер не подключается.

**1.2 Проверки на create_completed_bookings** — `backend/routers/dev_testdata.py:469-473`
- `current_user: User = Depends(_ensure_dev_and_admin)` → нужна аутентификация.
- `_ensure_dev_and_admin` (строки 62-70):
  - вызывает `require_admin` → только ADMIN;
  - вызывает `_is_dev()` → при `False` возвращает 404.
- `_is_dev()` (строки 56-59): `ENVIRONMENT==development` И `ENABLE_DEV_TESTDATA==1`.

**1.3 Исправлено:** в `main.py:131` и `dev_testdata.py:57` дефолт `ENVIRONMENT` изменён на `""` — при неустановленном ENVIRONMENT dev_testdata не включается.

---

### 2) Корректность связей (master vs indie)

**2.1 Поля при создании** — `backend/routers/dev_testdata.py:535-547`
```python
b = Booking(
    client_id=client.id,        # ✓ всегда задан (User создаётся/находится по phone)
    service_id=item.service_id, # ✓
    master_id=body.master_id,   # ✓
    salon_id=salon_id,          # из service.salon_id
    branch_id=branch_id,        # из SalonBranch
    # indie_master_id — НЕ задаётся (остаётся NULL)
)
```

**2.2 Попадание в master_clients** — `backend/routers/master_clients.py:93-99`
```python
if indie_id:
    crit = or_(Booking.master_id == master_id, Booking.indie_master_id == indie_id)
else:
    crit = Booking.master_id == master_id
completed = ... .filter(crit, Booking.status == COMPLETED, Booking.client_id.isnot(None))
```
Бронирования с `master_id` и `indie_master_id=NULL` попадают по `Booking.master_id == master_id`. Остальные API (detailed, past, future, dashboard) в master.py используют `or_(master_id, indie_master_id)` — наши брони совпадают по `master_id`.

**2.3 Вывод:** Текущая генерация корректна. Услуги reseed — salon-сервисы, привязка по `master_id` ожидаема. Дополнительно выставлять `indie_master_id` не требуется.

---

### 3) client_id всегда не null

**3.1 Логика в create_completed_bookings** — `dev_testdata.py:491-506`
- По `item.client_phone` ищется `User`.
- Если нет — создаётся `User` с `role=CLIENT`, `db.add(client)`, `db.flush()`.
- `client_id=client.id` — всегда задан.

**3.2 Sanity-check:** Добавить в reseed (см. «Что исправил»).

---

### 4) Причины отмены

**4.1 Контракт** — `dev_testdata.py:116`
```python
cancellation_reason: Optional[str] = Field(None, pattern="^(client_requested|client_no_show|mutual_agreement|master_unavailable)$")
```
**4.2 Дефолт** — строка 533: `cancel_reason = item.cancellation_reason or "client_requested"` при cancelled.
В reseed используются только значения из этого набора.

---

### 5) Время — записи в прошлом

**5.1 Генерация** — `dev_testdata.py:517-518`
```python
now = datetime.utcnow()
start_dt = now - timedelta(days=item.days_ago)
```
`days_ago` ≥ 1 → `start_dt` всегда в прошлом (UTC).

---

### 6) Endpoint vs прямой insert

**6.1 Причина endpoint:** Reseed выполняется как отдельный скрипт и работает **только через HTTP API** (`httpx`), без прямого доступа к БД. Для прошлых COMPLETED-броней публичного API нет.

**6.2 Вариант без endpoint:** Вынести логику в `backend/scripts/` (например, `create_completed_bookings.py`), импортировать `get_db` и вызывать её из reseed. Reseed придётся переписать с `httpx` на прямой вызов БД/ORM. Это крупный рефакторинг; endpoint сохраняет текущую схему «reseed = только API».

---

## Что исправил

1. **main.py** — более безопасный дефолт для ENVIRONMENT при проверке dev_testdata.
2. **dev_testdata.py** — ответ create_completed_bookings дополнен `completed_count`, `cancelled_count`, `unique_clients`.
3. **reseed_local_test_data.py** — sanity-check после шага 7a: по мастеру выводятся completed/cancelled, unique_clients, топ-3 client_phone.

---

## Как проверить

### Команды
```bash
export ENVIRONMENT=development
export ENABLE_DEV_TESTDATA=1
cd backend && uvicorn main:app --host 0.0.0.0 --port 8000 &

python backend/scripts/reseed_local_test_data.py --base-url http://localhost:8000
```

### curl
```bash
# Без флагов — 404
curl -s -X POST http://localhost:8000/api/dev/testdata/create_completed_bookings \
  -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" \
  -d '{"master_id":1,"bookings":[{"client_phone":"+79999999999","service_id":1,"days_ago":1}]}'
# Ожидание: 404 если ENABLE_DEV_TESTDATA≠1

# С флагами — 200
export ENVIRONMENT=development ENABLE_DEV_TESTDATA=1
# перезапуск backend
curl -s -X POST ... # ожидание 200, created, completed_count, unique_clients
```

### SQL
```sql
-- Уникальные client_id среди COMPLETED для мастера
SELECT COUNT(DISTINCT client_id) FROM bookings WHERE master_id=1 AND status='completed' AND client_id IS NOT NULL;

-- Проверка причин отмены
SELECT DISTINCT cancellation_reason FROM bookings WHERE status LIKE 'cancelled%';
-- Ожидание: client_requested, client_no_show, mutual_agreement, master_unavailable (и NULL для completed)
```

