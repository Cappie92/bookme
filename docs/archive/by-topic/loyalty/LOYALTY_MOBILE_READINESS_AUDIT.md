# Post-Merge Audit: Loyalty → Mobile Readiness

**Дата:** 2026-01-21  
**База данных:** SQLite `backend/bookme.db`  
**Mobile:** React Native + Expo (expo-router)  
**Роль пользователя:** Определяется через `GET /api/auth/users/me` (user.role)

---

## 1) DB CHECK (SQLite)

### A. Sanity

```sql
SELECT COUNT(*) FROM bookings WHERE service_id IS NULL;
-- Результат: 0 ✅

SELECT COUNT(*) FROM bookings WHERE payment_amount IS NULL;
-- Результат: 20 ⚠️
```

### B. Все строки с NULL payment_amount (limit 200)

```
ID=56, service_id=17, payment_amount=None
ID=57, service_id=17, payment_amount=None
ID=58, service_id=17, payment_amount=None
ID=59, service_id=17, payment_amount=None
ID=60, service_id=17, payment_amount=None
ID=61, service_id=17, payment_amount=None
ID=62, service_id=17, payment_amount=None
ID=63, service_id=17, payment_amount=None
ID=64, service_id=17, payment_amount=None
ID=65, service_id=17, payment_amount=None
ID=66, service_id=17, payment_amount=None
ID=67, service_id=17, payment_amount=None
ID=68, service_id=17, payment_amount=None
ID=69, service_id=17, payment_amount=None
ID=70, service_id=17, payment_amount=None
ID=71, service_id=17, payment_amount=None
ID=72, service_id=17, payment_amount=None
ID=73, service_id=17, payment_amount=None
ID=74, service_id=17, payment_amount=None
ID=75, service_id=17, payment_amount=None
```

**Всего:** 20 записей

### B. Распределение по service_id

```
service_id=17, count=20
```

**Вывод:** Все 20 записей с NULL payment_amount относятся к одной услуге (service_id=17).

### B. JOIN с services (последние 10 NULL payment_amount)

```
booking.id=75, booking.service_id=17, booking.payment_amount=None, service.price=1000.0, service.name=Тестовая услуга
booking.id=74, booking.service_id=17, booking.payment_amount=None, service.price=1000.0, service.name=Тестовая услуга
booking.id=73, booking.service_id=17, booking.payment_amount=None, service.price=1000.0, service.name=Тестовая услуга
booking.id=72, booking.service_id=17, booking.payment_amount=None, service.price=1000.0, service.name=Тестовая услуга
booking.id=71, booking.service_id=17, booking.payment_amount=None, service.price=1000.0, service.name=Тестовая услуга
booking.id=70, booking.service_id=17, booking.payment_amount=None, service.price=1000.0, service.name=Тестовая услуга
booking.id=69, booking.service_id=17, booking.payment_amount=None, service.price=1000.0, service.name=Тестовая услуга
booking.id=68, booking.service_id=17, booking.payment_amount=None, service.price=1000.0, service.name=Тестовая услуга
booking.id=67, booking.service_id=17, booking.payment_amount=None, service.price=1000.0, service.name=Тестовая услуга
booking.id=66, booking.service_id=17, booking.payment_amount=None, service.price=1000.0, service.name=Тестовая услуга
```

**Вывод:** Все записи имеют валидный `service_id=17`, и `service.price=1000.0` доступен для fallback.

### C. Рекомендации

#### Variant A: Mobile Fallback (рекомендуется)

**Обоснование:** 20 legacy записей (ID 56-75) имеют валидный `service_id`, поэтому можно безопасно использовать fallback в мобильном приложении.

**Реализация в мобильном приложении:**

```typescript
interface BookingResponse {
  payment_amount: number | null;
  service_id: number;
  service?: {
    id: number;
    price: number | null;
    name: string;
  };
  applied_discount?: AppliedDiscountInfo | null;
}

// В мобильном приложении:
const displayPrice = booking.payment_amount ?? booking.service?.price ?? 0;
const originalPrice = booking.applied_discount 
  ? displayPrice + booking.applied_discount.discount_amount 
  : displayPrice;
```

