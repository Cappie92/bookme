# Read-only аудит: онбординг мастера (город/таймзона) + гейт Loyalty

**Дата:** 2026-01-28  
**Без правок кода.**

---

## Summary

- **Регистрация:** `Master` создаётся в `routers/auth.py` при `POST /api/auth/register` (role=master). Явно заданы `city=None`, `timezone=None`, `timezone_confirmed=False`. Дефолтов/автоподстановки `Europe/Moscow` при создании мастера нет.
- **Update профиля:** `PUT /api/master/profile` в `routers/master.py`. `timezone` — `strip()`, пустой → 400 до сохранения. `city` не strip'ится, нормализации `""` → `None` нет. `timezone_confirmed = (has_city && has_tz)` после применения полей; при очистке city/timezone сбрасывается.
- **GET /api/master/settings:** формируется в `routers/master.py`, в `master` возвращаются `city`, `timezone`, `timezone_confirmed`. Web и mobile используют именно `timezone_confirmed` для блокировки Loyalty.
- **Backend gate:** `_require_master_onboarding_completed` в `routers/loyalty.py`. Вызывается во всех create/update quick, complex, personal. При незавершённом онбординге — **400**, текст «Выберите город и часовой пояс в настройках профиля. Создание скидок недоступно.»
- **БД/модель:** `Master.timezone` nullable, без default; `city` nullable; `timezone_confirmed` NOT NULL, default 0. Миграция `20260128_tz_confirmed` добавляет столбец и проставляет 1 существующим мастерам с city+timezone. В БД для `masters.timezone` / `masters.city` default'ов нет.

---

## 1) Регистрация мастера

### Где создаётся Master

- **Роутер:** `backend/routers/auth.py`
- **Эндпоинт:** `POST /api/auth/register` (при `user_in.role == UserRole.MASTER`)
- **Действие:** создаётся `User`, затем `Master`, коммит в БД. Отдельного CRUD-слоя нет.

### Фрагмент создания Master

```python
# backend/routers/auth.py, ~91–109
    if user_in.role == UserRole.MASTER:
        # city/timezone = NULL; принудительный выбор после регистрации (онбординг).
        master = Master(
            user_id=user.id,
            bio="",
            experience_years=0,
            can_work_independently=True,
            can_work_in_salon=True,
            website=None,
            created_at=datetime.utcnow(),
            city=None,
            timezone=None,
            timezone_confirmed=False,
        )
        db.add(master)
        db.commit()
        db.refresh(master)
```

**Итог:** при регистрации мастера явно заданы `city=None`, `timezone=None`, `timezone_confirmed=False`. Автоподстановки TZ нет.

### Дефолт / автоподстановка `Europe/Moscow` или иной TZ

- **Модель `Master`** (`backend/models.py`):  
  `timezone = Column(String, nullable=True)` — **без** `default`.  
  `city` nullable, `timezone_confirmed` Boolean default False.

- **Модель `IndieMaster`** (`backend/models.py` ~212):  
  `timezone = Column(String, default="Europe/Moscow")` — дефолт есть, но онбординг в аудите про **Master**, не IndieMaster.

- **Регистрация (auth):** явно передаёт `timezone=None`, дефолт модели не используется.

- **Другие места:**  
  `Europe/Moscow` встречается в тестах, `frontend` (ServiceDashboard, ClientDashboard, WorkingHours, cities, dateUtils, scheduleUtils), скриптах (seed, create_test_masters, create_users_from_csv), `models_unified.py`, миграции `20250127_unified_master_structure` (другая таблица).  
  В **создании Master при регистрации** и в **модели Master** автоподстановки `Europe/Moscow` нет.

**Вывод:** для онбординга мастера (Master) дефолта/автоподстановки TZ при регистрации нет. Риск только у `IndieMaster` при необходимости того же онбординга.

---

## 2) Update профиля мастера

### Где реализован PUT/PATCH

- **Эндпоинт:** `PUT /api/master/profile`
- **Файл:** `backend/routers/master.py`
- **Функция:** `update_master_profile` (~764–877).  
  PATCH профиля мастера отдельно не реализован. Салонный `PATCH /api/salon/masters/{id}/settings` не трогает `Master.city` / `Master.timezone`.

### Приём `timezone` и `city`, strip, нормализация `""` → `None`

```python
# backend/routers/master.py, ~854–861
    if city is not None:
        master.city = city
    if timezone is not None:
        master.timezone = str(timezone).strip()
```

