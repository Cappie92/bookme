# Быстрый старт Maestro E2E тестов

## Шаг 1: Установка Maestro (выполнить один раз, в любой папке)

```bash
curl -Ls "https://get.maestro.mobile.dev" | bash
```

Проверка установки:
```bash
maestro --version
```

## Шаг 2: Запуск приложения (в папке mobile/)

```bash
cd /Users/s.devyatov/DeDato/mobile
npx expo start
```

Затем:
- Нажмите `i` для iOS симулятора
- Нажмите `a` для Android эмулятора  
- Или отсканируйте QR-код на физическом устройстве

**Важно:** Оставьте этот терминал открытым, приложение должно быть запущено!

## Шаг 3: Запуск тестов (в новом терминале, в папке mobile/)

Откройте **новый терминал** и выполните:

```bash
cd /Users/s.devyatov/DeDato/mobile
npm run test:e2e
```

Или запустите конкретный тест:

```bash
cd /Users/s.devyatov/DeDato/mobile
maestro test .maestro/flows/01-login-success.yaml
```

## Структура команд

### Все команды выполняются в папке: `/Users/s.devyatov/DeDato/mobile`

1. **Установка Maestro** (один раз, глобально):
   ```bash
   curl -Ls "https://get.maestro.mobile.dev" | bash
   ```

2. **Запуск приложения** (терминал 1):
   ```bash
   cd /Users/s.devyatov/DeDato/mobile
   npx expo start
   ```

3. **Запуск тестов** (терминал 2):
   ```bash
   cd /Users/s.devyatov/DeDato/mobile
   npm run test:e2e
   ```

## Доступные команды тестирования

Все команды выполняются из папки `/Users/s.devyatov/DeDato/mobile`:

```bash
# Все тесты
npm run test:e2e

# Конкретный тест
maestro test .maestro/flows/01-login-success.yaml
maestro test .maestro/flows/02-login-error.yaml
maestro test .maestro/flows/03-navigate-to-bookings.yaml
maestro test .maestro/flows/04-open-booking-details.yaml
maestro test .maestro/flows/05-logout.yaml

# С отладкой
maestro test .maestro/flows/01-login-success.yaml --debug

# С видео
maestro test .maestro/flows/ --video
```

## Важные замечания

1. **Приложение должно быть запущено** перед запуском тестов
2. **Все команды тестов выполняются из папки `mobile/`**
3. **Maestro автоматически определит appId**, если приложение запущено
4. Для теста логина нужен пользователь с телефоном `+79991234567` и паролем `password123` (или измените данные в тесте)