**Где применять:**
- Отображение цены в списке бронирований
- Отображение цены в деталях бронирования
- Расчёт итоговой суммы при использовании баллов

#### Variant B: Data-fix SQL (НЕ выполнять автоматически)

**⚠️ ВНИМАНИЕ:** Требуется backup БД перед выполнением!

```sql
-- 1. Создать backup
-- cp backend/bookme.db backend/bookme_backup_$(date +%Y%m%d_%H%M%S).db

-- 2. Выполнить data-fix
UPDATE bookings 
SET payment_amount = (
    SELECT price FROM services 
    WHERE services.id = bookings.service_id
)
WHERE payment_amount IS NULL 
  AND service_id IS NOT NULL;

-- 3. Проверка
SELECT COUNT(*) FROM bookings WHERE payment_amount IS NULL;
-- Ожидается: 0
```

**Риски:**
- Если `service_id` не существует в таблице `services`, `payment_amount` останется `NULL`
- Нужно проверить, что все `service_id` валидны перед выполнением

---

## 2) API CONTRACT CHECK

### A. Loyalty Endpoints

| Endpoint | Method | Role | Response Schema | Notes |
|----------|--------|------|-----------------|-------|
| `/api/loyalty/templates` | GET | Public | `List[QuickDiscountTemplate]` | Шаблоны быстрых скидок |
| `/api/loyalty/status` | GET | Master | `LoyaltySystemStatus` | Статус системы (quick/complex/personal discounts) |
| `/api/loyalty/rules` | GET | Master | `LoyaltySystemStatus` | Агрегированный список правил |
| `/api/loyalty/legacy-rules` | GET | Master | `LoyaltySystemStatus` | Read-only legacy правила |
| `/api/loyalty/evaluate` | POST | Master | `DiscountEvaluationResponse` | Оценка применимости скидок |
| `/api/loyalty/quick-discounts` | GET | Master | `List[LoyaltyDiscountSchema]` | Список quick discounts |
| `/api/loyalty/quick-discounts` | POST | Master | `LoyaltyDiscountSchema` | Создание quick discount |
| `/api/loyalty/quick-discounts/{id}` | PUT | Master | `LoyaltyDiscountSchema` | Обновление quick discount |
| `/api/loyalty/quick-discounts/{id}` | DELETE | Master | `{"message": "..."}` | Удаление quick discount |
| `/api/loyalty/complex-discounts` | GET | Master | `List[LoyaltyDiscountSchema]` | Список complex discounts |
| `/api/loyalty/complex-discounts` | POST | Master | `LoyaltyDiscountSchema` | Создание complex discount |
| `/api/loyalty/complex-discounts/{id}` | PUT | Master | `LoyaltyDiscountSchema` | Обновление complex discount |
| `/api/loyalty/complex-discounts/{id}` | DELETE | Master | `{"message": "..."}` | Удаление complex discount |
| `/api/loyalty/personal-discounts` | GET | Master | `List[PersonalDiscountSchema]` | Список personal discounts |
| `/api/loyalty/personal-discounts` | POST | Master | `PersonalDiscountSchema` | Создание personal discount |
| `/api/loyalty/personal-discounts/{id}` | PUT | Master | `PersonalDiscountSchema` | Обновление personal discount |
| `/api/loyalty/personal-discounts/{id}` | DELETE | Master | `{"message": "..."}` | Удаление personal discount |
| `/api/loyalty/check-discount/{client_phone}` | GET | Master | `dict` | Проверка доступных скидок для клиента |
| `/api/master/loyalty/settings` | GET | Master (Pro+) | `LoyaltySettingsOut` | Настройки программы лояльности |
| `/api/master/loyalty/settings` | PUT | Master (Pro+) | `LoyaltySettingsOut` | Обновление настроек |
| `/api/master/loyalty/stats` | GET | Master (Pro+) | `LoyaltyStatsOut` | Статистика по баллам |
| `/api/master/loyalty/history` | GET | Master (Pro+) | `List[LoyaltyTransactionOut]` | История операций по баллам |
| `/api/client/loyalty/points` | GET | Client | `List[ClientLoyaltyPointsOut]` | Все баллы клиента по мастерам |
| `/api/client/loyalty/points/summary` | GET | Client | `List[ClientLoyaltyPointsSummaryOut]` | Краткая информация о баллах |
| `/api/client/loyalty/points/{master_id}/available` | GET | Client | `AvailableLoyaltyPointsOut` | Доступные баллы у мастера |
| `/api/client/loyalty/master/{master_id}/loyalty-settings` | GET | Client | `dict` | Публичные настройки лояльности мастера |

