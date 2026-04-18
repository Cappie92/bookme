# Аудит модуля «Клиенты» — отчёт

---

# ТЕХНИЧЕСКИЙ АУДИТ (дополнение)

## 1) Ограничения клиентов: master.id vs indie.id

### 1.1 Таблица endpoints

| Endpoint | Файл:строки | Фильтр по владельцу | Сравнивают | Почему |
|----------|-------------|---------------------|------------|--------|
| GET /api/master/restrictions | master.py:2682-2684 | `ClientRestriction.indie_master_id == master.id` | **master.id** (masters.id) | ❌ Ошибка: indie_master_id — FK на indie_masters.id, master.id — masters.id. Разные таблицы. |
| POST /api/master/restrictions | master.py:2713-2726 | то же + `indie_master_id=master.id` при создании | **master.id** | ❌ То же: в колонку indie_master_id пишется masters.id |
| PUT /api/master/restrictions/{id} | master.py:2753-2755 | `ClientRestriction.indie_master_id == master.id` | **master.id** | ❌ То же |
| DELETE /api/master/restrictions/{id} | master.py:2787-2789 | то же | **master.id** | ❌ То же |
| POST /api/master/restrictions/check | master.py:2818-2820 | то же | **master.id** | ❌ То же |
| GET /api/master/restriction-rules | master.py:2856-2857 | `ClientRestrictionRule.master_id == master.id` | **master.id** | ✓ OK: правило привязано к masters.id |
| POST/PUT/DELETE restriction-rules | master.py:2925-2927, 2986-2988 | то же | **master.id** | ✓ OK |
| GET /api/master/clients/{key} (restrictions) | master_clients.py:284-291 | `ClientRestriction.indie_master_id == indie.id` | **indie.id** | ✓ OK: indie = IndieMaster по master.user_id |
| POST /api/master/clients/{key}/restrictions | master_clients.py:353-364 | то же | **indie.id** | ✓ OK |
| DELETE /api/master/clients/{key}/restrictions/{id} | master_clients.py:387-389 | то же | **indie.id** | ✓ OK |
| check_client_restrictions (util) | client_restrictions.py:166-167 | `ClientRestriction.indie_master_id == indie_master_id` | **indie_master_id** (резолвится из master) | ✓ OK: indie_master_id = IndieMaster.id |

**Итог:** `/api/master/restrictions` (CRUD + check) использует `master.id` вместо `indie.id`. `master_clients` и `check_client_restrictions` — корректно.

### 1.2 masters.id и indie_masters.id

**Не равны по гарантии.** Это PK двух разных таблиц с автоинкрементом. Один User может иметь Master (user_id) и IndieMaster (user_id) — тогда masters.id ≠ indie_masters.id.

**Экраны/эндпоинты с разными данными:**
- **Web «Правила» / client-restrictions (mobile):** если используют `/api/master/restrictions` — фильтр `indie_master_id == master.id` не находит записи (индекс по indie_masters.id, а подставляется masters.id). Ограничения либо пустые, либо видны «чужие» при коллизии id.
- **Карточка клиента (Clients):** использует `master_clients` → `indie.id` — корректно.

**Рекомендация (не внедрять):** Везде для ClientRestriction использовать `IndieMaster.id` (indie.id), получаемый как `IndieMaster.filter(user_id == master.user_id).first().id`. Единая истина: `client_restrictions.indie_master_id` должен ссылаться только на `indie_masters.id`.

---

## 2) client_id IS NOT NULL

### 2.1 Подтверждение

`backend/routers/master_clients.py:96-100`:
```python
completed = (
    db.query(Booking)
    .filter(crit, Booking.status == BookingStatus.COMPLETED, Booking.client_id.isnot(None))
    .all()
)
```
Клиенты добавляются только при `Booking.client_id IS NOT NULL`. ✓

### 2.2 Возможны ли completed с client_id=NULL

**Создание бронирований:**
- `client.py:542` — `Booking(..., client_id=current_user.id)` — всегда задан
- `bookings.py:453` — `Booking(..., client_id=client.id)` — client из User по телефону
- `accounting.py` update-booking-status — не меняет client_id
- `booking.confirm` — не меняет client_id

**Booking.client_id в models.py:285** — `nullable=True`. В принципе NULL допустим на уровне БД. Но по текущим путям создания бронирований client_id всегда задаётся (клиент/мастер создаёт от имени пользователя). **Риск низкий:** ручные SQL или будущие сценарии «запись без клиента» теоретически возможны, но в текущей логике — нет.

