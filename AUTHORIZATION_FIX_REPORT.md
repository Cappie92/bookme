# Исправление авторизации в GET/PUT /api/bookings/{id}

**Дата:** 2026-01-21  
**Проблема:** Неверная проверка доступа — сравнивались `Booking.master_id` и `Booking.salon_id` напрямую с `current_user.id`, хотя они ссылаются на `masters.id` и `salons.id`, а не на `users.id`.

---

## Unified Diff

### 1. Добавлены импорты (строки 9-19)

```diff
--- a/backend/routers/bookings.py
+++ b/backend/routers/bookings.py
@@ -9,6 +9,8 @@ from models import (
     User,
     Master,
     AppliedDiscount,
     Service,
+    Salon,
+    SalonBranch,
 )
```

---

### 2. GET /api/bookings/{id} (строки 805-828)

```diff
--- a/backend/routers/bookings.py
+++ b/backend/routers/bookings.py
@@ -805,6 +805,22 @@ async def get_booking(
     # Проверка доступа по роли
     if current_user.role == "client":
         if db_booking.client_id != current_user.id:
             raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Доступ запрещён")
     elif current_user.role == "master":
-        if db_booking.master_id != current_user.id:
+        master = db.query(Master).filter(Master.user_id == current_user.id).first()
+        if not master:
+            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Профиль мастера не найден")
+        if db_booking.master_id != master.id:
             raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Доступ запрещён")
     elif current_user.role == "salon":
-        if db_booking.salon_id != current_user.id:
+        # Проверяем, является ли пользователь владельцем салона
+        salon = db.query(Salon).filter(Salon.user_id == current_user.id).first()
+        if salon:
+            if db_booking.salon_id != salon.id:
+                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Доступ запрещён")
+        else:
+            # Проверяем, является ли пользователь менеджером филиала
+            branch = db.query(SalonBranch).filter(
+                SalonBranch.manager_id == current_user.id,
+                SalonBranch.salon_id == db_booking.salon_id
+            ).first()
+            if not branch or (db_booking.branch_id and db_booking.branch_id != branch.id):
                 raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Доступ запрещён")
```

---

### 3. PUT /api/bookings/{id} (строки 521-544)

```diff
--- a/backend/routers/bookings.py
+++ b/backend/routers/bookings.py
@@ -521,6 +521,22 @@ async def update_booking(
     # Проверка доступа по роли
     if current_user.role == "client":
         if db_booking.client_id != current_user.id:
             raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Доступ запрещён")
     elif current_user.role == "master":
-        if db_booking.master_id != current_user.id:
+        master = db.query(Master).filter(Master.user_id == current_user.id).first()
+        if not master:
+            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Профиль мастера не найден")
+        if db_booking.master_id != master.id:
             raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Доступ запрещён")
     elif current_user.role == "salon":
-        if db_booking.salon_id != current_user.id:
+        # Проверяем, является ли пользователь владельцем салона
+        salon = db.query(Salon).filter(Salon.user_id == current_user.id).first()
+        if salon:
+            if db_booking.salon_id != salon.id:
+                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Доступ запрещён")
+        else:
+            # Проверяем, является ли пользователь менеджером филиала
+            branch = db.query(SalonBranch).filter(
+                SalonBranch.manager_id == current_user.id,
+                SalonBranch.salon_id == db_booking.salon_id
+            ).first()
+            if not branch or (db_booking.branch_id and db_booking.branch_id != branch.id):
                 raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Доступ запрещён")
```

---

## Логика проверки доступа

### Клиент
- ✅ `db_booking.client_id == current_user.id` (без изменений)

### Мастер
1. Получить `Master` по `Master.user_id == current_user.id`
2. Если мастер не найден → `404 Not Found`
3. Проверить `db_booking.master_id == master.id`
4. Если не совпадает → `403 Forbidden`

### Салон
1. Попытка 1: Получить `Salon` по `Salon.user_id == current_user.id` (владелец)
   - Если найден: проверить `db_booking.salon_id == salon.id`
   - Если не совпадает → `403 Forbidden`
2. Попытка 2: Если владелец не найден, проверить менеджера филиала
   - Получить `SalonBranch` по `SalonBranch.manager_id == current_user.id` и `SalonBranch.salon_id == db_booking.salon_id`
   - Если филиал не найден → `403 Forbidden`
   - Если у брони есть `branch_id`, проверить `db_booking.branch_id == branch.id`
   - Если не совпадает → `403 Forbidden`

---

## Smoke-тесты (3 проверки)

### 1. Client OK

**Сценарий:** Клиент получает доступ к своей брони

