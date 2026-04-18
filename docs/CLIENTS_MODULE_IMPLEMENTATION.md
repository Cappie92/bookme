# Модуль «Клиенты» — реализация

## Изменённые/созданные файлы

**Backend:** models.py, routers/master_clients.py (новый), routers/master.py, routers/loyalty.py, main.py, alembic/versions/20260128_add_master_client_metadata.py

**Web:** components/MasterClients.jsx (новый), MasterDashboard.jsx, MasterDashboardStats.jsx, AllBookingsModal.jsx, PopupCard.jsx, PastAppointments.jsx, MasterScheduleCalendar.jsx

**Mobile:** app/master/clients.tsx, app/master/_layout.tsx, services/api/master.ts, services/api/bookings.ts, components/bookings/BookingCardCompact.tsx

**Docs:** CLIENTS_MODULE_PHASE0_INVENTORY.md, CLIENTS_MODULE_IMPLEMENTATION.md

---

## API Endpoints

### Master Clients

| Method | Path | Описание |
|--------|------|----------|
| GET | `/api/master/clients?q=&sort_by=&sort_dir=` | Список клиентов (≥1 completed). Поиск по q (телефон/имя). Сортировка: `sort_by` ∈ {completed_count, total_revenue, last_visit_at}, `sort_dir` ∈ {asc, desc}. По умолчанию: last_visit_at desc. NULLS LAST для last_visit_at. |
| GET | `/api/master/clients/{client_key}` | Карточка клиента |
| PATCH | `/api/master/clients/{client_key}` | Обновить alias_name, note (note max 280) |
| POST | `/api/master/clients/{client_key}/restrictions` | Добавить ограничение (body: restriction_type, reason) |
| DELETE | `/api/master/clients/{client_key}/restrictions/{id}` | Удалить ограничение |

**client_key**: `user:{client_id}` или `phone:{phone}`.

### Loyalty

| Method | Path | Описание |
|--------|------|----------|
| GET | `/api/loyalty/applicable-discounts?client_phone=&client_id=&service_id=&start_time=` | Применимые скидки для клиента |

## DB Schema

### master_client_metadata

| Поле | Тип | Описание |
|------|-----|----------|
| id | int | PK |
| master_id | int | FK masters |
| client_phone | string | Ключ клиента |
| alias_name | string(255) | Имя для мастера |
| note | string(280) | Заметка |
| created_at, updated_at | datetime | |

Уникальность: (master_id, client_phone).

## UI точки интеграции

### Web

- **MasterDashboard** → вкладка «Клиенты» → `MasterClients`
- **MasterDashboardStats** → Ближайшие / Прошедшие — иконка (i) при has_client_note
- **AllBookingsModal** — иконка (i) при has_client_note
- **PopupCard** — иконка (i) при has_client_note
- **PastAppointments** — иконка (i) при has_client_note
- **MasterScheduleCalendar** — иконка (i) в ячейке при has_client_note

### Mobile

- **master/clients.tsx** — список клиентов, карточка (Modal), редактирование alias/note, ограничения, скидки. Сортировка: кнопка ⇅ (swap-vertical) рядом с поиском → dropdown на 6 пунктов; сохранение в AsyncStorage (ключ `clients_sort_option`); sort_by/sort_dir в API.
- **BookingCardCompact** — иконка (i) при has_client_note, по тапу — Alert с заметкой
- **MasterHamburgerMenu** — пункт «Клиенты» → /master/clients

## Обогащение ответов bookings

В ответы добавлены:
- `has_client_note`: bool
- `client_note`: string | null
- `client_name`: с учётом alias (master_client_name)

Эндпоинты: `GET /api/master/bookings/detailed`, `GET /api/master/bookings/future`, `GET /api/master/past-appointments`, dashboard `next_bookings_list`.

## QA Checklist

### Backend
- [ ] GET /api/master/clients — список клиентов с ≥1 completed
- [ ] GET /api/master/clients/{key} — карточка с метриками
- [ ] PATCH /api/master/clients/{key} — alias/note, note ≤280
- [ ] POST/DELETE restrictions — добавление/удаление ограничений
- [ ] GET /api/loyalty/applicable-discounts — применимые скидки

### Web
- [ ] Sidebar → Клиенты → список
- [ ] Сортировка: клик по заголовкам Визиты/Доход/Последний визит; sort_by, sort_dir в URL (?tab=clients&sort_by=...&sort_dir=...); last_visit_at desc по умолчанию; NULLS LAST
- [ ] Поиск по телефону и имени
- [ ] Карточка: метрики, top_services, cancellations breakdown, restrictions, applicable_discounts
- [ ] Редактирование alias/note
- [ ] Добавление/удаление ограничений
- [ ] Добавление персональной скидки
- [ ] Иконка (i) при has_client_note: MasterDashboardStats, AllBookingsModal, PopupCard, PastAppointments, MasterScheduleCalendar
- [ ] tooltip с заметкой при hover на (i)

### Mobile
- [ ] Меню → Клиенты → список
- [ ] Сортировка: кнопка ⇅ → dropdown 6 пунктов; выбор сохраняется (AsyncStorage); поиск + сортировка вместе
- [ ] Карточка клиента (Modal): метрики, alias/note, restrictions, discounts
- [ ] Иконка (i) в BookingCardCompact при has_client_note, по тапу — Alert с заметкой
- [ ] Добавление ограничения (sheet)
- [ ] Добавление персональной скидки

### Общее
- [ ] total_revenue = sum payment_amount по completed
- [ ] client_name с учётом alias во всех списках записей
