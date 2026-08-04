---
type: Knowledge
status: active
project: DeDato
---

# Data and migrations

## Scope

Этот документ владеет repository-known контрактом production database и schema lifecycle: идентичностью SQLite, созданием SQLAlchemy engine, Alembic graph, точками выполнения `Base.metadata.create_all()` и Alembic, а также подтверждённой неоднозначностью schema ownership.

Документ не является migration runbook, не описывает backup/restore и не подтверждает состояние production database. Он фиксирует существующий механизм и возможные failure scenarios без утверждения, что они уже происходили.

## Database identity

Production Compose явно задаёт backend `DATABASE_URL` для SQLite file `/data/bookme.db` и монтирует named volume `dedato_data` в `/data`.

`environment` production Compose имеет приоритет над значением той же переменной из `env_file`. Поэтому repository production definition указывает именно на SQLite в `dedato_data`, хотя общие application settings принимают строковый database URL.

Если `DATABASE_URL` отсутствует вне этого Compose path, settings формируют локальный SQLite URL к `backend/bookme.db`. Это application fallback, а не production database identity.

Следует различать три независимых состояния:

1. **Repository Alembic head** — последняя revision в migration graph этого checkout.
2. **Host DB revision** — значение Alembic version table конкретной production database.
3. **Physical schema** — фактически существующие tables, columns, indexes и constraints.

Repository подтверждает только первое. Host DB revision и physical schema — `UNKNOWN` без проверки host database.

## SQLAlchemy lifecycle

`backend/database.py` при импорте:

1. загружает settings и получает `DATABASE_URL`;
2. создаёт SQLAlchemy engine;
3. передаёт SQLite-specific `check_same_thread=False`;
4. создаёт `SessionLocal` и declarative `Base`;
5. предоставляет request-scoped `get_db()`, который закрывает session в `finally`.

`check_same_thread=False` снимает ограничение SQLite driver на использование connection из создавшего его thread. Оно не добавляет distributed locking, не устраняет SQLite writer contention и не координирует отдельные processes.

Production engine не задаёт repository-level `journal_mode`, `busy_timeout` или иной SQLite PRAGMA policy. Фактические значения этих параметров принадлежат physical database/connection state и остаются `UNKNOWN`.

## Alembic graph

Alembic environment:

- использует metadata из `backend/models.py` для autogenerate context;
- получает URL из `DATABASE_URL`, если переменная задана, иначе из выбранного Alembic ini;
- использует `NullPool` для online migration connection;
- поддерживает online и offline migration modes.

На дату repository-проверки 2026-08-04 Alembic успешно разобрал configured graph:

- graph содержит исторические branch points и поэтому не является строго линейным;
- разрешён один repository head: `20260721_account_deletion_fields`;
- head revision ссылается на `20260713_subscription_points_debit_unique` как `down_revision`.

Это `CONFIRMED` для текущего repository checkout. Оно не доказывает текущую revision production DB и не подтверждает соответствие physical schema этому head.

В репозитории присутствуют два Alembic ini entry points с различными fallback SQLite paths: root `alembic.ini` и `backend/alembic.ini`. Production migration helper выполняется внутри backend container, где рабочий каталог и скопированный backend config связывают его с container environment. Во всех случаях заданный `DATABASE_URL` имеет приоритет в `backend/alembic/env.py`.

## Schema ownership

Текущий runtime содержит два подтверждённых механизма schema ownership:

1. `Base.metadata.create_all(bind=engine)` в `backend/main.py` создаёт отсутствующие ORM metadata objects при импорте application module.
2. Alembic применяет versioned `upgrade()` operations и ведёт revision state.

`create_all()` выполняется после импорта `Base` и `engine`, но до создания FastAPI application, регистрации startup handler и запуска Uvicorn serving lifecycle. Это не Alembic revision operation: оно не продвигает Alembic version table и не заменяет последовательные data/alter migrations.

Одновременное существование этих механизмов — `CONFIRMED dual-ownership`. Repository не определяет явную границу, при которой один механизм является единственным владельцем production schema. Возможные конфликты между ними являются failure scenarios, а не доказательством уже произошедшего повреждения или рассогласования.

## Startup and migration ordering

Repository-confirmed автоматизированный порядок имеет следующие существенные точки:

1. production workflow собирает application images;
2. запускает Compose services;
3. backend process импортирует `main.py` и выполняет `create_all()`;
4. FastAPI startup создаёт in-process background tasks и process становится доступен для HTTP;
5. workflow отдельно вызывает `scripts/prod/migrate.sh`;
6. helper выполняет `python -m alembic upgrade head` через `compose exec` в уже запущенном backend container.

