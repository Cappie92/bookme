---
type: Knowledge
status: active
project: DeDato
last_runtime_check: 2026-08-05
---

# Identity and access

Канон repository-known account, authentication и authorization behavior. Он описывает фактическое enforcement, включая ссылки на [security/privacy Debt](../Debt/security-and-privacy.md); подтверждённые дефекты не являются правильной бизнес-логикой.

## 1. Identity model

`User` — источник истины по account identity. Поддерживаемые значения роли: client, master, salon, legacy indie, admin и moderator. Account хранит уникальные email/phone, password hash, имя/дату рождения, active/deleted state, email/phone verification state и pending contact/reset state.

Профили `Master`, `Salon` и legacy `IndieMaster` принадлежат Profiles, а не заменяют `User`. `UserOAuthAccount` связывает account с внешним provider identity; пара provider + provider user id уникальна. `ModeratorPermissions` хранит fine-grained разрешения отдельного moderator account.

**Source:** `backend/models.py` — `UserRole`, `User`, `UserOAuthAccount`, `ModeratorPermissions`, `EmailVerification`, `PasswordReset`; `backend/schemas.py` — user schemas.

## 2. Registration and verification state

Common registration создаёт active account с неподтверждёнными email и phone и сразу выдаёт JWT pair. Для master дополнительно требуются city/timezone и создаётся `Master`; для остальных ролей профиль в этом handler не создаётся.

