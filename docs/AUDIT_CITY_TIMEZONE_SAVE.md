# Read-only аудит: сохранение «Город» вместе с timezone (web + backend)

**Задача:** проверить, что у мастера «Город» сохраняется вместе с timezone (и/или timezone_confirmed) и где именно это реализовано.  
**Код не менялся.**

---

## 1) Frontend: экран/форма «Редактирование профиля»

### Файлы

| Компонент | Файл | Роль |
|-----------|------|------|
| Форма «Редактирование профиля» | `frontend/src/components/MasterSettings.jsx` | Основная форма с выпадающим «Выберите город», сохранение профиля |
| Список городов + маппинг city→timezone | `frontend/src/utils/cities.js` | Константа `cities`, `getTimezoneByCity` |

Форма открывается по табу «Настройки» в `MasterDashboard` (`frontend/src/pages/MasterDashboard.jsx`), рендер `<MasterSettings onSettingsUpdate={...} />`.

### Откуда берётся список городов

- **Источник:** константа в коде, не API.
- **Файл:** `frontend/src/utils/cities.js`
- **Экспорт:** `cities` — массив `{ name, timezone }`, например:
  ```js
  { name: 'Москва', timezone: 'Europe/Moscow' },
  { name: 'Санкт-Петербург', timezone: 'Europe/Moscow' },
  { name: 'Екатеринбург', timezone: 'Asia/Yekaterinburg' },
  // ... ~100 городов
  ```
- **Использование:** `MasterSettings.jsx` импортирует `cities` и `getTimezoneByCity`. В форме рисуется `<select name="city">` с `<option value="">Выберите город</option>` и `{cities.map(...)}`.

### Какие поля отправляются при сохранении

В состоянии формы (`form`) есть в том числе:

- `city` — из выбора в `<select>`
- `timezone` — **не отдельный инпут**, хранится в `form`, задаётся автоматически при смене города

При сохранении в `handleSave` в `FormData` попадают **все ключи `form`**, кроме `domain` и полей с `undefined` или `''`. То есть при выбранном городе уходят и `city`, и `timezone` (и остальные поля формы: full_name, phone, email, bio, address, can_work_*, auto_confirm_bookings, payment_*, и т.д.).

**Итог:** при сохранении профиля отправляются **и city, и timezone** (оба в payload).

### Эндпоинт и пример payload

- **Метод/URL:** `PUT /api/master/profile`
- **Вызов:** `apiFetch('/api/master/profile', { method: 'PUT', body: formData })`
- **Тип тела:** `FormData` (multipart/form-data), не JSON.

**Пример полей формы (в т.ч. город/таймзона):**

```
full_name=Иван Иванов
phone=+79001234567
email=ivan@example.com
city=Москва
timezone=Europe/Moscow
address=...
can_work_independently=true
can_work_in_salon=false
auto_confirm_bookings=false
payment_on_visit=true
payment_advance=false
use_photo_as_logo=false
... (+ опционально photo, logo)
```

Отправка только при непустых значениях: ключи с `form[key] === ''` не добавляются. При выборе города `timezone` выставляется через `getTimezoneByCity(city)`, поэтому оба поля непустые и оба уходят.

---

## 2) Backend: хранение, эндпоинт, связка city→timezone, timezone_confirmed

### Где хранятся city / timezone

- **Модель:** `backend/models.py`, класс `Master`
- **Поля:**
  - `city = Column(String, nullable=True)`
  - `timezone = Column(String, nullable=True)` — без default
  - `timezone_confirmed = Column(Boolean, default=False, nullable=False)`

### Какой эндпоинт принимает обновление

- **Эндпоинт:** `PUT /api/master/profile`
- **Файл:** `backend/routers/master.py`
- **Функция:** `update_master_profile`. Параметры через `Form(...)` (multipart/form-data), в т.ч. `city: Optional[str] = Form(None)`, `timezone: Optional[str] = Form(None)`.

### Как сохраняется: меняется ли timezone при смене city на backend?

- **Нет.** На backend **нет** маппинга city→timezone и **нет** автоматической подстановки timezone при изменении city.
- Логика:
  ```python
  if city is not None:
      master.city = city
  if timezone is not None:
      master.timezone = str(timezone).strip()
  ```
- `city` и `timezone` обновляются **только** из переданных полей формы. Если в запросе пришёл только `city` без `timezone`, backend поменяет только `city`; `timezone` со стороны backend не трогается.

Итог: **связка «город → таймзона» делается на frontend** (при выборе города подставляется timezone и оба уходят в PUT). На backend связки нет.

### Связка city→timezone на backend

- **Нет.** Справочника городов, маппинга city→timezone или общего источника истины для городов на backend нет. Всё на frontend в `cities.js`.

