# Диагностический отчёт: прошедшие записи в модалке «Будущие записи» (WEB)

**Дата:** 2025-02-07  
**Задача:** Расследование без исправлений. Прошедшая по времени запись (пример: 07.02 10:00) отображается в «Все записи → Будущие» вместо «Прошедшие».

---

## 1. Резюме: источник проблемы

**Проблема на BACKEND.**

Прошедшие записи попадают в ответ `GET /api/master/bookings/future` из-за **некорректного условия фильтрации** для активных (не отменённых) бронирований: используется сравнение с началом дня (`today_start`), а не с текущим моментом (`now_utc`).

---

## 2. Воспроизведение

### Сценарий

1. Текущее время на сервере: например, **07.02.2025 14:00 UTC** (17:00 Москва).
2. Запись: **07.02.2025 10:00** (любой статус: created, confirmed, awaiting_confirmation).
3. Открыть WEB → «Все записи» → режим «Будущие» (future).
4. Запись 07.02 10:00 **появляется** в списке, хотя 10:00 уже прошло.

### Проверка источника данных

- **Network:** ответ `GET /api/master/bookings/future?page=1&limit=20`
- **Результат:** проблемная запись **есть в JSON** ответа future.
- **Вывод:** данные приходят с backend; frontend не объединяет/не путает future и past.

---

## 3. Локализация: backend

### Файл и маршрут

```
backend/routers/master.py
@router.get("/bookings/future")
def get_future_bookings_paginated(...)
```

Строки 224–266.

### Текущая логика фильтрации

```python
now_utc = datetime.utcnow()
today_start = now_utc.replace(hour=0, minute=0, second=0, microsecond=0)

# Для АКТИВНЫХ (created/confirmed/awaiting_confirmation):
Booking.start_time >= today_start   # ← ОШИБКА

# Для ОТМЕНЁННЫХ:
Booking.start_time > now_utc
```

### Проблема

Для **активных** бронирований условие — `start_time >= today_start` (полночь сегодня в UTC), а не `start_time > now_utc`.

Пример:

- `now_utc` = 07.02.2025 14:00:00 UTC  
- `today_start` = 07.02.2025 00:00:00 UTC  
- Запись: `start_time` = 07.02.2025 10:00:00 UTC  

Проверка: `10:00 >= 00:00` → **True** → запись попадает в future, хотя 10:00 уже в прошлом.

### Сравнение с past-appointments

```python
# past-appointments (строка 378):
Booking.start_time < datetime.utcnow()   # корректно
```

### Поля и timezone

- `Booking.start_time`: `Column(DateTime)` — naive datetime, без timezone.
- Сравнение: `datetime.utcnow()` (UTC).
- Ответ API: `booking.start_time.isoformat()` — ISO без суффикса `Z` (например, `2025-02-07T10:00:00`).
- Frontend: `new Date(str)` — ISO без `Z` трактуется как **локальное** время. Для диагностики будущего vs прошлого это не главное: ошибка в backend-фильтре.

---

## 4. Frontend: анализ

### AllBookingsModal.jsx

- Future: `apiGet('/api/master/bookings/future?page=...')` → `setItems(bookings)`.
- Past: `apiGet('/api/master/past-appointments?page=...')` → `setItems(appointments)`.
- Разные endpoints, разные состояния.
- При смене `initialMode` вызывается `loadPage(1)` с новым `mode`.
- **Объединения future+past нет.** Проблема в данных от backend.

### api.js

- Нет подмены путей и нет кэширования по ключу для этих запросов.

---

## 5. Гипотезы и проверка

### Гипотеза 1 (основная): неверное условие для активных записей

**Утверждение:** Для активных бронирований используется `>= today_start` вместо `> now_utc`.

**Доказательство:**

- Код (строки 256–258): `Booking.start_time >= today_start`.
- Любая запись сегодня после полуночи (включая уже прошедшие) проходит условие.

### Гипотеза 2: TZ-смещение

**Утверждение:** Ошибка может усиливаться из-за различий timezone.

**Проверка:** Даже при едином UTC ошибка сохраняется: `today_start` отсекает только «вчера и ранее», а не «момент сейчас». TZ может влиять на отображение, но причина — именно сравнение с `today_start`.

### Гипотеза 3: Frontend merge/cache

**Утверждение:** Frontend может смешивать future и past.

**Проверка:** Код использует только данные из ответа future; объединения с past нет. Гипотеза опровергнута.

---

## 6. Точное место для исправления (без правки в рамках задачи)

### Backend

**Файл:** `backend/routers/master.py`  
**Функция:** `get_future_bookings_paginated`  
**Строки:** 249–265  