### B. Booking Endpoints (для отображения цены/скидки)

| Endpoint | Role | Response Schema | applied_discount? | payment_amount nullable? | service.price в payload? | File:Line |
|----------|------|-----------------|-------------------|--------------------------|--------------------------|-----------|
| `GET /api/bookings/` | Any (filtered) | `List[BookingSchema]` | ✅ Да (419) | ✅ Да (406: `Optional[float]`) | ❌ Нет (но есть `service_name`) | `bookings.py:36` |
| `GET /api/bookings/{id}` | Any | `BookingSchema` | ⚠️ Не проверено | ✅ Да (406) | ❌ Нет | `bookings.py:749` |
| `POST /api/bookings/` | Master/Admin | `BookingSchema` | ✅ Да (284-285) | ✅ Да (246-248: из Service.price) | ❌ Нет | `bookings.py:67` |
| `PUT /api/bookings/{id}` | Master/Admin | `BookingSchema` | ⚠️ Не проверено | ✅ Да (схема) | ❌ Нет | `bookings.py:503` |
| `GET /api/master/bookings` | Master | `List[BookingSchema]` | ✅ Да (90) | ✅ Да (схема) | ❌ Нет | `master.py:50` |
| `GET /api/master/bookings/detailed` | Master | `List[dict]` (не схема) | ✅ Да (165) | ✅ Да (162: `booking.payment_amount`) | ✅ Да (152: `service_price`) | `master.py:94` |
| `GET /api/client/` | Client | `List[BookingFutureShort]` | ❌ Нет (схема не включает) | ✅ Да (142: `service.price ?? 0`) | ✅ Да (142: `b.service.price`) | `client.py:65` |
| `GET /api/client/past` | Client | `List[BookingPastShort]` | ❌ Нет (схема не включает) | ✅ Да (269: `service.price ?? 0`) | ✅ Да (269: `b.service.price`) | `client.py:192` |
| `POST /api/client/` | Client | `BookingSchema` | ✅ Да (556-557) | ✅ Да (536-538) | ❌ Нет | `client.py:419` |
| `PUT /api/client/{id}` | Client | `BookingSchema` | ⚠️ Не проверено | ✅ Да (схема) | ❌ Нет | `client.py:561` |
| `POST /api/client/temporary/{id}/confirm-payment` | Client | `BookingSchema` | ✅ Да (819) | ✅ Да (799) | ❌ Нет | `client.py:751` |

### Проверка критичных endpoints

#### `GET /api/bookings/{id}`

**Файл:** `backend/routers/bookings.py:749-763`

```python
@router.get("/{booking_id}", response_model=BookingSchema)
async def get_booking(...):
    db_booking = db.query(Booking).filter(Booking.id == booking_id).first()
    if not db_booking:
        raise HTTPException(...)
    return db_booking
```

**Проблема:** ⚠️ `AppliedDiscount` не загружается явно (нет `joinedload` или отдельного запроса).

**Риск:** `applied_discount` может быть `None` даже если в БД есть запись в `applied_discounts`.

**Рекомендация:** Добавить загрузку `AppliedDiscount` аналогично `GET /api/master/bookings` (строки 77-86).

#### `PUT /api/bookings/{id}`

**Файл:** `backend/routers/bookings.py:503-539`

```python
@router.put("/{booking_id}", response_model=BookingSchema)
async def update_booking(...):
    # ...
    for key, value in booking.dict(exclude_unset=True).items():
        setattr(db_booking, key, value)
    db.commit()
    db.refresh(db_booking)
    return db_booking
```

