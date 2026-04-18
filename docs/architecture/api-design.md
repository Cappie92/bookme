# API Design - DeDato

## Обзор

DeDato API построен на FastAPI и следует REST принципам. API предоставляет полный набор endpoints для управления пользователями, бронированиями, услугами, расписаниями и финансовой отчетностью.

## Базовые принципы

### 1. RESTful Design
- Использование HTTP методов (GET, POST, PUT, DELETE)
- Ресурс-ориентированные URL
- Стандартные HTTP статус коды
- JSON для обмена данными

### 2. Версионирование
- Версионирование через URL: `/api/v1/`
- Обратная совместимость
- Deprecation policy

### 3. Аутентификация
- JWT Bearer tokens
- Автоматическая генерация OpenAPI документации
- Защищенные и публичные endpoints

### 4. Валидация данных
- Pydantic schemas для валидации
- Автоматическая документация
- Детальные сообщения об ошибках

## Базовый URL и версионирование

```
Base URL: https://api.dedato.com/api/v1
Development: http://localhost:8000/api/v1
```

## Аутентификация

### JWT Token Authentication
```http
Authorization: Bearer <access_token>
```

### Получение токена
```http
POST /api/v1/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "password123"
}
```

**Response:**
```json
{
  "access_token": "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9...",
  "refresh_token": "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9...",
  "token_type": "bearer",
  "expires_in": 1800
}
```

## Структура API

### 1. Authentication (`/auth/*`)

#### POST `/auth/register`
Регистрация нового пользователя

**Request:**
```json
{
  "email": "user@example.com",
  "phone": "+79123456789",
  "password": "password123",
  "full_name": "Иван Иванов",
  "role": "client"
}
```

**Response:**
```json
{
  "access_token": "...",
  "refresh_token": "...",
  "user": {
    "id": 1,
    "email": "user@example.com",
    "role": "client",
    "is_verified": false
  }
}
```

#### POST `/auth/login`
Вход в систему

#### POST `/auth/refresh`
Обновление access token

#### POST `/auth/forgot-password`
Сброс пароля

#### POST `/auth/verify-email`
Верификация email

---

### 2. Bookings (`/bookings/*`)

#### POST `/bookings/`
Создание нового бронирования

**Request:**
```json
{
  "master_id": 1,
  "service_id": 1,
  "start_time": "2024-10-25T14:00:00Z",
  "end_time": "2024-10-25T15:00:00Z",
  "notes": "Дополнительные пожелания"
}
```

**Response:**
```json
{
  "id": 1,
  "client_id": 2,
  "master_id": 1,
  "service_id": 1,
  "start_time": "2024-10-25T14:00:00Z",
  "end_time": "2024-10-25T15:00:00Z",
  "status": "created",
  "payment_amount": 2000.00,
  "created_at": "2024-10-21T10:00:00Z"
}
```

#### GET `/bookings/`
Получение списка бронирований

**Query Parameters:**
- `page` (int): Номер страницы (default: 1)
- `limit` (int): Количество записей (default: 20)
- `status` (str): Фильтр по статусу
- `master_id` (int): Фильтр по мастеру
- `client_id` (int): Фильтр по клиенту

**Response:**
```json
{
  "bookings": [
    {
      "id": 1,
      "client_name": "Иван Иванов",
      "master_name": "Анна Петрова",
      "service_name": "Стрижка",
      "start_time": "2024-10-25T14:00:00Z",
      "end_time": "2024-10-25T15:00:00Z",
      "status": "created",
      "payment_amount": 2000.00
    }
  ],
  "total": 1,
  "page": 1,
  "pages": 1
}
```

#### GET `/bookings/{booking_id}`
Получение детальной информации о бронировании

#### PUT `/bookings/{booking_id}`
Обновление бронирования

#### DELETE `/bookings/{booking_id}`
Отмена бронирования

---

### 3. Master API (`/master/*`)

#### GET `/master/dashboard`
Дашборд мастера

**Response:**
```json
{
  "stats": {
    "total_bookings": 45,
    "pending_confirmations": 3,
    "monthly_income": 85000.00,
    "upcoming_bookings": 5
  },
  "recent_bookings": [
    {
      "id": 1,
      "client_name": "Иван Иванов",
      "service_name": "Стрижка",
      "start_time": "2024-10-25T14:00:00Z",
      "status": "created"
    }
  ]
}
```

#### GET `/master/services`
Список услуг мастера

#### POST `/master/services`
Создание новой услуги

**Request:**
```json
{
  "name": "Стрижка мужская",
  "description": "Классическая мужская стрижка",
  "duration_minutes": 60,
  "price": 2000.00
}
```

#### GET `/master/bookings`
Записи мастера

#### GET `/master/schedule`
Расписание мастера

