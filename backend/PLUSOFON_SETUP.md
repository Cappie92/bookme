# Настройка интеграции с Plusofon

## Описание

Plusofon - это сервис для совершения звонков с произношением кодов верификации. Интеграция позволяет:

1. Отправлять звонки с кодом верификации на номер телефона
2. Верифицировать пользователей через звонок
3. Восстанавливать пароли через звонок

## Настройка переменных окружения

Добавьте следующие переменные в ваш `.env` файл:

```env
# Plusofon API настройки
PLUSOFON_USER_ID=3545
PLUSOFON_ACCESS_TOKEN=4AbOVVSDrEB6sGb6Ib52VyTHEfsHzfcfJ3F5
```

## Получение учетных данных

1. Зарегистрируйтесь на сайте Plusofon
2. Перейдите в личный кабинет
3. Получите User ID и Access Token
4. Скопируйте данные в переменные окружения

## API Endpoints

### Инициация звонка
- **URL**: `POST /api/v1/flash-call/call`
- **Headers**:
  - `Content-Type: application/json`
  - `Accept: application/json`
  - `Client: {user_id}`
  - `Authorization: Bearer {access_token}`
- **Параметры**:
  - `phone` - номер телефона (формат: 8XXXXXXXXX)
  - `pin` - код для произношения
  - `lang` - язык произношения (ru/en)
  - `repeat` - количество повторов кода

### Проверка статуса звонка
- **URL**: `POST /api/v1/flash-call/status`
- **Headers**: те же
- **Параметры**:
  - `call_id` - ID звонка

### Получение информации об аккаунтах
- **URL**: `GET /api/v1/flash-call`
- **Headers**: те же

## Использование в приложении

### Верификация телефона

```python
from services.plusofon_service import plusofon_service

# Инициация звонка
result = await plusofon_service.initiate_call("+79001234567", "1234")

if result["success"]:
    call_id = result["call_id"]
    print("Звонок инициирован")
else:
    print(f"Ошибка: {result['message']}")
```

### Проверка статуса

```python
# Проверка статуса звонка
status = await plusofon_service.check_call_status(call_id)

if status["success"]:
    print(f"Статус: {status['status']}")
else:
    print(f"Ошибка: {status['message']}")
```

### Получение информации об аккаунтах

```python
# Получение информации об аккаунтах
account_info = await plusofon_service.get_balance()

if account_info["success"]:
    print(f"Account ID: {account_info['account_id']}")
    print(f"Account Name: {account_info['account_name']}")
else:
    print(f"Ошибка: {account_info['message']}")
```

## Стоимость

- Стоимость одного звонка: ~2-5 рублей
- Минимальный баланс для работы: 10 рублей
- Поддерживаемые страны: Россия

## Ограничения

- Максимальная длина кода: 6 цифр
- Время жизни кода: 5 минут
- Количество повторов кода: 2 раза
- Поддерживаемые языки: русский, английский

## Тестирование

Для тестирования можно использовать тестовые номера:

```python
# Тестовый номер для разработки
test_phone = "+79001234567"
test_code = "1234"

result = await plusofon_service.initiate_call(test_phone, test_code)
```

## Мониторинг

Рекомендуется настроить мониторинг:

1. **Баланс** - проверять остаток средств
2. **Статусы звонков** - отслеживать успешность доставки
3. **Ошибки API** - логировать ошибки интеграции

## Поддержка

При возникновении проблем:

1. Проверьте баланс аккаунта
2. Убедитесь в корректности API ключа
3. Проверьте формат номера телефона
4. Обратитесь в поддержку Plusofon

## Безопасность

- Храните API ключ в переменных окружения
- Не коммитьте ключ в репозиторий
- Используйте HTTPS для всех запросов
- Ограничьте доступ к API ключу 