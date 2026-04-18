# Самодиагностика: Android deeplink / cold start (Expo Router)

**Дата:** по результатам проверки кода и конфигурации.  
**Ограничение:** в среде выполнения недоступна команда `adb`, поэтому пункты B и C (логи, resolve-activity, dumpsys) нужно выполнить локально на машине с подключённым эмулятором/устройством.

---

## 1. Что проверил

- **A) Файлы и роутинг**
  - Наличие `app/(public)/m/[slug].tsx` — да.
  - Содержимое `app/(public)/_layout.tsx` — один экран `Stack.Screen name="m/[slug]"`, без `name="m"`.
  - Корневой `app/_layout.tsx`: обработка initial URL (`Linking.getInitialURL()`), таймаут 2500 ms, эффект навигации на `/m/<slug>`, warm deeplink (`Linking.addEventListener('url')`), условия редиректа на `/login` и по draft.
  - Где выставляется loading/spinner на public booking: в `[slug].tsx` — `loading` до завершения `loadProfile()` → `getPublicMaster(slug)` (API).
  - Конфиг: `app.config.ts` — scheme `dedato`, Android `intentFilters` с `pathPrefix: '/m'`, package `ru.dedato.mobile`.
- **B) Android-окружение** — не выполнялось (нет `adb` в среде).
- **C) Репро и логи** — не выполнялось (нет `adb`).
- **D) Сеть и API**
  - Источник `API_URL`: `env.API_URL` из `@env` (mobile/.env), без подстановки для эмулятора.
  - `apiClient` (client.ts): `baseURL: env.API_URL`; публичные запросы (`getPublicMaster` и др.) идут на этот baseURL.
  - В `.env.example`: `API_URL=https://api.dedato.ru`; при локальной разработке часто задают `http://localhost:8000` — на эмуляторе Android это не сработает без `adb reverse` или замены на `10.0.2.2:8000`.

---

## 2. Что нашёл

### Факты по коду

- **Public layout:** в `(public)/_layout.tsx` объявлен только `Stack.Screen name="m/[slug]"`. Ссылок на экран с именем `"m"` нет — предупреждение «No route named 'm'» при текущем коде должно исчезать при корректной работе Expo Router с этим именем.
- **Корневой layout (AuthGate):**
  - При cold start `initialUrlIsPublic === null` до прихода результата `Linking.getInitialURL()`.
  - Таймаут 2500 ms: если за 2.5 с `getInitialURL()` не разрешился, выставляется `initialUrlIsPublic = false`.
  - Для неавторизованного пользователя при `initialUrlIsPublic === null` делается только `setReady(true)` и return (редиректа на `/login` нет).
  - Навигация на `/m/<slug>` выполняется одним эффектом при `initialUrlIsPublic === true` и наличии slug, с защитой `didNavigateFromDeeplinkRef`.
- **Public booking экран (`[slug].tsx`):**
  - Спиннер «Загрузка...» показывается при `loading && !profile` (строки 335–346).
  - `loading` сбрасывается только после завершения `loadProfile()` → `getPublicMaster(slug)`.
  - При недоступном API (например, `API_URL=http://localhost:8000` на эмуляторе без reverse) запрос может висеть до таймаута axios (30 с) или падать по сети — экран остаётся в состоянии загрузки или переходит в ошибку.
- **API_URL:** задаётся один раз из .env, подстановки `localhost` → `10.0.2.2` для Android-эмулятора в коде нет.

### Логи (ожидаемые при ручной проверке)

- После выполнения пунктов C (очистка logcat, cold start по deeplink, снятие логов по PID) стоит искать строки с: `DEEPLINK`, `Linking`, `getInitialURL`, `expo-router`, `router`, `No route named`, `error`, `exception`, `Network Error`, `API_URL`, `availability`, `public`.
- Если «висит» спиннер на экране записи — в логах вероятны сетевые ошибки или таймаут к `env.API_URL` (особенно при `localhost` без reverse).

---

## 3. Вероятные причины

