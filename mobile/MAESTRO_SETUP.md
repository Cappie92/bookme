# Настройка Maestro E2E тестов

## Что было сделано

✅ Настроена минимальная конфигурация Maestro
✅ Добавлены 5 E2E тестов:
  1. **01-login-success.yaml** - Успешный вход
  2. **02-login-error.yaml** - Ошибка входа
  3. **03-navigate-to-bookings.yaml** - Переход в бронирования
  4. **04-open-booking-details.yaml** - Открытие деталей бронирования
  5. **05-logout.yaml** - Выход из аккаунта

✅ Добавлены testID к ключевым элементам:
  - `login-tab`, `register-tab`
  - `phone-input`, `password-input`
  - `login-button`, `register-button`
  - `role-client`, `role-master`
  - `full-name-input`, `email-input`, `register-phone-input`
  - `register-password-input`, `confirm-password-input`
  - `agreement-checkbox`
  - `home-screen`
  - `all-bookings-button`, `my-bookings-button`
  - `bookings-screen`, `bookings-list`
  - `booking-item-{id}`
  - `booking-detail-screen`
  - `edit-time-button`, `cancel-booking-button`
  - `bottom-nav-{id}` (profile, notes, settings)
  - `logout-button`

## Установка Maestro

### macOS
```bash
curl -Ls "https://get.maestro.mobile.dev" | bash
```

### Linux
```bash
curl -Ls "https://get.maestro.mobile.dev" | bash
```

### Windows
Скачайте установщик с https://maestro.mobile.dev/

Проверка установки:
```bash
maestro --version
```

## Подготовка к запуску тестов

### 1. Запустите приложение

Для Expo:
```bash
cd mobile
npx expo start
```

Затем:
- Нажмите `i` для iOS симулятора
- Нажмите `a` для Android эмулятора
- Или отсканируйте QR-код на физическом устройстве

### 2. Определите App ID

Для Expo приложения используйте:
- **iOS**: Bundle identifier из `app.json` (если указан) или `host.exp.Exponent`
- **Android**: Package name из `app.json` или `host.exp.exponent`

Или используйте команду Maestro для определения:
```bash
maestro test .maestro/flows/01-login-success.yaml
```

Maestro автоматически определит appId, если приложение запущено.

## Запуск тестов

### Запуск всех тестов
```bash
cd mobile
npm run test:e2e
```

### Запуск конкретного теста
```bash
maestro test .maestro/flows/01-login-success.yaml
```

### Запуск на iOS
```bash
maestro test .maestro/flows/ --env APP_ID=host.exp.Exponent
```

### Запуск на Android
```bash
maestro test .maestro/flows/ --env APP_ID=host.exp.exponent
```

## Структура тестов

```
.maestro/
├── config.yaml          # Конфигурация Maestro
├── flows/
│   ├── 01-login-success.yaml
│   ├── 02-login-error.yaml
│   ├── 03-navigate-to-bookings.yaml
│   ├── 04-open-booking-details.yaml
│   └── 05-logout.yaml
└── README.md            # Документация
```

## Настройка тестовых данных

Перед запуском тестов убедитесь, что:

1. **Для теста логина (01-login-success.yaml)**:
   - Существует пользователь с телефоном `+79991234567` и паролем `password123`
   - Или измените данные в файле теста

2. **Для теста ошибки (02-login-error.yaml)**:
   - Используется неверный пароль (тест должен показать ошибку)

3. **Для тестов бронирований**:
   - У тестового пользователя есть хотя бы одно будущее бронирование

## Отладка тестов

Если тесты не проходят:

1. Проверьте, что приложение запущено и видимо на экране
2. Убедитесь, что все testID правильно указаны в компонентах
3. Используйте команду для просмотра UI дерева:
   ```bash
   maestro studio
   ```
4. Проверьте логи:
   ```bash
   maestro test .maestro/flows/01-login-success.yaml --debug
   ```

## Дополнительные команды

### Просмотр UI дерева
```bash
maestro studio
```

### Запись нового теста
```bash
maestro record
```

### Запуск с видео
```bash
maestro test .maestro/flows/ --video
```

## Следующие шаги

После успешного запуска базовых тестов можно добавить:
- Тесты регистрации
- Тесты редактирования профиля
- Тесты работы с избранным
- Тесты изменения времени бронирования
- Тесты отмены бронирования