Migration helper требует существующий запущенный backend container. В repository workflow отсутствует schema-readiness gate, который блокирует обслуживание запросов до успешного достижения Alembic head.

Другие tracked legacy scripts также содержат Alembic invocations, но само их наличие не доказывает, что они исполняются на текущем production host.

## Persistence and locking assumptions

- Production database является одним SQLite file в named Docker volume.
- Production Compose описывает один backend service instance; фактическое число processes на host — `UNKNOWN`.
- SQLite file является общей persistence boundary для web requests и всех in-process background tasks данного backend.
- `check_same_thread=False` позволяет threaded access через driver, но не создаёт межпроцессную координацию.
- В billing paths используется SQLAlchemy locking/status logic, но repository-confirmed distributed lock отсутствует.
- Repository не задаёт единый SQLite journal/timeout policy и не доказывает host-level locking behavior.

Связанные topology constraints и process multiplicity принадлежат [Production topology](../Infrastructure/production-topology.md); billing-specific конкурентные failure scenarios принадлежат [Debt — subscriptions billing](../Debt/subscriptions-billing.md).

## Failure scenarios

Ниже перечислены возможные последствия подтверждённого механизма. Они не означают, что failure уже наблюдался на production.

### Application starts before Alembic

Backend может начать startup lifecycle и стать HTTP-доступным до завершения `alembic upgrade head`. Если application code ожидает ещё не применённую schema, возможны request или background-task failures.

### `create_all()` changes Alembic starting conditions

На пустой или отстающей database `create_all()` может создать metadata objects до выполнения versioned migrations. Последующая migration, которая ожидает создать те же objects или пройти промежуточное schema state, может завершиться конфликтом, если конкретная revision не защищена от такого состояния.

### Revision and physical schema diverge

Alembic version table может не соответствовать фактическим tables/columns/constraints, например после non-Alembic schema creation или переноса database file. Repository не содержит startup validation, которая доказывает их соответствие.

### Concurrent writers contend

Web requests и background tasks пишут в один SQLite file. Дополнительные backend processes увеличили бы writer contention и могли бы дублировать in-process jobs; конкретное runtime число processes и частота contention — `UNKNOWN`.

### Shallow health does not detect schema readiness

Backend `/health` не обращается к database и поэтому не выявляет отстающую revision, missing objects или физическое рассогласование schema.

## Repository-known vs host-unknown

| Область | Repository-known | Host-unknown |
|---------|------------------|--------------|
| Production DB identity | SQLite URL `/data/bookme.db`, volume `dedato_data` | Фактический container environment, mount и file identity |
| ORM schema | Metadata, импортируемая из repository models | Соответствие physical schema текущим models |
| Alembic graph | Один repository head и исторические branches | Current host DB revision и migration history |
| Schema ownership | `create_all()` и Alembic оба исполняемы | Происходили ли конфликты или ручные schema changes |
| Ordering | Workflow запускает services до Alembic | Фактический активный deploy path и время доступности трафика |
| SQLite behavior | `check_same_thread=False`; один file path | Journal mode, timeout, active locks и integrity |
| Concurrency | Один backend service в Compose; jobs in-process | Workers, replicas, external writers и schedulers |
| Readiness | HTTP health не проверяет DB | External probes или host-side schema gates |

## Source anchors

- `docker-compose.prod.yml` — backend `DATABASE_URL`, `dedato_data` mount и service topology.
- `backend/settings.py` — `Settings.DATABASE_URL` и `default_database_url`.
- `backend/database.py` — engine, `check_same_thread=False`, `SessionLocal`, `Base`, `get_db`.
- `backend/main.py` — module-level `Base.metadata.create_all`, FastAPI construction, startup tasks и `/health`.
- `backend/alembic/env.py` — URL selection, `target_metadata`, online/offline migration execution и `NullPool`.
- `backend/alembic.ini` — container-side Alembic script location и fallback URL.
- `alembic.ini` — root Alembic entry point и fallback URL.
- `backend/alembic/versions/20260721_account_deletion_fields.py` — current repository head revision.
- `scripts/prod/migrate.sh` — Alembic execution inside running backend container.
- `.github/workflows/deploy.yml` — repository-confirmed start-before-migrate ordering.
- `Knowledge/Debt/subscriptions-billing.md` — confirmed SQLite and locking-related billing constraints.

## Related documents

- [Production topology](../Infrastructure/production-topology.md) — services, network, persistent volumes and process model.
- [Debt — subscriptions billing](../Debt/subscriptions-billing.md) — billing-specific concurrency and reliability constraints.
