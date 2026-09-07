# Post-incident: hardening репозитория после ротации TLS (internal)

> **Предпосылка:** production key ротирован, live HTTPS **не** использует утёкший материал. **Остаточный риск:** секрет может оставаться в **git objects** (история), старых clone, fork, CI-кэшах, бэкапах дисков.

Этот документ — **decision framework** и план мер, **без** автоматического `filter-repo` из репозитория.

---

## 1. Логика пост-инцидента

| Слой | Статус | Что делать |
|------|--------|------------|
| **Active (prod)** | Mitigated | Ключ на сервере новый — операционный приоритет снят. |
| **Residual (repo)** | Открыт | Объекты в `.git` могут содержать старый PEM; любой со **полным** clone мог извлечь. |
| **Процесс** | Усилить | Scanning, политика, hooks, доступ — **независимо** от rewrite. |

---

## 2. Оценка: нужен ли **git history rewrite**

### Плюсы rewrite (`git filter-repo` / BFG)

- Уменьшает вероятность **дальнейшего** распространения секрета из **центрального** remote при новых clone.
- Соответствует политикам «**zero secrets in history**».
- Упрощает **полный** `gitleaks detect` по истории без baseline.

### Минусы

- **Force-push** всех затронутых веток; поломка локальных clone; **stale** fork/PR refs.
- CI/CD, зеркала, **внешние** копии **не** исчезают — кто уже скачал, **уже** имел секрет.
- Трудозатраты и **риск ошибки** при массовом rewrite.

### Когда rewrite **сильно оправдан**

- Секрет был **реальным production** материалом (у вас — да, но **уже** ротирован).
- Репозиторий **широко** клонировался, есть **форки**, публичные зеркала, слабый контроль доступа.
- Регуляторная / внутренняя политика **требует** purge из истории.
- Команда готова к **координации** force-push и пере-клонам.

### Когда можно **не** делать rewrite **сейчас** (или отложить)

- Риск **эксплуатации** ключа на prod **снят** ротацией (главное для TLS).
- Remote **приватный**, мало участников, **нет** публичных форков — **остаточный** риск **ниже**, но **не ноль**.
- Disruption от force-push **недопустим** в текущем окне — **явно** задокументировать **accepted residual risk** + срок пересмотра.
- Компенсации: **tight access**, secret scan на **новые** коммиты, **опционально** baseline для исторического scan, план rewrite в **следующем** окне.

### Факторы именно для DeDato (ориентир)

- Утечка была **критичной по типу** (private key), но **криптографическая** угроза к **текущему** TLS **устранена** на хосте.
- Решение по history: **«rewrite later or compensate»** — допустимо, если зафиксированы **controls** ниже; **«rewrite now»** — если политика/аудит требуют или распространение remote велико.

---

## 3. Рекомендуемое решение (шаблон — заполнить командой)

Выберите **одну** строку и зафиксируйте дату/владельца:

| Вариант | Условие |
|---------|---------|
| **A. Rewrite history в запланированном окне** | Есть окно на force-push, список fork/интеграций проверен, согласовано с владельцем remote. |
| **B. Rewrite не делаем; компенсации** | Remote узкий, риск приемлем; **обязательны**: scan (CI + при желании pre-commit), access review, документ **residual risk**, пересмотр через N месяцев. |
| **C. Трёхслойный CI + reviewed historical debt** | Новые reachable commits и exact current tree обязательны; полный history scan запускается вручную. Historical ledger не разрешает хранить старые секреты в current tree. Реализация — §6. |

**Практично для многих команд после ротации ключа:** **B или C**, с **планом A** при жёсткой политике или утечке remote.

---

## 4. Если rewrite **делаете** — учесть

- Пошаговый план (scope, команды, валидация, sync): [GIT_HISTORY_REWRITE_TLS_PLAN.md](GIT_HISTORY_REWRITE_TLS_PLAN.md).  
- Инструмент: **`git filter-repo`** (предпочтительно) или BFG; минимум пути `SSL_SETUP_INSTRUCTIONS.md` и `setup_ssl.sh` (см. план).
- **Force-push** `main` и защищённые ветки; уведомить всех: `git fetch --all`, `reset` или **fresh clone**.
- **Forks:** владельцы должны **rebase** или пересоздать fork (или оставить мёртвый секрет у себя — риск).
- **CI:** очистить кэши, **не** кэшировать `.git` с секретом.
- После rewrite: **полный** `gitleaks detect` по истории — **зелёный**; старый baseline **удалить**.

---

## 5. Если rewrite **не** делаете

- **Документ:** «Accepted residual risk: TLS key material may exist in git history until [date/policy]; mitigated by rotated prod key + access controls.»
- **Access:** минимальные права на org/repo; отозвать неиспользуемые deploy keys / PAT.
- **Сканирование:** см. §6; CI на **рабочее дерево** (`--no-git`) — не ломается на истории; полный исторический scan — вручную / отдельный job с baseline по согласованию.
- **Повторный инцидент:** pre-commit + обучение.

---

## 6. Secret scanning и hardening (практика в репо)

| Мера | Назначение |
|------|------------|
| **Gitleaks 8.21.2** | Версия и SHA-256 Linux release archive закреплены в workflow; стандартные правила без дополнительных broad path exclusions. Tracked env templates сканируются. |
| **PR / push** | Directed range `BEFORE..HEAD` с `--full-history -m` плюс обязательный exact-tree gate даже при findings в истории. |
| **Current tree** | Raw Git blobs, без checkout filters и `export-ignore`. Historical baseline здесь не применяется. Локальный `WORKTREE` включает неигнорируемые новые файлы; CI сканирует exact commit. |
| **Manual history** | Все reachable commits и merge-parent diffs выбранного commit; дополнительно current-tree gate. Никакого history rewrite. |
| **Pre-commit** (опционально) | Существующий локальный hook не заменяет обязательные CI gates. Его переработка — отдельный scope. |