#### POST `/master/schedule`
Создание расписания

**Request:**
```json
{
  "date": "2024-10-25",
  "start_time": "09:00:00",
  "end_time": "18:00:00",
  "is_available": true
}
```

#### GET `/master/past-appointments`
Прошедшие записи

**Query Parameters:**
- `page` (int): Номер страницы
- `limit` (int): Количество записей
- `status` (str): Фильтр по статусу
- `date_from` (str): Дата начала периода
- `date_to` (str): Дата окончания периода

---

### 4. Salon API (`/salon/*`)

#### GET `/salon/branches`
Список филиалов салона

#### POST `/salon/branches`
Создание филиала

**Request:**
```json
{
  "name": "Филиал на Тверской",
  "address": "ул. Тверская, 1",
  "phone": "+79123456789",
  "latitude": 55.7558,
  "longitude": 37.6176
}
```

#### GET `/salon/masters`
Мастера салона

#### POST `/salon/assign-master`
Назначение мастера на место

**Request:**
```json
{
  "master_id": 1,
  "branch_id": 1,
  "place_id": 1
}
```

#### GET `/salon/places`
Рабочие места

#### POST `/salon/places`
Создание рабочего места

---

### 5. Client API (`/client/*`)

#### GET `/client/dashboard`
Дашборд клиента

**Response:**
```json
{
  "upcoming_bookings": [
    {
      "id": 1,
      "master_name": "Анна Петрова",
      "service_name": "Стрижка",
      "start_time": "2024-10-25T14:00:00Z",
      "salon_name": "Салон красоты"
    }
  ],
  "recent_bookings": [
    {
      "id": 2,
      "master_name": "Мария Сидорова",
      "service_name": "Маникюр",
      "start_time": "2024-10-20T10:00:00Z",
      "status": "completed"
    }
  ]
}
```

#### GET `/client/bookings`
История записей клиента

#### GET `/client/notes`
Заметки о мастерах

#### POST `/client/notes`
Создание заметки

**Request:**
```json
{
  "master_id": 1,
  "salon_id": 1,
  "note": "Отличный мастер, очень рекомендую"
}
```

---

### 6. Accounting API (`/accounting/*`)

#### GET `/accounting/summary`
Финансовая сводка

**Query Parameters:**
- `date_from` (str): Дата начала периода
- `date_to` (str): Дата окончания периода

**Response:**
```json
{
  "total_income": 85000.00,
  "expected_income": 15000.00,
  "total_expense": 12000.00,
  "net_profit": 73000.00,
  "bookings_count": 45,
  "completed_bookings": 42,
  "cancelled_bookings": 3
}
```

#### POST `/accounting/confirm-booking/{booking_id}`
Подтверждение записи

**Response:**
```json
{
  "message": "Запись подтверждена",
  "booking_id": 1,
  "confirmed_income": 2000.00
}
```

#### POST `/accounting/cancel-booking/{booking_id}`
Отмена записи

**Query Parameters:**
- `cancellation_reason` (str): Причина отмены

**Request:**
```json
{
  "cancellation_reason": "client_requested"
}
```

#### GET `/accounting/expenses`
Расходы мастера

#### POST `/accounting/expenses`
Добавление расхода

**Request:**
```json
{
  "category": "Материалы",
  "description": "Покупка шампуня",
  "amount": 1500.00,
  "expense_date": "2024-10-21"
}
```

#### GET `/accounting/pending-confirmations`
Записи на подтверждение

---

### 7. Admin API (`/admin/*`)

#### GET `/admin/users`
Список пользователей (пагинация на сервере).

**Query Parameters:**
- `skip` (int, default 0): смещение
- `limit` (int, default 30, max 2000): размер страницы
- `role` (str): фильтр по роли
- `search` (str): поиск по имени/email/телефону
- `user_id` (int): фильтр по ID
- `always_free` (bool): фильтр по флагу «всегда бесплатно»

**Response:** `{ "items": [...], "total": N, "skip": ..., "limit": ... }`

#### PUT `/admin/users/{user_id}`
Обновление пользователя

#### GET `/admin/analytics`
Аналитика системы

**Response:**
```json
{
  "total_users": 1250,
  "active_masters": 45,
  "total_bookings": 12500,
  "monthly_revenue": 2500000.00,
  "conversion_rate": 0.15
}
```

---

## Статус коды HTTP

### Успешные ответы
- `200 OK` - Успешный запрос
- `201 Created` - Ресурс создан
- `204 No Content` - Успешный запрос без содержимого

### Ошибки клиента
- `400 Bad Request` - Некорректный запрос
- `401 Unauthorized` - Не авторизован
- `403 Forbidden` - Доступ запрещен
- `404 Not Found` - Ресурс не найден
- `409 Conflict` - Конфликт данных
- `422 Unprocessable Entity` - Ошибка валидации