1. **Таймаут 2.5 с для `getInitialURL()` на Android**  
   На части устройств/эмуляторов `Linking.getInitialURL()` может отвечать позже 2.5 с. Тогда срабатывает таймаут, выставляется `initialUrlIsPublic = false`, и при следующем проходе эффекта неавторизованный пользователь редиректится на `/login` вместо экрана `/m/<slug>`. Или сначала показывается дефолтный маршрут, потом редирект — воспринимается как «зависание» или неверный экран.

2. **Недоступный API с эмулятора (API_URL = localhost)**  
   Если в `mobile/.env` указано `API_URL=http://localhost:8000`, то с эмулятора Android запросы идут на «localhost» эмулятора, а не на хост машины. `getPublicMaster(slug)` не завершается или падает по сети → `loading` остаётся true или показывается ошибка → экран public booking «висит» на спиннере или в состоянии ошибки.

3. **Редкая гонка: готовность роутера и момент `router.replace('/m/<slug>')`**  
   На Android порядок монтирования и разрешения initial URL может отличаться. Если `router.replace('/m/' + slug)` вызывается до полной готовности стека (public) или до регистрации маршрута `m/[slug]`, возможен белый экран или краткое «зависание» до следующего цикла. Подтверждается только при наличии соответствующих логов (expo-router, ошибки навигации).

---

## 4. План фикса

### 4.1. Стабилизация deeplink cold start на `/m/<slug>`

- **Увеличить таймаут ожидания initial URL** в `app/_layout.tsx`: например, с `INITIAL_URL_TIMEOUT_MS = 2500` до 4000–5000 ms только для Android (`Platform.OS === 'android'`), чтобы снизить вероятность срабатывания таймаута до прихода `getInitialURL()`.
- **Опционально:** при `initialUrlIsPublic === null` и неавторизованном пользователе не вызывать `setReady(true)` до истечения таймаута или до прихода результата `getInitialURL()` (оставить спиннер корня), чтобы не показывать промежуточный экран и не давать лишний раз сработать редиректу на `/login` до решения по initial URL. Реализация — по желанию, с учётом UX (долгое ожидание спиннера).

### 4.2. Предупреждение «No route named m»

- Текущая конфигурация `(public)/_layout.tsx` с одним экраном `name="m/[slug]"` соответствует заявленным nested children. Если предупреждение всё ещё появляется в Metro:
  - Проверить версию expo-router и при необходимости обновить.
  - Альтернатива: убрать явный `Stack.Screen` и оставить только `<Stack screenOptions={{ headerShown: false }} />`, чтобы роутер сам подхватил `m/[slug]` из файловой структуры (как было в варианте A ранее).

### 4.3. Public booking не висит из‑за API_URL на эмуляторе

- **Рекомендуемое изменение:** в `src/config/env.ts` при сборке/рантайме для Android подставлять хост эмулятора, если в .env указан localhost:
  - если `API_URL` содержит `localhost` или `127.0.0.1` и `Platform.OS === 'android'`, заменить хост на `10.0.2.2` (только для эмулятора; для реального устройства может понадобиться IP хоста в сети).
- **Альтернатива (без изменения кода):** документировать обязательный шаг перед запуском на эмуляторе:
  - `adb reverse tcp:8000 tcp:8000` (или нужный порт), и в .env оставить `API_URL=http://localhost:8000`.
- В отчёте явно указать: «Android при API_URL=http://localhost:8000 обращается к localhost эмулятора; для эмулятора нужно либо adb reverse, либо подстановка 10.0.2.2».

---

## 5. Команды для повторной проверки (Runbook)

Выполнять при запущенном Metro и подключённом эмуляторе/устройстве (при необходимости заменить `emulator-5554` на свой serial).

```bash
# 1) Запуск Metro (с очисткой кэша)
cd mobile && npx expo start -c
```

```bash
# 2) Cold start по deeplink (приложение должно открыться на /m/m-TK5E3n9R)
adb -s emulator-5554 shell am force-stop ru.dedato.mobile
adb -s emulator-5554 shell am start -W -S -a android.intent.action.VIEW -d "dedato://m/m-TK5E3n9R" ru.dedato.mobile
```

