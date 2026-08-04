---
type: Work
status: active
project: DeDato
non_canonical: true
---

# Decision queue

Только вопросы, которые нельзя разрешить repository evidence и которые требуют выбора владельца продукта. `UNKNOWN`, не блокирующие корректный канон, сюда не добавляются.

## Open decisions

Нет вопросов, блокирующих продолжение repository-known Knowledge packages.

## Required owner follow-up

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