---

## 3) Breakdown отмен

### 3.1 Статусы для breakdown

`master_clients.py:28-33`:
```python
CANCELLED_STATUSES = (
    BookingStatus.CANCELLED,
    BookingStatus.CANCELLED_BY_CLIENT_EARLY,
    BookingStatus.CANCELLED_BY_CLIENT_LATE,
)
```
 breakdown в строках 271-279 фильтрует `Booking.status.in_(CANCELLED_STATUSES)`. ✓

### 3.2 cancellation_reason при отмене

- `accounting.py:909` cancel-booking: `cancellation_reason` — Query(..., required), всегда задаётся. ✓
- `accounting.py:87-94` update-booking-status: при `new_status == "cancelled"` — `if cancellation_reason: booking.cancellation_reason = ...`; иначе остаётся старый (может быть NULL). При client_requested_early/late — всегда `"client_requested"`.

**Вывод:** При cancel-booking reason всегда есть. При update-booking-status в cancelled без reason — может остаться NULL. breakdown исключает такие записи: `Booking.cancellation_reason.isnot(None)` (стр. 273). ✓

### 3.3 Источник enum и лейблы

**Backend:** `utils/booking_status.py:61-74` и `utils/client_restrictions.py:18-30`:
```python
{
    "client_requested": "Клиент попросил отменить",
    "client_no_show": "Клиент не пришел на запись",
    "mutual_agreement": "Обоюдное согласие",
    "master_unavailable": "Мастер не может оказать услугу"
}
```
**UI:** лейблы приходят в `reason_label` из backend, фронт их не маппит.

---

## 4) Applicable discounts без контекста

### 4.1 Поведение /api/loyalty/applicable-discounts

`loyalty.py:543-561`:
- `service_id` нет → берётся `master.services[0].id` или первая услуга из master_services
- `start_time` нет → `now = dt.utcnow()`

В карточке клиента `master_clients.py:299-306`:
```python
booking_payload = {"start_time": now, "service_id": None, "category_id": None}
evaluate_discount_candidates(..., booking_payload=booking_payload, ...)
```
Т.е. `service_id=None` передаётся. В `_get_service_context(None, None)` возвращается `(None, None, category_id)` — resolved_price = None.

### 4.2 «Некорректная» оценка без контекста

- **service_discount** — зависит от услуги (цена, категория) → без service_id не считается.
- **happy_hours** — зависит от времени → start_time=now даёт оценку «сейчас», не для конкретного слота.
- **first_visit, returning_client, regular_visits, birthday** — от визитов/ДР, без услуги/времени в целом работают.
- **personal** — без привязки к услуге.

### 4.3 Рекомендация (не внедрять)

В карточке клиента явно обозначить блок как «Потенциальные скидки» или «Приблизительный список». Для «точно применимых» — требовать выбор услуги и времени (например, мини-форма или «рассчитать для слота»).

---

## 5) Alias/Note в booking responses

| Endpoint | Поля добавлены | Код |
|----------|----------------|-----|
| GET /api/master/bookings/detailed | ✓ has_client_note, client_note, client_name (alias) | master.py:169-194 |
| GET /api/master/bookings/future | ✓ | master.py:270-315 |
| GET /api/master/past-appointments | ✓ | master.py:382-416 |
| GET /api/master/dashboard/stats (next_bookings_list) | ✓ | master.py:3503-3548 |

**Использование на фронте:**
- **Dashboard cards:** next_bookings_list из dashboard/stats ✓
- **All bookings modal:** future + past-appointments ✓
- **Schedule popup / day drawer:** bookings из `/api/master/bookings/detailed` (MasterScheduleCalendar) ✓
- **Past appointments:** past-appointments ✓

`/api/master/schedule/monthly` отдаёт только слоты расписания, без данных о клиентах. ✓

---

## Финал

**Статус:** ⚠️ **Есть риски.**

### Обязательно проверить в QA

1. **Restrictions:** Web «Правила» и mobile client-restrictions — добавить ограничение, перезагрузить, проверить, что оно сохраняется и отображается. Если используете `/api/master/restrictions` — возможна пустота или некорректный список.
2. **Restrictions:** Карточка клиента (Clients) — добавить/удалить ограничение, сравнить с «Правила» (должны совпадать при корректной реализации).
3. **client_id:** Убедиться, что все completed booking создаются с client_id.
4. **Breakdown:** Отменить несколько записей с разными причинами → открыть карточку клиента → проверить breakdown.
5. **Скидки в карточке:** Проверить, что отображаются как «потенциальные», без гарантии для конкретной услуги/времени.
6. **Note 280:** Ввести заметку 281 символ → ожидать 400.
7. **Иконка (i):** Добавить заметку → проверить отображение в dashboard, all bookings, schedule, past.

