---
type: Knowledge
project: DeDato
knowledge_class: living
environment: prod
status: active
last_verified: 2026-09-24
---

# Production topology

## Scope

Документ владеет repository-known описанием production-топологии DeDato и текущим operational release state. Compose/network/volume facts без host access остаются repository-CONFIRMED. Current store/review and runtime pointers ниже — living state на 2026-09-24, не snapshots iOS (12), frontend `96f3f27-prod` или «ещё не submitted».

Deploy procedure принадлежит [CI/CD](ci-cd.md) и [Deployment artifact inventory](deployment-artifact-inventory.md). Секреты и container IDs в Knowledge не хранятся.

## Confidence model

| Метка | Смысл в этом документе |
|-------|-------------------------|
| **CONFIRMED** | Подтверждено repository runtime-кодом или исполняемой конфигурацией |
| **INFERRED** | Следует из нескольких подтверждённых repository-фактов |
| **REPORTED** | Утверждается runbook или комментарием, но не подтверждено состоянием host |
| **UNKNOWN** | Требует проверки production host или внешней системы |

## Current production release state

Это единственная current release truth. Не хранить параллельные snapshots iOS (12), frontend `96f3f27-prod` или «ещё не submitted».

| Pointer | Current value | Confidence |
|---------|---------------|------------|
| Public site | `https://dedato.ru` | REPORTED |
| Production server | `193.160.208.206` | REPORTED |
| Canonical git `main` / `origin/main` | `fde8033` | CONFIRMED repository; `chore: bump iOS build to 13` |
| Production backend image | `dedato_backend:96f3f27` | REPORTED authorized deploy 2026-09-22; **not** redeployed for free-companion; **not** equal to current `main` |
| Production frontend image | `dedato_frontend:fde8033-prod` | REPORTED authorized frontend update for UA / Privacy / free-companion legal surface |
| Backend release worktree | `/opt/dedato-release-96f3f27` | REPORTED; backend cut pointer, not proof that frontend is still `96f3f27-prod` |
| iOS | **1.1.0 (13) SUBMITTED / IN APP REVIEW PROCESS** | Version CONFIRMED `mobile/app.config.ts`; store status REPORTED. Not approved. Not released. |
| Android | **1.1.0 (6) RuStore SUBMITTED FOR MODERATION** | Version CONFIRMED `mobile/app.config.ts`; store status REPORTED. Not published. Not approved. Not released. |
| Android production AAB | EAS `e3b8e3ec-d3d7-405b-bb65-212e96309248`; package `ru.dedato.mobile`; versionName `1.1.0`; versionCode `6` | REPORTED; built from current `main` with EAS production |
| Production HTTP | `/` → 200; `/api/health` → 200 | REPORTED frontend deploy smoke PASS |
| SQLite | pre-deploy backup `integrity_check = ok` | REPORTED |
| Alembic on production DB | push v1 schema already present; no delta `1579f36` → `96f3f27` | REPORTED |
| Redis | unchanged by the backend cutover | REPORTED |
| `DEMO_MASTER_USER_ID` | configured | REPORTED; category only, value never stored here |
| Push sender | registration+notifications enabled; allowlist `user_id 11` | REPORTED; not global rollout |

Marketing version **1.1.0**. Production runtime is **intentionally split**: backend `96f3f27`, frontend `fde8033-prod`. Do **not** state that production backend equals current `main` (`fde8033`). Do **not** state that production frontend is still `96f3f27-prod`.

Backend `backend/services/notification_events.py` from `3639e74` (structured `actor_user_id` logging) remains in `main` and is **still not** in production backend `96f3f27`. Observability-only; no schema migration. Mobile 1.1.0 (13)/(6) include the Android push lifecycle from `3639e74` plus later free-companion iOS work.

`/opt/dedato` git worktree is dirty/legacy and **must not** be used as a clean release checkout.

Verified pre-deploy SQLite backup: `/opt/dedato/backups/bookme-pre-96f3f27-20260922_130851.db` (`integrity_check: ok`). Rollback containers retained (do not state they were deleted):

- `dedato_backend_1_rollback_20260922_132751`
- `dedato_frontend_1_rollback_20260922_132751`
- latest frontend rollback: `dedato_frontend_1_rollback_20260923_122405`

Closed for this submission cycle (not store-approved): Android adaptive icon; Android push permission/presentation/Notification Center; booking/reschedule regression; iOS true free-companion remediation. IAP remains dormant/unreachable and is **not** the current release solution. Owner decision: backend Free-20 booking limit is unchanged and is **not** a blocker for this submission.

`test/apple-iap-handoff` is not the current production release branch.

### Next steps

Primary work is no longer implementation.

1. Wait for Apple App Review result for iOS 1.1.0 (13).
2. Wait for RuStore moderation result for Android 1.1.0 (6).

On rejection: capture exact reviewer/moderator feedback, audit only that issue, avoid speculative rebuilds. On approval: proceed with release/publishing controls, then post-release engineering hygiene.

Deferred post-release: production dirty-repo cleanup; old rollback container cleanup; Docker image cleanup; repository/deploy hygiene; backend observability deploy reconciliation (`3639e74` vs prod `96f3f27`); broader Android distribution / store follow-up if needed.

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
