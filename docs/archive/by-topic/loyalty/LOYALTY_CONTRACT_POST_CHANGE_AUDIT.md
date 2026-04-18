# Post-Change Audit: applied_discount Contract Fix

**Дата:** 2026-01-21  
**Цель:** Верификация исправлений contract для `applied_discount` в 3 endpoints

---

## Чеклист верификации

### 1) Импорты и зависимости (P0)

**Проверка:** Импорты в изменённых файлах

#### `backend/routers/bookings.py`

**Факт:**
- Строка 5: `from sqlalchemy.orm import Session, joinedload` ✅
- Строка 17: `AppliedDiscount` ✅
- Строка 31: `from utils.loyalty_discounts import evaluate_and_prepare_applied_discount, build_applied_discount_info` ✅

**Вывод:** ✅ **OK**

---

#### `backend/routers/client.py`

**Факт:**
- Строка 6: `from sqlalchemy.orm import Session, joinedload` ✅
- Строка 14: `AppliedDiscount` ✅
- Строка 24: `from utils.loyalty_discounts import evaluate_and_prepare_applied_discount, build_applied_discount_info` ✅

**Вывод:** ✅ **OK**

---

### 2) Переменные/параметры endpoint (P0)

**Проверка:** Использование правильного идентификатора брони в фильтрах

#### A. `GET /api/bookings/{id}` (строки 763-811)

**Факт:**
- Path param: `booking_id: int` (строка 765)
- Фильтр AppliedDiscount: `.filter(AppliedDiscount.booking_id == booking_id)` (строка 796) ✅

**Вывод:** ✅ **OK**

---

#### B. `PUT /api/bookings/{id}` (строки 503-562)

**Факт:**
- Path param: `booking_id: int` (строка 505)
- Фильтр AppliedDiscount: `.filter(AppliedDiscount.booking_id == booking_id)` (строка 558) ✅

**Вывод:** ✅ **OK**

---

#### C. `PUT /api/client/{id}` (строки 561-621)

**Факт:**
- Path param: `booking_id: int` (строка 563)
- Фильтр AppliedDiscount: `.filter(AppliedDiscount.booking_id == booking_id)` (строка 617) ✅

**Вывод:** ✅ **OK**

---

### 3) Relationships в AppliedDiscount (P0)

**Проверка:** Существование relationship полей в модели

**Файл:** `backend/models.py:1127-1152`

**Факт:**
```python
class AppliedDiscount(Base):
    # ...
    loyalty_discount = relationship("LoyaltyDiscount")  # Строка 1144
    personal_discount = relationship("PersonalDiscount")  # Строка 1145
```

**Использование в коде:**
- `joinedload(AppliedDiscount.loyalty_discount)` ✅
- `joinedload(AppliedDiscount.personal_discount)` ✅

**Вывод:** ✅ **OK**

---

### 4) Авторизационная граница (P0)

**Проверка:** Проверка доступа перед возвратом данных

#### A. `GET /api/bookings/{id}` (строки 763-811)

**Факт:**
- Строка 772: `db_booking = db.query(Booking).filter(Booking.id == booking_id).first()`
- Строка 773-776: Проверка на существование (404)
- Строка 778-787: ✅ **ИСПРАВЛЕНО** — добавлена проверка доступа по роли:
  - `if current_user.role == "client": if db_booking.client_id != current_user.id: 403`
  - `elif current_user.role == "master": if db_booking.master_id != current_user.id: 403`
  - `elif current_user.role == "salon": if db_booking.salon_id != current_user.id: 403`

**Вывод:** ✅ **OK** (исправлено)

---

#### B. `PUT /api/bookings/{id}` (строки 503-562)

**Факт:**
- Строка 513: `db_booking = db.query(Booking).filter(Booking.id == booking_id).first()`
- Строка 514-517: Проверка на существование (404)
- Строка 519-527: ✅ **ИСПРАВЛЕНО** — добавлена проверка доступа по роли (аналогично GET)

**Вывод:** ✅ **OK** (исправлено)

---

#### C. `PUT /api/client/{id}` (строки 561-621)

**Факт:**
- Строка 571-574: `booking = db.query(Booking).filter(Booking.id == booking_id, Booking.client_id == current_user.id).first()`
- Строка 577-578: Проверка на существование (404)

**Вывод:** ✅ **OK** — проверка доступа есть (фильтр по `Booking.client_id == current_user.id`)

---

### 5) Схема ответа (P0)

**Проверка:** Наличие `applied_discount` в схеме ответа

**Файл:** `backend/schemas.py:391-422`

**Факт:**
```python
class Booking(BaseModel):
    # ...
    applied_discount: Optional[AppliedDiscountInfo] = None  # Строка 419 ✅
```

**Файл:** `backend/schemas.py:1570-1575`

**Факт:**
```python
class AppliedDiscountInfo(BaseModel):
    id: int  # ✅
    rule_type: str  # ✅
    name: str  # ✅
    discount_percent: float  # ✅
    discount_amount: float  # ✅
```

**Вывод:** ✅ **OK**

---

### 6) Порядок операций после commit/refresh (P1)

**Проверка:** Присваивание `applied_discount` после `db.commit()` и `db.refresh()`

#### A. `PUT /api/bookings/{id}` (строки 537-562)

**Факт:**
- Строка 537: `db.commit()`
- Строка 538: `db.refresh(db_booking)`
- Строка 540-562: Загрузка и присваивание `applied_discount`

**Вывод:** ✅ **OK** — порядок корректный

