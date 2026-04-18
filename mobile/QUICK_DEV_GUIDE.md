# 🚀 Быстрая разработка без EAS Build

## Проблема
EAS Build может занимать 2+ часа в очереди, что замедляет разработку.

## ✅ Решение: Expo Go (самый быстрый способ)

**Expo Go** — это готовое приложение из Google Play / App Store, которое позволяет запускать ваш код без сборки.

### Преимущества:
- ⚡ Мгновенный запуск (секунды вместо часов)
- 🔄 Hot Reload — изменения видны сразу
- 📱 Работает на реальном устройстве
- 🆓 Бесплатно

### Ограничения:
- ⚠️ `expo-secure-store` не работает в Expo Go (нужен custom dev client)
- ✅ Но можно временно использовать только `AsyncStorage`

---

## 🎯 Вариант 1: Expo Go (рекомендуется для быстрой разработки)

### Шаг 1: Установи Expo Go на телефон

- **Android**: [Google Play - Expo Go](https://play.google.com/store/apps/details?id=host.exp.exponent)
- **iOS**: [App Store - Expo Go](https://apps.apple.com/app/expo-go/id982107779)

### Шаг 2: Временно отключи expo-secure-store

В `mobile/src/auth/AuthContext.tsx` временно закомментируй использование SecureStore:

```typescript
// Временно для Expo Go - используем только AsyncStorage
// import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';

// В функции loadStoredAuth:
// let storedToken = await SecureStore.getItemAsync(TOKEN_KEY);
let storedToken = await AsyncStorage.getItem(TOKEN_KEY);

// В функции saveToken:
// await SecureStore.setItemAsync(TOKEN_KEY, newToken);
await AsyncStorage.setItem(TOKEN_KEY, newToken);

// В функции clearAuth:
// await SecureStore.deleteItemAsync(TOKEN_KEY);
await AsyncStorage.removeItem(TOKEN_KEY);
```

Аналогично в `mobile/src/services/api/client.ts` — убери импорт SecureStore.

### Шаг 3: Запусти Metro bundler

```bash
cd mobile
npm start
```

### Шаг 4: Подключи телефон

**Вариант A: QR-код (самый простой)**
1. Открой Expo Go на телефоне
2. Отсканируй QR-код из терминала
3. Приложение загрузится за несколько секунд

**Вариант B: По сети (если QR не работает)**
1. Убедись, что телефон и компьютер в одной Wi-Fi сети
2. В Expo Go нажми "Enter URL manually"
3. Введи: `exp://192.168.0.194:8081` (замени на IP из `npm start`)

**Вариант C: Tunnel (если сети разные)**
```bash
npm start -- --tunnel
```
Это создаст публичный URL через Expo сервис.

### Шаг 5: Разработка

- Изменяй код → изменения применяются автоматически (Fast Refresh)
- Перезапуск: встряхни телефон → меню → "Reload"

---

## 🎯 Вариант 2: Локальная сборка Development Build (если нужен SecureStore)

Если обязательно нужен `expo-secure-store`, можно собрать development build локально (быстрее чем EAS, но требует Android Studio).

### Требования:
- Android Studio установлен
- Android SDK настроен
- USB Debugging включен на телефоне

### Команды:

```bash
cd mobile

# Собрать development build локально для Android
npx expo run:android

# Или для iOS (требует macOS + Xcode)
npx expo run:ios
```

**Время сборки:** 5-15 минут (вместо 2+ часов в EAS)

После первой сборки последующие запуски будут быстрее благодаря кэшу.

---

## 🎯 Вариант 3: Android эмулятор (если нет телефона)

### Установка Android Studio:

1. Скачай [Android Studio](https://developer.android.com/studio)
2. Установи Android SDK (через Android Studio)
3. Создай виртуальное устройство (AVD)

### Запуск:

```bash
cd mobile

# Запусти эмулятор (или открой его вручную из Android Studio)
# Затем:
npm start
npm run android
```

---

## 📊 Сравнение методов

| Метод | Скорость | SecureStore | Сложность | Рекомендация |
|-------|----------|-------------|-----------|--------------|
| **Expo Go** | ⚡⚡⚡ Мгновенно | ❌ Нет | ✅ Очень просто | **Для быстрой разработки** |
| **Локальная сборка** | ⚡⚡ 5-15 мин | ✅ Да | ⚠️ Средне | Для тестирования нативных модулей |
| **EAS Build** | ⚡ 2+ часа | ✅ Да | ✅ Просто | Для финальных сборок |

---

## 🔄 Переключение между методами

### Для быстрой разработки (Expo Go):
1. Используй только AsyncStorage
2. Запускай через `npm start`
3. Подключайся через Expo Go

### Для тестирования SecureStore:
1. Верни SecureStore в код
2. Собери локально: `npx expo run:android`
3. Или используй EAS Build (если готов ждать)

---

## 💡 Советы для быстрой разработки

1. **Используй Expo Go для UI/логики** — изменения видны мгновенно
2. **Тестируй нативные модули локально** — только когда нужно
3. **EAS Build используй для финальных сборок** — когда всё готово

---

## 🐛 Troubleshooting

### "Unable to connect to Metro"
- Проверь, что телефон и компьютер в одной Wi-Fi сети
- Используй `--tunnel` режим: `npm start -- --tunnel`

### "Module not found" в Expo Go
- Некоторые нативные модули не работают в Expo Go
- Используй локальную сборку или EAS Build

### Изменения не применяются
- Встряхни телефон → "Reload"
- Или перезапусти Metro: `npm start`

