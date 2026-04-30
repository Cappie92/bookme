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

### Docker Compose: канон именования (важно для prod)

Чтобы новые деплои **никогда** не создавали “параллельные” namespaces ресурсов Docker, в репозитории закреплён канон:

- **project name**: `dedato`
- **volumes**: `dedato_data`, `dedato_logs`, `dedato_uploads`
- **default network**: `dedato_network`
- **канонический compose-файл для production**: `docker-compose.prod.yml`

Почему раньше мог появляться volume вида `dedato_dedato_data`:
- Docker Compose по умолчанию вычисляет project name из директории/контекста или флага `-p`.
- Если project name “плавал” (например, `/opt/dedato` vs `/home/root/dedato`, разные команды, разные compose wrappers), то тот же логический volume мог получить разные фактические имена (`dedato_data` vs `dedato_dedato_data`).

Что изменилось теперь:
- В `docker-compose.prod.yml` задано верхнеуровневое `name: dedato`.
- Для volumes и сети заданы явные имена через `name: ...`.
Это делает namespace **детерминированным** вне зависимости от cwd/обёрток.

Важно:
- Деплой делаем **только** через `docker compose -f docker-compose.prod.yml ...` (как в этом runbook и в `.github/workflows/deploy.yml`).
- Не используйте “копии” compose-файлов с другими именами/префиксами без осознанной причины.

### Server layout (гигиена после первого запуска)

- **Код** живёт в `/opt/dedato` (как в workflow). **Не** хранить внутри клона «свалку» долгосрочных `*.db` / `*.tar.gz` датасетов — бэкапы: каталог `backups/` (создаёт `scripts/prod/backup_sqlite.sh`, в **git не коммитится**). Входящие датасеты: например `mkdir -p /opt/dedato/artifacts/incoming` и класть архивы **там**, не в `backend/`.
- **HTTPS:** compose публикует **HTTP:80** как единый вход контейнера. TLS и редирект 80→443 обычно на **хост-nginx/балансировщике**; прокси на `http://127.0.0.1:80` (или порт, если изменён). Health снаружи: `https://<domain>/health` и `https://<domain>/api/health`. Срочная **ротация** TLS на хосте (после инцидента с ключом): `docs/internal/TLS_ROTATION_RUNBOOK_DEDATO_RU.md`.
- Политика репо и сервера: `docs/REPO_AND_DEPLOY_HYGIENE.md`.
- **Docker Compose:** только v2-совместимый вызов `docker compose` (как в workflow и в этом runbook).

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

---

### Runbook: ручная миграция legacy volume → canonical volume (если в системе есть дубли)

Этот раздел **не выполняет** миграцию автоматически. Он нужен, если на сервере исторически есть и `dedato_data`, и `dedato_dedato_data` (или похожие дубли), и вы хотите перейти на канон, не потеряв данные.

Цель: привести production к канону, где backend монтирует:
- `dedato_data` → `/data`
- `dedato_uploads` → `/app/uploads`
- `dedato_logs` → `/app/logs`

Шаги:

1) **Сделайте backup текущего состояния (на всякий случай)**
- Запустите `./scripts/prod/backup_sqlite.sh` (снимает `dedato_data` + `dedato_uploads`).

2) **Проверьте, какой volume реально примонтирован к backend**
- Посмотрите mounts у контейнера backend (через `docker inspect <container>` / `docker compose ps` + inspect).
- Зафиксируйте, какой volume содержит `bookme.db` и дерево `uploads/`.

3) **Сделайте backup legacy volume (если он не совпадает с каноном)**
- Если текущий примонтированный volume называется не `dedato_data`, сделайте его отдельный экспорт:
  - SQLite: скопировать `bookme.db` из legacy volume во временный каталог на сервере (можно через `docker run --rm -v <legacy>:/data ... cp ...` по образцу `backup_sqlite.sh`).
  - Uploads: аналогично скопировать дерево `uploads/`.

4) **Создайте canonical volumes (если их нет)**
- `docker volume create dedato_data` (и аналогично `dedato_uploads`, `dedato_logs`) — **только если** их нет.

5) **Наполните canonical volumes данными**
- Скопируйте `bookme.db` и `uploads/` в `dedato_data` / `dedato_uploads` тем же методом `docker run --rm -v ... cp ...`.

6) **Переключите compose на канон и пересоздайте контейнеры**
- Убедитесь, что используется **только** `docker-compose.prod.yml` из репозитория (с `name: dedato` и явными `volume.name`).
- Перезапустите стек: `docker compose -f docker-compose.prod.yml up -d --build`.

7) **Проверьте mount’ы и целостность**
- Убедитесь, что внутри backend:
  - `/data/bookme.db` существует и соответствует ожидаемой базе
  - `/app/uploads` содержит нужные файлы
  - `/app/logs` пишется
- Прогоните health-checks из раздела выше.

8) **Удаляйте legacy volumes только после валидации**
- Когда убедились, что всё работает с canonical volumes, можно удалить legacy volumes (например `docker volume rm ...`).
- Не удаляйте их “на автомате” до проверки: это необратимо.
