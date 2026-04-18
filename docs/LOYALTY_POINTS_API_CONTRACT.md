# Контракт API: Баллы лояльности клиента

## Endpoint
`GET /api/client/loyalty/points`

## Авторизация
Требуется Bearer token клиента (роль: CLIENT)

## Response Model
`ClientLoyaltyPointsSummaryOut`

## Контракт ответа

### Успешный ответ (200 OK)

```json
{
  "masters": [
    {
      "master_id": 1,
      "master_name": "Мастер Free 0",
      "balance": 100,
      "transactions": [
        {
          "id": 1,
          "master_id": 1,
          "client_id": 12,
          "booking_id": null,
          "transaction_type": "earned",
          "points": 100,
          "earned_at": "2026-02-11T12:30:43",
          "expires_at": "2027-02-11T12:30:43",
          "service_id": null,
          "created_at": "2026-02-11T12:30:43",
          "client_name": null,
          "service_name": null
        }
      ]
    }
  ],
  "total_balance": 100
}
```

### Пустое состояние (200 OK)

Когда у клиента нет баллов:

```json
{
  "masters": [],
  "total_balance": 0
}
```

### Поля ответа

**Корневой объект:**
- `masters` (array): Список мастеров с баллами у клиента
- `total_balance` (number): Общий баланс баллов по всем мастерам

**Объект мастера (ClientLoyaltyPointsOut):**
- `master_id` (number): ID мастера
- `master_name` (string): Имя мастера (или "Мастер #ID" если имя недоступно)
- `balance` (number): Текущий баланс активных баллов у этого мастера
- `transactions` (array): Список транзакций начисления/списания

**Объект транзакции (LoyaltyTransactionOut):**
- `id` (number): ID транзакции
- `master_id` (number): ID мастера
- `client_id` (number): ID клиента
- `booking_id` (number|null): ID брони, за которую начислены баллы
- `transaction_type` (string): 'earned' (начисление) или 'spent' (списание)
- `points` (number): Количество баллов
- `earned_at` (datetime): Дата начисления/списания
- `expires_at` (datetime|null): Дата истечения (только для earned, null = бесконечно)
- `service_id` (number|null): ID услуги
- `created_at` (datetime): Дата создания записи
- `client_name` (string|null): Имя клиента (не используется в клиентском API)
- `service_name` (string|null): Название услуги

## Обработка ошибок

### Отсутствие таблицы loyalty_transactions
Если миграция не применена или таблица не существует:
- Возвращается: `{"masters": [], "total_balance": 0}`
- Логируется: `logger.warning("Таблица loyalty_transactions недоступна...")`

### Ошибки связей (master.user, service)
- Безопасное получение через `hasattr` и `try-except`
- Fallback на дефолтные значения: `"Мастер #ID"`, `None`

### Отсутствие created_at
- Fallback на `earned_at`: `created_at=t.created_at or t.earned_at`

## Проверка через curl

### 1. Получить токен клиента

```bash
TOKEN=$(curl -s -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"phone":"+79990000101","password":"test123"}' | \
  python3 -c "import sys,json; print(json.load(sys.stdin).get('access_token',''))")
```

### 2. Запросить баллы

```bash
curl -s http://localhost:8000/api/client/loyalty/points \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool
```

### 3. Ожидаемый результат

Для клиента +79990000101 после reseed:

```json
{
    "masters": [
        {
            "master_id": 1,
            "master_name": "Мастер Free 0",
            "balance": 100,
            "transactions": [...]
        }
    ],
    "total_balance": 100
}
```

Для клиента без баллов:

```json
{
    "masters": [],
    "total_balance": 0
}
```

## Начисление баллов в reseed

### Автоматическое начисление

Файл: `backend/scripts/reseed_local_test_data.py`

После создания прошлых броней для клиента +79990000101:

```python
# Начисляем баллы лояльности для первого мастера (идемпотентно)
if len(master_results) > 0:
    m = master_results[0]
    try:
        # Проверяем наличие SQLite файла
        import sqlite3
        db_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "bookme.db")
        
        if not os.path.exists(db_path):
            print(f"  [INFO] Skipped loyalty points grant: SQLite db file not found (likely using Postgres)")
        else:
            conn = sqlite3.connect(db_path)
            cursor = conn.cursor()
            
            # Получаем client_id
            cursor.execute("SELECT id FROM users WHERE phone = ?", (target_client_phone,))
            client_row = cursor.fetchone()
            if client_row:
                client_id = client_row[0]
                
                # Удаляем старые транзакции для идемпотентности (только с source='reseed')
                cursor.execute(
                    "DELETE FROM loyalty_transactions WHERE client_id = ? AND master_id = ? AND source = 'reseed'",
                    (client_id, m["master_id"])
                )
                
                # Начисляем 100 баллов с маркером source='reseed'
                cursor.execute(
                    """INSERT INTO loyalty_transactions 
                       (master_id, client_id, booking_id, transaction_type, points, earned_at, expires_at, created_at, source)
                       VALUES (?, ?, NULL, 'earned', 100, datetime('now'), datetime('now', '+365 days'), datetime('now'), 'reseed')""",
                    (m["master_id"], client_id)
                )
                conn.commit()
                print(f"  ✓ Начислено 100 баллов лояльности для {target_client_phone} у мастера {m['master_id']} (source=reseed)")
            else:
                print(f"    [WARN] Клиент {target_client_phone} не найден в БД")
            
            conn.close()
    except Exception as ex:
        print(f"    [WARN] Не удалось начислить баллы для {target_client_phone}: {ex}")
```

