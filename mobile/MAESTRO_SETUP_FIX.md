# Исправление проблемы с Maestro

## Проблема: команда maestro не найдена

После установки Maestro нужно обновить PATH в текущем терминале.

### Решение 1: Обновить PATH в текущем терминале

Выполните в текущем терминале:

```bash
export PATH="$PATH":"$HOME/.maestro/bin"
```

Затем проверьте:

```bash
maestro --version
```

### Решение 2: Открыть новый терминал

Просто закройте и откройте новый терминал - PATH обновится автоматически.

## Проблема: Maestro требует Java

Maestro требует установленную Java Runtime Environment (JRE).

### Установка Java на macOS

#### Вариант 1: Через Homebrew (рекомендуется)

```bash
brew install openjdk@17
```

Или для последней версии:

```bash
brew install openjdk
```

#### Вариант 2: Скачать с официального сайта

1. Перейдите на https://adoptium.net/
2. Скачайте OpenJDK для macOS
3. Установите пакет

#### Вариант 3: Использовать встроенный Java (если есть)

Проверьте наличие Java:

```bash
java -version
```

Если Java установлена, но Maestro её не видит, добавьте в `~/.zshrc`:

```bash
export JAVA_HOME=$(/usr/libexec/java_home)
```

Затем:

```bash
source ~/.zshrc
```

## Полная последовательность установки

1. **Установить Java** (если еще не установлена):
   ```bash
   brew install openjdk@17
   ```

2. **Обновить PATH в текущем терминале**:
   ```bash
   export PATH="$PATH":"$HOME/.maestro/bin"
   ```

3. **Проверить установку Maestro**:
   ```bash
   maestro --version
   ```

4. **Проверить Java**:
   ```bash
   java -version
   ```

## После установки

Теперь можно запускать тесты:

```bash
cd /Users/s.devyatov/DeDato/mobile
npm run test:e2e
```

## Постоянное решение

Чтобы PATH обновлялся автоматически в новых терминалах, добавьте в `~/.zshrc`:

```bash
export PATH="$PATH":"$HOME/.maestro/bin"
```

Затем выполните:

```bash
source ~/.zshrc
```

