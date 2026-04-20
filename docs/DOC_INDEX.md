# Документация DeDato — навигация

## Операции (production)

| Документ | Назначение |
|----------|------------|
| `PROD_DEPLOY.md` (корень репо) | Runbook deploy, пути, compose |
| `DATA_MIGRATION.md` (корень репо) | Import/export датасета |
| `RELEASE_CHECKLIST.md` (корень репо) | Чеклист релиза |
| [REPO_AND_DEPLOY_HYGIENE.md](REPO_AND_DEPLOY_HYGIENE.md) | Гигиена репо + сервера, политика ignore vs archive |

## Разработка / тесты (активно используемые)

| Путь | Назначение |
|------|------------|
| [SMOKE_RESEED_MAP.md](SMOKE_RESEED_MAP.md) | Якоря reseed, M5/M8/M9 |
| [E2E_RUNBOOK.md](E2E_RUNBOOK.md) | E2E (web) |
| [TEST_DATA_ACCOUNTS.md](TEST_DATA_ACCOUNTS.md) | Тестовые учётки |
| [architecture/api-design.md](architecture/api-design.md) | API (справочно) |
| [development/MIGRATION_GUIDE.md](development/MIGRATION_GUIDE.md) | Схема БД: Alembic (не путать с корневым `DATA_MIGRATION.md` — перенос датасета) |
| [internal/SSL_TLS_SERVER_TEMPLATE.md](internal/SSL_TLS_SERVER_TEMPLATE.md) | Шаблон TLS/nginx **без секретов** (см. предупреждение в файле) |
| [internal/SECURITY_TLS_KEY_LEAK_FOLLOWUP.md](internal/SECURITY_TLS_KEY_LEAK_FOLLOWUP.md) | Internal: утечка TLS key в git — проверки, порядок действий, history |
| [internal/TLS_ROTATION_RUNBOOK_DEDATO_RU.md](internal/TLS_ROTATION_RUNBOOK_DEDATO_RU.md) | Internal: ротация TLS на хосте после MATCH (срочно) |
| [internal/POST_INCIDENT_REPO_HARDENING.md](internal/POST_INCIDENT_REPO_HARDENING.md) | Internal: после ротации — history, gitleaks, политика репо |
| [internal/GIT_HISTORY_REWRITE_TLS_PLAN.md](internal/GIT_HISTORY_REWRITE_TLS_PLAN.md) | Internal: план git filter-repo (TLS secret в истории), без auto-run |
| [internal/GIT_HISTORY_REWRITE_INVENTORY_FINAL.md](internal/GIT_HISTORY_REWRITE_INVENTORY_FINAL.md) | Internal: финальный scope путей перед rewrite |

## Архив (история, не runbook)

Файлы лежат в `docs/archive/` в репозитории; **в MkDocs не собираются** (`exclude_docs`). Навигация по смыслу:

- `docs/archive/INVENTORY.md` — план и списки на review
- `docs/archive/by-topic/*` — тематические архивы (loyalty, master-api, deploy-legacy, project-history)
- `docs/archive/scratch-patches/` — сырые патчи (не замена `git log`)

*В `docs/` остаётся много `*_REPORT.md` — вынос в `archive/` — второй pass (см. INVENTORY).*