- **timezone:** есть `strip()`. Пустая строка не сохраняется: до записи вызывается `_validate_master_timezone_update`; при пустом/отсутствующем timezone — **400**, в БД не попадает.
- **city:** значения присваиваются как есть, **strip() не применяется**, нормализации `""` → `None` нет. Может сохраняться `""` или `"   "`.

### Вычисление `timezone_confirmed` и сброс при очистке

```python
# backend/routers/master.py, ~858–862
    # Онбординг завершён только если заданы и city, и timezone
    has_city = bool((getattr(master, "city", None) or "").strip())
    has_tz = bool((getattr(master, "timezone", None) or "").strip())
    master.timezone_confirmed = has_city and has_tz
```

- **Формула:** строго `(has_city && has_tz)`: оба непустые после `strip()`.
- **Сброс:** при каждом `PUT` флаг пересчитывается от текущих `master.city` / `master.timezone`. Если занулить или очистить одно из полей (или оба), при следующем update `timezone_confirmed` станет `False`.

**Вывод:** логика `timezone_confirmed` и сброс корректны. Риск: `city` без strip — возможны пробельные значения и дубликаты типа `"Москва"` / `" Москва "`; явной нормализации `""` → `None` нет.

---

## 3) GET /api/master/settings (источник для web/mobile)

### Где формируется ответ и какие поля

- **Файл:** `backend/routers/master.py`
- **Эндпоинт:** `GET /api/master/settings` (`get_master_settings`, ~502–538)

```python
# backend/routers/master.py, ~513–538
    return {
        "user": { "id", "email", "phone", "full_name", "birth_date" },
        "master": {
            "id", "bio", "experience_years", "can_work_independently", "can_work_in_salon",
            "auto_confirm_bookings", "website", "domain", "logo", "photo", "use_photo_as_logo",
            "address", "background_color", "city", "timezone",
            "timezone_confirmed": bool(getattr(master, "timezone_confirmed", False)),
            "site_description",
        }
    }
```

В объекте `master` есть `city`, `timezone`, `timezone_confirmed`.

### Использование web/mobile: именно `timezone_confirmed`

**Web:**

- Данные: `apiGet('/api/master/settings')` → `data.master` сохраняется в `masterSettings` (`MasterDashboard.jsx` ~1135–1136).
- Loyalty: `frontend/src/components/LoyaltySystem.jsx`:

```javascript
const onboardingCompleted = Boolean(masterSettings?.timezone_confirmed)
const createDisabled = hasLoyaltyAccess && !onboardingCompleted
```

Блокировка создания скидок завязана на `timezone_confirmed`, а не только на `timezone`.

**Mobile:**

- Данные: `getMasterSettings()` → `GET /api/master/settings` (`mobile/src/services/api/master.ts` ~228–230). Ответ содержит `{ user, master }`.
- Loyalty: `mobile/app/master/loyalty.tsx`:

```ts
const onboardingCompleted = Boolean(masterSettings?.master?.timezone_confirmed);
const createDisabled = hasLoyaltyAccess && !onboardingCompleted;
```

Используется `master.timezone_confirmed`.

**Вывод:** и web, и mobile используют для гейта Loyalty именно `timezone_confirmed`, а не только наличие `timezone`.

---

## 4) Backend gate на Loyalty

### Функция гейта

**Файл:** `backend/routers/loyalty.py`

```python
# backend/routers/loyalty.py, ~223–245
def _require_master_onboarding_completed(master_id: int, db: Session) -> None:
    """
    Требует завершённый онбординг (city + timezone выбраны, timezone_confirmed=True).
    Иначе HTTP 400: блокировка создания/обновления скидок loyalty.
    """
    m = db.query(Master).filter(Master.id == master_id).first()
    if not m:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Мастер не найден",
        )
    tz = getattr(m, "timezone", None)
    if not tz or not str(tz).strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Выберите город и часовой пояс в настройках профиля. Создание скидок недоступно.",
        )
    confirmed = getattr(m, "timezone_confirmed", False)
    if not confirmed:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Выберите город и часовой пояс в настройках профиля. Создание скидок недоступно.",
        )
```

### Где вызывается (create/update quick, complex, personal)

