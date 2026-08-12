---
type: Knowledge
status: active
project: DeDato
last_runtime_check: 2026-08-12
---

# Configuration and feature flags

Канон repository-known configuration layers DeDato. Он фиксирует sources, precedence и activation lifecycle, но не содержит credential values и не подтверждает фактическую production configuration.

## 1. Configuration layers

| Layer | Persistence / activation | Current ownership |
|-------|--------------------------|-------------------|
| Backend environment | process environment and optional `.env`; read by cached `Settings` | environment, URLs, provider modes, dev/debug switches and business compatibility flags |
| `GlobalSettings` | application DB; changes commit immediately | allow-listed boolean rollout settings from admin API |
| Subscription plan | `SubscriptionPlan.features` / `limits` plus effective `Subscription` | per-account master entitlements |
| Web build/runtime | Vite build variables plus browser `localStorage` compatibility settings | analytics/maps/build behavior and client-only visibility |
| Mobile build/runtime | Expo/EAS env → native config/`extra`, dotenv/process fallback and AsyncStorage | API/web origins, links, analytics, OAuth visibility, diagnostics and client-only visibility |

These layers are not interchangeable. A UI visibility flag is not backend authorization, and a provider mode is not a subscription entitlement.

**Source:** `backend/settings.py`; `backend/models.py` — `GlobalSettings`, `SubscriptionPlan`; `frontend/src/config/features.js`; `mobile/app.config.ts`, `mobile/src/config/env.ts`, `mobile/src/config/features.ts`.

## 2. Backend environment settings

`Settings` uses pydantic-settings with case-sensitive names, optional process-working-directory `.env` lookup and ignored unknown keys. `get_settings()` caches one instance per process; most changes require process restart. Some compatibility/debug flags are additionally materialized as module-level constants at import, so `reload_settings()` alone does not update their existing consumers.

Main categories:

- environment gates: development test-data and E2E routers;
- business compatibility: salon visibility fallback and legacy indie ownership mode;
- external features: OAuth, email, payment and telephony modes;
- diagnostics: master/subscription/payment/daily-charge/mobile-oriented debug switches;
- database and public/internal URL coordinates;
- auth/provider credential categories, whose values are always outside Knowledge.

Production validation rejects a default/missing signing secret and requires provider credential categories when selected live modes need them. Dev/E2E route properties explicitly prevent mounting unauthenticated E2E helpers in production; dev test-data requires development environment as well as opt-in.

Normal JWT rollout has two independent settings. `JWT_SESSION_VERSION_REQUIRED=0` temporarily accepts numeric normal bearer tokens without `sv`; `JWT_TOKEN_TYPE_REQUIRED=0` temporarily accepts numeric untyped bearer tokens as access only. Canonical issuance always includes both claims, and `/refresh` always requires `token_type=refresh`. First rollout keeps both flags at `0`; strict phase changes both to `1` only after all backend instances issue canonical claims and the compatibility window has elapsed.

Verify-first password registration and anonymous public booking share the purpose-namespaced pending-ticket store in Redis. Every ticket read/write/claim/delete path fails closed with `503` in production if Redis is unavailable; only non-production may use the in-process fallback. `docker-compose.prod.yml` supplies the Redis service host, while the production env template's localhost value is documented only for an out-of-compose local process.

**Source:** `backend/settings.py` — `Settings`, JWT rollout properties, validators and `get_settings`; `backend/auth.py` — compatibility enforcement; `backend/services/pending_ticket_service.py`; `backend/routers/auth.py`; `backend/routers/bookings.py`; `backend/main.py`; `backend/utils/master_canon.py`; `backend/.env.example`; `deploy/prod/backend.env.example`; `docker-compose.prod.yml`.

## 3. Backend flag precedence

### Salon feature visibility

Client dashboard response resolves `salons_enabled` as:

1. boolean DB row `GlobalSettings[enableSalonFeatures]`, including explicit `false`;
2. backend env computed flag when the row is missing or DB read fails;
3. false through empty/invalid defaults.

