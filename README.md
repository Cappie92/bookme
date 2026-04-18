# DeDato - Платформа бронирования услуг красоты

DeDato - это современная платформа для бронирования услуг красоты, которая соединяет клиентов с мастерами и салонами. Система построена на React + FastAPI с использованием современных технологий и лучших практик разработки.

## 🚀 Быстрый старт

```bash
# Клонирование репозитория
git clone https://github.com/your-org/dedato.git
cd dedato

# Запуск через Docker (рекомендуется)
docker-compose up -d

# Или локальная разработка
# Backend: одна команда из каталога backend/ (точка входа main:app)
cd backend && pip3 install -r requirements.txt && python3 -m uvicorn main:app --reload --host 0.0.0.0 --port 8000
cd frontend && npm install && npm run dev
```
**Backend:** минимальный env — `JWT_SECRET_KEY`, `DATABASE_URL`. Удобно: `cp backend/.env.example backend/.env`. Конфигурация только через `backend/settings.py` (get_settings()). Полный список переменных, прод и runbook — [docs/CONFIG_AUDIT.md](docs/CONFIG_AUDIT.md), [docs/CONFIG_CLEANUP_PLAN.md](docs/CONFIG_CLEANUP_PLAN.md). Проверка конфигурации: `make config-runbook`.

**Robokassa (ручной тест в test mode):** шаблоны `backend/.env.robokassa-test.local.example` и `backend/.env.production.example`, инструкция — [backend/docs/robokassa_test_mode.md](backend/docs/robokassa_test_mode.md).

**Приложение будет доступно по адресу:** http://localhost:5173

### Backend: master-only / legacy

Backend по умолчанию работает в **master-only** режиме. Никаких env не требуется.

| Режим | Команда |
|-------|---------|
| **Prod (master-only)** | `cd backend && python3 -m uvicorn main:app --host 127.0.0.1 --port 8000` |
| **Legacy (dev/rollback)** | `cd backend && LEGACY_INDIE_MODE=1 python3 -m uvicorn main:app --host 127.0.0.1 --port 8000` |
| **Debug (fail-fast)** | `cd backend && MASTER_CANON_DEBUG=1 python3 -m uvicorn main:app ...` — orphan/invalid → raise вместо skip |

`MASTER_CANON_MODE` — deprecated. Используйте `LEGACY_INDIE_MODE`. `MASTER_CANON_MODE=0` ⇒ legacy; `MASTER_CANON_MODE=1` ⇒ master-only. Подробнее: [docs/MASTER_CANON_RUNTIME.md](docs/MASTER_CANON_RUNTIME.md).

### Reseed (тестовые данные)

```bash
# Из корня репозитория:
python3 backend/scripts/reseed_local_test_data.py --base-url http://localhost:8000

# Из папки backend/:
cd backend && python3 scripts/reseed_local_test_data.py --base-url http://localhost:8000
```

### Regression checks (master-only)

```bash
make verify-master-canon
make test-master-canon
```

Или напрямую: `cd backend && python3 scripts/verify_master_canon.py` и `cd backend && python3 -m pytest tests/test_master_canon_flags.py tests/test_booking_factory.py -v`.

Ожидаемо: `bookings master_id NULL: 0`, `indie_master_id NOT NULL: 0`, `/favorites/indie-masters` → 410.

## 📚 Документация

### 🏗️ Архитектура
- [Обзор архитектуры](docs/architecture/overview.md) - Высокоуровневый обзор системы
- [C4 Model](docs/c4/) - Диаграммы архитектуры (Context, Container, Components)
- [Database Schema](docs/architecture/database-schema.md) - Схема базы данных с ER диаграммой
- [API Design](docs/architecture/api-design.md) - Документация API endpoints
- [Frontend Architecture](docs/architecture/frontend-architecture.md) - Архитектура React приложения
- [Business Logic](docs/architecture/business-logic.md) - Бизнес-логика системы

### 📋 Architecture Decision Records (ADR)
- [ADR-0001: Выбор технологического стека](docs/adr/0001-tech-stack.md)
- [ADR-0002: Выбор базы данных](docs/adr/0002-database-choice.md)
- [ADR-0003: Система статусов записей](docs/adr/0003-booking-status-system.md)
- [ADR-0004: Аутентификация и авторизация](docs/adr/0004-authentication-jwt.md)
- [ADR-0005: Управление временными слотами](docs/adr/0005-slot-management.md)

