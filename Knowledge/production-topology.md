---
type: Knowledge
project: DeDato
knowledge_class: living
environment: prod
status: active
last_verified: 2026-11-18
---

# Production topology

## Scope

Документ владеет repository-known описанием production-топологии DeDato и текущим operational release state. Compose/network/volume facts без host access остаются repository-CONFIRMED. Блок **Current release gate** заменяется целиком при смене CI, deploy или store selection. Прошлые отклонения App Store: [iOS App Store releases](ios-app-store-releases.md).

Deploy procedure принадлежит [CI/CD](ci-cd.md) и [Deployment artifact inventory](deployment-artifact-inventory.md). Секреты и container IDs в Knowledge не хранятся.

## Confidence model

| Метка | Смысл в этом документе |
|-------|-------------------------|
| **CONFIRMED** | Подтверждено repository runtime-кодом или исполняемой конфигурацией |
| **INFERRED** | Следует из нескольких подтверждённых repository-фактов |
| **REPORTED** | Утверждается runbook или комментарием, но не подтверждено состоянием host |
| **UNKNOWN** | Требует проверки production host или внешней системы |

## Current production release state

Это единственная current release truth.

| Pointer | Current value | Confidence |
|---------|---------------|------------|
| Public site | `https://dedato.ru` | REPORTED |
| Production server | `193.160.208.206` | REPORTED |
| Canonical git `main` / `origin/main` | см. **Current release gate** — deployed runtime **`14fe5f6`**, repo tip отдельно (`9fefdbe` + pending CI fix) | CONFIRMED split 2026-11-18 |
| Prior release commits on that tip | `60eba89` schedule/push; `eca7aff` iOS build 16 | CONFIRMED git history |
| Production backend/frontend images | **`dedato_backend:14fe5f6`**, **`dedato_frontend:14fe5f6`** (см. gate) | CONFIRMED host 2026-11-18 |
| Free Companion public baseline | `/ios-free-companion`, `/user-agreement`; web/backend runtime reported healthy before the booking-cap change | REPORTED |
| Booking-cap deploy | see **Current release gate** below | REPORTED |
| iOS | **1.1.0 (16)** candidate. Build produced; Transporter upload started; ASC processing/selection not confirmed as of 2026-10-19. Not approved. Not released. Build 15 is not this candidate | Version CONFIRMED in repo; ASC status REPORTED |
| Android | **1.1.0 (6)**, last recorded store status **RuStore SUBMITTED FOR MODERATION** | Version CONFIRMED; store status not reconfirmed on 2026-10-19 |
| Android production AAB | EAS `e3b8e3ec-d3d7-405b-bb65-212e96309248`; package `ru.dedato.mobile`; versionName `1.1.0`; versionCode `6` | REPORTED earlier build, not restated as rebuilt |
| Push sender | registration+notifications enabled; allowlist `user_id 11` | REPORTED; not global rollout |

### Current release gate

Replaceable operational state. После CI или deploy обновить строки этой таблицы на месте. Новый snapshot рядом не дописывать.

