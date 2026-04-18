# Archive inventory (review before bulk `git mv`)

Этот файл — **карта** для второго pass: что куда нести, что оставить.  
Массовые переносы — **только** после review и отдельного коммита.

## Классификация (см. корневой ответ / `REPO_AND_DEPLOY_HYGIENE.md`)

- **Архив** = история расследований, **не** operational runbook.
- **Official ops** = `PROD_DEPLOY.md`, `DATA_MIGRATION.md`, `RELEASE_CHECKLIST.md` — **никогда** не в `docs/archive/`.

## Root: кандидаты в `docs/archive/` (по темам)

| Тема | Примерные префиксы (корень) | Целевая папка (после согласования) |
|------|------------------------------|-------------------------------------|
| Loyalty / quick-tab | `LOYALTY_*.md` в **корне** | `docs/archive/by-topic/loyalty/` — **выполнено (101 файл, `git mv`)**; `docs/LOYALTY_*.md` не трогались |
| Master services / public API | `MASTER_*.md` в **корне** | `docs/archive/by-topic/master-api/` — **выполнено (17 файлов, `git mv`)**; `docs/MASTER_*` не трогались |
| Robokassa (старые гайды) | `ROBOKASSA_*.md` | `docs/archive/by-topic/integrations/` — **REVIEW** (часть может дублировать `backend/docs/`) |
| Разовые fix/deploy заметки | `FIX_*.md`, `QUICK_*.md`, `CHECK_*.md`, `DEPLOYMENT_*`, `DEPLOY_*`, `README_COPY_DB` и сопутствующие (см. список) | `docs/archive/by-topic/deploy-legacy/` — **выполнено (36 корневых .md, `git mv` + `README` в папке)**; triplet/официальные `docs/PROD*`-уровня не трогались |
| E2E polish (корень) | `E2E_*.md` | `docs/archive/by-topic/e2e-history/` |
| Patches (не исходники) | `*.patch`, `LOYALTY_UNIFIED_PATCH.txt` | `docs/archive/scratch-patches/` |

## Root: оставить в корне (KEEP)

- `README.md`, `PROD_DEPLOY.md`, `DATA_MIGRATION.md`, `RELEASE_CHECKLIST.md`
- `Makefile` (если рабочий)
- `package.json` / `package-lock.json` (корневой монorepo) — **REVIEW** если дублирует frontend

## Root: REVIEW вручную (не в архив без чтения)

- (Ранее в этом pass перенесены `DEPLOY*`, `QUICK_*` и т.д. — сверяйте с [by-topic/deploy-legacy/](by-topic/deploy-legacy/).)  
- (Выполнено) `MIGRATION_GUIDE` → [../development/MIGRATION_GUIDE.md](../development/MIGRATION_GUIDE.md).  
- (Выполнено) `SSL_SETUP_INSTRUCTIONS.md` удалён из корня: в нём был **реальный приватный RSA-ключ**; заменён на [../internal/SSL_TLS_SERVER_TEMPLATE.md](../internal/SSL_TLS_SERVER_TEMPLATE.md) (секреты не копируются; при утечке в git — **ротация ключа** на сервере). **Ops follow-up:** [../internal/SECURITY_TLS_KEY_LEAK_FOLLOWUP.md](../internal/SECURITY_TLS_KEY_LEAK_FOLLOWUP.md).  
- `dedato-landing-brief-for-cursor.md` — product/marketing → **REVIEW**
- `AdminSettings — копия.jsx` — **мусор/битый** дубликат → **удалить или в archive** после факта, что в проекте нет ссылок
- `DeDato logo card*.png`, `Logo Dedato.png`, `Dedato_404.mp4` → **REVIEW** (лучше `frontend/public/` / маркетинг, не `docs/archive`)

## docs/active — ориентиры (первую очередь **не** трогать)

- `docs/SMOKE_RESEED_MAP.md`, `docs/E2E_RUNBOOK.md`, `docs/TEST_DATA_*.md`, `docs/architecture/`, `docs/mobile/`

## Следующий шаг (рекомендуемый)

1. (Выполнено) ~~корневые `FIX_*` / `QUICK_*` / `CHECK_*` / `DEPLOY*→deploy-legacy/`~~.  
2. (Ранее выполнено) ~~MASTER_* → master-api/~~, ~~LOYALTY_* в корне → loyalty/~~.
3. Опционально: выборочный перенос `docs/*LOYALTY*REPORT*.md` — **отдельное решение** (сейчас спека/гайды в `docs/LOYALTY_*.md` остаются на месте).
