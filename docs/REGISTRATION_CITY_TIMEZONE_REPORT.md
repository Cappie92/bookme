# Выбор города при регистрации мастера — отчёт

**Дата:** 2026-01-28

## Цели

1. После регистрации мастера `city` и `timezone` заполнены, `timezone_confirmed = true`.
2. Если город не выбран — регистрация мастера не проходит (валидация на фронте + 400 на бэке).
3. Онбординг считается завершённым сразу после регистрации при выборе города (Loyalty и мастерские разделы доступны).

## Изменённые файлы

### A) Web

| Файл | Изменения |
|------|-----------|
| `frontend/src/modals/AuthModal.jsx` | Импорт `cities`, `getTimezoneByCity` из `../utils/cities`. В `REGISTER_FIELDS.master` добавлено поле `{ name: 'city', label: 'Город', type: 'select', required: true }`. В `handleChange` при `name === 'city'` выставляется `timezone = getTimezoneByCity(value)`. В `validate` для `regType === 'master'` проверка «Выберите город». В `handleRegister` в payload для мастера добавляются `city` и `timezone`. В форме регистрации рендер `select` с `cities` для поля `city` (опция «Выберите город»). |

### B) Backend

| Файл | Изменения |
|------|-----------|
| `backend/schemas.py` | В `UserCreate` добавлены `city: Optional[str] = None` и `timezone: Optional[str] = None`. |
| `backend/routers/auth.py` | Перед созданием пользователя: при `role == MASTER` проверка, что `city` и `timezone` непустые (после `strip()`); иначе `HTTP 400` с текстом «Для регистрации мастера укажите город. Часовой пояс определяется автоматически.» При создании `Master` передаются `city`, `timezone`, `timezone_confirmed = bool(city and timezone)`. |

### C) Mobile

| Файл | Изменения |
|------|-----------|
| `mobile/src/data/cities.ts` | **Новый файл.** Список `cities` и `getTimezoneByCity`. В комментарии указано: источник — `frontend/src/utils/cities.js`, при изменениях синхронизировать. |
| `mobile/src/services/api/auth.ts` | В `RegisterCredentials` добавлены `city?: string`, `timezone?: string`. В `register` при `role === 'master'` и непустых `city`/`timezone` они добавляются в payload. |
| `mobile/app/login.tsx` | Состояние `city`, `timezone`, `showCityModal`. При `userRole === 'master'` блок «Город» (обязательный) и кнопка «Выберите город» → `Modal` с `FlatList` городов. При выборе города: `setCity`, `setTimezone = getTimezoneByCity(name)`, закрытие модалки. В `validateRegisterForm` для мастера проверка города. В `handleRegister` при мастере в payload передаются `city` и `timezone`. Кнопка «Зарегистрироваться» disabled при мастере без города. При переключении на «Клиент» сброс `city` и `timezone`. |

### D) Тесты

| Файл | Изменения |
|------|-----------|
| `backend/tests/test_auth.py` | Импорт `Master`, `User`. `test_register_user` и `test_register_duplicate_email` переведены на `POST /api/auth/register`. Добавлены `test_register_master_with_city_timezone_sets_confirmed` (регистрация мастера с `city`+`timezone` → в БД `Master` с `timezone_confirmed=True`, `city`/`timezone` сохранены) и `test_register_master_without_city_or_timezone_returns_400` (без `city`, только `city`, только `timezone` → 400). |

## Источник истины для городов

- **Web:** `frontend/src/utils/cities.js` (`cities`, `getTimezoneByCity`) — без изменений, переиспользуется.
- **Mobile:** `mobile/src/data/cities.ts` — копия с пометкой о синхронизации с `cities.js`. Отдельного shared-пакета не вводилось.
- **Backend:** Справочника городов нет. `timezone` всегда приходит с фронта.

## Smoke checklist

### Web

- [ ] Открыть модалку регистрации, перейти на «Регистрация», выбрать «Мастер».
- [ ] Поле «Город» отображается, есть «Выберите город» и список городов.
- [ ] Выбрать город → при сохранении в payload уходят `city` и `timezone` (проверить в Network).
- [ ] Не выбирать город → «Выберите город» в ошибках, кнопка «Зарегистрироваться» недоступна или форма не отправляется.
- [ ] Успешная регистрация мастера с городом → редирект/успех. `GET /api/master/settings` → `master.city`, `master.timezone`, `master.timezone_confirmed === true`.
- [ ] Раздел Loyalty и мастерские разделы доступны без дополнительного онбординга (нет блокировки по `timezone_confirmed`).

### Backend

- [ ] `POST /api/auth/register` с `role: "master"`, без `city` или без `timezone` → **400**, в `detail` сообщение про город.
- [ ] `POST /api/auth/register` с `role: "master"`, `city` и `timezone` непустые → **200**. В БД у `masters`: `city`, `timezone` и `timezone_confirmed = 1`.

### Mobile

- [ ] Экран входа → «Регистрация» → «Мастер». Появилось поле «Город» с «Выберите город».
- [ ] Тап по «Выберите город» → модалка со списком городов. Выбор города → модалка закрывается, выбранный город отображается.
- [ ] Регистрация мастера без города недоступна (ошибка валидации / кнопка неактивна).
- [ ] Успешная регистрация мастера с городом → переход в приложение. `GET /api/master/settings` → `timezone_confirmed === true`. Loyalty и мастерские разделы не блокируются.

### Общее

- [ ] `pytest backend/tests/test_auth.py::test_register_user backend/tests/test_auth.py::test_register_master_with_city_timezone_sets_confirmed backend/tests/test_auth.py::test_register_master_without_city_or_timezone_returns_400 backend/tests/test_master_profile_timezone.py -v` — все зелёные.

## Запуск тестов

```bash
cd backend
python3 -m pytest tests/test_auth.py::test_register_user \
  tests/test_auth.py::test_register_duplicate_email \
  tests/test_auth.py::test_register_master_with_city_timezone_sets_confirmed \
  tests/test_auth.py::test_register_master_without_city_or_timezone_returns_400 \
  tests/test_master_profile_timezone.py -v
```

## Patch / diff

Полный diff по перечисленным файлам:

```bash
git diff -- frontend/src/modals/AuthModal.jsx \
  backend/schemas.py backend/routers/auth.py backend/tests/test_auth.py \
  mobile/src/data/cities.ts mobile/src/services/api/auth.ts mobile/app/login.tsx
```

Сохранить в файл:

```bash
git diff -- frontend/src/modals/AuthModal.jsx \
  backend/schemas.py backend/routers/auth.py backend/tests/test_auth.py \
  mobile/src/data/cities.ts mobile/src/services/api/auth.ts mobile/app/login.tsx \
  > registration_city_timezone.patch
```

**Примечание:** В `backend/schemas.py` и `backend/routers/auth.py` в репозитории могут быть и другие правки. В patch попадут только изменения в указанных файлах; при необходимости отфильтровать только правки по регистрации/городу/таймзоне — делать это вручную.
