## DeDato — Production deployment (GitHub-first)

### Summary

Этот репозиторий содержит **production**-схему на Docker Compose:
- **frontend**: Nginx со статикой React и прокси `/api` + `/uploads` на backend
- **backend**: FastAPI (uvicorn)
- **DB**: SQLite в **docker volume** (`dedato_data:/data/bookme.db`)
- **uploads**: в **docker volume** (`dedato_uploads:/app/uploads`)
- **logs**: в **docker volume** (`dedato_logs:/app/logs`)
- **redis**: отдельный сервис для OTP-хранилища (`backend/sms.py`)

Цель: предсказуемый redeploy без потери текущего **reseed/smoke dataset** и без «магических» ручных шагов.

---

### Paths (канонично, без двусмысленности)

На сервере **единственная “истина” для кода** (GitHub Actions и ручной runbook совпадают):
- **repo root**: `/opt/dedato`
- **prod env file (не в git)**: `/opt/dedato/deploy/prod/backend.env`
- **шаблон env (в git)**: `/opt/dedato/deploy/prod/backend.env.example`
- **dataset import/export артефакты** (локально на машине reseed): репозиторий → `artifacts/`, на сервере можно класть в `/opt/dedato/artifacts/incoming/` (директорию создайте сами при необходимости)
- **backup архивы**: `/opt/dedato/backups/` (создаётся скриптом `scripts/prod/backup_sqlite.sh`)

Docker volumes (данные **вне** директории репозитория):
- `dedato_data` → `/data/bookme.db` внутри backend-контейнера
- `dedato_uploads` → `/app/uploads` внутри backend-контейнера
- `dedato_logs` → `/app/logs` внутри backend-контейнера

---

### Prerequisites (server)

- Docker + Docker Compose v2
- Открыт порт **80** (и 443, если TLS снаружи)
- Файл `/opt/dedato/deploy/prod/backend.env` создан из шаблона и заполнен

---

### A) First production deploy (полная замена старого + импорт dataset)

Используйте этот сценарий, когда:
- это **первый** прод-запуск, или
- вы **намеренно** полностью заменяете данные на новый dataset

**Важно:** `import_dataset.sh` — это **не** шаг “на каждый релиз”. На обычных релизах volumes уже содержат прод-данные.

1) **Подготовьте prod env**

```bash
cd /opt/dedato
mkdir -p deploy/prod
cp deploy/prod/backend.env.example deploy/prod/backend.env
nano deploy/prod/backend.env
```

Критично:
- `ENVIRONMENT=production`
- **`JWT_SECRET_KEY`** не дефолтный (валидатор в `backend/settings.py` упадёт при дефолте)
- `FRONTEND_URL` / `API_BASE_URL` соответствуют реальному домену (влияют на ссылки и **production CORS**)
- `ENABLE_DEV_TESTDATA` и `DEV_E2E` **пустые** (иначе dev-роуты могут включиться при ошибочной конфигурации окружения)
- платёжные/телефонные фичи: либо `*_MODE=stub`, либо реальные секреты (валидатор в `backend/settings.py`)

2) **Остановите старый стек (если был)**

```bash
cd /opt/dedato
docker compose -f docker-compose.prod.yml down || true
```

3) **Импортируйте dataset (SQLite + весь `uploads/`)**

На машине, где dataset канонический:

```bash
./scripts/prod/export_dataset.sh
```

Загрузите `artifacts/dedato_dataset_*.tar.gz` на сервер, затем:

```bash
cd /opt/dedato
./scripts/prod/import_dataset.sh /path/to/dedato_dataset_*.tar.gz
```

4) **Поднимите compose**

```bash
cd /opt/dedato
docker compose -f docker-compose.prod.yml up -d --build
```

5) **Примените миграции Alembic к тому же SQLite, что использует backend**

```bash
cd /opt/dedato
./scripts/prod/migrate.sh
```

Пояснение (честно): в `backend/main.py` есть `Base.metadata.create_all(...)`, плюс в репозитории есть Alembic.
На проде **опорная процедура релиза** — `alembic upgrade head` после деплоя (см. `RELEASE_CHECKLIST.md`).

6) **Health checks**

Nginx (внешний вход compose):

```bash
curl -fsS http://127.0.0.1/health
```

API через прокси:

```bash
curl -fsS http://127.0.0.1/api/health
```

---

### B) Обычный следующий deploy (релиз кода, данные НЕ трогаем)

Используйте на **каждом** релизе, когда prod-данные уже живут в volumes.

**Не делайте:** `./scripts/prod/import_dataset.sh ...` (это перетрёт прод-данные, если вы явно не делаете controlled restore).

1) **Preflight backup**

```bash
cd /opt/dedato
./scripts/prod/backup_sqlite.sh
```

2) **Обновите код**

Вариант A (рекомендуемый): GitHub Actions (`.github/workflows/deploy.yml`).
После `docker compose ... up -d` workflow **автоматически** выполняет `scripts/prod/migrate.sh` (Alembic `upgrade head` на том же SQLite volume).

Вариант B (ручной):

```bash
cd /opt/dedato
git pull origin main
docker compose -f docker-compose.prod.yml up -d --build
./scripts/prod/migrate.sh
```

3) **Проверки**

```bash
curl -fsS http://127.0.0.1/health
curl -fsS http://127.0.0.1/api/health
```

---

### Backup / restore (server)

Backup:

```bash
cd /opt/dedato
./scripts/prod/backup_sqlite.sh
```

Restore:

```bash
cd /opt/dedato
./scripts/prod/restore_sqlite.sh backups/dedato_backup_*.tar.gz
```
