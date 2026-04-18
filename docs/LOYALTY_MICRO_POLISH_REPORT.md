# Loyalty Micro-Polish: Отчёт

## Цель
Убрать потенциальные будущие проблемы в системе лояльности без поломки текущего функционала и E2E тестов.

## Выполненные задачи

### 1. Идемпотентность через маркер `source='reseed'`

**Проблема:**
- Старая логика: `DELETE WHERE booking_id IS NULL` могла затронуть "реальные" транзакции (manual adjustments)

**Решение:**
- Добавлено поле `source VARCHAR` (nullable) в таблицу `loyalty_transactions`
- Миграция: `backend/alembic/versions/7b21fbc7e4a0_add_source_to_loyalty_transactions.py`
- Reseed теперь:
  - Удаляет только записи с `source='reseed'`
  - Создаёт новые записи с `source='reseed'`
  - Не трогает legacy записи (`source=NULL`) и другие типы транзакций

**SQL логика удаления:**
```sql
DELETE FROM loyalty_transactions 
WHERE client_id = ? AND master_id = ? AND source = 'reseed'
```

**SQL логика вставки:**
```sql
INSERT INTO loyalty_transactions 
  (master_id, client_id, booking_id, transaction_type, points, earned_at, expires_at, created_at, source)
VALUES (?, ?, NULL, 'earned', 100, datetime('now'), datetime('now', '+365 days'), datetime('now'), 'reseed')
```

### 2. Проверка наличия SQLite файла

**Проблема:**
- Reseed падал с traceback при использовании Postgres или отсутствии `bookme.db`

**Решение:**
- Добавлена проверка `os.path.exists(db_path)` перед `sqlite3.connect()`
- При отсутствии файла: понятное INFO сообщение, не stacktrace
- Вывод: `[INFO] Skipped loyalty points grant: SQLite db file not found (likely using Postgres)`

**Код:**
```python
if not os.path.exists(db_path):
    print(f"  [INFO] Skipped loyalty points grant: SQLite db file not found (likely using Postgres)")
else:
    # SQLite logic
```

### 3. Унификация пароля тест-клиента

**Проверка:**
- Фактический пароль в reseed: `test123` (константа `CLIENT_PASSWORD`)
- Документация (`LOYALTY_POINTS_API_CONTRACT.md`): уже использует `test123`
- Унификация не требовалась — всё корректно

## Проверка

### Reseed (первый запуск)
```bash
python3 backend/scripts/reseed_local_test_data.py --base-url http://localhost:8000
```

**Вывод:**
```
✓ Начислено 100 баллов лояльности для +79990000101 у мастера 1 (source=reseed)
```

### Reseed (повторный запуск — идемпотентность)
```bash
python3 backend/scripts/reseed_local_test_data.py --base-url http://localhost:8000
```

**Вывод:**
```
✓ Начислено 100 баллов лояльности для +79990000101 у мастера 1 (source=reseed)
```

### API проверка баланса
```bash
TOKEN=$(curl -s -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"phone":"+79990000101","password":"test123"}' | \
  python3 -c "import sys,json; print(json.load(sys.stdin).get('access_token',''))")

curl -s -X GET "http://localhost:8000/api/client/loyalty/points" \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool
```

**Результат:**
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
                    "earned_at": "2026-02-11T12:49:01",
                    "expires_at": "2027-02-11T12:49:01",
                    "service_id": null,
                    "created_at": "2026-02-11T12:49:01",
                    "client_name": null,
                    "service_name": null
                }
            ]
        }
    ],
    "total_balance": 100
}
```

**✅ Баланс остался 100 (не увеличился до 200)**

### БД проверка
```bash
sqlite3 backend/bookme.db "SELECT id, master_id, client_id, points, source FROM loyalty_transactions WHERE client_id = (SELECT id FROM users WHERE phone = '+79990000101') ORDER BY id"
```

**Результат:**
```
1|1|12|100|reseed
```

**✅ Только одна запись с `source='reseed'`**

### E2E тесты
```bash
RUNS=2 ./scripts/e2e_full.sh
```

**Результат:**
```
=== E2E run 1 / 2: Playwright ===
  ✓  9 passed (31.4s)

=== E2E run 2 / 2: Playwright ===
  ✓  9 passed (29.4s)

=== E2E complete (2 run(s)) ===
```

**✅ Все тесты зелёные**

## Изменённые файлы

1. **backend/models.py**
   - Добавлено поле `source VARCHAR` (nullable) в модель `LoyaltyTransaction`

2. **backend/alembic/versions/7b21fbc7e4a0_add_source_to_loyalty_transactions.py**
   - Миграция для добавления колонки `source`

3. **backend/scripts/reseed_local_test_data.py**
   - Проверка наличия SQLite файла перед подключением
   - Использование `source='reseed'` в DELETE и INSERT
   - Обновлённый вывод: `(source=reseed)`

4. **docs/LOYALTY_POINTS_API_CONTRACT.md**
   - Обновлена секция "Идемпотентность" с упоминанием `source='reseed'`
   - Обновлён код примера reseed с проверкой файла и маркером
   - Добавлена секция "Проверка идемпотентности"
   - Добавлена информация о новом поле `source` в разделе "Изменения в коде"

## Итог

✅ Идемпотентность через явный маркер `source='reseed'` (не затрагивает реальные транзакции)  
✅ Reseed не падает при отсутствии SQLite файла (graceful skip)  
✅ Пароль тест-клиента унифицирован (`test123` везде)  
✅ Повторный reseed не увеличивает баланс (100 → 100, не 200)  
✅ E2E тесты зелёные (RUNS=2)  
✅ Миграция добавлена и применена  
✅ Документация обновлена  

**Время выполнения:** ~10 минут  
**Breaking changes:** Нет  
**Обратная совместимость:** Да (поле `source` nullable, старые записи имеют NULL)
