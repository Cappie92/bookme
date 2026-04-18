# Diff-summary: Web модуль «Клиенты» и отображение имени/телефона/заметки

## Изменённые файлы

### 1. `frontend/src/components/MasterClients.jsx`
- **Список клиентов**: один ряд `flex items-center gap-2` — имя + телефон (серым) + иконка (i) при has_note + кнопка карандаша
- Иконка (i) только при `has_note`, по клику — модалка с заметкой (или «Заметки нет»)
- `handleShowNote`: при пустой заметке выводится «Заметки нет»
- Dev-лог: `[MasterClients] list sample` (master_client_name, client_phone, has_note)

### 2. `frontend/src/components/MasterDashboardStats.jsx`
- **Ближайшие записи**: `flex items-center justify-end gap-1.5` — client_display_name + client_phone + (i)
- **Прошедшие записи**: `flex items-center gap-1.5` — то же
- Иконка (i) только при `has_client_note && (client_note || '').trim()`
- Dev-лог: `[MasterDashboardStats] next_bookings_list sample` (client_display_name, client_phone, has_client_note, client_note)

### 3. `frontend/src/components/AllBookingsModal.jsx`
- **Карточки**: `flex items-center gap-1.5` — client_display_name + client_phone + (i)
- Иконка (i) при `has_client_note && (client_note || '').trim()`
- React key: `String(booking.id ?? \`b-${index}-${booking.start_time}\`)`
- Dev-лог: `[AllBookingsModal] future sample`

### 4. `docs/CLIENTS_MODULE_MANUAL_TEST.md`
- Добавлен чеклист Web: список клиентов, дашборд, «Все записи», полный сценарий

---

## Команды для проверки

```bash
# Backend
cd backend && uvicorn main:app --reload --port 8000

# Frontend (другой терминал)
cd frontend && npm run dev
```

### curl (опционально)

```bash
TOKEN=$(curl -s -X POST "http://localhost:8000/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone": "+79990000006", "password": "test123"}' | jq -r '.access_token')

# Пример полей из API
curl -s "http://localhost:8000/api/master/dashboard/stats?period=week" \
  -H "Authorization: Bearer $TOKEN" | jq '.next_bookings_list[0] | {client_display_name, client_phone, has_client_note}'

curl -s "http://localhost:8000/api/master/bookings/future?page=1&limit=1" \
  -H "Authorization: Bearer $TOKEN" | jq '.bookings[0] | {client_display_name, client_phone, has_client_note}'
```

### Ручная проверка в браузере

1. Логин как мастер (+79990000006 / test123)
2. **Клиенты**: одна строка на клиента (имя + телефон + (i) при заметке)
3. **Дашборд** → «Ближайшие записи»: имя, телефон, (i) в один ряд
4. **Все записи**: фильтры, имя + телефон в карточках, нет duplicate key warning
5. В DevTools Console — логи `[MasterDashboardStats]`, `[AllBookingsModal]`, `[MasterClients]`
