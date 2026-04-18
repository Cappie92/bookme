# 📝 Пошаговая инструкция: Настройка переменных окружения для Robokassa

## Шаг 1: Создание файла .env

1. Откройте терминал и перейдите в папку `backend`:
   ```bash
   cd /Users/s.devyatov/DeDato/backend
   ```

2. Создайте файл `.env` (если его еще нет):
   ```bash
   # Если файла нет, создайте его
   touch .env
   ```

   Или просто откройте файл в редакторе - он создастся автоматически.

## Шаг 2: Открытие файла .env в редакторе

Откройте файл `backend/.env` в любом текстовом редакторе (VS Code, Sublime Text, nano, vim и т.д.).

**Если файл пустой или его нет**, скопируйте туда следующее содержимое:

```env
# ROBOKASSA CONFIGURATION
ROBOKASSA_MERCHANT_LOGIN=your_merchant_login_here
ROBOKASSA_PASSWORD_1=your_password_1_here
ROBOKASSA_PASSWORD_2=your_password_2_here
ROBOKASSA_IS_TEST=true
ROBOKASSA_RESULT_URL=http://localhost:8000/api/payments/robokassa/result
ROBOKASSA_SUCCESS_URL=http://localhost:5173/payment/success
ROBOKASSA_FAIL_URL=http://localhost:5173/payment/failed
```

## Шаг 3: Получение данных от Robokassa

### 3.1. Регистрация в Robokassa

1. Перейдите на сайт [Robokassa](https://robokassa.ru/)
2. Нажмите "Регистрация" или "Войти"
3. Зарегистрируйте новый аккаунт или войдите в существующий

### 3.2. Получение данных для тестового режима

**Для тестового режима (рекомендуется начать с него):**

1. Войдите в личный кабинет Robokassa
2. Перейдите в раздел **"Технические настройки"** или **"Настройки магазина"**
3. Найдите раздел **"Тестовый режим"** или **"Test Mode"**

В тестовом режиме Robokassa предоставляет тестовые данные:
- **MerchantLogin** - обычно это ваш логин или специальный тестовый логин
- **Password #1** - тестовый пароль #1
- **Password #2** - тестовый пароль #2

**Важно:** В тестовом режиме можно использовать любые тестовые значения, но лучше получить реальные из личного кабинета.

### 3.3. Где найти данные в личном кабинете Robokassa

1. **MerchantLogin (логин магазина):**
   - Обычно это ваш email или специальный логин
   - Находится в разделе "Настройки" → "Основные настройки"
   - Или в разделе "Технические настройки"

2. **Password #1 и Password #2:**
   - Перейдите в "Настройки" → "Технические настройки"
   - Найдите раздел "Пароли для подписи"
   - Там будут указаны:
     - **Password #1** - для генерации подписи запроса
     - **Password #2** - для проверки подписи уведомлений

**Если пароли не установлены:**
- Нажмите "Сгенерировать" или "Создать"
- Скопируйте сгенерированные пароли
- **ВАЖНО:** Сохраните их в безопасном месте!

## Шаг 4: Заполнение файла .env

Замените значения в файле `.env` на реальные данные:

```env
# Замените your_merchant_login_here на ваш реальный логин
ROBOKASSA_MERCHANT_LOGIN=my_shop_login

# Замените your_password_1_here на Password #1 из личного кабинета
ROBOKASSA_PASSWORD_1=MyPassword123456

# Замените your_password_2_here на Password #2 из личного кабинета
ROBOKASSA_PASSWORD_2=MyPassword789012

# Оставьте true для тестового режима (рекомендуется для начала)
ROBOKASSA_IS_TEST=true

# URL для уведомлений (для локальной разработки)
ROBOKASSA_RESULT_URL=http://localhost:8000/api/payments/robokassa/result

# URL для успешной оплаты (для локальной разработки)
ROBOKASSA_SUCCESS_URL=http://localhost:5173/payment/success

# URL для ошибки оплаты (для локальной разработки)
ROBOKASSA_FAIL_URL=http://localhost:5173/payment/failed
```

### Пример заполненного файла .env:

```env
ROBOKASSA_MERCHANT_LOGIN=demo_merchant
ROBOKASSA_PASSWORD_1=test_password_1_abc123
ROBOKASSA_PASSWORD_2=test_password_2_xyz789
ROBOKASSA_IS_TEST=true
ROBOKASSA_RESULT_URL=http://localhost:8000/api/payments/robokassa/result
ROBOKASSA_SUCCESS_URL=http://localhost:5173/payment/success
ROBOKASSA_FAIL_URL=http://localhost:5173/payment/failed
```

## Шаг 5: Проверка файла .env

Убедитесь, что:
- ✅ Файл называется именно `.env` (с точкой в начале)
- ✅ Файл находится в папке `backend/`
- ✅ Нет лишних пробелов вокруг знака `=`
- ✅ Нет кавычек вокруг значений (если они не нужны)
- ✅ Каждая переменная на отдельной строке

**Правильный формат:**
```env
ROBOKASSA_MERCHANT_LOGIN=my_login
```

**Неправильный формат:**
```env
ROBOKASSA_MERCHANT_LOGIN = my_login  # лишние пробелы
ROBOKASSA_MERCHANT_LOGIN="my_login"  # кавычки не нужны
```

## Шаг 6: Проверка работы

После сохранения файла `.env`:

1. Перезапустите сервер (если он запущен):
   ```bash
   # Остановите сервер (Ctrl+C)
   # Затем запустите снова
   cd backend
   python3 -m uvicorn main:app --reload
   ```

2. Проверьте, что переменные загружаются:
   ```bash
   cd backend
   python3 -c "from dotenv import load_dotenv; import os; load_dotenv(); print('MerchantLogin:', os.getenv('ROBOKASSA_MERCHANT_LOGIN'))"
   ```

   Должно вывести ваш логин.

## ⚠️ Важные замечания

1. **Безопасность:**
   - Файл `.env` содержит секретные данные
   - НЕ коммитьте его в Git (он должен быть в `.gitignore`)
   - Не передавайте файл другим людям

2. **Для боевого режима:**
   - Используйте другие пароли (не тестовые)
   - Измените `ROBOKASSA_IS_TEST=false`
   - Обновите URL на реальные домены

3. **Если не получается найти данные в Robokassa:**
   - Обратитесь в поддержку Robokassa
   - Или используйте тестовые данные для начала

## 🆘 Проблемы и решения

### Проблема: "Файл .env не найден"
**Решение:** Убедитесь, что файл находится в папке `backend/` и называется именно `.env` (с точкой)

### Проблема: "Переменные не загружаются"
**Решение:** 
- Проверьте, что установлен пакет `python-dotenv`: `pip install python-dotenv`
- Убедитесь, что в `main.py` есть `load_dotenv()`

### Проблема: "Не могу найти пароли в Robokassa"
**Решение:**
- Войдите в личный кабинет
- Перейдите в "Настройки" → "Технические настройки"
- Если паролей нет, создайте их через кнопку "Сгенерировать"

## 📞 Что дальше?

После настройки `.env` переходите к следующему шагу:
- Применение миграций базы данных
- Тестирование в тестовом режиме

---

**Нужна помощь?** Если что-то непонятно, напишите мне!

