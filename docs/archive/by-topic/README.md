# by-topic (архив по темам)

Мелко не дробим (не десятки вложенных папок). Схема:

- `loyalty/` — **корневые** `LOYALTY_*.md` перенесены сюда (батч 1). Содержимое `docs/LOYALTY_*.md` **не** перемещалось.
- `master-api/` — **корневые** `MASTER_*.md` (17) перенесены сюда; `docs/MASTER_*` не трогались
- `deploy-legacy/` — `FIX_*`, `CHECK_*`, `QUICK_*`, `DEPLOYMENT_*`, `DEPLOY_*` и сопутствующие; **выполнено (36 `git mv` из корня, см. [deploy-legacy/README](deploy-legacy/README.md))**
- `project-history/` — разовые `COMMIT_PLAN` / `IMPLEMENTATION_SUMMARY` (история фич, не runbook), см. [project-history/README](project-history/README.md)
- `e2e-history/` — презентабельные, но **не** активные runbook'и (`E2E_*` в корне, часть `docs/*E2E*REPORT*`)
- `integrations/` — `ROBOKASSA_*.md` (после сверки с `backend/docs/`)

Перемещение батчами, один коммит = одна тема.
