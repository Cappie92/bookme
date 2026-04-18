# 📊 Сравнение API эндпоинтов: Веб vs Мобильное приложение

## ✅ Соответствие эндпоинтов

### Авторизация
| Функция | Веб | Мобильное | Статус |
|---------|-----|-----------|--------|
| Логин | `/api/auth/login` | `/api/auth/login` | ✅ Совпадает |
| Текущий пользователь | `/api/auth/users/me` | `/api/auth/users/me` | ✅ Совпадает |

### Бронирования

#### Для мастера
| Функция | Веб | Мобильное | Статус |
|---------|-----|-----------|--------|
| Список бронирований | `/api/master/bookings/detailed` | `/api/master/bookings` → **ИСПРАВЛЕНО** → `/api/master/bookings/detailed` | ✅ Исправлено |
| Детали бронирования | `/api/bookings/{id}` | `/api/bookings/{id}` | ✅ Совпадает |

#### Для клиента
| Функция | Веб | Мобильное | Статус |
|---------|-----|-----------|--------|
| Будущие бронирования | `/api/client/` | `/api/client` | ✅ Совпадает |
| Детали бронирования | `/api/bookings/{id}` | `/api/bookings/{id}` | ✅ Совпадает |

### Подписки
| Функция | Веб | Мобильное | Статус |
|---------|-----|-----------|--------|
| Текущая подписка | `/api/subscriptions/my` | `/api/subscriptions/my` | ✅ Совпадает |
| Доступные планы | `/api/subscription-plans/available?subscription_type={type}` | `/api/subscription-plans/available?subscription_type={type}` | ✅ Совпадает |

---

## 🔍 Различия в структуре данных

### `/api/master/bookings/detailed` (используется в веб)

Возвращает:
```json
{
  "id": 1,
  "client_id": 123,
  "client_name": "Иван Иванов",  // ← Дополнительное поле
  "service_id": 456,
  "service_name": "Стрижка",
  "service_duration": 60,        // ← Дополнительное поле
  "service_price": 1500,         // ← Дополнительное поле
  "master_id": 789,
  "salon_id": 101,
  "branch_id": 202,
  "start_time": "2025-12-10T10:00:00",
  "end_time": "2025-12-10T11:00:00",
  "status": "created",
  "notes": "...",
  "payment_method": "on_visit",
  "payment_amount": 1500,
  "created_at": "...",
  "updated_at": "..."
}
```

### `/api/master/bookings` (старый эндпоинт)

Возвращает базовый `BookingSchema` без дополнительных полей:
- ❌ Нет `client_name`
- ❌ Нет `service_duration`
- ❌ Нет `service_price`
- ✅ Есть только базовые поля

---

## ✅ Исправления

### 1. Эндпоинт для мастера
**Было:** `/api/master/bookings`  
**Стало:** `/api/master/bookings/detailed`  
**Причина:** Веб-версия использует `/detailed`, который возвращает полную информацию

### 2. Интерфейс Booking
**Обновлено:** Добавлены опциональные поля из `/detailed`:
- `client_name?: string | null`
- `service_duration?: number | null`
- `service_price?: number | null`

---

## 📝 Эндпоинты, которые не используются в мобильном приложении (но есть в веб)

Эти эндпоинты используются в веб-версии, но пока не реализованы в мобильном:

1. `/api/master/settings` - настройки мастера
2. `/api/master/bookings/limit` - лимит записей
3. `/api/master/invitations` - приглашения
4. `/api/master/dashboard/stats` - статистика дашборда
5. `/api/master/stats/extended` - расширенная статистика
6. `/api/master/schedule/weekly` - недельное расписание
7. `/api/master/accounting/summary` - сводка по бухгалтерии
8. `/api/master/accounting/operations` - операции
9. `/api/balance/` - баланс
10. `/api/balance/transactions` - транзакции
11. `/api/balance/subscription-status` - статус подписки (для салона)

**Примечание:** Эти эндпоинты не критичны для базовой функциональности мобильного приложения.

---

## ✅ Итог

Все основные эндпоинты теперь соответствуют веб-версии:
- ✅ Авторизация
- ✅ Бронирования (мастер) - **исправлено на `/detailed`**
- ✅ Бронирования (клиент)
- ✅ Подписки

Мобильное приложение теперь получает те же данные, что и веб-версия.

