# План деплоя Appointo на боевой сервер

## 🎯 Цели деплоя
1. Выделить отдельное место на сервере
2. Настроить robots.txt для исключения из индексации
3. Создать структуру для обновлений

## 📁 1. Структура на сервере

### Рекомендуемая структура:
```
/home/user/
├── telegram-bot/          # Существующий проект
└── appointo/              # Новый проект
    ├── backend/
    ├── frontend/
    ├── docker-compose.yml
    ├── .env
    └── logs/
```

### Команды для создания структуры:
```bash
# На сервере
mkdir -p /home/user/appointo
cd /home/user/appointo
mkdir logs
```

## 🤖 2. Настройка robots.txt

### Вариант A: Без домена (только IP)
- Просто не делегируем домен
- Доступ только по IP: `http://YOUR_SERVER_IP:8000`
- Поисковики не найдут сайт

### Вариант B: С доменом + robots.txt
Создать файл `frontend/public/robots.txt`:
```txt
User-agent: *
Disallow: /
```

### Вариант C: С доменом + noindex мета-теги
Добавить в `frontend/index.html`:
```html
<meta name="robots" content="noindex, nofollow">
<meta name="googlebot" content="noindex, nofollow">
```

## 🔄 3. Структура обновлений

### Рекомендуемый подход: Git + Docker

#### Структура репозитория:
```
appointo/
├── .gitignore
├── docker-compose.yml
├── docker-compose.prod.yml
├── scripts/
│   ├── deploy.sh
│   └── update.sh
├── backend/
├── frontend/
└── docs/
```

#### Процесс обновлений:
1. **Локальная разработка** → коммит в Git
2. **Push в репозиторий** → автоматический деплой
3. **Или ручной деплой** через скрипты

## 🐳 4. Docker конфигурация

### docker-compose.yml (разработка):
```yaml
version: '3.8'
services:
  backend:
    build: ./backend
    ports:
      - "8000:8000"
    volumes:
      - ./backend:/app
    environment:
      - ENVIRONMENT=development

  frontend:
    build: ./frontend
    ports:
      - "5173:5173"
    volumes:
      - ./frontend:/app
    depends_on:
      - backend
```

### docker-compose.prod.yml (продакшн):
```yaml
version: '3.8'
services:
  backend:
    build: ./backend
    ports:
      - "8000:8000"
    environment:
      - ENVIRONMENT=production
    restart: unless-stopped

  frontend:
    build: ./frontend
    ports:
      - "80:80"
    depends_on:
      - backend
    restart: unless-stopped
```

## 📋 Следующие шаги

### Шаг 1: Подготовка локального репозитория
1. Создать Git репозиторий
2. Добавить Docker файлы
3. Создать скрипты деплоя

### Шаг 2: Настройка сервера
1. Создать структуру папок
2. Установить Docker и Docker Compose
3. Настроить nginx (если нужен)

### Шаг 3: Первый деплой
1. Склонировать репозиторий на сервер
2. Запустить docker-compose
3. Настроить API ключ Яндекс

### Шаг 4: Настройка CI/CD
1. Настроить автоматический деплой
2. Создать скрипты обновления
3. Настроить мониторинг

## 🔧 Детальные инструкции

### Создание Docker файлов
### Настройка nginx
### Настройка SSL
### Мониторинг и логирование 