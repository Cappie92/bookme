# 🔧 Исправление проблемы с Expo Go

## Проблема

После удаления APK приложение не запускается через Expo Go, Metro bundler выдает ошибку "No apps connected".

## Причина

В `package.json` установлен `expo-dev-client`, который автоматически переключает Expo на режим **development build** вместо **Expo Go**.

---

## ✅ Решение

### Вариант 1: Запуск с явным флагом --go (рекомендуется)

**Останови текущий Metro bundler** (Ctrl+C) и запусти:

```bash
cd mobile
npm run start:go
```

Или напрямую:

```bash
cd mobile
npx expo start --go
```

Флаг `--go` принудительно запускает в режиме Expo Go, игнорируя `expo-dev-client`.

---

### Вариант 2: Временно убрать expo-dev-client

Если вариант 1 не работает:

1. **Останови Metro bundler** (Ctrl+C)

2. **Временно закомментируй expo-dev-client в package.json:**

```json
"dependencies": {
  // "expo-dev-client": "~6.0.20",  // Временно отключено для Expo Go
  ...
}
```

3. **Удали из node_modules:**

```bash
cd mobile
rm -rf node_modules/expo-dev-client
npm install
```

4. **Запусти заново:**

```bash
npm start
```

5. **После отладки верни expo-dev-client обратно** (раскомментируй в package.json и выполни `npm install`)

---

## 🔄 Пошаговая инструкция

### 1. Останови текущий Metro bundler

В консоли Metro bundler нажми: **Ctrl+C**

### 2. Запусти с флагом --go

```bash
cd mobile
npm run start:go
```

### 3. Отсканируй QR код в Expo Go

- Открой приложение **Expo Go** на телефоне
- Нажми "Scan QR code"
- Отсканируй QR код из консоли

### 4. Проверь, что приложение запустилось

В консоли Metro bundler должно появиться:
```
› Using Expo Go
```

А не:
```
› Using development build
```

---

## ⚠️ Важно

1. **Используй Expo Go** для быстрой разработки (не требует сборки)
2. **Development build** нужен только если используешь нативные модули, которые не работают в Expo Go
3. **Для нашего приложения Expo Go достаточно** — все используемые модули поддерживаются

---

## 🐛 Если всё равно не работает

### Проверь, что Expo Go установлен

- **Android**: [Google Play - Expo Go](https://play.google.com/store/apps/details?id=host.exp.exponent)
- **iOS**: [App Store - Expo Go](https://apps.apple.com/app/expo-go/id982107779)

### Очисти кэш

```bash
cd mobile
npx expo start --clear
```

### Перезапусти Metro bundler

```bash
cd mobile
# Останови текущий (Ctrl+C)
npm run start:go
```

---

## 📝 Резюме

**Используй команду:**
```bash
npm run start:go
```

Это принудительно запустит Expo в режиме Expo Go, даже если установлен `expo-dev-client`.