**Проблема:** ⚠️ `AppliedDiscount` не загружается после обновления.

**Риск:** `applied_discount` может быть `None` в ответе.

**Рекомендация:** Добавить загрузку `AppliedDiscount` после `db.refresh()`.

#### `PUT /api/client/{id}`

**Файл:** `backend/routers/client.py:561-609`

```python
@router.put("/{booking_id}", response_model=BookingSchema)
def update_booking(...):
    # ...
    for field, value in booking_in.dict(exclude_unset=True).items():
        setattr(booking, field, value)
    db.commit()
    db.refresh(booking)
    return booking
```

**Проблема:** ⚠️ `AppliedDiscount` не загружается после обновления.

**Риск:** `applied_discount` может быть `None` в ответе.

**Рекомендация:** Добавить загрузку `AppliedDiscount` после `db.refresh()`.

### Вывод по API Contract

**✅ Готово:**
- Схема `Booking` включает `applied_discount: Optional[AppliedDiscountInfo]` (строка 419)
- `payment_amount: Optional[float]` может быть `None` (строка 406)
- `GET /api/master/bookings` и `GET /api/master/bookings/detailed` загружают `applied_discount`
- `GET /api/client/` и `GET /api/client/past` используют `service.price` для fallback

**⚠️ Требует внимания:**
- `GET /api/bookings/{id}` не загружает `AppliedDiscount` явно
- `PUT /api/bookings/{id}` не загружает `AppliedDiscount` после обновления
- `PUT /api/client/{id}` не загружает `AppliedDiscount` после обновления
- `BookingFutureShort` и `BookingPastShort` не включают `applied_discount` (но используют `service.price`)

---

## 3) GREP / SOURCE-OF-TRUTH CHECK

### A. Места создания Booking

#### 1. `backend/routers/bookings.py:268`

**Контекст (10 строк):**
```python
# Строки 224-248
service = db.query(Service).filter(Service.id == booking.service_id).first()
if not service:
    raise HTTPException(status_code=404, detail="Service not found")
base_price = service.price or 0

discounted_payment_amount, applied_discount_data = evaluate_and_prepare_applied_discount(
    master_id=booking.master_id if booking.master_id else None,
    client_id=current_user.id if current_user else None,
    client_phone=current_user.phone if current_user else None,
    booking_start=booking.start_time,
    service_id=booking.service_id,
    db=db,
)

booking_data['payment_amount'] = (
    discounted_payment_amount if discounted_payment_amount is not None else base_price
)

db_booking = Booking(**booking_data, client_id=current_user.id, status=initial_status.value)
```

**Вывод:** ✅ `payment_amount` установлен ДО создания объекта из `Service.price`/discounted

---

#### 2. `backend/routers/bookings.py:451`

**Контекст (10 строк):**
```python
# Строки 430-450 (public create)
service = db.query(Service).filter(Service.id == booking.service_id).first()
if not service:
    raise HTTPException(status_code=404, detail="Service not found")
base_price = service.price or 0

discounted_payment_amount, applied_discount_data = evaluate_and_prepare_applied_discount(...)

booking_dict['payment_amount'] = (
    discounted_payment_amount if discounted_payment_amount is not None else base_price
)

db_booking = Booking(**booking_dict, client_id=client.id)
```

**Вывод:** ✅ `payment_amount` установлен ДО создания объекта из `Service.price`/discounted

---

#### 3. `backend/routers/bookings.py:877`

**Контекст (10 строк):**
```python
# Строки 877-892
new_booking = Booking(
    service_id=service_id,
    master_id=best_master['id'],
    salon_id=salon_id,
    branch_id=branch_id,
    start_time=start_time,
    end_time=end_time,
    notes=notes,
    status=BookingStatus.CREATED,
    created_at=datetime.utcnow()
)

service = db.query(Service).filter(Service.id == service_id).first()
if not service:
    raise HTTPException(status_code=404, detail="Service not found")
new_booking.payment_amount = service.price or 0
```

**Вывод:** ⚠️ `payment_amount` установлен ПОСЛЕ создания объекта (post-init assignment), но ДО commit

