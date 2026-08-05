---
type: Work
status: complete
project: DeDato
non_canonical: true
audit_baseline: d3407a57171993e23ad3dd6aed3d98a99e7cd196
---

# Runtime drift queue

This queue is sanitized. It contains no credential values, personal data, production targets, exploit instructions or executable operational sequences.

RC-001 remains **OPEN / P0** for `main`. An unmerged remediation candidate exists in branch `fix/authorization-hardening` at candidate HEAD `f2a4a75`. The branch is not runtime evidence for `main`, and its changes are not part of the current canon. Any possible merge requires a separate security review and an explicit project-owner decision.

## Resolved by scoped documentation remediation

| ID | Former severity | Resolution evidence |
|---|---|---|
| RC-003 | P0 | `Operations/ci-cd.md` now records the root workflow inventory and actual deploy order, including Alembic after service start; scoped re-audit against `.github/workflows/`, `scripts/prod/migrate.sh` and `scripts/prod/compose.sh` |
| RC-006 | P1 | `Domain/domain-map.md` assigns operational accounting to the existing Finance owner while Booking supplies context and invokes confirmed synchronous side effects |
| RC-007 | P1 | Domain flows and arrows are explicitly business/direct dependencies; no publisher, event bus or universal notification pipeline is claimed |
| RC-013 | P2 | `Domain/product-roles-business-model.md` links the existing Booking and Loyalty owners and no longer asks whether they should exist |
| RC-014 | P2 | `Domain/domain-map.md` recognizes `Domain/operational-finance.md` as the owner and removes the resolved extraction question |
| RC-015 | P2 | Product/domain overviews retain boundaries and current scope while delegating Booking, Scheduling, Loyalty, Finance and Billing semantics to their owners |

## Open drift

| ID | Severity | Type | Canon owner | Runtime evidence | Required action | Needs owner decision |
|---|---|---|---|---|---|---|
| RC-001 | P0 | security-debt | Identity/Authorization plus scoped Debt | Repository confirms privileged role persistence at common registration, ineffective admin root dependency wiring and inconsistent generic booking object authorization | Run a separate authorization remediation with endpoint inventory and regression tests; do not treat current behavior as policy | Yes — authorize and scope the code/security track |
| RC-002 | P0 | security-debt | `Debt/security-and-privacy.md` | Sanitized path-level repository evidence contains credential-like literals/access-material candidates; validity is `UNKNOWN`, sensitivity `HIGH` | Separate security remediation, rotation/removal decision and history-aware scan without copying values | Yes — security owner and approved handling process |
| RC-004 | P0 | operational-risk | `Operations/deployment-artifact-inventory.md` | Import/restore are classified destructive specialized capabilities; backup/export scope and missing integrity/consistency guarantees are documented | Perform separate script safety review and create an owner-approved, host-verified backup/restore runbook before any use | Yes — operations/data owner and host verification required |
| RC-005 | P0 | legacy-runtime | `Operations/deployment-artifact-inventory.md` | Primary/supporting paths are classified, but competing legacy/historical scripts remain tracked and actual host usage is unknown | Project owner must review and explicitly quarantine, retain or remove legacy artifacts without assuming retirement | Yes — release/operations owner required |
| RC-008 | P1 | incomplete | Product/domain overview only | Master/salon profiles, branches/places, service catalog and public page/blog lifecycle span many models/routers without a detailed owner | Choose bounded owner aspects and document only repository-confirmed lifecycle/API boundaries | Yes — product/domain ownership split |
| RC-009 | P1 | incomplete | Identity, Privacy, topology and overview documents | Email, telephony, OAuth and geocoder integrations are distributed across owners without a common retry/error/status contract | Assign an integration-boundary owner or explicit per-domain ownership map | Yes |
| RC-010 | P1 | client-display-drift | `Architecture/mobile.md` | Local welcome fallback can show stale names, prices, functions, limits or copy and diverges from web error behavior; it does not determine transaction amount or effective entitlement, whose authorities remain Billing backend calculation and Feature Entitlements | Make a separate Product/Billing decision on fallback policy; add tests for catalog success/empty/error, visible fallback notice and discarded welcome selection | Yes — Product/Billing owner; no solution is preselected |
| RC-011 | P1 | unverifiable-host | Production topology and data canon | Repository cannot prove active containers, proxy/TLS, DB revision/physical schema, jobs, volumes, provider modes or monitoring | Keep `UNKNOWN`; perform a separately authorized read-only host audit only if operational assurance is required | Yes — explicit production authorization required |
| RC-012 | P1 | incomplete | Onboarding and CI/CD | Large noncanonical docs/archive plus root runbooks and reports can be mistaken for current truth despite source-priority rules | Add a prominent noncanonical index/status boundary and classify active operational entrypoints | Yes — documentation/operations owner |
| RC-016 | P2 | source-anchor | Several older canonical documents | Links and exact paths resolve, but anchors use mixed `Source:`/`Sources:` forms and sometimes broad directory/file references without symbols | Standardize source-anchor format during owner edits; no broken path requires urgent repair | No |

## Severity counts

| Severity | Count |
|---|---:|
| P0 | 4 |
| P1 | 5 |
| P2 | 1 |

## Recommended first remediation batch

RC-001 remains a separately controlled security/code decision; the unmerged candidate branch does not change current runtime evidence. Credential handling remains a distinct security process. Production artifact ownership and classification are now documented, while RC-004 and RC-005 remain open pending host-verified operational procedure, script safety review and explicit legacy-artifact disposition.
