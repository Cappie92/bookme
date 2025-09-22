# System overview

# System overview

<!-- BEGIN:AUTOGEN_OVERVIEW -->
_Секция ниже генерируется автоматически из C4-инвентаря; не редактируйте вручную._

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

## Основные пользовательские сценарии
1. **create_booking** — Создание бронирования
   Client → Frontend → Backend-API → DB; уведомление через SMTP

2. **cancel_booking** — Отмена бронирования
   Client → Frontend → Backend-API → DB; уведомление через SMTP

3. **view_schedule** — Просмотр расписания
   Client → Frontend → Backend-API → DB

<!-- END:AUTOGEN_OVERVIEW -->

## Notes (редактируйте свободно)
– Здесь можно писать дополнительные комментарии, ссылки, RFC …

## Notes (редактируйте свободно)
– Здесь можно писать дополнительные комментарии, ссылки, RFC …