### 🚀 Развертывание
- [Infrastructure](docs/deployment/infrastructure.md) - Текущая инфраструктура
- [Docker Setup](docs/deployment/docker-setup.md) - Конфигурация Docker
- [CI/CD Process](docs/deployment/ci-cd.md) - Процесс развертывания

### 👨‍💻 Руководства для разработчиков
- [Getting Started](docs/guides/getting-started.md) - Быстрый старт для разработчиков
- [Development Workflow](docs/guides/development-workflow.md) - Процесс разработки
- [Testing Guide](docs/guides/testing.md) - Руководство по тестированию

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

## 🏢 Основные функции

### Для клиентов
- 🔍 Поиск мастеров и салонов
- 📅 Бронирование услуг с 10-минутной точностью
- 📱 Управление записями
- 📝 Заметки о мастерах
- 📊 История посещений

### Для мастеров
- 🛠️ Управление услугами и ценами
- ⏰ Создание рабочего расписания
- ✅ Подтверждение записей
- 💰 Финансовая отчетность
- 📈 Аналитика доходов

### Для владельцев салонов
- 🏢 Управление филиалами
- 👥 Назначение мастеров
- 📊 Общая аналитика
- ⚙️ Системные настройки

## 🚀 Развертывание

### Production
```bash
# Развертывание на сервере
docker-compose -f docker-compose.prod.yml up -d
```

### Development
```bash
# Локальная разработка
docker-compose up -d
```

### E2E тесты (Playwright)

Для E2E требуется **Vite dev server на 5173** и **backend на 8000** с `DEV_E2E=true`.

#### Быстрый старт
```bash
# Полный прогон (автоматически запускает backend/frontend, выполняет reset+seed, запускает тесты)
./scripts/e2e_full.sh

# Проверка стабильности перед PR (3 последовательных прогона)
RUNS=3 ./scripts/e2e_full.sh
```

#### Ручной запуск (для отладки)
```bash
# Terminal 1: Backend с E2E режимом
cd backend
DEV_E2E=true python3 -m uvicorn main:app --host 0.0.0.0 --port 8000

# Terminal 2: Frontend (Vite dev server)
cd frontend
VITE_API_BASE_URL=http://localhost:8000 npx vite --port 5173 --strictPort

# Terminal 3: Reset + Seed + Tests
curl -X POST http://localhost:8000/api/dev/e2e/seed -H "Content-Type: application/json" -d '{"reset": true}'
cd frontend
E2E_BASE_URL=http://localhost:5173 npx playwright test --project=chromium
```

#### Частые ошибки
- **"E2E preflight failed: cannot reach http://localhost:5173"**
  → Запустите Vite dev server: `cd frontend && npm run dev -- --port 5173 --strictPort`

- **"405 Method Not Allowed" на `/api/dev/e2e/seed`**
  → Установите `DEV_E2E=true` для backend

- **Тесты падают нестабильно**
  → Убедитесь, что используете `./scripts/e2e_full.sh` (выполняет reset+seed перед каждым прогоном)

#### Документация
- [E2E Stabilization PR](E2E_STABILIZATION_PR.md) - Подробное описание E2E инфраструктуры
- [Test ID Contract](frontend/e2e/TESTID_CONTRACT.md) - Список `data-testid` для E2E тестов

При неправильном baseURL или неподнятом Vite тесты упадут сразу с сообщением «запустите Vite на 5173».

## 📊 Статус проекта

- ✅ **MVP готов** - Основная функциональность реализована
- ✅ **Production развертывание** - Работает на сервере 193.160.208.206
- 🔄 **Активная разработка** - Постоянные улучшения и новые функции
- 📈 **Масштабирование** - Планы по миграции на PostgreSQL и Kubernetes

## 🤝 Участие в разработке

1. Форкните репозиторий
2. Создайте feature branch (`git checkout -b feature/amazing-feature`)
3. Зафиксируйте изменения (`git commit -m 'Add amazing feature'`)
4. Отправьте в branch (`git push origin feature/amazing-feature`)
5. Откройте Pull Request

## 📄 Лицензия

Этот проект лицензирован под MIT License - см. файл [LICENSE](LICENSE) для деталей.

## 📞 Контакты

- **Email:** support@dedato.com
- **Website:** https://dedato.com
- **Issues:** [GitHub Issues](https://github.com/your-org/dedato/issues)

## 🙏 Благодарности

- FastAPI за отличный Python web framework
- React команде за мощную UI библиотеку
- TailwindCSS за utility-first CSS framework
- Всем контрибьюторам проекта