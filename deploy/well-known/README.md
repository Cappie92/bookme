# Universal Links (iOS) и App Links (Android)

Канонический URL страницы записи: `https://<домен>/m/{slug}`.  
Файлы ниже нужно **выложить на тот же хост**, что и `WEB_URL` (и `www`, если используется), по **HTTPS**, **без редиректов** на другой домен.

## Файлы

| Файл | URL | Content-Type |
|------|-----|----------------|
| Apple | `https://<host>/.well-known/apple-app-site-association` | `application/json` (рекомендуется) |
| Google | `https://<host>/.well-known/assetlinks.json` | `application/json` |

Имя Apple **без** расширения `.json`.

## Подготовка

1. **`apple-app-site-association.template`**  
   - Замените `APPLE_TEAM_ID` на [Team ID](https://developer.apple.com/account) (10 символов).  
   - Убедитесь, что `bundle id` = `com.dedato.app` (как в `mobile/app.config.ts`).  
   - Сохраните как **`apple-app-site-association`** (без расширения) и выложите в `/.well-known/`.

2. **`assetlinks.json.template`**  
   - Подставьте SHA-256 отпечатки подписи **релизного** keystore (и upload key, если отличается — оба перечислите).  
   - Получить:  
     `keytool -list -v -keystore <your.keystore> -alias <alias>`  
     или из Play Console (App integrity).  
   - `package_name`: `ru.dedato.mobile`.

3. **Оба хоста** (`dedato.ru` и `www.dedato.ru`), если оба открывают сайт — файлы должны быть **доступны на каждом** (или один домен канонический с 301 на другой **только для страниц**, не для `/.well-known`).

## Nginx

См. фрагмент в корне репозитория `nginx-dedato.conf` (блок `/.well-known`).  
Каталог на сервере, например: `/var/www/dedato-well-known/` — скопируйте туда готовые файлы.

## Проверка

- Apple: [App Search API Validation](https://search.developer.apple.com/appsearch-validation-tool/) или открытие ссылки на устройстве после установки приложения.  
- Google: `https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https://<host>&relation=delegate_permission/common.get_login_creds` (и аналог для app) / настройки приложения на Android «Open by default».
