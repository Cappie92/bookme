# Отчёт диагностики: «Подтвердить» не появляется + кнопка «Отмена» растягивает карточку

## 1) Контракт подтверждения (backend)

### Endpoint confirm
- **Метод:** `POST`
- **URL:** `/api/master/accounting/confirm-booking/{booking_id}`
- **Файл:** `backend/routers/accounting.py`, строки 684–817

### Условия backend
- Статусы: `CREATED` или `AWAITING_CONFIRMATION`
- **Только прошлые записи:** `booking.start_time <= datetime.utcnow()` (строки 722–726)
  - Для будущих возвращается 400: «Нельзя подтвердить будущую запись»
- Принадлежность мастеру: `Booking.master_id == master_row_id`

### Поле «ручное подтверждение»
- **Endpoint:** `GET /api/master/settings`
- **Поле:** `master.auto_confirm_bookings` (bool)
- `false` / `null` = ручной режим
- `true` = автоматический режим

### Contract gap
- Отдельного поля `requires_confirmation` в booking нет
- Логика на фронте: `master.auto_confirm_bookings === false` + статус + `start_time < now`

---

## 2) Почему «Подтвердить» не показывается

### Функция-гейт
- Mobile: `canConfirmBooking(booking, masterSettings?.master ?? null)` = `needsOutcome(...)`
- Web: `canConfirmBooking` / `needsOutcome` из `frontend/src/utils/bookingOutcome.js`

### Условия в `needsOutcome`
1. `requiresManualConfirmation(master)` → `auto_confirm_bookings === false || null`
2. `isPast(booking)` → `new Date(booking.start_time) < new Date()`
3. `status` в `['created', 'awaiting_confirmation']` (нижний регистр)

### Возможные причины `false`

| Условие | Причина |
|---------|---------|
| `master` = null | `masterSettings` не загружены или `masterSettings?.master` отсутствует |
| `auto_confirm_bookings === true` | В БД включён автоподтверждение |
| `past` = false | Ошибка формата `start_time`, timezone (UTC vs local) |
| `status` не совпадает | API отдаёт `CREATED`, а ожидается `created` (сейчас приводится к lowercase) |

### Debug-логи
В `canConfirmBooking` добавлен лог в `__DEV__`:
- `bookingId`, `status`, `statusNorm`, `statusOk`, `start_time`, `past`, `auto_confirm`, `requiresManual`, `result`

---

## 3) Layout кнопки «Отмена»

### Текущая структура `BookingCardCompact`
```
card (padding: 10)
  content (flex: 1)
    row1: [serviceName flex:1] [chip]
    clientLine
    metaLine
    priceLine
    actionRow (marginTop: 6, flexDirection: 'row', gap: 8)
      [confirmBtn height:36] [cancelBtn height:36]
```

### Возможные причины растягивания
- `marginTop: 6` у `actionRow` добавляет отступ
- Вертикальный стек без ограничения высоты
- `content` с `flex: 1` может растягиваться в родителе
- Нет двухколоночного layout: контент слева, chip + actions справа

### Добавленные логи
- `onLayout` на `card` и `actionRow` выводит высоты в консоль в `__DEV__`

---

## 4) Внесённые исправления

### Layout (BookingCardCompact)
- **Сделано:** двухколоночная сетка
  - `row` = flexDirection: 'row'
  - `left` = flex: 1 (название, клиент, дата/время, цена)
  - `right` = minWidth: 130 (chip сверху, actionRow снизу)
- Убраны marginTop и стили, которые растягивали карточку
- Кнопки: height: 32, paddingHorizontal: 10, gap: 6

### Debug-лог
- При `!result && statusOk && past` выводится лог — значит проблема в `master` или `auto_confirm_bookings`

---

## 5) Чеклист ручной проверки

**Mobile:**
1. Мастер с `auto_confirm_bookings = false`, есть прошлые записи со статусом created/awaiting_confirmation
2. Dashboard → «Прошедшие записи» → «Подтвердить» и «Отмена» в одной строке справа
3. «Все записи» → то же
4. Расписание → DayDrawer → то же
5. Карточки без лишней высоты, кнопки компактные

**Web:**
1. Dashboard → «Прошедшие записи» → «Подтвердить» и «Отменить»
2. «Все записи» → то же
3. Расписание → PopupCard → то же
