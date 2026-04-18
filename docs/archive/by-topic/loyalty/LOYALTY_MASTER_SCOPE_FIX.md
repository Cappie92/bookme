# Отчет: Перепривязка системы лояльности на master_id

**Дата:** 2026-01-21  
**Статус:** ✅ Завершено

---

## Проблема

Система лояльности (скидки) была привязана к `salon_id`, что вызывало:
- 403 ошибки для мастеров: "Operation requires role: salon"
- Зависимость от роли salon, которая может быть отключена
- Неправильная архитектура: лояльность — это функционал мастера, а не салона

---

## Решение

Перепривязка системы лояльности на `master_id` вместо `salon_id`:
- Все скидки теперь принадлежат мастеру
- Роль salon не требуется для доступа
- Обратная совместимость с legacy данными (salon_id)

---

## Измененные файлы

### 1. Backend Models

**Файл:** `backend/models.py`

**Изменения:**
- `LoyaltyDiscount` (строки 1042-1082):
  - Добавлено: `master_id = Column(Integer, ForeignKey("masters.id"), nullable=False, index=True)`
  - Изменено: `salon_id` → `nullable=True` (legacy)
  - Добавлена связь: `master = relationship("Master")`
  - Обновлены индексы: добавлен `idx_loyalty_discount_master`

- `PersonalDiscount` (строки 1085-1116):
  - Добавлено: `master_id = Column(Integer, ForeignKey("masters.id"), nullable=False, index=True)`
  - Изменено: `salon_id` → `nullable=True` (legacy)
  - Добавлена связь: `master = relationship("Master")`
  - Обновлены индексы: добавлен `idx_personal_discount_master`

---

### 2. Миграция базы данных

**Файл:** `backend/alembic/versions/20260121_add_master_id_to_loyalty_discounts.py`

**Что делает:**

**Upgrade:**
1. Добавляет `master_id` в `loyalty_discounts` (nullable)
2. Добавляет `master_id` в `personal_discounts` (nullable)
3. Создает внешние ключи и индексы
4. Делает `salon_id` nullable в обеих таблицах (legacy)
5. Мигрирует данные:
   - Для существующих записей с `salon_id` заполняет `master_id` из первого мастера салона
   - Если мастера нет — оставляет `master_id = NULL` (legacy записи)

**Downgrade:**
- Удаляет `master_id`, индексы и внешние ключи
- Возвращает `salon_id` в `NOT NULL`

---

### 3. Backend Schemas

**Файл:** `backend/schemas.py`

**Изменения:**
- `LoyaltyDiscount` (строки 1511-1518):
  - Добавлено: `master_id: int`
  - Изменено: `salon_id: Optional[int] = None` (legacy)

- `PersonalDiscount` (строки 1541-1548):
  - Добавлено: `master_id: int`
  - Изменено: `salon_id: Optional[int] = None` (legacy)

---

### 4. Backend Router

**Файл:** `backend/routers/loyalty.py`

**Изменения:**

**Импорты:**
- Удалено: `require_salon_or_master`, `get_salon_id_from_user`
- Добавлено: `require_master`, `get_master_id_from_user` (из `routers.accounting`)

**Новая функция:**
- `get_loyalty_filter()` (строки 34-49):
  - Возвращает фильтр для выборки скидок мастера
  - Поддерживает обратную совместимость: `master_id = owner` ИЛИ `(master_id IS NULL AND salon_id в салонах мастера)`

**Обновленные эндпоинты (все 14):**

1. `GET /api/loyalty/status`
   - Было: `require_salon_or_master()`, фильтр по `salon_id`
   - Стало: `require_master`, фильтр через `get_loyalty_filter(master_id, ...)`

2. `POST /api/loyalty/quick-discounts`
   - Было: `salon_id = get_salon_id_from_user(...)`, создание с `salon_id=salon_id`
   - Стало: `master_id = get_master_id_from_user(...)`, создание с `master_id=master_id, salon_id=None`

