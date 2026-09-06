# Архив аудита телефонии: разделы Zvonok

> Обновление 2026-09-06: неиспользуемый провайдер удалён. Ниже сохранены исторические сведения о Zvonok; они не являются текущим runbook. Актуальные purpose-bound contracts описаны в `Knowledge/identity-api.md`; runtime в этом cleanup не изменялся.

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
| **Утечка api_key** | В `auth.py` эндпоинт `zvonok/balance` возвращает `api_key` в ответе — недопустимо для prod. |

---

## 8. Ключевые файлы

| Назначение | Путь |
|------------|------|
| Zvonok сервис | `backend/services/zvonok_service.py` |
| Auth (Zvonok) | `backend/routers/auth.py` |
