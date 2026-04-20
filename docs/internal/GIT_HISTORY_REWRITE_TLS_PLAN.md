# План безопасного git history rewrite (TLS secret в истории)

> **Статус:** подготовка к операции. **Не** выполнять команды из этого файла без отдельного решения, backup и окна для force-push.  
> **Контекст:** в истории встречались PEM / `BEGIN RSA PRIVATE KEY` (см. инцидент TLS). Production key **уже** ротирован; цель rewrite — **уменьшить** распространение секрета в **объектах** центрального remote и новых clone.

---

## 1. Scope of rewrite

### 1.1 Обязательный минимум (path-based)

| Объект | Почему |
|--------|--------|
| `SSL_SETUP_INSTRUCTIONS.md` (корень, пока существовал в истории) | Полный PEM и nginx-инструкции; файл **удалён** из текущего дерева, но **остаётся** в старых коммитах. |
| `setup_ssl.sh` | В **текущем** дереве — stub; в **истории** до санитизации содержал private key / PEM. |
| `update_ssl_cert.sh` | В истории и **текущем** дереве — heredoc с **полным** PEM сертификата; попадает под `-S "BEGIN CERTIFICATE"` и эвристику `MII`. **Обязательно** в scope rewrite. |

**Финальный инвентарь (поиск, классификация):** [GIT_HISTORY_REWRITE_INVENTORY_FINAL.md](GIT_HISTORY_REWRITE_INVENTORY_FINAL.md).

**Вывод:** минимум **три** пути для `--invert-paths`: `SSL_SETUP_INSTRUCTIONS.md`, `setup_ssl.sh`, `update_ssl_cert.sh`. Дальше — tip: stub для `setup_ssl.sh`, **санитизировать или удалить** `update_ssl_cert.sh` (без PEM в репо).

### 1.2 Дополнительный поиск (до rewrite)

Выполнить **локально на mirror-клоне** (не печатать совпадения в публичные логи):

```bash
git log --all -S "BEGIN RSA PRIVATE KEY" --oneline
git log --all -S "BEGIN CERTIFICATE" --oneline
git log --all -S "dedato.ru.key" --oneline
```

При появлении **других** путей — добавить их в тот же filter-repo запуск (§3).

### 1.3 Path deletion vs content replacement

| Стратегия | Когда |
|-----------|--------|
| **Удалить путь из всей истории** (`--invert-paths` для `--path`) | Файл не нужен в истории (отчёты, одноразовые скрипты). После rewrite **добавить** актуальную версию `setup_ssl.sh` (stub) **одним** новым коммитом, если в tip его не окажется. |
| **replace-text** (regex / литеры) | Нужно сохранить историю файла, но вырезать блоки PEM — **сложнее** (многострочный regex, риск неполного удаления). Для ключа обычно надёжнее **полное удаление пути** + чистый файл сверху. |

**Рекомендация:** удалить из истории **три** пути (см. выше), затем убедиться, что **tip** содержит только **stub** `setup_ssl.sh` и **не** содержит PEM в `update_ssl_cert.sh` (шаблон/удаление — отдельный коммит после rewrite).

---

## 2. Инструмент: `git filter-repo` (основной путь)

### 2.1 Почему не BFG «по умолчанию»

- **git filter-repo** — рекомендуемый преемник `git filter-branch`, активно поддерживается, гибкие `--path` / `--invert-paths` / `--replace-text`, хорошая документация.  
- **BFG** — быстрый для крупных blob, но для **точечного** списка путей и повторяемого сценария команда обычно проще в **filter-repo**.

BFG оставить как **запасной** вариант, если команда уже стандартизировала его для strip blobs.

### 2.2 Установка (оператор)

Следовать официальной инструкции `git-filter-repo` (pip / пакет дистрибутива). Проверка: `git filter-repo --help`.

### 2.3 Черновик команд (НЕ выполнять без backup и review)

**Только после** зеркального клона (§3.1), в **копии** репозитория:

```bash
# Пример: удалить три пути из всей истории (уточнить флаги веток по --help)
git filter-repo --force \
  --path SSL_SETUP_INSTRUCTIONS.md --path setup_ssl.sh --path update_ssl_cert.sh \
  --invert-paths
```

