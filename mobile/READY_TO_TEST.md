# Готовность к тестированию

## ✅ Проверка перед запуском тестов

### 1. Backend API запущен на порту 8001
```bash
lsof -ti:8001
```
Должен показать процесс ID.

### 2. .env файл настроен правильно
```bash
cd /Users/s.devyatov/DeDato/mobile
cat .env | grep "^API_URL"
```
Должно быть: `API_URL=http://10.0.2.2:8001` (для Android эмулятора)

### 3. Expo dev server запущен
```bash
cd /Users/s.devyatov/DeDato/mobile
npx expo start
```
Должен показать QR-код и порт (8081 или 8082).

### 4. Приложение открыто на эмуляторе/симуляторе
- Android: нажмите `a` в терминале Expo
- iOS: нажмите `i` в терминале Expo
- Или откройте вручную через Expo Go

### 5. Maestro установлен и доступен
```bash
export PATH="/opt/homebrew/opt/openjdk@17/bin:$PATH"
export PATH="$PATH":"$HOME/.maestro/bin"
maestro --version
```

## 🚀 Запуск тестов

### Шаг 1: Убедитесь что приложение запущено

Приложение должно быть видимо на экране эмулятора/симулятора и работать (не показывать ошибки подключения).

### Шаг 2: Запустите тесты

В **новом терминале** (не в том, где запущен Expo):

```bash
cd /Users/s.devyatov/DeDato/mobile
export PATH="/opt/homebrew/opt/openjdk@17/bin:$PATH"
export PATH="$PATH":"$HOME/.maestro/bin"
npm run test:e2e
```

Или конкретный тест:

```bash
maestro test .maestro/flows/01-login-success.yaml
```

## 📋 Доступные тесты

1. `01-login-success.yaml` - Успешный вход
2. `02-login-error.yaml` - Ошибка входа  
3. `03-navigate-to-bookings.yaml` - Переход в бронирования
4. `04-open-booking-details.yaml` - Открытие деталей бронирования
5. `05-logout.yaml` - Выход из аккаунта

## ⚠️ Важно

- **Приложение должно быть запущено** перед запуском тестов
- **Экран устройства должен быть разблокирован**
- **Backend должен быть доступен** на порту 8001
- **Для теста логина** нужен пользователь с телефоном `+79991234567` и паролем `password123` (или измените данные в тесте)

## 🔧 Если что-то не работает

1. Проверьте логи в терминале Expo - там могут быть ошибки
2. Проверьте что backend отвечает: `curl http://localhost:8001/docs`
3. Проверьте что приложение может подключиться к backend (попробуйте залогиниться вручную)
4. Убедитесь что эмулятор/симулятор запущен и видим Maestro

