# Обзор архитектуры скидок в проекте

**Дата:** 2026-01-28  
**Задача:** Восстановить картину: где хранится, как считается «применимые скидки», какие endpoints, как склеивается.  
**Режим:** Только анализ, без рефакторинга.

---

## 1. DB Schema

### Таблицы и ключевые поля

| Таблица | Ключевые поля | Типы | Назначение |
|---------|---------------|------|------------|
| **loyalty_discounts** | id, master_id, salon_id (legacy), discount_type, name, discount_percent, max_discount_amount, conditions (JSON), is_active, priority | int, str, float, JSON, bool | Быстрые и сложные скидки по правилам мастера |
| **personal_discounts** | id, master_id, salon_id (legacy), client_phone, discount_percent, max_discount_amount, description, is_active | int, str, float | Персональные скидки мастер→клиент (по телефону) |
| **applied_discounts** | id, booking_id, discount_id (FK loyalty_discounts), personal_discount_id (FK personal_discounts), discount_percent, discount_amount | int, float | Связь бронирования с применённой скидкой |
| **bookings** | payment_amount (Float, nullable) | float | Итоговая сумма к оплате (уже со скидкой) |

### Связи

- `Master` ↔ `LoyaltyDiscount` (1:N, master_id)
- `Master` ↔ `PersonalDiscount` (1:N, master_id)
- `Booking` ↔ `AppliedDiscount` (1:1 фактически, booking_id)
- `AppliedDiscount` → `LoyaltyDiscount` (discount_id) или `PersonalDiscount` (personal_discount_id)
- `Service` — источник базовой цены; `master_services` — валидация принадлежности услуги мастеру

### Миграции

| Миграция | Содержание |
|----------|------------|
| `add_loyalty_system` | Создание loyalty_discounts, personal_discounts, applied_discounts (изначально salon_id) |
| `20260121_add_master_id_to_loyalty_discounts` | Добавление master_id в loyalty_discounts |
| `4a3162c37a1c_add_payment_methods` | Добавление payment_amount в bookings |
| `add_client_restriction_rules_and_payment` | payment_amount в bookings (повторно в другом контексте) |

---

## 2. Backend

### Роуты и методы (loyalty)

| Method | URL | Описание |
|--------|-----|----------|
| GET | `/api/loyalty/templates` | Шаблоны быстрых скидок (константа) |
| GET | `/api/loyalty/status` | Все скидки мастера (quick, complex, personal) |
| GET | `/api/loyalty/rules` | Алиас status |
| GET | `/api/loyalty/legacy-rules` | Legacy (salon_id, master_id IS NULL) |
| POST | `/api/loyalty/evaluate` | Оценка кандидатов для payload (master-only) |
| POST/GET/PUT/DELETE | `/api/loyalty/quick-discounts` | CRUD быстрых скидок |
| POST/GET/PUT/DELETE | `/api/loyalty/complex-discounts` | CRUD сложных скидок |
| POST/GET/PUT/DELETE | `/api/loyalty/personal-discounts` | CRUD персональных скидок |
| GET | `/api/loyalty/check-discount/{client_phone}` | Только персональная скидка по телефону (не полная оценка) |

Роутер: `backend/routers/loyalty.py`, префикс `/api`.

### Функции расчёта скидок

| Файл | Функция | Назначение |
|------|---------|------------|
| `backend/utils/loyalty_discounts.py` | `evaluate_discount_candidates(master_id, client_id, client_phone, booking_payload, db)` | Возвращает (candidates, best_candidate) |
| `backend/utils/loyalty_discounts.py` | `evaluate_and_prepare_applied_discount(master_id, client_id, client_phone, booking_start, service_id, db)` | Возвращает (discounted_payment_amount, applied_discount_data) |
| `backend/utils/loyalty_discounts.py` | `build_applied_discount_info(applied_discount)` | Формирует JSON для ответа API |
| `backend/utils/loyalty_discounts.py` | `create_applied_discount(booking_id, applied_discount_data)` | Фабрика AppliedDiscount (не используется в роутерах — создание inline) |
| `backend/utils/loyalty_params.py` | `normalize_parameters(condition_type, parameters, rule_discount_percent)` | Нормализация parameters для сравнения |
| `backend/utils/loyalty_params.py` | `validate_happy_hours_intervals` | Валидация интервалов happy_hours |

### Где вызывается evaluate_and_prepare_applied_discount

- `backend/routers/bookings.py`: POST `/`, POST `/public` (создание бронирования)
- `backend/routers/client.py`: создание бронирования клиентом, создание временной брони, `confirm_temporary_booking_payment`

### Формат ответа applied_discount (build_applied_discount_info)

```json
{
  "id": 123,
  "rule_type": "quick" | "personal" | "complex",
  "name": "Название скидки",
  "discount_percent": 10,
  "discount_amount": 150.0
}
```

