# План чистки конфигурации backend (env vars)

**Цель:** убрать мусор, дубли, legacy и опасные дефолты без поломки prod.  
**Состояние на момент плана:** единый модуль `backend/settings.py` уже введён; приложение читает конфиг через `get_settings()`.

---

## 1. Что удаляем (UNUSED / из шаблонов)

| Действие | Переменная | Где убрать | Риск |
|----------|------------|------------|------|
| Удалить из шаблонов и доков | **SALON_ROLE_ENABLED** | .env.example, env_template.txt, любые инструкции | low — в коде поддерживается как legacy alias в settings (один WARNING при старте); канон: SALONS_ENABLED |
| Не документировать как актуальную | **MASTER_CANON_MODE** | .env.example, env_template; в доке пометить deprecated | low — чтение остаётся в master_canon при передаче env (тесты) |

**Итог:** из .env.example и env_template не включать SALON_ROLE_ENABLED и MASTER_CANON_MODE. В CONFIG_AUDIT они уже помечены duplicate/legacy.

---

## 2. Что объявляем legacy (оставляем временно с warning)

| Переменная | Текущее состояние | Действие |
|------------|-------------------|----------|
| **MASTER_CANON_MODE** | Читается в utils/master_canon только если передан dict env (тесты); при обычном запуске используется LEGACY_INDIE_MODE из settings | Не добавлять в settings. В коде при чтении из os.environ (если когда-то снова появятся такие вызовы) логировать warning "MASTER_CANON_MODE deprecated, use LEGACY_INDIE_MODE". В шаблонах и примерах не указывать. |

Миграция для пользователей: перейти на **LEGACY_INDIE_MODE** (0 = master-only, 1 = legacy). Один релиз можно поддерживать оба имени через alias в доке: "если у вас задан MASTER_CANON_MODE, задайте вместо него LEGACY_INDIE_MODE: 0 или 1".

---

## 3. Что переименовываем (duplicate → canonical)

| Было (в шаблонах/доках) | Стало (canonical) | Действие |
|-------------------------|-------------------|----------|
| SALON_ROLE_ENABLED | **SALONS_ENABLED** | Во всех шаблонах и в документации — только SALONS_ENABLED. В коде SALON_ROLE_ENABLED читается как legacy alias (если SALONS_ENABLED не задан); при использовании — один WARNING при старте. См. раздел 9. |

Код уже использует только SALONS_ENABLED; меняются только шаблоны и доки.

---

## 4. Какие значения переносим в secrets

Хранить только в секретах/vault, не в .env в репозитории:

- **JWT_SECRET_KEY** — в prod обязательно из секретов.
- **DATABASE_URL** — если содержит пароль (postgres), только из секретов.
- **ROBOKASSA_PASSWORD_1**, **ROBOKASSA_PASSWORD_2** — секреты.
- **ZVONOK_API_KEY** — секрет.
- **PLUSOFON_ACCESS_TOKEN** — секрет.
- **TOKEN** (в скриптах) — не хранить в репо; передавать через env при запуске или интерактивно.

В .env.example и env_template — только имена переменных и комментарии, без реальных значений для секретов.

---

## 5. Какие дефолты убираем (особенно у секретов)

| Переменная | Было | Стало | Где |
|------------|------|-------|-----|
| JWT_SECRET_KEY | Дефолт в коде для dev | В settings оставить dev-дефолт только для non-production; в production валидатор запрещает дефолт | Уже сделано в settings.py (model_validator) |
| PLUSOFON_ACCESS_TOKEN | Захардкоженный дефолт в коде | Без дефолта; читать из env (пустая строка в settings) | Уже сделано: в settings пустая строка, в plusofon_service убран хардкод |
| ROBOKASSA_PASSWORD_1/2 | Пустая строка в settings | Оставить пустую строку как "не задано"; в prod при включённых платежах проверять на пустоту при первом использовании (опционально) | При необходимости добавить проверку в роутере платежей при non-stub |

Итог: дефолтов у секретов в коде нет (пустая строка = «не задано»). В production при старте: JWT_SECRET_KEY проверяется всегда; при включённой фиче (режим задан и не stub) проверяются Robokassa-, Zvonok-, Plusofon-секреты (см. `validate_feature_secrets_in_production` в settings.py).

---

## 6. Миграционный план (2–3 шага, без поломки прод)

### Шаг 1 (уже сделано)
- Введён `backend/settings.py` с pydantic-settings.
- Код приложения переведён на `get_settings()`.
- В production при старте проверяется JWT_SECRET_KEY (не дефолт).
- Обновлены .env.example и env_template: сгруппированы переменные, только актуальные имена, без реальных секретов.
- В CONFIG_AUDIT и этот CLEANUP_PLAN зафиксированы инвентарь и план.

### Шаг 2 (финальная синхронизация шаблонов, без поломки прод)
- В .env.example и env_template не включать SALON_ROLE_ENABLED и MASTER_CANON_MODE (только канон: SALONS_ENABLED, LEGACY_INDIE_MODE).
- Прод не ломается: legacy SALON_ROLE_ENABLED по-прежнему читается в settings как fallback; при использовании — один WARNING при старте.
- Секреты брать из vault/secrets, не коммитить в .env.

