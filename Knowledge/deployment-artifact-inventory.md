---
type: Knowledge
project: DeDato
knowledge_class: living
environment: prod
status: active
last_verified: 2026-08-05
---

# Deployment artifact inventory

## Scope

Этот документ владеет repository-known классификацией production deployment, migration, backup, restore, import/export и host/data-oriented emergency артефактов DeDato. Он определяет поддерживаемый обычный entry point, отделяет supporting и specialized paths от legacy/historical файлов и фиксирует риски, видимые из repository.

Документ не является production runbook. Он не подтверждает фактические host paths, containers, Compose implementation, reverse proxy, данные, credentials или историю запуска файлов. Все сведения об использовании на host имеют статус `UNKNOWN`, пока не выполнена отдельная разрешённая host verification.

Alembic revisions, runtime services/modules, automated tests и явно local/dev QA seed utilities не являются delivery/host artifacts этого inventory и остаются у своих schema, runtime и testing owners. Production-named smoke seed и standalone emergency data utilities включены из-за их production-adjacent mutation scope.

Topology принадлежит [Production topology](production-topology.md), database/schema lifecycle — [Data and migrations](data-and-migrations.md), а workflow semantics — [CI/CD](ci-cd.md). Этот inventory не повторяет их детальные контракты.

## Classification and selection rule

| Classification | Значение |
|---|---|
| **CURRENT PRIMARY** | Единственный repository-supported entry point обычного production deploy |
| **CURRENT SUPPORTING** | Конфигурация или helper, прямо используемые primary path |
| **SPECIALIZED** | Артефакт для ограниченного data/host сценария; не является обычным deploy и требует отдельного owner-approved runbook |
| **LEGACY** | Конкурирующий путь с устаревшими topology, naming, storage или delivery assumptions; не должен выбираться для обычного deploy |
| **HISTORICAL** | Feature-specific, recovery или разовый артефакт прошлого изменения; наличие в repository не делает его текущей процедурой |
| **UNKNOWN HOST USAGE** | Назначение видно, но repository недостаточно для подтверждения его совместимости с фактической host configuration |

Для обычного production deploy repository-supported entry point — только root workflow `.github/workflows/deploy.yml`. Его supporting boundary состоит из `docker-compose.prod.yml`, `scripts/prod/compose.sh` и `scripts/prod/migrate.sh`. Specialized data и host helpers не являются шагами обычного release. `LEGACY` и `HISTORICAL` не означают доказанный retirement: фактический запуск любого tracked файла на production host остаётся `UNKNOWN`.

## Inventory summary

| Classification | Count |
|---|---:|
| CURRENT PRIMARY | 1 |
| CURRENT SUPPORTING | 3 |
| SPECIALIZED | 10 |
| LEGACY | 14 |
| HISTORICAL | 21 |
| UNKNOWN HOST USAGE | 1 |
| **Total** | **50** |

## Executable and delivery artifacts

`Host usage` описывает только то, что можно установить без production access. `Workflow-referenced` означает repository linkage, а не доказательство успешного исполнения на host.

