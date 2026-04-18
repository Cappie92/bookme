# TLS rotation runbook: `dedato.ru` (host nginx, срочно после key leak)

> **Предпосылка:** приватный ключ, попавший в VCS, **подтверждённо** соответствует **текущему** HTTPS (совпал SPKI→pubkey). Нужен **новый** private key + новый/перевыпущенный cert. **Очистка git history** — отдельно, после ротации на хосте.
>
> **Среда (канон [PROD_DEPLOY.md](../PROD_DEPLOY.md)):** стек DeDato в Docker, TLS обычно на **хост-nginx**; `ssl_certificate` / `ssl_certificate_key` указывают на файлы на **сервере** (часто Let’s Encrypt под `/etc/letsencrypt/`, либо `/etc/ssl/...`).

**Запрещено:** копипаст private key, PEM, CSR с секретом в тикет/чат. Храните артефакты только на сервере/в secret store.

---

## 0) Роли

- **Оператор:** root/sudo на prod, внепиковое окно или с коллегой (если риск короткого даунтайма).
- **Снимки:** пути nginx — **не** публиковать, если внутренняя политика требует сокрытия путей; достаточно “файл A = cert, файл B = key” в своём runbook-заметке.

---

## 1) Предварительные проверки (A)

| Шаг | Что | Ожидаемо / если нет |
|-----|-----|----------------------|
| 1.1 | `nginx -t` | `syntax is ok` — **не** продолжать с битой конфигурацией. |
| 1.2 | `nginx -T` (или `grep` по `sites-enabled`) — найти **vhost** с `server_name` для `dedato.ru` (и `www` при необходимости). | Записать **только** пути к `ssl_certificate` / `ssl_certificate_key` (в **ваш** приватный runbook, не в git). |
| 1.3 | Убедиться, что 80/443 **слушаются** nginx, backend за прокси жив (`curl -fsS` на `/health` через HTTPS по политике). | Если 443 не nginx — сначала **куда** вешается cert (load balancer) и адаптируйте раздел E. |
| 1.4 | Версия certbot (если используете): `certbot --version` | План: `--no-reuse-key` доступен в **certbot 1.12+**; иначе — **вариант «новый openssl key + CSR»** (раздел 4B). |

---

## 2) Безопасный backup (B)

**Рабочая папка для сессии (пример, создать и использовать как корень бэкапа):**  
`/var/backups/dedato-tls-rotate-YYYY-MM-DD-HHMM/`

(ниже: замените `BACKUP` на **полный** путь к этой папке, без `cd` в сценарии: подставьте путь в каждую команду)

| Шаг | Команда (логика) | Ожидаемо |
|-----|------------------|----------|
| 2.1 | Создать **BACKUP**, права 700, root-only. | Пустая папка. |
| 2.2 | Скопировать **текущие** файлы cert+key, на которые ссылается nginx (только read): `cp` **абсолютных путей** в `BACKUP/`. | Файлы на месте, **владелец root** `chmod 600` для key-копий. |
| 2.3 | Скопировать **фрагмент** vhost (только `server { ... }` с SSL) в `BACKUP/dedato-vhost-fragment.txt`. | Можно восстановить `ssl_` пути. |
| 2.4 | **Зафиксировать (в приватной заметке) pubkey hash** старого key — для сравнения после: `openssl pkey -in /путь/к/старому.key -pubout` → pipe в `openssl sha256`. | Одна строка `SHA2-256(stdin)= …` (это **не** секрет в том смысле, что private key, но **не** коммитить). |
| 2.5 | If Let’s Encrypt: архив `tar` каталога lineage (часто `/etc/letsencrypt/`) **или** минимум `archive/`, `renewal/`, `live/relname` в `BACKUP/` — **осторожно** с дисковым местом. | Можно откатить certbot-состояние. |

**Если копия key для backup не делается по политике** — сделайте **tar** с правами, всё равно держите возможность `nginx` откатить **на старые пути** из `BACKUP`.

---

## 3) Генерация **нового** private key (C) — *гарантия, что key новый*

**Предпочтительно не переиспользовать тот же файл пути, что в nginx сейчас** — писать **новый** key под **новыми** именами, например:

- `dedato-rotated-YYYYMMDD.key` в `/etc/ssl/private/` (или next to LE keys по вашему flow).

| Шаг | Действие | Проверка |
|-----|----------|----------|
| 3.1 | `openssl genrsa` **или** `openssl genpkey -algorithm EC -pkeyopt ...` (если уходите на EC) в **новый** файл, права `600`, root. | `openssl pkey -in NEW_KEY -pubout \| openssl sha256` — **сохранить** **хеш** в приватной заметке. |
| 3.2 | **Сравнить** с хешом **скомпрометированного** (из расследования) и с **текущего** pre-rotate key — **все три разные?** New vs compromised **должны** различаться. New vs pre-rotate **должны** различаться (доказать «новая пара»). | Если new == old (ошиблись файлом) — **остановитесь** и **не** подменяйте nginx. |

---

## 4) Получение сертификата (D)

### 4A — **Основной путь: certbot (Let’s Encrypt) + *новый* key**

- **Проблема:** `certbot renew` по умолчанию **может** проставлять `reuse_key = True` в `renewal/*.conf` — не годится.  
- **Рекомендация (если certbot **уже** обслуживает этот linege):**

1. **Backup** (секция 2) выполнен.  
2. **Один** из **безопасных** вариантов:
   - **(i)** `certbot renew` с **`--no-reuse-key`**, **`--force-renewal`** (один vhost) — *после* проверки, что `renewal/…conf` это поддерживает, или
   - **(ii) Надёжный:** `certbot certonly` **заново** (webroot/nginx) с **новым** CSR от **сгенерированного в §3** ключа — тогда private key = **тот**, что сгенерировали вы.

**Вариант (ii) (максимальная уверенность):**

- CSR: `openssl req -new -key /ABS/NEW_KEY -out /tmp/dedato-rotate.csr` с корректным `CN`/SAN (SAN критичен: `dedato.ru`, `www` при необходимости; для **точного** subject/SAN смотрите `openssl x509 -in CURRENT_FULLCHAIN -noout -ext subjectAltName` и повторяете **имена**, не **ключ**).  
- Вызов `certbot certonly` **с** `--csr` (см. `man certbot`) **или** цепочку, принятую у вас, чтобы **итог** положен в `live/…/fullchain.pem` и `privkey.pem` указывает **на** ваш NEW_KEY (иногда certbot **кладёт** свой `privkey.pem` — **проверьте**, что на диске в итоге **тот** материал, **что** вы сгенерили; иначе правьте nginx на **путь** к `NEW_KEY` + `fullchain` от certbot).

- **ACME-ошибка** (failed challenge): **не** трогайте `nginx` prod paths до исчерпания `certbot` / DNS — или откат (§7).

### 4B — **Запасной: коммерческий/другой CA**  

- Как в вашем договоре: CSR из **нового** ключа (§3) → CA выдаёт cert → положить `fullchain` + (опционно chain) **рядом** в paths из §5.

### 4C — **Срок/цепь**

- Проверить `notAfter` нового cert **до** install: `openssl x509 -in FULLCHAIN -noout -dates`

---

## 5) Установка в nginx (E)

1. **Не** затирать **реальные** prod paths, пока нет **рабочей** пары. Типовой pattern:
   - положить **новые** файлы рядом (`…-new.pem`, `…-new.key` или `live/lineage-rotated/…` от certbot),
2. **Один** `server` блок: временно (или сразу финально) `ssl_certificate` / `ssl_certificate_key` — на **новые** файлы,
3. Единый vhost, не **двойной** 443 **на** **разные** key без понимания SNI (если один IP — **один** `server` для домена, что вы правите).
4. **`nginx -t` обязателен.** Ошибка → **не** `systemctl restart nginx` «вслепую»; **откат** (§7).

---

## 6) Reload и проверки (F)

