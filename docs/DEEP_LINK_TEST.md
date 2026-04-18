# Проверка Deep Link (URL scheme) — iOS и Android

Схема: `dedato`. Пример URL: `dedato://m/m-TK5E3n9R`.

## Источник истины (идентификаторы)

Единый источник: **`mobile/app.config.ts`**.

| Платформа | Идентификатор        | Конфиг |
|----------|----------------------|--------|
| iOS      | `com.dedato.app`     | `ios.bundleIdentifier` |
| Android  | `ru.dedato.mobile`   | `android.package`      |

После `npx expo prebuild` значения попадают в нативные проекты:
- **iOS:** `mobile/ios/<app>/Info.plist` (CFBundleURLTypes, CFBundleIdentifier).
- **Android:** `mobile/android/app/src/main/AndroidManifest.xml` (package, intent-filter).

---

## iOS

### 1. Scheme в сборке

После prebuild в `Info.plist` должен быть блок `CFBundleURLTypes` с `CFBundleURLSchemes` = `dedato`.

```bash
# из корня репозитория (папка ios появляется после prebuild)
grep -A 12 "CFBundleURLTypes" mobile/ios/DeDato/Info.plist
```

Ожидаемо: `CFBundleURLName` может быть `com.dedato.app`, в `CFBundleURLSchemes` — `dedato`.

### 2. Открыть deep link в симуляторе

Симулятор запущен, приложение установлено (`npx expo run:ios`).

```bash
xcrun simctl openurl booted "dedato://m/m-TK5E3n9R"
```

Приложение должно открыться на экране записи `/m/m-TK5E3n9R`. Ошибка **OSStatus -10814** — приложение не зарегистрировало схему, пересоберите (prebuild + run:ios).

### 3. Пересборка (если scheme не срабатывает)

```bash
cd mobile
npx expo prebuild --clean
npx expo run:ios
```

---

## Android

### 1. Узнать установленный package (если сомневаетесь)

```bash
adb shell pm list packages | grep -i dedato
```

Ожидаемый вывод: `package:ru.dedato.mobile` (из `app.config.ts`).

### 2. Открыть deep link

```bash
adb shell am start -W -a android.intent.action.VIEW -d "dedato://m/m-TK5E3n9R" ru.dedato.mobile
```

Приложение должно открыться на экране public booking. Если приложение не установлено или package другой — используйте package из вывода `pm list packages | grep -i dedato`.

### 3. Пересборка

```bash
cd mobile
npx expo prebuild --clean
npx expo run:android
```

---

## 4. UX: публичный экран без логина (public bypass)

При открытии ссылки записи мастера (`dedato://m/<slug>`) пользователь **не** должен попадать на `/login`. Должен открыться публичный экран записи `/(public)/m/[slug]` без авторизации. Логин требуется только при нажатии CTA «Записаться».

### Условия public bypass (в `app/_layout.tsx`, AuthGate)

Редирект на `/login` **не** выполняется, если выполняется любое из:

- Текущий маршрут в группе `(public)`: первый segment = `'(public)'` или `'m'`.
- `pathname` начинается с `/m/` или `m/`, либо содержит `/m/` или `(public)`.
- В `segments` есть `'m'` (маршрут вида `/(public)/m/[slug]`).
- Приложение открыто по deep link: `Linking.getInitialURL()` вернул URL вида `dedato://m/...` (до определения маршрута редирект не делается).

### Команды проверки

1. **Deep link → публичный экран (cold start)**  
   Приложение установлено, пользователь не авторизован (или очищен токен). Выполнить:
   ```bash
   xcrun simctl openurl booted "dedato://m/m-TK5E3n9R"
   ```
   Ожидание: открывается экран записи к мастеру `/m/m-TK5E3n9R`, **не** `/login`.

2. **Cold start без токена и без deep link**  
   Очистить токен (logout / маркер), закрыть приложение, открыть по иконке.  
   Ожидание: редирект на `/login`.

3. **Открытие `/m/<slug>` из приложения без токена**  
   Находясь в приложении без авторизации, выполнить `router.push('/m/m-TK5E3n9R')` (или перейти по такой ссылке из UI).  
   Ожидание: открывается публичная страница записи без редиректа на логин.

4. **Кнопка «Записаться» без авторизации**  
   На публичном экране выбрать услугу/дату/время, нажать «Записаться».  
   Ожидание: сохранение черновика → переход на `/login` → после входа возврат на `/m/<slug>` и создание брони (как реализовано через draft store).