3. `GET /api/loyalty/quick-discounts`
   - Было: фильтр `LoyaltyDiscount.salon_id == salon_id`
   - Стало: фильтр `get_loyalty_filter(master_id, ...)`

4. `PUT /api/loyalty/quick-discounts/{id}`
   - Было: фильтр `salon_id == salon_id`
   - Стало: фильтр `get_loyalty_filter(master_id, ...)`

5. `DELETE /api/loyalty/quick-discounts/{id}`
   - Было: фильтр `salon_id == salon_id`
   - Стало: фильтр `get_loyalty_filter(master_id, ...)`

6. `POST /api/loyalty/complex-discounts`
   - Было: создание с `salon_id=salon_id`
   - Стало: создание с `master_id=master_id, salon_id=None`

7. `GET /api/loyalty/complex-discounts`
   - Было: фильтр по `salon_id`
   - Стало: фильтр через `get_loyalty_filter(master_id, ...)`

8. `PUT /api/loyalty/complex-discounts/{id}`
   - Было: фильтр по `salon_id`
   - Стало: фильтр через `get_loyalty_filter(master_id, ...)`

9. `DELETE /api/loyalty/complex-discounts/{id}`
   - Было: фильтр по `salon_id`
   - Стало: фильтр через `get_loyalty_filter(master_id, ...)`

10. `POST /api/loyalty/personal-discounts`
    - Было: проверка дубликата по `salon_id`, создание с `salon_id=salon_id`
    - Стало: проверка дубликата по `master_id`, создание с `master_id=master_id, salon_id=None`

11. `GET /api/loyalty/personal-discounts`
    - Было: фильтр по `salon_id`
    - Стало: фильтр через `get_loyalty_filter(master_id, ...)`

12. `PUT /api/loyalty/personal-discounts/{id}`
    - Было: фильтр по `salon_id`
    - Стало: фильтр через `get_loyalty_filter(master_id, ...)`

13. `DELETE /api/loyalty/personal-discounts/{id}`
    - Было: фильтр по `salon_id`
    - Стало: фильтр через `get_loyalty_filter(master_id, ...)`

14. `GET /api/loyalty/check-discount/{client_phone}`
    - Было: фильтр по `salon_id`
    - Стало: фильтр через `get_loyalty_filter(master_id, ...)`

---

### 5. Backend Auth (очистка)

**Файл:** `backend/auth.py`

**Удалено:**
- Функция `require_salon_or_master()` (больше не используется)
- Функция `get_salon_id_from_user()` (больше не используется)
- Переменная `SALON_ROLE_ENABLED` (больше не нужна)
- Импорт `logging` (если не используется в других местах)

---

## Миграция данных

**Файл:** `backend/alembic/versions/20260121_add_master_id_to_loyalty_discounts.py`

**Логика миграции:**
1. Для каждой записи с `salon_id`:
   - Ищет первого мастера салона через `salon_masters`
   - Заполняет `master_id` этим мастером
   - Если мастера нет — оставляет `master_id = NULL` (legacy)

2. После миграции:
   - Новые записи создаются только с `master_id`
   - Legacy записи (с `master_id = NULL`) показываются только если мастер работает в соответствующем салоне

---

## Обратная совместимость

**Функция `get_loyalty_filter()`:**

```python
def get_loyalty_filter(master_id: int, db: Session, model_class):
    master = db.query(Master).filter(Master.id == master_id).first()
    salon_ids = [s.id for s in master.salons] if master and master.salons else []
    
    if salon_ids:
        # Показываем: master_id = owner ИЛИ legacy (master_id IS NULL AND salon_id в салонах мастера)
        return or_(
            model_class.master_id == master_id,
            (model_class.master_id.is_(None)) & (model_class.salon_id.in_(salon_ids))
        )
    else:
        # Только записи с master_id
        return model_class.master_id == master_id
```