| Path | Purpose | Classification | Evidence | Host usage | Risk |
|---|---|---|---|---|---|
| `.github/workflows/deploy.yml` | Обычный production delivery на push в `main` или вручную | CURRENT PRIMARY | Root workflow прямо использует current Compose и migration helpers | Trigger и wiring подтверждены; execution history и host result `UNKNOWN` | Нет test gate; services стартуют до Alembic; health shallow |
| `docker-compose.prod.yml` | Production service, network и volume definition | CURRENT SUPPORTING | Прямо используется primary workflow и current prod helpers | Workflow-referenced; active host definition `UNKNOWN` | Repository topology может отличаться от active host overrides/state |
| `scripts/prod/compose.sh` | Compatibility wrapper для двух Compose CLI forms | CURRENT SUPPORTING | Sourced primary workflow и migration helper | Workflow-referenced; active host CLI `UNKNOWN` | Проверяет наличие CLI, но не host topology или version-specific behavior |
| `scripts/prod/migrate.sh` | Alembic upgrade для database backend container | CURRENT SUPPORTING | Прямо вызывается primary workflow после service start | Workflow-referenced; host DB revision/result `UNKNOWN` | Нет pre-service schema gate или physical-schema verification |
| `scripts/prod/backup_sqlite.sh` | Архив database file и uploads из named volumes | SPECIALIZED | Использует current volume/file names | Не вызывается primary workflow; host use `UNKNOWN` | Live SQLite copy, best-effort uploads, нет integrity/checksum/retention evidence |
| `scripts/prod/export_dataset.sh` | Экспорт локального database file и uploads в dataset archive | SPECIALIZED | Согласован с paired import format | Не вызывается primary workflow; host use `UNKNOWN` | Проверяет archive shape/file counts, но не DB integrity/revision или cross-data consistency |
| `scripts/prod/import_dataset.sh` | Замена production database и дополнение uploads из dataset archive | SPECIALIZED | Использует current Compose file и named volumes | Не вызывается primary workflow; host use `UNKNOWN` | Останавливает stack и перезаписывает state без встроенного pre-import backup или post-validation |
| `scripts/prod/restore_sqlite.sh` | Восстановление database/uploads из backup archive | SPECIALIZED | Использует current volume/file names | Не вызывается primary workflow; host use `UNKNOWN` | Destructive replacement и restart без checksum, DB integrity/revision или health verification |
| `scripts/deploy-well-known.sh` | Публикация mobile association files и изменение host Nginx | SPECIALIZED | Связан с tracked `deploy/well-known/` assets | Вне primary workflow; active proxy/use `UNKNOWN` | Mutates host proxy boundary, которую repository не может подтвердить |
| `backend/scripts/runbook_config_check.sh` | Проверка наличия и parseability backend configuration categories | SPECIALIZED | Самостоятельный runbook-oriented checker, не вызываемый delivery workflow | Active host config/use `UNKNOWN` | Не подтверждает provider connectivity, secret validity или полноту runtime environment |
| `backend/scripts/export_service_functions.py` | Экспорт service-function records в переносимый application-data artifact | SPECIALIZED | Repository script читает соответствующие records и создаёт export file | Не вызывается primary workflow; host use `UNKNOWN` | Нет канонического import pair, schema/version contract или approved transfer procedure |
| `backend/scripts/export_subscription_plans.py` | Экспорт master subscription-plan records | SPECIALIZED | Repository script создаёт отдельный plan export artifact | Не вызывается primary workflow; host use `UNKNOWN` | Нет канонического import pair, compatibility validation или approved transfer procedure |
| `backend/scripts/prod_smoke_seed.py` | Entry wrapper для production-stats smoke dataset | SPECIALIZED | Прямо делегирует специализированному reseed artifact | Не вызывается primary workflow; host use `UNKNOWN` | Production-adjacent data mutation не является deployment gate или обычным seed path |
| `backend/scripts/reseed_prod_stats_smoke.py` | Создание/обновление production-stats smoke data | SPECIALIZED | Explicit production-smoke naming и scoped data guards в repository | Не вызывается primary workflow; host use `UNKNOWN` | Может изменять persistent business data; applicability and cleanup require owner review |
| `copy_db_to_server.sh` | Копирование локального SQLite file в server working tree | LEGACY | Использует working-tree DB path вместо current named-volume database identity | Не referenced current workflow; host use `UNKNOWN` | Может заменить данные вне current storage contract |
| `deploy-nginx.sh` | Копирование и активация tracked host Nginx config | LEGACY | Tracked config assumptions не связаны с current Compose lifecycle | Не referenced current workflow; host use `UNKNOWN` | Может изменить host routing/TLS при неизвестной active configuration |
| `deploy_full.sh` | Полная синхронизация application tree, backup, migration и restart | LEGACY | Старый server layout и application-file DB assumptions | Не referenced current workflow; host use `UNKNOWN` | Competing full deploy, destructive stop/rebuild и неоднозначный DB path |
| `deploy_full_fixed.sh` | Вариант полного deploy с дополнительными fallback checks | LEGACY | Сохраняет те же старые layout/storage assumptions | Не referenced current workflow; host use `UNKNOWN` | Fallback paths не устраняют конкурирующий lifecycle и DB ambiguity |
| `deploy_latest.sh` | Полная замена checkout и Compose restart | LEGACY | Использует non-production Compose default и volume-destructive cleanup | Не referenced current workflow; host use `UNKNOWN` | Может удалить volumes и обойти current migration/supporting helpers |
| `deploy_update_server.sh` | Server-side repository update, migration и service restart | LEGACY | Старый server layout; migration failure допускается как optional | Не referenced current workflow; host use `UNKNOWN` | Может продолжить deployment после migration failure |
| `deploy_update_server_fixed.sh` | Альтернативный server-side update с migration fallbacks | LEGACY | Старый layout и несколько несогласованных execution modes | Не executable bit; host invocation `UNKNOWN` | Fallback behavior может скрыть schema failure и расходится с primary path |
| `fast_deploy.sh` | Archive-based полная замена server tree | LEGACY | Старый layout и independent Compose lifecycle | Не referenced current workflow; host use `UNKNOWN` | Replaces application tree и останавливает stack вне primary safeguards |
| `manual_deploy.sh` | Подготовка transfer archive с application и database copy | LEGACY | Working-tree backup/file assumptions не соответствуют current volume identity | Не referenced current workflow; host use `UNKNOWN` | Пакует mutable data вместе с code и создаёт альтернативный release path |
| `quick_deploy.sh` | Полная remote copy и Compose startup | LEGACY | Сам файл помечен legacy; документирует риск floating project name | Не referenced current workflow; host use `UNKNOWN` | Competing namespace/volume lifecycle и destructive tree replacement |
| `stable_deploy.sh` | File-by-file remote copy и Compose startup с retries | LEGACY | Старый server layout и independent deploy sequence | Не referenced current workflow; host use `UNKNOWN` | Retries не подтверждают schema/data correctness; обход primary workflow |
| `scripts/deploy.sh` | Generic Appointo dev/prod deploy | LEGACY | Старое product naming и mixed default/prod Compose assumptions | Не referenced current workflow; host use `UNKNOWN` | Неоднозначный environment path и competing deploy lifecycle |
| `scripts/safe-deploy.sh` | Generic Appointo backup/migrate/rebuild flow | LEGACY | Working-container DB path и default Compose assumptions | Не referenced current workflow; host use `UNKNOWN` | Название `safe` не подтверждено current topology; rollback/readiness incomplete |
| `scripts/update.sh` | Generic Appointo remote update | LEGACY | Старое product naming/layout и mixed Compose assumptions | Не referenced current workflow; host use `UNKNOWN` | Competing update path without current migration contract |
| `create_script_on_server.sh` | Генерация recovery script, создающего application source files на host | HISTORICAL | One-off missing-file repair content | Не referenced current workflow; host use `UNKNOWN` | Mutates runtime source outside versioned delivery |
| `create_test_users_on_server.sh` | Создание test accounts через server-side application context | HISTORICAL | One-off production-adjacent seed intent | Не referenced current workflow; host use `UNKNOWN` | Может изменять production data и создавать non-production identities |
| `deploy_loyalty.sh` | Feature-specific delivery Loyalty files и migration | HISTORICAL | Привязан к прошлой named feature/migration | Не referenced current workflow; host use `UNKNOWN` | Partial-file deploy can diverge code and migration graph |
| `deploy_restrictions_changes.sh` | Feature-specific delivery restriction files и migration | HISTORICAL | Привязан к прошлому change set | Не referenced current workflow; host use `UNKNOWN` | Partial-file deploy can produce mixed application versions |
| `fix_missing_files_on_server.sh` | Создание missing frontend source files directly on host | HISTORICAL | Recovery payload duplicates source rather than delivering checkout | Не referenced current workflow; host use `UNKNOWN` | Creates untracked host drift outside repository review |
| `upload_archive.sh` | Upload одного named deployment archive | HISTORICAL | Hard-coded dated artifact intent and transfer-only scope | Не referenced current workflow; host use `UNKNOWN` | Archive provenance/content and server-side application are unverified |
| `backend/cleanup_old_data.py` | Интерактивное удаление old application data | HISTORICAL | Standalone confirmation-based database cleanup | Не referenced current workflow; host use `UNKNOWN` | Destructive data mutation outside current migration/retention contract |
| `backend/fix_schedule_data.py` | One-off correction schedule records | HISTORICAL | Direct record-repair function outside Alembic | Не referenced current workflow; host use `UNKNOWN` | Mutates business data without a current runbook or host-state preconditions |
| `backend/fix_service_durations.py` | Normalization and verification service durations | HISTORICAL | Direct repair plus distribution verification | Не referenced current workflow; host use `UNKNOWN` | Historical normalization assumptions may not match current catalog rules |
| `backend/migrate_unified_master.py` | One-off data conversion to unified master model | HISTORICAL | Direct application-data migration outside current Alembic graph | Не referenced current workflow; host use `UNKNOWN` | Re-execution/idempotency and compatibility with current schema are unverified |
| `backend/scripts/cleanup_dirty_bookings.py` | Backup-assisted deletion of selected booking-related data | HISTORICAL | Standalone database discovery, backup and batch-deletion artifact | Не referenced current workflow; host use `UNKNOWN` | Destructive cleanup uses its own DB discovery/backup assumptions |
| `backend/scripts/fix_test_accounts_subscriptions.py` | Repair subscription state for named test-account scope | HISTORICAL | Explicit test-account repair utility | Не referenced current workflow; host use `UNKNOWN` | Account selection and current entitlement semantics require separate review |
| `backend/scripts/update_free_plan_limit.py` | One-off mutation Free-plan limits | HISTORICAL | Direct plan lookup/update utility | Не referenced current workflow; host use `UNKNOWN` | Bypasses current plan-management/API governance and audit context |
| `backend/update_salon_bookings.py` | One-off correction salon booking associations | HISTORICAL | Direct DB update and reporting utility | Не referenced current workflow; host use `UNKNOWN` | Historical ownership assumptions may not match current booking lifecycle |
| `backend/update_salon_domain.py` | One-off mutation salon public domain | HISTORICAL | Direct domain lookup/conflict/update utility | Не referenced current workflow; host use `UNKNOWN` | Bypasses current domain mutation contract and authorization boundary |
| `backend/update_unified_logic.py` | One-off update of records for unified work logic | HISTORICAL | Direct application-data transformation outside Alembic | Не referenced current workflow; host use `UNKNOWN` | Re-execution and compatibility with current models are unverified |
| `check_deployment_step.py` | Standalone HTTP checks for an older deployment sequence | HISTORICAL | Independent API/frontend endpoint checker, absent from current workflow | Не referenced current workflow; target/use `UNKNOWN` | Endpoint availability does not prove schema, data or dependency readiness |
| `update_test_data_statuses.py` | One-off rewrite/generation of test booking statuses | HISTORICAL | Direct test-data update utility | Не referenced current workflow; host use `UNKNOWN` | Could modify shared data if run against an unintended database |
| `update_master_passwords.py` | Account credential-maintenance utility | HISTORICAL | Path-level repository evidence only; credential-like content is not reproduced | Не referenced current workflow; validity/use `UNKNOWN` | Sensitivity `HIGH`; requires separate security remediation and must not be treated as deploy tooling |
| `create_test_masters.py` | Creation of test master records | HISTORICAL | Root executable test-data utility | Не referenced current workflow; host use `UNKNOWN` | Could create non-production identities/data in an unintended environment |
| `backend/scripts/create_simple_test_users.py` | Creation of simplified test users | HISTORICAL | Executable test-data utility | Не referenced current workflow; host use `UNKNOWN` | Credential/account material and target database require separate controlled handling |
| `check_ssl_status.sh` | Диагностика certificate files, Nginx and listeners | UNKNOWN HOST USAGE | Host-oriented checks without linkage to current proxy lifecycle | Active paths/proxy/use `UNKNOWN` | Results depend on unverified host layout and must not be treated as topology evidence |