| Шаг | Команда / действие | Ок / не ок |
|-----|-------------------|------------|
| 6.1 | `nginx -t` | ok → дальше |
| 6.2 | `systemctl reload nginx` (предпочтительно **reload** vs `restart` для снижения разрывов) | `systemctl status nginx` **active** |
| 6.3 | **Снаружи** (с любой машины): `printf '\n' \| openssl s_client -connect dedato.ru:443 -servername dedato.ru 2>/dev/null \| openssl x509 -fingerprint -sha256 -noout` | Fingerprint **изменился** к previous live |
| 6.3b | `… \| openssl x509 -pubkey -noout \| openssl sha256` | **Должен** совпасть с **new** pre-install hash из §3 (если вы используете **тот же** new key) |
| 6.4 | `curl -fsSI https://dedato.ru/health` (или путь health из PROD) | 200/redirect ожидаемо, **без** SSL error |
| 6.4b | `curl -I http://dedato.ru` | редирект на https при вашей схеме (если был) |

**Если 6.3 показывает старый fingerprint** (без смены): reload **не** подтянул новый vhost, не тот vhost, или кеш/CDN (редко) — **не** считать ротацию завершённой.

---

## 7) Rollback (G)

1. **Вернуть** `ssl_certificate` / `ssl_certificate_key` **на пути** из `BACKUP` (тот же vhost-фрагмент, что **скопировали**).
2. `nginx -t` — ok.
3. `systemctl reload nginx`.  
4. `openssl s_client` (как 6.3) — **временно** вернёт **старый** fingerprint = **тот же** скомпрометированный риск — rollback **только** до **стабилизации** сервиса; сразу планируйте **повтор** ротации.  
5. If certbot / файлы **испорчены** — **восстановить** `tar` из 2.5, затем reload.

---

## 8) После успешной ротации (H)

- **No-match** к leak: `openssl pkey` от **текущего** key-файла (на диске) **pubout sha256` ≠** хеш, зафиксированный в инциденте для **утекшего** key.  
- Внутренняя **incident note** (дата, кто, старые и **новые** *только* pubkey hashes, **без** PEM).  
- **gitleaks / secret scan**; план **git history** ([SECURITY_TLS_KEY_LEAK_FOLLOWUP](SECURITY_TLS_KEY_LEAK_FOLLOWUP.md)).  
- **Pre-commit** / **branch protection** — process follow-up.  
- **(Опционально)** **отозвать** старый cert в CA, если CA это поддерживает и политика требует.  
- **Старые** key-файлы: **сжечь** с диска после подтверждения, что **ничто** в nginx/renewal **на них** **не** ссылается (`grep -R` по `/etc/nginx/`, `renewal/`, `sites-enabled`).

---

## 9) Минимальные **безопасные** команды (I) — `PATH_*` = ваши абсолютные пути

**На сервере, без `cd` в блоке. Подставьте `PATH_KEY`, `PATH_FULLCHAIN` после выяснения путей.**

*Текущий (pre-rotate) key — только **pubout** hash, не private:*

```bash
openssl pkey -in PATH_OLD_KEY -pubout 2>/dev/null | openssl sha256
```

*Новый key — после генерации:*

```bash
openssl pkey -in PATH_NEW_KEY -pubout 2>/dev/null | openssl sha256
```

*Проверка, что new ≠ old (заменить файлы):*

```bash
diff <(openssl pkey -in PATH_NEW_KEY -pubout 2>/dev/null | openssl sha256) <(openssl pkey -in PATH_OLD_KEY -pubout 2>/dev/null | openssl sha256)
```

*(exit 0 = **опасно** — совпадение, не публиковать сайт; exit 1 = **различаются**).*

*Live :443 (после reload):*

```bash
printf '\n' | openssl s_client -connect dedato.ru:443 -servername dedato.ru 2>/dev/null | openssl x509 -pubkey -noout | openssl sha256
```

**Должен** совпасть с `PATH_NEW_KEY` pubout hash при успехе.

---

**Кратко: стратегия**

- **Первично:** **новый** `openssl` key (§3) + certbot **с** **новой** цепочкой, с **`--no-reuse-key`** / **certonly + CSR** — чтобы **nicht** re-use.  
- **Проверка** — `nginx -t` → `reload` → s_client + **diff** pubkeys.  
- **Потом** — политика и **history** ([SECURITY_TLS_KEY_LEAK_FOLLOWUP](SECURITY_TLS_KEY_LEAK_FOLLOWUP.md)).
