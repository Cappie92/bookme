# Отчёт: «На подтверждение» вместо «Подтверждено»

## Шаблон диагностики конкретной записи

Для проблемной записи выполните:

```bash
cd backend
python scripts/diagnose_booking_status.py <booking_id>
```

Вывод:
```
============================================================
Диагностика записи #<id>
============================================================
  booking_id:     <id>
  start_time:     <datetime> (UTC)
  status (БД):    <created|confirmed|awaiting_confirmation|...>
  effective:      <effective_status>
  is_future:      True/False
  is_past:        True/False

  [Объяснение причины "На подтверждение" если применимо]
============================================================
```

Интерпретация:
- **status (БД) = awaiting_confirmation, is_future = True** → legacy (до миграции). Миграция `20260128_fix_future_aw` исправляет.
- **effective = awaiting_confirmation, is_past = True** → ожидаемо, needs post-visit outcome.
- **effective = confirmed** → «Подтверждено», кнопка post-visit confirm доступна (для прошлых).

---

## 1. Источник awaiting_confirmation и «На подтверждение»

### Где формируется статус

| Место | Файл | Назначение |
|-------|------|------------|
| Вычисляемый статус | `backend/utils/booking_status.py` | `get_effective_booking_status()` — CREATED + past → AWAITING_CONFIRMATION |
| Хранение в БД | `bookings.status` | Реальное поле, не вычисляемое |
| Лейбл «На подтверждение» | `backend/utils/booking_status.py` | `get_status_display_name()` — `AWAITING_CONFIRMATION` → «На подтверждение» |
| Лейбл в master API | `backend/routers/master.py` | `status_color_map`, передача `booking.status` в ответ |

### Кто переводит в awaiting_confirmation

1. **Вычисляемый статус** (`get_effective_booking_status`):
   - **До правки:** только при `status == CREATED` и `current_time >= start_time + 1 min`.
   - **После правки:** то же самое, но явно — CONFIRMED и другие статусы не затрагиваются.
2. **Явное сохранение в БД:**
   - `POST /api/master/accounting/update-booking-status/{id}?new_status=awaiting_confirmation`
   - Раньше pre-visit confirm вызывал именно этот вариант (старая логика).

---

## 2. Проверка: не переводим ли CONFIRMED в awaiting_confirmation

### До правки

В `get_effective_booking_status` логика была такая:

```python
if booking.status == BookingStatus.CREATED:
    if current_time >= transition_time:
        booking.status = BookingStatus.AWAITING_CONFIRMATION
        return ...
return booking.status
```

То есть CONFIRMED не переводился в AWAITING_CONFIRMATION, но это не было явно зафиксировано.

### После правки

Добавлен ранний возврат:

```python
if booking.status != BookingStatus.CREATED:
    return booking.status
```

Теперь только CREATED может быть заменён на AWAITING_CONFIRMATION. CONFIRMED и остальные статусы всегда возвращаются без изменений.

### Ожидаемое поведение для прошлых записей

| Статус в БД | start_time < now | Результат |
|-------------|------------------|-----------|
| CREATED     | да               | AWAITING_CONFIRMATION (нужен post-visit) |
| CONFIRMED   | да               | CONFIRMED («Подтверждено») |
| CONFIRMED   | нет              | CONFIRMED |
| COMPLETED   | —                | COMPLETED |
| CANCELLED   | —                | CANCELLED |

---

## 3. Почему конкретная запись показывает «На подтверждение»

### Вариант A: артефакт старой логики (наиболее вероятно)

- Pre-visit confirm вызывал `new_status=awaiting_confirmation`.
- В БД сохранён `status = 'awaiting_confirmation'`.
- `get_effective_booking_status` его не трогает и возвращает как есть.
- Отсюда — «На подтверждение» в UI.

### Вариант B: ошибка при сохранении confirmed

- Если статус в БД `created` и `start_time` в прошлом, то `get_effective_booking_status` вернёт AWAITING_CONFIRMATION.
- Но это не подходит под ситуацию «подтверждал несколько фиксов назад» — тогда confirm должен был сохранить CONFIRMED или (в старой логике) awaiting_confirmation.

### Диагностика в БД

Для конкретной записи:

```sql
SELECT id, status, start_time, service_id, client_id 
FROM bookings 
WHERE id = <booking_id>;
```

- `status = 'awaiting_confirmation'` → артефакт старого pre-visit confirm.
- `status = 'created'` → подтверждение не дошло до БД или статус был сброшен.

### Ручное исправление артефакта

Если в БД `status = 'awaiting_confirmation'`, но по смыслу это pre-visit confirm:

```sql
UPDATE bookings 
SET status = 'confirmed' 
WHERE id = <booking_id> 
  AND status = 'awaiting_confirmation'
  AND start_time < datetime('now');  -- опционально: только прошедшие
```

---

## 4. Итог

| Вопрос | Ответ |
|--------|--------|
| Причина «На подтверждение» | Скорее всего `status = 'awaiting_confirmation'` в БД из старой логики pre-visit confirm, а не вычисляемый статус. |
| Это баг? | Раньше pre-visit confirm сохранял awaiting_confirmation — это архитектурная ошибка прошлого. Сейчас используется `new_status=confirmed`. |
| Что сделано | Добавлена явная защита в `get_effective_booking_status`: CONFIRMED не переводится в AWAITING_CONFIRMATION. |
| Файл | `backend/utils/booking_status.py` |

---

## 5. Чеклист проверки

1. Создать будущую запись со статусом CREATED.
2. Нажать «Подтвердить» (pre-visit).
3. Проверить:
   - В БД: `SELECT status FROM bookings WHERE id = X` → `confirmed`.
   - В ответе API: `status: "confirmed"`, лейбл «Подтверждено».
4. Дождаться, пока `start_time` станет в прошлом (или временно изменить в БД).
5. Открыть «Все записи» / дашборд.
6. Убедиться, что статус остаётся «Подтверждено», а не меняется на «На подтверждение».
7. Для прошлой confirmed-записи: кнопка post-visit «Подтвердить» должна быть доступна.
8. Будущие записи никогда не показывают «На подтверждение».
