# Аудит: Plusofon (и Zvonok) — верификация звонком и восстановление пароля

## 1. Важное уточнение

**Plusofon** и **Zvonok** используются в разных потоках:

| Сервис | Где используется | Назначение |
|--------|------------------|------------|
| **Zvonok** | `backend/routers/auth.py` | Регистрация, верификация телефона, восстановление пароля по звонку |
| **Plusofon** | `backend/routers/bookings.py` | Верификация телефона **клиента** при создании бронирования (новый клиент) |

То есть **восстановление пароля и верификация при регистрации** реализованы через **Zvonok**, а не Plusofon. Plusofon задействован только в сценарии «клиент бронирует услугу впервые и должен подтвердить номер».

---

## 2. Plusofon: что реализовано

### Сервис

- **Файл:** `backend/services/plusofon_service.py`
- **API:** `https://restapi.plusofon.ru`
- **ENV:** `PLUSOFON_USER_ID`, `PLUSOFON_ACCESS_TOKEN` (есть дефолты в коде — риск для prod)

### Методы

| Метод | Описание |
|-------|----------|
| `initiate_call(phone, code)` | FlashCall: звонок с произношением кода |
| `check_call_status(call_id)` | Проверка статуса звонка |
| `initiate_reverse_flashcall(phone, code)` | Обратный FlashCall (клиент звонит) |
| `check_reverse_flashcall_status(call_id)` | Статус обратного звонка |
| `get_balance()` | Информация об аккаунте |

### Точка использования

**Файл:** `backend/routers/bookings.py` (~495–506)

- При создании бронирования, если клиент новый и `needs_phone_verification`:
  - Генерируется `verification_code`
  - Сохраняется в `User.phone_verification_code`, `User.phone_verification_expires` (5 минут)
  - Вызывается `plusofon_service.initiate_call(client_phone, verification_code)`

Проверка кода — отдельный flow (в bookings или auth), по коду не видно отдельного эндпоинта для проверки звонка Plusofon в рамках бронирования.

### Эндпоинты Plusofon

Отдельных эндпоинтов типа `/api/auth/plusofon/*` в коде нет. В `backend/test_phone_verification_scenarios.py` упоминается `auth/plusofon/balance` — такого маршрута в `auth.py` не найдено.

---

## 3. Zvonok: верификация и восстановление пароля

### Сервис

- **Файл:** `backend/services/zvonok_service.py`
- **API:** `https://zvonok.com/manager/cabapi_external/api/v1`

### Эндпоинты Auth (Zvonok)

| Эндпоинт | Назначение |
|----------|------------|
| `POST /api/auth/request-phone-verification` | Старт верификации: FlashCall, возврат call_id |
| `POST /api/auth/verify-phone` | Проверка кода/факта звонка (call_id, phone_digits) |
| `POST /api/auth/forgot-password` | Восстановление пароля: по телефону — звонок, по email — письмо |
| `POST /api/auth/request-reverse-phone-verification` | Обратный FlashCall |
| `POST /api/auth/check-reverse-phone-verification` | Проверка обратного звонка |
| `GET /api/auth/zvonok/balance` | Информация об аккаунте Zvonok |

### Хранение сессии верификации

- **Таблица/модель:** используется `User`
- **Поля:** `phone_verification_code`, `phone_verification_expires` (datetime)
- **TTL:** 5 минут (`timedelta(minutes=5)`), 10 минут для `password_reset_expires`

### Ограничения

- Явных rate limit или ограничения попыток в коде нет.
- TTL есть для `phone_verification_expires` и `password_reset_expires`.

---

## 4. Ответы на вопросы

| Вопрос | Ответ |
|--------|-------|
| Есть ли flow «зарегистрировался → подтвердил номер звонком»? | **Частично.** Регистрация создаёт пользователя и отправляет email. Верификация телефона — отдельно через `request-phone-verification` + `verify-phone` (Zvonok). |
| Есть ли flow «забыл пароль → звонок → смена пароля»? | **Да, через Zvonok.** `forgot-password` с телефоном → звонок → нужен отдельный шаг проверки кода и сброса пароля (в коде `forgot-password` возвращает `call_id`, но flow «check code → reset password» нужно проверить в auth). |
| Есть ли dev stub/mock? | **Нет.** Нет явного mock/stub для тестов без реального звонка. |

---

## 5. Как тестировать Plusofon

### ENV

```env
PLUSOFON_USER_ID=<ваш id>
PLUSOFON_ACCESS_TOKEN=<токен>
```

### Сценарий

1. Создать бронирование от нового клиента (без `is_phone_verified`).
2. Backend вызовет `plusofon_service.initiate_call(phone, code)`.
3. На телефон должен прийти звонок с озвучиванием кода.
4. Проверить, что `User.phone_verification_code` и `phone_verification_expires` сохранены.

### Ограничения

- Нужен реальный номер для звонка.
- Whitelist IP, callback URL и т.п. — смотреть в документации Plusofon.

---

## 6. Как тестировать Zvonok (верификация и сброс пароля)

### ENV

- Конфиг Zvonok задаётся в `zvonok_service.py` (api_key, campaign_id и т.д.).

### Сценарий верификации

1. `POST /api/auth/request-phone-verification` с `{ "phone": "+79..." }`
2. Получить `call_id`
3. Ответить на звонок, ввести последние 4 цифры номера
4. `POST /api/auth/verify-phone` с `call_id`, `phone_digits`
5. Проверить, что `User.is_phone_verified = True`

### Сценарий восстановления пароля

1. `POST /api/auth/forgot-password` с `{ "phone": "+79..." }`
2. Получить `call_id`
3. Пройти верификацию (аналогично п. 3–4)
4. Вызвать эндпоинт сброса пароля с кодом (уточнить по коду auth — `reset-password` или аналог).

---

## 7. Риски безопасности

| Риск | Оценка |
|------|--------|
| **Перебор кодов** | Средний. Нет rate limit на запросы верификации. TTL 5–10 мин ограничивает окно, но не число попыток. |
| **Повторное использование кода** | Снижен. После успешной проверки код очищается (`phone_verification_code = None`). |
| **Отсутствие TTL** | TTL есть (5/10 минут). |
| **Жёстко заданные секреты** | В `plusofon_service.py` есть дефолты для `PLUSOFON_USER_ID` и `PLUSOFON_ACCESS_TOKEN`. В prod нужно использовать только ENV. |
| **Утечка api_key** | В `auth.py` эндпоинт `zvonok/balance` возвращает `api_key` в ответе — недопустимо для prod. |

---

## 8. Ключевые файлы

| Назначение | Путь |
|------------|------|
| Plusofon сервис | `backend/services/plusofon_service.py` |
| Zvonok сервис | `backend/services/zvonok_service.py` |
| Auth (Zvonok) | `backend/routers/auth.py` |
| Bookings (Plusofon) | `backend/routers/bookings.py` |
| Документация Plusofon | `backend/PLUSOFON_SETUP.md` |