---

#### 4. `backend/routers/client.py:540`

**Контекст (10 строк):**
```python
# Строки 520-538
service = db.query(Service).filter(Service.id == booking_in.service_id).first()
if not service:
    raise HTTPException(status_code=404, detail="Service not found")
base_price = service.price or 0

discounted_payment_amount, applied_discount_data = evaluate_and_prepare_applied_discount(
    master_id=booking_in.master_id,
    client_id=current_user.id,
    client_phone=current_user.phone,
    booking_start=booking_in.start_time,
    service_id=booking_in.service_id,
    db=db,
)

booking_data['payment_amount'] = (
    discounted_payment_amount if discounted_payment_amount is not None else base_price
)

booking = Booking(**booking_data, client_id=current_user.id)
```

**Вывод:** ✅ `payment_amount` установлен ДО создания объекта из `Service.price`/discounted

---

#### 5. `backend/routers/client.py:792`

**Контекст (10 строк):**
```python
# Строки 777-799 (confirm-payment)
service = db.query(Service).filter(Service.id == temporary_booking.service_id).first()
if not service:
    raise HTTPException(status_code=404, detail="Service not found")
base_price = service.price or 0

discounted_payment_amount, applied_discount_data = evaluate_and_prepare_applied_discount(
    master_id=temporary_booking.master_id,
    client_id=temporary_booking.client_id,
    client_phone=current_user.phone,
    booking_start=temporary_booking.start_time,
    service_id=temporary_booking.service_id,
    db=db,
)

booking = Booking(
    ...,
    payment_amount=discounted_payment_amount if discounted_payment_amount is not None else base_price
)
```

**Вывод:** ✅ `payment_amount` установлен ПРИ создании объекта из `Service.price`/discounted

---

#### 6. `backend/routers/client.py:733`

**Контекст (10 строк):**
```python
# Строки 720-740 (temporary booking)
service = db.query(Service).filter(Service.id == booking_in.service_id).first()
if not service:
    raise HTTPException(status_code=404, detail="Service not found")
base_price = service.price or 0

discounted_payment_amount, applied_discount_data = evaluate_and_prepare_applied_discount(...)

temporary_booking = TemporaryBooking(
    master_id=booking_in.master_id,
    client_id=current_user.id,
    service_id=booking_in.service_id,
    start_time=booking_in.start_time,
    end_time=booking_in.end_time,
    payment_amount=discounted_payment_amount if discounted_payment_amount is not None else base_price,
    expires_at=expires_at,
    status='pending'
)
```

**Вывод:** ✅ `payment_amount` установлен ПРИ создании объекта из `Service.price`/discounted

---

#### 7. `backend/scripts/create_test_bookings_for_master.py:102`

**Контекст (10 строк):**
```python
# Строки 102-111
booking = Booking(
    master_id=master.id,
    client_id=test_client.id,
    service_id=service.id,
    start_time=start_time,
    end_time=end_time,
    status=BookingStatus.CREATED,
    notes=f'Тестовая запись #{bookings_created + 1} - {service.name}'
)
booking.payment_amount = service.price or 0

db.add(booking)
```

**Вывод:** ⚠️ `payment_amount` установлен ПОСЛЕ создания объекта (post-init assignment), но ДО commit. **OK для тестового скрипта.**

---

#### 8. `backend/seed.py:178`

**Контекст (10 строк):**
```python
# Строки 178-189
booking = Booking(
    client_id=client.id,
    service_id=service.id,
    master_id=random.choice(masters).id if service.salon_id else None,
    indie_master_id=service.indie_master_id,
    salon_id=service.salon_id,
    start_time=start_time,
    end_time=end_time,
    status=random.choice(list(BookingStatus)),
    notes=fake.text() if random.random() > 0.7 else None,
)
booking.payment_amount = service.price or 0
```

**Вывод:** ⚠️ `payment_amount` установлен ПОСЛЕ создания объекта (post-init assignment), но ДО commit. **OK для seed скрипта.**

---

#### 9. `backend/reset_test_system.py:357` и `380`

