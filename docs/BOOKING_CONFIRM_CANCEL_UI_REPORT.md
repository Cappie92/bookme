# Отчёт: UI/UX подтверждения и отмены записей

**Обновлено:** Доработка контракта, визуал и layout.

## 1. Список изменённых файлов

### Mobile
| Файл | Изменения |
|------|-----------|
| `mobile/src/components/bookings/BookingCardCompact.tsx` | Убрана левая цветная полоса, уменьшены padding/шрифты, компактнее |
| `mobile/src/utils/bookingOutcome.ts` | Добавлена `canConfirmBooking()` |
| `mobile/app/master/schedule.tsx` | Загрузка `getMasterSettings`, передача `masterSettings` в WeekView |
| `mobile/src/components/schedule/WeekView.tsx` | Проп `masterSettings`, передача в DayDrawer |
| `mobile/src/components/schedule/DayDrawer.tsx` | `masterSettings`, `handleConfirm`, кнопка «Подтвердить» в BookingCardCompact |
| `mobile/src/components/dashboard/AllBookingsModal.tsx` | Крестик с safe-area, zIndex 9999, hitSlop 20; убрана кнопка «Закрыть» |

### Web
| Файл | Изменения |
|------|-----------|
| `frontend/src/utils/bookingOutcome.js` | Добавлена `canConfirmBooking()` |
| `frontend/src/components/MasterDashboardStats.jsx` | `loadMasterSettings`, кнопки Подтвердить/Отмена для «Прошедшие записи» |
| `frontend/src/components/PopupCard.jsx` | Кнопка «Подтвердить», `canConfirmBooking`, `handleConfirmClick` |
| `frontend/src/components/MasterScheduleCalendar.jsx` | Проп `masterSettings`, передача в PopupCard |
| `frontend/src/pages/MasterDashboard.jsx` | Передача `masterSettings` в MasterScheduleCalendar |

### Backend
- Без изменений. Используется существующий `POST /api/master/accounting/confirm-booking/{booking_id}`.

---

## 2. Backend endpoint confirm

**Путь:** `POST /api/master/accounting/confirm-booking/{booking_id}`  
**Файл:** `backend/routers/accounting.py` (строки 684–817)  
**Параметры:** `booking_id` (path)  
**Условия:** запись принадлежит мастеру, статус CREATED или AWAITING_CONFIRMATION, `start_time <= now`  
**Ответ:** `{ "message": "…", "confirmed_income": … }`

---

## 3. Инструкция ручной проверки

### Web
1. Войти как мастер с ручным подтверждением (`auto_confirm_bookings = false`).
2. Дашборд → «Прошедшие записи»: для прошлой записи CREATED/AWAITING_CONFIRMATION — кнопки «Подтвердить» и «Отменить».
3. «Все записи» → для прошлой записи — «Подтвердить» и «Отменить».
4. Расписание → клик по записи → PopupCard: «Подтвердить» и «Отменить».
5. Нажать «Подтвердить» → статус меняется, список обновляется без перезагрузки.

### Mobile
1. Войти как мастер с ручным подтверждением.
2. Дашборд → «Прошедшие записи»: компактные карточки без цветных полос, кнопки «Подтвердить» и «Отмена».
3. «Все записи»: закрытие только крестиком (без кнопки «Закрыть»), крестик вверху справа.
4. Расписание → выбор дня → DayDrawer: карточки в том же стиле, «Подтвердить» и «Отмена».
5. Нажать «Подтвердить» → статус обновляется, календарь перезагружается.

---

## 4. Логика canConfirmBooking

`canConfirmBooking(booking, master) = needsOutcome(booking, master)`:
- `requiresManualConfirmation(master)` — `auto_confirm_bookings === false || null`
- запись в прошлом (`start_time < now`)
- статус `created` или `awaiting_confirmation`

## 5. Изменения визуала (последнее обновление)

- **Статус «Создано»** — нейтральный серый (#757575), без голубой подсветки
- **StatusBadge** — CREATED и AWAITING_CONFIRMATION используют #757575
- **PopupCard (web)** — точка статуса для created/awaiting → bg-gray-400
- **BookingCardCompact (mobile)** — actionRow: flexWrap: 'nowrap', height: 36, minWidth на кнопках, alignItems: 'center'