### Формат evaluate response (POST /api/loyalty/evaluate)

Вход: `DiscountEvaluationRequest` с полями `client_id`, `client_phone`, `booking` (start_time, service_id, category_id).

Выход: `DiscountEvaluationResponse` с `candidates` (все подходящие/неподходящие правила) и `best_candidate` (выбранный).

---

## 3. Frontend (Web)

### Где отображается скидка

| Компонент | Контекст | Источник данных |
|-----------|----------|-----------------|
| `LoyaltySystem.jsx` | Раздел «Лояльность» мастера | `GET /api/loyalty/templates`, `GET /api/loyalty/status` |
| `BookingConfirmations.jsx` | Подтверждение услуг | `payment_amount` из `GET /api/master/accounting/pending-confirmations` |
| `PastAppointments.jsx` | Прошедшие записи | `payment_amount` из `GET /api/master/past-appointments` |
| `PaymentModal.jsx` | Оплата | `booking.payment_amount` |
| `MasterBookingModule.jsx` | Запись клиента | Ответ создания бронирования (payment_amount, applied_discount) |

### API client

- `frontend/src/utils/api.js` — `apiGet`, `apiPost`, `apiPut`, `apiDelete`
- Loyalty: `apiGet('/api/loyalty/templates')`, `apiGet('/api/loyalty/status')`, `apiPost('/api/loyalty/quick-discounts', …)` и т.д.
- Bookings: `/api/master/bookings/`, `/api/master/bookings/detailed`, `/api/master/past-appointments` — в ответе `applied_discount` подставляется через `build_applied_discount_info`

### Утилиты

- `frontend/src/utils/loyaltyConditions.js`: `normalizeParametersForComparison`, `stableStringify`, `templateMatchesDiscount` — для UI «шаблон активен» (сравнение template ↔ discount)

---

## 4. Mobile

### Где отображается скидка

| Компонент | Контекст | Источник данных |
|-----------|----------|-----------------|
| `DiscountsQuickTab.tsx` | Вкладка «Быстрые скидки» | `getLoyaltyTemplates`, `getLoyaltyStatus` |
| `DiscountsComplexTab.tsx` | Вкладка «Сложные скидки» | `getLoyaltyStatus` (complex_discounts) |
| `DiscountsPersonalTab.tsx` | Вкладка «Персональные скидки» | `getLoyaltyStatus` (personal_discounts) |
| `BookingCardCompact.tsx` | Карточка записи | `booking.payment_amount` |
| `AllBookingsModal.tsx` | Модалка «Все записи» | `payment_amount` из API |

### API

- `mobile/src/services/api/loyalty_discounts.ts`: `getLoyaltyTemplates`, `getLoyaltyStatus`, `createQuickDiscount`, `updateQuickDiscount`, `deleteQuickDiscount`, CRUD complex/personal
- `mobile/src/services/api/client.ts`, `master.ts` — бронирования с `payment_amount`, `applied_discount` (если эндпоинт возвращает)

### Утилиты

- `mobile/src/utils/loyaltyConditions.ts`: аналог web — `normalizeParametersForComparison`, `stableStringify`, `templateMatchesDiscount`, `isTemplateActive`, `findActiveDiscountForTemplate`

---

## 5. Rules / Personal discounts

### Перечень типов скидок в системе

| Тип | Условие (condition_type) | Где считается | Описание |
|-----|--------------------------|---------------|----------|
| **Быстрые (quick)** | first_visit, regular_visits, returning_client, birthday, happy_hours, service_discount | `evaluate_discount_candidates` | Правила мастера, JSON conditions |
| **Сложные (complex)** | visit_count, spent_amount, days_since_last_visit, birthday_range, time_slot, day_of_week и др. | Только создание/хранение; оценка при бронировании через те же evaluate | Множественные условия |
| **Персональные** | — | Отдельный запрос PersonalDiscount по client_phone | Мастер→клиент по телефону |

### Как определяется применимость

- **Входные данные:** master_id, client_id (или null), client_phone, booking_payload (start_time, service_id, category_id, service_price)
- **Логика:** `evaluate_discount_candidates` перебирает LoyaltyDiscount (quick+complex) и PersonalDiscount; для каждого проверяет условия (first_visit = 0 завершённых визитов, returning_client = дней с последнего визита, birthday = окно ДР, happy_hours = день недели + интервал времени, service_discount = service_id в items)
- **Часовой пояс:** используется `master.timezone` для local now и интервалов happy_hours/birthday

### Приоритеты и конфликты

- При совпадении нескольких правил выбирается **одна скидка с максимальным discount_percent**
- При равенстве процентов — приоритет по `CONDITION_TYPE_PRIORITY`: birthday (1), returning_client (2), regular_visits (3), first_visit (4), happy_hours (5), service_discount (6); personal — 7
- Суммирование скидок **нет** — всегда одна лучшая

