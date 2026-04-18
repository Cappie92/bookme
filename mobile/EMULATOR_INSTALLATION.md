# Установка эмуляторов на macOS

## iOS Simulator (встроен в Xcode)

### Шаг 1: Установить Xcode

1. **Откройте App Store** на Mac
2. **Найдите "Xcode"**
3. **Нажмите "Получить" или "Установить"**
4. **Дождитесь установки** (это большой файл, ~10-15 GB, может занять время)

### Шаг 2: Установить Command Line Tools

После установки Xcode:

```bash
xcode-select --install
```

Если появится диалог - нажмите "Установить".

### Шаг 3: Принять лицензию Xcode

```bash
sudo xcodebuild -license accept
```

### Шаг 4: Запустить симулятор

```bash
open -a Simulator
```

Или через Xcode: Xcode → Open Developer Tool → Simulator

### Шаг 5: Выбрать устройство

В симуляторе: File → Open Simulator → выберите iPhone (например, iPhone 15)

## Android эмулятор (через Android Studio)

### Шаг 1: Установить Android Studio

1. **Перейдите на https://developer.android.com/studio**
2. **Скачайте Android Studio для Mac**
3. **Установите** (перетащите в Applications)

### Шаг 2: Запустить Android Studio

1. **Откройте Android Studio**
2. **Пройдите setup wizard** (первый запуск)
3. **Установите Android SDK** (будет предложено автоматически)

### Шаг 3: Создать виртуальное устройство (AVD)

1. **В Android Studio:** Tools → Device Manager
2. **Нажмите "Create Device"**
3. **Выберите устройство** (например, Pixel 5)
4. **Выберите системный образ** (например, Android 13)
5. **Нажмите "Finish"**

### Шаг 4: Запустить эмулятор

1. **В Device Manager** нажмите ▶️ (Play) рядом с устройством
2. **Или через командную строку:**
   ```bash
   emulator -avd <имя_устройства>
   ```

## Проверка установки

### iOS Simulator:
```bash
xcrun simctl list devices
```
Должен показать список доступных устройств.

### Android эмулятор:
```bash
adb devices
```
Должен показать список подключенных устройств (после запуска эмулятора).

## Рекомендация

Для начала можно установить только **iOS Simulator** (через Xcode) - он проще в установке и работает быстрее на Mac.

Android Studio можно установить позже, если понадобится тестировать на Android.

## После установки

### Для iOS:
```bash
cd /Users/s.devyatov/DeDato/mobile
npx expo start --tunnel --clear
# Нажмите 'i' в терминале
```

### Для Android:
```bash
cd /Users/s.devyatov/DeDato/mobile
npx expo start --tunnel --clear
# Нажмите 'a' в терминале
```

## Размер установки

- **Xcode:** ~10-15 GB
- **Android Studio:** ~5-10 GB (включая SDK и эмулятор)

Убедитесь что есть достаточно места на диске.

