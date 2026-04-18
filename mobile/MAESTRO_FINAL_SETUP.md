# Финальная настройка Maestro

## ✅ Java установлена

Java успешно установлена через Homebrew. Теперь нужно настроить PATH.

## Шаг 1: Обновить PATH в текущем терминале

Выполните в текущем терминале:

```bash
export PATH="/opt/homebrew/opt/openjdk@17/bin:$PATH"
export PATH="$PATH":"$HOME/.maestro/bin"
```

## Шаг 2: Проверить установку

```bash
java -version
maestro --version
```

Оба должны работать без ошибок.

## Шаг 3: Постоянная настройка PATH (опционально)

Чтобы PATH обновлялся автоматически в новых терминалах, добавьте в `~/.zshrc`:

```bash
echo 'export PATH="/opt/homebrew/opt/openjdk@17/bin:$PATH"' >> ~/.zshrc
echo 'export PATH="$PATH":"$HOME/.maestro/bin"' >> ~/.zshrc
source ~/.zshrc
```

## Шаг 4: Запуск тестов

После проверки установки можно запускать тесты:

### 1. Запустите приложение (в первом терминале):

```bash
cd /Users/s.devyatov/DeDato/mobile
npx expo start
```

Затем нажмите `i` для iOS или `a` для Android.

### 2. Запустите тесты (во втором терминале):

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

## Готово! 🎉

Теперь все должно работать. Если возникнут проблемы, проверьте:
1. Java установлена: `java -version`
2. Maestro доступен: `maestro --version`
3. Приложение запущено на эмуляторе/устройстве