---

# Оригинальный отчёт

## Сводная таблица

| Вопрос | Где в коде | Как работает | Как проверить |
|--------|------------|--------------|---------------|
| **A1** Хранение ограничений | `backend/models.py:1240-1273` (ClientRestriction) | Таблица `client_restrictions`, поля: id, salon_id, indie_master_id, client_phone, restriction_type, reason, is_active | `SELECT * FROM client_restrictions LIMIT 5` |
| **A2** client_key → phone | `backend/routers/master_clients.py:55-81` (_resolve_client_key) | `user:123` → User.id; `phone:+79...` или plain → client_phone; возвращает (client_id, client_phone) | GET /api/master/clients → взять client_key из ответа → GET /api/master/clients/{key} |
| **A3** Restriction по мастеру | `master_clients.py:286-291, 386-389` | Фильтр `ClientRestriction.indie_master_id == indie.id` (indie по master.user_id); client_phone из _resolve_client_key | POST restriction для client_key → убедиться, что другой мастер не видит |
| **B1** Breakdown отмен | `master_clients.py:264-281` | `GROUP BY cancellation_reason`, статусы CANCELLED/CANCELLED_BY_CLIENT_* | GET /api/master/clients/user:123 → cancellations_breakdown |
| **B2** reason enum | `backend/utils/booking_status.py:61-74` (get_cancellation_reasons) | client_requested, client_no_show, mutual_agreement, master_unavailable | — |
| **C1** Критерий списка клиентов | `master_clients.py:84-100` (_get_clients_with_completed) | `Booking.status == COMPLETED` (реальный статус в БД), `client_id IS NOT NULL` | Клиент только с created/awaiting — не в списке |
| **D1** master_client_metadata | `models.py:203-221`, миграция `20260128_add_master_client_metadata.py` | master_id + client_phone, alias_name, note (VARCHAR 280) | `SELECT * FROM master_client_metadata` |
| **D2** Уникальность | `models.py:220`, UniqueConstraint | (master_id, client_phone) unique | Попытка создать дубль → конфликт |
| **D3** Подмена client_name | `master.py:169-183, 270-315, 382-416, 3503-3548` | meta_map по client_phone, client_name = meta.alias_name or client.full_name | Изменить alias → проверить в detailed/past/next |
| **E1** applicable-discounts | `loyalty.py:528-581` | client_phone обязателен; service_id/start_time опциональны; при отсутствии — первая услуга + now | GET /api/loyalty/applicable-discounts?client_phone=+79001234567 |
| **E2** Контекст скидок | `master_clients.py:299-306` | booking_payload: start_time=now, service_id=None; evaluate подставляет первую услугу или None | Карточка без услуги — оценивается по now + дефолтная услуга |
| **F1** top_services, revenue | `master_clients.py:96-122, 253-262` | top: GROUP BY service, COUNT; revenue: SUM(payment_amount) по COMPLETED | GET /api/master/clients/user:123 |
| **G1** last_visit_at | `master_clients.py:120-121` | MAX(booking.start_time) по COMPLETED | — |
| **H1** Web Info/Edit | `MasterClients.jsx:166-179` | Info и Edit — обе открывают карточку (модал); Edit дополнительно подставляет alias/note в поля | Клик по иконкам в таблице |

---

## A) Ограничения (client restrictions)

### A1. Хранение и привязка

**Таблица:** `client_restrictions` (модель `ClientRestriction`, `backend/models.py:1240-1273`)

**Поля:**
- `id` — PK, автоинкремент
- `salon_id` — nullable (null для мастеров-индивидуалов)
- `indie_master_id` — FK → indie_masters.id (nullable для салонов)
- `client_phone` — строка, номер телефона
- `restriction_type` — enum: `blacklist`, `advance_payment_only`
- `reason` — текст, nullable
- `is_active` — boolean, default True

**client_key:** Строка формата `user:{client_id}` или `phone:{phone}` или plain phone. Маппинг в `_resolve_client_key` (master_clients.py:55-81):
- `user:123` → User.id=123, phone из User.phone
- `phone:+79001234567` → client_phone напрямую, client_id из User по phone
- Plain phone → поиск User по phone