После `--invert-paths` пути исчезают из **всех** коммитов: проверить `git show HEAD:setup_ssl.sh` — файла может не быть. Тогда:

```bash
# Восстановить только текущий stub из эталона (скопировать из основного клона или из ветки до rewrite)
git add setup_ssl.sh
git commit -m "chore(security): add sanitized setup_ssl.sh stub after history filter"
```

Точные флаги (`--refs`, `--partial`) — по версии `git-filter-repo` и политике (все ветки vs только `main`).

---

## 3. Безопасный execution plan (порядок)

1. **Объявить окно** + список затронутых (форки, CI, релизы).  
2. **Заморозить** merge в `main` на время операции (по возможности).  
3. **Bare mirror backup** центрального remote:
   ```bash
   git clone --mirror <url> dedato-backup-$(date +%Y%m%d).git
   ```
4. **Отдельный working clone** для эксперимента (не тот же каталог, где повседневная работа).  
5. Запустить **inventory** (§1.2) на mirror.  
6. Выполнить **filter-repo** на клоне (§2.3).  
7. **Локальная валидация** (§4).  
8. **Согласовать** force-push с владельцем org.  
9. `git push --force --all` и при необходимости `--tags` (осторожно с тегами).  
10. Разослать **инструкции** коллегам (§5).  
11. Очистить **CI caches**, **re-run** gitleaks по истории (§4).

**Никогда не** делать filter-repo на единственной копии без mirror backup.

---

## 4. Validation plan (после rewrite, до push)

На **переписанном** клоне:

| Проверка | Критерий успеха |
|----------|-----------------|
| `git log --all -S "BEGIN RSA PRIVATE KEY" --oneline` | **Пусто** (или только ложные срабатывания вне PEM — перепроверить). |
| `git log --all -- SSL_SETUP_INSTRUCTIONS.md` | **Нет** истории файла. |
| `git log --all -- setup_ssl.sh` | Либо только коммиты **после** stub, либо история удалена и один коммит со stub — по выбранной стратегии. |
| `gitleaks detect --source .` (полный git-режим) | Нет находок private key / PEM секрета (может потребоваться настройка baseline до rewrite — после rewrite baseline **сбросить**). |
| `git fsck`, тестовый `clone` с нуля в чистый каталог | Репозиторий клонируется, `main` собирается как ожидается. |

---

## 5. Collaborator sync plan

- **Force-push** переписывает историю: старые SHA **невалидны**.  
- Каждый разработчик:
  - **Вариант A (предпочтительно):** `git clone` репозитория **заново** в новый каталог, перенести незакоммиченные патчи вручную.  
  - **Вариант B:**  
    ```bash
    git fetch origin
    git reset --hard origin/main
    ```
    (потеря локальных коммитов, не в merge — только если понимает риск).  
- **Открытые PR:** после force-push обычно **закрыть и пересоздать** из новых веток, либо rebase — зависит от платформы.  
- **Форки:** владельцы должны **перебазировать** или удалить fork и форкнуть снова; иначе в fork **останется** старая история с секретом.  
- **Сообщение команде (шаблон):** «История main переписана для удаления секрета из git; выполните fresh clone или `fetch + reset --hard origin/main`; пересоздайте long-lived ветки от нового main».

---

## 6. Rollback / safety plan

- **Источник правды до push:** каталог `dedato-backup-*.git` (mirror). Восстановление remote = `git push --mirror` из backup **только** при согласовании (вернёт секрет в историю remote — только если rewrite ошибочен).  
- **Локально до push:** сохранить `refs/original/` если filter-repo создал (или использовать `git reflog` в клоне до filter-repo).  
- **Если после push обнаружена ошибка:** повторный filter-repo на новом состоянии или восстановление из mirror backup с уведомлением команды повторно.

---

## 7. Связанные документы

- [POST_INCIDENT_REPO_HARDENING.md](POST_INCIDENT_REPO_HARDENING.md) — когда rewrite оправдан vs компенсации.  
- [SECURITY_TLS_KEY_LEAK_FOLLOWUP.md](SECURITY_TLS_KEY_LEAK_FOLLOWUP.md) — исходный инцидент.  
- Политика org: branch protection, кто может `--force` push.

---

*Этот документ — план; исполнение — только с backup, двухфакторным согласованием и после успешной валидации §4.*
