# DeDato - Документация проекта

Добро пожаловать в документацию проекта DeDato - платформы для бронирования услуг красоты. Здесь вы найдете всю необходимую информацию для понимания архитектуры, разработки и развертывания системы.

## 🏗️ Архитектура системы

### Обзор
- [Архитектурный обзор](architecture/overview.md) - Высокоуровневый обзор системы и принципов
- [C4 Model](c4/) - Диаграммы архитектуры по уровням абстракции

### Детальная архитектура
- [Database Schema](architecture/database-schema.md) - Схема базы данных с ER диаграммой
- [API Design](architecture/api-design.md) - Документация REST API endpoints
- [Frontend Architecture](architecture/frontend-architecture.md) - Архитектура React приложения
- [Business Logic](architecture/business-logic.md) - Бизнес-логика и процессы системы

## 📋 Architecture Decision Records (ADR)

Документированные архитектурные решения с обоснованием выбора:

- [ADR-0001: Выбор технологического стека](adr/0001-tech-stack.md) - FastAPI + React + SQLite
- [ADR-0002: Выбор базы данных](adr/0002-database-choice.md) - SQLite с планами миграции на PostgreSQL
- [ADR-0003: Система статусов записей](adr/0003-booking-status-system.md) - Жизненный цикл бронирований
- [ADR-0004: Аутентификация и авторизация](adr/0004-authentication-jwt.md) - JWT токены и роли
- [ADR-0005: Управление временными слотами](adr/0005-slot-management.md) - 10-минутная гранулярность

## 🚀 Развертывание и инфраструктура

### Инфраструктура
- [Infrastructure](deployment/infrastructure.md) — текущая инфраструктура и сервер; Docker/CI и прод-runbook см. также корневые `PROD_DEPLOY.md`, `docker-compose.prod.yml` в репозитории.

## 👨‍💻 Руководства для разработчиков

### Начало работы
- [Getting Started](guides/getting-started.md) — быстрый старт для новых разработчиков (workflow и тесты — в этом репозитории дополняются корневым `README.md` и `docs/E2E_RUNBOOK.md`).

## 📊 C4 Model - Диаграммы архитектуры

### Уровни абстракции
- [Level 1: System Context](c4/01-context.md) - Система в контексте внешних акторов
- [Level 2: Container](c4/02-container.md) - Высокоуровневая архитектура контейнеров
- [Level 3: Backend Components](c4/03-component-backend.md) - Компоненты FastAPI backend
- [Level 4: Frontend Components](c4/04-component-frontend.md) - Компоненты React frontend

## 🛠️ Технологический стек

### Backend
- **FastAPI 0.109.2** - Современный Python web framework
- **SQLAlchemy 2.0.25** - ORM для работы с БД
- **SQLite** - База данных (с планами миграции на PostgreSQL)
- **Alembic** - Миграции базы данных
- **JWT** - Аутентификация и авторизация

### Frontend
- **React 18** - UI библиотека
- **Vite 6** - Build tool и dev server
- **TailwindCSS** - Utility-first CSS framework
- **React Router** - Клиентская маршрутизация
- **Axios** - HTTP клиент

### Infrastructure
- **Docker & Docker Compose** - Контейнеризация
- **Nginx** - Reverse proxy и статические файлы
- **Ubuntu 20.04** - Операционная система

## 🏢 Основные функции системы

### Для клиентов
- 🔍 Поиск мастеров и салонов по услугам и геолокации
- 📅 Бронирование услуг с 10-минутной точностью
- 📱 Управление записями и историей посещений
- 📝 Заметки о мастерах и салонах
- 📊 Персональная статистика

### Для мастеров
- 🛠️ Управление услугами, ценами и описаниями
- ⏰ Создание и управление рабочим расписанием
- ✅ Подтверждение и отмена записей
- 💰 Финансовая отчетность и аналитика
- 📈 Статистика доходов и популярности услуг

### Для владельцев салонов
- 🏢 Управление филиалами и рабочими местами
- 👥 Назначение мастеров на места
- 📊 Общая аналитика и отчетность
- ⚙️ Системные настройки и конфигурация

## 📈 Статус проекта

- ✅ **MVP готов** - Основная функциональность реализована
- ✅ **Production развертывание** - Работает на сервере 193.160.208.206
- 🔄 **Активная разработка** - Постоянные улучшения и новые функции
- 📈 **Масштабирование** - Планы по миграции на PostgreSQL и Kubernetes

## 🔗 Полезные ссылки

- [GitHub Repository](https://github.com/your-org/dedato)
- [Live Application](http://193.160.208.206)
- [API Documentation](http://193.160.208.206:8000/docs)
- [Issues & Bug Reports](https://github.com/your-org/dedato/issues)

## 📞 Контакты

- **Email:** support@dedato.com
- **Website:** https://dedato.com
- **Documentation:** Этот сайт

---

*Документация обновлена: 2024-10-21* 