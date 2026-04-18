# Настройка эмулятора для Maestro тестов

## Проблема с Expo Go

Expo Go не подключается к Metro bundler, хотя сервер виден. Это может быть из-за:
- Проблем с туннелем
- Конфликтов конфигурации
- Ограничений Expo Go

## Решение: Использовать эмулятор для тестирования

Для Maestro тестов **лучше использовать эмулятор** - он работает надежнее и не требует Expo Go.

## Android эмулятор

### Шаг 1: Запустить Android эмулятор

1. **Откройте Android Studio**
2. **AVD Manager** (Android Virtual Device Manager)
3. **Создайте или запустите эмулятор**

### Шаг 2: Запустить Expo

```bash
cd /Users/s.devyatov/DeDato/mobile
npx expo start --tunnel --clear
```

### Шаг 3: Открыть в эмуляторе

В терминале Expo нажмите **`a`** - приложение откроется в Android эмуляторе.

### Шаг 4: Запустить Maestro тесты

В другом терминале:

```bash
cd /Users/s.devyatov/DeDato/mobile
export PATH="/opt/homebrew/opt/openjdk@17/bin:$PATH"
export PATH="$PATH":"$HOME/.maestro/bin"
npm run test:e2e
```

## iOS симулятор

### Шаг 1: Запустить iOS симулятор

```bash
open -a Simulator
```

Или через Xcode: Xcode → Open Developer Tool → Simulator

### Шаг 2: Запустить Expo

```bash
cd /Users/s.devyatov/DeDato/mobile
npx expo start --tunnel --clear
```

### Шаг 3: Открыть в симуляторе

В терминале Expo нажмите **`i`** - приложение откроется в iOS симуляторе.

### Шаг 4: Запустить Maestro тесты

```bash
cd /Users/s.devyatov/DeDato/mobile
export PATH="/opt/homebrew/opt/openjdk@17/bin:$PATH"
export PATH="$PATH":"$HOME/.maestro/bin"
npm run test:e2e
```

## Преимущества эмуляторов

- ✅ Не требуют Expo Go
- ✅ Работают напрямую с Metro bundler
- ✅ Всегда доступны для Maestro
- ✅ Не зависят от туннеля/сети
- ✅ Быстрее для тестирования
- ✅ Стабильнее для E2E тестов

## Проверка что эмулятор работает

После нажатия `a` или `i` в терминале Expo:
- Должно появиться сообщение о запуске в эмуляторе
- Приложение должно открыться в эмуляторе
- В терминале Metro должны появиться логи подключения

## Если эмулятор не запускается

### Android:
- Убедитесь что Android Studio установлен
- Создайте AVD (Android Virtual Device)
- Запустите эмулятор из Android Studio

### iOS:
- Убедитесь что Xcode установлен
- Установите Xcode Command Line Tools: `xcode-select --install`
- Запустите симулятор: `open -a Simulator`

## Готово!

После того как приложение откроется в эмуляторе, можно запускать Maestro тесты.

