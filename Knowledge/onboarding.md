---
type: Knowledge
project: DeDato
knowledge_class: living
environment: common
status: active
last_verified: 2026-11-13
---

# DeDato onboarding

Короткий безопасный маршрут для нового участника. Historical reports and root scripts are not authority merely because they are easy to find.

## Read first

1. [Knowledge governance](README.md) — source priority, confidence and security rules.
2. [Product roles and business model](product-roles-business-model.md) and [Domain map](domain-map.md).
3. [Backend architecture](backend.md), [Web architecture](web.md) or [Mobile architecture](mobile.md) for the component being changed. iOS master product is a native-only operational companion, not a full ordinary web cabinet and not a user-visible web-editor handoff.
4. The owning domain or contract document for the behavior. Catalog mutations: [Master catalog](master-catalog.md).
5. The linked Debt document before changing a sensitive boundary. Open credential rotation is [production credential exposure](production-credential-exposure.md).

Current production pointers live in [Production topology](production-topology.md). Do not connect to hosts, run `prod`/deploy/smoke scripts or inspect credential-like artifacts during ordinary onboarding. Do not treat `test/apple-iap-handoff`, build 6/7, legacy demo reseed or reverse-phone as current truth.

## Establish a safe workspace

```bash
git status -sb
git log --oneline --decorate -5
```

Preserve existing user changes. Choose one package and follow [Local development](local-development.md). Do not install dependencies at repository root as a substitute for the frontend/mobile package lockfile.

### Локальный web-запуск для Codex и Cursor