### Trusted policy и fail-closed поведение

PR запускает `pull_request_target` workflow из target branch. Candidate checkout используется **только как данные**: исполняется wrapper/security suite из trusted policy checkout, не candidate code. Права — только `contents: read`, без persisted credentials. Нельзя добавлять запуск PR scripts/build/package install в этот job.

Изменение policy/config/ledger/workflow/security tests в PR приводит к `POLICY_REVIEW_REQUIRED`. Для такого изменения требуется отдельная проверка владельцем и разрешённая интеграция; автоматического self-approval через новую exception нет. Push проверяет уже принятую policy canonical HEAD.

Отсутствующий или нулевой BEFORE, shallow history, неподдерживаемый tracked entry, неверная версия, ошибка scanner или неполный report завершаются ошибкой. Диапазон не заменяется на последний commit. Directed range учитывает second-parent и merge-resolution content, включая временный secret, добавленный и удалённый внутри push.

### Два разных metadata ledger

- `.gitleaks-current-exceptions.json`: только `generic-api-key` в точном `mobile/ios/Podfile.lock`, полная строка AppMetricaKeychain с 40 hex внутри `SPEC CHECKSUMS`. Wrapper проверяет source context, а не усечённый Match. Другой secret в этом файле не подавляется; сам lockfile не меняется.
- `.gitleaks-history-baseline.json`: exact rule/path/line/commit/blob/fingerprint и reviewed classification/evidence. Содержит подтверждённо revoked Yandex/Plusofon, закрытый legacy Robokassa store и reviewed documentation/synthetic/false-positive occurrences. Не хранит raw values и не использует native `--baseline-path`.
- Новый commit с тем же старым значением не совпадает с historical fingerprint и падает. Existing historical exception не разрешает secret в current tree.
- Ошибочный `.gitleaksignore` удалён; inline `gitleaks:allow` не обходят wrapper.

### Source cleanup и граница production

Все найденные копии двух legacy Robokassa passwords закрытого магазина заменены явными placeholders, включая дополнительные недетектировавшиеся текстовые копии. Текущие production credentials/config и payment runtime не изменяются. Этот cleanup не является подтверждением реального payment smoke.

В `backend/test_stats.py` токен берётся только из `TEST_AUTH_TOKEN`; отсутствие останавливает diagnostic до HTTP-запросов. Public `test-auth.html` сохранён после проверки reachability, но без embedded JWT/autofill и отображения фрагментов токена. Обычный application auth не меняется. StoreKit fixtures заменены валидным synthetic UUID v4 без exception. Doc examples — явные placeholders; расчёты daily_rate сохранены.

Два просроченных JWT удалены из current source. Владелец отдельно разрешил historical-only classification `EXPIRED_JWT_REMOVED` для двух точных occurrences с origin commit/path/rule/line/blob/fingerprint. Это не false positive, не synthetic и не подтверждение revocation. JWT values, Secret/Match и исходные строки в ledger не хранятся. Current-tree exceptions и JWT allowlist не добавлены: повторное внесение старого JWT или любой новый JWT finding завершаются FAIL.

### Локальная проверка без raw logs

Из корня репозитория, с проверенным Gitleaks 8.21.2 в PATH:

```sh
GITLEAKS_BIN=gitleaks python3 scripts/security/test_gitleaks_gate.py
python3 scripts/security/gitleaks_gate.py --mode current-tree --head WORKTREE
python3 scripts/security/gitleaks_gate.py --mode incremental --before <BEFORE_SHA> --head <HEAD_SHA>
python3 scripts/security/gitleaks_gate.py --mode history --head HEAD
```

Вывод: rule, file, line, fingerprint, classification и агрегаты raw/suppressed/baselined/unresolved. Target — unresolved = 0. Scanner работает с `--redact=100`; полный JSON поступает через private FIFO в память. stdout/stderr scanner не транслируются, raw report не сохраняется и не загружается в Actions artifacts. Ошибки возвращают только безопасный код, без traceback/source line/Secret/Match.

### Политика файлов

- **Не коммитить:** `*.key`, приватные PEM, `.p12`, `.pfx`, полные цепочки с приватной частью, **готовые** `fullchain+privkey` в docs.
- **Шаблоны** — только плейсхолдеры (как [SSL_TLS_SERVER_TEMPLATE.md](SSL_TLS_SERVER_TEMPLATE.md)).

### `.gitignore`

- Уже игнорируются `.env`, `deploy/prod/backend.env` и т.д. **Не** добавлять глобальный `*.pem` без исключений — ломает легитимные **публичные** cert в тестах (если появятся). Точечно — по необходимости.

### Документация для контрибьюторов

- [REPO_AND_DEPLOY_HYGIENE.md](../REPO_AND_DEPLOY_HYGIENE.md) — что не класть в git.
- Указатель: этот файл + [SECURITY_TLS_KEY_LEAK_FOLLOWUP.md](SECURITY_TLS_KEY_LEAK_FOLLOWUP.md).

---

## 7. Минимальный чеклист «сделано»

- [ ] Решение **A / B / C** записано (внутренний тикет).
- [ ] CI gitleaks (рабочее дерево) включён и зелёный.
- [ ] (Опционально) pre-commit установлен у разработчиков.
- [ ] Access review org/repo.
- [ ] (Если B/C) residual risk задокументирован; дата пересмотра.
