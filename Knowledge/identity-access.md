---
type: Knowledge
project: DeDato
knowledge_class: living
environment: common
status: active
last_verified: 2026-09-13
---

# Identity and access

Канон repository-known account, authentication и authorization behavior. Он описывает фактическое enforcement, включая ссылки на [security/privacy Debt](security-and-privacy.md); подтверждённые дефекты не являются правильной бизнес-логикой.

## 1. Identity model

`User` — источник истины по account identity. Поддерживаемые значения роли: client, master, salon, legacy indie, admin и moderator. Account хранит уникальные email/phone, password hash, имя/дату рождения, active/deleted state, email/phone verification state и pending contact/reset state.

Профили `Master`, `Salon` и legacy `IndieMaster` принадлежат Profiles, а не заменяют `User`. `UserOAuthAccount` связывает account с внешним provider identity; пара provider + provider user id уникальна. `ModeratorPermissions` хранит fine-grained разрешения отдельного moderator account.

**Source:** `backend/models.py` — `UserRole`, `User`, `UserOAuthAccount`, `ModeratorPermissions`, `EmailVerification`, `PasswordReset`; `backend/schemas.py` — user schemas.

## 2. Registration and verification state

Password registration is verify-first. `/register` validates the payload, permits only self-service roles `client` and `master`, checks uniqueness and master city/timezone, hashes the password, then stores the pending payload under a 15-minute opaque registration ticket. It creates no `User`, `Master`, promo redemption or JWT session. In production the ticket store is Redis and storage failures return `503`; the process-local fallback is development/test only.

The ticket authorizes only the registration verification endpoints. A phone challenge is bound to purpose, target phone, call id, expiry and attempt state. Successful confirmation atomically claims the ticket against replay, then creates `User` and the mandatory `Master`/promo side effects in one DB transaction and issues a normal JWT pair. Cancel/expiry leaves no account rows. Historical unverified accounts use a distinct, purpose-bound JWT artifact tied to the source `session_version`; they do not share the new-registration ticket semantics.

Email verification uses one-time `EmailVerification` rows. Phone password recovery uses a generic request response, a short-lived purpose-bound challenge token, server-side phone proof and then an opaque one-time `PasswordReset` row; the deprecated direct reset-by-phone endpoint returns `410`. Legacy reverse-phone endpoints are retired (`404`) and are not a current verification mechanism; historical finding: [Reverse-phone verification bypass](reverse-phone-verification-bypass.md).

`is_verified` and `is_phone_verified` are independent. A normal JWT does not by itself prove either attribute; endpoints must explicitly require the state they need.

The verify-first invariant also covers both anonymous public-booking entry points. Specific-master and any-master initial requests persist only an expiring opaque ticket containing the normalized phone and fixed booking payload. Purpose/target/call/expiry/attempt-bound proof is required before the ticket can be atomically claimed. Confirm rechecks slot availability and creates or safely reuses the client plus booking in one DB transaction; conflict rolls back a newly created client. Cancel, expiry, wrong proof and replay create no permanent identity or booking rows. Anonymous use of an existing verified phone still requires possession proof; knowledge of the phone alone produces neither booking nor session.

**Source:** `backend/routers/auth.py` — registration handlers; `backend/routers/bookings.py` — public-booking pending and completion handlers; `backend/services/pending_ticket_service.py`; `backend/services/verification_service.py`; `backend/models.py`; `backend/tests/test_signup_phone_verification.py`; `backend/tests/test_public_booking_phone_verification.py`; `backend/tests/test_password_reset_phone.py`; `backend/tests/test_bookings.py`.

## 3. Password and JWT sessions

Passwords are bcrypt hashes. Every normal access/refresh JWT is issued through the canonical user helpers with stringified numeric `User.id` in `sub`, current DB role, integer `sv=session_version` and `token_type=access|refresh`. Only allow-listed session metadata such as `web_session_origin` can be copied into a new ordinary pair. Demo uses a distinct `token_type=demo_access` session and is not an ordinary pair. Restricted verification/reset JWTs have an explicit `purpose` and are rejected by normal bearer/refresh resolution.

Bearer dependencies accept only access-class tokens, resolve identity exclusively by numeric user id, reload the active/non-deleted `User`, and compare `sv` with the DB. Refresh always requires `token_type=refresh`, validates the same session version and preserves only allow-listed session metadata. During the explicit rollout window, numeric untyped bearer tokens and numeric tokens without `sv` may be accepted according to separate flags; email/phone subjects are never a normal-session compatibility path.