```bash
# 1. Создать бронирование от имени клиента
CLIENT_TOKEN="<CLIENT_TOKEN>"
BOOKING_ID="<BOOKING_ID>"  # Бронирование, где client_id == current_user.id

# 2. GET запрос
curl -X GET "http://localhost:8000/api/bookings/${BOOKING_ID}" \
  -H "Authorization: Bearer ${CLIENT_TOKEN}"

# Ожидаемый результат: 200 OK с данными бронирования
```

**Проверка:** `jq '.client_id'` должен совпадать с `current_user.id` из токена

---

### 2. Master OK

**Сценарий:** Мастер получает доступ к своей брони

```bash
# 1. Получить master_id из профиля мастера
MASTER_TOKEN="<MASTER_TOKEN>"
MASTER_USER_ID=$(curl -s -X GET "http://localhost:8000/api/auth/users/me" \
  -H "Authorization: Bearer ${MASTER_TOKEN}" | jq -r '.id')

# 2. Получить master.id через Master.user_id
MASTER_ID=$(curl -s -X GET "http://localhost:8000/api/master/profile" \
  -H "Authorization: Bearer ${MASTER_TOKEN}" | jq -r '.master_profile.id')

# 3. Найти бронирование с master_id == MASTER_ID
BOOKING_ID="<BOOKING_ID>"  # Бронирование, где master_id == MASTER_ID

# 4. GET запрос
curl -X GET "http://localhost:8000/api/bookings/${BOOKING_ID}" \
  -H "Authorization: Bearer ${MASTER_TOKEN}"

# Ожидаемый результат: 200 OK с данными бронирования
```

**Проверка:** `jq '.master_id'` должен совпадать с `MASTER_ID`

---

### 3. Чужой Master Forbidden

**Сценарий:** Мастер НЕ получает доступ к чужой брони

```bash
# 1. Получить токен мастера A
MASTER_A_TOKEN="<MASTER_A_TOKEN>"
MASTER_A_ID=$(curl -s -X GET "http://localhost:8000/api/master/profile" \
  -H "Authorization: Bearer ${MASTER_A_TOKEN}" | jq -r '.master_profile.id')

# 2. Получить токен мастера B
MASTER_B_TOKEN="<MASTER_B_TOKEN>"
MASTER_B_ID=$(curl -s -X GET "http://localhost:8000/api/master/profile" \
  -H "Authorization: Bearer ${MASTER_B_TOKEN}" | jq -r '.master_profile.id')

# 3. Найти бронирование мастера B
BOOKING_ID="<BOOKING_ID>"  # Бронирование, где master_id == MASTER_B_ID

# 4. Попытка получить доступ от имени мастера A
curl -X GET "http://localhost:8000/api/bookings/${BOOKING_ID}" \
  -H "Authorization: Bearer ${MASTER_A_TOKEN}"

# Ожидаемый результат: 403 Forbidden
# Response: {"detail": "Доступ запрещён"}
```

**Проверка:** Статус код должен быть `403`, а не `200`

---

## Дополнительные проверки (опционально)

### Salon Owner OK

```bash
SALON_TOKEN="<SALON_OWNER_TOKEN>"
SALON_ID=$(curl -s -X GET "http://localhost:8000/api/salon/profile" \
  -H "Authorization: Bearer ${SALON_TOKEN}" | jq -r '.id')

BOOKING_ID="<BOOKING_ID>"  # Бронирование, где salon_id == SALON_ID

curl -X GET "http://localhost:8000/api/bookings/${BOOKING_ID}" \
  -H "Authorization: Bearer ${SALON_TOKEN}"

# Ожидаемый результат: 200 OK
```

### Salon Branch Manager OK

```bash
BRANCH_MANAGER_TOKEN="<BRANCH_MANAGER_TOKEN>"
BRANCH_ID=$(curl -s -X GET "http://localhost:8000/api/salon/my-managed-branches" \
  -H "Authorization: Bearer ${BRANCH_MANAGER_TOKEN}" | jq -r '.[0].id')

BOOKING_ID="<BOOKING_ID>"  # Бронирование, где branch_id == BRANCH_ID

curl -X GET "http://localhost:8000/api/bookings/${BOOKING_ID}" \
  -H "Authorization: Bearer ${BRANCH_MANAGER_TOKEN}"

# Ожидаемый результат: 200 OK
```

---

## Итоговый вывод

✅ **Исправлено:**
1. Добавлены импорты `Salon` и `SalonBranch`
2. Исправлена проверка доступа для мастера (через `Master.user_id`)
3. Исправлена проверка доступа для салона (через `Salon.user_id` или `SalonBranch.manager_id`)
4. Добавлена проверка на отсутствие профиля мастера (404)

✅ **Готово к тестированию:**
- Client OK
- Master OK
- Чужой Master Forbidden
- Salon Owner OK (опционально)
- Salon Branch Manager OK (опционально)

---

**Файлы изменены:**
- `backend/routers/bookings.py` (строки 9-19, 805-828, 521-544)
