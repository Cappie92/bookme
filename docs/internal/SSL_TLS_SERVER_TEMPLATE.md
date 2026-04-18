# TLS и nginx на сервере (шаблон, **без секретов**)

> **Критично.** В репозиторий **нельзя** коммитить реальные приватные ключи, цепочки вне `BEGIN CERTIFICATE` для публичного CA, пароли к ключам. Ранее в `SSL_SETUP_INSTRUCTIONS.md` находился **полный PEM приватного ключа**; файл удалён из корня, содержимое **не** воспроизводим здесь.  
> **Действие на проде:** если тот же ключ попадал в VCS, считайте его скомпрометированным — **сменить ключ** на хосте и перевыпустить/переустановить сертификат (Let’s Encrypt, провайдер и т.д.).

**Полный follow-up (проверки, дерево решений, история git):** [SECURITY_TLS_KEY_LEAK_FOLLOWUP.md](SECURITY_TLS_KEY_LEAK_FOLLOWUP.md).

## 1. Где взять материал

- **Let’s Encrypt** (рекомендуется): `certbot` / DNS — получаете `fullchain.pem` и `privkey.pem` (или аналоги) **вне** репо.
- Либо файлы от CA — **только** в защищённом хранилище, не в git.

## 2. Размещение на Linux (пример)

```bash
# Права: только root читает ключ
sudo install -d -m 750 /etc/ssl/private
sudo install -m 640 fullchain-or-cert.pem /etc/ssl/certs/your-site.crt
sudo install -m 600 privkey.pem /etc/ssl/private/your-site.key
```

Подставьте **реальные** пути от certbot, не копируйте ключ в репозиторий.

## 3. Nginx: минимальный каркас

Используйте своё `server_name`, `listen`, upstream к приложению по [PROD_DEPLOY.md](../../PROD_DEPLOY.md) (порты backend/frontend за reverse proxy). Пример *без* боевого IP/домена:

```nginx
server {
    listen 443 ssl http2;
    server_name example.com;

    ssl_certificate     /path/to/fullchain.pem;
    ssl_certificate_key /path/to/privkey.pem;

    ssl_protocols TLSv1.2 TLSv1.3;
    # ...
    location /api/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    # static / spa — по вашей схеме из PROD_DEPLOY
}
```

`nginx -t` и `systemctl reload nginx` после правок.

## 4. Проверка

```bash
curl -I https://example.com
```

Для **официального** сценария развёртывания смотрите [PROD_DEPLOY.md](../../PROD_DEPLOY.md) и, при необходимости, TLS-раздел / проксирование там, а не старые корневые «ручные» heredoc.
