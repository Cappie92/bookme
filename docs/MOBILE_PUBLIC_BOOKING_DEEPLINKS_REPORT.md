# Public booking flow + deep links (mobile) — отчёт

## Изменённые файлы (mobile + config)

| Файл | Изменения |
|------|-----------|
| `mobile/src/stores/publicBookingDraftStore.ts` | В тип `PublicBookingDraft` добавлено поле `intent?: 'create_after_auth'`. В `updatePublicBookingDraftStatus` в `updates` добавлена поддержка `intent`. |
| `mobile/app/(public)/m/[slug].tsx` | При нажатии «Записаться» без логина в draft сохраняется `intent: 'create_after_auth'`. Автосоздание брони после логина выполняется **только** при `draft.intent === 'create_after_auth'`. Логи под `__DEV__` и (`env.DEBUG_AUTH` или `env.DEBUG_LOGS`). |
| `mobile/app/login.tsx` | Импорт `getPublicBookingDraft`. После успешного `login()` и `register()`: если `draft?.intent === 'create_after_auth'` и `draft?.slug` — `router.replace('/m/' + draft.slug)`; иначе — прежняя логика (client → `/client/dashboard`, master → `/`). |
| `mobile/app/_layout.tsx` | При cold start по `dedato://m/<slug>` сохраняем slug в `initialUrlSlugRef`. Добавлен эффект: при `initialUrlIsPublic === true` и текущем path не `/m/<slug>` один раз вызывается `router.replace('/m/' + slug)`, чтобы гарантированно открыть public экран. Защита от повторного вызова через `didNavigateFromDeeplinkRef`. |
| `mobile/app.config.ts` | В `android` добавлен `intentFilters`: `action: VIEW`, `data: [{ scheme: 'dedato', pathPrefix: '/m' }]`, `category: ['BROWSABLE', 'DEFAULT']` — для открытия по `adb ... -d "dedato://m/<slug>"`. |

---

## Краткое описание изменений (почему и что)

- **Intent create_after_auth** — различаем «логин из шапки» и «логин после нажатия Записаться». Только во втором случае после входа создаётся бронь и выполняется редирект на `/m/<slug>`.
- **Login redirect** — после успешного входа/регистрации проверяем draft; при наличии intent и slug возвращаем пользователя на экран записи, где уже сработает автосоздание (один раз).
- **AuthGate + deeplink** — при открытии по `dedato://m/<slug>` иногда роутер показывал не public экран; добавлена явная навигация на `/m/<slug>` один раз при `initialUrlIsPublic === true`.
- **Android intentFilters** — схема `dedato` и pathPrefix `/m` заявлены в манифесте, чтобы `adb shell am start ... -d "dedato://m/<slug>"` открывал приложение на нужном экране.
- **Логи** — только в dev и при включённых флагах: в `.env` задать `DEBUG_AUTH=true` и/или `DEBUG_LOGS=true` для логов AuthGate и public booking.

---

## Manual QA script

### iOS (dev build)

1. **Сборка/запуск**
   - `cd mobile && npx expo run:ios` (или dev client через EAS).
   - Убедиться, что в Xcode/Info плагины экспо проставляют `CFBundleURLTypes` со схемой `dedato` (обычно даёт `app.config.ts` `scheme: 'dedato'`).

2. **Deeplink при холодном старте**
   - Полностью закрыть приложение. В симуляторе:  
     `xcrun simctl openurl booted "dedato://m/m-TK5E3n9R"`.
   - Ожидание: приложение открывается сразу на экране public booking `/(public)/m/m-TK5E3n9R`, без редиректа на `/login`.

3. **Cold start без токена и без deeplink**
   - Удалить приложение / очистить данные (или logout), закрыть приложение, открыть снова по тапу на иконку (без deeplink).
   - Ожидание: редирект на `/login`.

4. **Logout → kill → cold start → deeplink**
   - Войти, выйти (logout), полностью закрыть приложение, открыть по ссылке:  
     `xcrun simctl openurl booted "dedato://m/m-TK5E3n9R"`.
   - Ожидание: открывается public экран записи, без восстановления старой сессии (логин не выполнен).

5. **Confirm flow (создание брони после логина)**
   - Открыть по deeplink (или перейти на `/m/<slug>`), выбрать услугу/дату/время, нажать «Записаться» → «Войти» → войти.
   - Ожидание: редирект на `/m/<slug>`, создаётся ровно одна бронь, показ success; «Добавить в календарь» и «Перейти в мои записи» работают.

6. **Логин из шапки без создания брони**
   - Открыть public экран (без выбора услуги/даты/времени или без нажатия «Записаться»), нажать «Войти» в шапке и войти.
   - Ожидание: редирект по роли (client → `/client/dashboard`, master → `/`), бронь не создаётся.

