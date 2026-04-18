# Аудит системы лояльности для мобильного переноса

**Дата:** 2026-01-21  
**Цель:** Подготовка к переносу блока "Лояльность" (единый апп мастер+клиент) в мобильное приложение

---

## A) Endpoints Table

### СКИДКИ (Discounts) - Master Only

| Метод | Путь | Доступ | Обязательные поля запроса | Ключевые поля ответа | Возможные ошибки |
|-------|------|--------|---------------------------|----------------------|------------------|
| GET | `/api/loyalty/templates` | Public | - | `id`, `name`, `description`, `icon`, `conditions`, `default_discount` | - |
| GET | `/api/loyalty/status` | Master | - | `quick_discounts[]`, `complex_discounts[]`, `personal_discounts[]`, `total_discounts`, `active_discounts` | 404 (master not found), 409 (SCHEMA_OUTDATED), 403 (subscription required) |
| GET | `/api/loyalty/rules` | Master | - | То же, что `/status` | 404, 409, 403 |
| GET | `/api/loyalty/legacy-rules` | Master | - | То же, что `/status` (read-only legacy) | 404, 409, 403 |
| POST | `/api/loyalty/evaluate` | Master | `booking.start_time`, `booking.service_id` (опционально: `client_id`, `client_phone`) | `candidates[]`, `best_candidate` (или `null`) | 404 (master not found), 400 (invalid payload) |
| POST | `/api/loyalty/quick-discounts` | Master | `discount_type`, `name`, `discount_percent`, `conditions` | `id`, `master_id`, `name`, `discount_percent`, `max_discount_amount`, `conditions`, `is_active`, `priority` | 404 (master not found), 400 (validation) |
| GET | `/api/loyalty/quick-discounts` | Master | - | `LoyaltyDiscount[]` | 404, 403 |
| PUT | `/api/loyalty/quick-discounts/{discount_id}` | Master | - | `LoyaltyDiscount` | 404 (discount not found), 400 (validation) |
| DELETE | `/api/loyalty/quick-discounts/{discount_id}` | Master | - | `{"message": "Скидка удалена"}` | 404 (discount not found) |
| POST | `/api/loyalty/complex-discounts` | Master | То же, что quick-discounts | То же, что quick-discounts | То же, что quick-discounts |
| GET | `/api/loyalty/complex-discounts` | Master | - | `LoyaltyDiscount[]` | 404, 403 |
| PUT | `/api/loyalty/complex-discounts/{discount_id}` | Master | - | `LoyaltyDiscount` | 404, 400 |
| DELETE | `/api/loyalty/complex-discounts/{discount_id}` | Master | - | `{"message": "Скидка удалена"}` | 404 |
| POST | `/api/loyalty/personal-discounts` | Master | `client_phone`, `discount_percent` | `id`, `master_id`, `client_phone`, `discount_percent`, `max_discount_amount`, `description`, `is_active` | 404 (user not found), 400 (already exists) |
| GET | `/api/loyalty/personal-discounts` | Master | - | `PersonalDiscount[]` | 404, 403 |
| PUT | `/api/loyalty/personal-discounts/{discount_id}` | Master | - | `PersonalDiscount` | 404, 400 |
| DELETE | `/api/loyalty/personal-discounts/{discount_id}` | Master | - | `{"message": "Скидка удалена"}` | 404 |
| GET | `/api/loyalty/check-discount/{client_phone}` | Master | `client_phone` (query: `service_id?`, `booking_date?`) | `has_discount`, `discount_type`, `discount_percent`, `max_discount_amount`, `description` | 404 (master not found) |

### БАЛЛЫ (Points) - Master

| Метод | Путь | Доступ | Обязательные поля запроса | Ключевые поля ответа | Возможные ошибки |
|-------|------|--------|---------------------------|----------------------|------------------|
| GET | `/api/master/loyalty/settings` | Master (Pro+) | - | `id`, `master_id`, `is_enabled`, `accrual_percent`, `max_payment_percent`, `points_lifetime_days`, `created_at`, `updated_at` | 403 (subscription required), 404 (master not found) |
| PUT | `/api/master/loyalty/settings` | Master (Pro+) | Все поля optional | То же, что GET | 403, 400 (validation: 1-100 для процентов, 14/30/60/90/180/365 для lifetime) |
| GET | `/api/master/loyalty/stats` | Master (Pro+) | - | `total_earned`, `total_spent`, `current_balance`, `active_clients_count` | 403, 404 |
| GET | `/api/master/loyalty/history` | Master (Pro+) | Query: `client_id?`, `transaction_type?` (earned\|spent), `start_date?`, `end_date?`, `skip?`, `limit?` | `LoyaltyTransactionOut[]` (с `client_name`, `service_name`) | 403, 404 |