---

#### B. `PUT /api/client/{id}` (строки 607-621)

**Факт:**
- Строка 607: `db.commit()`
- Строка 608: `db.refresh(booking)`
- Строка 610-621: Загрузка и присваивание `applied_discount`

**Вывод:** ✅ **OK** — порядок корректный

---

## Итоговый отчёт

### ✅ OK (6 пунктов):
1. Импорты и зависимости — все импорты присутствуют
2. Переменные/параметры endpoint — все используют правильный `booking_id`
3. Relationships в AppliedDiscount — `loyalty_discount` и `personal_discount` существуют
4. Авторизационная граница — все endpoints имеют проверку доступа ✅ (исправлено)
5. Схема ответа — `BookingSchema` содержит `applied_discount: Optional[AppliedDiscountInfo]`
6. Порядок операций — корректный порядок после commit/refresh

### ✅ Исправлено:
1. **`GET /api/bookings/{id}`** — добавлена проверка доступа (строки 778-787)
2. **`PUT /api/bookings/{id}`** — добавлена проверка доступа (строки 519-527)

---

## Применённые патчи

### Патч 1: `GET /api/bookings/{id}` (строки 778-787)

```diff
--- a/backend/routers/bookings.py
+++ b/backend/routers/bookings.py
@@ -776,6 +776,15 @@ async def get_booking(
         raise HTTPException(
             status_code=status.HTTP_404_NOT_FOUND, detail="Бронирование не найдено"
         )
+    
+    # Проверка доступа по роли
+    if current_user.role == "client":
+        if db_booking.client_id != current_user.id:
+            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Доступ запрещён")
+    elif current_user.role == "master":
+        if db_booking.master_id != current_user.id:
+            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Доступ запрещён")
+    elif current_user.role == "salon":
+        if db_booking.salon_id != current_user.id:
+            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Доступ запрещён")
     
     # Загружаем AppliedDiscount с связанными правилами
```

**Файл:строка:** `backend/routers/bookings.py:778-787`

---

### Патч 2: `PUT /api/bookings/{id}` (строки 519-527)

```diff
--- a/backend/routers/bookings.py
+++ b/backend/routers/bookings.py
@@ -517,6 +517,15 @@ async def update_booking(
         raise HTTPException(
             status_code=status.HTTP_404_NOT_FOUND, detail="Бронирование не найдено"
         )
+    
+    # Проверка доступа по роли
+    if current_user.role == "client":
+        if db_booking.client_id != current_user.id:
+            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Доступ запрещён")
+    elif current_user.role == "master":
+        if db_booking.master_id != current_user.id:
+            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Доступ запрещён")
+    elif current_user.role == "salon":
+        if db_booking.salon_id != current_user.id:
+            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Доступ запрещён")
 
     # Проверяем конфликты
```

**Файл:строка:** `backend/routers/bookings.py:519-527`

---

## SMOKE PLAN (4 curl-команды)

### 1. Создать booking со скидкой

```bash
curl -X POST http://localhost:8000/api/bookings/ \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "service_id": <SERVICE_ID>,
    "master_id": <MASTER_ID>,
    "start_time": "2026-01-25T10:00:00",
    "end_time": "2026-01-25T11:00:00"
  }'
```

**Ожидаемый результат:** `200 OK` с `applied_discount != null` (если скидка применилась)

**Проверка:** Сохранить `booking_id` из ответа

---

### 2. GET /api/bookings/{id} → applied_discount != null

```bash
curl -X GET http://localhost:8000/api/bookings/<BOOKING_ID> \
  -H "Authorization: Bearer <TOKEN>"
```

**Ожидаемый результат:** 
- `200 OK` с полем `applied_discount` (может быть `null` или объект)
- Если токен другого пользователя (не владельца) → `403 Forbidden`

**Проверка:** `jq '.applied_discount'` должен вернуть объект или `null`

---

### 3. PUT /api/bookings/{id} (notes) → applied_discount не потерян

```bash
curl -X PUT http://localhost:8000/api/bookings/<BOOKING_ID> \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "notes": "Обновлённые заметки"
  }'
```

**Ожидаемый результат:** 
- `200 OK` с полем `applied_discount` (не должно потеряться)
- Если токен другого пользователя → `403 Forbidden`

**Проверка:** `jq '.applied_discount'` должен вернуть тот же объект, что и до обновления

---

### 4. PUT /api/client/{id} → applied_discount не потерян

```bash
curl -X PUT http://localhost:8000/api/client/bookings/<BOOKING_ID> \
  -H "Authorization: Bearer <CLIENT_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "notes": "Заметки от клиента"
  }'
```

**Ожидаемый результат:** 
- `200 OK` с полем `applied_discount` (не должно потеряться)
- Если токен другого клиента → `404 Not Found` (фильтр по `client_id`)

**Проверка:** `jq '.applied_discount'` должен вернуть тот же объект, что и до обновления

---

## Итоговый вывод

**Статус:** ✅ **ВСЁ OK** (все BUG P0 исправлены)

**Исправлено:**
1. Добавлена проверка доступа в `GET /api/bookings/{id}` (строки 778-787)
2. Добавлена проверка доступа в `PUT /api/bookings/{id}` (строки 519-527)

**Готово к тестированию:**
- Все импорты присутствуют
- Все переменные корректны
- Relationships существуют
- Авторизационная граница защищена
- Схема ответа корректна
- Порядок операций корректный

---

**Аудит завершён. Все проверки пройдены, BUG P0 исправлены.**
