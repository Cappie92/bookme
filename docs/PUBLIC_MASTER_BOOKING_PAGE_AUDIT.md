# Public Master Booking Page — AUDIT

## A) AUDIT ANSWERS

### 1) Источник slug

| Вопрос | Ответ |
|--------|-------|
| **Где хранится slug** | `masters.domain` — `backend/models.py:170` — `Column(String, unique=True, nullable=True)` |
| **Формат** | При регистрации: `generate_unique_domain()` → `m-{base62_8chars}` (например `m-djfiwef8`) |
| **Генерация** | `backend/utils/base62.py` — `generate_unique_domain(master_id, db)` |
| **Кастомизация** | В MasterSettings (`frontend/src/components/MasterSettings.jsx`) — поле domain. Проверка подписки: `can_customize_domain` из subscription features |
| **Где показывается** | `MasterSettings.jsx:352-977` — URL вида `{origin}/domain/{domain}` |
| **Эндпоинт смены** | PUT /api/master/profile (multipart) — domain в formData. Валидация в `routers/master.py` |
| **Редиректы/история** | Нет |

**Важно:** Текущий URL — `/domain/{domain}`. Пользователь хочет `/m/{slug}`. `domain` = slug (один источник правды).

---

### 2) Слоты/расписание

| Вопрос | Ответ |
|--------|-------|
| **Публичный endpoint слотов** | `GET /api/bookings/available-slots-repeat` — `backend/routers/bookings.py:756` |
| **Параметры** | `owner_type`, `owner_id`, `year`, `month`, `day`, `service_duration`, `branch_id?` |
| **Сервис** | `services/scheduling.py:get_available_slots()` |
| **Единицы времени** | Naive datetime (UTC по конвенции). `MasterSchedule.date` (Date), `start_time`/`end_time` (Time) |
| **Timezone мастера** | Применяется на read-path в `client.py` при отображении. В `get_available_slots` — naive, без TZ |
| **Guard timezone** | Есть в `create_booking` (client.py:619) и `create_booking_public` (bookings.py:337) |

---

### 3) Лояльность/баллы/ограничения

| Сущность | Где | Эндпоинты |
|----------|-----|-----------|
| **Баллы** | `loyalty_transactions`, `utils/loyalty.py` | `GET /api/client/loyalty/points`, `GET /api/client/loyalty/points/{master_id}` |
| **Стоп-лист** | `ClientRestrictionRule`, `check_client_restrictions()` | Логика в `utils/client_restrictions.py` |
| **Предоплата** | `MasterPaymentSettings.requires_advance_payment`, `check_client_restrictions()` | `GET /api/master/payment-settings` |
| **Результат проверки** | `is_blocked`, `requires_advance_payment` | Возвращается при создании брони (400) или через отдельный вызов |

---

### 4) Заметка клиента мастеру

| Вопрос | Ответ |
|--------|-------|
| **Модель** | `ClientNote` — `backend/models.py:1590` — `client_phone`, `note_type`, `target_id`, `master_note` |
| **Привязка** | `note_type='master'`, `target_id=master_id`, `client_phone=current_user.phone` |
| **API чтения** | `GET /api/client/bookings/notes/master/{target_id}` — `backend/routers/client.py:2491` |
| **Альтернатива** | `MasterClientMetadata` — заметка мастера О клиенте (обратное направление) |
| **ClientMasterNote** | client_id + master_id + salon_id — для салонного контекста, salon_id обязателен |

Для master-only: **ClientNote** с `note_type='master'`, `target_id=master_id`.

---

### 5) Web routing / SEO

| Вопрос | Ответ |
|--------|-------|
| **Текущий route** | `/domain/:subdomain` — `frontend/src/App.jsx:92` |
| **Route /m/:slug** | Нет. Нужно добавить |
| **Деплой** | SPA (Vite), Nginx fallback на index.html |
| **SSR/пререндер** | Нет |
| **SEO MVP** | `react-helmet-async` для title/description/og. Canonical через функцию с учётом будущего subdomain |
| **Sitemap** | `frontend/public/robots.txt` — Allow: /domain/. Добавить /m/ |

---

## B) Сводка по API

| Существующее | Новое (MVP) |
|--------------|-------------|
| GET /api/domain/{subdomain}/info | GET /api/public/masters/{slug} (alias, master-only) |
| GET /api/domain/{subdomain}/services | Включить в public profile |
| GET /api/bookings/available-slots-repeat | GET /api/public/masters/{slug}/availability |
| POST /api/bookings/public | POST /api/public/masters/{slug}/bookings |
| — | GET /api/public/masters/{slug}/client-note |

---

## C) План изменений (минимальный)

1. **Backend:** Роутер `routers/public_master.py` с prefix `/api/public/masters`
2. **Frontend:** Страница `/m/:slug` → `MasterPublicBookingPage`, route в App.jsx
3. **Mobile:** Обработка ссылок `dedato.ru/m/<slug>` → экран записи
4. **Документация:** README, curl-примеры