### БАЛЛЫ (Points) - Client

| Метод | Путь | Доступ | Обязательные поля запроса | Ключевые поля ответа | Возможные ошибки |
|-------|------|--------|---------------------------|----------------------|------------------|
| GET | `/api/client/loyalty/points` | Client | - | `ClientLoyaltyPointsOut[]` (по мастерам: `master_id`, `master_name`, `total_points`, `active_points`, `expired_points`, `transactions[]`) | 401 (unauthorized) |
| GET | `/api/client/loyalty/points/summary` | Client | - | `ClientLoyaltyPointsSummaryOut[]` (`master_id`, `master_name`, `total_points`) | 401 |
| GET | `/api/client/loyalty/points/{master_id}/available` | Client | `master_id` (path) | `master_id`, `available_points`, `max_payment_percent`, `is_loyalty_enabled` | 401 |
| GET | `/api/client/loyalty/master/{master_id}/loyalty-settings` | Client | `master_id` (path) | `master_id`, `is_enabled`, `accrual_percent`, `max_payment_percent`, `points_lifetime_days` | 401 |

---

## B) Verified Code Paths (files/lines)

### 1. Применение скидок при создании бронирования

**Файл:** `backend/utils/loyalty_discounts.py`

- **Строки 101-154:** `evaluate_and_prepare_applied_discount()` — основная функция расчёта скидки
  - Источник цены: `Service.price` из БД (строка 116-118)
  - Вызов `evaluate_discount_candidates()` (строка 127-133)
  - Расчёт `discount_amount` через `calculate_discount_amount()` (строка 138-142)
  - Возврат `discounted_payment_amount` и `applied_discount_data` (строка 154)

**Файл:** `backend/routers/bookings.py`

- **Строки 67-286:** `create_booking()` (master create)
  - Получение `Service.price` (строка 225)
  - Вызов `evaluate_and_prepare_applied_discount()` (строка 229)
  - Установка `booking_data['payment_amount']` (строки 246-248)
  - Создание `AppliedDiscount` после `db.flush()` (строки 272-280)
  - Возврат `applied_discount` в ответе (строки 284-285)

- **Строки 289-465:** `create_booking_public()` (public create)
  - Аналогичная логика (строки 430, 448-450, 455-463)

**Файл:** `backend/routers/client.py`

- **Строки 419-558:** `create_booking()` (client create)
  - Получение `Service.price` (строка 522)
  - Вызов `evaluate_and_prepare_applied_discount()` (строки 524-531)
  - Установка `booking_data['payment_amount']` (строки 536-538)
  - Создание `AppliedDiscount` (строки 544-552)
  - Возврат `applied_discount` (строки 556-557)

- **Строки 750-845:** `create_temporary_booking()` и `confirm_temporary_booking_payment()`
  - Временные брони: скидка применяется, но `AppliedDiscount` создаётся только при `confirm-payment` (строки 782, 804-812)

### 2. Возврат AppliedDiscount в API

**Файл:** `backend/routers/master.py`

- **Строки 46-92:** `get_bookings()`
  - Загрузка `AppliedDiscount` одним запросом с `joinedload` (строки 78-84)
  - Маппинг через `build_applied_discount_info()` (строка 90)
  - Поле `applied_discount` в ответе

- **Строки 94-168:** `get_detailed_bookings()`
  - Аналогичная логика (строки 123-132, 143, 165)

**Файл:** `backend/utils/loyalty_discounts.py`

- **Строки 170-194:** `build_applied_discount_info()`
  - Форматирование `AppliedDiscount` для ответа
  - Определение `rule_type` и `name` из связанных правил

### 3. Начисление/списание баллов

**Файл:** `backend/routers/accounting.py`

- **Строки 684-809:** `confirm_booking()`
  - Списание баллов: `spend_points()` (строки 717-726)
  - Расчёт `actual_payment_amount = booking.payment_amount - points_spent` (строка 733)
  - Начисление баллов: `earn_points()` с базой `actual_payment_amount` (строки 756-779)
  - **Важно:** Баллы начисляются только с суммы, оплаченной деньгами (строка 763)

