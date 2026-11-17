---
type: Knowledge
project: DeDato
knowledge_class: living
environment: prod
status: active
last_verified: 2026-11-17
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
| Canonical git `main` / `origin/main` | release gate still documents `d072998`; local `main` tip checked 2026-11-13: `19120d2` (includes mobile master tour `19120d2`, client nav fix `7d5b070`, CI selective/shard `f370ca6` + ancestors) | **Gate row:** CONFIRMED text in this document. **Tip row:** CONFIRMED `git` locally 2026-11-13; **not** restated as deployed/CI-green for post-`d072998` commits |
| Prior release commits on that tip | `60eba89` schedule/push; `eca7aff` iOS build 16 | CONFIRMED git history |
| Production backend/frontend images | last named cut in this document was backend `96f3f27` and frontend `fde8033-prod` | REPORTED historical cut. No newer image tag is recorded. Neither tag nor `d072998` proves the current host image |
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
| release candidate | `b4fee32` on branch `release/calendar-b3-20261117` ([PR #7](https://github.com/Cappie92/bookme/pull/7)) |
| CI status | **FAIL** on PR #7 (Playwright + aggregate gate); backend/frontend/mobile/gitleaks **pass** ([run 44104884292](https://github.com/Cappie92/bookme/actions/runs/44104884292)) |
| local full backend (release worktree) | 1732 passed, 7 skipped, **1 failed** `test_cleanup_deletes_smoke_not_admin` |
| production deploy | **not performed** — blocked before cutover |
| production runtime (host check 2026-11-17) | backend `dedato_backend:a3fa405`, frontend `dedato_frontend:a3fa405`; Alembic **`20260914_push_notifications_v1`** |
| migration preflight (copy of prod DB) | upgrades through `20261031_b3_master_svc` OK; **`20261114_calendar_grid_guard` aborts**: **29** invalid `bookings` (off-grid wall times / bad intervals; mostly stats-smoke masters 11/15/16, one `#145` sub-second timestamps, one `#1067` inverted interval) |
| backup | `/opt/dedato/backups/dedato_backup_20261117_173441.tar.gz`; SQLite `PRAGMA integrity_check` **ok** |
| next gate | owner-approved repair of flagged rows (no auto-snap/delete) → migration dry-run on copy → green full CI → controlled container cutover |
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
