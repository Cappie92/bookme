# Аудит: priority, создание/обновление мастера, timezone/city

**Дата:** 2026-01-28

---

## A1. Priority для condition_type в winner selection

### Где задаётся

- **Файл:** `backend/utils/loyalty_discounts.py`
- **Маппинг:** `CONDITION_TYPE_PRIORITY` (строки 27–35), комментарий: «меньше = выше приоритет».
- **Использование:** `_sort_key` возвращает `(-pct, priority, rid)`; `applicable.sort(key=_sort_key)` — сортировка по возрастанию. Первый элемент списка = победитель.

### Ранг

| condition_type    | priority | Бизнес-порядок     |
|-------------------|----------|---------------------|
| birthday          | 1        | 1 (высший)          |
| returning_client  | 2        | 2                   |
| regular_visits    | 3        | 3                   |
| first_visit       | 4        | 4                   |
| happy_hours       | 5        | 5                   |
| service_discount  | 6        | 6 (низший)          |
| personal (и т.п.) | 7        | PERSONAL_PRIORITY   |

Меньшее значение `priority` → выше приоритет → раньше в отсортированном списке → выбирается как winner. Порядок **совпадает** с требованием: birthday > returning > regular_visits > first_visit > happy_hours > service_discount.

**Вывод:** Фикс не нужен. Логика корректна.

---

## A2. Точки создания/обновления мастера (timezone / city)

### Модель Master

- **Файл:** `backend/models.py`
- **Поля:** `city` (String, nullable), `timezone` (String, **default="Europe/Moscow"**). В БД (миграция `3b2ef651469c`) оба nullable, **без** server default.

### 1. Регистрация (создание мастера)

| Эндпоинт | Файл | Действие |
|----------|------|----------|
| `POST /api/auth/register` (role=master) | `routers/auth.py` ~95 | `Master(user_id=..., bio="", experience_years=0, ...)`. **Не передаются** `city`, `timezone`. |

**Итог:** При создании используются дефолты модели. `city` не задаётся → остаётся `None`. `timezone` не задаётся → подставляется **`Europe/Moscow`** из `default=`. В БД мастер оказывается с `timezone = 'Europe/Moscow'`, то есть «как будто выбрана» без реального выбора.

### 2. Обновление профиля мастера

| Эндпоинт | Файл | Действие |
|----------|------|----------|
| `PUT /api/master/profile` | `routers/master.py` ~765 | Form: `city`, `timezone`. Вызов `_validate_master_timezone_update`: пустой/отсутствующий timezone → 400. Обновление: `if city is not None: master.city = city`, `if timezone is not None: master.timezone = str(timezone).strip()`. |

**Итог:** timezone проверяется. Но **дефолт при создании** уже задаёт `Europe/Moscow`, поэтому новый мастер формально «проходит» валидацию до первого захода в настройки. City может оставаться `None`, пока не передан в Form.

### 3. Салон: настройки мастера

| Эндпоинт | Файл | Действие |
|----------|------|----------|
| `PATCH /api/salon/masters/{id}/settings` | `routers/salon.py` ~897 | Обновление `SalonMasterServiceSettings`, расписания и т.п. **Не трогает** `Master.city` / `Master.timezone`. |

**Итог:** timezone/city не меняются.

### 4. Другие эндпоинты

- `create_master_category`, `update_master_category`, `create_master_service`, `update_master_service`, `create_master_restriction`, `update_master_restriction`, `update_master_payment_settings` и т.д. — работают с другими сущностями/полями, **не** с `Master.city` / `Master.timezone`.

### 5. Loyalty: гейт по timezone

- **Файл:** `routers/loyalty.py`
- **Функция:** `_require_master_timezone(master_id, db)`. Вызывается в **`create_quick_discount`** и **`update_quick_discount`**.
- **Не вызывается** в: `create_complex_discount`, `update_complex_discount`, `create_personal_discount`, `update_personal_discount`.

**Итог:** Для complex/personal скидок проверки timezone нет.

---

## Выводы A2

1. **Дефолт timezone:** При регистрации мастер получает `timezone = 'Europe/Moscow'` из модели, без выбора пользователя.
2. **city:** Может оставаться `None` до первого обновления профиля с переданным `city`.
3. **Риски:**  
   - «Выбор» города/таймзоны не принудительный: мастер может ни разу не зайти в настройки и иметь дефолтный timezone.  
   - Loyalty-гейт по timezone есть только у quick-скидок; у complex/personal — нет.

---

## Рекомендации (для реализации B3–B7)

1. Убрать дефолт timezone в модели; после регистрации хранить `timezone=NULL` (миграция при необходимости).
2. Ввести явный признак завершения онбординга (например `timezone_confirmed` / `onboarding_completed`), по умолчанию `false`.
3. Считать онбординг завершённым только при заданных city + timezone и установленном флаге.
4. Распространить гейт «обязательный timezone/онбординг» на **все** операции создания/обновления loyalty-скидок (quick, complex, personal), возвращая 400/409 с текстом «Выберите город и часовой пояс».
5. Web/mobile: обязательный экран выбора города → timezone после регистрации; блокировка раздела Loyalty до завершения онбординга; баннер/редирект в настройки.

---

## Реализовано (следующий шаг)

- Миграция `20260128_tz_confirmed`: добавлено `masters.timezone_confirmed`, существующие мастера с city+timezone помечаются как подтвердившие.
- Модель `Master`: `timezone` без default; `timezone_confirmed` (bool, default False).
- Регистрация: мастер создаётся с `city=None`, `timezone=None`, `timezone_confirmed=False`.
- `update_master_profile`: при сохранении city+timezone выставляется `timezone_confirmed = (has_city && has_tz)`.
- Loyalty: `_require_master_onboarding_completed` во всех create/update (quick, complex, personal); иначе 400.
- Web/mobile: блокировка Loyalty по `timezone_confirmed`; баннер «Выберите город и часовой пояс…» + переход в настройки.