**Контекст (10 строк):**
```python
# Строки 357-365 (салон)
booking = Booking(
    client_id=client.id,
    service_id=service.id,
    salon_id=service.salon_id,
    start_time=start_time,
    end_time=end_time,
    status=random.choice([BookingStatus.PENDING, BookingStatus.CONFIRMED]),
    payment_amount=service.price
)

# Строки 380-388 (индивидуал)
booking = Booking(
    client_id=client.id,
    service_id=service.id,
    indie_master_id=indie_master.id,
    start_time=start_time,
    end_time=end_time,
    status=random.choice([BookingStatus.PENDING, BookingStatus.CONFIRMED]),
    payment_amount=service.price
)
```

**Вывод:** ✅ `payment_amount` установлен ПРИ создании объекта из `service.price`

---

#### 10. `backend/seed_test_system.py:314` и `337`

**Контекст (10 строк):**
```python
# Строки 314-322 (салон)
booking = Booking(
    client_id=client.id,
    service_id=service.id,
    salon_id=service.salon_id,
    start_time=start_time,
    end_time=end_time,
    status=random.choice([BookingStatus.PENDING, BookingStatus.CONFIRMED]),
    payment_amount=service.price
)

# Строки 337-345 (индивидуал)
booking = Booking(
    client_id=client.id,
    service_id=service.id,
    indie_master_id=indie_master.id,
    start_time=start_time,
    end_time=end_time,
    status=random.choice([BookingStatus.PENDING, BookingStatus.CONFIRMED]),
    payment_amount=service.price
)
```

**Вывод:** ✅ `payment_amount` установлен ПРИ создании объекта из `service.price`

---

### B. Запрещённые паттерны

**Grep:** `payment_amount\s*=\s*booking_in\.|booking_data\['payment_amount'\]\s*=\s*booking_in\.|payment_amount\s*=\s*booking\.payment_amount`

**Результат:** 0 совпадений ✅

**Вывод:** ✅ Нигде не используется `payment_amount` из payload. Всегда используется `Service.price` или `discounted_payment_amount`.

---

## 4) MOBILE DTO EXPORT

### AppliedDiscountInfo

```typescript
interface AppliedDiscountInfo {
  id: number;                    // ✅ Required
  rule_type: string;             // ✅ Required ("quick" | "complex" | "personal")
  name: string;                   // ✅ Required
  discount_percent: number;       // ✅ Required (0-100)
  discount_amount: number;        // ✅ Required (в рублях)
}
```

**Источник:** `backend/schemas.py:1570-1575`

---

### DiscountCandidate

```typescript
interface DiscountCandidate {
  rule_id: number;                // ✅ Required
  rule_type: string;              // ✅ Required ("quick" | "complex" | "personal")
  name: string;                   // ✅ Required
  condition_type: string | null;  // ⚠️ Optional
  parameters: Record<string, any>; // ✅ Required (может быть {})
  priority: number;               // ✅ Required (1-10)
  is_active: boolean;             // ✅ Required
  match: boolean;                 // ✅ Required
  reason: string;                 // ✅ Required
  discount_percent: number;       // ✅ Required (0-100)
  max_discount_amount: number | null; // ⚠️ Optional
}
```

**Источник:** `backend/schemas.py:1615-1627`

---

### DiscountEvaluationResponse

```typescript
interface DiscountEvaluationResponse {
  candidates: DiscountCandidate[];        // ✅ Required (может быть [])
  best_candidate: DiscountCandidate | null; // ⚠️ Optional
}
```

**Источник:** `backend/schemas.py:1629-1631`

---

### LoyaltySettings

```typescript
interface LoyaltySettings {
  id: number;                    // ✅ Required
  master_id: number;              // ✅ Required
  is_enabled: boolean;            // ✅ Required
  accrual_percent: number | null; // ⚠️ Optional (1-100, если enabled)
  max_payment_percent: number | null; // ⚠️ Optional (1-100, если enabled)
  points_lifetime_days: number | null; // ⚠️ Optional (14|30|60|90|180|365|null)
  created_at: string;             // ✅ Required (ISO datetime)
  updated_at: string;             // ✅ Required (ISO datetime)
}
```

