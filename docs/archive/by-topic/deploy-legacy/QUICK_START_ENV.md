# 🚀 Быстрый старт: Настройка .env файла

## Способ 1: Через терминал (самый простой)

1. Откройте терминал
2. Выполните команды:

```bash
cd /Users/s.devyatov/DeDato/backend

# Создайте файл .env
cat > .env << 'EOF'
ROBOKASSA_MERCHANT_LOGIN=your_merchant_login_here
ROBOKASSA_PASSWORD_1=your_password_1_here
ROBOKASSA_PASSWORD_2=your_password_2_here
ROBOKASSA_IS_TEST=true
ROBOKASSA_RESULT_URL=http://localhost:8000/api/payments/robokassa/result
ROBOKASSA_SUCCESS_URL=http://localhost:5173/payment/success
ROBOKASSA_FAIL_URL=http://localhost:5173/payment/failed
EOF

# Проверьте, что файл создан
cat .env
```

## Способ 2: Через редактор (VS Code или другой)

1. Откройте папку `backend` в VS Code (или другом редакторе)
2. Создайте новый файл с именем `.env` (с точкой в начале!)
3. Скопируйте и вставьте следующее содержимое:

```
ROBOKASSA_MERCHANT_LOGIN=your_merchant_login_here
ROBOKASSA_PASSWORD_1=your_password_1_here
ROBOKASSA_PASSWORD_2=your_password_2_here
ROBOKASSA_IS_TEST=true
ROBOKASSA_RESULT_URL=http://localhost:8000/api/payments/robokassa/result
ROBOKASSA_SUCCESS_URL=http://localhost:5173/payment/success
ROBOKASSA_FAIL_URL=http://localhost:5173/payment/failed
```

4. Сохраните файл

## Способ 3: Используя готовый шаблон

1. В папке `backend` уже есть файл `env_template.txt`
2. Скопируйте его в `.env`:

```bash
cd /Users/s.devyatov/DeDato/backend
cp env_template.txt .env
```

3. Откройте файл `.env` и замените значения

---

## 📝 Что нужно заполнить?

### 1. ROBOKASSA_MERCHANT_LOGIN
**Где взять:**
- Зарегистрируйтесь на [robokassa.ru](https://robokassa.ru/)
- Войдите в личный кабинет
- Найдите в настройках "Логин магазина" или "MerchantLogin"
- Это обычно ваш email или специальный логин

**Пример:**
```
ROBOKASSA_MERCHANT_LOGIN=demo_merchant
```

### 2. ROBOKASSA_PASSWORD_1
**Где взять:**
- В личном кабинете Robokassa
- Раздел "Настройки" → "Технические настройки"
- Найдите "Password #1" или "Пароль #1"
- Если его нет - нажмите "Сгенерировать" или "Создать"

**Пример:**
```
ROBOKASSA_PASSWORD_1=MyPassword123456
```

### 3. ROBOKASSA_PASSWORD_2
**Где взять:**
- В том же разделе "Технические настройки"
- Найдите "Password #2" или "Пароль #2"
- Если его нет - нажмите "Сгенерировать" или "Создать"

**Пример:**
```
ROBOKASSA_PASSWORD_2=MyPassword789012
```

### 4. ROBOKASSA_IS_TEST
**Что это:**
- `true` = тестовый режим (для разработки)
- `false` = боевой режим (для реальных платежей)

**Для начала оставьте:**
```
ROBOKASSA_IS_TEST=true
```

### 5. URL (для локальной разработки)
**Оставьте как есть для начала:**
```
ROBOKASSA_RESULT_URL=http://localhost:8000/api/payments/robokassa/result
ROBOKASSA_SUCCESS_URL=http://localhost:5173/payment/success
ROBOKASSA_FAIL_URL=http://localhost:5173/payment/failed
```

---

## ✅ Проверка

После создания файла проверьте:

```bash
cd /Users/s.devyatov/DeDato/backend
cat .env
```

Должны увидеть все переменные.

---

## 🎯 Пример заполненного файла

```env
ROBOKASSA_MERCHANT_LOGIN=demo_merchant
ROBOKASSA_PASSWORD_1=test_pass_1_abc123
ROBOKASSA_PASSWORD_2=test_pass_2_xyz789
ROBOKASSA_IS_TEST=true
ROBOKASSA_RESULT_URL=http://localhost:8000/api/payments/robokassa/result
ROBOKASSA_SUCCESS_URL=http://localhost:5173/payment/success
ROBOKASSA_FAIL_URL=http://localhost:5173/payment/failed
```

---

## ⚠️ Важно!

1. **Файл должен называться `.env`** (с точкой в начале, без расширения)
2. **Файл должен быть в папке `backend/`**
3. **Не ставьте пробелы вокруг знака `=`**
4. **Не используйте кавычки** (если не указано иное)

**Правильно:**
```
ROBOKASSA_MERCHANT_LOGIN=my_login
```

**Неправильно:**
```
ROBOKASSA_MERCHANT_LOGIN = my_login  ❌ (пробелы)
ROBOKASSA_MERCHANT_LOGIN="my_login"  ❌ (кавычки не нужны)
```

---

## 🆘 Если не получается

1. **Не могу найти данные в Robokassa:**
   - Обратитесь в поддержку Robokassa
   - Или используйте тестовые значения для начала

2. **Файл не создается:**
   - Убедитесь, что вы в папке `backend/`
   - Проверьте права доступа к папке

3. **Переменные не работают:**
   - Убедитесь, что файл называется именно `.env`
   - Перезапустите сервер после создания файла

---

**Готово!** После создания файла переходите к следующему шагу.