### Что считается «действующей скидкой»

- `is_active == True`
- Условия (conditions) выполняются для данного client + booking
- Для PersonalDiscount: client_phone совпадает, is_active

---

## 6. Где применяется скидка к цене

### Цепочка

1. **Базовая цена:** `Service.price` (из БД)
2. **Расчёт скидки:** `evaluate_and_prepare_applied_discount` → discount_amount = base_price × (percent/100), ограничен max_discount_amount
3. **Итоговая цена:** `discounted_payment_amount = max(service.price - discount_amount, 0)`
4. **Сохранение:** `booking.payment_amount = discounted_payment_amount` (или base_price, если скидки нет)
5. **AppliedDiscount:** создаётся при наличии скидки; хранит discount_percent, discount_amount, ссылку на loyalty_discount или personal_discount

### Где хранится

| Поле | Таблица | Смысл |
|------|---------|-------|
| `booking.payment_amount` | bookings | Итоговая сумма к оплате (уже со скидкой) |
| `applied_discounts.discount_amount` | applied_discounts | Сумма скидки в рублях |
| `applied_discounts.discount_percent` | applied_discounts | Процент скидки |

### Доход по клиенту

- **Income.confirmed_income** при confirm-booking берётся из `booking.payment_amount` (минус loyalty_points_used)
- **Статистика/дашборд:** суммируется `Booking.payment_amount` по completed
- **Вывод:** Доход за всё время по клиенту можно считать как сумму `payment_amount` по completed booking. **Но** `payment_amount` — это уже итоговая цена; базовая цена и сумма скидки восстанавливаются через AppliedDiscount при необходимости.

### Риски

**Если UI показывает скидки, но backend не хранит «применённую скидку» в booking:**

1. **Сценарий:** Мастер создаёт запись вручную (не через стандартный flow), или старый код не вызывал evaluate — тогда `payment_amount` может быть = Service.price (без скидки), AppliedDiscount отсутствует.
2. **Следствие:** Невозможно отличить «клиент заплатил полную цену» от «скидка не была записана»; отчёт «доход по клиенту» может быть завышен (если скидка была, но не сохранена).
3. **Текущее состояние:** При создании через bookings.py и client.py evaluate вызывается; AppliedDiscount создаётся; payment_amount = discounted. Риск — только для альтернативных путей создания booking (seed, скрипты, ручные INSERT).

**Варианты исправления (без реализации):**

- **A)** Гарантировать вызов `evaluate_and_prepare_applied_discount` во всех местах создания Booking; при отсутствии AppliedDiscount считать payment_amount = базовая цена (консервативно).
- **B)** Добавить в Booking поле `original_price` (базовая) и хранить `payment_amount` как итог; при создании всегда заполнять оба; для старых записей — миграция или fallback: если AppliedDiscount есть → original = payment_amount + discount_amount.

---

## 7. Готовность к модулю «Клиенты»

### Можно ли получить «применимые скидки клиенту» одним вызовом?

**Частично.**

- **POST `/api/loyalty/evaluate`** — требует полный payload (client_id, client_phone, booking с start_time, service_id). Возвращает candidates + best_candidate. Нужны: master_id (из токена), client_id или client_phone, service_id, start_time.
- **GET `/api/loyalty/check-discount/{client_phone}`** — возвращает только персональную скидку. Не учитывает правила (first_visit, birthday и т.д.).

### Что минимально нужно добавить

1. **Расширить `/api/loyalty/check-discount`** или создать **GET `/api/loyalty/applicable-discounts`** с параметрами: `client_phone`, `client_id` (optional), `service_id`, `start_time` (или `date` + `time`). Возвращать список применимых скидок (candidates с match=True) + best_candidate. Использовать `evaluate_discount_candidates` внутри.
2. **Агрегация:** Один вызов должен возвращать все применимые правила + выбранную лучшую. Сейчас evaluate возвращает это, но endpoint POST и требует тело запроса.
3. **Публичный доступ:** Для экрана «Клиенты» в ЛК мастера нужен master-scoped endpoint (require_master). Текущий `/evaluate` уже master-only.

---

## 8. Сводка

| Аспект | Статус |
|--------|--------|
| DB: loyalty_discounts, personal_discounts, applied_discounts | ✅ |
| Источник истины расчёта | `backend/utils/loyalty_discounts.py` |
| Применение при создании брони | bookings.py, client.py |
| Хранение итоговой цены | `booking.payment_amount` |
| Хранение применённой скидки | `applied_discounts` + FK |
| Доход = сумма payment_amount по completed | ✅ Да |
| Один вызов «применимые скидки клиенту» | ⚠️ Только через POST /evaluate с полным payload |
| check-discount | ⚠️ Только персональная скидка |