### Где считается / ставится timezone_confirmed

- **Файл:** `backend/routers/master.py`, `update_master_profile`
- **После** применения `city` / `timezone`:
  ```python
  has_city = bool((getattr(master, "city", None) or "").strip())
  has_tz = bool((getattr(master, "timezone", None) or "").strip())
  master.timezone_confirmed = has_city and has_tz
  ```
- То есть `timezone_confirmed = True` **только если** заполнены и city, и timezone. При очистке любого из них флаг сбрасывается в `False`.

---

## 3) Контракт API

### GET /api/master/settings

- **Файл:** `backend/routers/master.py`, `get_master_settings`
- **Фрагмент ответа (master):**
  ```python
  "master": {
      "id", "bio", "experience_years", "can_work_independently", "can_work_in_salon",
      "auto_confirm_bookings", "website", "domain", "logo", "photo", "use_photo_as_logo",
      "address", "background_color", "city", "timezone",
      "timezone_confirmed": bool(getattr(master, "timezone_confirmed", False)),
      "site_description",
  }
  ```
- **Возвращаются:** `city`, `timezone`, `timezone_confirmed`.

### PUT /api/master/profile

- **Принимает:** Form (multipart). Среди прочего: `city`, `timezone` — оба опциональные (`Form(None)`).
- **Обязательность:**
  - **timezone:** косвенно обязателен. Вызывается `_validate_master_timezone_update(timezone, master)`:
    - если в запросе передан непустой `timezone` — он допускается;
    - если `timezone` не передан (None) — смотрится текущий `master.timezone`; если у мастера его нет или пусто → **400** с текстом про «Укажите часовой пояс…».
  - **city:** явной валидации «обязателен» в update нет, но от него зависит `timezone_confirmed` (должны быть оба).

---

## 4) Сводная таблица

| Слой | Файл | Что делает | Важные поля |
|------|------|------------|-------------|
| Frontend | `MasterSettings.jsx` | Форма «Редактирование профиля», селект «Выберите город», сохранение | `form.city`, `form.timezone`; при `city` change → `timezone = getTimezoneByCity(city)` |
| Frontend | `cities.js` | Список городов и city→timezone | `cities` — массив `{name, timezone}`; `getTimezoneByCity` |
| Frontend | `MasterSettings.jsx` | `handleSave` | FormData: все поля `form`, в т.ч. `city`, `timezone`; `domain` и пустые пропускаются |
| Frontend | `api.js` | `apiFetch` | PUT, body = FormData; для FormData не задаётся Content-Type |
| Backend | `routers/master.py` | `update_master_profile` | Принимает `city`, `timezone` Form(None); пишет в `master`; считает `timezone_confirmed` |
| Backend | `routers/master.py` | `_validate_master_timezone_update` | Требует непустой timezone (в запросе или у мастера), иначе 400 |
| Backend | `routers/master.py` | `get_master_settings` | GET /api/master/settings → `master.city`, `master.timezone`, `master.timezone_confirmed` |
| Backend | `models.py` | `Master` | `city`, `timezone` nullable; `timezone_confirmed` bool, default False |

---

## 5) Примеры payload / response (кратко)

**GET /api/master/settings** (фрагмент):

```json
{
  "user": { "id", "email", "phone", "full_name", "birth_date" },
  "master": {
    "city": "Москва",
    "timezone": "Europe/Moscow",
    "timezone_confirmed": true,
    ...
  }
}
```

**PUT /api/master/profile** (пример полей FormData при сохранении профиля с городом):

```
city=Москва
timezone=Europe/Moscow
full_name=...
phone=...
...
```

---

## 6) Выводы A / B / C

- **A) «Выбор города автоматически задаёт timezone»**  
  **ДА.** Реализовано **на frontend**: при `onChange` поля `city` в `handleChange` выполняется `newForm.timezone = getTimezoneByCity(value)` (`MasterSettings.jsx` ~161–164). На backend автоматической подстановки нет.

- **B) «timezone сохраняется вместе с city одним действием»**  
  **ДА.** Оба поля входят в общий `form`, при «Сохранить» оба добавляются в FormData и уходят одним `PUT /api/master/profile`. С точки зрения пользователя это одно действие (сохранение профиля); с точки зрения API — один запрос с обоими полями.

- **C) «Список городов является единым источником истины и содержит timezone»**  
  **ДА.** Список городов — константа `cities` в `frontend/src/utils/cities.js`. У каждого города есть `timezone`. Маппинг city→timezone используется через `getTimezoneByCity`. На backend отдельного справочника городов/таймзон нет; для веба единственный источник — `cities.js`.
