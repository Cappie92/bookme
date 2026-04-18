# 🚀 План деплоя на боевой сервер

## 📋 Содержание
1. [Подготовка к деплою](#1-подготовка-к-деплою)
2. [Проверка миграций](#2-проверка-миграций)
3. [Настройка переменных окружения](#3-настройка-переменных-окружения)
4. [Применение миграций](#4-применение-миграций)
5. [Создание тестовых пользователей](#5-создание-тестовых-пользователей)
6. [Проверка работоспособности](#6-проверка-работоспособности)
7. [Чеклист перед запуском](#7-чеклист-перед-запуском)
8. [Удаление устаревших функций](#8-удаление-устаревших-функций)

---

## 1. Подготовка к деплою

### 1.1. Резервное копирование базы данных

**КРИТИЧНО:** Перед применением миграций создайте резервную копию базы данных!

```bash
# Для PostgreSQL
pg_dump -U your_user -d your_database > backup_$(date +%Y%m%d_%H%M%S).sql

# Для SQLite
cp bookme.db bookme.db.backup_$(date +%Y%m%d_%H%M%S)
```

### 1.2. Проверка текущего состояния

1. Проверьте текущую ревизию миграций:
   ```bash
   cd /path/to/backend
   python3 -m alembic current
   ```

2. Проверьте список всех миграций:
   ```bash
   python3 -m alembic history
   ```

3. Убедитесь, что все файлы загружены на сервер

---

## 2. Проверка миграций

### 2.1. Ключевые миграции для деплоя

Следующие миграции должны быть применены в указанном порядке:

1. **`20250125_add_freeze_days_to_subscription_plans`**
   - Добавляет поля `freeze_days_1month`, `freeze_days_3months`, `freeze_days_6months`, `freeze_days_12months` в таблицу `subscription_plans`
   - Зависит от: `add_freeze_days` (или предыдущая ревизия)

2. **`20250128_add_payments_table`**
   - Создает таблицу `payments` для хранения платежей Robokassa
   - Зависит от: `add_freeze_days` (или `20250125_add_freeze_days_to_subscription_plans`)

3. **`20250128_convert_balance_to_rubles`**
   - Конвертирует все балансы из копеек в рубли
   - Обновляет таблицы: `user_balances`, `balance_transactions`, `subscription_reservations`
   - Зависит от: `add_payments_table` (или `20250128_add_payments_table`)

### 2.2. Проверка последовательности миграций

Выполните команду для проверки последовательности:

```bash
cd /path/to/backend
python3 -m alembic history | grep -E "(add_freeze_days|add_payments_table|convert_balance_to_rubles)"
```

Убедитесь, что миграции идут в правильном порядке.

---

## 3. Настройка переменных окружения

### 3.1. Обновление `.env` файла

На боевом сервере обновите файл `backend/.env`:

```env
# ============================================
# ROBOKASSA CONFIGURATION (БОЕВОЙ РЕЖИМ)
# ============================================
ROBOKASSA_MERCHANT_LOGIN=your_production_merchant_login
ROBOKASSA_PASSWORD_1=your_production_password_1
ROBOKASSA_PASSWORD_2=your_production_password_2
ROBOKASSA_IS_TEST=false
ROBOKASSA_RESULT_URL=https://dedato.ru/api/payments/robokassa/result
ROBOKASSA_SUCCESS_URL=https://dedato.ru/payment/success
ROBOKASSA_FAIL_URL=https://dedato.ru/payment/failed
```

**ВАЖНО:**
- Используйте боевые данные Robokassa (не тестовые!)
- Установите `ROBOKASSA_IS_TEST=false`
- Проверьте, что все URL указывают на production домен

### 3.2. Проверка других переменных

Убедитесь, что все необходимые переменные окружения настроены:
- `DATABASE_URL` - подключение к базе данных
- `JWT_SECRET_KEY` - секретный ключ для JWT
- Другие переменные, специфичные для вашего окружения

---

## 4. Применение миграций

### 4.1. Пошаговое применение миграций

**ВАЖНО:** Применяйте миграции последовательно и проверяйте результат после каждой!

#### Шаг 1: Проверка текущего состояния

```bash
cd /path/to/backend
python3 -m alembic current
```

Запишите текущую ревизию.

#### Шаг 2: Применение миграции для freeze_days

```bash
python3 -m alembic upgrade add_freeze_days
```

Или если миграция называется иначе:
```bash
python3 -m alembic upgrade 20250125_add_freeze_days_to_subscription_plans
```

**Проверка:**
```bash
# Проверьте, что колонки добавлены
python3 << 'EOF'
import sqlite3
conn = sqlite3.connect('bookme.db')
cursor = conn.cursor()
cursor.execute("PRAGMA table_info(subscription_plans)")
columns = [col[1] for col in cursor.fetchall()]
print("Колонки freeze_days:")
for col in ['freeze_days_1month', 'freeze_days_3months', 'freeze_days_6months', 'freeze_days_12months']:
    print(f"  {col}: {'✅' if col in columns else '❌'}")
conn.close()
EOF
```

#### Шаг 3: Применение миграции для payments

```bash
python3 -m alembic upgrade add_payments_table
```

Или:
```bash
python3 -m alembic upgrade 20250128_add_payments_table
```

**Проверка:**
```bash
python3 << 'EOF'
import sqlite3
conn = sqlite3.connect('bookme.db')
cursor = conn.cursor()
cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='payments'")
if cursor.fetchone():
    print("✅ Таблица payments создана")
    cursor.execute("PRAGMA table_info(payments)")
    columns = [col[1] for col in cursor.fetchall()]
    print(f"Колонок в таблице: {len(columns)}")
    if 'payment_metadata' in columns:
        print("✅ Колонка payment_metadata существует")
    else:
        print("⚠️ Колонка payment_metadata отсутствует")
else:
    print("❌ Таблица payments не найдена")
conn.close()
EOF
```

#### Шаг 4: Применение миграции для конвертации балансов

**КРИТИЧНО:** Эта миграция изменяет данные! Убедитесь, что у вас есть резервная копия!

```bash
python3 -m alembic upgrade convert_balance_to_rubles
```

Или:
```bash
python3 -m alembic upgrade 20250128_convert_balance_to_rubles
```

**Проверка:**
```bash
python3 << 'EOF'
import sqlite3
conn = sqlite3.connect('bookme.db')
cursor = conn.cursor()

# Проверяем user_balances
cursor.execute("PRAGMA table_info(user_balances)")
balance_cols = {col[1]: col[2] for col in cursor.fetchall()}
if 'balance' in balance_cols:
    balance_type = balance_cols['balance']
    if 'REAL' in balance_type or 'FLOAT' in balance_type:
        print("✅ user_balances.balance: Float (рубли)")
    else:
        print(f"⚠️ user_balances.balance: {balance_type} (ожидается Float)")

# Проверяем balance_transactions
cursor.execute("PRAGMA table_info(balance_transactions)")
tx_cols = {col[1]: col[2] for col in cursor.fetchall()}
for col_name in ['amount', 'balance_before', 'balance_after']:
    if col_name in tx_cols:
        col_type = tx_cols[col_name]
        if 'REAL' in col_type or 'FLOAT' in col_type:
            print(f"✅ balance_transactions.{col_name}: Float (рубли)")
        else:
            print(f"⚠️ balance_transactions.{col_name}: {col_type}")

# Проверяем subscription_reservations
cursor.execute("PRAGMA table_info(subscription_reservations)")
res_cols = {col[1]: col[2] for col in cursor.fetchall()}
if 'reserved_amount' in res_cols:
    print("✅ subscription_reservations.reserved_amount существует")
    if 'reserved_kopecks' not in res_cols:
        print("✅ subscription_reservations.reserved_kopecks удалена")
else:
    print("⚠️ subscription_reservations.reserved_amount отсутствует")

conn.close()
EOF
```

#### Шаг 5: Применение всех оставшихся миграций

```bash
python3 -m alembic upgrade head
```

### 4.2. Обработка ошибок

Если миграция завершилась с ошибкой:

1. **НЕ ПРОДОЛЖАЙТЕ** применять следующие миграции
2. Проверьте логи ошибки
3. Если нужно, восстановите базу из резервной копии
4. Исправьте проблему и повторите попытку

---

## 5. Создание тестовых пользователей

### 5.1. Запуск скрипта создания тестовых пользователей

После успешного применения всех миграций создайте тестовых пользователей:

```bash
cd /path/to/backend/scripts
python3 create_test_users_balance_system.py
```

**ВАЖНО:** Скрипт был обновлен для работы с рублями (не копейками). Убедитесь, что используете последнюю версию скрипта.

### 5.2. Проверка созданных пользователей

Скрипт создаст файл `test_users_balance_system.log.jsonl` с информацией о всех созданных пользователях.

Проверьте созданных пользователей:

```bash
python3 << 'EOF'
import sqlite3
conn = sqlite3.connect('../bookme.db')
cursor = conn.cursor()

cursor.execute("SELECT phone, id FROM users WHERE phone LIKE '+799900000%' ORDER BY phone")
users = cursor.fetchall()

print(f"✅ Создано тестовых пользователей: {len(users)}")
print("\nСписок пользователей:")
for phone, user_id in users:
    cursor.execute("SELECT balance FROM user_balances WHERE user_id = ?", (user_id,))
    balance_row = cursor.fetchone()
    balance = balance_row[0] if balance_row else 0
    
    cursor.execute("SELECT COUNT(*) FROM subscriptions WHERE user_id = ?", (user_id,))
    sub_count = cursor.fetchone()[0]
    
    print(f"  {phone} (ID: {user_id}) - Баланс: {balance:.2f} ₽, Подписок: {sub_count}")

conn.close()
EOF
```

### 5.3. Информация о тестовых пользователях

Все созданные пользователи имеют номера телефонов в формате `+799900000XX`, где XX - номер сценария (01-16).

Детальная информация о каждом пользователе сохраняется в файле:
```
backend/scripts/test_users_balance_system.log.jsonl
```

---

## 6. Проверка работоспособности

### 6.1. Проверка API эндпоинтов

#### Проверка эндпоинта инициализации платежа за подписку

```bash
curl -X POST https://dedato.ru/api/payments/subscription/init \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "plan_id": 1,
    "duration_months": 1,
    "payment_period": "month",
    "enable_auto_renewal": false
  }'
```

**Ожидаемый ответ:**
```json
{
  "payment_url": "https://auth.robokassa.ru/Merchant/Index.aspx?...",
  "payment_id": 1,
  "invoice_id": "INV-1234567890-1"
}
```

#### Проверка эндпоинта инициализации пополнения баланса

```bash
curl -X POST https://dedato.ru/api/payments/deposit/init \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "amount": 1000
  }'
```

### 6.2. Проверка страниц оплаты

1. Откройте в браузере:
   - `https://dedato.ru/payment/success` - должна отображаться страница успеха
   - `https://dedato.ru/payment/failed` - должна отображаться страница ошибки

2. Проверьте, что:
   - Логотипы отображаются корректно
   - Текст читаемый
   - Кнопки работают

### 6.3. Проверка верификации телефона

1. Попробуйте зарегистрировать нового пользователя
2. Проверьте, что после регистрации инициируется звонок для верификации
3. Проверьте восстановление пароля через телефон

### 6.4. Проверка балансов

1. Войдите как один из тестовых пользователей
2. Проверьте отображение баланса в дашборде
3. Убедитесь, что баланс отображается в рублях с разделителями тысяч

---

## 7. Чеклист перед запуском

### 7.1. Перед применением миграций

- [ ] Создана резервная копия базы данных
- [ ] Проверена текущая ревизия миграций
- [ ] Все файлы миграций загружены на сервер
- [ ] Проверена последовательность миграций

### 7.2. Настройка окружения

- [ ] Обновлен файл `.env` с боевыми данными Robokassa
- [ ] `ROBOKASSA_IS_TEST=false`
- [ ] Все URL указывают на production домен
- [ ] Проверены все необходимые переменные окружения

### 7.3. Применение миграций

- [ ] Миграция `add_freeze_days` применена успешно
- [ ] Миграция `add_payments_table` применена успешно
- [ ] Миграция `convert_balance_to_rubles` применена успешно
- [ ] Все миграции применены до `head`
- [ ] Проверена структура таблиц после миграций

### 7.4. Тестовые пользователи

- [ ] Скрипт создания тестовых пользователей выполнен
- [ ] Проверено количество созданных пользователей (16)
- [ ] Проверен файл логов `test_users_balance_system.log.jsonl`

### 7.5. Функциональность

- [ ] API эндпоинты платежей работают
- [ ] Страницы успеха/ошибки отображаются корректно
- [ ] Верификация телефона работает
- [ ] Балансы отображаются корректно
- [ ] Robokassa настроена в боевом режиме

### 7.6. Безопасность

- [ ] `.env` файл не попадает в git
- [ ] Боевые пароли Robokassa защищены
- [ ] Result URL доступен только для Robokassa IP
- [ ] Проверка подписей работает корректно

---

## 8. Откат изменений (если что-то пошло не так)

### 8.1. Откат миграций

Если нужно откатить миграции:

```bash
# Откат последней миграции
python3 -m alembic downgrade -1

# Откат до конкретной ревизии
python3 -m alembic downgrade <revision_id>
```

### 8.2. Восстановление из резервной копии

```bash
# Для PostgreSQL
psql -U your_user -d your_database < backup_YYYYMMDD_HHMMSS.sql

# Для SQLite
cp bookme.db.backup_YYYYMMDD_HHMMSS bookme.db
```

---

## 9. Полезные команды

### 9.1. Проверка текущего состояния

```bash
# Текущая ревизия
python3 -m alembic current

# История миграций
python3 -m alembic history

# Список миграций до head
python3 -m alembic history | head -20
```

### 9.2. Проверка структуры таблиц

```bash
python3 << 'EOF'
import sqlite3
conn = sqlite3.connect('bookme.db')

# Список всех таблиц
cursor = conn.cursor()
cursor.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
tables = cursor.fetchall()
print("Таблицы в базе данных:")
for table in tables:
    print(f"  - {table[0]}")

conn.close()
EOF
```

### 9.3. Проверка платежей

```bash
python3 << 'EOF'
import sqlite3
conn = sqlite3.connect('bookme.db')
cursor = conn.cursor()

cursor.execute("SELECT COUNT(*) FROM payments")
count = cursor.fetchone()[0]
print(f"Всего платежей в БД: {count}")

cursor.execute("SELECT status, COUNT(*) FROM payments GROUP BY status")
statuses = cursor.fetchall()
print("\nПлатежи по статусам:")
for status, count in statuses:
    print(f"  {status}: {count}")

conn.close()
EOF
```

---

## 10. Контакты и поддержка

- **Документация Robokassa:** https://docs.robokassa.ru/
- **Техническая поддержка Robokassa:** support@robokassa.ru
- **Логи приложения:** Проверьте логи сервера для диагностики проблем

---

## 11. Краткая сводка изменений

### 11.1. Что было добавлено

1. **Интеграция Robokassa:**
   - Модель `Payment` для хранения платежей
   - Эндпоинты для инициализации платежей (подписка и пополнение)
   - Эндпоинт для обработки уведомлений от Robokassa (`/api/payments/robokassa/result`)
   - Страницы успеха (`/payment/success`) и ошибки (`/payment/failed`) оплаты
   - Интеграция в `SubscriptionModal` и `DepositModal`

2. **Конвертация балансов:**
   - Все балансы переведены с копеек на рубли
   - Обновлены таблицы: `user_balances`, `balance_transactions`, `subscription_reservations`
   - Обновлены все утилиты для работы с балансами
   - Удалены функции `rubles_to_kopecks` и `kopecks_to_rubles`

3. **Дни заморозки подписки:**
   - Добавлены поля `freeze_days_1month`, `freeze_days_3months`, `freeze_days_6months`, `freeze_days_12months` в `subscription_plans`
   - Управление через админ-панель

4. **Исправления:**
   - Исправлена ошибка в верификации телефона при восстановлении пароля
   - Обновлен скрипт создания тестовых пользователей для работы с рублями
   - Исправлены страницы оплаты (логотипы, размеры)

### 11.2. Ключевые файлы для деплоя

**Миграции (в порядке применения):**
- `backend/alembic/versions/20250125_add_freeze_days_to_subscription_plans.py`
- `backend/alembic/versions/20250128_add_payments_table.py`
- `backend/alembic/versions/20250128_convert_balance_to_rubles.py`

**Новые файлы:**
- `backend/models.py` (обновлен - модель Payment, обновлены балансы)
- `backend/routers/payments.py` (новый роутер)
- `backend/utils/robokassa.py` (новые утилиты)
- `backend/schemas.py` (обновлен - схемы для платежей)
- `frontend/src/pages/PaymentSuccess.jsx` (новая страница)
- `frontend/src/pages/PaymentFailed.jsx` (новая страница)
- `frontend/src/utils/formatMoney.js` (новый утилит)
- `frontend/src/utils/getCheapestPlanForFeature.js` (новый утилит)

**Обновленные файлы:**
- `backend/routers/auth.py` (исправлена верификация телефона)
- `backend/utils/balance_utils.py` (удалены функции конвертации)
- `frontend/src/components/SubscriptionModal.jsx` (интеграция Robokassa)
- `frontend/src/modals/DepositModal.jsx` (интеграция Robokassa)
- `backend/scripts/create_test_users_balance_system.py` (обновлен - работа с рублями)

### 11.3. Переменные окружения

Не забудьте добавить в `backend/.env`:
```env
ROBOKASSA_MERCHANT_LOGIN=your_production_merchant_login
ROBOKASSA_PASSWORD_1=your_production_password_1
ROBOKASSA_PASSWORD_2=your_production_password_2
ROBOKASSA_IS_TEST=false
ROBOKASSA_RESULT_URL=https://dedato.ru/api/payments/robokassa/result
ROBOKASSA_SUCCESS_URL=https://dedato.ru/payment/success
ROBOKASSA_FAIL_URL=https://dedato.ru/payment/failed
```

---

## 8. Удаление устаревших функций

### 8.1. Удаление калькулятора тарифов

**Статус:** ✅ Выполнено локально

Калькулятор тарифов был удален из системы, так как потерял актуальность. Следующие изменения были внесены:

#### Фронтенд (`frontend/src/pages/AdminFunctions.jsx`):
- ✅ Удалена вкладка "Калькулятор тарифов" из навигации
- ✅ Удалено состояние калькулятора (`calculatorType`, `salonCalculator`, `masterCalculator`)
- ✅ Удалены функции работы с калькулятором (`loadCalculatorSettings`, `handleSaveCalculator`, `handleSalonCalculatorChange`, и др.)
- ✅ Удален весь UI калькулятора (блок с настройками для салона и мастера)
- ✅ Удален импорт `CalculatorIcon`

#### Бэкенд (`backend/routers/admin.py`):
- ✅ Удалены эндпоинты:
  - `GET /api/admin/calculator/settings`
  - `PUT /api/admin/calculator/settings`
  - `POST /api/admin/calculator/calculate`
- ✅ Удален импорт `CalculatorSettings` из моделей

**Примечание:** Модель `CalculatorSettings` и таблица `calculator_settings` в базе данных остаются, но не используются. Их можно удалить в будущем при необходимости.

---

## 9. Исправление вставки номера телефона

### 9.1. Исправление обрезания последней цифры при вставке

**Статус:** ✅ Выполнено локально

**Проблема:** При вставке полного номера телефона (например, `+79990000002`) в поле, где уже есть префикс `+7`, система обрезала последнюю цифру, так как функция `formatPhone` неправильно обрабатывала вставленный текст.

**Решение:** Добавлен обработчик события `onPaste` для всех полей ввода телефона, который:
- Определяет, что вставлен полный номер (11 цифр, начинается с `7`)
- Корректно извлекает 10 цифр после префикса `+7`
- Не обрезает последнюю цифру

#### Фронтенд (`frontend/src/modals/AuthModal.jsx`):
- ✅ Добавлена функция `handlePhonePaste` для обработки вставки номера телефона
- ✅ Добавлен обработчик `onPaste={handlePhonePaste}` к полю телефона в форме входа
- ✅ Добавлен обработчик `onPaste={handlePhonePaste}` к полю телефона в форме регистрации
- ✅ Добавлен обработчик `onPaste={handlePhonePaste}` к полю телефона в форме восстановления пароля

**Логика обработки:**
1. При вставке текста извлекаются все цифры
2. Если вставлен полный номер (11 цифр, начинается с `7`), берется 10 цифр после первой `7`
3. Если цифр больше 10, берутся последние 10
4. Если цифр меньше 10, оставляются как есть (для неполных номеров)
5. Формируется финальное значение с префиксом `+7`

**Тестирование:**
- Вставить `+79990000002` в поле с `+7` → должно получиться `+79990000002` (не обрезается)
- Вставить `79990000002` в поле с `+7` → должно получиться `+79990000002`
- Вставить `9990000002` в поле с `+7` → должно получиться `+79990000002`
- Обычный ввод продолжает работать как раньше

---

**Удачи с деплоем! 🚀**
