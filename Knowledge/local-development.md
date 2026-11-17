---
type: Knowledge
project: DeDato
knowledge_class: living
environment: common
status: active
last_verified: 2026-11-14
---

# Local development

Safe repository-known bootstrap for local, non-production work. Commands intentionally omit credential values, production hosts and provider verification.

## One-click local web development

**Основной путь для повседневной локальной web-разработки — `scripts/dev/local.py`.**
Codex и Cursor должны использовать этот запускатель, когда нужно открыть локальный
Dedato для проверки правки. Подробности запуска принадлежат этому документу;
[onboarding](onboarding.md) и [реестр](README.md) ссылаются на него.

### Как открыть, проверить и остановить

Запускайте из корня нужной рабочей копии:

| Действие | Кнопка Codex | Команда для агента или терминала |
|---|---|---|
| Открыть приложение | Открыть Dedato | `python3 scripts/dev/local.py start` |
| Узнать текущий адрес и состояние | Статус Dedato | `python3 scripts/dev/local.py status` |
| Остановить управляемое окружение | Остановить Dedato | `python3 scripts/dev/local.py stop` |
| Пути к логам последнего запуска | — | `python3 scripts/dev/local.py logs` |
| Пути к логам в JSON | — | `python3 scripts/dev/local.py logs --json` |
| Запустить без открытия браузера | — | `python3 scripts/dev/local.py start --no-open` |

