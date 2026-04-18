# Правки public booking и e2e/smoke

## Доработки WEB /m/:slug (декабрь)

- **Таймзона**: один блок «Время записи» в правой колонке (MasterBookingSidebar), человекочитаемый лейбл через `formatTimezoneLabel()` (например «Москва (UTC+3)»). Дубли под визардом убраны.
- **Календарь**: выбор даты — календарь-сетка (месяц, prev/next), дни без слотов disabled. data-testid: `date-cell-YYYY-MM-DD`, `month-prev`, `month-next`.
- **401 / users/me**: на публичной странице не вызывается отдельный `checkCurrentUser` — используется только `useAuth().user`. В AuthContext 401/403 не логируются и не ретраятся. CTA «Записаться» не блокируется из‑за 401.
- **CTA**: при полном выборе (услуга + дата + слот) и `!bookingBlocked` кнопка активна; в dev при клике по disabled пишется debug-лог.

---

## (1) ФИКСЫ

### 1) Success → «Перейти в мои записи»: редирект по роли

- **Mobile** (`mobile/app/(public)/m/[slug].tsx`): кнопка показывается только при `user.role`:
  - `client` → `router.replace('/client/dashboard')`
  - `master` / `indie` → `router.replace('/')` (кабинет мастера), текст «Перейти в кабинет мастера»
  - иначе кнопка не рендерится
- **Web** (`frontend/src/components/booking/PublicBookingWizard.jsx`): ссылка «Перейти в мои записи»:
  - `client` → `/client`
  - `master` / `indie` → `/master`
  - без `currentUser` или неизвестная роль — ссылка скрыта

### 2) Draft → login → create: без дублей

- **Схема draft**: добавлены поля `status` (`pending` | `submitted` | `done`), `attempt_id`, `created_booking_id`.
- **Правила**:
  - Draft очищается только после **успешного** ответа POST (200/201).
  - При ошибке POST: `status` возвращается в `pending`, draft остаётся для повтора.
  - При повторном заходе на `/m/[slug]` после логина: если `status === 'submitted'` или есть `created_booking_id` — повторный create **не** выполняется (идемпотентность).
- **Реализация**:
  - Перед POST выставляем `status = 'submitted'` и сохраняем draft.
  - После успеха: `status = 'done'`, `created_booking_id = res.id`, затем полная очистка draft.
  - После ошибки: `status = 'pending'`, сохраняем draft.
- **Клиенты**: mobile — `publicBookingDraftStore` (AsyncStorage); web — sessionStorage с той же схемой.
- **Логи**: при пропуске create из‑за idempotency пишется лог только при `DEBUG_AUTH` или `DEBUG_LOGS` (mobile) / `window.__DEBUG_PUBLIC_BOOKING__` или `window.__DEBUG_AUTH__` (web).

### 3) SafeAreaProvider

- В `mobile/app/_layout.tsx` корень уже обёрнут в `SafeAreaProvider`, он покрывает все route groups (login, (master), (client), (public)).
- Добавлен комментарий в коде; дублирование не вводилось.

---

## (2) E2E и smoke

### Web E2E (Playwright)

- **Файл**: `frontend/e2e/public-booking.spec.ts`
- **Сценарий**: открыть `/m/m-TK5E3n9R` → выбрать услугу → дату → слот → «Записаться» → при появлении модалки логин (+79990000101 / test123) → дождаться success → проверить наличие «Добавить в календарь» и «Перейти в мои записи» → проверка: POST к `.../bookings` ровно один раз; после reload повторного POST нет.

**Запуск:**

```bash
cd frontend
npm run dev
# в другом терминале:
E2E_BASE_URL=http://localhost:5173 npx playwright test e2e/public-booking.spec.ts --project=chromium
# или
npm run test:e2e -- e2e/public-booking.spec.ts
```

Опционально: `E2E_PUBLIC_SLUG`, `E2E_CLIENT_PHONE`, `E2E_CLIENT_PASSWORD`.

### Smoke-скрипт (API)

- **Файл**: `scripts/smoke_public_booking.sh`
- **Действия**: GET `/api/public/masters/{slug}` → первый `service_id` → GET availability → вывод числа слотов и первого слота; при заданном `TOKEN` — POST брони на первый слот, сохранение ics в `/tmp/booking_{id}.ics`.

**Запуск:**

```bash
# только профиль + availability
./scripts/smoke_public_booking.sh m-TK5E3n9R

# с созданием брони (TOKEN = access_token клиента)
TOKEN=$(curl -s -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"phone":"+79990000101","password":"test123"}' | jq -r '.access_token')
SLUG=m-TK5E3n9R ./scripts/smoke_public_booking.sh
```

Переменные: `SLUG`, `API_URL` (по умолчанию `http://localhost:8000`), `TOKEN` (опционально).

---

## data-testid (web)

- `service-picker-button` — кнопка выбора услуги
- `service-option-<id>` — пункт услуги в списке
- `date-picker-button` — кнопка выбора даты
- `date-option-YYYY-MM-DD` — пункт даты
- `slot-<start>` — кнопка слота (start_time с заменой `:` и `.` на `-`)
- `cta-book` — кнопка «Записаться»
- `success-screen` — контейнер экрана успеха
- `go-to-my-bookings` — ссылка «Перейти в мои записи»

---

## Как убедиться, что дублей нет

1. **Ручная проверка (web)**  
   Открыть `/m/m-TK5E3n9R` без логина → выбрать услугу, дату, слот → «Записаться» → войти → дождаться success. Открыть DevTools → Network, отфильтровать по `bookings`. Должен быть **один** POST с ответом 200/201. Обновить страницу (F5): повторного POST быть не должно, экран успеха может остаться (draft уже очищен).

2. **E2E**  
   В тесте считается количество POST к `**/api/public/masters/*/bookings`; после успеха ожидается `postBookingsCount === 1`. После reload проверяется, что счётчик не увеличился.

3. **Mobile**  
   После логина и автоматического create не должно быть второго запроса: при первом заходе draft в статусе `pending`, после POST — `submitted`, затем при успехе — очистка. Повторный эффект при уже `submitted`/`done` не вызывает create (см. код в `[slug].tsx` и `PublicBookingWizard.jsx`).
