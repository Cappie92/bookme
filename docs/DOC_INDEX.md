# Документация DeDato — навигация

## Операции (production)

| Документ | Назначение |
|----------|------------|
| [../PROD_DEPLOY.md](../PROD_DEPLOY.md) | Runbook deploy, пути, compose |
| [../DATA_MIGRATION.md](../DATA_MIGRATION.md) | Import/export датасета |
| [../RELEASE_CHECKLIST.md](../RELEASE_CHECKLIST.md) | Чеклист релиза |
| [REPO_AND_DEPLOY_HYGIENE.md](REPO_AND_DEPLOY_HYGIENE.md) | Гигиена репо + сервера, политика ignore vs archive |

## Разработка / тесты (активно используемые)

| Путь | Назначение |
|------|------------|
| [SMOKE_RESEED_MAP.md](SMOKE_RESEED_MAP.md) | Якоря reseed, M5/M8/M9 |
| [E2E_RUNBOOK.md](E2E_RUNBOOK.md) | E2E (web) |
| [TEST_DATA_ACCOUNTS.md](TEST_DATA_ACCOUNTS.md) | Тестовые учётки |
| [architecture/api-design.md](architecture/api-design.md) | API (справочно) |
| [development/MIGRATION_GUIDE.md](development/MIGRATION_GUIDE.md) | Схема БД: Alembic (не путать с [DATA_MIGRATION.md](../DATA_MIGRATION.md)) |
| [internal/SSL_TLS_SERVER_TEMPLATE.md](internal/SSL_TLS_SERVER_TEMPLATE.md) | Шаблон TLS/nginx **без секретов** (см. предупреждение в файле) |
| [internal/SECURITY_TLS_KEY_LEAK_FOLLOWUP.md](internal/SECURITY_TLS_KEY_LEAK_FOLLOWUP.md) | Internal: утечка TLS key в git — проверки, порядок действий, history |
| [internal/TLS_ROTATION_RUNBOOK_DEDATO_RU.md](internal/TLS_ROTATION_RUNBOOK_DEDATO_RU.md) | Internal: ротация TLS на хосте после MATCH (срочно) |
| [internal/POST_INCIDENT_REPO_HARDENING.md](internal/POST_INCIDENT_REPO_HARDENING.md) | Internal: после ротации — history, gitleaks, политика репо |

## Архив (история, не runbook)

- [archive/INVENTORY.md](archive/INVENTORY.md) — план и списки на review
- [archive/by-topic/](archive/by-topic/) — тематические архивы:
  - **loyalty (корень):** [by-topic/loyalty/](archive/by-topic/loyalty/) — 101 `LOYALTY_*.md`
  - **master API / public services (корень):** [by-topic/master-api/](archive/by-topic/master-api/) — 17 `MASTER_*.md`
  - **deploy / fix / check / quick (корень, legacy):** [by-topic/deploy-legacy/](archive/by-topic/deploy-legacy/) — 36 корневых .md, не triplet
  - **project-history:** [by-topic/project-history/](archive/by-topic/project-history/) — планы/итоги старых фич
- [archive/scratch-patches/](archive/scratch-patches/) — сырые патчи (не замена `git log`)

*В `docs/` остаётся много `*_REPORT.md` — вынос в `archive/` — второй pass (см. INVENTORY).*
