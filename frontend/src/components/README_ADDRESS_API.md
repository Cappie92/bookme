# Настройка API Яндекс.Карт для проверки адресов

## Обзор

Система включает два компонента для работы с адресами:
- `AddressAutocomplete` - автодополнение адресов
- `AddressValidator` - валидация адресов

## Настройка API ключа

### 1. Регистрация
1. Перейдите на https://developer.tech.yandex.ru/
2. Создайте аккаунт или войдите в существующий
3. Создайте новое приложение
4. Получите API ключ

### 2. Настройка компонентов

#### AddressAutocomplete
В файле `frontend/src/components/AddressAutocomplete.jsx`:

```javascript
// Замените эту строку:
const response = await fetch(`https://suggest-maps.yandex.ru/v1/suggest?text=${encodeURIComponent(query)}&lang=ru_RU&type=address&results=5`)

// На эту (с вашим API ключом):
const response = await fetch(`https://suggest-maps.yandex.ru/v1/suggest?apikey=YOUR_API_KEY&text=${encodeURIComponent(query)}&lang=ru_RU&type=address&results=5`)
```

#### AddressValidator
В файле `frontend/src/components/AddressValidator.jsx`:

```javascript
// Замените демо-версию на реальную:
const response = await fetch(`https://geocode-maps.yandex.ru/1.x/?apikey=YOUR_API_KEY&format=json&geocode=${encodeURIComponent(address)}&lang=ru_RU`)
```

### 3. Переменные окружения

Для безопасности создайте файл `.env` в корне frontend:

```env
VITE_YANDEX_MAPS_API_KEY=your_api_key_here
```

И используйте его в компонентах:

```javascript
const API_KEY = import.meta.env.VITE_YANDEX_MAPS_API_KEY
```

## API Endpoints

### Подсказки адресов
```
GET https://suggest-maps.yandex.ru/v1/suggest
```

Параметры:
- `apikey` - ваш API ключ
- `text` - текст для поиска
- `lang` - язык (ru_RU)
- `type` - тип (address)
- `results` - количество результатов

### Геокодирование
```
GET https://geocode-maps.yandex.ru/1.x/
```

Параметры:
- `apikey` - ваш API ключ
- `format` - формат ответа (json)
- `geocode` - адрес для геокодирования
- `lang` - язык (ru_RU)

## Лимиты API

- Бесплатный план: 25,000 запросов в день
- Платные планы: от 100,000 до 1,000,000 запросов в день

## Безопасность

1. Никогда не публикуйте API ключ в открытом коде
2. Используйте переменные окружения
3. Настройте CORS на сервере Яндекс.Карт
4. Ограничьте домены в настройках приложения

## Демо-версия

Текущая версия работает в демо-режиме без API ключа:
- Автодополнение: использует публичный API
- Валидация: простая проверка на ключевые слова

Для полноценной работы необходимо настроить API ключ. 