# Контекст для переноса в новый чат

## 1) TL;DR

- **Проект:** DeDato — система бронирования для салонов красоты и мастеров. Backend (FastAPI + SQLite), mobile (Expo Router + React Native), web (Vite + React).
- **Последнее:** Route groups (master)/(client)/(public) в Expo Router — железобетонное разделение: client никогда не монтирует master-компоненты и не дергает /api/master/*. AuthGate в корне, редирект по роли в useEffect.
- **Закрыто:** 404 /api/master/settings при логине/старте клиента; шумные логи (logger + DEBUG_*); редирект в render (React error).
- **Следующий шаг:** Проверить route groups в dev (cold start client, login client/master), доработать public booking UX (выбор услуги/даты/слота, календарь).

---

## 2) Архитектура и запуск

**Стек:**
- Backend: FastAPI, SQLAlchemy, SQLite (bookme.db)
- Mobile: Expo SDK 54, Expo Router 6, React Native
- Web: Vite, React (frontend/)

**Запуск:**
```bash
# Backend
cd backend && python3 -m uvicorn main:app --host 127.0.0.1 --port 8000

# Mobile
cd mobile && npx expo start
```

**Env:**
- `backend/.env`: JWT_SECRET_KEY, DATABASE_URL, LEGACY_INDIE_MODE (0=master-only), MASTER_CANON_DEBUG
- `mobile/.env`: API_URL, WEB_URL, DEBUG_HTTP, DEBUG_AUTH, DEBUG_FEATURES, DEBUG_MENU, DEBUG_DASHBOARD, DEBUG_LOGS

**Тестовые аккаунты после reseed:**
- Мастера: +79990000000 .. +79990000007, пароль `test123`
- Клиенты: +79990000100, +79990000101, +79990000102, пароль `test123`
- Админ: +79031078685, пароль `test123` (через reset_admin_password_dev.py)

---

## 3) Важные решения/инварианты

- **master-only vs legacy:** `LEGACY_INDIE_MODE=0` (default) — master-only. Bookings только master_id, indie_master_id не используется. `LEGACY_INDIE_MODE=1` — legacy indie.
- **master_timezone:** Без fallback. Если пусто — 400 / skip. `timezone_confirmed=True` после явного выбора city+timezone. `_ensure_master_timezone(master)` raise 400 при пустом.
- **Ограничения клиентов (restrictions):** master-only по master_id. Legacy: indie_master_id. `check_client_restrictions` в public_master.
- **Публичная страница:** slug = masters.domain, роут `/m/[slug]`, без авторизации. API: `/api/public/masters/{slug}`.

---

## 4) Что изменили за последние итерации

### 4.1 Backend
- master_timezone: обязателен для public booking, `_ensure_master_timezone(master)` raise 400
- favorites: master_domain, indie_master favorites → 410 в master-only
- restrictions: master_id, client_restrictions
- verify_master_canon.py: DB + API invariants
- test_calendar_ics.py: master_timezone skip/raise
- test_master_restrictions_api.py, test_loyalty_discounts.py

### 4.2 Mobile
- Убрали заглушку «Переход на страницу мастера», навигация на `/m/<slug>`
- Public booking wizard: ServicePicker (категории accordion) → DatePicker → TimeSlotsPicker → CTA
- Кнопка «Изменить пароль» в #4CAF50
- Логи: logger + DEBUG_* флаги (DEBUG_AUTH, DEBUG_FEATURES, DEBUG_MENU, DEBUG_DASHBOARD, DEBUG_HTTP, DEBUG_LOGS)
- Клиент логин вызывал /api/master/settings: причина — MasterHamburgerMenu/useMasterFeatures монтировались в общем layout. Фикс: route groups.
- Route groups: (master)/(client)/(public) — master-компоненты только в (master), client — ClientBottomNav без useMasterMenu
- Interceptor guard: при role=client и URL /api/master/* — throw в __DEV__ (api/client.ts)

---

## 5) Текущая структура роутинга (Expo Router)

**Route groups:**
| Группа | Пути | Содержимое _layout |
|--------|------|-------------------|
| `(master)` | `/`, `/master/*`, `/subscriptions`, `/bookings` | MasterMenuProvider, MasterHamburgerMenu, BottomNavigationCarousel, Stack |
| `(client)` | `/client/*`, `/settings`, `/notes`, `/bookings/[id]` | ClientBottomNav, Stack (без master-импортов) |
| `(public)` | `/m/[slug]` | Stack (без auth) |

**AuthGate (app/_layout.tsx):**
- Пока `isLoading` — Splash
- В `useEffect`: `!isAuthenticated` → `router.replace('/login')`; `isAuthenticated` + client → `router.replace('/client/dashboard')`; master → `router.replace('/')`; draft → `router.replace('/m/[slug]')`
- **ВАЖНО:** `router.replace` только в useEffect, не в render

---

## 6) Команды проверки (copy-paste)

**Примечание:** `test_master_restrictions_api.py`, `test_loyalty_discounts.py`, `test_calendar_ics.py` есть в репозитории. Если какие-то тесты не проходят, см. `docs/MASTER_ONLY_MVP_CHECKLIST.md` — там минимальный набор: `test_master_canon_flags`, `test_booking_factory`, `test_calendar_ics`.

```bash
# Reseed
python3 backend/scripts/reseed_local_test_data.py --base-url http://localhost:8000

# Login + TOKEN
TOKEN=$(curl -s -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"phone":"+79990000101","password":"test123"}' | python3 -c "import sys,json; print(json.load(sys.stdin).get('access_token',''))")

# Verify master canon
cd backend && TOKEN=$TOKEN python3 scripts/verify_master_canon.py

# Pytest — минимальный набор (MASTER_ONLY_MVP_CHECKLIST)
cd backend && python3 -m pytest tests/test_master_canon_flags.py tests/test_booking_factory.py tests/test_calendar_ics.py -v

# Pytest — полный набор (master-only + calendar_ics + restrictions + loyalty)
cd backend && python3 -m pytest tests/test_master_canon_flags.py tests/test_booking_factory.py tests/test_calendar_ics.py tests/test_master_restrictions_api.py tests/test_loyalty_discounts.py -v

# Make (из корня)
make verify-master-canon
make test-master-canon   # только canon + booking_factory; calendar_ics — добавить вручную

# Curl public master + availability (slug = masters.domain из GET /api/master/settings)
curl -s "http://localhost:8000/api/public/masters/{slug}" | python3 -m json.tool
curl -s "http://localhost:8000/api/public/masters/{slug}/availability?from_date=2026-02-10&to_date=2026-02-11" | python3 -m json.tool
```

---

## 7) Открытые вопросы / TODO

- **Public booking UX:** выбор услуги (ServicePicker accordion), даты (DatePicker), слота (TimeSlotsPicker), создание брони, добавление в календарь (.ics, Google)
- **Потенциально хрупко:** segments в ClientBottomNav/BottomNavigationCarousel при route groups; AuthGate ready/redirect race; interceptor guard зависит от user_data в AsyncStorage

---

## Ключевые файлы

| Файл | Назначение |
|------|------------|
| `backend/main.py` | FastAPI app, CORS, routers |
| `backend/routers/public_master.py` | Публичный API /m/[slug], slug=domain |
| `backend/routers/master.py` | Master settings, timezone, profile |
| `backend/routers/client.py` | Client bookings, master_timezone |
| `backend/utils/master_canon.py` | LEGACY_INDIE_MODE, master-only |
| `backend/utils/client_restrictions.py` | Restrictions |
| `backend/scripts/reseed_local_test_data.py` | Reseed через API |
| `backend/scripts/verify_master_canon.py` | DB + API invariants |
| `mobile/app/_layout.tsx` | AuthGate, Splash, redirect в useEffect |
| `mobile/app/(master)/_layout.tsx` | MasterMenuProvider, MasterHamburgerMenu |
| `mobile/app/(client)/_layout.tsx` | ClientBottomNav |
| `mobile/app/(public)/m/[slug].tsx` | Public booking wizard |
| `mobile/src/auth/AuthContext.tsx` | login, user, token |
| `mobile/src/services/api/client.ts` | apiClient, interceptor guard |
| `mobile/src/components/ClientBottomNav.tsx` | Client nav без useMasterMenu |
| `mobile/src/components/publicBooking/ServicePicker.tsx` | Выбор услуги |
| `mobile/src/stores/publicBookingDraftStore.ts` | Draft для /m/[slug] |
| `docs/MASTER_ONLY_MVP_CHECKLIST.md` | Проверки, команды, минимальный pytest (canon + booking_factory + calendar_ics) |
| `docs/CLIENT_LOGIN_MASTER_API_FIX_REPORT.md` | Route groups, фиксы |

---

## Что вставить в новый чат (супер-коротко)

```
DeDato: система бронирования (FastAPI + Expo Router). Последнее: route groups (master)/(client)/(public) — client не монтирует master-компоненты, 0 запросов /api/master/* при role=client. AuthGate: Splash + redirect в useEffect.

Инварианты: LEGACY_INDIE_MODE=0 (master-only), master_timezone без fallback, slug=masters.domain, /m/[slug] публичный.

Проверка: reseed → TOKEN=$(curl login) → verify_master_canon → pytest test_master_canon_flags test_booking_factory test_calendar_ics (минимальный набор, см. docs/MASTER_ONLY_MVP_CHECKLIST.md). Mobile: cold start client, login client — no /api/master/*.
```