Текущее условие для активных:

```python
and_(
    Booking.start_time >= today_start,  # ← заменить
    Booking.status.notin_(cancelled_statuses),
),
```

Рекомендуемое направление изменения (только как предложение, не реализация):

- для активных: `Booking.start_time > now_utc` (или `>=` с учётом границы «сейчас»);
- для отменённых: оставить `Booking.start_time > now_utc`.

---

## 7. Логирование (реализовано, dev-only)

В `get_future_bookings_paginated` добавлено (при `logging.DEBUG`):

- **FUTURE_REQ:** один раз на запрос — `request_id`, `now_utc`, `today_start`, TZ.
- **FUTURE_SQL:** скомпилированный base_query (WHERE с `today_start`).
- **FUTURE_ROW:** для первых 20 записей — `id`, `start_time`, `status`, `is_past_by_now`, `is_after_today_start`.
- **FUTURE_PROOF:** для записей с `is_past_by_now=True` (или `DEBUG_FUTURE_BOOKING_ID`) — полная трассировка.

---

## 8. Рекомендации по критерию future vs past

1. **Единый критерий:** `start_time > now` (или `>=` при явном определении границы).
2. **Часовой пояс:** хранить и сравнивать в UTC; при отображении использовать timezone мастера.
3. **Консистентность:** future и past должны быть взаимоисключающими и покрывать все записи по `start_time` относительно `now`.

---

## 9. Proof (доказательство причины)

### 9.1 Контрольная запись

При воспроизведении в WEB → «Все записи» → Будущие:
- В Network → `GET /api/master/bookings/future?page=1&limit=20` → взять `booking_id`, `start_time`, `status` из JSON.
- Пример: `booking_id=123`, `start_time="2025-02-07T10:00:00"`, `status="confirmed"`.

Для точечного лога контрольной записи задать env:
```
DEBUG_FUTURE_BOOKING_ID=123
```

### 9.2 Логи (при `logging.DEBUG`)

**Один раз на запрос:**
```
FUTURE_REQ request_id=a1b2c3d4 now_utc=2025-02-07 14:00:00 today_start=2025-02-07 00:00:00 TZ= tzname=('UTC', 'UTC')
```

**SQL WHERE-условие:**
```
FUTURE_SQL request_id=a1b2c3d4 base_query=SELECT ... FROM bookings WHERE ... 
  (start_time >= '2025-02-07 00:00:00' AND status NOT IN (...)) 
  OR (start_time > '2025-02-07 14:00:00' AND status IN (...))
```

**По каждой записи (первые 20):**
```
FUTURE_ROW request_id=a1b2c3d4 id=123 start_time=2025-02-07 10:00:00 status=confirmed is_past_by_now=True is_after_today_start=True
```

**Proof для прошедшей записи:**
```
FUTURE_PROOF request_id=a1b2c3d4 bid=123 start_time=2025-02-07 10:00:00 now_utc=2025-02-07 14:00:00 today_start=2025-02-07 00:00:00 start_time>=today_start=True start_time>now_utc=False
```

Интерпретация: `is_past_by_now=True`, `is_after_today_start=True`, `start_time>now_utc=False` → запись в прошлом, но проходит фильтр, т.к. условие активных использует `>= today_start`.

### 9.3 Интеграционный тест

**Файл:** `backend/tests/test_future_includes_past_proof.py`

**Тест:** `test_future_includes_past_due_to_today_start_filter`

- Создаются 2 записи: 10:00 UTC (прошлая) и 18:00 UTC (будущая) при now=14:00 UTC.
- `datetime.utcnow` замокан на 14:00 UTC.
- Запрос `GET /api/master/bookings/future`.
- **ASSERT:** запись 10:00 присутствует в ответе.
- **Вывод:** подтверждается, что фильтр использует `today_start`, а не `now_utc`.

Запуск:
```bash
cd backend && python3 -m pytest tests/test_future_includes_past_proof.py -v
```

### 9.4 VERDICT

**Причина:** фильтрация активных bookings в `/api/master/bookings/future` использует границу `today_start` (00:00 UTC), а не `now_utc`; поэтому любые записи «сегодня» после полуночи возвращаются, даже если они уже в прошлом относительно `now_utc`.

---

## 10. Чеклист для верификации после исправления

- [ ] Запись 07.02 10:00 при текущем времени 07.02 14:00 **не** возвращается `/api/master/bookings/future`.
- [ ] Та же запись **возвращается** `/api/master/past-appointments`.
- [ ] В WEB модалка «Будущие» не показывает прошедшие записи.
- [ ] В WEB модалка «Прошедшие» показывает эти записи.
