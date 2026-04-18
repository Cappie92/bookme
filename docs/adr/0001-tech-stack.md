# ADR-0001: Выбор технологического стека

**Дата:** 2024-10-21

**Статус:** Принято

**Контекст:** Команда разработки DeDato

---

## Контекст и проблема

При запуске проекта DeDato (платформа бронирования услуг для мастеров и салонов красоты) необходимо было выбрать технологический стек, который обеспечит:

- Быструю разработку MVP
- Высокую производительность API
- Современный и отзывчивый пользовательский интерфейс
- Простоту развертывания и поддержки
- Масштабируемость при росте нагрузки

### Требования

**Функциональные:**
- RESTful API для мобильных и веб-клиентов
- Система аутентификации и авторизации
- Управление бронированиями в реальном времени
- Финансовая отчетность и статистика

**Нефункциональные:**
- Время отклика API < 200ms для 95% запросов
- Поддержка 100+ одновременных пользователей
- Простота развертывания в Docker
- Автоматическая документация API

## Рассмотренные варианты

### Вариант 1: FastAPI + React

**Backend:** FastAPI (Python 3.9+), SQLAlchemy, Pydantic
**Frontend:** React 18, Vite, TailwindCSS
**Database:** SQLite (development), PostgreSQL (production)

**Плюсы:**
- FastAPI генерирует автоматическую OpenAPI документацию
- Высокая производительность благодаря async/await
- Pydantic обеспечивает строгую валидацию данных
- React + Vite дают быструю разработку и HMR
- TailwindCSS ускоряет создание UI
- Python хорошо знаком команде

**Минусы:**
- Необходимость управления типами данных между Python и TypeScript
- Python может быть медленнее Go/Rust для высоконагруженных задач

### Вариант 2: Node.js (Express/NestJS) + React

**Backend:** NestJS/Express, TypeORM, TypeScript
**Frontend:** React 18, Next.js, TailwindCSS

**Плюсы:**
- Единый язык (TypeScript) для backend и frontend
- Большая экосистема npm пакетов
- Next.js с SSR для SEO

**Минусы:**
- Менее строгая типизация по сравнению с FastAPI + Pydantic
- Нет автоматической генерации OpenAPI документации
- TypeORM менее зрелый чем SQLAlchemy

### Вариант 3: Django REST + React

**Backend:** Django, Django REST Framework
**Frontend:** React 18, Create React App

**Плюсы:**
- Django admin panel из коробки
- Зрелая ORM
- Большое сообщество

**Минусы:**
- Более тяжеловесный чем FastAPI
- Медленнее для API-only приложений
- Сложнее настройка async операций

## Принятое решение

**Выбран:** Вариант 1 (FastAPI + React)

### Обоснование

FastAPI был выбран как наиболее подходящий вариант по следующим критериям:

1. **Производительность:** FastAPI один из самых быстрых Python фреймворков, сопоставим с Node.js и Go
2. **Автодокументация:** Swagger UI и ReDoc генерируются автоматически из кода
3. **Типизация:** Pydantic обеспечивает строгую валидацию на уровне типов
4. **Async:** Нативная поддержка async/await для высокой пропускной способности
5. **Быстрая разработка:** Автоматическая валидация, сериализация, документация

React + Vite выбраны для frontend из-за:

1. **Скорость разработки:** Vite предоставляет мгновенный HMR
2. **Экосистема:** Огромное количество готовых компонентов
3. **Производительность:** Virtual DOM и эффективный рендеринг
4. **TailwindCSS:** Utility-first подход ускоряет создание UI

## Последствия

### Положительные

- Быстрая разработка благодаря автоматической валидации и документации
- Высокая производительность API (async/await)
- Удобная разработка UI с HMR и TailwindCSS
- Автоматическая OpenAPI спецификация для интеграций
- Простое развертывание в Docker

### Отрицательные

- Необходимость синхронизации типов между Python (Pydantic) и TypeScript
- SQLite не подходит для высоких нагрузок (планируется миграция на PostgreSQL)
- Две разные экосистемы (Python и JavaScript) требуют знания обеих

### Риски

**Риск:** SQLite может не справиться с нагрузкой при росте пользователей

**Митигация:** Запланирована миграция на PostgreSQL при достижении 1000+ активных пользователей. Alembic используется для управления миграциями.

**Риск:** Отсутствие TypeScript на backend может привести к ошибкам типов

**Митигация:** Pydantic schemas строго типизированы. Планируется генерация TypeScript типов из Pydantic моделей.

## Детали реализации

### Backend Stack

```python
# requirements.txt (ключевые зависимости)
fastapi==0.109.2         # Web framework
uvicorn==0.27.1          # ASGI server
sqlalchemy==2.0.25       # ORM
pydantic==2.6.1          # Data validation
alembic==1.13.1          # Database migrations
python-jose[cryptography] # JWT tokens
passlib[bcrypt]          # Password hashing
```

### Frontend Stack

```json
{
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "react-router-dom": "^6.x",
    "axios": "^1.x"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.x",
    "vite": "^6.x",
    "tailwindcss": "^3.x",
    "autoprefixer": "^10.x",
    "postcss": "^8.x"
  }
}
```

### Архитектура

```
Backend (FastAPI)
├── routers/           # API endpoints
├── models/            # SQLAlchemy models
├── schemas/           # Pydantic schemas
├── services/          # Business logic
└── utils/             # Helper functions

Frontend (React + Vite)
├── src/
│   ├── pages/         # Page components
│   ├── components/    # Reusable components
│   ├── layouts/       # Layout components
│   ├── modals/        # Modal dialogs
│   └── utils/         # Helper functions
```

## Связанные решения

- ADR-0002: Выбор базы данных
- ADR-0004: Аутентификация и авторизация

## Примечания

**Версии на момент принятия решения:**
- Python: 3.9
- FastAPI: 0.109.2
- React: 18.2.0
- Vite: 6.3.5

**Обновления:**
- 2024-10-21: Первоначальное решение