| Эндпоинт | Файл | Строка |
|----------|------|--------|
| `POST /api/loyalty/quick-discounts` | `routers/loyalty.py` | 569 |
| `PUT /api/loyalty/quick-discounts/{id}` | `routers/loyalty.py` | 624 |
| `POST /api/loyalty/complex-discounts` | `routers/loyalty.py` | 688 |
| `PUT /api/loyalty/complex-discounts/{id}` | `routers/loyalty.py` | 763 |
| `POST /api/loyalty/personal-discounts` | `routers/loyalty.py` | 816 |
| `PUT /api/loyalty/personal-discounts/{id}` | `routers/loyalty.py` | 873 |

Во всех перечисленных create/update гейт вызывается до основной логики. GET-эндпоинты (списки скидок) гейт **не** используют.

### Ответ при незавершённом онбординге

- **Код:** `400` (`HTTP_400_BAD_REQUEST`).
- **Текст:** `"Выберите город и часовой пояс в настройках профиля. Создание скидок недоступно."`  
  (один и тот же для пустого/отсутствующего timezone и для `timezone_confirmed=False`).

---

## 5) БД / модели / миграции

### Модель Master (поля `timezone`, `city`, `timezone_confirmed`)

**Файл:** `backend/models.py`

```python
# backend/models.py, ~176–178
    city = Column(String, nullable=True)
    timezone = Column(String, nullable=True)  # без default — принудительный выбор после регистрации
    timezone_confirmed = Column(Boolean, default=False, nullable=False)
```

У `timezone` и `city` default в модели нет.

### Миграция: `timezone_confirmed` и проставление 1 существующим

**Файл:** `backend/alembic/versions/20260128_add_timezone_confirmed_and_remove_default.py`

```python
def upgrade() -> None:
    op.add_column(
        "masters",
        sa.Column("timezone_confirmed", sa.Boolean(), nullable=False, server_default="0"),
    )
    op.execute(
        "UPDATE masters SET timezone_confirmed = 1 "
        "WHERE timezone IS NOT NULL AND trim(COALESCE(timezone, '')) != '' "
        "AND city IS NOT NULL AND trim(COALESCE(city, '')) != ''"
    )

def downgrade() -> None:
    op.drop_column("masters", "timezone_confirmed")
```

- Добавляется столбец `masters.timezone_confirmed` (NOT NULL, `server_default="0"`).
- Существующие мастера с непустыми `city` и `timezone` помечаются `timezone_confirmed=1`.
- Столбцы `masters.timezone` и `masters.city` эта миграция **не меняет**.

### Default для `timezone` / `city` в БД

- **Миграция `3b2ef651469c`** (`add_city_and_timezone_to_salon_and_master`):  
  `masters.city` и `masters.timezone` добавлены как `nullable=True`, **без** `server_default`.

- **Миграция `20260128_tz_confirmed`:**  
  Меняет только `timezone_confirmed`; для `timezone`/`city` default не вводит.

**Вывод:** в БД у `masters.timezone` и `masters.city` default'ов нет. `server_default` есть только у `timezone_confirmed` (= 0).

---

## Чек-лист для ручной проверки

### API

1. [ ] `POST /api/auth/register` (role=master) → в БД у `masters`: `city` NULL, `timezone` NULL, `timezone_confirmed` 0.
2. [ ] `PUT /api/master/profile` с `timezone=""` или без `timezone` при пустом текущем → **400**.
3. [ ] `PUT /api/master/profile` с `city` + `timezone` (непустые) → 200, `timezone_confirmed` = 1.
4. [ ] `GET /api/master/settings` → в `master` есть `timezone_confirmed` (bool).
5. [ ] `POST /api/loyalty/quick-discounts` при `timezone_confirmed=0` → **400**, в `detail` фраза про город/часовой пояс.
6. [ ] После установки city+timezone и `timezone_confirmed=1` — создание quick/complex/personal скидок разрешено (200).

### Web

7. [ ] Мастер без онбординга: раздел Loyalty — баннер «Выберите город…», кнопки создания скидок неактивны, есть переход в настройки.
8. [ ] После выбора города и таймзоны в настройках и возврата в Loyalty — баннер скрыт, создание скидок доступно.
9. [ ] В форме настроек при пустом timezone поле не подставляет `Europe/Moscow` (например, пусто или плейсхолдер).

### Mobile

10. [ ] Аналогично web: баннер и блокировка Loyalty при не пройденном онбординге; после настроек — разблокировка.
11. [ ] Настройки мастера: обновление профиля через `PUT /api/master/profile` (например, из модалок EditProfile/EditWork/EditWebsite) не ломает онбординг (city/timezone не затираются без явной отправки).

### Общее

12. [ ] Очистка city или timezone в настройках → при следующем заходе в Loyalty снова блокировка и баннер.
