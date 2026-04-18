# Сеть: Android эмулятор, iOS Simulator и физическое устройство

## Схема по умолчанию (репозиторий)

В `mobile/.env` задаются **две** переменные для локальной разработки:

- **`API_URL`** — общий базовый URL (для **iOS Simulator** обычно `http://127.0.0.1:<PORT>` или `localhost`).
- **`API_URL_ANDROID`** — подмена **только в `__DEV__` на Android**, если строка не пустая (для **Android Emulator** обычно `http://10.0.2.2:<PORT>` — это loopback хост-машины с точки зрения AVD).

В **production** используется только **`API_URL`**; `API_URL_ANDROID` игнорируется.

Так не нужно вручную переключать одну и ту же строку `API_URL` при смене iOS ↔ Android.

## Проблема

На **Android Emulator** `localhost` / `127.0.0.1` указывают на **сам эмулятор**, а не на Mac/PC → `ERR_NETWORK` к backend на машине разработчика.

На **iOS Simulator** `127.0.0.1` / `localhost` обычно указывают на машину разработчика — отдельный Android-only host в общем `API_URL` не нужен.

## Решение

### Шаг 1: Проверьте, что backend запущен

```bash
curl http://127.0.0.1:8000/docs
```

Порт подставьте свой. Для доступа с эмулятора/устройства часто нужен запуск с `--host 0.0.0.0`.

### Шаг 2: Настройте `mobile/.env`

Пример для backend на `8000` на той же машине, что и Metro:

```env
API_URL=http://127.0.0.1:8000
API_URL_ANDROID=http://10.0.2.2:8000
```

- **iOS Simulator** возьмёт `API_URL`.
- **Android Emulator** в dev возьмёт `API_URL_ANDROID`.

### Шаг 3: Физическое устройство

Укажите **LAN IP** машины разработчика в **`API_URL`** (одна Wi‑Fi сеть с телефоном) и **не задавайте** `API_URL_ANDROID` (пустая строка или удалите строку), чтобы Android использовал тот же URL:

```env
API_URL=http://192.168.1.10:8000
```

Альтернатива для Android: `adb reverse tcp:8000 tcp:8000` и снова `API_URL=http://127.0.0.1:8000` без Android-override.

### Шаг 4: Перезапустите Metro

После изменения `.env`:

1. Остановите Expo (Ctrl+C).
2. `cd mobile && npx expo start`
3. Откройте нужную платформу (`i` / `a`).

В консоли при старте в dev смотрите лог **`[ENV] Effective API_URL (axios baseURL)`** — это фактический base URL для запросов.

## Порты

- **8081/8082** — Metro (Expo).
- **8000** (или ваш) — backend API; должен быть запущен отдельно.

## Быстрая проверка

```bash
lsof -ti:8081 || lsof -ti:8082
curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8000/docs
```
