# Отчёт: диагностика API / public booking на Android

## Что было проверено

- **Backend:** точка входа `main:app` (backend/main.py), запуск: `cd backend && python3 -m uvicorn main:app --reload --host 0.0.0.0 --port 8000`. Эндпоинт **GET /health** определён в main.py (строки 199–201), возвращает `{"status": "healthy", "service": "DeDato API"}` без обращения к БД.
- **Эмулятор:** на устройстве часто нет curl/wget; проверка порта — через `toybox nc -z`. HTTP через `printf "GET ..." | nc` может давать пустой вывод из‑за буферизации/поведения nc (см. ANDROID_NC_DEBUG.md).
- **Приложение:** baseURL берётся из `env.API_URL` (mobile/src/config/env.ts, .env). В client.ts используется `apiClient.defaults.baseURL = env.API_URL`. При `API_URL=http://localhost:8000` и отсутствии `adb reverse` запросы с эмулятора идут на localhost эмулятора, а не хоста → таймаут/ошибка.

## Вероятная причина проблем

1. **nc возвращает пусто** — особенность работы `toybox nc` с HTTP (не закрывает соединение, буфер), а не обязательно недоступность сервера. Надёжная проверка — из приложения (diagnostics) или с хоста через curl.
2. **API недоступен с эмулятора** — при `API_URL=localhost` без `adb reverse tcp:8000 tcp:8000` эмулятор обращается к своему localhost. Нужен либо reverse, либо `API_URL=http://10.0.2.2:8000`.
3. **Долгий спиннер / «сломанное» кольцо** — возможная гонка с контекстом (onWindowFocusChange и т.п.) на Android/Bridgeless; добавлены boot guard (задержка перед первым запросом на Android), watchdog 10s и экран с «Повторить»/«Назад».

## Что сделано в коде

| Файл | Изменения |
|------|-----------|
| **docs/ANDROID_API_CONNECTIVITY.md** | Новый: как проверить backend на хосте (curl /health), зачем `--host 0.0.0.0`, как работают adb reverse и 10.0.2.2, проверка с эмулятора без curl. |
| **docs/ANDROID_NC_DEBUG.md** | Новый: команды для zsh по отладке пустого ответа nc (exit code, -w 3, HTTP/1.1, Host, Connection: close), без незакрытых скобок. |
| **mobile/src/services/api/diagnostics.ts** | Новый: `debugConnectivity()` — только при `__DEV__` и `DEBUG_HTTP`. Fetch GET `${baseURL}/health` с таймаутом 3s, логи [NET_DIAG] (success: status, ms, body до 120 символов; fail: ms, timeout, error). При localhost/127.0.0.1 и ошибке — подсказка в логах про adb reverse или 10.0.2.2. |
| **mobile/app/(public)/m/[slug].tsx** | Вызов `debugConnectivity()` при монтировании в __DEV__ при DEBUG_HTTP или DEBUG_LOGS; состояние `diagResult`, `profileLoadResult` (ok, ms, code после loadProfile). Компактный блок [NET_DIAG] на экране (при loading и при загруженном контенте): API_URL, baseURL, health OK/FAIL+ms, getPublicMaster OK/FAIL+ms+code. Логи [PUBLIC_BOOKING] без изменений (уже одна строка на событие с ms/code). |
| **backend** | Не менялся; /health уже есть. |

Автоподстановки baseURL на 10.0.2.2 в коде нет — только подсказка в логах при неуспешном health и localhost.

## Runbook: 5 команд для воспроизведения и проверки

1. **Backend на хосте и adb reverse**
   ```bash
   cd backend && python3 -m uvicorn main:app --reload --host 0.0.0.0 --port 8000
   ```
   В другом терминале:
   ```bash
   curl -i http://localhost:8000/health
   adb reverse tcp:8000 tcp:8000
   adb reverse --list
   ```

2. **Cold start deeplink**
   ```bash
   adb shell am force-stop ru.dedato.mobile
   adb shell am start -W -S -a android.intent.action.VIEW -d "dedato://m/m-TK5E3n9R" ru.dedato.mobile
   ```
   Ожидание: экран public booking; при DEBUG_HTTP в блоке [NET_DIAG] — health и getPublicMaster с ms/code.

3. **Warm deeplink (после паузы)**
   Свернуть приложение, затем:
   ```bash
   adb shell am start -W -a android.intent.action.VIEW -d "dedato://m/m-TK5E3n9R" ru.dedato.mobile
   ```
   Проверить тот же блок [NET_DIAG] и отсутствие зависания.

4. **Включение флагов**
   В mobile/.env задать:
   ```bash
   DEBUG_HTTP=1
   DEBUG_LOGS=1
   ```
   Перезапустить Metro; открыть public booking по deeplink или из приложения.

5. **Где смотреть вывод**
   - В приложении: блок [NET_DIAG] на экране public booking (API_URL, baseURL, health, getPublicMaster).
   - В логах Metro/консоли: префиксы [NET_DIAG], [PUBLIC_BOOKING], [DEEPLINK]; одна строка на событие (start/success/fail/timeout) с ms и при необходимости code. При неуспешном health и localhost — строка с подсказкой про adb reverse или 10.0.2.2.

Если adb недоступен в среде выполнения, проверка доступности API делается только из приложения через `debugConnectivity()` и блок на экране; ожидаемые логи — как выше.
