# Getting Started - DeDato

## Обзор

Это руководство поможет вам быстро настроить локальную среду разработки для проекта DeDato. Вы сможете запустить приложение на своем компьютере и начать разработку.

## Предварительные требования

### Системные требования
- **OS:** macOS, Linux, или Windows 10/11
- **RAM:** Минимум 4GB, рекомендуется 8GB
- **Диск:** 2GB свободного места
- **Интернет:** Стабильное соединение для загрузки зависимостей

### Необходимое ПО
- **Node.js:** 18.x или выше
- **Python:** 3.9 или выше
- **Git:** 2.x или выше
- **Docker:** 20.x или выше (опционально)

## Установка зависимостей

### 1. Node.js и npm
```bash
# Проверка версии
node --version  # должно быть 18.x или выше
npm --version   # должно быть 8.x или выше

# Если не установлен, скачайте с https://nodejs.org/
```

### 2. Python
```bash
# Проверка версии
python3 --version  # должно быть 3.9 или выше
pip3 --version     # должно быть 21.x или выше

# Если не установлен:
# macOS: brew install python3
# Ubuntu: sudo apt install python3 python3-pip
# Windows: скачайте с https://python.org/
```

### 3. Git
```bash
# Проверка версии
git --version  # должно быть 2.x или выше

# Если не установлен:
# macOS: brew install git
# Ubuntu: sudo apt install git
# Windows: скачайте с https://git-scm.com/
```

## Клонирование репозитория

### 1. Клонирование
```bash
# Клонируйте репозиторий
git clone https://github.com/your-org/dedato.git
cd dedato

# Проверьте структуру проекта
ls -la
```

### 2. Структура проекта
```
dedato/
├── backend/                 # FastAPI backend
│   ├── main.py
│   ├── models.py
│   ├── requirements.txt
│   └── ...
├── frontend/               # React frontend
│   ├── src/
│   ├── package.json
│   └── ...
├── docs/                   # Документация
├── docker-compose.yml      # Docker для разработки
├── docker-compose.prod.yml # Docker для production
└── README.md
```

## Настройка Backend

### 1. Переход в директорию backend
```bash
cd backend
```

### 2. Создание виртуального окружения
```bash
# Создание виртуального окружения
python3 -m venv venv

# Активация виртуального окружения
# macOS/Linux:
source venv/bin/activate
# Windows:
# venv\Scripts\activate
```

### 3. Установка зависимостей
```bash
# Обновление pip
pip install --upgrade pip

# Установка зависимостей
pip install -r requirements.txt
```

### 4. Настройка переменных окружения
```bash
# Создание файла .env
cat > .env << EOF
SECRET_KEY=your-secret-key-change-in-production
DATABASE_URL=sqlite:///./bookme.db
DEBUG=True
ENVIRONMENT=development
EOF
```

### 5. Инициализация базы данных
```bash
# Создание миграций (если нужно)
alembic upgrade head

# Или создание базы данных с нуля
python -c "from database import engine; from models import Base; Base.metadata.create_all(bind=engine)"
```

### 6. Запуск backend сервера
```bash
# Запуск в режиме разработки
uvicorn main:app --reload --host 0.0.0.0 --port 8000

# Или через Python
python main.py
```

### 7. Проверка работы backend
```bash
# Проверка health check
curl http://localhost:8000/health

# Проверка API документации
open http://localhost:8000/docs
```

## Настройка Frontend

### 1. Переход в директорию frontend
```bash
cd ../frontend
```

### 2. Установка зависимостей
```bash
# Установка npm пакетов
npm install

# Или с yarn (если предпочитаете)
yarn install
```

### 3. Настройка переменных окружения
```bash
# Создание файла .env.local
cat > .env.local << EOF
VITE_API_URL=http://localhost:8000/api/v1
VITE_ENVIRONMENT=development
EOF
```

### 4. Запуск frontend сервера
```bash
# Запуск в режиме разработки
npm run dev

# Или с yarn
yarn dev
```

### 5. Проверка работы frontend
```bash
# Откройте браузер
open http://localhost:5173
```

## Альтернативный запуск через Docker

### 1. Запуск всех сервисов
```bash
# Из корневой директории проекта
docker-compose up -d

# Просмотр логов
docker-compose logs -f
```

### 2. Проверка контейнеров
```bash
# Список запущенных контейнеров
docker-compose ps

# Проверка логов конкретного сервиса
docker-compose logs backend
docker-compose logs frontend
```

### 3. Остановка сервисов
```bash
# Остановка всех сервисов
docker-compose down

# Остановка с удалением volumes
docker-compose down -v
```

## Первоначальная настройка данных

