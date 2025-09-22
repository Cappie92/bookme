# Настройка переменных окружения

## Создание файла .env

Создайте файл `.env` в папке `frontend/` со следующим содержимым:

```bash
# Yandex Maps API Configuration
VITE_YANDEX_MAPS_API_KEY=ваш_api_ключ_здесь

# API Configuration
VITE_API_BASE_URL=http://localhost:8000
```

## Получение API ключа

1. Перейдите на https://developer.tech.yandex.ru/
2. Создайте приложение для "Веб-сервисы"
3. Скопируйте API ключ
4. Вставьте его в переменную `REACT_APP_YANDEX_MAPS_API_KEY`

## Перезапуск приложения

После создания файла `.env` перезапустите приложение:

```bash
cd frontend
npm run dev
```

## Проверка работы

1. Откройте настройки мастера
2. Выберите город
3. Начните вводить адрес
4. Должны появиться подсказки с учетом города 