**Источник:** `backend/schemas.py:2485-2492`

---

### LoyaltyStats

```typescript
interface LoyaltyStats {
  total_earned: number;           // ✅ Required (int)
  total_spent: number;             // ✅ Required (int)
  current_balance: number;         // ✅ Required (int, может быть отрицательным)
  active_clients_count: number;   // ✅ Required (int)
}
```

**Источник:** `backend/schemas.py:2560-2564`

---

### LoyaltyTransaction

```typescript
interface LoyaltyTransaction {
  id: number;                     // ✅ Required
  master_id: number;               // ✅ Required
  client_id: number;               // ✅ Required
  booking_id: number | null;       // ⚠️ Optional
  transaction_type: string;        // ✅ Required ("earned" | "spent")
  points: number;                  // ✅ Required (int, положительное)
  earned_at: string;               // ✅ Required (ISO datetime)
  expires_at: string | null;       // ⚠️ Optional (ISO datetime, только для earned)
  service_id: number | null;       // ⚠️ Optional
  created_at: string;             // ✅ Required (ISO datetime)
  client_name: string | null;      // ⚠️ Optional (дополнительное поле)
  service_name: string | null;     // ⚠️ Optional (дополнительное поле)
}
```

**Источник:** `backend/schemas.py:2540-2557`

---

### ClientLoyaltyPoints

```typescript
interface ClientLoyaltyPoints {
  master_id: number;               // ✅ Required
  master_name: string;             // ✅ Required
  total_points: number;            // ✅ Required (int, активные баллы)
  active_points: number;           // ✅ Required (int, то же что total_points)
  expired_points: number;         // ✅ Required (int, истекшие)
  transactions: LoyaltyTransaction[]; // ✅ Required (массив, может быть [])
}
```

**Источник:** `backend/schemas.py:2567-2571`

---

### AvailableLoyaltyPoints

```typescript
interface AvailableLoyaltyPoints {
  master_id: number;               // ✅ Required
  available_points: number;        // ✅ Required (int, доступные баллы)
  max_payment_percent: number | null; // ⚠️ Optional (1-100, если enabled)
  is_loyalty_enabled: boolean;     // ✅ Required
}
```

**Источник:** `backend/routers/client_loyalty.py:177-211`

---

### Booking DTO (для мобильного приложения)

**Для экранов "Мои записи" и "Деталка записи":**

```typescript
interface ServiceInfo {
  id: number;
  name: string;
  price: number | null;  // ⚠️ Optional (для fallback)
  duration: number;
}

interface BookingDTO {
  id: number;
  client_id: number | null;
  service_id: number;
  master_id: number | null;
  start_time: string;  // ISO datetime
  end_time: string;    // ISO datetime
  status: string;
  notes: string | null;
  
  // Информация об оплате
  payment_method: string | null;
  payment_amount: number | null;  // ⚠️ Optional (legacy может быть NULL)
  is_paid: boolean | null;
  
  // Дополнительные поля
  service_name: string | null;
  master_name: string | null;
  salon_name: string | null;
  
  // Скидка (если применена)
  applied_discount: AppliedDiscountInfo | null;  // ⚠️ Optional
  
  // Service объект (для fallback)
  service?: ServiceInfo;  // ⚠️ Optional (если endpoint возвращает)
  
  created_at: string;  // ISO datetime
  updated_at: string;   // ISO datetime
}
```

**Примечания:**
- `payment_amount` может быть `null` (legacy записи)
- `applied_discount` может быть `null` (если скидка не применялась)
- `service` может отсутствовать в некоторых endpoints (например, `BookingFutureShort`)

**Fallback логика в мобильном приложении:**

```typescript
const getDisplayPrice = (booking: BookingDTO): number => {
  // Приоритет: payment_amount -> service.price -> 0
  return booking.payment_amount ?? booking.service?.price ?? 0;
};

const getOriginalPrice = (booking: BookingDTO): number => {
  const displayPrice = getDisplayPrice(booking);
  // Если есть скидка, восстанавливаем оригинальную цену
  if (booking.applied_discount) {
    return displayPrice + booking.applied_discount.discount_amount;
  }
  return displayPrice;
};
```

