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

1. **`apple-app-site-association.template`** → готовый файл **`apple-app-site-association`** (без `.json`).  
   - **Apple Team ID:** `Z2JTZ596C4` (из `mobile/ios/DeDato.xcodeproj/project.pbxproj`).  
   - **Bundle ID:** `com.dedato.app`.  
   - **Paths:** `/m/*`.

2. **`assetlinks.json.template`** → готовый **`assetlinks.json`**.  
   - **package_name:** `ru.dedato.mobile`.  
   - **SHA-256 (debug keystore, `mobile/android/app/debug.keystore`):**  
     `FA:C6:17:45:DC:09:03:78:6F:B9:ED:E6:2A:96:2B:39:9F:73:48:F0:BB:6F:89:9B:83:32:66:75:91:03:3B:9C`  
     — подходит для **локальных / preview APK**, подписанных debug keystore (см. `android/app/build.gradle`).  
   - **EAS production / Play App Signing:** добавьте отпечаток из [Play Console → App integrity](https://play.google.com/console) или `eas credentials -p android` в массив `sha256_cert_fingerprints`.

3. **Деплой на сервер:** `./scripts/deploy-well-known.sh` (копирует файлы в `/var/www/dedato-well-known/`, патчит nginx).

3. **Оба хоста** (`dedato.ru` и `www.dedato.ru`), если оба открывают сайт — файлы должны быть **доступны на каждом** (или один домен канонический с 301 на другой **только для страниц**, не для `/.well-known`).

## Nginx

См. фрагмент в корне репозитория `nginx-dedato.conf` (блок `/.well-known`).  
Каталог на сервере, например: `/var/www/dedato-well-known/` — скопируйте туда готовые файлы.

## Проверка

- Apple: [App Search API Validation](https://search.developer.apple.com/appsearch-validation-tool/) или открытие ссылки на устройстве после установки приложения.  
- Google: `https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https://<host>&relation=delegate_permission/common.get_login_creds` (и аналог для app) / настройки приложения на Android «Open by default».
