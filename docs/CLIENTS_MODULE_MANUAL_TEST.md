# Ручная проверка модуля «Клиенты» и отображения имён

## Команды для проверки

### 1. Логин мастера (получить TOKEN)
```bash
# Мастер: +79990000006 / test123
```

```bash
TOKEN=$(curl -s -X POST "http://localhost:8000/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone": "+79990000006", "password": "test123"}' \
  | jq -r '.access_token')
echo "TOKEN: $TOKEN"
```

### 2. PATCH — сохранить alias и заметку

```bash
# Замените CLIENT_KEY на реальный (например user:123 или phone:+79991234567)
# Получить client_key можно из GET /api/master/clients
curl -X PATCH "http://localhost:8000/api/master/clients/phone:%2B79991234567" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"alias_name": "Тестовый клиент", "note": "Заметка для проверки сохранения"}'
```

Ожидаемый ответ: `{"alias_name": "Тестовый клиент", "note": "Заметка для проверки сохранения"}`

### 3. GET — проверить, что заметка сохранилась

```bash
curl -s "http://localhost:8000/api/master/clients/phone:%2B79991234567" \
  -H "Authorization: Bearer $TOKEN" | jq '.note, .master_client_name'
```

Ожидаемо: в ответе `note` и `master_client_name` (alias) совпадают с сохранёнными.

### 4. Dashboard / bookings — проверить client_display_name

```bash
curl -s "http://localhost:8000/api/master/dashboard/stats?period=week" \
  -H "Authorization: Bearer $TOKEN" | jq '.next_bookings_list[0] | {client_display_name, client_name, client_phone}'
```

```bash
curl -s "http://localhost:8000/api/master/bookings/future?page=1&limit=5" \
  -H "Authorization: Bearer $TOKEN" | jq '.bookings[0] | {client_display_name, client_name, client_phone}'
```

```bash
curl -s "http://localhost:8000/api/master/bookings/detailed" \
  -H "Authorization: Bearer $TOKEN" | jq '.[0] | {client_display_name, client_name, client_phone}'
```

```bash
curl -s "http://localhost:8000/api/master/accounting/pending-confirmations" \
  -H "Authorization: Bearer $TOKEN" | jq '.pending_confirmations[0] | {client_display_name, client_phone}'
```

В полях `client_display_name`/`client_name` должен быть alias (если задан) или full_name или phone. `client_phone` — всегда отдельно.

---

## Запуск приложений

```bash
# Backend
cd backend && uvicorn main:app --reload --port 8000

# Web
cd frontend && npm run dev

# Mobile
cd mobile && npm run ios
# или
cd mobile && npm run android
```

---

## Пошаговая проверка

### A. Список клиентов — только completed

- [ ] В «Клиенты» показываются только клиенты с ≥1 completed записью
- [ ] Клиент с только future-записями НЕ появляется в списке и в поиске

### B. Сохранение заметки

1. Войти как мастер, перейти на «Клиенты».
2. Открыть клиента (кнопка карандаш).
3. Ввести заметку, нажать «Сохранить».
4. Обновить страницу — заметка должна остаться.
5. По клику на иконку (i) открывается popover с текстом заметки (не модалка).

### C. Иконка заметки (MasterClients)

- [ ] Иконка — InformationCircle (серый/чёрный), НЕ синяя, без подчёркивания
- [ ] Hover: лёгкий фон, без link-стилей
- [ ] Popover: компактный, рядом с иконкой, закрытие: клик вне / Esc / повторный клик

### D. Дашборд и «Все записи»

1. Формат: `display_name (phone)` — без дубля телефона
2. Ближайшие/Прошедшие: компактные строки
3. «Все записи»: фильтры видны сразу (без складки)
4. Пагинация: [Назад] Стр. X из Y [Вперёд] — не «Показать ещё»

### D. Mobile

1. Дашборд: в «Ближайших записях» отображается имя клиента.
2. «Все записи»: в карточках отображается имя клиента.

---

## Web: краткий чеклист (последние правки)

1. **Список клиентов**: только completed; иконка (i) серая, popover по клику
2. **Дашборд**: `display_name (phone)` компактно; без дублей
3. **Все записи**: фильтры видны; пагинация [Назад]/[Вперёд]; компактные строки
4. **Бизнес-логика**: future-only клиенты не в списке «Клиенты»; PATCH/detail по phone работают
