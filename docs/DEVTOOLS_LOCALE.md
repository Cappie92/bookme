# DevTools и локаль (ENOENT ru.json)

При запуске DevTools (в т.ч. по нажатию **j** в терминале Metro) может возникать ошибка:

```
ENOENT .../debugger-frontend/.../locales/ru.json
```

Это из-за отсутствия русской локали в пакете `@react-native/debugger-frontend`.

## Что сделано

- В **mobile/package.json** скрипт `npm run start` (и `yarn start`) запускает Metro с `LANG=en_US.UTF-8`, чтобы при открытии DevTools использовалась английская локаль (macOS/Linux).
- Если запускаете Metro вручную, на Unix можно: `LANG=en_US.UTF-8 npx expo start -c`.
- Не нажимайте **j** в консоли Metro, если не нужен инспектор — тогда DevTools не запускаются и ENOENT не возникает.

## Windows

На Windows переменная `LANG` может не подхватиться. Перед запуском можно выполнить:

```cmd
set LANG=en
npx expo start -c
```

Либо не открывать DevTools по **j**, если ENOENT мешает.
