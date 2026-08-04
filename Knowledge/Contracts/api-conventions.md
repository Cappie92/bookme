---
type: Knowledge
status: active
project: DeDato
last_runtime_check: 2026-08-04
---

# Backend API conventions

Фактический cross-domain HTTP contract FastAPI backend. Domain contracts уточняют конкретные endpoints и имеют приоритет по своей области.

## Addressing and versioning

Основная authenticated API surface находится под `/api`, но prefix собирается двумя способами: main-level `/api` + router prefix или полный `/api/...` в router. Public surfaces включают `/api/public/masters`, public payment callbacks/status, blog/domain paths, uploads/assets и SPA GET catch-all.

URL path versioning (`/v1`) отсутствует. FastAPI metadata сообщает статическую application version `1.0.0`; это OpenAPI metadata, а не механизм совместного существования версий contract.

**Sources:** `backend/main.py`; APIRouter declarations in `backend/routers/`.

## Request formats

Repository поддерживает несколько input styles:

- JSON bodies через Pydantic schemas;
- query parameters, включая mutating endpoints с query-only payload;
- form/multipart для login/payment callbacks/profile uploads;
- path parameters;
- несколько handlers принимают untyped/loosely typed `dict`.

Pydantic/FastAPI выполняет parse/validation до handler и по умолчанию возвращает 422 для schema validation errors. Большинство schemas использует Pydantic default extra-field behavior; отдельные schemas явно настраивают `extra`. Поэтому клиент не должен считать неизвестное поле persisted только потому, что request был принят.

Dates/times сериализуются стандартными Pydantic JSON representations, но часть routes вручную принимает/parses ISO strings или dates. Timezone semantics принадлежат соответствующему domain contract.

**Sources:** `backend/schemas.py`; router-local Pydantic classes; `Body`, `Query`, `Form`, `File` and `UploadFile` call sites.

## Response serialization

Там, где указан `response_model`, FastAPI валидирует/сериализует результат по schema. Другие handlers возвращают ORM rows, dict/list, primitive/null, `JSONResponse`, redirects, files или plain `Response`.

Единого success envelope нет. List contracts также различаются:

- bare arrays;
- named arrays with count/totals;
- `page`/`limit`/`pages` objects;
- cursor-like or domain-specific summaries.

HTTP creation status также endpoint-specific: многие POST возвращают default 200, некоторые explicitly 201. Клиент должен следовать конкретному domain endpoint, а не выводить форму ответа из HTTP method.

**Sources:** route decorators and returns in `backend/routers/`; `backend/schemas.py`.

## Authentication contract

Protected endpoints принимают `Authorization: Bearer <JWT>`. Missing/invalid required bearer обычно даёт 401 с `WWW-Authenticate: Bearer`; authenticated identity с неподходящей role/permission/capability обычно получает 403.

Optional-auth dependency трактует missing, invalid, inactive или deleted identity как anonymous `None`, а не как 401. Demo master mutating requests блокируются общим active-user dependency, если handler его использует.

Object ownership и business/capability guards не выводятся из bearer автоматически: их добавляет router/service. Конкретный authorization contract описан в [Identity API](identity-api.md), [Identity and access](../Domain/identity-access.md) и domain Debt.

**Sources:** `backend/auth.py`; router dependencies.

## Error representations

Default FastAPI conventions:

- validation errors — 422 structured body;
- `HTTPException(detail="...")` — object с string `detail`;
- `HTTPException(detail={...})` — object, где `detail` само является nested object;
- uncaught exception — framework 500 response.

Repository не имеет общего business-error envelope. Единственный application-level custom exception handler — `SchemaOutdatedError`: flat 409 body с `detail`, `code`, `hint`, optional `debug` и header `X-Error-Code: SCHEMA_OUTDATED`. Отдельные capability handlers также ставят `X-Error-Code`, но с domain-specific bodies.

Некоторые handlers преобразуют caught exception text в HTTP `detail`; это фактический, но нестабильный contract и не должно использоваться клиентом как machine-readable code.

**Sources:** `backend/main.py` — `schema_outdated_handler`; `backend/exceptions.py`; `backend/routers/loyalty.py`; HTTPException call sites.

## Transactions and idempotency

HTTP method сам по себе не задаёт transaction boundary. `get_db` только выдаёт/закрывает session; конкретный path определяет commit/rollback. Некоторые GET/read-like endpoints могут durable-create defaults или derived rows. Domain docs явно отмечают такие write-on-read paths.

Idempotency также domain-specific: payment identifiers/signatures, unique confirmation, reward grant keys и query-before-insert checks не образуют общего API idempotency-key contract. Generic `Idempotency-Key` header middleware отсутствует.

**Sources:** `backend/database.py`; transaction call sites; [Booking completion](../Domain/booking/completion-side-effects.md); [Promo](../Domain/promo.md); [Billing invariants](../Domain/subscriptions-billing/invariants.md).

## Compatibility boundaries

Repository одновременно обслуживает canonical и legacy route/model families. Совместимость может включать:

- legacy JWT subject fallback from numeric user ID to email/phone;
- canonical Master и legacy IndieMaster paths;
- legacy/new promo and finance APIs;
- legacy payment init path без modern calculation snapshot;
- response fields retained for web/mobile clients.

Наличие mounted legacy path подтверждает доступность кода, но не доказывает фактическое production usage. Удаление или изменение требует client call-site inventory и targeted contract tests.

**Sources:** `backend/auth.py`; `backend/routers/client.py`, `backend/routers/master.py`, `backend/routers/promo_codes.py`, `backend/routers/promo_engine.py`, `backend/routers/expenses.py`, `backend/routers/accounting.py`, `backend/routers/payments.py`; web/mobile API clients.

## OpenAPI

Docs доступны на `/docs`, `/redoc` и `/openapi.json`. Tags и часть expected responses заданы вручную. Схема полезна для typed `response_model`/Pydantic paths, но не доказывает object ownership, transaction semantics, internal side effects или runtime compatibility branches.

Подтверждённые gaps находятся в [Backend/API Debt](../Debt/backend-api.md).