### A2. POST/DELETE restrictions

**POST** `master_clients.py:334-370`:
- Модель: `ClientRestriction` (таблица `client_restrictions`)
- `indie_master_id = indie.id` (IndieMaster по `master.user_id`)
- `client_phone` из `_resolve_client_key`
- Проверка дубликата: (indie_master_id, client_phone, restriction_type, is_active)

**DELETE** `master_clients.py:373-394`:
- Модель: та же
- Фильтр: `ClientRestriction.id == restriction_id AND ClientRestriction.indie_master_id == indie.id`
- Реальное удаление: `is_active = False`

**Гарантия «только этот мастер»:** мастер получается по `current_user.id` → Master; IndieMaster по `master.user_id`. Restriction привязан к `indie_master_id`. Чужой мастер имеет другой indie_master_id и не пройдёт фильтр.

**Важно:** В `master.py` restrictions (стр. 2683, 2714) используют `ClientRestrictionModel.indie_master_id == master.id` — т.е. сравнивают `masters.id` с FK `indie_master_id` (indie_masters.id). В `master_clients.py` используется `indie.id` (IndieMaster.id), что логически верно. Если masters.id ≠ indie_masters.id для одного пользователя, endpoint `/api/master/restrictions` в master.py может работать некорректно; `master_clients` restrictions используют indie.id.

### A3. Пример JSON restrictions в GET client

```json
"restrictions": [
  {"id": 1, "type": "blacklist", "reason": "Не пришёл 2 раза"},
  {"id": 2, "type": "advance_payment_only", "reason": null}
]
```

Формируется в `master_clients.py:284-292`.

---

## B) Отменённые визиты + breakdown

### B1. Breakdown по причинам

**Есть.** Формируется в `master_clients.py:264-281`:
- `cb = db.query(Booking.cancellation_reason, func.count(Booking.id)).filter(..., Booking.status.in_(CANCELLED_STATUSES), Booking.cancellation_reason.isnot(None)).group_by(Booking.cancellation_reason).all()`
- Статусы: `CANCELLED`, `CANCELLED_BY_CLIENT_EARLY`, `CANCELLED_BY_CLIENT_LATE` (строки 29-33)

### B2. Формат breakdown

```json
"cancellations_breakdown": [
  {"reason": "client_no_show", "reason_label": "Клиент не пришел на запись", "count": 2},
  {"reason": "client_requested", "reason_label": "Клиент попросил отменить", "count": 1}
]
```

Возможные `reason`: `client_requested`, `client_no_show`, `mutual_agreement`, `master_unavailable`.

### B3. Источник enum и лейблы

- Backend: `backend/utils/booking_status.py:61-74` — `get_cancellation_reasons()` возвращает `{reason: label}`.
- Маппинг в карточке: `reasons_map.get(r[0], r[0])` — если reason нет в словаре, используется сам reason.
- Web/Mobile: лейблы приходят в `reason_label`, отдельный маппинг на фронте не нужен.

---

## C) «Завершённые визиты» — критерий списка

### C1. SQL/ORM логика

`master_clients.py:84-100`:
```python
completed = db.query(Booking).filter(
    crit,  # master_id или indie_master_id
    Booking.status == BookingStatus.COMPLETED,
    Booking.client_id.isnot(None)
).all()
```

- Используется **реальный** статус в БД (`Booking.status`), не effective status.
- Effective status (`get_effective_booking_status`) в этой логике не используется.

### C2. Влияние awaiting_confirmation (effective)

Нет влияния. Запись с `status=created` в БД и effective `awaiting_confirmation` **не** попадёт в список клиентов, т.к. фильтр по `Booking.status == COMPLETED`.

### C3. Точный критерий

Клиент попадает в список, если существует хотя бы один `Booking`, где:
- `(Booking.master_id == master.id) OR (Booking.indie_master_id == indie.id)` (для того же мастера);
- `Booking.status == 'completed'`;
- `Booking.client_id IS NOT NULL`.

---

## D) Alias name и Note (280 символов)

### D1. Хранение

**Таблица:** `master_client_metadata` (модель `MasterClientMetadata`, models.py:203-221)
- `master_id` — FK → masters.id
- `client_phone` — строка (ключ)
- `alias_name` — VARCHAR(255), nullable
- `note` — VARCHAR(280), nullable

### D2. Уникальность

`UniqueConstraint("master_id", "client_phone")` в models.py:220 и в миграции: `uq_master_client_metadata_master_phone`.

