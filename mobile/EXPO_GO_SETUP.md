# ⚡ Быстрый запуск через Expo Go

## Проблема с EAS Build
Очередь на сборку занимает 2+ часа — это слишком медленно для разработки.

## ✅ Решение: Expo Go (мгновенный запуск)

### Что такое Expo Go?
Готовое приложение из Google Play/App Store, которое запускает ваш код без сборки.

**Время запуска:** секунды вместо часов ⚡

---

## 🚀 Быстрый старт (3 шага)

### 1. Установи Expo Go на телефон

- **Android**: [Скачать из Google Play](https://play.google.com/store/apps/details?id=host.exp.exponent)
- **iOS**: [Скачать из App Store](https://apps.apple.com/app/expo-go/id982107779)

### 2. Временно отключи SecureStore (для Expo Go)

**Проблема:** `expo-secure-store` не работает в Expo Go.

**Решение:** Временно используй только AsyncStorage.

#### Изменения в `mobile/src/auth/AuthContext.tsx`:

Закомментируй импорт SecureStore и используй только AsyncStorage:

```typescript
// Временно для Expo Go - закомментируй SecureStore
// import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';

// В loadStoredAuth:
// let storedToken = await SecureStore.getItemAsync(TOKEN_KEY);
let storedToken = await AsyncStorage.getItem(TOKEN_KEY);

// В saveToken:
// await SecureStore.setItemAsync(TOKEN_KEY, newToken);
await AsyncStorage.setItem(TOKEN_KEY, newToken);

// В clearAuth:
// await SecureStore.deleteItemAsync(TOKEN_KEY);
await AsyncStorage.removeItem(TOKEN_KEY);
```

#### Изменения в `mobile/src/services/api/client.ts`:

Закомментируй использование SecureStore:

```typescript
// В request interceptor:
// const { getItemAsync } = await import('expo-secure-store');
// let token = await getItemAsync('access_token');
const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
let token = await AsyncStorage.getItem('access_token');
```

### 3. Запусти приложение

```bash
cd mobile
npm start
```

**Затем:**
1. Открой Expo Go на телефоне
2. Отсканируй QR-код из терминала
3. Приложение загрузится за несколько секунд! 🎉

---

## 📱 Подключение телефона

### Вариант A: QR-код (рекомендуется)
1. В терминале появится QR-код
2. Открой Expo Go → "Scan QR code"
3. Отсканируй код

### Вариант B: По сети (если QR не работает)
1. Убедись, что телефон и компьютер в одной Wi-Fi сети
2. В Expo Go: "Enter URL manually"
3. Введи URL из терминала (например: `exp://192.168.0.194:8081`)

### Вариант C: Tunnel (если сети разные)
```bash
npm start -- --tunnel
```
Создаст публичный URL через Expo сервис.

---

## 🔄 Hot Reload

После подключения:
- Изменяй код → изменения применяются автоматически
- Перезагрузка: встряхни телефон → меню → "Reload"

---

## ⚠️ Важно

1. **SecureStore не работает в Expo Go** — используй только AsyncStorage для быстрой разработки
2. **Для production** — верни SecureStore и собери через EAS Build
3. **API_URL** — убедись, что в `.env` указан правильный IP: `http://192.168.0.194:8001`

---

## 🎯 Альтернатива: Локальная сборка (если нужен SecureStore)

Если обязательно нужен SecureStore, можно собрать локально:

```bash
cd mobile
npx expo run:android
```

**Требования:**
- Android Studio установлен
- Android SDK настроен
- USB Debugging включен на телефоне

**Время:** 5-15 минут (вместо 2+ часов в EAS)

---

## 📊 Сравнение

| Метод | Время | SecureStore | Сложность |
|-------|-------|-------------|-----------|
| **Expo Go** | ⚡ Секунды | ❌ Нет | ✅ Очень просто |
| **Локальная сборка** | ⚡⚡ 5-15 мин | ✅ Да | ⚠️ Средне |
| **EAS Build** | ⚡ 2+ часа | ✅ Да | ✅ Просто |

**Рекомендация:** Используй Expo Go для разработки, EAS Build — для финальных сборок.

