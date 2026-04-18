# Унификация UI заметок — popover вместо модалок

## Изменения

### 1. Новый компонент `frontend/src/components/ui/NotePopover.jsx`
- Общий popover для заметки о клиенте.
- Режимы: `clientKey` (fetch из GET /api/master/clients/{client_key}) или `content` (показать текст напрямую).
- Закрытие: клик вне, Esc, повторный клик по триггеру (.note-trigger-btn).
- Без overlay/backdrop.

### 2. `frontend/src/components/MasterClients.jsx`
- Удалён локальный NotePopover.
- Импорт общего `NotePopover` из `./ui/NotePopover`.
- Иконка: `text-gray-900 hover:text-gray-700`, `no-underline`.

### 3. `frontend/src/components/AllBookingsModal.jsx`
- Модалка заметки заменена на `NotePopover`.
- Состояние `notePopover` вместо `noteModalContent`.
- `handleNoteClick(booking, e)` — toggle по клику, передаётся `content` из booking.
- Иконка: `note-trigger-btn text-gray-900`, `no-underline`.

### 4. `frontend/src/components/MasterDashboardStats.jsx`
- Модалка заметки заменена на `NotePopover`.
- `handleNoteClick`, `notePopover` — в блоках «Ближайшие» и «Прошедшие».

### 5. Иконки (i) в других местах
- `PastAppointments.jsx`, `PopupCard.jsx`, `MasterScheduleCalendar.jsx`: `text-blue-500` → `text-gray-900`, добавлен `no-underline` (остаётся tooltip по hover).

### 6. `frontend/src/components/ui/index.js`
- Экспорт `NotePopover`.

---

## QA-чеклист

1. **Дашборд → «Все записи»** — клик по (i) у строки с заметкой → открывается popover рядом с иконкой, без модалки.
2. **Клиенты** — клик по (i) → popover (поведение не изменилось).
3. **Дашборд → Ближайшие / Прошедшие** — клик по (i) → popover.
4. Закрытие: клик вне, Esc, повторный клик по (i).
5. Иконка (i): чёрная/тёмно-серая, без подчёркивания при hover.
6. `PastAppointments`, `PopupCard`, `MasterScheduleCalendar` — иконка серая, tooltip по hover (без изменений логики).