## Backup, restore, import and export boundary

The four data artifacts cover two repository formats:

- `scripts/prod/backup_sqlite.sh` and `scripts/prod/restore_sqlite.sh` operate on the current production-named SQLite and uploads volumes;
- `scripts/prod/export_dataset.sh` packages a working-tree SQLite file plus the uploads tree, while `scripts/prod/import_dataset.sh` writes that format into current production-named volumes.

Repository evidence does not establish an atomic snapshot between SQLite and uploads, database integrity, schema revision compatibility, archive checksum/signature, encryption, retention, off-host replication, restore rehearsal, capacity checks, RPO or RTO. Import/restore are destructive state-replacement capabilities, not approved procedures. A usable Operations backup/restore runbook requires explicit owner approval, script safety review and host verification; none is inferred from the scripts' presence.

## Non-executable repository evidence

| Path | Repository-known role | Canonical boundary |
|---|---|---|
| `PROD_DEPLOY.md` | Describes GitHub-first intent and references current prod artifacts | Supporting evidence only; its host statements and command sequences are not canonical or host-verified |
| `DATA_MIGRATION.md` | Describes dataset transfer intent and current volume names | Supporting evidence only; not an approved migration or restore procedure |
| `RELEASE_CHECKLIST.md` | Repository checklist spanning deploy, data replacement and rollback | Supporting evidence only; completion and host applicability are `UNKNOWN` |
| `nginx-dedato.conf` | Tracked host-proxy candidate | Active use is `UNKNOWN`; topology canon records its mismatch with current published-port assumptions |
| `deploy/well-known/` | Mobile association assets and templates | Content source for the specialized helper; deployment state is external |
| `docs/archive/by-topic/deploy-legacy/` | Explicitly archived deploy/fix/check notes | HISTORICAL evidence; never a current operational entry point |