The env helper accepts the primary salon flag, then a legacy alias. Current implementation can still fall through to a true legacy alias when the primary key is explicitly false; this differs from the comment that the alias is used only when the primary key is absent and is tracked in [Debt](../Debt/feature-entitlements-and-jobs.md#salon-env-alias-precedence).

This flag drives returned dashboard/UI visibility, not a universal backend route gate.

**Source:** `backend/settings.py` — `salons_enabled_env`, `used_legacy_salon_alias`; `backend/routers/client.py` — client dashboard stats.

### Master ownership compatibility

`LEGACY_INDIE_MODE` is resolved from backend settings and captured as a module-level boolean in `backend/utils/master_canon.py`. Default is master-only ownership; legacy mode changes booking/client restriction owner fields. A deprecated inverse alias is accepted only by the pure resolver when an explicit env dict is supplied for tests/scripts, not by normal `Settings` runtime.

**Source:** `backend/utils/master_canon.py`; `backend/tests/test_master_canon_flags.py`; booking/client/master call sites.

### Provider activation

OAuth and email use explicit enable flags. Payment and telephony select stub/live behavior from mode fields; Zvonok has a safe stub default unless a recognized live mode is selected, while other providers have their own mode semantics. Production validators establish only required configuration shape, not provider availability.

**Source:** `backend/settings.py`; provider factories/services; [production topology](production-topology.md).

## 4. DB-backed global settings

Admin settings API permits four boolean keys: salon features, blog, reviews and registration. It validates both allow-list and boolean types and upserts `GlobalSettings`. Admin endpoints declare an explicit admin dependency.

Repository-wide consumption is incomplete:

- backend runtime reads only salon features in client dashboard stats;
- admin web screen reads/writes all four DB keys and mirrors them to that browser's localStorage;
- ordinary web visibility helpers read localStorage, not the DB API;
- mobile compatibility helpers read AsyncStorage and are not synchronized with DB settings;
- no backend registration/blog/reviews enforcement reads the corresponding DB keys.

Therefore these rows are configuration data, but only `enableSalonFeatures` has a confirmed backend consumer, and even it is not a global route gate. Drift is recorded in [Debt](../Debt/feature-entitlements-and-jobs.md#global-settings-propagation).

**Source:** `backend/routers/admin.py` — settings allow-list and endpoints; `backend/routers/client.py`; `frontend/src/pages/AdminSettings.jsx`, `frontend/src/config/features.js`; `mobile/src/config/features.ts`.

## 5. Subscription entitlements

Per-master paid access comes from effective subscription + `SubscriptionPlan.features.service_functions` and plan limits, not from `GlobalSettings`. Static runtime mapping converts service-function IDs into named capabilities. Enforcement and response semantics are owned by [Feature entitlements contract](../Contracts/feature-entitlements.md).

**Source:** `backend/utils/subscription_features.py`; `backend/routers/master.py`; subscription plan routers.

## 6. Web configuration

Vite `import.meta.env` values are build-time substitutions. Repository-known uses include analytics counter selection, maps integration, public frontend URL and development-only diagnostics. A rebuild/redeploy is required to change built assets; browser storage cannot change those values.

`frontend/src/config/features.js` is a separate localStorage compatibility layer. Its booleans can hide/show UI in one browser and must never be treated as server authority.

**Source:** `frontend/src/analytics/metrika.js`; maps components; `frontend/src/components/MasterSettings.jsx`; `frontend/src/config/features.js`; `frontend/src/main.jsx`.

## 7. Mobile configuration

Expo app config copies selected build environment into native associated domains, intent filters and `expoConfig.extra`. Runtime URL precedence is `extra` → process variable → public process alias → dotenv; Android development may override the API URL. Non-development builds reject empty or loopback API URLs.

Mobile analytics and Yandex OAuth button visibility resolve their own build/runtime values. Debug flags are parsed from dotenv and are mostly guarded by `__DEV__`; the floating error panel has a stricter explicit development opt-in. `mobile/eas.json` supplies non-secret profile values, while secret categories remain external.

AsyncStorage feature settings are device-local compatibility state and do not synchronize with backend `GlobalSettings`.

**Source:** `mobile/app.config.ts`; `mobile/eas.json`; `mobile/src/config/env.ts`; `mobile/src/config/resolveMobileEnv.ts`; `mobile/src/config/yandexMobileAuth.ts`; `mobile/src/services/analytics/apiKey.ts`; `mobile/src/config/features.ts`.

## 8. Change and verification rules

- Environment/build changes require the relevant backend restart or client rebuild; DB settings do not.
- A flag's name does not prove a consumer. Confirm call sites and server enforcement before documenting rollout impact.
- Never log or copy credential values while checking configuration; use presence/mode-safe summaries only.
- `GlobalSettings`, plan entitlements and local client state can disagree; precedence is consumer-specific, not global.
- Production values, host overrides and external console settings remain `UNKNOWN` without separately authorized evidence.
