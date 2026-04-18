## DeDato — Release checklist (production)

### Preflight (before deploy)

- [ ] Все изменения закоммичены и запушены в GitHub (`main`)
- [ ] На сервере актуальный код в **`/opt/dedato`** (или вы осознанно используете другой путь — но тогда **не** используйте дефолтный workflow без правок)
- [ ] На сервере есть актуальный **`/opt/dedato/deploy/prod/backend.env`** (секреты, URLs)
- [ ] Проверка dev-only флагов (должно быть “пусто/выкл.”):
  - [ ] `ENVIRONMENT=production`
  - [ ] `ENABLE_DEV_TESTDATA` пусто
  - [ ] `DEV_E2E` пусто
- [ ] Есть свежий бэкап prod volumes:
  - [ ] `cd /opt/dedato && ./scripts/prod/backup_sqlite.sh` → архив в `backups/`
- [ ] Есть архив с “каноническим” reseed dataset **только если** это **first deploy** или **полная замена данных**:
  - [ ] `./scripts/prod/export_dataset.sh` → `artifacts/dedato_dataset_*.tar.gz`

---

### A) First deploy / full dataset replace

- [ ] Импортировать dataset (**осознанно**, это перезаписывает данные в volumes):
  - [ ] `cd /opt/dedato && ./scripts/prod/import_dataset.sh /path/to/dedato_dataset_*.tar.gz`
- [ ] `cd /opt/dedato && docker compose -f docker-compose.prod.yml up -d --build`
- [ ] Миграции:
  - [ ] `cd /opt/dedato && ./scripts/prod/migrate.sh`

---

### B) Обычный релиз (следующие деплои)

- [ ] **НЕ** запускать `import_dataset.sh`
- [ ] `cd /opt/dedato && docker compose -f docker-compose.prod.yml up -d --build`
- [ ] `cd /opt/dedato && ./scripts/prod/migrate.sh` (при деплое через GitHub Actions этот шаг уже выполняется в `.github/workflows/deploy.yml`; при ручном деплое — обязателен)

---

### Post-deploy verification (операционный smoke)

#### HTTP / routing

- [ ] `curl -fsS http://127.0.0.1/health` (Nginx)
- [ ] `curl -fsS http://127.0.0.1/api/health` (прокси → backend)

#### Auth / роли

- [ ] **admin login** (веб) — админка открывается
- [ ] **master login** — мастерский кабинет открывается
- [ ] **client login** — клиентский кабинет открывается

#### Smoke anchors (из `docs/SMOKE_RESEED_MAP.md`)

Используйте учётки/телефоны из reseed map (они должны присутствовать в перенесённом `bookme.db`).

- [ ] **M5**: дашборд/список записей (Standard trace)
- [ ] **M8**: stats/finance trace + loyalty hub + **public slug** `qa-smoke-public`
- [ ] **M9**: loyalty points OFF + low balance контраст

#### Публичная страница

- [ ] Открыть веб: `/m/qa-smoke-public`
- [ ] API: `GET /api/public/masters/qa-smoke-public` (через домен: `/api/public/masters/qa-smoke-public`)

#### Функциональные зоны (веб)

- [ ] Dashboard (M5)
- [ ] Stats (M8, если доступно планом)
- [ ] Finance (M8)
- [ ] Loyalty (M8 vs M9)
- [ ] Clients (в т.ч. trace-клиенты из карты)
- [ ] Uploads: открыть известный URL вида `/uploads/...` (через Nginx)

#### Admin panel / admin settings

- [ ] Админка: пользователи/роли
- [ ] Админка: subscription plans / service functions (как минимум страницы открываются)

#### Dev routes must NOT exist

- [ ] `GET /api/docs` открывается, но **не** должно быть доступно `dev_testdata`/`dev_e2e` при prod env:
  - [ ] `curl -o /dev/null -s -w "%{http_code}\n" http://127.0.0.1/api/dev/testdata/` ожидаемо **404**
  - [ ] `curl -o /dev/null -s -w "%{http_code}\n" http://127.0.0.1/api/dev/e2e/` ожидаемо **404**

---

### Rollback plan (if needed)

- [ ] Остановить стек: `cd /opt/dedato && docker compose -f docker-compose.prod.yml down`
- [ ] Восстановить последний бэкап: `cd /opt/dedato && ./scripts/prod/restore_sqlite.sh backups/dedato_backup_*.tar.gz`