### D3. Где подменяется client_name

**Примечание:** `get_detailed_bookings` и `past-appointments` фильтруют только по `Booking.master_id == master.id` (без indie_master_id). `get_future_bookings` и dashboard `next_bookings` используют `or_(master_id, indie_master_id)`. При работе мастера через IndieMaster часть броней может не попадать в detailed/past.

| API | Файл:строки |
|-----|-------------|
| GET /api/master/bookings/detailed | master.py:169-183 |
| GET /api/master/bookings/future | master.py:270-315 |
| GET /api/master/past-appointments | master.py:382-416 |
| Dashboard next_bookings_list | master.py:3503-3548 |

Логика: `client_name = (meta.alias_name if meta and meta.alias_name else None) or (client.full_name or "Клиент")`.

### D4. Note 280 символов

- **БД:** `note VARCHAR(280)` в миграции (стр. 32) и модели (стр. 211).
- **Pydantic:** `MasterClientMetadataUpdate.note` — `Field(None, max_length=280)` (master_clients.py:166).
- **PATCH:** проверка `if body.note is not None and len(body.note) > 280` → HTTP 400, "Заметка не более 280 символов" (master_clients.py:413-414).
- **UI Web:** `maxLength={280}` в textarea (MasterClients.jsx:223).
- **UI Mobile:** `maxLength={280}` в TextInput (clients.tsx).

### D5. Иконка (i) в карточках бронирований

**Поля в ответах:** `has_client_note`, `client_note`, `client_name` (с учётом alias).

**Где формируются:** те же участки master.py (169-183, 270-315, 382-416, 3503-3548).

**Риск утечки:** Нет. `meta_map` строится по `MasterClientMetadata.master_id == master.id`. master берётся из `current_user`. Заметка привязана к (master_id, client_phone) и выдаётся только при запросах своего мастера.

---

## E) Скидки (applicable discounts)

### E1. GET /api/loyalty/applicable-discounts

**Query params:**
- `client_phone` — обязателен
- `client_id` — опционально
- `service_id` — опционально
- `start_time` — опционально

**Поведение (loyalty.py:543-561):** если `service_id` не передан — подставляется первая услуга мастера; если `start_time` не передан — `now`. Затем вызывается `evaluate_discount_candidates`.

**Структура ответа:**
```json
{
  "applicable": [
    {
      "rule_id": 1,
      "rule_type": "personal",
      "name": "Персональная 10%",
      "condition_type": null,
      "discount_percent": 10,
      "max_discount_amount": null,
      "requires_context": false
    }
  ],
  "best_candidate": { ... }
}
```

### E2. Контекст в карточке клиента

В `master_clients.py:299-306` передаётся:
- `booking_payload = {"start_time": now, "service_id": None, "category_id": None}`

В `evaluate_discount_candidates` при `service_id=None` в `_get_service_context` возвращается (None, None, category_id). Персональные скидки и части loyalty-правил (first_visit, returning, regular_visits, birthday и т.п.) могут матчиться; `service_discount` и `happy_hours` без контекста — нет.

Итого: возвращаются «потенциально применимые» скидки (персональные + часть loyalty без жёсткой привязки к услуге/времени).

### E3. Создание персональной скидки

**Endpoint:** `POST /api/loyalty/personal-discounts` (loyalty.py:864-903).

**Payload (PersonalDiscountCreate):**
- `client_phone` — обязателен, pattern `^\+?1?\d{9,15}$`
- `discount_percent` — 0–100
- `max_discount_amount` — опционально
- `description` — опционально
- `is_active` — default True

**Валидации:**
- Пользователь с таким `client_phone` должен существовать в users (404 иначе).
- Не должно быть уже персональной скидки для (master_id, client_phone) (400).

Апсерта нет — при наличии скидки возвращается 400.

---

## F) «Популярные услуги» и «Доход по клиенту»

### F1. Где считается

**top_services:** master_clients.py:253-262:
```python
top_svc = db.query(Service.id, Service.name, func.count(Booking.id).label("cnt"))
    .join(Booking, Booking.service_id == Service.id)
    .filter(bc, Booking.client_id == uid, Booking.status == BookingStatus.COMPLETED)
    .group_by(Service.id, Service.name)
    .order_by(desc("cnt"))
    .limit(5)
```

**revenue:** master_clients.py:118-119:
```python
rev = float(b.payment_amount or 0)
by_client[cid]["total_revenue"] += rev
```
Суммируется по completed bookings.