### Ошибки сервера
- `500 Internal Server Error` - Внутренняя ошибка сервера
- `502 Bad Gateway` - Ошибка шлюза
- `503 Service Unavailable` - Сервис недоступен

## Формат ошибок

### Стандартный формат ошибки
```json
{
  "detail": "Описание ошибки",
  "error_code": "VALIDATION_ERROR",
  "field_errors": {
    "email": ["Email уже используется"],
    "phone": ["Некорректный формат телефона"]
  }
}
```

### Примеры ошибок

#### 400 Bad Request
```json
{
  "detail": "Некорректные данные запроса",
  "error_code": "INVALID_REQUEST"
}
```

#### 401 Unauthorized
```json
{
  "detail": "Не авторизован",
  "error_code": "UNAUTHORIZED"
}
```

#### 422 Validation Error
```json
{
  "detail": "Ошибка валидации данных",
  "error_code": "VALIDATION_ERROR",
  "field_errors": {
    "email": ["Email обязателен"],
    "password": ["Пароль должен содержать минимум 8 символов"]
  }
}
```

## Пагинация

### Стандартная пагинация
```json
{
  "data": [...],
  "total": 100,
  "page": 1,
  "limit": 20,
  "pages": 5,
  "has_next": true,
  "has_prev": false
}
```

### Query параметры
- `page` (int): Номер страницы (default: 1)
- `limit` (int): Количество записей (default: 20, max: 100)
- `sort` (str): Поле для сортировки
- `order` (str): Порядок сортировки (asc, desc)

## Фильтрация и поиск

### Фильтрация
```http
GET /api/v1/bookings?status=created&master_id=1&date_from=2024-10-01
```

### Поиск
```http
GET /api/v1/masters?search=Анна&city=Москва
```

### Сортировка
```http
GET /api/v1/bookings?sort=start_time&order=desc
```

## Rate Limiting

### Лимиты запросов
- **Аутентификация:** 5 запросов в минуту
- **API endpoints:** 100 запросов в минуту
- **Загрузка файлов:** 10 запросов в минуту

### Headers
```http
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1640995200
```

## Webhooks (будущая функциональность)

### Поддерживаемые события
- `booking.created` - Создано бронирование
- `booking.confirmed` - Подтверждено бронирование
- `booking.cancelled` - Отменено бронирование
- `user.registered` - Зарегистрирован пользователь

### Формат webhook
```json
{
  "event": "booking.created",
  "timestamp": "2024-10-21T10:00:00Z",
  "data": {
    "booking_id": 1,
    "client_id": 2,
    "master_id": 1,
    "start_time": "2024-10-25T14:00:00Z"
  }
}
```

## OpenAPI документация

### Автоматическая документация
- **Swagger UI:** `/docs`
- **ReDoc:** `/redoc`
- **OpenAPI JSON:** `/openapi.json`

### Пример использования
```bash
# Получение OpenAPI схемы
curl http://localhost:8000/openapi.json

# Просмотр Swagger UI
open http://localhost:8000/docs
```

## SDK и клиенты

### JavaScript/TypeScript
```javascript
// Пример использования API
const response = await fetch('/api/v1/bookings', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    master_id: 1,
    service_id: 1,
    start_time: '2024-10-25T14:00:00Z'
  })
});

const booking = await response.json();
```

### Python
```python
import requests

headers = {'Authorization': f'Bearer {token}'}
response = requests.post('/api/v1/bookings', 
                        json=booking_data, 
                        headers=headers)
booking = response.json()
```

## Тестирование API

### Postman Collection
- Импорт коллекции из `/docs/postman.json`
- Автоматическая аутентификация
- Примеры запросов для всех endpoints

### cURL примеры
```bash
# Создание бронирования
curl -X POST http://localhost:8000/api/v1/bookings \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "master_id": 1,
    "service_id": 1,
    "start_time": "2024-10-25T14:00:00Z"
  }'
```

## Мониторинг и метрики

### Health Check
```http
GET /health
```

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2024-10-21T10:00:00Z",
  "version": "1.0.0",
  "database": "connected",
  "external_services": {
    "yandex_maps": "available",
    "zvonok_sms": "available",
    "email_service": "available"
  }
}
```

### Метрики
- Response time по endpoints
- Error rate по статус кодам
- Throughput (запросов в секунду)
- Active users

## Связанные документы

- [ADR-0004: Аутентификация и авторизация](../adr/0004-authentication-jwt.md)
- [Database Schema](database-schema.md)
- [Frontend Architecture](frontend-architecture.md)
- [C4 Model: Backend Components](../c4/03-component-backend.md)


