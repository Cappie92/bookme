# Maestro E2E Tests для DeDato Mobile

## App ID

Все flow файлы используют `appId: host.exp.Exponent` для Expo приложений.

Если вы используете development build или standalone build, измените `appId` в каждом flow файле на ваш bundle identifier:
- iOS: `com.yourcompany.dedato`
- Android: `com.yourcompany.dedato`

## Запуск тестов

### Все тесты
```bash
cd /Users/s.devyatov/DeDato/mobile
npm run test:e2e
```

### Конкретный тест
```bash
maestro test .maestro/flows/01-login-success.yaml
```

## Требования

1. Приложение должно быть запущено на эмуляторе/устройстве
2. Java должна быть установлена
3. Maestro должен быть установлен и доступен в PATH

## Troubleshooting

Если тесты не находят приложение, проверьте appId:
- Для Expo Go: `host.exp.Exponent`
- Для development build: ваш bundle identifier из `app.json`
