---
type: Knowledge
status: active
project: DeDato
last_runtime_check: 2026-08-04
---

# Contract: Feature entitlements

Current master subscription capability contract. Billing lifecycle owns how a `Subscription` is purchased and charged; this document owns how the repository selects and exposes feature access.

## 1. Authority chain

```text
current DB user
  → effective MASTER subscription
  → SubscriptionPlan.features / limits
  → static service-function mapping
  → backend endpoint guard and client capability response
```

An effective subscription satisfies all of: matching user/type, `ACTIVE` status, `is_active=true`, `start_date <= now < end_date`. If multiple rows qualify, the selector chooses greatest `end_date`, then greatest ID, and logs a warning. There is no DB uniqueness over overlapping effective intervals.

`get_user_subscription_with_plan` may create an AlwaysFree subscription for `User.is_always_free`; the readonly selector does not. This read-side mutation is existing [billing Debt](../Debt/subscriptions-billing.md#alwaysfree-side-effect-на-read-path).

**Source:** `backend/utils/subscription_features.py`; `backend/models.py`; [Subscriptions billing](../Domain/subscriptions-billing/README.md#7-состояния-компактно).

## 2. Service-function mapping

Runtime treats numeric IDs as a compatibility contract:

| ID | Capability key | Current product surface |
|----|----------------|-------------------------|
| 1 | `has_booking_page` | booking/public page capability |
| 2 | `has_extended_stats` | extended stats and effective pre-visit confirmation behavior |
| 3 | `has_loyalty_access` | master loyalty management |
| 4 | `has_finance_access` | master finance/accounting operations |
| 5 | `has_client_restrictions` | client rules/restriction UI |
| 6 | `can_customize_domain` | custom public domain update |
| 7 | `has_clients_access` | master client CRM API |

`SubscriptionPlan.features.service_functions` is the runtime entitlement list. Legacy boolean fields in plan JSON are not consulted by `check_feature_access`. `max_page_modules` and `stats_retention_days` remain scalar feature values; `limits.max_future_bookings` controls booking capacity semantics.

Admin plan writes validate that referenced `ServiceFunction` rows exist, are active and are FREE/SUBSCRIPTION type at write time. Runtime checks use the numeric list directly and do not re-read current `ServiceFunction.is_active`; see [Debt](../Debt/feature-entitlements-and-jobs.md#service-function-identity-and-activation-drift).

**Source:** `backend/utils/subscription_features.py`; `backend/models.py` — `SubscriptionPlan`, `ServiceFunction`; `backend/routers/subscription_plans.py`; `backend/alembic/versions/20260128_populate_service_functions_and_plans.py`; `backend/alembic/versions/20260311_ensure_service_functions_rows_and_clients_sf.py`.

## 3. Fallback behavior

`get_master_features` returns:

- plan-derived flags/limits when an effective plan exists;
- plan-derived or permissive compatibility fallback for `is_always_free`;
- without subscription: booking page true, other named capabilities false, module limit zero and stats retention 30 days.

`check_feature_access` has a different AlwaysFree rule: after obtaining any effective/auto-created subscription it returns true for every mapped capability, regardless of the linked plan list. Aggregate `get_master_features` still derives flags from that plan. If no AlwaysFree/Premium plan can be created, the helper returns false while the aggregate fallback returns permissive values. Without any ordinary subscription, aggregate booking-page true also differs from the individual helper false. These paths are [Debt](../Debt/feature-entitlements-and-jobs.md#entitlement-fallback-divergence).

**Source:** `backend/utils/subscription_features.py` — `check_feature_access`, `get_master_features`.

## 4. Capability response

Authenticated master/indie client reads `/api/master/subscription/features`. Response includes named booleans, unlimited-booking flag, module count/limit, stats retention and selected plan identity. The endpoint computes `can_add_more_modules` from count versus returned limit.

Web fetches this response per authenticated session. Mobile keeps a user-scoped AsyncStorage cache for 15 minutes, refreshes on app activation/global invalidation, and can fall back to stale cached data on request failure. These client values control presentation only; backend mutations must re-evaluate entitlement.

Public pricing catalog returns active, non-AlwaysFree plans plus active SUBSCRIPTION service-function descriptions. It describes available offers, not the caller's access.

**Source:** `backend/routers/master.py` — feature and service-function endpoints; `backend/routers/subscription_plans_public.py`; `frontend/src/hooks/useMasterSubscription.js`; `mobile/src/hooks/useMasterFeatures.ts`.

## 5. Backend enforcement matrix

| Capability | Repository-known backend enforcement |
|------------|--------------------------------------|
| booking page | No router call site for `has_booking_page`; aggregate no-subscription fallback reports it true. Current effect is response/UI classification, not a server paywall. |
| extended stats | Extended stats endpoint checks helper; pre-visit effective logic also requires it. Other basic booking/status paths are intentionally separate. |
| loyalty | Master loyalty settings/history/stats endpoints check helper. Existing domain state and public Booking/Loyalty side effects have separate domain rules. |
| finance | Accounting endpoints call a shared guard, except future pre-visit booking confirmation which is explicitly Booking workflow. |
| client restrictions | Named capability is returned to clients, but restriction mutation handlers do not call its helper. Current paywall is not uniformly server-enforced. |
| custom domain | Explicit domain change in master profile checks helper; automatic initial domain generation does not. |
| clients | Master client CRM endpoints call a shared helper and return `FEATURE_NOT_AVAILABLE` on denial. |
| page modules | Create calls legacy `can_add_page_module`, which currently always returns false; response limit and mutation behavior diverge. Update/delete use ownership without entitlement recheck. |

This table is factual runtime behavior. Missing checks are not intended policy; confirmed gaps are in [Debt](../Debt/feature-entitlements-and-jobs.md).

**Source:** call sites in `backend/routers/master.py`, `backend/routers/master_loyalty.py`, `backend/routers/accounting.py`, `backend/routers/master_clients.py`, `backend/routers/master_page_modules.py`; `backend/utils/pre_visit_effective.py`; repository call-site search.

## 6. Limits

`limits.max_future_bookings` uses null/zero as unlimited in entitlement helpers. Capacity endpoints count active future bookings and compare positive limits; some Free-plan presentation/monitor paths substitute a default when the plan limit is absent/unlimited. The Booking create enforcement owner and exact count semantics remain domain-specific, so clients must treat the features response as display data and rely on server mutation result.

`features.max_page_modules` is returned and counted, but current create path is disabled by the legacy helper regardless of this number. `stats_retention_days` is returned as zero for unlimited; repository does not show a cleanup job enforcing this retention value.

**Source:** `backend/utils/subscription_features.py`; `backend/routers/master.py`, `backend/routers/domain.py`, `backend/routers/master_page_modules.py`; `backend/services/bookings_limit_monitor.py`.

## 7. Admin mutation and revocation

Admin APIs manage service-function rows and plan JSON. Plan create/update validates assigned rows. Removing an ID from plan JSON affects subsequent entitlement checks immediately; the helper named `disable_service_functions_for_plan` only iterates/logically acknowledges current subscriptions and performs no per-account mutation, because access is recomputed from the plan.

Disabling/deleting a `ServiceFunction` row without removing its already assigned numeric ID does not change current helper result. Static mapping also assumes stable IDs. Those constraints require controlled plan/catalog changes and are tracked as Debt.

**Source:** `backend/routers/service_functions.py`; `backend/routers/subscription_plans.py`; `backend/utils/subscription_features.py`.

## 8. Contract rules and UNKNOWN

- Backend helper/guard is authority; web/mobile feature locks are UX.
- Entitlement response can be cached; mutation handlers must not trust client state.
- Plan `is_active` controls catalog visibility but effective entitlement helper loads the linked plan without checking `plan.is_active`; disabling a plan does not revoke existing subscriptions by itself.
- UNKNOWN: external consumers and intended commercial policy for currently unguarded surfaces.
- UNKNOWN: production plan/service-function data and whether static IDs have drifted; repository migrations/tests establish expected mapping only.
