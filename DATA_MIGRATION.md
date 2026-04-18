## DeDato — Data migration (current reseed dataset → production)

### Storage / source of truth (audit, не предположения)

Ниже — что реально является “источником правды” в текущей архитектуре backend (FastAPI + SQLAlchemy + SQLite + локальные файлы).

#### SQLite (`bookme.db` в volume `dedato_data`)

В SQLite хранится доменная модель приложения (ORM `backend/models.py`), включая:
- **admin user / роли / permissions**: таблицы пользователей/ролей/связей (админ — это записи в БД, не отдельный файл)
- **masters / salons / clients / bookings**: все сущности записи/клиенты/салоны и связи
- **loyalty**: скидки/правила/транзакции/настройки (как смоделировано в таблицах)
- **finance / expenses / accounting / tax**: финансовые сущности и учётные записи
- **subscriptions / balances / plans / feature gates**: тарифы/подписки/лимиты/платежные записи (в пределах текущей модели)
- **domains / public routing data**: поля/таблицы, которые используются для публичных страниц и доменов (включая slug/доменные поля мастера)
- **admin settings / “admin panel config”**: настройки, которые хранятся в БД (глобальные настройки/конфиги — через соответствующие таблицы; не отдельный JSON на диске)

#### `uploads/` (volume `dedato_uploads`)

Файлы, которые **не** кладутся в SQLite, но нужны для корректного UI/контента:
- **uploaded files / avatars / logos / photos**: `uploads/photos`, `uploads/logos` (создаются на старте в `backend/main.py`)
- **дополнительные upload-пути**: например `uploads/blog-covers` (используется админкой блога)

Важно: экспорт/импорт dataset в `scripts/prod/export_dataset.sh` копирует **всё дерево** `backend/uploads/`, не только photos/logos.

#### Redis (сервис `redis` в `docker-compose.prod.yml`)

Redis используется как **временное хранилище OTP** (`backend/sms.py`). Это **не** часть долгоживущего dataset и **не** переносится архивом SQLite/uploads.

#### Логи (volume `dedato_logs`)

Логи — **не** dataset. Их можно сохранять volume-ом, но для миграции бизнес-данных они не обязательны.

#### Что НЕ переносится автоматически и должно быть явно учтено

- **Секреты/keys вне репозитория**: `deploy/prod/backend.env` на сервере (и любые внешние секреты провайдеров)
- **Внешние интеграции**: состояние в сторонних системах (SMS/платежи) не восстанавливается из SQLite
- **Содержимое Redis**: OTP-коды и прочие ephemeral keys

Итог для вопроса “SQLite + uploads покрывают dataset?”:
- **Да для персистентного бизнес-состояния приложения**, которое хранится локально в этом проекте: **SQLite + полный `uploads/`** — это основной переносимый state.
- **Нет для всего “мира вокруг приложения”**: секреты, внешние сервисы, ephemeral Redis — отдельно.

### Goal

Перенести **текущее** состояние данных после актуального reseed/smoke в production **без пересида на проде**:
- мастера/клиенты/роли/админ
- брони/статусы/заметки
- loyalty/финансы/расходы/подтверждения
- домены/настройки/feature-данные (plans/service_functions/limits)
- любые служебные сущности админки

### Current facts (audit)

- Backend использует SQLAlchemy и по умолчанию **SQLite** (`settings.py` ставит `sqlite:///backend/bookme.db`, если `DATABASE_URL` пуст).
- В репозитории есть файл `backend/bookme.db` и `backend/uploads/…`.
- Админка и настройки админа хранятся **в той же базе** (таблица users + связанные таблицы).

### Recommended migration for first production

**1:1 перенос файлового state**:
- SQLite DB `bookme.db`
- uploads directory `backend/uploads/`

Это единственный способ гарантировать полное совпадение “как сейчас” без риска расхождений reseed.

### Schema / migrations after import (обязательный шаг)

После импорта `bookme.db` в volume и подъёма compose нужно прогнать Alembic на **том же** `DATABASE_URL`, что у backend-контейнера:

```bash
cd /opt/dedato
./scripts/prod/migrate.sh
```

### Export (source)

На машине/окружении, где dataset считается каноническим (после reseed):

```bash
./scripts/prod/export_dataset.sh
```

Результат: `artifacts/dedato_dataset_YYYYMMDD_HHMMSS.tar.gz`

### Import (production)

1) Загрузите архив на сервер (scp/rsync). Рекомендуемый путь: **`/opt/dedato/artifacts/incoming/`** (создайте вручную) — **не** кладите долгосрочные `*.tar.gz` в `backend/`.

2) На сервере в корне репозитория:

```bash
./scripts/prod/import_dataset.sh /path/to/dedato_dataset_*.tar.gz
```

Скрипт кладёт:
- `dataset/bookme.db` → docker volume `dedato_data:/data/bookme.db`
- `dataset/uploads/` → docker volume `dedato_uploads:/app/uploads`

### Admin сохранность

Админский пользователь/роли/настройки сохраняются автоматически, потому что:
- они находятся в `bookme.db`
- мы переносим `bookme.db` 1:1

### What we do NOT do

- Не запускаем reseed на проде
- Не делаем частичный экспорт/импорт таблиц
- Не меняем state machine/эндпоинты ради миграции

### Future option: Postgres

Если потребуется миграция на Postgres, делаем это отдельной фазой:
- поднимаем Postgres
- пишем явный конвертер SQLite → Postgres (idempotent), проверяем smoke на staging
- только после этого меняем `DATABASE_URL` в production