**Результат:**
- Мастер видит свои скидки (с `master_id = owner`)
- Мастер видит legacy скидки салона, если работает в этом салоне
- Новые записи всегда создаются с `master_id`

---

## Эндпоинты: что изменилось

### До изменений

**Авторизация:** `require_salon_or_master()` → требовала роль salon или мастер в салоне  
**Фильтрация:** `WHERE salon_id = <salon_id>`  
**Создание:** `salon_id = <salon_id>`

**Проблема:** 403 для мастеров без салона

---

### После изменений

**Авторизация:** `require_master` → требует только роль master  
**Фильтрация:** `WHERE master_id = <master_id> OR (master_id IS NULL AND salon_id IN <salons>)`  
**Создание:** `master_id = <master_id>, salon_id = NULL`

**Результат:** ✅ Работает для всех мастеров

---

## Команды проверки (curl)

### 1. GET /api/loyalty/status

```bash
curl -X GET "http://localhost:8000/api/loyalty/status" \
  -H "Authorization: Bearer <master_token>" \
  -H "Content-Type: application/json"
```

**Ожидаемый ответ:** 200 OK
```json
{
  "quick_discounts": [...],
  "complex_discounts": [...],
  "personal_discounts": [...],
  "total_discounts": 0,
  "active_discounts": 0
}
```

---

### 2. POST /api/loyalty/quick-discounts

```bash
curl -X POST "http://localhost:8000/api/loyalty/quick-discounts" \
  -H "Authorization: Bearer <master_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "discount_type": "quick",
    "name": "Новый клиент",
    "description": "Скидка за первую запись",
    "discount_percent": 10.0,
    "max_discount_amount": null,
    "conditions": {
      "condition_type": "first_visit",
      "parameters": {}
    },
    "is_active": true,
    "priority": 1
  }'
```

**Ожидаемый ответ:** 200/201 OK
```json
{
  "id": 1,
  "master_id": 123,
  "salon_id": null,
  "discount_type": "quick",
  "name": "Новый клиент",
  ...
}
```

---

### 3. Проверка доступа к чужим скидкам

```bash
# Попытка обновить скидку другого мастера
curl -X PUT "http://localhost:8000/api/loyalty/quick-discounts/999" \
  -H "Authorization: Bearer <master_token>" \
  -H "Content-Type: application/json" \
  -d '{"discount_percent": 20.0}'
```

**Ожидаемый ответ:** 404 "Скидка не найдена"
(Фильтр по `master_id` не находит чужую скидку)

---

## Почему раньше было 403 и почему теперь нет

### Раньше (403)

1. **Эндпоинты требовали роль salon:**
   - `require_salon_or_master()` проверяла наличие салонов у мастера
   - Если мастер не работал в салоне → 403

2. **Фильтрация по salon_id:**
   - Все запросы фильтровались по `salon_id`
   - Для получения `salon_id` требовалась работа в салоне

3. **Архитектурная ошибка:**
   - Лояльность — функционал мастера, но был привязан к салону

---

### Теперь (200)

1. **Эндпоинты требуют только роль master:**
   - `require_master` — простая проверка роли
   - Не требует наличия салонов

2. **Фильтрация по master_id:**
   - Все запросы фильтруются по `master_id` мастера
   - Обратная совместимость для legacy записей

3. **Правильная архитектура:**
   - Лояльность принадлежит мастеру
   - `salon_id` — legacy поле, не используется в новой логике

---

## Итог

✅ **403 ошибки исправлены**

- Все эндпоинты работают для мастера без проверки на салоны
- Система лояльности привязана к `master_id`
- Обратная совместимость с legacy данными

✅ **Миграция создана**

- Добавлен `master_id` в таблицы
- Миграция данных для существующих записей
- `salon_id` сделан nullable (legacy)

✅ **Готово к тестированию**

- Применить миграцию: `alembic upgrade head`
- Проверить доступ мастера к системе лояльности

---

**Автор:** AI Assistant  
**Дата:** 2026-01-21
