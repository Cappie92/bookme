# DeDato Mobile App

Мобильное приложение DeDato на базе Expo (React Native) с использованием Expo Router для навигации.

## 🚀 Быстрый старт

### Установка зависимостей

```bash
npm install
```

### Запуск приложения

```bash
# Запуск в режиме разработки
npm start

# Запуск на iOS
npm run ios

# Запуск на Android
npm run android

# Запуск в браузере (для тестирования)
npm run web
```

## 📁 Структура проекта

```
mobile/
├── app/                    # Экранные компоненты (Expo Router)
│   ├── _layout.tsx        # Корневой layout
│   ├── index.tsx          # Главный экран
│   ├── bookings/          # Раздел бронирований
│   ├── subscriptions/     # Раздел подписок
│   └── settings/          # Раздел настроек
│
├── src/
│   ├── components/        # Переиспользуемые компоненты
│   ├── hooks/             # Custom React Hooks
│   ├── services/
│   │   └── api/           # API клиенты
│   │       └── client.ts  # Базовый axios клиент
│   └── config/
│       └── env.ts         # Конфигурация окружения
│
├── .env                   # Переменные окружения
├── app.config.ts          # Конфигурация Expo
├── babel.config.js        # Конфигурация Babel (алиасы, dotenv)
└── tsconfig.json          # Конфигурация TypeScript
```

## 🧭 Expo Router

Приложение использует **Expo Router** для файловой маршрутизации. Структура папок в `app/` определяет маршруты приложения.

### Основные маршруты

- `/` - Главный экран (`app/index.tsx`)
- `/bookings` - Список бронирований (`app/bookings/index.tsx`)
- `/subscriptions` - Управление подписками (`app/subscriptions/index.tsx`)
- `/settings` - Настройки приложения (`app/settings/index.tsx`)

### Навигация

```typescript
import { router } from 'expo-router';

// Переход на другой экран
router.push('/bookings');
router.replace('/subscriptions');

// Возврат назад
router.back();
```

### Создание нового экрана

1. Создайте файл в папке `app/`, например `app/profile/index.tsx`
2. Экран автоматически станет доступен по маршруту `/profile`
3. Для вложенных маршрутов создайте `_layout.tsx` в папке

## 🔧 Конфигурация окружения (.env)

### Настройка переменных окружения

1. Откройте файл `.env` в корне проекта `mobile/`
2. Добавьте необходимые переменные:

```env
API_URL=https://api.dedato.com
```

### Использование в коде

```typescript
import { ENV } from '@src/config/env';

const apiUrl = ENV.API_URL;
```

**Debug-флаги (по умолчанию выключены):** в `.env` задаются `DEBUG_AUTH=0`, `DEBUG_HTTP=0` и др. Чтобы включить точечную диагностику (логин/логаут, сессия, маркер), установите в `.env` нужный флаг, например `DEBUG_AUTH=1`, и перезапустите Metro.

**Важно:** После изменения `.env` перезапустите Metro bundler (`npm start`).

## 🌐 API Клиент

Базовый API клиент находится в `src/services/api/client.ts` и использует axios.

### Использование

```typescript
import apiClient from '@src/services/api/client';

// GET запрос
const response = await apiClient.get('/api/subscriptions/my');
const data = response.data;

// POST запрос
const result = await apiClient.post('/api/bookings', {
  service_id: 1,
  date: '2024-01-01',
});
```

### Авторизация

Токен авторизации автоматически добавляется в заголовки запросов из хранилища (требует реализации).

### Обработка ошибок

Клиент автоматически обрабатывает:
- 401 Unauthorized (можно добавить логику обновления токена)
- Сетевые ошибки
- Ошибки сервера

## 📦 Алиасы импортов

Для удобства используются алиасы путей:

```typescript
// Вместо
import { ENV } from '../../../src/config/env';

// Используйте
import { ENV } from '@src/config/env';
```

Доступные алиасы:
- `@src/*` → `src/*`

