# Запуск в iOS симуляторе

## Что я исправил

✅ Вернул `bundleIdentifier` и `package` в `app.config.ts` - они нужны для запуска в симуляторе

## Запуск

### Шаг 1: Запустить симулятор

```bash
open -a Simulator
```

Или выберите устройство:
```bash
xcrun simctl boot "iPhone 15"
```

### Шаг 2: Запустить Expo

```bash
cd /Users/s.devyatov/DeDato/mobile
npx expo start --tunnel --clear
```

### Шаг 3: Открыть в симуляторе

В терминале Expo нажмите **`i`** - приложение должно открыться в симуляторе.

## Если все еще ошибка

Проверьте что симулятор запущен:
```bash
xcrun simctl list devices | grep Booted
```

Должно показать запущенное устройство.

## После успешного запуска

Приложение должно открыться в симуляторе, и вы сможете:
- Тестировать вручную
- Запускать Maestro тесты

## Запуск Maestro тестов

После того как приложение открылось в симуляторе:

```bash
cd /Users/s.devyatov/DeDato/mobile
export PATH="/opt/homebrew/opt/openjdk@17/bin:$PATH"
export PATH="$PATH":"$HOME/.maestro/bin"
npm run test:e2e
```