### F2. Статусы

Учитываются только `Booking.status == COMPLETED`.

### F3. Поля для денег

`Booking.payment_amount` — финальная сумма после скидок. `service.price` и `applied_discounts` в расчёте дохода не используются.

### F4. Мультивалютность / округление

Нет явной обработки валюты. `float(payment_amount)`, округление не выполняется.

### F5. Пример top_services и total_revenue

```json
"top_services": [
  {"service_id": 5, "service_name": "Стрижка", "count": 10},
  {"service_id": 8, "service_name": "Окрашивание", "count": 3}
],
"total_revenue": 45000.0
```

---

## G) «Дата последнего визита»

**Вычисление:** `master_clients.py:120-121` — `max(booking.start_time)` по completed bookings для клиента.

**Часовой пояс:** В БД хранится UTC. Форматирование на клиенте (Web: `formatDate`, Mobile: `toLocaleDateString`). Backend отдаёт ISO datetime как есть.

---

## H) UI/UX: Info и Edit

### Web

- **Список:** `MasterClients.jsx`, вкладка «Клиенты» в MasterDashboard (tab=clients).
- **Карточка:** модал при `selectedClient` (MasterClients.jsx:189-262).
- **Info:** `InformationCircleIcon`, `onClick={() => setSelectedClient(c.client_key)}` — открывает карточку.
- **Edit:** `PencilIcon`, `onClick` то же + `setEditAlias`, `setEditNote` — открывает ту же карточку с заполненными полями alias/note.
- Редактирование alias/note — прямо в модале, кнопка «Сохранить».

### Mobile

- **Экран:** `mobile/app/master/clients.tsx`, route `/master/clients`.
- **Карточка:** Modal (строки 251-342), открывается по тапу на иконку Info или Edit.
- **Edit:** та же модалка; поля alias/note сразу доступны для редактирования.
- **Ограничения:** отдельный Modal (showAddRestriction), кнопки «Черный список» / «Только предоплата».
- **Персональная скидка:** отдельный Modal (showAddDiscount), ввод процента.

---

## I) QA-чеклист (15–20 пунктов)

### API

1. `GET /api/master/clients` (с токеном мастера) — список клиентов с completed_count, total_revenue, last_visit_at.
2. `GET /api/master/clients?q=7900` — фильтр по телефону.
3. `GET /api/master/clients/user:123` — карточка по client_key (подставить реальный id).
4. `PATCH /api/master/clients/user:123` с `{"alias_name": "Тест", "note": "Заметка"}` — обновление metadata.
5. `PATCH` с `note` длиной 281 символ — ожидать 400.
6. `POST /api/master/clients/user:123/restrictions` с `{"restriction_type": "blacklist"}` — создание ограничения.
7. `DELETE /api/master/clients/user:123/restrictions/1` — снятие ограничения (is_active=false).
8. `GET /api/loyalty/applicable-discounts?client_phone=+79001234567` — список применимых скидок.
9. `POST /api/loyalty/personal-discounts` с `{client_phone, discount_percent: 10}` — создание персональной скидки.
10. Клиент только с created/awaiting — отсутствует в `GET /api/master/clients`.

### Web

11. MasterDashboard → вкладка «Клиенты» — таблица с Info и Edit.
12. Клик Info → модал карточки с метриками, breakdown, alias, note, скидками, ограничениями.
13. Изменение alias/note и «Сохранить» — обновление, повторное открытие — новые значения.
14. Клик по «Отменённых» — раскрывается breakdown причин.
15. В «Ближайшие записи» / «Все записи» — при наличии заметки отображается иконка (i), hover — текст заметки.

### Mobile

16. Меню → Клиенты — экран списка.
17. Тап по клиенту (или Info) — модал карточки.
18. Редактирование alias/note — сохранение, обновление при повторном открытии.
19. «Добавить ограничение» — выбор blacklist/advance_payment_only — появление в списке ограничений.
20. «Добавить персональную скидку» — ввод процента — появление в applicable_discounts.

### Негативные кейсы

21. **note > 280:** PATCH с длинной заметкой → 400.
22. **Пустые скидки/ограничения:** в карточке — «У клиента нет скидок», «Ограничений нет».
23. **Клиент без completed:** не в списке, `GET /api/master/clients/user:X` при отсутствии completed → 404.
24. **Чужой мастер:** metadata и restrictions привязаны к master_id/indie_master_id; при запросах под другим мастером — свои данные, чужие недоступны.
