# Система поддоменов для модулей бронирования

## Обзор

Система поддоменов позволяет салонам и мастерам иметь собственные URL для форм бронирования. Каждый салон или мастер может указать уникальный поддомен в своих настройках, и форма бронирования будет доступна по адресу `subdomain.siteaddress.ru`.

## Архитектура

### Для продакшена
- **Формат**: `subdomain.siteaddress.ru`
- **Примеры**:
  - `beauty-salon.siteaddress.ru` - для салона
  - `anna-master.siteaddress.ru` - для мастера

### Для локальной разработки
- **Формат**: `localhost:5173/domain/subdomain`
- **Примеры**:
  - `localhost:5173/domain/test-salon`
  - `localhost:5173/domain/test-master`

## Компоненты

### 1. SubdomainPage (`frontend/src/pages/SubdomainPage.jsx`)
Главная страница для обработки поддоменов. Автоматически определяет тип владельца (салон или мастер) и отображает соответствующий модуль бронирования.

### 2. DomainChecker (`frontend/src/components/DomainChecker.jsx`)
Компонент для проверки доступности поддомена перед регистрацией.

### 3. Утилиты (`frontend/src/utils/domainUtils.js`)
Функции для работы с поддоменами:
- `getSubdomain()` - извлечение поддомена из URL
- `createSubdomainUrl()` - создание URL для поддомена
- `isSubdomain()` - проверка, является ли текущий URL поддоменом

## API Endpoints

### Backend (`backend/routers/domain.py`)

#### 1. Информация о поддомене
```
GET /api/domain/{subdomain}/info
```
Возвращает информацию о владельце поддомена (салон или мастер).

**Ответ для салона:**
```json
{
  "owner_type": "salon",
  "owner_id": 1,
  "name": "Название салона",
  "description": "Описание салона",
  "phone": "+79991234567",
  "email": "info@salon.ru",
  "address": "Адрес салона",
  "website": "https://salon.ru",
  "instagram": "salon_inst",
  "working_hours": "Часы работы",
  "city": "Москва",
  "timezone": "Europe/Moscow",
  "is_active": true
}
```

**Ответ для мастера:**
```json
{
  "owner_type": "master",
  "owner_id": 1,
  "name": "Имя мастера",
  "description": "Биография мастера",
  "phone": "+79991234567",
  "email": "master@example.com",
  "website": "https://master.ru",
  "city": "Москва",
  "timezone": "Europe/Moscow",
  "experience_years": 5,
  "is_active": true
}
```

#### 2. Услуги владельца
```
GET /api/domain/{subdomain}/services
```
Возвращает список услуг салона или мастера.

#### 3. Мастера салона
```
GET /api/domain/{subdomain}/masters
```
Возвращает список мастеров салона (только для салонов).

#### 4. Проверка доступности
```
GET /api/domain/check/{subdomain}
```
Проверяет, доступен ли поддомен для регистрации.

## База данных

### Модели

#### Salon
```python
class Salon(Base):
    # ... другие поля
    domain = Column(String, unique=True)  # Уникальный поддомен
```

#### IndieMaster
```python
class IndieMaster(Base):
    # ... другие поля
    domain = Column(String, unique=True)  # Уникальный поддомен
```

## Роутинг

### Frontend (`frontend/src/App.jsx`)
```jsx
<Route path="/domain/:subdomain" element={<SubdomainPage />} />
```

### Backend (`backend/main.py`)
```python
app.include_router(domain.router)
```

## Использование

### 1. Регистрация поддомена
1. Салон или мастер указывает желаемый поддомен в настройках профиля
2. Система проверяет уникальность поддомена
3. Поддомен сохраняется в базе данных

### 2. Доступ к форме бронирования
1. Клиент переходит по URL `subdomain.siteaddress.ru`
2. Система определяет владельца поддомена
3. Отображается соответствующая форма бронирования

### 3. Работа с API
Модули бронирования автоматически определяют, находятся ли они на поддомене, и используют соответствующие API endpoints.

## Тестирование

### Тестовые данные
Запустите скрипт для создания тестовых поддоменов:
```bash
cd backend
python seed_domains.py
```

### Тестовые URL
- `http://localhost:5173/domain/test-salon` - тестовый салон
- `http://localhost:5173/domain/test-master` - тестовый мастер
- `http://localhost:5173/test/domain` - страница тестирования поддоменов

## Развертывание

### Для продакшена
1. Настройте DNS для обработки поддоменов 3-го уровня
2. Настройте веб-сервер (nginx) для проксирования запросов
3. Обновите CORS настройки для поддержки поддоменов

### Пример nginx конфигурации
```nginx
server {
    listen 80;
    server_name *.siteaddress.ru;
    
    location / {
        proxy_pass http://localhost:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

## Безопасность

1. **Валидация поддоменов**: Проверка на допустимые символы и длину
2. **Уникальность**: Поддомены должны быть уникальными в системе
3. **Активность**: Проверка активности владельца поддомена
4. **CORS**: Настройка CORS для поддоменов

## Ограничения

1. Поддомены должны содержать только буквы, цифры и дефисы
2. Минимальная длина: 3 символа
3. Максимальная длина: 63 символа
4. Не может начинаться или заканчиваться дефисом
5. Не может содержать последовательные дефисы 