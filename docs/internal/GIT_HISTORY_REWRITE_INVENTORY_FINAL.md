# Final pre-rewrite inventory: TLS / PEM в git (DeDato)

> **Дата инвентаризации:** по состоянию репозитория на момент подготовки.  
> **Метод:** `git grep` на **текущем** индексе; `git log --all --name-only -S '<pattern>'` по истории (без вывода содержимого blob).  
> **Не** заменяет повторный прогон на **mirror-клоне** непосредственно перед `filter-repo`.

---

## 1. Паттерны поиска (безопасные сигнатуры)

| Паттерн | Назначение |
|---------|------------|
| `BEGIN RSA PRIVATE KEY` | Классический PEM private key |
| `BEGIN PRIVATE KEY` | PKCS#8 и др. |
| `BEGIN CERTIFICATE` | PEM сертификата (публичный материал; всё равно нежелателен как прод-chain в репо) |
| Эвристика `MII` в `*.sh` / `*.md` | Доп. сужение путей с длинным base64 (совпало с PEM-файлами) |

---

## 2. История: уникальные пути (`git log -S … --name-only`)

### 2.1 `-S "BEGIN RSA PRIVATE KEY"`

| Путь |
|------|
| `SSL_SETUP_INSTRUCTIONS.md` |
| `setup_ssl.sh` |
| `docs/internal/SECURITY_TLS_KEY_LEAK_FOLLOWUP.md` |

### 2.2 `-S "BEGIN CERTIFICATE"`

| Путь |
|------|
| `SSL_SETUP_INSTRUCTIONS.md` |
| `setup_ssl.sh` |
| `docs/internal/SSL_TLS_SERVER_TEMPLATE.md` |
| `update_ssl_cert.sh` |

### 2.3 Эвристика `-S "MII"` (ограничение `*.sh`, `*.md`)

Те же три: `SSL_SETUP_INSTRUCTIONS.md`, `setup_ssl.sh`, `update_ssl_cert.sh`.

---

## 3. Текущее дерево (tracked, `git grep`)

| Наблюдение | Пути |
|------------|------|
| Строка `BEGIN RSA PRIVATE KEY` | Только `docs/internal/SECURITY_TLS_KEY_LEAK_FOLLOWUP.md` — **текст документации**, не PEM-блок. |
| `BEGIN CERTIFICATE` | `docs/internal/SSL_TLS_SERVER_TEMPLATE.md` (упоминание в предупреждении), **`update_ssl_cert.sh`** (встроенный heredoc с **полным** PEM сертификата). |
| `BEGIN.*PRIVATE KEY` (регекс) | `docs/REPO_AND_DEPLOY_HYGIENE.md`, `SECURITY_TLS_KEY_LEAK_FOLLOWUP.md` — политика/описание, **не** ключи. |
| Пути `/etc/ssl/private`, `dedato.ru.key` | `check_ssl_status.sh`, `nginx-dedato.conf`, runbook’и — **пути на сервере**, без PEM в текущем виде. |

---

## 4. Классификация

### Must include in rewrite scope (path-based удаление из истории)

| Путь | Обоснование |
|------|-------------|
| `SSL_SETUP_INSTRUCTIONS.md` | Утёкший private key + cert в истории; файл удалён из tip. |
| `setup_ssl.sh` | Исторические версии с PEM / private key; tip — stub. |
| `update_ssl_cert.sh` | Текущий и исторические коммиты с **полным** встроенным PEM сертификата (heredoc); необходимо убрать из истории и **санитизировать** tip (шаблон без PEM или удаление скрипта). |

**Итого для `git filter-repo --invert-paths`:** минимум **три** пути (перечислить все три в одном вызове).

### Consider / post-rewrite tip (не обязательно трогать историю)

| Путь | Примечание |
|------|------------|
| `docs/internal/SECURITY_TLS_KEY_LEAK_FOLLOWUP.md` | Упоминание фразы `BEGIN RSA PRIVATE KEY` в тексте; **секретного PEM нет**. Историю можно **не** переписывать ради криптографии; опционально смягчить формулировку, чтобы не триггерить сканеры. |
| `docs/internal/SSL_TLS_SERVER_TEMPLATE.md` | Нет реальных PEM-тел; только предупреждение. **Историю не включать** в обязательный scope. |

### Do not include; достаточно контроля вне rewrite

| Путь | Примечание |
|------|------------|
| `check_ssl_status.sh`, `nginx-dedato.conf` | Нет PEM; есть IP/пути — **операционная чувствительность**, не материал ключа; отдельное решение (redact IP в документации при желании). |
| `docs/REPO_AND_DEPLOY_HYGIENE.md` | Упоминание политики в prose. |

### False positives / benign

| Путь | Примечание |
|------|------------|
| Документы с фразами про `BEGIN …` в кавычках / backticks | Не заменяют PEM. |

---

## 5. Достаточно ли только path-based rewrite?

**Да**, для заявленных целей снятия **материала ключа и встроенного прод-сертификата** из истории: удалить из всех коммитов три пути выше, затем в **tip** оставить или заново добавить:

- `setup_ssl.sh` — stub (как сейчас);
- `update_ssl_cert.sh` — **заменить** на версию без heredoc PEM (или удалить и описать в runbook);
- `SSL_SETUP_INSTRUCTIONS.md` — не возвращать.

**Content-based `replace-text`** нужен только если по политике **нельзя** удалить путь целиком — здесь **не требуется**, если приемлемо потерять историю этих файлов.

---

## 6. Повтор перед execution

На **mirror-клоне** непосредственно перед `filter-repo`:

1. Повторить `git log --all -S "BEGIN RSA PRIVATE KEY" --name-only` и `BEGIN CERTIFICATE`.  
2. `gitleaks detect` (git-режим) — сверка с ожиданиями.  
3. Зафиксировать список путей в тикете и команде `filter-repo`.
