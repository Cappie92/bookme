# Diff-отчёт: клиентские alias/note и отображение имён (WEB)

## Изменённые файлы

### Backend

| Файл | Изменения |
|------|-----------|
| `backend/routers/accounting.py` | Импорт `MasterClientMetadata`, `get_client_display_name`, `get_meta_for_client`, `strip_indie_service_prefix`. Эндпоинт `GET /api/master/accounting/pending-confirmations`: корректное формирование `client_display_name`, `client_phone`, `service_name` (без префикса «Инди:»). |
| `backend/routers/master.py` | (уже было ранее) `client_display_name`, `client_phone`, `strip_indie_service_prefix` в dashboard, detailed, past-appointments. |
| `backend/routers/master_clients.py` | (уже было ранее) PATCH сохраняет `note`, возвращает в GET detail. |
| `backend/utils/client_display_name.py` | (уже было ранее) `get_client_display_name`, `get_meta_for_client`, `strip_indie_service_prefix`. |

### Frontend

| Файл | Изменения |
|------|-----------|
| `frontend/src/components/MasterScheduleCalendar.jsx` | `client_display_name \|\| client_name` вместо `client_name`, рядом `client_phone`. Иконка заметки по `has_client_note` (без проверки `client_note.trim()`). |
| `frontend/src/components/PastAppointments.jsx` | То же: `client_display_name`, `client_phone`, `has_client_note`. |
| `frontend/src/components/PopupCard.jsx` | То же: `client_display_name`, `client_phone`, иконка по `has_client_note`. |
| `frontend/src/components/SalonWorkSchedule.jsx` | `client_display_name`, `client_phone` (компактно). |
| `frontend/src/components/BookingConfirmations.jsx` | `client_display_name`, `client_phone` в формате «Клиент: Имя (+7…)». |
| `frontend/src/components/MasterDashboardStats.jsx` | (уже было ранее) `client_display_name`, `client_phone`. |
| `frontend/src/components/AllBookingsModal.jsx` | (уже было ранее) Фильтры, `client_display_name`, `client_phone`. |
| `frontend/src/components/MasterClients.jsx` | (уже было ранее) «Имя клиента (для вас)», телефон всегда виден, note иконка. |

---

## Ручные тесты (Web)

### 1. Сохранение alias и note
- [ ] Открыть «Клиенты», выбрать клиента
- [ ] Заполнить «Имя клиента (для вас)» и «Заметка»
- [ ] Нажать «Сохранить»
- [ ] Закрыть и открыть карточку — alias и note должны сохраниться
- [ ] В списке: верхняя строка — alias (если есть), вторая строка — телефон; иконка (i) только при наличии заметки

### 2. Дашборд
- [ ] В «Ближайшие записи» и «Прошедшие» отображаются alias (если есть) или «Клиент +7…»
- [ ] Телефон виден рядом/под именем
- [ ] Иконка (i) у записи только при заметке; по клику — модалка с текстом

### 3. «Все записи» (AllBookingsModal)
- [ ] Фильтры: Все / Будущие / Прошедшие, Все / Требует подтверждения
- [ ] В списке — alias + телефон
- [ ] Иконка заметки только при has_client_note

### 4. Расписание (MasterScheduleCalendar)
- [ ] В ячейках: alias (или имя) + телефон в скобках
- [ ] Название услуги без «Инди:»

### 5. Подтверждения (BookingConfirmations)
- [ ] Формат «Клиент: Имя (+7…)»
- [ ] service_name без «Инди:»

### 6. Прошедшие записи (PastAppointments)
- [ ] client_display_name + client_phone
- [ ] Иконка заметки по has_client_note

### 7. PopupCard (при наведении на запись)
- [ ] client_display_name, client_phone, иконка заметки

---

## curl-команды для проверки API

```bash
# 1. Логин
TOKEN=$(curl -s -X POST "http://localhost:8000/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone": "+79990000006", "password": "test123"}' | jq -r '.access_token')

# 2. Список клиентов (взять client_key)
curl -s "http://localhost:8000/api/master/clients" -H "Authorization: Bearer $TOKEN" | jq '.[0].client_key'

# 3. PATCH alias+note (подставить client_key)
curl -X PATCH "http://localhost:8000/api/master/clients/phone:%2B79991234567" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"alias_name": "Тест", "note": "Заметка"}'

# 4. GET detail — note и alias вернулись
curl -s "http://localhost:8000/api/master/clients/phone:%2B79991234567" \
  -H "Authorization: Bearer $TOKEN" | jq '{note, master_client_name}'

# 5. Dashboard stats — client_display_name
curl -s "http://localhost:8000/api/master/dashboard/stats?period=week" \
  -H "Authorization: Bearer $TOKEN" | jq '.next_bookings_list[0] | {client_display_name, client_phone}'

# 6. Pending confirmations
curl -s "http://localhost:8000/api/master/accounting/pending-confirmations" \
  -H "Authorization: Bearer $TOKEN" | jq '.pending_confirmations[0]'
```