### Идемпотентность

- При повторном запуске reseed старые транзакции с маркером `source='reseed'` удаляются
- Создаётся новая транзакция с актуальной датой и маркером `source='reseed'`
- Не накапливаются дубликаты
- Не затрагиваются "реальные" транзакции (manual adjustments, booking-based, legacy)

### Запуск reseed

```bash
# Запустить backend с dev флагами
cd backend
ENVIRONMENT=development ENABLE_DEV_TESTDATA=1 DEV_E2E=true \
  python3 -m uvicorn main:app --reload

# В другом терминале запустить reseed
python3 backend/scripts/reseed_local_test_data.py --base-url http://localhost:8000
```

**Результат:**
```
✓ Начислено 100 баллов лояльности для +79990000101 у мастера 1 (source=reseed)
```

### Проверка идемпотентности

После повторного запуска reseed баланс остаётся 100 (не увеличивается):

```bash
# Запустить reseed второй раз
python3 backend/scripts/reseed_local_test_data.py --base-url http://localhost:8000

# Проверить баланс через API
TOKEN=$(curl -s -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"phone":"+79990000101","password":"test123"}' | \
  python3 -c "import sys,json; print(json.load(sys.stdin).get('access_token',''))")

curl -s -X GET "http://localhost:8000/api/client/loyalty/points" \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool

# Ожидаемый результат: total_balance=100 (не 200!)
```

## Изменения в коде

### Backend: models.py (LoyaltyTransaction)

**Добавлено поле:**
```python
source = Column(String, nullable=True)  # Источник транзакции: 'reseed', 'manual', 'booking', NULL (legacy)
```

**Миграция:**
- `backend/alembic/versions/7b21fbc7e4a0_add_source_to_loyalty_transactions.py`
- Добавляет колонку `source VARCHAR` (nullable)
- Обратно совместимо: старые записи имеют `source=NULL`

### Backend: client_loyalty.py

**Было:**
- `response_model=List[ClientLoyaltyPointsOut]` (массив)
- Нет обработки ошибок
- Проблемы с null-связями (`trans.master.user`, `t.service`)
- Проблемы с null `created_at`

**Стало:**
- `response_model=ClientLoyaltyPointsSummaryOut` (объект)
- Try-except для отсутствия таблицы loyalty_transactions
- Безопасное получение имени мастера через `hasattr` и try-except
- Безопасное получение имени услуги
- Fallback для `created_at`: `t.created_at or t.earned_at`

### Frontend: ClientLoyaltyPoints.jsx

**Было:**
- Ожидался массив: `setPoints(data || [])`
- `console.error` спамил при ошибках
- Красный fallback UI

**Стало:**
- Ожидается объект: `setPoints(data?.masters || [])`
- Добавлен `setTotalBalance(data?.total_balance || 0)`
- Тихая обработка ошибок без console.error
- Нейтральный fallback UI: "Информация о баллах временно недоступна"
- Использует `masterPoints.balance` вместо `masterPoints.active_points`

## Причина 500 и исправление

### Реальная причина

**ValidationError: created_at cannot be None**

При создании `LoyaltyTransactionOut` поле `created_at` было обязательным (non-nullable), но в БД записи, созданные через SQL без явного указания `created_at`, имели NULL значение.

```python
# Ошибка возникала здесь:
LoyaltyTransactionOut(
    ...
    created_at=t.created_at,  # <- было None для записей из SQL
    ...
)
```

### Исправление

1. **Backend endpoint:**
   - Добавлен fallback: `created_at=t.created_at or t.earned_at`
   - Добавлена обработка отсутствия таблицы (OperationalError, ProgrammingError)
   - Безопасное получение связанных объектов (master.user, service)

2. **Reseed скрипт:**
   - Добавлено явное указание `created_at` в SQL INSERT
   - Идемпотентное удаление старых транзакций

3. **Frontend:**
   - Адаптирован к новому контракту API (объект вместо массива)
   - Graceful fallback без спама в консоль

## Acceptance Criteria

✅ После запуска reseed клиент +79990000101 имеет 100 баллов
✅ В консоли браузера НЕТ ошибок 500 по /api/client/loyalty/points
✅ `/api/client/loyalty/points` возвращает 200 OK с корректным JSON
✅ При отсутствии данных: 200 OK с `{"masters": [], "total_balance": 0}`
✅ Frontend показывает graceful fallback без спама в консоль
✅ `RUNS=2 ./scripts/e2e_full.sh` зелёный (18/18 passed)