**CONFIRMED, 2026-11-14:** адресный repair **persistent** managed SQLite
(`.local/dedato/local.db`) для [calendar interval grid](scheduling.md#2-slot-generation-and-calendar-interval-grid-канон)
— не через `alembic upgrade head` / `stamp` и не слепой reset. Переносимый цикл:
1. `python3 scripts/dev/local.py stop`;
2. consistent backup через SQLite `backup()` API (архив вне `.local/dedato/`, не
   только рядом с target);
3. preflight/repair сначала на **копии**, all-table diff с whitelist только
   подтверждённых synthetic fixtures (wall times bookings + два service duration);
4. idempotent apply на managed только после copy proof;
5. guards: migration [`20261114_calendar_grid_sqlite_guard.py`](../backend/alembic/versions/20261114_calendar_grid_sqlite_guard.py)
   на чистой схеме / explicit apply, UDF hooks [`sqlite_calendar_grid_guard.py`](../backend/utils/sqlite_calendar_grid_guard.py)
   ([data and migrations](data-and-migrations.md));
6. `python3 scripts/dev/local.py start --no-open` и `status` для портов.
   Отчёты apply (backup/manifest/smoke) — артефакты задачи, не часть one-click
   запуска.

`logs` без флага сохраняет три строки с абсолютными путями в порядке backend,
frontend, launcher. С `--json` выводится один JSON-объект с ключами `backend`,
`frontend`, `launcher` и теми же абсолютными путями. Оба варианта работают до
первого запуска и не создают `/.local/dedato/`. Для остальных команд, включая
неявный `start` без имени команды, `--json` отклоняется парсером (код 2) до
изменения окружения или обращения к управляемым серверам.

Кнопки описаны в [конфигурации локального окружения Codex](../.codex/environments/environment.toml).
В Cursor агент вызывает ту же команду; наличие отдельных кнопок Cursor не предполагается.
Для текущего Mac также создан ярлык «Открыть Dedato.app», который вызывает `start`.
Ярлык находится вне репозитория, привязан к пути этой рабочей копии и не является
переносимым источником конфигурации. На другой машине используйте команды и
конфигурацию из репозитория; Python-зависимости backend и Node-зависимости frontend
должны быть установлены по bootstrap ниже.

### Поведение запуска

- Одна управляемая пара backend/frontend на рабочую копию. Блокировки ОС
  сериализуют одновременные нажатия и удерживают владение процессами.
- Backend и frontend слушают только `127.0.0.1`. Свободные порты назначает ОС.
  Backend получает уже открытый сокет; frontend использует отдельный HTTP-сервер
  с Vite в middleware mode. HMR подключается к фактическому порту frontend.
- Повторный `start` проверяет идентичность работающего окружения и API-прокси,
  затем открывает существующий адрес. Дубликат серверов не создаётся.
- Адрес может измениться после остановки/перезапуска. Получайте его из `status`
  или вывода `start`; номера 8000/5173 и адрес из старого чата не являются контрактом.
- Браузер открывается после готовности backend, frontend, прокси и HTML приложения.
  Закрытие окна браузера или терминала не останавливает серверы; используйте `stop`.
- Vite обновляет интерфейс при изменении исходников; Uvicorn перезапускает backend
  при изменении Python-файлов. Полная сборка и переустановка зависимостей при каждом
  запуске не выполняются.
- Неисправное управляемое окружение останавливается перед новым запуском.
  Watchdog и завершение дочерних процессов не дают им остаться после гибели
  управляющего процесса. Чужие серверы на занятых портах запускатель не завершает.

### Данные и границы локального профиля

Все рабочие данные находятся в игнорируемом `/.local/dedato/` данной рабочей копии (путь в `.gitignore`):

| Путь внутри каталога | Назначение |
|---|---|
| `local.db` | Отдельная SQLite-база локального окружения |
| `runtime/uploads/` | Локальные пользовательские загрузки |
| `seed.json` | Результат первичного заполнения и синтетические тестовые аккаунты |
| `backend.log`, `frontend.log`, `launcher.log` | Диагностика последнего запуска |
| `state.json`, `frontend.json`, lock-файлы | Техническое состояние и владение запуском |
| `jwt-secret` | Локальный секрет сессий |

Запускатель очищает унаследованные настройки приложения. Backend не читает
репозиторный `.env`, frontend использует отдельный пустой env-каталог. Платежи
и телефонная интеграция работают в stub-режиме; email, Yandex OAuth, Apple IAP
и отправка push отключены. Локальный запускатель явно задаёт
`CALENDAR_ADMISSION_MODE=unified` для ручных записей и личных блоков B3;
экспорт переменной в shell не заменяет настройку, потому что окружение очищается.
Это настройка только локального профиля, не production/staging. Общий Redis не используется и новый Redis не запускается;
сценарии, которым он необходим, не входят в проверенную готовность этого профиля.

При отсутствии `seed.json` вызывается существующий DEV_E2E seed с `reset: false`
для собственной БД. Обычно это только первый запуск. Последующие открытия и
остановки сохраняют данные. Тестовый вход мастером проверен; учётные данные берите
из локального результата seed, не копируйте runtime-файлы или секреты в Knowledge.

База создаётся по текущим SQLAlchemy-моделям. Это не проверка release-миграций.
При изменении схемы может понадобиться отдельная локальная миграция или осознанное
пересоздание тестовых данных. Запускатель не удаляет БД и не применяет Alembic автоматически.
Production/staging, их базы, контейнеры и deploy-процедуры в этом запуске не участвуют.

### Если запуск не удался

1. Выполните `status`, прочитайте сообщение и релевантный лог. Пути к
   `backend.log`, `frontend.log` и `launcher.log` даёт `logs` (каталог `/.local/dedato/`
   при этом не создаётся). В чат возвращайте краткую причину и путь к логу, а не
   содержимое всех runtime-файлов.
2. При отсутствующих зависимостях используйте package-specific bootstrap ниже.
   Не запускайте установку зависимостей из корневого legacy Node-пакета.
3. При ошибке кода исправьте подтверждённую причину и повторите `start`.
   Не запускайте параллельно ручные Uvicorn/Vite и не завершайте процессы по номеру порта.
4. При ошибке схемы сохраните локальные данные и определите нужное изменение схемы;
   не удаляйте `.local/dedato/` или lock-файлы как универсальный способ исправления.

### Проверки и граница подтверждения

**CONFIRMED, 2026-11-12, локальная рабочая копия на macOS:** при внедрении прошли
три unittest-проверки, включая интеграционный сценарий одновременного старта,
повторного использования PID/URL, остановки, сохранения БД/seed и восстановления
после завершения frontend и аварийного завершения управляющего процесса.
В браузере проверены вход синтетическим мастером, открытие кабинета и подключение Vite HMR.
Стандартный порт 5173 в этот момент был занят другим сервером.
Это результат локальной проверки; он не означает прохождения CI, публикации в Git
или проверки production/staging. Linux и Windows не проверялись; реализация использует
POSIX `fcntl`/process groups и напрямую для Windows не предназначена.

Для повторной интеграционной проверки, когда допустима остановка именно этого
управляемого локального окружения:

```bash
DEDATO_LOCAL_INTEGRATION=1 PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s scripts/dev -p test_local.py -v
```

Эта проверка намеренно останавливает и перезапускает управляемый stack и оставляет
его запущенным. Без `DEDATO_LOCAL_INTEGRATION=1` остаются только быстрые unit-проверки
`test_local.py` (изоляция env/HTTP-клиента и команда `logs` без создания `.local/dedato/`
и без чтения существующих логов); сценарий `LifecycleTest` будет пропущен.

**CONFIRMED, 2026-11-13, контракт `logs --json`:** CLI-проверки во временных
копиях без runtime-каталога подтвердили JSON, прежний текстовый вывод и отказ
парсера для `--json` у остальных команд. Каталог `.local/` не создавался;
серверы в этой проверке не запускались и не останавливались.

**Исполняемые источники:** [local.py](../scripts/dev/local.py),
[local_backend.py](../scripts/dev/local_backend.py),
[local_frontend.mjs](../scripts/dev/local_frontend.mjs),
[local_watchdog.py](../scripts/dev/local_watchdog.py),
[test_local.py](../scripts/dev/test_local.py).
Дата выше относится к новому запускателю; остальные разделы этого документа
не объявляются заново проверенными этой записью.

## Prerequisites and package ownership

- Backend runtime target: Python 3.9; dependencies are pinned in `backend/requirements.txt`.
- Web build target: Node 20; use `frontend/package-lock.json` from the `frontend/` package.
- Mobile is a separate Node package with `mobile/package-lock.json` and Expo tooling.
- Documentation has a separate Python requirements file and `.venv` lifecycle via `docs.sh`.

Root `package.json` is a wrapper/legacy package: its direct `dev/build/preview` commands intentionally fail and point to `frontend:*` wrappers. Prefer package-local commands so the selected lockfile/config is unambiguous.

**Sources:** `backend/Dockerfile`; `backend/requirements.txt`; `frontend/Dockerfile.prod`; root, frontend and mobile `package.json`/lockfiles; `docs.sh`; `requirements-docs.txt`.

## Backend bootstrap (manual alternative)

For the managed local stack, install only the dependencies below, then use `local.py start`.
Direct Uvicorn startup is an explicit manual alternative: it does not inherit the
managed stack's private database, ports or environment isolation.

From repository root:

```bash
python3 -m venv backend/.venv
backend/.venv/bin/pip install -r backend/requirements.txt
cd backend
.venv/bin/python -m uvicorn main:app --host 127.0.0.1 --port 8000
```

The root `make backend-run` wrapper starts the same entrypoint on loopback using the caller's active `python3`; activate the intended environment first if using that wrapper. Configuration precedence and safe environment rules belong to [Configuration](configuration.md). Schema lifecycle belongs to [Data and migrations](data-and-migrations.md); application `create_all` is not a substitute for reviewing/applying migrations.

Do not use `backend-run-legacy` unless the task explicitly owns the legacy indie boundary.

**Sources:** root `Makefile`; `backend/README.md`; `backend/main.py`; `backend/database.py`; Alembic configuration.

## Web bootstrap (manual alternative)

For the managed local stack, `npm ci` prepares dependencies once; use `local.py start`
for everyday launch. Direct `npm run dev` uses the standalone Vite configuration.

```bash
cd frontend
npm ci
npm run dev
```

Vite serves the SPA and proxies API/upload/legacy paths to the configured local backend. The root alternative is `npm run frontend:dev`; package-local execution remains the clearer source of config and dependencies.

**Sources:** `frontend/package.json`; `frontend/vite.config.js`; root `package.json`.

## Mobile bootstrap

```bash
cd mobile
npm ci
npm run start
```

Use the package platform scripts only after local Expo/native prerequisites are installed. API/WEB URL precedence and production URL rejection are defined in [Mobile architecture](mobile.md) and [Configuration](configuration.md). Do not copy values from credential-like repository artifacts into local config.

**Sources:** `mobile/package.json`; `mobile/app.config.ts`; `mobile/src/config/env.ts`; `mobile/src/config/resolveMobileEnv.ts`.

## Routine validation

```bash
(cd backend && .venv/bin/python -m pytest)
(cd frontend && npm test)
(cd mobile && npm test)
(cd mobile && npm run test:integration)
```

Prefer the package venv/lockfile. Mobile integration and `androidAppIcon.contract.test.ts` need Pillow: `pip install -r mobile/scripts/dev/requirements.txt`. Named FAST/FULL/RELEASE/WEB E2E tiers are in [Testing strategy](testing-strategy.md). Root application CI (backend, frontend, mobile, playwright) is [CI/CD](ci-cd.md).

## Local E2E and destructive data

The one-click development stack above does not replace the CI/E2E runner below.
Do not point reset/seed E2E tests at the persistent managed development database.

Canonical web E2E orchestration is `./scripts/run-playwright-e2e.sh`: loopback backend/Vite, disposable SQLite under `/tmp`, synthetic `DEV_E2E` seed, Playwright, guaranteed cleanup. It refuses production/staging URLs and `bookme.db`. Do not run empty-DB `alembic upgrade head` for this path.

`./scripts/e2e_full.sh` is a legacy local helper, not the CI contract; it can reuse already-running servers. `./scripts/test_e2e.sh` assumes services/data are already prepared. Neither command authorizes production or shared-environment access.

## Compose boundary

Tracked Compose configuration contains sanitized credential-like repository evidence with `validity: UNKNOWN`. This document does not reproduce or endorse that value. Review the separate security remediation before treating tracked Compose defaults as safe local examples.

**Sources:** `docker-compose.yml` path/structure only; [Security and privacy Debt](security-and-privacy.md).

## Documentation

```bash
./docs.sh ci
```

This validates the MkDocs `docs/` site. Canonical `Knowledge/` still requires its own relative-link/source-path, sensitive-pattern and `git diff --check` gates.

**Sources:** `docs.sh`; `mkdocs.yml`; `.github/workflows/mkdocs.yml`.

## Локальная проверка календаря B3

**CONFIRMED, 2026-11-14, только локальная интеграционная ветка:**
`review/calendar-b3-20261114` объединяет прежнюю `review/local-latest-20261114`
и `feature/calendar-b3-ui` до `8e39e12`. Админские изменения, mobile tour и
исправление отступа нижней навигации сохранены. Все шесть существовавших dirty-файлов
восстановлены после merge; они не включались в merge-коммит.

До изменения кода управляемый stack остановлен, SQLite сохранён через backup API,
а незакоммиченные изменения — отдельными копиями, binary diff и Git stash.
Для локальной create_all-БД без `alembic_version` применены только четыре
добавочные календарные revisions через Alembic Operations, сначала на копии.
Все прежние значения и строки 73 таблиц совпали; `integrity_check=ok`,
`foreign_key_check` пуст, поля всех ORM-моделей присутствуют.
Полный исторический `upgrade head` для этой БД менял старые записи и не применялся
к рабочей базе. Подробности и граница совместимости: [Data and migrations](data-and-migrations.md#local-calendar-schema-compatibility).

Перед включением unified read-only `backend/scripts/calendar_admission_readiness.py`
подтвердил готовность обоих локальных мастеров: нет актуальных unresolved intervals.
Исторические naive timestamps не преобразовывались предположением о timezone.
При другой БД эту готовность нужно проверять заново; `503 BOOKING_TIME_UNRESOLVED`
нельзя обходить удалением старых записей.

После восстановления незакоммиченного web-редизайна откройте «Расписание» в меню
кабинета: внутри должны быть вкладки «День / Неделя / Расписание». Дневной вид
содержит боковую форму; недельный — новый timeline. Если видны только прежние
«Создать расписание / Посмотреть расписание / Обзор месяца» без трёх режимов,
проверьте наличие файлов редизайна, а не только SHA календарной ветки.
Причина и владельцы UI: [Web architecture](web.md#calendar-b3-local-integration).
Права Free на остальные разделы остаются тарифными ограничениями. В браузере проверены создание, повторное открытие
и отмена ручной записи, создание и удаление личного блока. Проверочные объекты
созданы отдельно; исходные записи не использовались. Отменённая ручная запись
и soft-deleted блок остаются в локальной истории.

Проверки: backend 335 passed + один просроченный date fixture; после перевода
fixture на следующий год весь затронутый B3-модуль — 30 passed. Web — 185 passed
и Vite build; mobile calendar/tour/layout — 147 passed. Launcher — 7 passed,
1 lifecycle skipped; повторный start переиспользовал текущий адрес. Это не полный
release-прогон, не native build и не свидетельство CI/deploy. Миграции по-прежнему
не запускаются автоматически при start.

**Дополнительная проверка 2026-11-14:** после восстановления 35 frontend-файлов
потребовался управляемый stop/start: работающий Vite продолжал отдавать прежнюю
версию. Адрес изменился; пользователь должен получить URL из нового `status`.
БД и её схема при восстановлении UI не менялись. Новый полный web-прогон и
ограничения записаны в [Testing strategy](testing-strategy.md#restored-calendar-design-checks).
