# Краткий отчет: Перепривязка лояльности на master_id

**Дата:** 2026-01-21

---

## Список измененных файлов

1. **`backend/models.py`**
   - Добавлен `master_id` в `LoyaltyDiscount` и `PersonalDiscount`
   - `salon_id` сделан nullable (legacy)

2. **`backend/alembic/versions/20260121_add_master_id_to_loyalty_discounts.py`** (создан)
   - Миграция: добавление `master_id`, миграция данных

3. **`backend/schemas.py`**
   - Обновлены схемы: добавлен `master_id`, `salon_id` → Optional

4. **`backend/routers/loyalty.py`**
   - Все 14 эндпоинтов переведены на `require_master` и фильтрацию по `master_id`
   - Добавлена функция `get_loyalty_filter()` для обратной совместимости

5. **`backend/auth.py`**
   - Удалены функции `require_salon_or_master()` и `get_salon_id_from_user()`
   - Удалена переменная `SALON_ROLE_ENABLED`

---

## Миграция

**Название:** `20260121_add_master_id_to_loyalty_discounts`

**Upgrade:**
- Добавляет `master_id` в `loyalty_discounts` и `personal_discounts`
- Делает `salon_id` nullable
- Заполняет `master_id` для существующих записей (из первого мастера салона)

**Downgrade:**
- Удаляет `master_id`, возвращает `salon_id` в NOT NULL

---

## Эндпоинты: что изменилось

**Все 14 эндпоинтов `/api/loyalty/*`:**

**Было:**
- Auth: `require_salon_or_master()` → требовала роль salon или мастер в салоне
- Фильтр: `WHERE salon_id = <salon_id>`
- Создание: `salon_id = <salon_id>`

**Стало:**
- Auth: `require_master` → требует только роль master
- Фильтр: `WHERE master_id = <master_id> OR (master_id IS NULL AND salon_id IN <salons>)` (через `get_loyalty_filter()`)
- Создание: `master_id = <master_id>, salon_id = NULL`

---

## Команды проверки

### 1. GET /api/loyalty/status

```bash
curl -X GET "http://localhost:8000/api/loyalty/status" \
  -H "Authorization: Bearer <master_token>"
```

**Ожидаемый ответ:** 200 OK

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
    "conditions": {"condition_type": "first_visit", "parameters": {}},
    "is_active": true,
    "priority": 1
  }'
```

**Ожидаемый ответ:** 200/201 OK с `master_id` в ответе

---

## Почему раньше было 403 и почему теперь нет

**Раньше:**
- Эндпоинты требовали роль `salon` через `require_salon_or_master()`
- Если мастер не работал в салоне → 403 "Operation requires role: salon"

**Теперь:**
- Эндпоинты требуют только роль `master` через `require_master`
- Фильтрация по `master_id` мастера
- Не требуется наличие салонов

---

## Итог

✅ 403 ошибки исправлены  
✅ Система лояльности привязана к `master_id`  
✅ Обратная совместимость с legacy данными  
✅ Миграция создана