| Field | State |
|-------|-------|
| **Deployed application runtime** (host, не `git`) | Images **`dedato_backend:14fe5f6`**, **`dedato_frontend:14fe5f6`**; containers `dedato_backend_14fe5f6`, `dedato_frontend_14fe5f6`. Image IDs (2026-11-18): backend `sha256:b4b3e569…`, frontend `sha256:437c953f…`. Built from merge **`14fe5f646a0bdd1d92edc83d172ef8cc9e443159`** ([PR #7](https://github.com/Cappie92/bookme/pull/7)) |
| **Git `origin/main` tip** (repo gate, не обязательно в образе) | **`f8d96b82cbd30ab5cfef788140856dd799390515`** — repair-tooling/тесты (`run_alembic` → `sys.executable`, in-process `main()` test). **Не** совпадает с image tag `14fe5f6`; redeploy приложения для этого коммита **не требуется** |
| **CI — Application tests** | **#85** `f8d96b8` **success** — **полный** gate (backend shards, frontend, mobile, Playwright, Full regression). **#84** `9fefdbe` **success** (docs-only, **skipped** suites — не заменяет #85). **#83** `9a05484` **failure**. **#82** `bbc30e5` **failure**. **#81** `43e3378` **cancelled** |
| **Cutover vs CI-gate** | **CONFIRMED:** controlled cutover **2026-11-18 выполнен до** green full Application tests на финальном `main` |
| production deploy | **CONFIRMED 2026-11-18:** без stack `down`/`recreate`; только смена контейнеров на теги `14fe5f6` |
| production runtime | Alembic **`20261114_calendar_grid_guard`**; triggers `bookings_calendar_guard_*`, `calendar_blocks_guard_*`; grid invalid **0**; off-grid INSERT blocked (`IntegrityError`); `integrity_check` **ok**; `foreign_key_check` **134** legacy (без изменений). Demo `/master?tab=schedule`: weekly/detailed/calendar-blocks API **200**, UI с **09:00** (read-only browser 2026-11-18) |
| owner grid repair | **29** bookings на live SQLite до миграции (`/opt/dedato/artifacts/decision-pack-prod.json`) — см. [calendar-b3-prod-grid-owner-decisions.md](calendar-b3-prod-grid-owner-decisions.md). **Повторный repair не выполнять** |
| backup (pre-cutover) | `/opt/dedato/backups/dedato_backup_20261118_164932.tar.gz` — содержимое **до** cutover; восстановление целиком **уничтожает** пользовательские изменения после 2026-11-18 ~16:49 MSK |
| rollback (план, без auto-restore на red CI) | (1) **Контейнеры:** поднять прежние `dedato_*_a3fa405_*` только если образы совместимы с уже мигрированной БД (`20261114` + UDF triggers); иначе нужен согласованный downgrade миграции или restore. (2) **БД:** `restore_sqlite.sh` с pre-cutover backup — крайняя мера, откат repair+migration и **потеря пост-cutover данных**; снятие grid UDF только через restore/downgrade, не отдельным SQL. (3) **Не** запускать restore автоматически из-за красного CI; ops-only с пост-cutover backup, если появится |
| next gate | **Закрыто 2026-11-18:** [#85](https://github.com/Cappie92/bookme/actions/runs/44324136281) green на `f8d96b8`. Дальше: FK 134 — отдельный debt; optional redeploy только при смене продуктового кода |
| mobile rebuild | none (native tree unchanged vs `main`) |

Marketing version **1.1.0**. Production is not at `d072998`, пока эта строка deploy не заменена.

`/opt/dedato` git worktree was recorded dirty/legacy and **must not** be used as a clean release checkout. The September 2026 rollback container names remain historical operations notes, not the current release pointer.

Closed as implementation, not store-approved: Free Companion native surface; schedule 09:00 and `scrollsToTop={false}`; push registration hardening; removal of the extra iOS booking cap. IAP remains dormant and is **not** the current release solution. Free accounts stay at 20 active future bookings. Paid and unlimited accounts are not capped at 20 because the client is iOS.

`test/apple-iap-handoff` is not the current production release branch.

### Obsolete as current truth

- Build 15 is the final candidate.
- `ios_fixed` always means max 20 future bookings.
- A paid master is limited to 20 bookings from iOS.
- A master can manually create bookings in normal native iOS UI.
- RefreshControl caused the schedule jump to 00:00.
- The 09:00 position needs a timer or retry.
- A raw APNs token can be registered as an Expo token.
- RevenueCat or Apple IAP is the 1.1.0 Free Companion strategy.

### Review constraints while 1.1.0 (16) is the candidate

Эти правила живут здесь, пока кандидат не сменится. CI и deploy — только в **Current release gate**.

1. Confirm build 16 is processed and selected in App Store Connect.
2. Description and Review Notes must not say native iOS supports up to 20 bookings or that paid web status raises native booking limits. Notes, if they name the build, use `DeDato 1.1.0 (16)`.
3. Do not promise booking detail/reschedule flows that normal native UI does not open.
4. Submit only after owner approval, with Free Master and Client review credentials checked.

Android 1.1.0 (6) RuStore moderation remains a separate previously reported wait. On rejection, audit the exact feedback only. Deferred hygiene: dirty release checkout, old rollback containers, image cleanup, and confirming whether older observability commits are already inside the unnamed current production image.

## Repository-confirmed components

Production Compose описывает три сервиса в одной default network.

| Компонент | Repository-confirmed роль | Порты и связи | Persistence |
|-----------|---------------------------|----------------|-------------|
| `frontend` | Nginx со статической frontend-сборкой и reverse proxy к backend | Контейнер слушает `80`; host публикует только `127.0.0.1:8080` → container `80` | Отдельный volume отсутствует; собранная статика входит в image |
| `backend` | FastAPI под Uvicorn | Контейнер слушает `8000`; host port не опубликован; доступен frontend внутри Compose network | `dedato_data`, `dedato_uploads`, `dedato_logs` |
| `redis` | Redis dependency, используемая в OTP-контуре | Внутренний endpoint `redis:6379`; host port не опубликован | Отдельный persistent volume отсутствует |

Default network имеет явное имя `dedato_network`. Compose описывает по одному service instance и не содержит `replicas` или иной конфигурации горизонтального масштабирования.

**Confidence:** `CONFIRMED` для repository Compose definition; фактическое число containers и processes на host — `UNKNOWN`.

## Network and request path

Repository-confirmed внутренний request path:

```text
host loopback 127.0.0.1:8080
  -> frontend Nginx :80
     -> backend:8000
```

Frontend Nginx задаёт следующие границы:

- `/api/` проксируется в `backend:8000` с сохранением URI;
- точный `/api/health` проксируется в backend `/health`;
- `/uploads/` проксируется в backend `/uploads/`;
- `/salon/` и `/client/` содержат compatibility proxy mappings к соответствующим `/api/...` paths;
- `/assets/` и SPA fallback обслуживаются самим frontend Nginx;
- `/health` возвращается самим frontend Nginx и не подтверждает доступность backend, SQLite или Redis.

Backend `/health` возвращает статический application-level ответ без обращения к SQLite или Redis. Поэтому даже `/api/health` подтверждает HTTP-доступность backend process, но не полную готовность зависимостей.

Compose не содержит Docker healthchecks. `depends_on` задаёт dependency/start ordering между services, но repository не задаёт readiness condition для Redis или backend.

## Persistent state

| State | Repository location | Граница persistence |
|-------|---------------------|----------------------|
| SQLite | `dedato_data` → backend `/data`; production URL указывает на `/data/bookme.db` | Named Docker volume |
| Uploads | `dedato_uploads` → backend `/app/uploads` | Named Docker volume |
| Backend logs | `dedato_logs` → backend `/app/logs` | Named Docker volume; Compose задаёт mount, но не доказывает, что все application logs пишутся туда |
| Frontend build | Внутри frontend image | Не является named-volume state |
| Redis | `redis` service; Compose-declared volume отсутствует | Durability при recreation/removal не гарантируется |

Backend создаёт `uploads/photos` и `uploads/logos` относительно process working directory `/app` и монтирует `uploads` как FastAPI static path. Это согласовано с Compose mount `/app/uploads`.

Обычный restart существующего container не равен его recreation или removal: restart сохраняет тот же container writable layer, тогда как recreation/removal заменяет или удаляет его. Для Redis отдельный persistent volume не задан, поэтому repository не гарантирует сохранность Redis state при recreation/removal. Фактическая Redis persistence configuration и содержимое остаются `UNKNOWN`.

Явные имена volumes делают Docker resource names независимыми от вычисленного Compose project name. В Compose они не объявлены `external`; фактический storage driver, mountpoint и наличие данных определяются host и остаются `UNKNOWN`.

## External boundaries

Repository задаёт категории внешней конфигурации, но не подтверждает их production-значения или включённые режимы:

- application environment и dev-only switches;
- authentication signing configuration;
- public frontend/API URLs и CORS inputs;
- OAuth provider configuration;
- transactional email provider configuration;
- payment provider configuration;
- telephony/SMS provider configuration;
- Redis connection coordinates.

Runtime settings требуют часть категорий только при соответствующем production/live mode. Реальные значения находятся вне living canon и не должны переноситься в документацию.

Комментарий в production Compose описывает host reverse proxy, который должен обращаться к loopback publication frontend. Это `REPORTED`, а не подтверждённый host-факт. Tracked `nginx-dedato.conf` также не является доказательством активной host configuration: repository не связывает его с основным Compose lifecycle, а его upstream assumptions не совпадают с текущими published ports.

Фактические TLS termination, public listeners, firewall rules, DNS и active reverse-proxy configuration — `UNKNOWN`.

## Startup and process model

Backend image запускает Uvicorn командой без явного multi-worker option. При импорте application module создаются upload directories и регистрируются routes; schema lifecycle описан отдельно в [Data and migrations](data-and-migrations.md).

FastAPI startup handler создаёт шесть in-process `asyncio` tasks:

- daily charges;
- recurring expenses;
- bookings limit monitor;
- temporary bookings cleanup;
- expired payments cleanup;
- push worker (Expo outbox + receipt polling).

Shutdown handler отменяет эти tasks. Отдельный scheduler service, leader election или distributed coordination для их запуска Compose не задаёт. Следовательно, каждый дополнительный backend process запустил бы собственный комплект tasks — `INFERRED` из runtime startup code.

Все три Compose services используют `restart: unless-stopped`. Это задаёт restart policy, но не readiness, dependency health или гарантию корректности persistent state.

## Repository-confirmed constraints

- Production Compose использует один SQLite file и один backend service instance; это single-instance repository assumption.
- SQLite и локальные named volumes ограничивают прямое multi-host scaling backend и shared access к uploads.
- In-process background tasks не имеют repository-confirmed leader election; несколько backend processes создают риск дублированного выполнения.
- В разобранном billing path нет distributed locking; связанные ограничения подробнее принадлежат [Debt — subscriptions billing](subscriptions-billing-debt.md).
- Redis durability при recreation/removal не гарантируется, потому что отдельный persistent volume отсутствует.
- Compose не задаёт healthchecks, readiness gates, resource limits, metrics/APM services или log shipping.
- Backend и Redis не публикуются на host; внешний доступ к ним зависит от frontend и host boundary.

Эти ограничения описывают текущую repository configuration, а не утверждают, что соответствующий production failure уже происходил.

## Repository-known vs host-unknown

| Область | Repository-known | Host-unknown |
|---------|------------------|--------------|
| Services | Желаемые `frontend`, `backend`, `redis` | Фактические containers, overrides, replicas и restart history |
| Processes | Backend CMD без multi-worker option | Фактический command и число Uvicorn processes |
| Network | `dedato_network`, internal backend/Redis, frontend loopback publication | Active listeners, firewall, Docker network membership |
| Reverse proxy | Ожидаемая loopback boundary описана комментарием | Active host Nginx/proxy config и upstream |
| TLS/DNS | Находятся вне Compose | Termination, certificates, renewal и DNS state |
| Volumes | Имена и container mount paths | Наличие, drivers, mountpoints, size и содержимое |
| SQLite | Repository production path `/data/bookme.db` | Фактический DB file и его состояние |
| Uploads/logs | Repository mount boundaries | Полнота, размер, ownership и retention |
| Redis | Internal service без отдельного volume | Persistence mode, keys, eviction и data survival history |
| Integrations | Категории runtime configuration | Реальные modes, доступность providers и наличие обязательных значений |
| Observability | Application logging и HTTP health handlers | External monitoring, alerts и log shipping |

## Source anchors

- `docker-compose.prod.yml` — `services`, `networks`, `volumes`, published port и mounts.
- `backend/Dockerfile` — Uvicorn process command и container working directory.
- `frontend/Dockerfile.prod` — frontend build и Nginx runtime image.
- `frontend/nginx.conf` — internal routing, SPA/static paths и health endpoints.
- `backend/main.py` — upload mount, FastAPI startup/shutdown handlers и `/health`.
- `backend/settings.py` — external configuration categories и production validation.
- `backend/sms.py` — Redis usage in the OTP boundary.
- `subscriptions-billing-debt.md` — confirmed SQLite, background-job and distributed-locking constraints.

## Related documents

- [Data and migrations](data-and-migrations.md) — production database identity, schema lifecycle and Alembic.
- [Configuration and feature flags](configuration.md) — process/build/DB configuration layers and precedence.
- [Background jobs](background-jobs.md) — cadence, side effects and reliability of the six in-process tasks.
- [Debt — subscriptions billing](subscriptions-billing-debt.md) — billing-specific failure scenarios and reliability constraints.