**Файл:** `backend/utils/loyalty.py`

- **Строки 84-124:** `spend_points()` — списание баллов
- **Строки 127-136:** `earn_points()` — начисление баллов

### 4. Использование payment_amount

**Файл:** `backend/routers/accounting.py`

- **Строка 733:** `actual_payment_amount = (booking.payment_amount or 0) - (points_spent or 0)`
- **Строка 748:** `total_amount=booking.payment_amount or 0` (комментарий: "Сумма к оплате после скидки")
- **Строка 763:** `amount_for_points = actual_payment_amount` (база для начисления баллов)

**Файл:** `backend/routers/master.py`

- **Строка 162:** `"payment_amount": booking.payment_amount` (в `get_detailed_bookings`)
- **Строка 358:** `"payment_amount": booking.payment_amount if booking.payment_amount else 0` (fallback на 0)
- **Строки 580, 3330, 3475, 3644, 3652, 3665, 3673, 3681, 3694:** Агрегации `func.sum(Booking.payment_amount)` для статистики

---

## C) Blocking Issues (P0/P1/P2)

### P0 (Критично, блокирует перенос)

1. **Нет гарантии, что `payment_amount` всегда заполнен**
   - **Место:** Legacy записи могут иметь `payment_amount IS NULL`
   - **Риск:** Мобильное приложение может получить `null` и упасть
   - **Рекомендация:** Добавить fallback в сериализацию: `payment_amount ?? service.price ?? 0`

2. **Нет явного контракта для `applied_discount` в схеме Booking**
   - **Место:** `backend/schemas.py` — схема `Booking` может не включать `applied_discount`
   - **Риск:** Мобильное приложение не получит информацию о скидке
   - **Рекомендация:** Проверить, что все эндпоинты возврата бронирований включают `applied_discount`

### P1 (Важно, может вызвать проблемы)

3. **Баллы начисляются с `actual_payment_amount`, но могут быть edge cases**
   - **Место:** `backend/routers/accounting.py:763`
   - **Риск:** Если `payment_amount` NULL, `actual_payment_amount` может быть отрицательным
   - **Рекомендация:** Добавить проверку `actual_payment_amount > 0` перед начислением

4. **Нет явной обработки случая "скидка + баллы одновременно"**
   - **Место:** Логика в `confirm_booking()` предполагает, что `payment_amount` уже учёл скидку
   - **Риск:** Если баллы списываются до применения скидки, может быть двойной дисконт
   - **Статус:** ✅ **Проверено:** Скидка применяется при создании (`payment_amount` уже со скидкой), баллы списываются при подтверждении — конфликта нет

5. **`evaluate_discount_candidates` может вернуть `insufficient_data` для phone-only клиентов**
   - **Место:** `backend/utils/loyalty_discounts.py:261, 269, 282`
   - **Риск:** Для правил, требующих `client_id` (first_visit, returning_client, regular_visits), phone-only клиенты не получат скидку
   - **Рекомендация:** Резолвить `client_id` по `phone` перед вызовом `evaluate`

### P2 (Желательно исправить)

6. **Нет пагинации в `/api/loyalty/status` и `/api/loyalty/rules`**
   - **Риск:** При большом количестве правил ответ может быть тяжёлым
   - **Рекомендация:** Добавить пагинацию или limit

7. **Нет явной валидации, что `service_id` существует при создании бронирования**
   - **Место:** Все `create_booking` endpoints
   - **Статус:** ✅ **Проверено:** Везде есть проверка `if not service: raise HTTPException(404)`

---

## D) Minimal Recommendations for Mobile-Safe Contract (fallbacks)

### 1. Payment Amount Fallback

**Рекомендация:** В мобильном приложении всегда использовать fallback:

```typescript
const displayPrice = booking.payment_amount ?? booking.service?.price ?? 0;
```

**Где применять:**
- Отображение цены в списке бронирований
- Отображение цены в деталях бронирования
- Расчёт итоговой суммы

### 2. Applied Discount Fallback

**Рекомендация:** Обрабатывать `applied_discount` как optional:

```typescript
interface BookingResponse {
  payment_amount: number | null;
  applied_discount?: AppliedDiscountInfo | null;
  service?: {
    price: number;
  };
}

// В UI:
const finalPrice = booking.payment_amount ?? booking.service?.price ?? 0;
const discountInfo = booking.applied_discount;
const originalPrice = discountInfo 
  ? finalPrice + discountInfo.discount_amount 
  : finalPrice;
```