```bash
# 3) Warm start по deeplink (приложение уже запущено)
adb -s emulator-5554 shell am start -W -a android.intent.action.VIEW -d "dedato://m/m-TK5E3n9R" ru.dedato.mobile
```

```bash
# 4) Логи процесса приложения (подставить PID или использовать фильтр по тегу)
adb -s emulator-5554 logcat -c
# ... затем cold start из п. 2 ...
adb -s emulator-5554 shell pidof ru.dedato.mobile
adb -s emulator-5554 logcat --pid=<PID> -d -t 200 | grep -iE "DEEPLINK|Linking|getInitialURL|expo-router|router|No route named|error|exception|Network Error|API_URL|availability|public"
```

```bash
# 5) Список adb reverse (проверка проброса портов)
adb -s emulator-5554 reverse --list
# при необходимости: adb -s emulator-5554 reverse tcp:8000 tcp:8000
```

```bash
# 6) Проверка доступности API с эмулятора (если бэкенд на хосте :8000)
adb -s emulator-5554 shell "curl -sI http://10.0.2.2:8000/health 2>/dev/null || true"
# при отсутствии curl: adb -s emulator-5554 shell "wget -q -O- --spider http://10.0.2.2:8000/health 2>/dev/null; echo $?"
```

---

## 6. Итог

- **Что проверил:** структура роутов, (public) layout, корневой layout (initial URL, таймаут, редиректы), место и причина спиннера на public booking, конфиг scheme/intentFilters, источник API_URL и использование в запросах.
- **Что нашёл:** корректное объявление экрана `m/[slug]`; возможная гонка с таймаутом 2.5 с на Android; зависимость «зависания» экрана записи от доступности API; отсутствие подстановки localhost → 10.0.2.2 для эмулятора.
- **Вероятные причины:** (1) таймаут getInitialURL на Android, (2) API_URL=localhost без reverse/подстановки, (3) возможная гонка навигации с роутером.
- **План фикса:** увеличить таймаут initial URL на Android; при необходимости скорректировать момент setReady; оставить или упростить (public) layout; ввести подстановку 10.0.2.2 для Android при localhost в API_URL или задокументировать adb reverse.
- **Runbook:** 6 команд выше — start metro, cold start, warm start, PID logs, reverse list, health check с эмулятора.

---

## 7. Smoke: стабильность mount и deeplink

После фикса множественных remount и дублирования обработки deeplink проверять так.

**Включить диагностику:** в `mobile/.env` задать `DEBUG_LOGS=true` (или `DEBUG_AUTH=true`).

### 7.1. Cold start одного slug → navigate 1 раз

1. Закрыть приложение: `adb -s <device> shell am force-stop ru.dedato.mobile`.
2. Открыть по deeplink: `adb -s <device> shell am start -W -S -a android.intent.action.VIEW -d "dedato://m/<slug>" ru.dedato.mobile`.
3. **В логах ожидать:**
   - Один раз за запуск: `[ROOT_LAYOUT] mount`, один раз `AUTH_CONTEXT_MOUNT` (допустимо 2 в DEV из‑за Fast Refresh).
   - Один раз: `[DEEPLINK] initialUrl= ... parsedSlug= ...` и один раз `[DEEPLINK] navigate -> /m/<slug>`.
   - Один раз: `[AuthGate] setReady(true) reason=inPublic` (без дубля).
4. **Признак проблемы:** многократные `[DEEPLINK] navigate -> ...` или дважды подряд `setReady(true) reason=inPublic`.

### 7.2. Warm deeplink другого slug → navigate 1 раз на новый slug

1. Приложение уже открыто (например, на экране `/m/slug-a` после cold start).
2. Открыть другой deeplink в том же процессе: `adb -s <device> shell am start -W -a android.intent.action.VIEW -d "dedato://m/slug-b" ru.dedato.mobile`.
3. **Ожидать:** переход на `/m/slug-b`; в логах один раз `[DEEPLINK] eventUrl= ... parsedSlug= slug-b navigate -> /m/slug-b`.
4. **Проверка:** повторная отправка того же `dedato://m/slug-b` не должна дублировать navigate (логи не повторяются, экран не мигает).
