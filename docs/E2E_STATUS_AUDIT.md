# STATUS/AUDIT: пункты (3)-(6) и E2E готовность

## (3) Публичная страница мастера

### Что уже реализовано

| Компонент | Где | Описание |
|-----------|-----|----------|
| **Роут** | `frontend/App.jsx` | `/domain/:subdomain` → `SubdomainPage` |
| **API** | `backend/routers/domain.py` | `GET /api/domain/{subdomain}/info` — без авторизации |
| **Страница** | `frontend/src/pages/SubdomainPage.jsx` | Загрузка owner (master/indie_master/salon), YandexMap, MasterBookingModule, фон по background_color |
| **Данные** | Master/IndieMaster | `domain`, `bio`, `address`, `logo`, `website`, `background_color`, `site_description` |
| **Модули** | `MasterPageModule` | Кастомные блоки (module_type, config) |
| **Карта** | `YandexMap.jsx` | Компонент карты Яндекса |

### Чего не хватает

1. **URL:** Сейчас `/domain/{subdomain}`. Пользователь хотел `/m/{slug}` или `/master/{id}/page` — текущий вариант уже SEO-friendly и работает; альтернативный путь можно добавить как redirect.
2. **SEO:** Нет явного sitemap/robots; проверить, что страница не блокируется для индексации.
3. **Кастомизация:** `master_public_page_settings` или отдельная таблица — пока всё в полях Master; достаточно для MVP.
4. **Карта без ключа:** Заглушка при отсутствии YANDEX_MAPS_API_KEY — нужно проверить в `YandexMap.jsx`.
5. **robots.txt / sitemap:** Убедиться, что `/domain/*` не закрыт в robots.

### Где в коде

- Frontend: `frontend/src/pages/SubdomainPage.jsx`, `frontend/src/components/YandexMap.jsx`
- Backend: `backend/routers/domain.py`
- Модели: `backend/models.py` (Master, IndieMaster, MasterPageModule)

### Риски

- Низкие. Публичная страница уже есть и доступна без логина.

---

## (4) Robokassa (оплата подписки)

### Что уже реализовано

| Компонент | Где | Описание |
|-----------|-----|----------|
| **Init** | `backend/routers/payments.py` | `POST /api/payments/subscription/init` → payment_id, payment_url |
| **Callback** | `backend/routers/payments.py` | `POST /api/payments/robokassa/result` — проверка подписи, paid, apply подписки |
| **Config** | `backend/utils/robokassa.py` | `get_robokassa_config()`, `generate_payment_url()` |
| **UI** | `SubscriptionModal.jsx` | Вызов init, редирект на payment_url |
| **Success/Fail** | `PaymentSuccess.jsx`, `PaymentFailed.jsx` | Страницы после редиректа |
| **Test mode** | ENV | `ROBOKASSA_IS_TEST=true` |

### Чего не хватает

1. **ROBOKASSA_MODE=stub:** Эмулятор для локального теста без Result URL и туннеля.
2. **Dev-туннель/симулятор:** Возможность дергать `/api/payments/robokassa/result` вручную с тестовыми данными при stub.
3. **Логи без секретов:** Убедиться, что merchant_login, пароли не попадают в логи.
4. **E2E в stub:** Сценарий «оплатил → подписка активна → фичи обновились».

### Где в коде

- `backend/routers/payments.py`
- `backend/utils/robokassa.py`
- `frontend/src/components/SubscriptionModal.jsx`
- `frontend/src/pages/PaymentSuccess.jsx`, `PaymentFailed.jsx`

### Риски

- Средние: без stub сложно тестировать локально; Result URL должен быть доступен снаружи.

---

## (5) Zvonok (верификация + восстановление пароля)

### Что уже реализовано

| Компонент | Где | Описание |
|-----------|-----|----------|
| **Верификация** | `auth.py` | `request-phone-verification` → call_id; `verify-phone` → is_phone_verified |
| **Forgot password** | `auth.py` | `forgot-password` (phone) → звонок, call_id; (email) → письмо |
| **Reset password** | `auth.py` | `reset-password` — по token (только email flow) |
| **Zvonok service** | `services/zvonok_service.py` | send_verification_call, verify_phone_digits |

### Чего не хватает

1. **Утечка api_key:** `GET /api/auth/zvonok/balance` возвращает `api_key` в JSON — критично, нужно убрать или закрыть endpoint.
2. **Flow по телефону:** `forgot-password` (phone) → call_id; `verify-phone` проверяет звонок; но `reset-password` ожидает token из email. Для телефона нужен шаг: после verify-phone — выдать временный token или отдельный `reset-password-by-phone` (phone + new_password после успешной верификации).
3. **ZVONOK_MODE=stub:** Режим без реальных звонков: фиксированный call_id и digits для верификации.

### Где в коде

- `backend/routers/auth.py` (стр. 788–805: zvonok/balance)
- `backend/services/zvonok_service.py`
- `frontend/src/modals/AuthModal.jsx`

### Риски

- Высокие: утечка api_key; неполный flow восстановления по телефону.

---

## (6) Кабинет клиента

### Что уже реализовано

| Компонент | Где | Описание |
|-----------|-----|----------|
| **Dashboard** | `ClientDashboard.jsx` | Будущие/прошлые записи, избранное, статистика |
| **Роуты** | App.jsx | `/client`, `/client/dashboard`, `/client/profile`, `/client/favorite`, `/client/master-notes` |
| **API** | `client.py`, `bookings.py` | Записи клиента, отмена, повторная запись |
| **Профиль** | `ClientProfile.jsx` | Редактирование данных |
| **Избранное** | `ClientFavorite.jsx` | Список избранных мастеров |

### MVP сценарии — статус

| Сценарий | Реализовано | Где |
|----------|-------------|-----|
| Регистрация/вход | Да | AuthModal, /api/auth/login, register |
| Просмотр мастеров/страницы | Да | SubdomainPage, /domain/:subdomain |
| Создание записи | Да | MasterBookingModule, SalonBookingModule |
| Мои записи | Да | ClientDashboard, future/past bookings |
| Отмена | Да | cancel-booking, ClientDashboard |
| Повторная запись | Да | RepeatBookingModal |

### Чего не хватает

1. Проверка guards/валидации на всех эндпоинтах клиента.
2. E2E тесты для сценариев 1–6.

### Где в коде

- `frontend/src/pages/ClientDashboard.jsx`, `ClientProfile.jsx`, `ClientFavorite.jsx`
- `backend/routers/client.py`, `bookings.py`

### Риски

- Низкие. Основные сценарии реализованы.

---

## Сводная таблица

| Пункт | Реализовано | Не хватает | Приоритет |
|-------|-------------|------------|-----------|
| (3) Публичная страница | 90% | SEO, stub карты | Низкий |
| (4) Robokassa | 85% | Stub режим, e2e | Высокий |
| (5) Zvonok | 70% | Убрать api_key, flow по телефону, stub | Высокий |
| (6) Кабинет клиента | 95% | E2E тесты | Средний |
