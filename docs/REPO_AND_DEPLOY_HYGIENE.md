# Репозиторий и deploy: гигиена после первого production (policy)

Документ фиксирует **правила** после успешного первого prod. Не заменяет `PROD_DEPLOY.md` / `DATA_MIGRATION.md` / `RELEASE_CHECKLIST.md` — дополняет их с точки зрения **порядка в git и на сервере**.

---

## 1. Что допустимо в git (KEEP)

- Runtime-код: `backend/`, `frontend/`, `mobile/`, `shared/` (если используется).
- Миграции: `backend/alembic/`.
- Тесты: `backend/tests/`, `frontend/e2e/`, `mobile/__tests__/` и т.д.
- Production-контракт: `docker-compose.prod.yml`, `deploy/prod/backend.env.example`, `frontend/nginx.conf` (образ), `.github/workflows/deploy.yml`.
- Ops-скрипты: `scripts/prod/*`.
- Операционная документация: корневые `PROD_DEPLOY.md`, `DATA_MIGRATION.md`, `RELEASE_CHECKLIST.md`, `README.md`, важные гайды в `docs/` (см. раздел 7 ниже).

## 2. Что не допустимо в git (IGNORE / не коммитить)

- Любые `*.db`, журналы SQLite, копии `bookme_*.db`.
- `uploads/`, `backend/uploads/` (файлы пользователей/медиа).
- `artifacts/`, `test-results/`, `backups/`, `*.tar.gz` / `*.tgz` (датасеты, бэкапы).
- `deploy/prod/backend.env` (секреты).
- Патчи `*.patch`, `*.log.jsonl`, `Thumbs.db`, `*.ics` (дампы календаря в dev).

**Секреты (ключи, `BEGIN * PRIVATE KEY`, пароли, токены в явном виде):** не коммитить. CI: `.github/workflows/gitleaks.yml` (скан рабочего дерева). Политика и history: [`docs/internal/POST_INCIDENT_REPO_HARDENING.md`](internal/POST_INCIDENT_REPO_HARDENING.md). Опционально локально: `.pre-commit-config.yaml`.

**Blanket-игнор всех `*.md` не используется** — в репозитории много **легитимных** doc-файлов. Разовые отчёты убираем через **перенос в `docs/archive/`** или **удаление** после review, а не маской в `.gitignore`.

**Массовая уборка корня и `docs/`:**
см. **`docs/archive/INVENTORY.md`** (список кандидатов и схема `by-topic/`) — перенос **батчами** и только после review.

## 3. Каноническая структура репозитория (целевое)

| Путь | Назначение |
|------|------------|
| `backend/`, `frontend/`, `mobile/`, `shared/` | Код |
| `deploy/` | Только **шаблоны** и публичный контракт (`backend.env.example`, `well-known/`, …) |
| `scripts/prod/` | Прод-операции: backup, restore, import/export, migrate |
| `scripts/dev/` | Dev/one-off (постепенный перенос из `scripts/`) |
| `docs/` | Актуальные гайды, архитектура, `SMOKE_RESEED_MAP` и т.д. |
| `docs/archive/` | Завершённые отчёты, superseded doc |
| `docs/internal/` | Внутренняя заметочная дока (по соглашению) |
| **Корень** | Минимум: `README.md`, operational triplet (`PROD_*.md`, `DATA_*.md`, `RELEASE_*.md`), `docker-compose.prod.yml`, `Makefile` / `package.json` при необходимости. **Не** хранить в корне десятки `*REPORT*.md` — перенос в `docs/archive/` или удаление. |

## 4. Разделение: deploy кода и данные

| Процедура | Команды / артефакты | SSoT |
|-----------|---------------------|------|
| Обычный deploy | `git pull` / GitHub Action → `docker compose … up -d --build` → `migrate.sh` | Код в **Git** |
| Данные (dataset) | `export_dataset.sh` / `import_dataset.sh` толькопо runbook | **Volume** + архив **вне** репо |
| Бэкап | `scripts/prod/backup_sqlite.sh` → `backups/` | Snapshot на диске сервера |
| Восстановление | `restore_sqlite.sh` | Только осознанно, после остановки стека |

## 5. Канонические пути на сервере (рекомендация)

Все **вне** путей Docker volume (данные в named volumes, не в дереве исходников).

| Путь | Содержимое |
|------|------------|
| `/opt/dedato` | Клон репозитория (код) |
| `/opt/dedato/deploy/prod/backend.env` | Секреты, **не в git** |
| `/opt/dedato/backups/` | Выход `backup_sqlite.sh` (в `.gitignore` как `backups/`) |
| `/opt/dedato/artifacts/incoming/` (создать вручную) | Входящие `dedato_dataset_*.tar.gz` до `import_dataset.sh` |
| `/var/lib/docker/volumes/…` | `dedato_data`, `dedato_uploads`, `dedato_logs` (Docker) |

**Не** складывать в дерево репо на сервере: долгосрочные `*.db`, `*.tar.gz` бэкапов, personal dataset — только в `backups/`, `artifacts/`, вне `backend/` **или** внешний каталог (например `/var/lib/dedato/datasets`) при желании вынести с диска приложения.

**HTTPS:** типично host **nginx/traefik/caddy** слушает 443 и проксирует на `127.0.0.1:80` (порт, опубликованный compose для frontend). Схема TLS — в **конфиге хоста**, не внутри `docker-compose.prod.yml` (там публикуется HTTP:80). Проверки: `PROD_DEPLOY.md`, раздел про health.

## 6. План документации (актуализация)

- **Первоочередь:** `PROD_DEPLOY.md`, `DATA_MIGRATION.md`, `RELEASE_CHECKLIST.md`, корневой `README.md` (ссылка на operational docs).
- **Второй проход:** проредить `docs/*_REPORT*.md` → `docs/archive/` или delete.
- **Сохранить** как ссылочно полезные: `docs/SMOKE_RESEED_MAP.md`, `docs/TEST_DATA_*.md`, `docs/E2E_RUNBOOK.md` (по соглашению команды).

## 7. Безопасный порядок cleanup (второй pass)

1. Убедиться, что **prod** стабилен; сделать **backup** на сервере.
2. Локально: `git status` — нет незакоммиченного критичного.
3. Вынести мусор из корня: `git mv` отчёты в `docs/archive/`, не `git add` важных секретов.
4. **Не** `git clean -fdx` без `-n` и ревью.
5. Пуш только после `git diff --stat` / лёгкого CI.

---

*Обновляйте этот файл при смене политики; operational шаги — в `PROD_DEPLOY.md`.*
