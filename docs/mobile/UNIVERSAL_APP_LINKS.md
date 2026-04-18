# Universal Links и App Links (DeDato)

## Каноническая ссылка

- **Пользователю и copy-link:** `https://<WEB_URL host>/m/{slug}` (как и раньше).  
- **Custom scheme (внутренний / отладка):** `dedato://m/{slug}`.

## Поведение (целевое)

| Платформа | Приложение | Ожидание |
|-----------|------------|----------|
| Desktop | — | Веб `/m/:slug` |
| Mobile | Нет | Веб в браузере |
| Mobile | Да | Открытие приложения на экране `/m/{slug}` по тому же HTTPS URL |
| Любой | Да | `dedato://m/{slug}` → то же |

## Что сделано в репозитории

### Mobile (`mobile/`)

1. **`app.config.ts`**  
   - `ios.associatedDomains`: `applinks:<host>` для хостов из `APP_UNIVERSAL_LINK_HOSTS` или hostname из `WEB_URL`, иначе `dedato.ru`, `www.dedato.ru`.  
   - Android: `intentFilters` с `https` + `pathPrefix: /m` + **`autoVerify: true`**, плюс прежний `dedato://`.

2. **`app/_layout.tsx`**  
   - Cold и warm: парсинг через `parsePublicMasterSlugFromUrl` — поддерживаются `dedato://` и **доверенные** `https://` / (в dev) `http://`.

3. **`src/utils/parsePublicMasterDeepLink.ts`**  
   - Whitelist хостов: `WEB_URL` + `EXTRA_UNIVERSAL_LINK_HOSTS` + пара `dedato.ru` ↔ `www.dedato.ru`.  
   - В production **только https** для universal-style URL.

4. **`src/config/env.ts`** + **`env.d.ts`**  
   - Опционально: `EXTRA_UNIVERSAL_LINK_HOSTS` в `.env` (хосты через запятую).

### Server

- Шаблоны: `deploy/well-known/`  
- Nginx: см. `nginx-dedato.conf` — отдача `/.well-known` без прокси на Vite.

## Что подставить перед продом

| Параметр | Где |
|----------|-----|
| **Apple Team ID** | `deploy/well-known/apple-app-site-association` → `appIDs`: `TEAMID.com.dedato.app` |
| **Домен(ы)** | Должны совпадать с `WEB_URL` и со списком в нативной сборке (`APP_UNIVERSAL_LINK_HOSTS` / `WEB_URL` при EAS build) |
| **SHA-256 сертификата Android** | `deploy/well-known/assetlinks.json` (релизный keystore / Play App signing) |
| **Выкладка файлов** | HTTPS, без лишних редиректов, см. `deploy/well-known/README.md` |

## Переменные окружения

### Сборка (EAS / CI / shell)

- **`APP_UNIVERSAL_LINK_HOSTS`** — через запятую, например `staging.app.com,www.staging.app.com`.  
  Если не задано: берётся hostname из **`WEB_URL`**, иначе `dedato.ru,www.dedato.ru`.

### Runtime (`.env` приложения)

- **`WEB_URL`** — как раньше.  
- **`EXTRA_UNIVERSAL_LINK_HOSTS`** — если нужно доверять доп. хостам для парсинга ссылок в JS (например `www` при `WEB_URL` без www).

## Локальная проверка

- `npx uri-scheme open "dedato://m/testslug" --ios` (или Android) — custom scheme.  
- Парсинг HTTPS: в dev можно временно добавить хост в `EXTRA_UNIVERSAL_LINK_HOSTS` и открыть ссылку из Safari/Notes (на **реальном домене** с AASA — иначе ОС не отдаст приложению URL как universal link).

## Проверка на staging / prod

1. Выложить `apple-app-site-association` и `assetlinks.json`.  
2. Собрать **release** / **preview** клиент с тем же `bundleIdentifier` / `package` и верными associated domains.  
3. Установить APK/IPA, открыть `https://<domain>/m/<реальный slug>` из Mail / Telegram.  
4. Удалить приложение — та же ссылка должна открывать сайт в браузере.

## Definition of Done

- Файлы well-known отдаются с корректным типом и без редиректа.  
- Apple/Google верифицируют связь домена с приложением.  
- По тапу на канонический HTTPS URL приложение открывается на нужном мастере; без приложения — веб.  
- `dedato://m/{slug}` работает.  
- Copy-link по-прежнему копирует только HTTPS URL.
