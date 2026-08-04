---
type: Knowledge
status: active
project: DeDato
last_runtime_check: 2026-08-04
---

# Backend architecture

Живой канон repository-known FastAPI backend. Документ описывает composition и execution boundaries, а не повторяет правила Booking, Identity, Billing и других доменов.

## Process entrypoint

Backend запускается из каталога `backend/` как `uvicorn main:app`. `backend/main.py` при импорте создаёт отсутствующие ORM objects через `Base.metadata.create_all`, затем конструирует один `FastAPI` application, подключает middleware/routes/static mounts и регистрирует startup/shutdown handlers.

Production Dockerfile запускает один Uvicorn process без explicit worker count. Фактическая production topology, migration ordering и host state принадлежат [Production topology](../Infrastructure/production-topology.md) и [Data and migrations](data-and-migrations.md).

**Sources:** `backend/main.py`; `backend/Dockerfile`; `docker-compose.prod.yml`.

## Code composition

Backend имеет flat module layout:

- `backend/models.py` — общий SQLAlchemy model registry;
- `backend/schemas.py` — основной Pydantic schema registry, дополненный router-local request/response classes;
- `backend/routers/` — HTTP composition, dependency guards и значительная часть orchestration;
- `backend/services/` — переиспользуемые workflows и background task functions;
- `backend/utils/` — calculations, selectors и domain helpers;
- `backend/auth.py`, `backend/database.py`, `backend/settings.py` — cross-cutting dependencies.

Граница не является строгой layered architecture: routers могут напрямую query/update ORM, services/utils могут работать с `Session`, а некоторые helpers сами flush/commit. Поэтому имя каталога не определяет transaction ownership; его нужно подтверждать по конкретному call path.

**Sources:** repository module tree; representative routers and services; commit/flush call-site inventory.

## Application composition

`main.py` вручную imports и mounts routers. Большинство старых routers задаёт domain prefix (`/auth`, `/master`, `/bookings` и т.п.), а main добавляет `/api`. Более новые routers включают `/api` в собственный prefix и mounts без дополнительного prefix. Public blog/domain/public-master и SPA/static surfaces также имеют свои mount rules.

Dev test-data router монтируется только при computed `enable_dev_testdata`; unauthenticated E2E seed router — только при computed `dev_e2e`. Эти settings принудительно отключают опасные dev surfaces вне development, как описано в [Configuration](../Infrastructure/configuration.md).

После всех API routes регистрируется GET catch-all для SPA. Custom `SpaCatchAllAPIRoute` не матчится на `/api` и `/api/*`, чтобы unknown non-GET API path не превращался в catch-all 405. Static uploads доступны под `/uploads`, собранные frontend assets — под `/assets`, если dist существует.

**Sources:** `backend/main.py`; `backend/spa_catchall_route.py`; `backend/settings.py`; router declarations.

## Request and database lifecycle

`get_db()` создаёт SQLAlchemy `SessionLocal` на request dependency и гарантирует только `close()` в `finally`. Он не выполняет automatic commit или rollback. Handler/service/helper явно выбирает `flush`, `commit`, `rollback` или `with db.begin()`.

Следствия фактического контракта:

- read handler обычно использует один request session;
- write atomicity определяется конкретным call path;
- exception сам по себе не означает repository-wide rollback policy;
- helper с internal commit образует durable boundary раньше outer handler;
- common domain finalize может оставлять commit caller-у и быть атомарным вместе с его side effects.

SQLAlchemy engine синхронный. В repository сосуществуют sync и `async def` route handlers, но оба используют тот же sync ORM/session API. FastAPI выполняет sync handlers в threadpool; sync DB work, вызванная непосредственно из async handler, выполняется в event-loop task.

**Sources:** `backend/database.py`; transaction call sites in `backend/routers/`, `backend/services/`, `backend/utils/`; representative atomic flow `backend/services/booking_visit_finalize.py`.

## Authentication and authorization dependencies

Bearer JWT resolution находится в `auth.py`. Dependencies образуют несколько уровней:

- `get_current_user` — valid bearer и active/non-deleted user;
- `get_current_active_user` — повторная active check и global read-only guard demo master для mutating HTTP methods;
- `require_role(...)` и named role dependencies;
- moderator permission factory;
- object ownership и paid capability checks внутри конкретных routers/services.

Router-level dependencies используются не везде; часть handlers declares dependencies индивидуально. Документация `responses={401: ...}` влияет на OpenAPI, но сама не выполняет enforcement. Фактические enforcement boundaries принадлежат [Identity and access](../Domain/identity-access.md) и [Feature entitlements](../Contracts/feature-entitlements.md).

**Sources:** `backend/auth.py`; router declarations and handler dependencies; `backend/main.py`.

## Startup and shutdown

Startup логирует optional route/config diagnostics и создаёт пять process-local asyncio tasks. Shutdown отменяет и awaits каждую сохранённую task. Их cadence, failure isolation и multi-process semantics находятся в [Background jobs](background-jobs.md).

`/health` возвращает статический process response и не проверяет database, migration revision, external providers или task liveness.

**Sources:** `backend/main.py`; `backend/route_diagnostics.py`; five job modules.

## HTTP and static boundaries

CORS использует explicit origin allowlist plus normalized configured frontend/API URLs, разрешает credentials, all methods и all headers. Development использует расширение того же списка, а не wildcard.

Uploads сохраняются относительно process current working directory и обслуживаются тем же application. SPA fallback также вычисляет paths из module/current working directory. Persistent upload storage в production задаётся Compose volume; file validation/ownership остаётся обязанностью конкретных upload handlers.

**Sources:** `backend/main.py`; `backend/settings.py`; upload handlers in `backend/routers/master.py`, `backend/routers/salon.py`; `docker-compose.prod.yml`.

## API contract owner

Общие path, validation, serialization, auth/error и compatibility правила находятся в [API conventions](../Contracts/api-conventions.md). Подтверждённый architectural drift — в [Backend/API Debt](../Debt/backend-api.md).