---

### Android (dev build)

1. **Сборка/запуск**
   - `cd mobile && npx expo run:android` (или dev client).
   - Package: `ru.dedato.mobile` (из `app.config.ts`).

2. **Deeplink**
   - Закрыть приложение, выполнить:  
     `adb shell am start -W -a android.intent.action.VIEW -d "dedato://m/m-TK5E3n9R" ru.dedato.mobile`
   - Ожидание: приложение открывается на экране public booking, без редиректа на `/login`.

3. **Cold start без токена и без deeplink**
   - Аналогично iOS: очистить данные / logout, закрыть приложение, открыть по иконке.
   - Ожидание: редирект на `/login`.

4. **Logout → kill → deeplink**
   - Войти, выйти, закрыть приложение, открыть по:  
     `adb shell am start -W -a android.intent.action.VIEW -d "dedato://m/m-TK5E3n9R" ru.dedato.mobile`
   - Ожидание: public экран, без восстановления сессии.

5. **Confirm flow** — как в iOS (шаги 5–6).

---

## Инварианты (ожидаемое поведение)

- При открытии `dedato://m/<slug>` приложение открывается на `/(public)/m/<slug>` без редиректа на `/login`.
- Обычный cold start без токена и без deeplink → редирект на `/login`.
- После logout → полное закрытие приложения → cold start → открытие по deeplink → показывается public экран, сессия не восстанавливается (учитывается logout marker).
- Только нажатие «Записаться» с последующим «Войти» приводит к сохранению draft с `intent: 'create_after_auth'`, редиректу на `/m/<slug>` после логина и ровно одному созданию брони.
- Логин/регистрация из шапки (без предшествующего «Записаться» с intent) не создают бронь и ведут по роли (client/master).
- Повторное открытие экрана/возврат/ремонтирование не делают повторный POST при уже submitted/done или при наличии `created_booking_id`.
- Success: «Добавить в календарь» и «Перейти в мои записи» (client → `/client/dashboard`, master → `/`) работают.
- Логи диагностики только при `__DEV__` и флагах `DEBUG_AUTH` / `DEBUG_LOGS` в env.

---

## Баги и фиксы

- **Редирект после логина при confirm flow** — после входа пользователь мог уходить на dashboard вместо возврата на `/m/<slug>`; добавлена проверка `draft?.intent === 'create_after_auth'` и `router.replace('/m/' + draft.slug)` в `login.tsx` после `login()` и `register()`.
- **Автосоздание брони при «просто логине»** — раньше любой логин с сохранённым draft мог запускать создание брони; теперь создание только при `draft.intent === 'create_after_auth'` (выставляется только в confirm flow при нажатии «Записаться»).
- **Public экран при cold start по deeplink** — в части сценариев роутер не сразу показывал `/(public)/m/<slug>`; в AuthGate добавлена однократная навигация `router.replace('/m/' + slug)` при `initialUrlIsPublic === true`.
- **Android deeplink** — для надёжного открытия по `adb ... -d "dedato://m/..."` в `app.config.ts` добавлен `android.intentFilters` для схемы `dedato` и pathPrefix `/m`.

**Идентификаторы (источник истины — `mobile/app.config.ts`):** iOS `ios.bundleIdentifier`: `com.dedato.app`; Android `android.package`: `ru.dedato.mobile`. В командах adb указывать именно `ru.dedato.mobile`. Проверка установленного package: `adb shell pm list packages | grep -i dedato`.

---

## Команды для проверки (реальный package)

- **iOS (симулятор):**  
  `xcrun simctl openurl booted "dedato://m/m-TK5E3n9R"`  
  (bundleId для открытия схемы берётся из установленного приложения, в конфиге — `com.dedato.app`.)

- **Android:**  
  Узнать package: `adb shell pm list packages | grep -i dedato` → ожидаемо `ru.dedato.mobile`.  
  Открыть deeplink:  
  `adb shell am start -W -a android.intent.action.VIEW -d "dedato://m/m-TK5E3n9R" ru.dedato.mobile`

---

## Чеклист: три сценария

| Сценарий | Ожидание |
|----------|----------|
| **1. Cold start без токена и без deeplink** | Редирект на `/login`. |
| **2. Cold start по deeplink** `dedato://m/<slug>` | Сразу открывается `/m/<slug>` (public booking), без редиректа на `/login`, без моргания экрана логина. |
| **3. App в фоне → openurl** `dedato://m/<slug>` | Приложение выходит на передний план, открывается экран `/m/<slug>` (обработка через Expo Linking + роутер), без циклов навигации. |
