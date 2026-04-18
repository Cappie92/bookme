# Client Dashboard Mobile - Быстрый старт

## 1. Установка зависимостей (один раз)

```bash
cd mobile
npm install zustand
```

## 2. Настройка API_URL

Отредактируйте `mobile/src/config/env.ts`:

```typescript
// iOS Simulator
export const env = {
  API_URL: 'http://localhost:8000',
}

// Android Emulator
export const env = {
  API_URL: 'http://10.0.2.2:8000',
}

// Реальное устройство (замените X.X на ваш LAN IP)
export const env = {
  API_URL: 'http://192.168.X.X:8000',
}
```

**Узнать LAN IP:**
```bash
# macOS/Linux
ifconfig | grep "inet " | grep -v 127.0.0.1

# Windows
ipconfig | findstr IPv4
```

## 3. Запуск backend

```bash
cd backend
ENVIRONMENT=development ENABLE_DEV_TESTDATA=1 uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

**Важно:** `--host 0.0.0.0` нужен для доступа с реального устройства.

## 4. Создание тестовых данных

```bash
python3 backend/scripts/reseed_local_test_data.py --base-url http://localhost:8000
```

## 5. Запуск приложения

### iOS Simulator (macOS only)
```bash
cd mobile
npm start

# В другом терминале:
npm run ios
```

### Android Emulator
```bash
cd mobile
npm run android
```

### Реальное устройство (Expo Go)
```bash
cd mobile
npm start
# Отсканируйте QR-код в Expo Go
```

## 6. Логин

- **Телефон:** `+79990000101`
- **Пароль:** `test123`

## 7. Навигация

После логина перейдите на:
```
/client/dashboard
```

## 8. Проверка

- ✅ Видны 4 секции: Будущие, Прошедшие, Избранные, Мои баллы
- ✅ Toggle сердечка в одной секции → обновляется в других
- ✅ "Посмотреть все" открывает полные списки
- ✅ "История" в "Мои баллы" открывает транзакции

## Troubleshooting

### Network Error
```bash
# Проверьте backend
curl http://localhost:8000/api/health

# Проверьте API_URL в mobile/src/config/env.ts
```

### Cannot find module 'zustand'
```bash
cd mobile
npm install zustand
```

### Favorites не синхронизируются
Проверьте логи в консоли:
```
[Favorites] Ошибка загрузки мастеров: ...
[getMasterKey] Invalid master ID: ...
```

## Структура файлов

```
mobile/
├── src/
│   ├── stores/favoritesStore.ts          # Zustand store
│   ├── utils/clientDashboard.ts          # Форматирование дат
│   ├── services/api/clientDashboard.ts   # API методы
│   └── components/client/                # UI компоненты
│       ├── FavoriteButtonControlled.tsx
│       ├── SectionCard.tsx
│       ├── BookingRowFuture.tsx
│       ├── BookingRowPast.tsx
│       └── FavoriteCard.tsx
└── app/client/
    ├── _layout.tsx                       # Layout
    ├── dashboard.tsx                     # Главный экран
    ├── bookings-future.tsx               # Все будущие
    ├── bookings-past.tsx                 # Все прошедшие
    ├── loyalty-points.tsx                # Все баллы
    └── loyalty-history.tsx               # История транзакций
```

## Полная документация

См. `mobile/CLIENT_DASHBOARD_SETUP.md` и `docs/CLIENT_DASHBOARD_MOBILE_IMPLEMENTATION.md`
