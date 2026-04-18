# Проблема: expo-dev-client конфликтует с Expo Go

## Проблема

В `package.json` установлен `expo-dev-client`, но вы пытаетесь использовать Expo Go. Это может вызывать конфликты.

## Решение 1: Использовать эмулятор (рекомендуется для тестирования)

Для Maestro тестов лучше использовать эмулятор - он работает надежнее:

### Android эмулятор:
```bash
cd /Users/s.devyatov/DeDato/mobile
npx expo start --tunnel --clear
# Нажмите 'a' в терминале
```

### iOS симулятор:
```bash
cd /Users/s.devyatov/DeDato/mobile
npx expo start --tunnel --clear
# Нажмите 'i' в терминале
```

Эмуляторы:
- ✅ Не требуют Expo Go
- ✅ Работают напрямую с Metro
- ✅ Всегда доступны для Maestro
- ✅ Не зависят от туннеля/сети

## Решение 2: Временно убрать expo-dev-client для Expo Go

Если нужно использовать Expo Go:

1. **Временно закомментируйте expo-dev-client в package.json:**
   ```json
   // "expo-dev-client": "^6.0.20",
   ```

2. **Переустановите зависимости:**
   ```bash
   npm install
   ```

3. **Запустите Expo:**
   ```bash
   npx expo start --tunnel --clear
   ```

4. **После тестирования верните expo-dev-client обратно**

## Решение 3: Использовать Development Build

Если expo-dev-client установлен, лучше использовать development build:

```bash
cd /Users/s.devyatov/DeDato/mobile
npx expo run:android
# или
npx expo run:ios
```

Это создаст standalone приложение с вашей конфигурацией.

## Рекомендация для Maestro

Для E2E тестов с Maestro **лучше использовать эмулятор/симулятор**:
- Не требует Expo Go
- Работает надежнее
- Всегда доступен
- Быстрее для тестирования