## 🛠️ Разработка

### Добавление новых зависимостей

```bash
npm install <package-name>
```

### TypeScript

Проект использует TypeScript. Все новые файлы должны иметь расширение `.ts` или `.tsx`.

### Стилизация

Используйте `StyleSheet` из `react-native`:

```typescript
import { StyleSheet } from 'react-native';

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
  },
});
```

## 📱 Сборка и запуск на устройстве

### Установка зависимостей

```bash
cd mobile
npm install
```

### Запуск в dev-режиме

```bash
# Запуск Metro bundler
npm start

# Запуск на iOS симуляторе
npm run ios

# Запуск на Android эмуляторе
npm run android
```

## 🏗️ Сборка через EAS (Expo Application Services)

### Подготовка

**Важно:** Перед первой сборкой необходимо:

1. **Авторизоваться в Expo** (выполняется локально на машине разработчика):
   ```bash
   npx eas login
   ```
   Это создаст аккаунт или войдёт в существующий аккаунт Expo.

2. **Инициализировать проект EAS** (если ещё не сделано):
   ```bash
   npx eas init
   ```

### Профили сборки

В проекте настроены три профиля сборки (см. `eas.json`):

- **development** — для разработки с development client
- **preview** — для внутреннего тестирования
- **production** — для продакшн-сборок

### Команды сборки

```bash
cd mobile

# Development сборка для Android
npx eas build --profile development --platform android

# Development сборка для iOS
npx eas build --profile development --platform ios

# Production сборка для Android (APK)
npx eas build --profile production --platform android

# Production сборка для iOS
npx eas build --profile production --platform ios
```

### Отправка в сторы

После успешной сборки можно отправить приложение в App Store / Google Play:

```bash
# iOS App Store
npx eas submit --platform ios

# Google Play Store
npx eas submit --platform android
```

**Примечание:** Для отправки в сторы требуется настройка сертификатов и ключей доступа.

## 🔗 Полезные ссылки

- [Expo Documentation](https://docs.expo.dev/)
- [Expo Router Documentation](https://docs.expo.dev/router/introduction/)
- [React Native Documentation](https://reactnative.dev/)
- [TypeScript Documentation](https://www.typescriptlang.org/)

## 📋 Чеклист перед первой сборкой

**См. подробный чеклист:** [`BUILD_CHECKLIST.md`](./BUILD_CHECKLIST.md)

### Быстрая проверка:

1. ✅ **Идентификаторы** — замени `com.dedato.app` на реальные в `app.config.ts`
2. ✅ **Иконки** — проверь размеры файлов в `assets/` (все должны быть 1024×1024 или больше)
3. ✅ **API_URL** — настрой в `.env` для локального тестирования: `http://<IP_МАШИНЫ>:8000`

### Первая dev-сборка:

```bash
cd mobile
npx eas login
npx eas init
npx eas build --platform android --profile development
```

## 📝 TODO

### Функциональность
- [ ] Реализовать хранение токена авторизации (AsyncStorage)
- [ ] Добавить логику обновления токена при 401 ошибке
- [ ] Создать типы для API ответов
- [ ] Добавить обработку offline режима
- [ ] Настроить push-уведомления

### Конфигурация и сборка
- [ ] **Заменить `com.dedato.app` на реальные bundleIdentifier (iOS) и package name (Android)**
  - iOS: `app.config.ts` → `ios.bundleIdentifier`
  - Android: `app.config.ts` → `android.package`
- [ ] **Проверить иконки и splash-экраны**
  - Иконка приложения: `assets/icon.png` (1024x1024) ✅
  - Adaptive icon для Android: `assets/adaptive-icon.png` (1024x1024) ✅
  - Splash screen: `assets/splash-icon.png` (рекомендуется 2048x2048, сейчас 1024x1024)
  - Favicon для web: `assets/favicon.png` (48x48)
  - См. [Expo Asset Guidelines](https://docs.expo.dev/guides/app-icons/)

