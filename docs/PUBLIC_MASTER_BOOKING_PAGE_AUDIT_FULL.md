# Public Master Booking Page — Полный AUDIT

## A) AUDIT ANSWERS

### 1) Источник slug

| Вопрос | Ответ |
|--------|-------|
| **Где хранится** | `masters.domain` — `backend/models.py:170` — `Column(String, unique=True, nullable=True)` |
| **Тип** | String, unique, nullable |
| **Генерация** | `backend/utils/base62.py` — `generate_unique_domain(master_id, db)` при регистрации (`auth.py:122`) и при `can_work_independently` (`master.py:1153`) |
| **Кастомизация** | `MasterSettings.jsx:310-311` — поле domain. Проверка: `can_customize_domain` из subscription features (`master.py:957`) |
| **Где показывается в ЛК** | `MasterSettings.jsx:352-977` — URL `{origin}/domain/{domain}` |
| **Эндпоинт смены** | PUT /api/master/profile (multipart) — domain в formData |
| **Редиректы/история** | Нет |

**Slug = masters.domain** (один источник правды). URL `/m/{slug}` и `/domain/{subdomain}` — оба используют одно поле.

---

### 2) Слоты/расписание

| Вопрос | Ответ |
|--------|-------|
| **Public endpoint** | `GET /api/public/masters/{slug}/availability` — `backend/routers/public_master.py:136` |
| **Параметры** | `from_date`, `to_date` (YYYY-MM-DD), `service_id` |
| **Сервис** | `services/scheduling.py:get_available_slots()` — единый источник |
| **Единицы времени** | Naive datetime (UTC по конвенции). `MasterSchedule.date` (Date), `start_time`/`end_time` (Time) |
| **Timezone мастера** | `_ensure_master_timezone()` в public_master — блокирует при отсутствии. В get_available_slots — naive |
| **Guard timezone** | `client.py:619`, `bookings.py:337`, `public_master.py:76-82` (_ensure_master_timezone) |

---

### 3) Лояльность/баллы/ограничения

| Сущность | Где | Эндпоинты |
|----------|-----|-----------|
| **Баллы** | `loyalty_transactions`, `utils/loyalty.py` | `GET /api/client/loyalty/points`, `GET /api/public/masters/{slug}/eligibility` |
| **Стоп-лист** | `ClientRestrictionRule`, `check_client_restrictions()` | Возвращается в eligibility, create_booking (403) |
| **Предоплата** | `MasterPaymentSettings.requires_advance_payment` | `GET /api/public/masters/{slug}` — `requires_advance_payment`, `GET /api/public/masters/{slug}/eligibility` |
| **booking_blocked** | `check_client_restrictions().is_blocked` | `GET /api/public/masters/{slug}/eligibility` |

---

### 4) Заметка клиента мастеру

| Вопрос | Ответ |
|--------|-------|
| **Модель** | `ClientNote` — `backend/models.py:1590` — `client_notes` |
| **Поля** | `client_phone`, `note_type`, `target_id`, `master_note` |
| **Привязка** | `note_type='master'`, `target_id=master_id`, `client_phone=current_user.phone` |
| **API** | `GET /api/public/masters/{slug}/client-note` — `public_master.py:299` |
| **Без токена** | 200 `{"note_text": null}` (без утечки факта) |
| **С токеном** | 200 `{"note_text": "..."}` или null |

---

### 5) Web routing / SEO

| Вопрос | Ответ |
|--------|-------|
| **Route /domain/:subdomain** | Есть — `App.jsx:92` → SubdomainPage |
| **Route /m/:slug** | **НЕТ** — MasterPublicBookingPage существует, но route не добавлен |
| **Деплой** | SPA (Vite), Nginx fallback на index.html |
| **SSR/пререндер** | Нет |
| **SEO** | MasterPublicBookingPage использует react-helmet-async (title, description, og, canonical) |
| **Sitemap** | `frontend/public/robots.txt` — нужно проверить /m/ |

---

## B) Существующий код (уже реализовано)

| Компонент | Статус |
|-----------|--------|
| `backend/routers/public_master.py` | Полностью реализован |
| `GET /api/public/masters/{slug}` | ✅ |
| `GET /api/public/masters/{slug}/availability` | ✅ |
| `POST /api/public/masters/{slug}/bookings` | ✅ (требует auth) |
| `GET /api/public/masters/{slug}/client-note` | ✅ |
| `GET /api/public/masters/{slug}/eligibility` | ✅ |
| `frontend/src/pages/MasterPublicBookingPage.jsx` | ✅ (но не передаёт slug в MasterBookingModule) |
| `MasterBookingModule` slug mode | Частично — loadSlots поддерживает slug, createBooking — НЕТ |

---

## C) Gaps (что нужно доделать)

1. ~~**App.jsx** — добавить route `/m/:slug`~~ ✅ Сделано
2. ~~**MasterPublicBookingPage** — передать `slug={slug}` и `publicProfile={profile}`~~ ✅ Сделано
3. ~~**MasterBookingModule** — в createBooking при slug использовать POST /api/public/masters/{slug}/bookings~~ ✅ Сделано
4. ~~**Auth flow** — при отсутствии currentUser открывать AuthModal~~ ✅ Сделано (draft в localStorage — опционально)
5. ~~**Mobile** — deep-link обработка dedato.ru/m/<slug>~~ ✅ Сделано:
   - `mobile/app/m/[slug].tsx` — WebView с веб-страницей
   - `_layout.tsx` — маршрут `/m` доступен без авторизации
   - Smart banner на веб-странице: «Открыть в приложении» / «Продолжить»
   - Схема `dedato://m/{slug}` (app.json)
6. **Public booking** — сейчас требует auth. Draft в localStorage — опционально.
7. **Неавторизованный create** — auth-only, фронт показывает AuthModal при подтверждении.