### 1. Создание администратора
```bash
# Переход в backend директорию
cd backend

# Запуск Python shell
python -c "
from database import SessionLocal
from models import User
from auth import get_password_hash

db = SessionLocal()

# Создание администратора
admin = User(
    email='admin@dedato.com',
    phone='+79123456789',
    hashed_password=get_password_hash('admin123'),
    role='admin',
    is_active=True,
    is_verified=True,
    is_phone_verified=True,
    full_name='Администратор'
)

db.add(admin)
db.commit()
print('Администратор создан: admin@dedato.com / admin123')
"
```

### 2. Создание тестовых данных
```bash
# Запуск скрипта создания тестовых данных
python create_test_data.py
```

## Проверка работоспособности

### 1. Backend API
```bash
# Health check
curl http://localhost:8000/health

# Список пользователей (требует аутентификации)
curl http://localhost:8000/api/v1/users
```

### 2. Frontend приложение
- Откройте http://localhost:5173
- Проверьте загрузку главной страницы
- Попробуйте зарегистрироваться
- Проверьте работу форм

### 3. Интеграция
- Создайте аккаунт через frontend
- Проверьте, что данные сохраняются в БД
- Проверьте API вызовы в Network tab браузера

## Разработка

### 1. Структура кода
```
backend/
├── main.py              # Точка входа FastAPI
├── models.py            # SQLAlchemy модели
├── schemas.py           # Pydantic схемы
├── auth.py              # Аутентификация
├── database.py          # Подключение к БД
├── routers/             # API endpoints
│   ├── auth.py
│   ├── bookings.py
│   ├── master.py
│   └── ...
├── services/            # Бизнес-логика
├── utils/               # Утилиты
└── alembic/             # Миграции БД

frontend/
├── src/
│   ├── components/      # React компоненты
│   ├── pages/           # Страницы
│   ├── layouts/         # Layout компоненты
│   ├── utils/           # Утилиты
│   ├── services/        # API сервисы
│   └── contexts/        # React Context
├── public/              # Статические файлы
└── dist/                # Собранное приложение
```

### 2. Hot Reload
- **Backend:** Автоматически перезапускается при изменении файлов
- **Frontend:** Автоматически обновляется в браузере

### 3. Отладка
```bash
# Backend логи
tail -f backend/logs/app.log

# Frontend логи
# Откройте Developer Tools в браузере (F12)

# Docker логи
docker-compose logs -f backend
docker-compose logs -f frontend
```

## Частые проблемы и решения

### 1. Порт уже используется
```bash
# Ошибка: Address already in use
# Решение: Найдите и остановите процесс
lsof -ti:8000 | xargs kill -9  # для порта 8000
lsof -ti:5173 | xargs kill -9  # для порта 5173
```

### 2. Ошибки зависимостей
```bash
# Backend
pip install --upgrade pip
pip install -r requirements.txt

# Frontend
rm -rf node_modules package-lock.json
npm install
```

### 3. Проблемы с базой данных
```bash
# Удаление и пересоздание БД
rm backend/bookme.db
cd backend
alembic upgrade head
```

### 4. CORS ошибки
```bash
# Проверьте, что backend запущен на порту 8000
# Проверьте настройки CORS в main.py
```

### 5. Docker проблемы
```bash
# Очистка Docker
docker-compose down -v
docker system prune -a
docker-compose up --build
```

## Полезные команды

### Backend
```bash
# Запуск сервера
uvicorn main:app --reload

# Создание миграции
alembic revision --autogenerate -m "Description"

# Применение миграций
alembic upgrade head

# Откат миграции
alembic downgrade -1

# Запуск тестов
pytest

# Форматирование кода
black .
isort .
```

### Frontend
```bash
# Запуск dev сервера
npm run dev

# Сборка для production
npm run build

# Запуск тестов
npm test

# Линтинг
npm run lint

# Форматирование
npm run format
```

### Docker
```bash
# Запуск всех сервисов
docker-compose up -d

# Просмотр логов
docker-compose logs -f

# Перезапуск сервиса
docker-compose restart backend

# Выполнение команд в контейнере
docker-compose exec backend bash
docker-compose exec frontend sh
```

## Следующие шаги

1. **Изучите документацию:**
   - [Architecture Overview](../architecture/overview.md)
   - [API Design](../architecture/api-design.md)
   - [Database Schema](../architecture/database-schema.md)

2. **Настройте IDE:**
   - VS Code с расширениями для Python и React
   - Настройте линтеры и форматтеры
   - Настройте отладку

3. **Изучите код:**
   - Начните с простых компонентов
   - Изучите API endpoints
   - Понять структуру данных

4. **Начните разработку:**
   - Создайте feature branch
   - Следуйте [Development Workflow](development-workflow.md)
   - Пишите тесты

## Получение помощи

- **Документация:** `/docs` директория
- **API документация:** http://localhost:8000/docs
- **Issues:** GitHub Issues
- **Discussions:** GitHub Discussions

## Связанные документы

- [Development Workflow](development-workflow.md)
- [Testing Guide](testing.md)
- [Architecture Overview](../architecture/overview.md)
- [ADR-0001: Выбор технологического стека](../adr/0001-tech-stack.md)


