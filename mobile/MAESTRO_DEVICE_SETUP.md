# Настройка устройства для Maestro тестов

## Проблема: "0 devices connected"

Maestro требует запущенное устройство (эмулятор или физическое) перед запуском тестов.

## Решение

### Вариант 1: Android эмулятор

1. **Запустите Android Studio**
2. **Откройте AVD Manager** (Android Virtual Device Manager)
3. **Создайте или запустите эмулятор**
4. **Проверьте подключение:**
   ```bash
   adb devices
   ```
   Должна быть строка с `device` (не `offline` или `unauthorized`)

5. **Запустите приложение в эмуляторе:**
   ```bash
   cd /Users/s.devyatov/DeDato/mobile
   npx expo start
   ```
   Затем нажмите `a` для Android

6. **Запустите тесты:**
   ```bash
   npm run test:e2e
   ```

### Вариант 2: iOS симулятор

1. **Запустите iOS симулятор:**
   ```bash
   open -a Simulator
   ```
   Или через Xcode: Xcode → Open Developer Tool → Simulator

2. **Выберите устройство** (например, iPhone 15)

3. **Проверьте подключение:**
   ```bash
   xcrun simctl list devices | grep Booted
   ```

4. **Проверьте API_URL в `.env`:**
   Для iOS симулятора должен быть:
   ```
   API_URL=http://localhost:8001
   ```

5. **Запустите приложение в симуляторе:**
   ```bash
   cd /Users/s.devyatov/DeDato/mobile
   npx expo start --go
   ```
   Затем нажмите `i` для iOS

5. **Запустите тесты:**
   ```bash
   npm run test:e2e
   ```

### Вариант 3: Физическое устройство

#### Android:
1. **Включите режим разработчика** на устройстве
2. **Включите USB отладку**
3. **Подключите устройство через USB**
4. **Проверьте подключение:**
   ```bash
   adb devices
   ```
5. **Запустите приложение** через Expo
6. **Запустите тесты**

#### iOS:
1. **Подключите iPhone/iPad через USB**
2. **Доверьтесь компьютеру** на устройстве
3. **Запустите приложение** через Expo
4. **Запустите тесты**

## Проверка подключения

### Android:
```bash
adb devices
```
Должно показать что-то вроде:
```
List of devices attached
emulator-5554    device
```

### iOS:
```bash
xcrun simctl list devices | grep Booted
```
Или:
```bash
instruments -s devices
```

## Важно

1. **Устройство должно быть запущено ДО запуска тестов**
2. **Приложение должно быть установлено и запущено на устройстве**
3. **Для Expo Go**: убедитесь, что приложение открыто в Expo Go
4. **Для development build**: убедитесь, что приложение собрано и установлено

## Быстрый старт

1. Запустите эмулятор/симулятор
2. Запустите Expo: `npx expo start`
3. Откройте приложение на устройстве (нажмите `i` или `a`)
4. В другом терминале запустите тесты: `npm run test:e2e`

