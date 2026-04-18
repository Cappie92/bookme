# Smoke: Deep link public booking (mobile dev build)

Быстрая проверка deeplink для экрана записи `/(public)/m/[slug]` на iOS и Android. Зависимости: только `adb` (Android) и `xcrun` (iOS), без дополнительных пакетов.

## Источник истины

Идентификаторы — в `mobile/app.config.ts`:
- **iOS:** `ios.bundleIdentifier` = `com.dedato.app`
- **Android:** `android.package` = `ru.dedato.mobile`

---

## 1. Сборка dev build

```bash
cd mobile
npx expo run:ios
# или
npx expo run:android
```

При необходимости пересобрать с нуля: `npx expo prebuild --clean` затем `npx expo run:ios` / `run:android`.

---

## 2. Дёрнуть deeplink

**iOS (симулятор):**
```bash
xcrun simctl openurl booted "dedato://m/m-TK5E3n9R"
```

**Android (устройство/эмулятор):**
```bash
# Убедиться, что package установлен (ожидаемо ru.dedato.mobile):
adb shell pm list packages | grep -i dedato

adb shell am start -W -a android.intent.action.VIEW -d "dedato://m/m-TK5E3n9R" ru.dedato.mobile
```

---

## 3. Что должно открыться

- Приложение открывается на экране **public booking** по пути `/m/m-TK5E3n9R` (страница записи к мастеру).
- **Нет** редиректа на экран логина при открытии по deeplink (ни cold start, ни из фона).

---

## 4. Как проверить, что не редиректит на login при deeplink

1. Убедиться, что пользователь не авторизован (logout или чистая установка).
2. Полностью закрыть приложение.
3. Открыть по deeplink (команды выше).
4. Ожидание: сразу виден экран записи (услуги мастера, выбор даты/времени), без показа экрана входа.

Если вместо этого открывается экран логина — проверить:
- в `app.config.ts`: `scheme: 'dedato'`, для Android — `intentFilters` с `scheme: 'dedato'`, `pathPrefix: '/m'`;
- после изменений конфига — пересборка (`prebuild --clean` + `run:ios` / `run:android`).

---

## 5. Три сценария (кратко)

| Шаг | Действие | Ожидание |
|-----|----------|----------|
| Cold start без deeplink | Очистить токен, закрыть приложение, открыть по иконке | Редирект на `/login` |
| Cold start с deeplink | Закрыть приложение, выполнить команду openurl / adb | Открывается `/m/<slug>`, не логин |
| App в фоне + deeplink | Свернуть приложение, выполнить openurl / adb | Приложение на переднем плане, экран `/m/<slug>` |

Подробнее: `docs/DEEP_LINK_TEST.md`, `docs/MOBILE_PUBLIC_BOOKING_DEEPLINKS_REPORT.md`.