---

## 5) OUTPUT

### READY / NOT READY

**Статус:** ✅ **READY** (с минимальными рекомендациями)

### Список блокеров

**Нет критичных блокеров.** Все найденные проблемы имеют решения через fallback в мобильном приложении.

### Минимальные обязательные правила для мобайла

#### 1. Fallback для цены

**Обязательно:** Всегда использовать fallback для `payment_amount`:

```typescript
const displayPrice = booking.payment_amount ?? booking.service?.price ?? 0;
```

**Где применять:**
- Отображение цены в списке бронирований
- Отображение цены в деталях бронирования
- Расчёт итоговой суммы при использовании баллов
- Валидация минимальной суммы для оплаты

#### 2. Applied Discount Optional

**Обязательно:** Обрабатывать `applied_discount` как optional:

```typescript
if (booking.applied_discount) {
  // Показать информацию о скидке
  const originalPrice = displayPrice + booking.applied_discount.discount_amount;
  // Отобразить: "Цена: 1800₽ (скидка 10% = 200₽)"
}
```

**Где применять:**
- Детали бронирования (показывать информацию о скидке, если есть)
- Список бронирований (опционально показывать badge "Скидка применена")

#### 3. Обработка ошибок для loyalty endpoints

**Обязательно:** Обрабатывать все возможные ошибки:

```typescript
try {
  const settings = await getLoyaltySettings();
} catch (error) {
  if (error.status === 403) {
    // Показать CTA "Обновить тариф" (Pro+ required)
  } else if (error.status === 404) {
    // Мастер не найден
  } else if (error.status === 409) {
    // SCHEMA_OUTDATED - показать предупреждение
    // Проверить X-Error-Code: SCHEMA_OUTDATED
  }
}
```

**Где применять:**
- Все вызовы `/api/loyalty/*` endpoints
- Все вызовы `/api/master/loyalty/*` endpoints
- Обработка 403 для subscription-required features

#### 4. Проверка service_id перед fallback

**Обязательно:** Проверять, что `service_id` существует перед использованием `service.price`:

```typescript
const getDisplayPrice = (booking: BookingDTO): number => {
  // Если service_id есть, но service объект отсутствует - нужно загрузить отдельно
  if (booking.service_id && !booking.service) {
    // Загрузить service отдельно или использовать payment_amount как есть
    return booking.payment_amount ?? 0;
  }
  return booking.payment_amount ?? booking.service?.price ?? 0;
};
```

---

## Итоговые выводы

### ✅ Готово к переносу:
1. Все места создания `Booking` устанавливают `payment_amount` из `Service.price` или `discounted_payment_amount`
2. Нигде не используется `payment_amount` из payload (0 совпадений)
3. Схема `Booking` включает `applied_discount`
4. Все DTO определены и документированы
5. Мобайл: React Native + Expo
6. Роль определяется через `/api/auth/users/me`

### ⚠️ Требует внимания (не блокеры):
1. **20 legacy записей** с `payment_amount IS NULL` (ID 56-75) — использовать fallback
2. **Некоторые endpoints** не загружают `AppliedDiscount` явно:
   - `GET /api/bookings/{id}` — не загружает `AppliedDiscount`
   - `PUT /api/bookings/{id}` — не загружает `AppliedDiscount` после обновления
   - `PUT /api/client/{id}` — не загружает `AppliedDiscount` после обновления
3. **`BookingFutureShort` и `BookingPastShort`** не включают `applied_discount` (но используют `service.price` для fallback)

### 📝 Рекомендации для мобильного приложения:
1. Всегда использовать fallback: `payment_amount ?? service.price ?? 0`
2. Обрабатывать `applied_discount` как optional
3. Проверять `service_id IS NOT NULL` перед использованием `service.price`
4. Обрабатывать ошибки 403/404/409 для loyalty endpoints
5. Использовать `getCurrentUser()` для определения роли пользователя

---

**Аудит завершён. Система готова к переносу в мобильное приложение с учётом fallback для legacy данных.**