## Repository-known risks and host-only unknowns

- Root and generic deployment scripts remain tracked, searchable and in many cases executable. Classification prevents canonical selection but does not quarantine or retire them.
- Several legacy scripts embed older server layout, Compose project, database path, product naming or partial-file delivery assumptions.
- Specialized import/restore paths can overwrite persistent state; repository checks are insufficient to approve execution.
- Production-adjacent seed, cleanup, fix and update utilities are not part of ordinary deploy; historical classification does not prove that none was ever run.
- The primary workflow transfers mutable checkout content and rebuilds on host; test gates, immutable artifact promotion and schema-first readiness are absent.
- Active host checkout, invoked entry point, scheduled jobs, backup inventory, restore history, reverse proxy and Compose/runtime versions remain `UNKNOWN`.

## Source anchors

- `.github/workflows/deploy.yml` — current trigger, transfer, Compose, migration and health wiring.
- `docker-compose.prod.yml` — current service, network, volume and database identity.
- `scripts/prod/compose.sh`; `scripts/prod/migrate.sh` — current supporting helpers.
- `scripts/prod/backup_sqlite.sh`; `scripts/prod/restore_sqlite.sh` — backup archive and restore semantics.
- `scripts/prod/export_dataset.sh`; `scripts/prod/import_dataset.sh` — dataset archive and import semantics.
- Root `deploy*.sh`, `fast_deploy.sh`, `quick_deploy.sh`, `stable_deploy.sh`, `manual_deploy.sh` — competing deployment variants.
- `scripts/deploy.sh`; `scripts/update.sh`; `scripts/safe-deploy.sh` — generic legacy variants.
- `copy_db_to_server.sh`; `upload_archive.sh`; `create_script_on_server.sh`; `create_test_users_on_server.sh`; `fix_missing_files_on_server.sh` — data-transfer and recovery variants.
- `backend/scripts/runbook_config_check.sh`; `backend/scripts/prod_smoke_seed.py`; `backend/scripts/reseed_prod_stats_smoke.py` — specialized configuration/smoke helpers.
- `backend/scripts/export_service_functions.py`; `backend/scripts/export_subscription_plans.py` — narrow application-data export utilities.
- Root/backend cleanup, fix, update, migrate and test-data utilities listed in the inventory — historical production-adjacent data mutation evidence.
- `scripts/deploy-well-known.sh`; `deploy/well-known/`; `deploy-nginx.sh`; `check_ssl_status.sh`; `nginx-dedato.conf` — host proxy/TLS and association-file boundary.
- `PROD_DEPLOY.md`; `DATA_MIGRATION.md`; `RELEASE_CHECKLIST.md`; `docs/archive/by-topic/deploy-legacy/` — noncanonical and historical evidence.

## Related documents

- [CI/CD](ci-cd.md) — root workflow behavior and delivery gates.
- [Production topology](production-topology.md) — Compose/network/storage and host-unknown boundary.
- [Data and migrations](data-and-migrations.md) — SQLite identity, Alembic and schema lifecycle.
- [Testing strategy](testing-strategy.md) — executable test tiers absent from production deploy gates.
