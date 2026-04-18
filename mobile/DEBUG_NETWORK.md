# 🔍 Диагностика Network Error

## Локальная разработка: два URL в `.env`

Для **iOS Simulator** и **Android Emulator** без ручного переключения одной строки:

- `API_URL` — базовый (часто `http://127.0.0.1:<PORT>` для симуляторов).
- `API_URL_ANDROID` — только dev + Android: для эмулятора обычно `http://10.0.2.2:<PORT>`.

Итоговый base URL пишется в лог при старте: `[ENV] Effective API_URL (axios baseURL)`.
При `ERR_NETWORK` смотрите `console.warn('[API] ERR_NETWORK context', …)` — там `baseURL` и `fullUrl`.

Подробнее: `mobile/FIX_ANDROID_EMULATOR.md`.

### Копируемый лог в приложении (Android / без Metro)

В `mobile/.env`: `DEBUG_MOBILE_ERRORS=1` (только dev). Перезапустите Metro.

В приложении появится красная кнопка **DBG** → модалка с текстом → **Copy** (весь буфер). Туда попадают структурированные API-ошибки (axios), вызовы `logger.error` и по возможности глобальные JS / `unhandledrejection`.

---

## Шаг 1: Проверка доступности Backend

Выполни в терминале на компьютере:

```bash
# Проверь, что backend отвечает
curl http://192.168.0.194:8001/health

# Должен вернуться:
# {"status":"healthy","service":"DeDato API"}
```

**Если не работает:**
- Backend не запущен или недоступен по этому адресу
- Проверь, что backend запущен с `--host 0.0.0.0`

---

## Шаг 2: Проверка API_URL в .env

Открой `mobile/.env` и проверь:

```env
API_URL=http://192.168.0.194:8001
```

**Важно:**
- Используй IP адрес компьютера, НЕ `localhost` или `127.0.0.1`
- Порт должен совпадать с портом backend (8001)

**Как узнать IP адрес:**
```bash
# macOS
ipconfig getifaddr en0

# Или
ifconfig | grep "inet " | grep -v 127.0.0.1
```

---

## Шаг 3: Проверка запуска Backend

Backend должен быть запущен так:

```bash
cd backend
uvicorn main:app --host 0.0.0.0 --port 8001 --reload
```

**Критично:** Используй `--host 0.0.0.0`, а НЕ `localhost` или `127.0.0.1`

---

## Шаг 4: Проверка логов Metro Bundler

Открой консоль Metro bundler (где запущен `npm start`) и посмотри логи при попытке входа.

Должны быть логи вида:
```
Network Error: {
  message: "...",
  url: "/api/auth/login",
  baseURL: "http://192.168.0.194:8001",
  code: "..."
}
```

**Коды ошибок:**
- `ECONNREFUSED` - backend не запущен или недоступен
- `ENOTFOUND` - неправильный IP адрес или домен
- `ETIMEDOUT` - таймаут (проблемы с сетью или firewall)

---

## Шаг 5: Проверка с телефона

Попробуй открыть в браузере на телефоне:
```
http://192.168.0.194:8001/health
```

**Если не открывается:**
- Телефон и компьютер в разных сетях
- Firewall блокирует порт 8001
- Неправильный IP адрес

---

## Шаг 6: Альтернативное решение - Tunnel режим

Если ничего не помогает, используй tunnel режим:

```bash
cd mobile
npm start -- --tunnel
```

Это создаст публичный URL через Expo сервис, который работает даже в разных сетях.

---

## Шаг 7: Проверка CORS

Убедись, что backend запущен в development режиме:

```bash
# Проверь переменную окружения
echo $ENVIRONMENT

# Или установи явно:
export ENVIRONMENT=development
cd backend
uvicorn main:app --host 0.0.0.0 --port 8001 --reload
```

---

## Быстрая проверка всех пунктов

```bash
# 1. Проверь IP адрес
ipconfig getifaddr en0  # macOS

# 2. Проверь доступность backend
curl http://$(ipconfig getifaddr en0):8001/health

# 3. Проверь, что backend запущен с правильным host
# В процессе backend должно быть: --host 0.0.0.0
```

---

## Что проверить в первую очередь

1. ✅ Backend запущен с `--host 0.0.0.0 --port 8001`
2. ✅ API_URL в `mobile/.env` указывает на правильный IP
3. ✅ Телефон и компьютер в одной Wi-Fi сети
4. ✅ Backend отвечает на `curl http://<IP>:8001/health`
5. ✅ В логах Metro bundler есть детальная информация об ошибке