Перед проверкой интерфейса прочитайте [новый локальный процесс](local-development.md#one-click-local-web-development).
Используйте `python3 scripts/dev/local.py start` из корня этой рабочей копии
(для агента без открытия браузера — `start --no-open`), текущий адрес берите из
`status`. Кнопка Codex «Открыть Dedato» вызывает тот же запускатель.
Не собирайте заново последовательность ручного старта и поиска свободных портов.
Для отдельной задачи с ручным окружением или disposable E2E следуйте соответствующему
разделу канонического документа; постоянную локальную БД не используйте для reset-тестов.
Если файлов запускателя нет, сообщите о несовпадении копий и уточните передачу
изменений; не восстанавливайте реализацию по одному описанию.

Configuration values come from authorized local channels and tracked templates only after checking [Configuration](configuration.md) and [Security Debt](security-and-privacy.md). Never copy repository credential-like literals into chat, Knowledge, commits or issue reports.

## Before editing

- Identify the one canonical owner of the fact.
- Trace runtime/model/config sources before trusting an ADR, report or setup guide.
- Determine whether the path is public, authenticated, role-gated, object-owned or entitlement-gated.
- For data changes, inspect [Data and migrations](data-and-migrations.md).
- For cross-client behavior, inspect the relevant API/client contract and platform Debt.

If correct documentation would require revealing a credential-like value, stop that package and create only sanitized Debt; unrelated packages may continue.

## Verification and handoff

Use [Testing strategy](testing-strategy.md) to select the smallest owning suite and expand across affected boundaries. Root application CI is backend + frontend + mobile + Playwright; Maestro is not yet a CI gate. Before committing documentation, validate relative links/source paths, run `git diff --check`, inspect `git diff --stat` and confirm only intended files changed.

Product code, migrations, generated files and deployment remain distinct scopes. Keeping affected Knowledge documents aligned with an authorized implementation change is part of that task under the standing owner instruction in [AGENTS.md](../AGENTS.md), unless the current request explicitly limits documentation edits. A client route guard, passing UI test or successful HTTP health response never substitutes for backend authorization, migration correctness or readiness.

## Knowledge maintenance in agent tasks

С 2026-11-13 общий [AGENTS.md](../AGENTS.md) в корне репозитория задаёт постоянный
цикл чтения и обновления базы для Codex и Cursor Agent. Это единственный владелец
инструкции; отдельные копии правила в пользовательских настройках не нужны.
В каждой новой сессии оба входных документа — `Knowledge/README.md` и этот
onboarding — читаются целиком до ответа по существу и правок. Поиск по ключевым
словам или чтение первых строк не заменяют этот шаг; усечённый вывод дочитывается.
Дальнейшее чтение ограничивается разделами, относящимися к задаче.

Работайте в проекте, открытом из корня DeDato, где доступны `AGENTS.md` и `Knowledge/`.
После добавления или изменения инструкции начните новую сессию агента в проекте,
чтобы не полагаться на перечитывание правил уже открытым чатом. Для другой машины,
новой ветки, worktree или облачной копии сначала передайте эти изменения обычным
процессом Git: файлы, оставшиеся только в текущей рабочей копии, там не появляются сами.

Правила применяются при работе агента над задачей. Они не создают фоновую службу,
не отслеживают ручные правки вне задач и не запускают обновление при каждом
автодополнении Cursor Tab. В финале задачи агент отмечает, какие документы обновлены
или почему обновление не требуется. При read-only запросе он оставляет предложение
по документации без записи. Эти инструкции не являются программным CI-контролем
и не гарантируют безошибочного выполнения моделью.

Проверены наличие инструкции, ссылки и согласованность с этим onboarding.
Поддержка корневого `AGENTS.md` описана в [OpenAI Docs](https://learn.chatgpt.com/docs/agent-configuration/agents-md)
и [Cursor Docs](https://cursor.com/docs/rules#agentsmd).
**CONFIRMED, 2026-11-13, первичная проверка до усиления правила:** в новом чате
Cursor корневой `AGENTS.md` присутствовал в Context Usage → Project Rules;
агент без напоминания прочитал `local-development.md`, но заменил чтение README
и onboarding поиском. В новой сессии Codex CLI инструкции были получены и
чтение обоих файлов запрошено; само чтение заблокировала ошибка вложенной
песочницы. Это не подтверждает проверку Codex Desktop или обновление базы после
изменений.

**CONFIRMED, 2026-11-13, повторная проверка Cursor (Composer 2.5 Fast):**
в новом локальном чате задача добавить `local.py logs` не содержала напоминаний
о правилах или документации. Журнал Read показал README L1–180 и onboarding
L1–100 при фактических 179 и 99 строках: оба файла прочитаны полностью.
Cursor сам изменил `Knowledge/local-development.md` вместе с реализацией и тестами.
Отдельная проверка CLI во временной копии подтвердила вывод трёх абсолютных путей,
работу до первого запуска и отсутствие создания runtime-каталога. Серверы не
запускались; интеграционный lifecycle-тест не выполнялся. Это подтверждение
одного наблюдаемого прогона, а не гарантия всех будущих сессий.
**CONFIRMED, 2026-11-13, новая обычная сессия Codex Desktop:** проект открыт
из корня DeDato; чат «Пути к логам в JSON» (`01a1d523-29f2-73e0-ad23-6b693f720f93`).
Задача добавить `logs --json` не упоминала AGENTS или Knowledge. Первой командой
агент выполнил `cat Knowledge/README.md Knowledge/onboarding.md`; успешный,
неусечённый вывод сверён с полным содержимым обоих файлов. Затем агент прочитал
документы локального запуска и тестирования и самостоятельно обновил
`Knowledge/local-development.md` вместе с кодом и проверками. Общий локальный
прогон после обеих задач: 7 тестов прошли, 1 lifecycle-тест пропущен; серверы
не запускались и не останавливались. Это не подтверждение CI, merge или deploy.

Для повторной проверки используйте новый чат в корне проекта и обычную небольшую
задачу без напоминания об AGENTS/Knowledge. Оценивайте вызовы чтения с полным выводом
и фактический diff living-документа, а не только заявление агента в финальном ответе.

## Where to ask for owner decisions

Repository evidence that is incomplete but safely documentable is marked `UNKNOWN`. A choice not determined by runtime belongs in an explicitly owned decision artifact; confirmed current limitations belong in the active debt documents registered in [Knowledge governance](README.md). Bugs, incidents, releases and target-state decisions are not created implicitly by onboarding work.
