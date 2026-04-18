# Post-Merge Аудит: Loyalty → Mobile Readiness

**Дата:** 2026-01-21  
**База данных:** SQLite `backend/bookme.db`

---

## Часть 1: DB Sanity Check

### Результаты SQL запросов:

```sql
SELECT COUNT(*) FROM bookings WHERE service_id IS NULL;
-- Результат: 0 ✅

SELECT COUNT(*) FROM bookings WHERE payment_amount IS NULL;
-- Результат: 20 ⚠️
```

### Примеры записей с NULL payment_amount:

```
ID=56, service_id=17, payment_amount=None
ID=57, service_id=17, payment_amount=None
ID=58, service_id=17, payment_amount=None
... (всего 20 записей, все с service_id=17)
```

### Рекомендации для NULL payment_amount:

#### Вариант A: Оставить как legacy + мобайл-fallback

**Обоснование:** 20 записей — это legacy данные (ID 56-75), созданные до внедрения логики скидок. Они имеют `service_id`, поэтому можно безопасно использовать fallback.

**Мобайл-fallback:**
```typescript
interface BookingResponse {
  payment_amount: number | null;
  service?: {
    id: number;
    price: number | null;
  };
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

#### Вариант B: Одноразовый data-fix скрипт

**Скрипт:**
```python
# backend/scripts/fix_null_payment_amount.py
import sqlite3

con = sqlite3.connect("bookme.db")
con.execute("""
    UPDATE bookings 
    SET payment_amount = (
        SELECT price FROM services 
        WHERE services.id = bookings.service_id
    )
    WHERE payment_amount IS NULL 
    AND service_id IS NOT NULL
""")
con.commit()
print(f"Обновлено записей: {con.total_changes}")
con.close()
```

**⚠️ ВНИМАНИЕ:** НЕ выполнять автоматически. Требуется:
1. Backup БД перед выполнением
2. Проверка, что все `service_id` существуют в таблице `services`
3. Ручная проверка результатов

---

## Часть 2: Contract Audit (Endpoints → Booking Schema)

### Таблица endpoints, возвращающих Booking:

| Endpoint | Role | Response Schema | Has applied_discount | Payment Amount Fallback | Notes |
|----------|------|-----------------|----------------------|------------------------|-------|
| `GET /api/bookings/` | Any (filtered by role) | `List[BookingSchema]` | ✅ Да (строка 419) | ❌ Нет (строка 406: `Optional[float]`) | `backend/routers/bookings.py:36` |
| `POST /api/bookings/` | Master/Admin | `BookingSchema` | ✅ Да (строки 284-285) | ✅ Да (строка 246-248: из `Service.price`) | `backend/routers/bookings.py:67` |
| `PUT /api/bookings/{id}` | Master/Admin | `BookingSchema` | ❓ Не проверено | ❓ Не проверено | `backend/routers/bookings.py:503` |
| `GET /api/bookings/{id}` | Any | `BookingSchema` | ❓ Не проверено | ❓ Не проверено | `backend/routers/bookings.py:749` |
| `GET /api/master/bookings` | Master | `List[BookingSchema]` | ✅ Да (строка 90) | ❌ Нет (схема) | `backend/routers/master.py:50` |
| `GET /api/master/bookings/detailed` | Master | `List[dict]` (не схема) | ✅ Да (строка 165) | ❌ Нет (строка 162: `booking.payment_amount`) | `backend/routers/master.py:94` |
| `GET /api/client/` | Client | `List[BookingFutureShort]` | ❌ Нет (схема не включает) | ✅ Да (строка 142: `service.price ?? 0`) | `backend/routers/client.py:65` |
| `GET /api/client/past` | Client | `List[BookingPastShort]` | ❌ Нет (схема не включает) | ❓ Не проверено | `backend/routers/client.py:192` |
| `POST /api/client/` | Client | `BookingSchema` | ✅ Да (строки 556-557) | ✅ Да (строка 536-538) | `backend/routers/client.py:419` |
| `PUT /api/client/{id}` | Client | `BookingSchema` | ❓ Не проверено | ❓ Не проверено | `backend/routers/client.py:561` |
| `POST /api/client/temporary/{id}/confirm-payment` | Client | `BookingSchema` | ✅ Да (строка 819) | ✅ Да (строка 799) | `backend/routers/client.py:751` |

### Проверка схемы Booking:

**Файл:** `backend/schemas.py:391-422`

```python
class Booking(BaseModel):
    # ... другие поля ...
    payment_amount: Optional[float] = None  # Строка 406
    applied_discount: Optional[AppliedDiscountInfo] = None  # Строка 419 ✅
