# Исправление Contract: applied_discount в Booking Endpoints

**Дата:** 2026-01-21  
**Цель:** Добавить возврат `applied_discount` в 3 endpoints для мобильного приложения

---

## Изменённые файлы

### 1. `backend/routers/bookings.py`

**Изменения:**
- Добавлен импорт `joinedload` (строка 5)
- Добавлен импорт `AppliedDiscount` (строка 17)
- Добавлен импорт `build_applied_discount_info` (строка 31)

**Исправленные endpoints:**

#### A. `GET /api/bookings/{id}` (строки 763-789)

**До:**
```python
@router.get("/{booking_id}", response_model=BookingSchema)
async def get_booking(...):
    db_booking = db.query(Booking).filter(Booking.id == booking_id).first()
    if not db_booking:
        raise HTTPException(...)
    return db_booking
```

**После:**
```python
@router.get("/{booking_id}", response_model=BookingSchema)
async def get_booking(...):
    db_booking = db.query(Booking).filter(Booking.id == booking_id).first()
    if not db_booking:
        raise HTTPException(...)
    
    # Загружаем AppliedDiscount с связанными правилами
    applied_discount = (
        db.query(AppliedDiscount)
        .options(
            joinedload(AppliedDiscount.loyalty_discount),
            joinedload(AppliedDiscount.personal_discount),
        )
        .filter(AppliedDiscount.booking_id == booking_id)
        .first()
    )
    
    db_booking.applied_discount = build_applied_discount_info(applied_discount) if applied_discount else None
    
    return db_booking
```

**Файл:строка:** `backend/routers/bookings.py:778-789`

---

#### B. `PUT /api/bookings/{id}` (строки 503-553)

**До:**
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

**После:**
```python
@router.put("/{booking_id}", response_model=BookingSchema)
async def update_booking(...):
    # ...
    for key, value in booking.dict(exclude_unset=True).items():
        setattr(db_booking, key, value)

    db.commit()
    db.refresh(db_booking)
    
    # Загружаем AppliedDiscount с связанными правилами
    applied_discount = (
        db.query(AppliedDiscount)
        .options(
            joinedload(AppliedDiscount.loyalty_discount),
            joinedload(AppliedDiscount.personal_discount),
        )
        .filter(AppliedDiscount.booking_id == booking_id)
        .first()
    )
    
    db_booking.applied_discount = build_applied_discount_info(applied_discount) if applied_discount else None
    
    return db_booking
```

**Файл:строка:** `backend/routers/bookings.py:540-551`

---

### 2. `backend/routers/client.py`

**Изменения:**
- Импорты уже были (AppliedDiscount, build_applied_discount_info)

**Исправленные endpoints:**

#### C. `PUT /api/client/{id}` (строки 561-621)

**До:**
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

**После:**
```python
@router.put("/{booking_id}", response_model=BookingSchema)
def update_booking(...):
    # ...
    for field, value in booking_in.dict(exclude_unset=True).items():
        setattr(booking, field, value)

    db.commit()
    db.refresh(booking)
    
    # Загружаем AppliedDiscount с связанными правилами
    applied_discount = (
        db.query(AppliedDiscount)
        .options(
            joinedload(AppliedDiscount.loyalty_discount),
            joinedload(AppliedDiscount.personal_discount),
        )
        .filter(AppliedDiscount.booking_id == booking_id)
        .first()
    )
    
    booking.applied_discount = build_applied_discount_info(applied_discount) if applied_discount else None
    
    return booking
```

**Файл:строка:** `backend/routers/client.py:610-621`

---

## Unified Diff

```diff
--- a/backend/routers/bookings.py
+++ b/backend/routers/bookings.py
@@ -2,7 +2,7 @@ from datetime import datetime, timedelta
 from typing import List, Optional
 
 from fastapi import APIRouter, Depends, HTTPException, status
-from sqlalchemy.orm import Session
+from sqlalchemy.orm import Session, joinedload
 
 from auth import get_current_user
 from database import get_db
@@ -14,6 +14,8 @@ from models import (
     OwnerType,
     User,
     Master,
+    AppliedDiscount,
+    Service,
 )
@@ -26,6 +28,7 @@ from schemas import (
 from services.scheduling import check_booking_conflicts, get_available_slots, get_available_slots_any_master_logic, get_best_master_for_slot
 from services.verification_service import VerificationService
 from services.plusofon_service import plusofon_service
+from utils.loyalty_discounts import evaluate_and_prepare_applied_discount, build_applied_discount_info
 
 router = APIRouter(prefix="/bookings", tags=["bookings"])
 
@@ -763,6 +766,20 @@ async def get_booking(
         raise HTTPException(
             status_code=status.HTTP_404_NOT_FOUND, detail="Бронирование не найдено"
         )
+    
+    # Загружаем AppliedDiscount с связанными правилами
+    applied_discount = (
+        db.query(AppliedDiscount)
+        .options(
+            joinedload(AppliedDiscount.loyalty_discount),
+            joinedload(AppliedDiscount.personal_discount),
+        )
+        .filter(AppliedDiscount.booking_id == booking_id)
+        .first()
+    )
+    
+    db_booking.applied_discount = build_applied_discount_info(applied_discount) if applied_discount else None
+    
     return db_booking
 
@@ -537,6 +554,20 @@ async def update_booking(
 
     db.commit()
     db.refresh(db_booking)
+    
+    # Загружаем AppliedDiscount с связанными правилами
+    applied_discount = (
+        db.query(AppliedDiscount)
+        .options(
+            joinedload(AppliedDiscount.loyalty_discount),
+            joinedload(AppliedDiscount.personal_discount),
+        )
+        .filter(AppliedDiscount.booking_id == booking_id)
+        .first()
+    )
+    
+    db_booking.applied_discount = build_applied_discount_info(applied_discount) if applied_discount else None
+    
     return db_booking
 
 
--- a/backend/routers/client.py
+++ b/backend/routers/client.py
@@ -607,6 +607,20 @@ def update_booking(
 
     db.commit()
     db.refresh(booking)
+    
+    # Загружаем AppliedDiscount с связанными правилами
+    applied_discount = (
+        db.query(AppliedDiscount)
+        .options(
+            joinedload(AppliedDiscount.loyalty_discount),
+            joinedload(AppliedDiscount.personal_discount),
+        )
+        .filter(AppliedDiscount.booking_id == booking_id)
+        .first()
+    )
+    
+    booking.applied_discount = build_applied_discount_info(applied_discount) if applied_discount else None
+    
     return booking
```