### Шаг 3 (опционально, следующий релиз)
- Если где-то остались упоминания MASTER_CANON_MODE в runbook/доках — заменить на LEGACY_INDIE_MODE с пояснением 0/1.
- Рассмотреть чтение DATABASE_URL в alembic через тот же .env, что и приложение (без импорта всего приложения), чтобы единый источник правды был и для миграций.

---

## 7. Проверка после изменений

- Локальный старт:  
  `cd backend && python3 -m uvicorn main:app --reload --host 0.0.0.0 --port 8000`
- Health:  
  `curl -i http://localhost:8000/health` → HTTP 200 и тело `{"status":"healthy","service":"DeDato API"}` (допускается пробел после двоеточий).
- Авто-проверка конфига (из корня репо):  
  `make config-runbook` или `./backend/scripts/runbook_config_check.sh` → ожидание: РОВНО 3 проверки PASS и exit 0.
- В логах при старте — вывод safe summary конфигурации (без секретов) через `get_settings().log_safe_summary()`.

---

## 8. Runbook (проверки конфигурации)

**Основные команды (Runbook):**  
(1) Запуск backend: `cd backend && python3 -m uvicorn main:app --reload --host 0.0.0.0 --port 8000`  
(2) Health: `curl -i http://localhost:8000/health` → HTTP 200 и тело `{"status":"healthy","service":"DeDato API"}` (допускается пробел после двоеточий).  
(3) Авто-проверка конфига (из корня репо): `make config-runbook` или `./backend/scripts/runbook_config_check.sh` → ожидание: РОВНО 3 проверки PASS и exit 0.

**Автоматически (из корня репо):** `make config-runbook` или `./backend/scripts/runbook_config_check.sh` — проверяет пункты 3–5 без подхвата локального .env.

**Минимальные проверки после изменений в конфиге:**

1. **Запуск backend локально**
   ```bash
   cd backend && python3 -m uvicorn main:app --reload --host 0.0.0.0 --port 8000
   ```
   Требуется минимальный env: `JWT_SECRET_KEY`, `DATABASE_URL` (или скопировать из `backend/.env.example` в `backend/.env`).

2. **Health**
   ```bash
   curl -i http://localhost:8000/health
   ```
   Ожидаем: HTTP 200 и тело `{"status":"healthy","service":"DeDato API"}` (допускается пробел после двоеточий).

3. **Production без JWT или с дефолтным JWT — приложение не стартует**
   ```bash
   ENVIRONMENT=production JWT_SECRET_KEY=your-secret-key-here-change-in-production python3 -c "import sys; sys.path.insert(0,'backend'); from settings import get_settings; get_settings()"
   ```
   (из корня репо) → ожидаем `ValidationError` про JWT_SECRET_KEY.

4. **Production при включённых не-stub фичах без секретов — не стартует**
   Например: `ENVIRONMENT=production ROBOKASSA_MODE=test python3 -c "import sys; sys.path.insert(0,'backend'); from settings import get_settings; get_settings()"` (без ROBOKASSA_MERCHANT_LOGIN, PASSWORD_1, PASSWORD_2) → ожидаем `ValidationError` с перечислением недостающих переменных.

5. **Development со stub — стартует без необязательных секретов**
   С `ENVIRONMENT=development`, `ROBOKASSA_MODE=stub`, без robokassa/telephony секретов приложение должно успешно стартовать.

**Definition of Done (конфиг-аудит):** конфиг-аудит считается завершенным, если команды (1)–(3) выполнены без ошибок; /health вернул тело `{"status":"healthy","service":"DeDato API"}`; make config-runbook дал ровно 3 PASS и exit 0.

---

## 9. Legacy-переменные (поддержка обратной совместимости)

**Срок поддержки legacy-алиасов:** до ближайшего major релиза или оговорённого дедлайна; миграция не ломает прод — в коде чтение legacy только как fallback при отсутствии канона.

| Переменная | Каноническая замена | Где поддерживается | Срок |
|------------|---------------------|--------------------|------|
| **SALON_ROLE_ENABLED** | **SALONS_ENABLED** | `backend/settings.py`: если задан только SALON_ROLE_ENABLED, используется как значение salons_enabled; при старте один раз пишется WARNING. В .env.example и шаблонах не упоминать. | **Deprecated.** Поддержка до ближайшего major / оговорённого дедлайна. |
| **MASTER_CANON_MODE** | **LEGACY_INDIE_MODE** | `backend/utils/master_canon.py`: в runtime из os.environ не читается; допускается только чтение из переданного dict env (тесты/скрипты). В шаблонах и .env.example не указывать. | Deprecated; использовать LEGACY_INDIE_MODE (0 = master-only, 1 = legacy). |

В шаблонах (.env.example, env_template.txt) и в инструкциях использовать только канонические имена; legacy — только для обратной совместимости при чтении env.