```

**Вывод:** ✅ Схема `Booking` включает `applied_discount`, но `payment_amount` может быть `None`.

---

## Часть 3: Grep Audit

### Места создания Booking:

#### 1. `backend/routers/bookings.py:268`
```python
# Строки 224-248
service = db.query(Service).filter(Service.id == booking.service_id).first()
base_price = service.price or 0
discounted_payment_amount, applied_discount_data = evaluate_and_prepare_applied_discount(...)
booking_data['payment_amount'] = (
    discounted_payment_amount if discounted_payment_amount is not None else base_price
)
db_booking = Booking(**booking_data, ...)  # ✅ payment_amount установлен
```

#### 2. `backend/routers/bookings.py:451`
```python
# Строки 430-450 (public create)
service = db.query(Service).filter(Service.id == booking.service_id).first()
base_price = service.price or 0
discounted_payment_amount, applied_discount_data = evaluate_and_prepare_applied_discount(...)
booking_dict['payment_amount'] = (
    discounted_payment_amount if discounted_payment_amount is not None else base_price
)
db_booking = Booking(**booking_dict, ...)  # ✅ payment_amount установлен
```

#### 3. `backend/routers/bookings.py:877`
```python
# Строки 877-892
new_booking = Booking(...)  # ❌ payment_amount НЕ установлен при создании
# ...
service = db.query(Service).filter(Service.id == service_id).first()
new_booking.payment_amount = service.price or 0  # ✅ Исправлено после создания
```

#### 4. `backend/routers/client.py:540`
```python
# Строки 520-538
service = db.query(Service).filter(Service.id == booking_in.service_id).first()
base_price = service.price or 0
discounted_payment_amount, applied_discount_data = evaluate_and_prepare_applied_discount(...)
booking_data['payment_amount'] = (
    discounted_payment_amount if discounted_payment_amount is not None else base_price
)
booking = Booking(**booking_data, ...)  # ✅ payment_amount установлен
```

#### 5. `backend/routers/client.py:792`
```python
# Строки 777-799 (confirm-payment)
service = db.query(Service).filter(Service.id == temporary_booking.service_id).first()
base_price = service.price or 0
discounted_payment_amount, applied_discount_data = evaluate_and_prepare_applied_discount(...)
booking = Booking(
    ...,
    payment_amount=discounted_payment_amount if discounted_payment_amount is not None else base_price
)  # ✅ payment_amount установлен
```

#### 6. `backend/scripts/create_test_bookings_for_master.py:102`
```python
# Строки 102-111
booking = Booking(...)  # ❌ payment_amount НЕ установлен при создании
booking.payment_amount = service.price or 0  # ✅ Исправлено после создания (строка 111)
```

#### 7. `backend/seed.py:178`
```python
# Строки 178-189
booking = Booking(...)  # ❌ payment_amount НЕ установлен при создании
booking.payment_amount = service.price or 0  # ✅ Исправлено после создания (строка 189)
```

### Проверка использования payment_amount из payload:

**Результат grep:** `payment_amount.*=.*booking_in\.|payment_amount.*=.*booking\.payment_amount|booking_data\['payment_amount'\].*=.*booking_in`

**Найдено:** 0 совпадений ✅

**Вывод:** ✅ Нигде не сохраняется `payment_amount` из payload. Всегда используется `Service.price` или `discounted_payment_amount`.

---

## Часть 4: Mobile Mapping (DTO)

### 1. AppliedDiscountInfo

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

### 2. DiscountCandidate + DiscountEvaluationResponse

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

interface DiscountEvaluationResponse {
  candidates: DiscountCandidate[];        // ✅ Required (может быть [])
  best_candidate: DiscountCandidate | null; // ⚠️ Optional
}
```

**Источник:** `backend/schemas.py:1615-1631`

---

### 3. Loyalty Settings

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

### 4. Loyalty Stats

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

### 5. Loyalty Transaction (History Item)

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

### 6. Client Loyalty Points

```typescript
interface ClientLoyaltyPoints {
  master_id: number;               // ✅ Required
  master_name: string;             // ✅ Required
  total_points: number;            // ✅ Required (int, активные баллы)
  active_points: number;           // ✅ Required (int, то же что total_points)
  expired_points: number;         // ✅ Required (int, истекшие)
  transactions: LoyaltyTransaction[]; // ✅ Required (массив, может быть [])
}

interface ClientLoyaltyPointsSummary {
  master_id: number;               // ✅ Required
  master_name: string;             // ✅ Required
  total_points: number;            // ✅ Required (int)
}
```

**Источник:** `backend/schemas.py:2567-2575`

---

### 7. Available Loyalty Points

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

## Итоговые выводы

### ✅ Готово к переносу:
1. Все места создания `Booking` устанавливают `payment_amount` из `Service.price` или `discounted_payment_amount`
2. Нигде не используется `payment_amount` из payload
3. Схема `Booking` включает `applied_discount`
4. Все DTO определены и документированы

### ⚠️ Требует внимания:
1. **20 legacy записей** с `payment_amount IS NULL` (ID 56-75)
   - **Рекомендация:** Использовать fallback в мобильном приложении (Вариант A)
2. **Некоторые endpoints** не проверены на возврат `applied_discount`:
   - `PUT /api/bookings/{id}`
   - `GET /api/bookings/{id}`
   - `PUT /api/client/{id}`
   - `GET /api/client/past`
3. **`GET /api/master/bookings/detailed`** возвращает `dict`, а не схему — может быть нестабильным

### 📝 Рекомендации для мобильного приложения:
1. Всегда использовать fallback: `payment_amount ?? service.price ?? 0`
2. Обрабатывать `applied_discount` как optional
3. Проверять `service_id IS NOT NULL` перед использованием `service.price`
4. Обрабатывать ошибки 403/404/409 для loyalty endpoints
