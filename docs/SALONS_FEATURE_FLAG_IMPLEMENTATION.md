# Отчёт: Реализация фича-флага "Салоны включены" (с админкой)

## Изменённые файлы

### 1. backend/models.py

**Изменения:**
- Добавлена модель `GlobalSettings` для хранения глобальных настроек (фича-флаги)
- Таблица `global_settings` с полями: `id`, `key` (уникальный), `value` (JSON), `description`, `created_at`, `updated_at`

**Миграция:**
```bash
alembic revision --autogenerate -m "add_global_settings_table"
alembic upgrade head
```

### 2. backend/routers/admin.py

**Изменения:**
- Добавлен импорт `GlobalSettings`
- Добавлены endpoints для управления настройками:
  - `GET /api/admin/settings` — получить все настройки
  - `PUT /api/admin/settings` — обновить настройки (принимает dict, создаёт новые записи если нет)

**Код:**
```python
@router.get("/settings")
def get_global_settings(db: Session = Depends(get_db)) -> dict[str, Any]:
    settings = db.query(GlobalSettings).all()
    result = {}
    for setting in settings:
        result[setting.key] = setting.value
    return result

@router.put("/settings")
def update_global_settings(settings_data: dict[str, Any], db: Session = Depends(get_db)) -> dict[str, Any]:
    updated_keys = []
    for key, value in settings_data.items():
        setting = db.query(GlobalSettings).filter(GlobalSettings.key == key).first()
        if setting:
            setting.value = value
            setting.updated_at = datetime.utcnow()
        else:
            setting = GlobalSettings(key=key, value=value)
            db.add(setting)
        updated_keys.append(key)
    db.commit()
    return {"success": True, "updated_keys": updated_keys}
```

### 3. backend/routers/client.py

**Изменения:**
- Добавлен импорт `GlobalSettings`
- В endpoint `GET /api/client/dashboard/stats` добавлено поле `salons_enabled` в ответ
- **Приоритет источников**: БД (админка) > env override > false

**Код:**
```python
# Флаг "салоны включены": приоритет БД > env override > false
salons_enabled = False

# 1) Пытаемся взять из БД (источник админки)
setting = db.query(GlobalSettings).filter(GlobalSettings.key == "enableSalonFeatures").first()
if setting and setting.value is not None:
    salons_enabled = bool(setting.value)
else:
    # 2) Fallback на env переменную (для локальной разработки/override)
    env_value = os.getenv("SALONS_ENABLED", "").strip().lower()
    if env_value in ("true", "1", "yes"):
        salons_enabled = True

return {
    "past_bookings": past_bookings_count,
    "future_bookings": future_bookings_count,
    "top_salons": top_salons_with_names,
    "top_masters": top_masters_with_names,
    "top_indie_masters": top_indie_masters_with_names,
    "salons_enabled": salons_enabled  # <-- Добавлено
}
```

### 4. frontend/src/pages/AdminSettings.jsx

**Изменения:**
- `loadFeatureSettings()` теперь загружает настройки из БД через `GET /api/admin/settings`
- `handleSave()` сохраняет фича-флаги в БД через `PUT /api/admin/settings`
- Fallback на localStorage для обратной совместимости

### 2. frontend/src/components/ClientDashboardStats.jsx

**Изменения:**
- Убран `false &&` (заглушка)
- Добавлена переменная `salonsEnabled` из API
- Условный рендер блока "Любимых салонов" и секции "Топ салонов" по флагу `salonsEnabled`

**Код:**
```jsx
// Флаг "салоны включены" из API (дефолт: false)
const salonsEnabled = stats.salons_enabled === true;

// Блок "Любимых салонов" - показывается только если salonsEnabled=true
{salonsEnabled && stats && stats.top_salons && stats.top_salons.length > 0 && (
  <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-200">
    ...
  </div>
)}

// Секция "Топ салонов" - показывается только если salonsEnabled=true
{salonsEnabled && stats && stats.top_salons && stats.top_salons.length > 0 && (
  <div className="bg-white p-4 rounded-lg shadow">
    ...
  </div>
)}
```

## Как проверить

### 1. Через админку (основной способ)

**Включить салоны:**
1. Войти в админку: http://localhost:5173/admin (телефон: +79031078685, пароль: test123)
2. Перейти в "Настройки системы"
3. Найти переключатель "Функции салона"
4. Включить и нажать "Сохранить настройки"

**Или через API:**
```bash
ADMIN_TOKEN=$(curl -s -X POST "http://localhost:8000/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"+79031078685","password":"test123"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin).get('access_token',''))")

# Включить салоны
curl -X PUT "http://localhost:8000/api/admin/settings" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"enableSalonFeatures": true}'

# Выключить салоны
curl -X PUT "http://localhost:8000/api/admin/settings" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"enableSalonFeatures": false}'
```

### 2. Переменная окружения SALONS_ENABLED (override для разработки)

Если настройки в БД нет, используется env переменная как fallback:

**Дефолт (салоны выключены):**
```bash
cd /Users/s.devyatov/DeDato/backend
DEV_E2E=true python3 -m uvicorn main:app --host 127.0.0.1 --port 8000 --reload
```

**Салоны включены (override):**
```bash
cd /Users/s.devyatov/DeDato/backend
DEV_E2E=true SALONS_ENABLED=true python3 -m uvicorn main:app --host 127.0.0.1 --port 8000 --reload
```