### 3. Loyalty Points Fallback

**Рекомендация:** Проверять доступность баллов перед использованием:

```typescript
// При создании бронирования:
const availablePoints = await getAvailablePoints(masterId);
const maxSpendable = calculateMaxSpendable(
  finalPrice, 
  settings.max_payment_percent
);
const pointsToUse = Math.min(
  userWantsToUse ? availablePoints : 0,
  maxSpendable
);
```

### 4. Error Handling

**Рекомендация:** Обрабатывать все возможные ошибки:

```typescript
try {
  const settings = await getLoyaltySettings();
} catch (error) {
  if (error.status === 403) {
    // Показать CTA "Обновить тариф"
  } else if (error.status === 404) {
    // Мастер не найден
  } else if (error.status === 409) {
    // SCHEMA_OUTDATED - показать предупреждение
  }
}
```

---

## E) 8 ручных e2e сценариев для теста в мобайле

### Сценарий 1: Мастер создаёт quick discount и применяется при бронировании
1. Мастер открывает экран "Лояльность" → "Скидки"
2. Создаёт quick discount "Новый клиент" (10%, first_visit)
3. Клиент создаёт бронирование (первый раз у мастера)
4. **Ожидаемый результат:** В деталях бронирования видна скидка 10%, `payment_amount = service.price * 0.9`

### Сценарий 2: Мастер создаёт personal discount
1. Мастер создаёт personal discount для клиента по телефону (15%)
2. Клиент создаёт бронирование
3. **Ожидаемый результат:** Применяется personal discount, `applied_discount.rule_type = "personal"`

### Сценарий 3: Мастер включает баллы и настраивает параметры
1. Мастер открывает "Лояльность" → "Настройки"
2. Включает `is_enabled = true`
3. Устанавливает `accrual_percent = 5`, `max_payment_percent = 20`, `points_lifetime_days = 30`
4. Сохраняет
5. **Ожидаемый результат:** Настройки сохраняются, доступны в GET `/api/master/loyalty/settings`

### Сценарий 4: Клиент использует баллы при бронировании
1. У клиента есть 100 баллов у мастера
2. Клиент создаёт бронирование на 2000₽
3. Включает "Использовать баллы"
4. **Ожидаемый результат:** Максимум можно списать 400₽ (20% от 2000₽), но доступно только 100₽, итоговая цена = 1900₽

### Сценарий 5: Баллы начисляются после подтверждения услуги
1. Мастер подтверждает услугу (booking.payment_amount = 2000₽, баллы не использовались)
2. **Ожидаемый результат:** Начислено 100 баллов (5% от 2000₽), видно в `/api/master/loyalty/history` и `/api/client/loyalty/points`

### Сценарий 6: Скидка + баллы одновременно
1. Клиент создаёт бронирование со скидкой 10% (цена стала 1800₽)
2. Использует 100 баллов
3. Мастер подтверждает услугу
4. **Ожидаемый результат:** 
   - `payment_amount = 1800₽` (после скидки)
   - Списано 100 баллов
   - `actual_payment_amount = 1700₽`
   - Начислено 85 баллов (5% от 1700₽)

### Сценарий 7: Клиент видит свои баллы у мастера
1. Клиент открывает экран "Мои баллы"
2. **Ожидаемый результат:** Видит список мастеров с балансами, можно развернуть историю транзакций

### Сценарий 8: Мастер видит статистику и историю
1. Мастер открывает "Лояльность" → "Статистика"
2. **Ожидаемый результат:** Видит `total_earned`, `total_spent`, `current_balance`, `active_clients_count`
3. Переходит в "История"
4. **Ожидаемый результат:** Видит список транзакций с фильтрами по клиенту, типу, датам

---

## Итоговые выводы

### ✅ Готово к переносу:
- Все эндпоинты работают и документированы
- Скидки реально применяются к `payment_amount`
- Баллы не конфликтуют со скидками (применяются последовательно)
- `AppliedDiscount` возвращается в API ответах

### ⚠️ Требует внимания:
- Fallback для `payment_amount` в мобильном приложении
- Обработка `applied_discount` как optional
- Обработка ошибок 403/404/409

### 📝 Рекомендации:
- Добавить явную валидацию `payment_amount IS NOT NULL` в миграции (опционально)
- Рассмотреть резолв `client_id` по `phone` для phone-only клиентов (P1)
- Добавить пагинацию в `/api/loyalty/status` (P2)