Common self-service registration принимает только client, master и salon. Admin, moderator и legacy indie отклоняются request-schema до создания account. OAuth onboarding остаётся отдельным contract для client/master. Исправленный privileged-role gap сохранён как [resolved security Debt](../Debt/security-and-privacy.md#critical-privileged-role-assignment-at-registration).

Email verification использует одноразовые `EmailVerification` rows с purpose/expiry; password reset использует отдельные одноразовые rows. Phone verification хранит server-side target/code/call/expiry/attempt state. Current code-based flow сравнивает введённые данные с сохранённым state; legacy reverse-call flow нарушает этот invariant и отдельно отмечен как [critical Debt](../Debt/security-and-privacy.md#critical-legacy-reverse-call-verification).

`is_verified` и `is_phone_verified` — независимые атрибуты. Сам факт выданного JWT не означает, что оба подтверждены; конкретные endpoints должны явно проверять нужный verification state.

**Source:** `backend/routers/auth.py` — `register`, verification/change/reset handlers; `backend/services/verification_service.py`; `backend/services/zvonok_service.py`; `backend/models.py`.

## 3. Password and JWT sessions

Пароли хешируются bcrypt. Access и refresh JWT подписываются одним symmetric algorithm и содержат subject, role и expiry. Новый subject — numeric `User.id`; resolver сохраняет compatibility fallback на email/phone для legacy tokens.

Bearer dependency декодирует token, повторно загружает `User` и отклоняет отсутствующий, inactive или deleted account. Optional dependency превращает missing/invalid bearer в anonymous context. Role claim не является окончательным authority: role checks работают с текущей DB model.

Repository не содержит session/revocation store. Refresh endpoint проверяет JWT и account, затем выдаёт новую пару. Token class отдельным claim не обозначен, а password change/reset не отзывает уже выданные JWT; это [session-security Debt](../Debt/security-and-privacy.md#high-jwt-class-and-revocation-boundaries).

**Source:** `backend/auth.py`; `backend/routers/auth.py` — login, refresh, password handlers; `backend/settings.py` — expiry/security configuration.

## 4. OAuth boundary

Yandex OAuth включается конфигурацией. Login/link используют подписанный state с ограниченным TTL и только relative `return_to`. Callback обменивает provider code server-side и передаёт web-клиенту короткоживущий opaque ticket, а не JWT в URL. Ticket exchange одноразовый; production хранение ticket опирается на Redis, in-memory fallback разрешён только вне production.

Существующая provider link выбирает account; при отсутствии link verified provider email может связать существующий account. Для нового account создаётся onboarding ticket. OAuth onboarding ограничивает роль client/master, требует подтверждённый phone state и acceptance terms/personal-data flags. Эти flags не сохраняются как consent evidence; см. [Debt](../Debt/security-and-privacy.md#high-registration-consent-evidence).

Link mode требует active bearer account. Provider credentials и ticket values не принадлежат Knowledge и не должны попадать в docs/logs.

**Source:** `backend/routers/auth.py` — Yandex state/ticket/callback/link/onboarding functions; `backend/settings.py`; `backend/tests/test_auth_yandex.py`; `frontend/src/pages/OAuthCallback.jsx`.

## 5. Authorization enforcement

Authorization принадлежит backend endpoint dependencies и object queries, а не UI:

- `get_current_user` authenticates и проверяет active/deleted state;
- `get_current_active_user` дополнительно применяет configured demo-account write restriction;
- `require_role(...)` создаёт role checker;
- `require_moderator_permission(...)` пропускает admin либо проверяет конкретный `ModeratorPermissions` flag;
- object ownership должен отдельно проверяться router/service query.

Core admin router, moderator router и специализированные admin routers применяют server-side role dependencies. Для core admin router root boundary допускает только admin/moderator; endpoint-local moderator-permission dependencies продолжают сужать доступ к конкретным операциям. Исправленный root-enforcement gap сохранён как [resolved security Debt](../Debt/security-and-privacy.md#critical-admin-router-root-enforcement).

Generic Booking router применяет active-user/demo restriction и единое object scope. Client видит и изменяет только свои записи; master, legacy indie, salon owner и branch manager — только записи соответствующего professional resource. Generic create доступен client; edit request создаёт owning client, а решение принимает owning professional side. Platform roles и посторонние resource parties не получают доступ через generic Booking endpoints. История исправления: [resolved Booking authorization Debt](../Debt/booking-scheduling.md#critical-generic-booking-mutation-authorization).

Frontend `AdminRoute` и role-based navigation — UX boundary. Они не компенсируют server-side gap и не являются security control.

**Source:** `backend/auth.py`; `backend/routers/admin.py`; `backend/routers/bookings.py`; `backend/tests/test_authorization_hardening.py`; `frontend/src/App.jsx`. Remediation evidence: commit `e0b8bc7`.

## 6. Demo account

Public demo access endpoint обеспечивает configured demo master и выдаёт обычную JWT pair с demo claim. Backend read-only enforcement определяется не claim, а совпадением текущего account с configured demo identity внутри `get_current_active_user`.

Следствие: write restriction действует только на endpoints, которые проходят через эту dependency. Endpoint с другим/отсутствующим auth dependency не наследует demo read-only автоматически. Frontend blocks — дополнительный UX, не authority.

**Source:** `backend/routers/auth.py` — demo access; `backend/auth.py` — `get_current_active_user`; `frontend/src/contexts/AuthContext.jsx` and demo UI guards.

## 7. Client session behavior

Web хранит access и refresh JWT в `localStorage`, валидирует session через `/api/auth/users/me`, а logout удаляет локальные keys. Tracked web API utility удаляет access token на protected 401; repository-known automatic refresh call отсутствует.

Mobile сохраняет access token через SecureStore, когда он доступен, но дублирует/читает fallback из AsyncStorage; Expo Go использует AsyncStorage. Cached user также хранится в AsyncStorage. Server login/register response включает refresh token, но tracked mobile context сохраняет только access token. Definitive 401 очищает session; network/timeout/server errors могут временно оставить token и cached user.

Storage choices — текущий runtime, не security recommendation; [client token persistence Debt](../Debt/security-and-privacy.md#high-client-token-persistence).

**Source:** `frontend/src/contexts/AuthContext.jsx`, `frontend/src/modals/AuthModal.jsx`, `frontend/src/utils/api.js`; `mobile/src/auth/tokenStorage.ts`, `mobile/src/auth/AuthContext.tsx`, `mobile/src/services/api/auth.ts`.

## 8. Account deletion

Common deletion service поддерживает client и master/indie. В одной transaction он деактивирует/anonymizes `User`, очищает OAuth/verification/reset rows, останавливает subscriptions, отменяет future bookings и удаляет role-specific current data. Исторические Booking/financial identifiers сохраняются; локальные uploads удаляются best-effort.

Удалённый/inactive account перестаёт проходить bearer resolution, поэтому ранее выданные JWT больше не дают active session. Admin/salon/moderator common deletion не поддерживает. Backup, log и external-provider deletion/retention из repository не доказаны; см. [account deletion debt](../Debt/security-and-privacy.md#account-deletion-and-retention-gaps).

**Source:** `backend/services/account_deletion.py`; `backend/routers/auth.py` — delete handlers; `backend/tests/test_account_deletion.py`.

## 9. UNKNOWN and boundaries

- UNKNOWN: внешние API consumers и session-handling вне tracked web/mobile.
- UNKNOWN: production log routing/retention and provider-side identity retention.
- Identity не владеет professional profile, Booking ownership, subscription entitlements или privacy policy text.
- Endpoint prefix/route name не доказывает authorization; проверяется фактическая dependency + object filter.
