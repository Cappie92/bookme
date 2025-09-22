# Архитектурный инвентарь

_Автоматически сгенерировано из кода_

## Контейнеры

| Name | Type | Tech | Exposed | Depends |
|------|------|------|---------|---------|
| Backend API | Application | FastAPI/Python | ✅ | PostgreSQL, Auth Service, SMTP |
| Frontend SPA | Application | React/Vite | ✅ | Backend API |
| Database | DataStore | PostgreSQL | ❌ | - |

## Внешние интеграции

| Name | Kind | Direction | Usage |
|------|------|-----------|-------|
| SMTP/SendGrid | Email Service | outbound | Уведомления о бронированиях |
| Auth Service | Authentication | inbound | Аутентификация пользователей |

## Пользовательские сценарии

1. **create_booking** — Создание бронирования
   Flow: Client → Frontend → Backend-API → DB; уведомление через SMTP

2. **cancel_booking** — Отмена бронирования
   Flow: Client → Frontend → Backend-API → DB; уведомление через SMTP

3. **view_schedule** — Просмотр расписания
   Flow: Client → Frontend → Backend-API → DB

