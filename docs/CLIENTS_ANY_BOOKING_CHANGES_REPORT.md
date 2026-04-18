# Отчёт: клиенты с любой записью (Вариант A)

## Проблема
Клиент виден в дашборде (next_bookings_list), но не в модуле «Клиенты» — GET /api/master/clients возвращал только клиентов с ≥1 completed booking.

## Решение
Модуль «Клиенты» включает клиентов, у которых есть ≥1 запись (любой статус: created, confirmed, completed, cancelled и т.д.).

---

## Изменённые файлы (file:line)

### Backend

| Файл | Строки | Изменения |
|------|--------|-----------|
| `backend/routers/master_clients.py` | 1-4 | Docstring: «≥1 запись любого статуса» |
| `backend/routers/master_clients.py` | 85-172 | `_get_booking_crit()`, `_get_clients_with_any_booking()` — клиенты из любых bookings, метрики по completed/cancelled, full_name для поиска |
| `backend/routers/master_clients.py` | 231-265 | `list_clients`: поиск по q (телефон, alias, full_name), использование _get_clients_with_any_booking |
| `backend/routers/master_clients.py` | 267-336 | `_client_has_any_booking()`, `_client_has_metadata()`, `get_client_detail`: доступ по любой записи или metadata, минимальная карточка для «только metadata» |

### Frontend

| Файл | Строки | Изменения |
|------|--------|-----------|
| `frontend/src/components/AllBookingsModal.jsx` | 320 | React key: `booking.id ?? \`booking-${index}-${booking.start_time}\`` для уникальности |

### Тесты

| Файл | Описание |
|------|----------|
| `backend/tests/test_master_clients_any_booking.py` | 4 теста: клиент с только future в list, detail, поиск по телефону, поиск по full_name |

---

## Логика

### _get_clients_with_any_booking
1. Все уникальные `client_id` из `Booking` мастера (любой статус).
2. Для каждого: `completed_count`, `total_revenue`, `last_visit_at` — только из completed.
3. `cancelled_count` — из cancelled.
4. `master_client_name`, `has_note` — из MasterClientMetadata.
5. `full_name` — из User (для поиска).

### get_client_detail
- Доступ, если: есть ≥1 бронирование ИЛИ есть MasterClientMetadata.
- Если только metadata — минимальная карточка с `completed_count=0`.

### Поиск q=
- По цифрам телефона (частичное совпадение).
- По `master_client_name` (alias).
- По `full_name` пользователя.

---

## Smoke-тест (curl + npm dev)

```bash
# 1. Backend
cd backend && uvicorn main:app --reload --port 8000

# 2. Frontend
cd frontend && npm run dev

# 3. Логин мастера
TOKEN=$(curl -s -X POST "http://localhost:8000/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone": "+79990000006", "password": "test123"}' | jq -r '.access_token')

# 4. Клиент с future-записью должен быть в списке
curl -s "http://localhost:8000/api/master/clients?q=93000003" -H "Authorization: Bearer $TOKEN" | jq

# 5. Карточка клиента (completed_count=0)
curl -s "http://localhost:8000/api/master/clients/phone:%2B79993000003" -H "Authorization: Bearer $TOKEN" | jq

# 6. Backend тесты
cd backend && python3 -m pytest tests/test_master_clients_any_booking.py tests/test_master_clients_patch_note.py -v
```

---

## Ручная проверка (Web)

1. Создать future-запись для клиента (без completed).
2. Открыть «Клиенты» — клиент должен быть в списке.
3. Открыть карточку — `completed_count=0`, `client_phone` отображается.
4. Поиск по части телефона и по имени — находит клиента.
5. AllBookingsModal — нет warning про duplicate key, фильтры работают.