Every password change, first password setup, one-time reset and moderator password update increments the target user's `session_version` in the same transaction as the hash update. Previously issued access/refresh tokens and source-bound handoff/OAuth-link artifacts then fail. The repository still has no per-device session list or refresh-token rotation/reuse store; see [remaining session debt](security-and-privacy.md#high-remaining-session-and-client-token-boundaries).

**Source:** `backend/auth.py` — normal token helpers, resolvers and `update_password_and_revoke_sessions`; `backend/routers/auth.py` — issuance/refresh/password/handoff/OAuth paths; `backend/models.py` — `User.session_version`; migration `20260812_session_version`; `backend/tests/test_jwt_token_contract.py`; `backend/tests/test_session_revocation.py`.

## 4. OAuth boundary

Yandex OAuth включается конфигурацией. Authoritative linking flow:

```text
verified session → signed OAuth state → server ticket → new tokens → authoritative profile
```

Login/link используют подписанный state с ограниченным TTL и только relative `return_to`. Callback обменивает provider code server-side и передаёт web-клиенту короткоживущий opaque ticket, а не JWT в URL. Ticket exchange одноразовый; production хранение ticket опирается на Redis, in-memory fallback разрешён только вне production.

`web_session_origin` сохраняется server-side через signed state и ticket. Query params и frontend markers не могут назначить authoritative origin: `ios_app` сохраняется только если он уже был в verified session; ordinary web остаётся ordinary; anonymous OAuth onboarding не получает `ios_app` без server-side основания. Shortcut «Yandex already linked» обязан сохранить тот же origin. Пока origin не разрешён, commerce fail-closed.

