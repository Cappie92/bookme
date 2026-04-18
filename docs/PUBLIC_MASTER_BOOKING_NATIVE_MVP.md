# Public Master Booking — Native MVP

## Реализовано

### Mobile
- **Нативный экран** `mobile/app/m/[slug].tsx` — WebView заменён на нативный UI
- **API** `mobile/src/services/api/publicMasters.ts` — getPublicMaster, getPublicMasterAvailability, getClientNoteForMaster, getPublicEligibility, createPublicBooking
- **Draft store** `mobile/src/stores/publicBookingDraftStore.ts` — сохранение выбора перед логином
- **Auth flow** — при отсутствии авторизации: draft → /login → после успеха возврат на /m/slug и завершение брони
- **Deep-link** `dedato://m/{slug}` — `app.json` scheme: dedato
- **WebView удалён** — зависимость react-native-webview снята

### Web
- **Smart banner** — «Открыть» / «Продолжить в браузере».
- **Fallback** — при клике «Открыть» попытка открыть приложение; если не открылось — остаёмся на вебе.

### Backend
- `GET /api/public/masters/{slug}` — профиль + services + master_timezone
- `GET /api/public/masters/{slug}/availability` — слоты
- `POST /api/public/masters/{slug}/bookings` — 401 без токена
- `GET /api/public/masters/{slug}/client-note` — note_text null без токена
- `GET /api/public/masters/{slug}/eligibility` — points, booking_blocked, requires_advance_payment
- `_ensure_master_timezone()` — 400 при отсутствии timezone

## Команды проверки

### Backend
```bash
# Профиль мастера
curl -s "http://localhost:8000/api/public/masters/test-slug" | jq

# Слоты (замените service_id и даты)
curl -s "http://localhost:8000/api/public/masters/test-slug/availability?service_id=1&from_date=2025-02-05&to_date=2025-02-12" | jq

# client-note без токена
curl -s "http://localhost:8000/api/public/masters/test-slug/client-note" | jq
```

### Mobile
```bash
# Запуск
cd mobile && npx expo start

# Deep-link (iOS Simulator)
xcrun simctl openurl booted "dedato://m/test-slug"
```

### Проверка
1. Открыть `dedato://m/<slug>` (или `/m/<slug>` в приложении) → нативный экран
2. Выбрать услугу → слоты → «Записаться»
3. Без авторизации → модалка «Войти» → логин → возврат и создание брони
4. После успеха → «Добавить в календарь»