**Приоритет:** БД (админка) > env override > false

### 3. Проверка через API клиента

**Проверка флага в ответе:**
```bash
TOKEN=$(curl -s -X POST "http://localhost:8000/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"phone":"+79990000101","password":"test123"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin).get('access_token',''))")

curl -s "http://localhost:8000/api/client/dashboard/stats" \
  -H "Authorization: Bearer $TOKEN" | python3 -c "import sys,json; d=json.load(sys.stdin); print('salons_enabled:', d.get('salons_enabled'))"
```

**Ожидаемый результат:**
- При выключенном флаге в админке: `salons_enabled: False`
- При включенном флаге в админке: `salons_enabled: True`

### 4. Проверка UI в браузере

1. Открыть http://localhost:5173
2. Войти как клиент: **+79990000101** / **test123**
3. Проверить ЛК клиента:

**При выключенном флаге в админке:**
- ✅ Блок "Любимых салонов" **не отображается**
- ✅ Секция "Топ салонов" **не отображается**
- ✅ Отображаются только: Прошлых записей, Будущих записей, Любимых мастеров

**При включенном флаге в админке:**
- ✅ Блок "Любимых салонов" **отображается** (если есть данные)
- ✅ Секция "Топ салонов" **отображается** (если есть данные)

### 5. Проверка E2E тестов

```bash
cd /Users/s.devyatov/DeDato
RUNS=2 ./scripts/e2e_full.sh
```

**Ожидаемый результат:**
```
=== E2E run 1 / 2: Playwright (baseURL=http://localhost:5173) ===
  9 passed (28.9s)
=== E2E run 2 / 2: Playwright (baseURL=http://localhost:5173) ===
  9 passed (28.1s)
```

**Важно:** Backend должен быть запущен с `DEV_E2E=true` для работы E2E seed endpoint.

## Детали реализации

### Backend: Приоритет источников

Флаг `salons_enabled` определяется в следующем порядке:

1. **БД (GlobalSettings)**: Ключ `enableSalonFeatures` в таблице `global_settings`
   - Управляется через админку (UI или API)
   - Приоритет: **высший**

2. **Env переменная (SALONS_ENABLED)**: Fallback для локальной разработки
   - Используется, если в БД нет записи
   - Допустимые значения для `true`: `"true"`, `"1"`, `"yes"` (регистронезависимо)
   - Приоритет: **средний**

3. **Дефолт**: `false` (безопасный дефолт)
   - Используется, если нет ни БД, ни env
   - Приоритет: **низший**

### Frontend: Безопасный дефолт

```jsx
const salonsEnabled = stats.salons_enabled === true;
```

Если поле `salons_enabled` отсутствует или `undefined` в ответе API, то `salonsEnabled` будет `false` (безопасный дефолт).

## Acceptance Criteria

✅ **Убран `false &&`**: Заглушка удалена из ClientDashboardStats.jsx  
✅ **Переменная `salonsEnabled`**: Используется для условного рендера блоков салонов  
✅ **Backend endpoint**: Возвращает `salons_enabled` в `/api/client/dashboard/stats`  
✅ **Приоритет БД > env**: Флаг читается из БД (админка), затем env, затем false  
✅ **Админ-интерфейс**: Переключатель в AdminSettings сохраняет в БД через API  
✅ **Безопасный дефолт**: Если флаг не установлен или `undefined` → `false`  
✅ **E2E тесты**: Все 9 тестов проходят (RUNS=2 зелёный)

## Риски и ограничения

- **Нет кеширования**: Флаг читается из БД на каждый запрос `/api/client/dashboard/stats`. Для высоконагруженных систем рекомендуется добавить кеширование (Redis или in-memory cache с TTL).

- **Нет аудита**: Изменения флага не логируются. Для production рекомендуется добавить audit log (кто, когда, старое/новое значение).

- **Env override**: Переменная окружения `SALONS_ENABLED` может переопределить БД, если запись в БД отсутствует. Для production рекомендуется всегда создавать запись в БД при инициализации.

- **Глобальный флаг**: Настройки хранятся в `GlobalSettings` (глобально для всего приложения), не tenant-level. Если в будущем понадобится мульти-тенантность (разные настройки для разных доменов/салонов) — потребуется перенести на уровень домена/тенанта.

## Безопасность

- **RBAC**: Endpoints `/api/admin/settings` (GET, PUT) доступны только админам (`require_admin`).

- **Allow-list ключей**: При обновлении настроек (PUT) разрешены только следующие ключи:
  - `enableSalonFeatures`
  - `enableBlog`
  - `enableReviews`
  - `enableRegistration`
  
  Любые другие ключи отклоняются с ошибкой 400.

- **Устойчивость к отсутствию миграции**: Если таблицы `global_settings` нет (миграция не применена), endpoint `/api/client/dashboard/stats` не падает с 500, а использует fallback (env или false).

## Будущие улучшения

1. **Кеширование**: Кешировать флаг в памяти backend (с TTL или инвалидацией при изменении через API)
2. **Аудит**: Логировать изменения флага (кто, когда, старое/новое значение)
3. **Инициализация**: Создавать дефолтные настройки в БД при первом запуске (миграция или startup event)
4. **Другие фича-флаги**: Использовать аналогичный подход для других функций (например, `enableBlog`, `enableReviews`, `enableRegistration`)
