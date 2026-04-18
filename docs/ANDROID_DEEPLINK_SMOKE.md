# Android Deeplink — smoke (3 команды)

Краткая проверка deeplink `dedato://m/<slug>` на Android (эмулятор или устройство). Package из `mobile/app.config.ts`: **ru.dedato.mobile** (dev build). Для Expo Go package другой (host.exp.exponent и т.п.), при необходимости подставьте свой.

Серийник устройства/эмулятора можно не указывать, если подключено одно: `adb shell ...`. Если несколько — используйте `adb -s <serial> shell ...`.

---

## 1. Проверка пакета

Убедиться, что приложение установлено и узнать точный package:

```bash
adb shell pm list packages | grep -i dedato
```

Ожидаемо: `package:ru.dedato.mobile`.

---

## 2. Cold start deeplink

Приложение закрыто; открыть по deeplink (должен открыться экран public booking `/m/<slug>`):

```bash
adb shell am force-stop ru.dedato.mobile
adb shell am start -W -S -a android.intent.action.VIEW -d "dedato://m/m-TK5E3n9R" ru.dedato.mobile
```

- `-S` — не восстанавливать задачу, холодный старт.
- Ожидание: приложение открывается на экране записи к мастеру, не на логине и не белый экран.

---

## 3. Warm deeplink

Приложение уже запущено; отправить deeplink (должна произойти навигация на `/m/<slug>`):

```bash
adb shell am start -W -a android.intent.action.VIEW -d "dedato://m/m-TK5E3n9R" ru.dedato.mobile
```

Без `force-stop` и без `-S`. Ожидание: приложение выходит на передний план и показывает экран public booking.

---

## Запуск Metro + проверка

1. В корне проекта: `cd mobile && npx expo start -c`.
2. Запустить приложение на Android (Expo Go или dev build).
3. Выполнить команды из п. 2 и 3 (при необходимости замените `ru.dedato.mobile` на package из п. 1).
