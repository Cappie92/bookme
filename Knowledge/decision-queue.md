---
type: Knowledge
project: DeDato
knowledge_class: retro
environment: common
status: closed
last_verified: 2026-08-05
non_canonical: true
---

# Decision queue

Только вопросы, которые нельзя разрешить repository evidence и которые требуют выбора владельца продукта. `UNKNOWN`, не блокирующие корректный канон, сюда не добавляются.

## Open decisions

Нет вопросов, блокирующих продолжение repository-known Knowledge packages.

## Required owner follow-up

### Entitlement authority remediation

- **Evidence:** paid capability enforcement, aggregate response and catalog activation are not one contract; confirmed gaps are in `feature-entitlements-and-jobs.md`.
- **Required action:** product/backend owners define server enforcement for each capability and a stable service-function identity/revocation model in a separate code/test track.

### Background execution ownership

- **Evidence:** five jobs are process-local; recurring expenses lack catch-up/DB idempotency and daily charges lack DB uniqueness.
- **Required action:** billing/finance/infrastructure owners choose single-run ownership, timezone, durable idempotency and health/alert semantics before multi-process scaling.

### Credential-like repository evidence remediation

- **Evidence class:** repository evidence
- **Validity:** UNKNOWN
- **Sensitivity:** HIGH
- **Sanitized sources:** `frontend/src/components/YANDEX_API_SETUP.md`; `docker-compose.yml`; `mobile/src/services/analytics/apiKey.ts`; `backend/tests/conftest.py`; access-named tracked artifacts listed in `security-and-privacy.md`.
- **Required action:** отдельный security remediation с authorized credential owner; Knowledge track не читает, не копирует и не проверяет значение.
- **Owner decision 2026-08-04:** не считать literal ни действующим, ни отозванным без доказательств; продолжить независимые Knowledge packages.

### Separate authorization remediation

- **Статус:** required after завершения или контролируемой остановки Knowledge track; не выполняется в текущей documentation mission.
- **Trust boundary:** authenticated identity → object-level booking mutations.
- **Category/severity:** inconsistent object-level authorization; `critical`.
- **Confirmed scope:** часть mounted generic booking mutation handlers не применяет role/ownership enforcement, применяемый соседними paths.
- **Potential impact:** целостность booking-данных вне разрешённого пользователю объекта.
- **Sources:** `backend/main.py` — router composition; `backend/routers/bookings.py` — affected mutation symbols and guarded comparison path.
- **Owner decision 2026-08-04:** продолжить Knowledge track с sanitized debt; code/test remediation оформить отдельным авторизованным треком.
- **Security boundary:** не хранить здесь эксплуатационные шаги или углублённый exploitability analysis.

## Entry format

При Stop Gate запись должна содержать:

- область и блокируемый канонический документ;
- подтверждённые факты;
- два или более разумных варианта;
- последствия каждого варианта;
- почему runtime не определяет выбор;
- какое решение требуется от владельца.