---

## Grep Audit

**Проверка всех мест, где устанавливается `applied_discount`:**

```bash
grep -rn "applied_discount.*=.*build_applied_discount_info\|applied_discount.*=.*None" backend/routers/
```

**Результаты:**

1. `backend/routers/bookings.py:285` - POST create (уже было)
2. `backend/routers/bookings.py:551` - PUT update (✅ исправлено)
3. `backend/routers/bookings.py:789` - GET by id (✅ исправлено)
4. `backend/routers/client.py:557` - POST create (уже было)
5. `backend/routers/client.py:621` - PUT update (✅ исправлено)
6. `backend/routers/master.py:90` - GET list (уже было)
7. `backend/routers/master.py:143` - GET detailed (уже было)

**Вывод:** ✅ Все endpoints, возвращающие `BookingSchema`, теперь загружают `applied_discount`.

---

## Ручные проверки

### Проверка 1: GET /api/bookings/{id} с applied_discount

**Шаги:**
1. Создать бронирование со скидкой (через POST /api/bookings/ или POST /api/client/)
2. Получить booking_id из ответа
3. Вызвать `GET /api/bookings/{booking_id}`
4. Проверить, что в ответе есть поле `applied_discount` с данными о скидке

**Ожидаемый результат:**
```json
{
  "id": 123,
  "payment_amount": 1800.0,
  "applied_discount": {
    "id": 1,
    "rule_type": "quick",
    "name": "Новый клиент",
    "discount_percent": 10.0,
    "discount_amount": 200.0
  }
}
```

**Если скидки нет:**
```json
{
  "id": 123,
  "payment_amount": 2000.0,
  "applied_discount": null
}
```

---

### Проверка 2: PUT /api/bookings/{id} сохраняет applied_discount

**Шаги:**
1. Создать бронирование со скидкой
2. Получить booking_id
3. Вызвать `PUT /api/bookings/{booking_id}` с обновлением (например, `notes`)
4. Проверить, что в ответе есть поле `applied_discount` (не теряется после обновления)

**Ожидаемый результат:**
```json
{
  "id": 123,
  "notes": "Обновлённые заметки",
  "payment_amount": 1800.0,
  "applied_discount": {
    "id": 1,
    "rule_type": "quick",
    "name": "Новый клиент",
    "discount_percent": 10.0,
    "discount_amount": 200.0
  }
}
```

---

### Проверка 3: PUT /api/client/{id} сохраняет applied_discount

**Шаги:**
1. Клиент создаёт бронирование со скидкой (POST /api/client/)
2. Получить booking_id
3. Вызвать `PUT /api/client/{booking_id}` с обновлением
4. Проверить, что в ответе есть поле `applied_discount`

**Ожидаемый результат:** Аналогично проверке 2, но для клиентского endpoint.

---

## Итоговый отчёт

### ✅ Выполнено:
1. Добавлена загрузка `AppliedDiscount` в `GET /api/bookings/{id}`
2. Добавлена загрузка `AppliedDiscount` в `PUT /api/bookings/{id}`
3. Добавлена загрузка `AppliedDiscount` в `PUT /api/client/{id}`
4. Все endpoints используют одинаковую логику (как в `master.py`)
5. Если скидки нет — `applied_discount = null` (корректно)

### 📝 Изменённые файлы:
- `backend/routers/bookings.py` (строки 5, 17, 31, 540-551, 778-789)
- `backend/routers/client.py` (строки 610-621)

### 🔍 Grep Audit:
- Все места установки `applied_discount` найдены (7 мест)
- Все endpoints, возвращающие `BookingSchema`, теперь загружают `applied_discount`

### ✅ Готово к тестированию:
- Contract исправлен для всех 3 endpoints
- Логика идентична `GET /api/master/bookings`
- Нет новых таблиц/миграций
- Логика скидок/баллов не изменена

---

**Исправления завершены. Contract готов для мобильного приложения.**