Существующая provider link выбирает account; при отсутствии link verified provider email может связать существующий account. Для нового account создаётся onboarding ticket. OAuth onboarding ограничивает роль client/master, требует подтверждённый phone state и acceptance terms/personal-data flags. Эти flags не сохраняются как consent evidence; см. [Debt](security-and-privacy.md#high-registration-consent-evidence).

Link mode требует active bearer account. Provider credentials и ticket values не принадлежат Knowledge и не должны попадать в docs/logs.

OAuth link state captures the initiating account's `session_version` and origin; callback refuses a state created before password/session revocation. Stale OAuth/bootstrap result не должен перезаписывать более новую session. Mobile-to-web handoff codes likewise bind the source session version and are one-time, so revocation between creation and exchange invalidates the handoff.

**Source:** `backend/routers/auth.py` — Yandex state/ticket/callback/link/onboarding functions; `backend/settings.py`; `backend/tests/test_auth_yandex.py`; `frontend/src/pages/OAuthCallback.jsx`; `frontend/src/utils/authSession.js`.

## 5. Authorization enforcement

Authorization принадлежит backend endpoint dependencies и object queries, а не UI:

- `get_current_user` authenticates и проверяет active/deleted state;
- `get_current_active_user` — active-account check; demo readonly живёт в отдельном global dependency (§6);
- `require_role(...)` создаёт role checker;
- `require_moderator_permission(...)` пропускает admin либо проверяет конкретный `ModeratorPermissions` flag;
- object ownership для Booking mutations принадлежит `require_booking_actor` / `validate_booking_changes`; знание `booking_id` или `edit_request_id` само по себе не даёт права записи.

Router composition неоднородна. Moderator, promo-engine, subscription-plan и service-function admin routers используют instantiated role checker. Core admin router подключает factory некорректно; endpoint-local checkers защищают только handlers, где они объявлены. Это [critical admin enforcement Debt](security-and-privacy.md#critical-admin-router-root-enforcement). Demo readonly — отдельный global dependency, см. §6.

Frontend `AdminRoute` и role-based navigation — UX boundary. Они не компенсируют server-side gap и не являются security control.

**Source:** `backend/auth.py`; router declarations under `backend/routers/`; `frontend/src/App.jsx`.

## 6. Demo account

Current contract: **pre-created shared demo**. Старая модель «anonymous endpoint может создать/reseed shared demo» retired; история — [Decision: pre-created readonly demo](demo-readonly-redesign.md).

Production identity пинится `DEMO_MASTER_USER_ID` плюс canonical phone/role/active/verified/`is_always_free` и единственный `Master.domain=demo-master-{id}`. Anonymous demo access:

- не создаёт данные;
- не reseed-ит данные;
- не repair-ит identity;
- проверяет canonical demo identity;
- при нарушении invariants отвечает fail-closed (`503`).

Demo session:

- JWT `token_type=demo_access`, `demo=true`, role `MASTER`;
- TTL 15 минут;
- refresh token отсутствует, refresh запрещён;
- `ios_app` origin отсутствует;
- demo → web handoff запрещён.

Server-side readonly применяется глобально (`enforce_demo_readonly` на приложении) до business handler и покрывает profile/account, catalog, schedule, bookings, notes, edit requests, loyalty, accounting, payments, subscriptions, balance, promo, domain, uploads и handoff. Session listeners запрещают non-SELECT/flush на demo session. GET не должен создавать persistent state: lazy writes для balance, default subscription/entitlement, loyalty settings и payment settings пропускаются при `db.info["demo_readonly"]`.

Frontend может показывать informational tariff state, но purchase/upgrade CTA, purchase handlers и purchase modal не монтируются; direct commerce routes не открывают commerce. Ordinary web этим не ограничивается.

**Source:** `backend/services/demo_session.py`; `backend/settings.py` — `DEMO_MASTER_USER_ID`; `backend/main.py` — app dependency; `backend/tests/test_demo_readonly_booking_ownership.py`; `backend/tests/test_jwt_token_contract.py`; `frontend/src/utils/demoSession.js`.

## 7. Client session behavior

Session must fail-closed определять trusted origin. Web auth bootstrap:

- stale bootstrap не может перезаписать более новую session (generation/token-identity protection);
- unresolved auth/origin state отделён от подтверждённого anonymous;
- auth/origin error закрывает commerce (`commerceAllowed` только для ordinary/anonymous);
- replacement токена между вкладками синхронизируется;
- старое состояние вкладки не определяет permissions новой session;
- failed/expired handoff не даёт fallback в существующую ordinary browser session.

Failed handoff показывает изолированный error state: нет перехода в старый ordinary cabinet, нет commerce fallback, существующая browser session не используется как запасной путь.

Trusted `ios_app` origin назначается только server-trusted claim после handoff/OAuth; frontend markers не являются authority.

Web хранит access и refresh JWT в `localStorage`, валидирует session через `/api/auth/users/me`, а canonical logout/защищённый `401` удаляют оба token key и session metadata. Repository-known automatic refresh call отсутствует. Verify-first registration state lives only inside the open auth modal; closing/cancelling explicitly discards the backend ticket.

Mobile сохраняет access и refresh tokens через SecureStore, когда он доступен, с AsyncStorage duplication/fallback; Expo Go использует AsyncStorage. Cached user lives in AsyncStorage. Registration verification and password-recovery artifacts use separate typed persistence modules and AuthGate routing, are never installed as a normal bearer session, survive a valid restart, and are removed on cancel/expiry/completion. Successful password mutations route through canonical local logout. Definitive `401` clears session; transient network/timeout/server errors may temporarily retain it.

Storage choices — текущий runtime, not a security recommendation; see [remaining session and client token Debt](security-and-privacy.md#high-remaining-session-and-client-token-boundaries).

**Source:** `frontend/src/utils/authSession.js`; `frontend/src/components/AuthSafetyBoundary.jsx`; `frontend/src/pages/MobileHandoff.jsx`; `frontend/src/contexts/AuthContext.jsx`, `frontend/src/modals/AuthModal.jsx`, `frontend/src/utils/api.js`; `mobile/src/auth/tokenStorage.ts`, `mobile/src/auth/AuthContext.tsx`, `mobile/src/auth/PasswordResetRecoveryContext.tsx`, pending-flow storage/routing modules and `mobile/src/services/api/auth.ts`.

## 8. Account deletion

Common deletion service поддерживает client и master/indie. В одной transaction он деактивирует/anonymizes `User`, очищает OAuth/verification/reset rows, останавливает subscriptions, отменяет future bookings и удаляет role-specific current data. Исторические Booking/financial identifiers сохраняются; локальные uploads удаляются best-effort.

Удалённый/inactive account перестаёт проходить bearer resolution, поэтому ранее выданные JWT больше не дают active session. Admin/salon/moderator common deletion не поддерживает. Backup, log и external-provider deletion/retention из repository не доказаны; см. [account deletion debt](security-and-privacy.md#account-deletion-and-retention-gaps).

**Source:** `backend/services/account_deletion.py`; `backend/routers/auth.py` — delete handlers; `backend/tests/test_account_deletion.py`.

## 9. UNKNOWN and boundaries

- UNKNOWN: внешние API consumers и session-handling вне tracked web/mobile.
- UNKNOWN: production log routing/retention and provider-side identity retention.
- Identity не владеет professional profile, Booking ownership, subscription entitlements или privacy policy text.
- Endpoint prefix/route name не доказывает authorization; проверяется фактическая dependency + object filter.
