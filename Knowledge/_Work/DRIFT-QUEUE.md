---
type: Work
status: complete
project: DeDato
non_canonical: true
audit_baseline: d3407a57171993e23ad3dd6aed3d98a99e7cd196
---

# Runtime drift queue

This queue is sanitized. It contains no credential values, personal data, production targets, exploit instructions or executable operational sequences.

| ID | Severity | Type | Canon owner | Runtime evidence | Required action | Needs owner decision |
|---|---|---|---|---|---|---|
| RC-001 | P0 | security-debt | Identity/Authorization plus scoped Debt | Repository confirms privileged role persistence at common registration, ineffective admin root dependency wiring and inconsistent generic booking object authorization | Run a separate authorization remediation with endpoint inventory and regression tests; do not treat current behavior as policy | Yes — authorize and scope the code/security track |
| RC-002 | P0 | security-debt | `Debt/security-and-privacy.md` | Sanitized path-level repository evidence contains credential-like literals/access-material candidates; validity is `UNKNOWN`, sensitivity `HIGH` | Separate security remediation, rotation/removal decision and history-aware scan without copying values | Yes — security owner and approved handling process |
| RC-003 | P0 | contradiction | `Operations/ci-cd.md` | Deploy workflow invokes the production migration helper after services start; canon states no explicit Alembic deploy step | Correct CI/CD canon in a remediation change and add an automated assertion for deploy ordering | No for factual correction; yes for target ordering/readiness |
| RC-004 | P0 | orphan-runtime | None | Production import/restore scripts stop Compose and overwrite persistent DB/upload state; backup/export siblings produce transportable datasets | Assign an Operations owner, document safe preconditions/verification/recovery and review scripts before any use | Yes — operations/data owner required |
| RC-005 | P0 | orphan-runtime | None | Root contains multiple executable deploy variants while current automation uses a different workflow; archived deploy instructions remain searchable | Classify current versus retired paths, quarantine dangerous legacy instructions and establish one deploy entrypoint | Yes — release/operations owner required |
| RC-006 | P1 | duplicate-SSOT | `Domain/domain-map.md`; `Domain/operational-finance.md` | Domain map assigns Booking related `Income`/`MissedRevenue` owner data while finance canon owns their accounting stores/semantics | Make the map boundary-only and link to Finance owner instead of restating ownership | No |
| RC-007 | P1 | contradiction | `Domain/domain-map.md` | Overview diagrams show Booking-to-Notifications style event flow, but runtime has synchronous selected side effects, a mock-backed mobile feed and no confirmed publisher/event bus | Replace event arrows with explicit synchronous/caller or unimplemented/mock semantics | No |
| RC-008 | P1 | incomplete | Product/domain overview only | Master/salon profiles, branches/places, service catalog and public page/blog lifecycle span many models/routers without a detailed owner | Choose bounded owner aspects and document only repository-confirmed lifecycle/API boundaries | Yes — product/domain ownership split |
| RC-009 | P1 | incomplete | Identity, Privacy, topology and overview documents | Email, telephony, OAuth and geocoder integrations are distributed across owners without a common retry/error/status contract | Assign an integration-boundary owner or explicit per-domain ownership map | Yes |
| RC-010 | P1 | orphan-runtime | None | Mobile contains local welcome/pricing fallback truth beside server pricing/catalog mapping | Define which source is authoritative when catalog fetch is absent or incomplete; add parity tests | Yes — Billing/Product owner |
| RC-011 | P1 | unverifiable-host | Production topology and data canon | Repository cannot prove active containers, proxy/TLS, DB revision/physical schema, jobs, volumes, provider modes or monitoring | Keep `UNKNOWN`; perform a separately authorized read-only host audit only if operational assurance is required | Yes — explicit production authorization required |
| RC-012 | P1 | incomplete | Onboarding and CI/CD | Large noncanonical docs/archive plus root runbooks and reports can be mistaken for current truth despite source-priority rules | Add a prominent noncanonical index/status boundary and classify active operational entrypoints | Yes — documentation/operations owner |
| RC-013 | P2 | stale | `Domain/product-roles-business-model.md` | Open question asks whether Booking/Loyalty Knowledge is needed although both owner documents exist | Remove resolved question and retain links only | No |
| RC-014 | P2 | stale | `Domain/domain-map.md` | Open question asks whether operational finance should become a separate domain document after that document exists | Mark resolved and link to the owner | No |
| RC-015 | P2 | duplicate-SSOT | Product/domain overview documents | Booking status, loyalty and billing invariants are copied into overviews in addition to dedicated owners | Reduce overviews to boundary summaries and links; keep detailed rules in owners | No |
| RC-016 | P2 | source-anchor | Several older canonical documents | Links and exact paths resolve, but anchors use mixed `Source:`/`Sources:` forms and sometimes broad directory/file references without symbols | Standardize source-anchor format during owner edits; no broken path requires urgent repair | No |

## Severity counts

| Severity | Count |
|---|---:|
| P0 | 5 |
| P1 | 7 |
| P2 | 4 |

## Recommended first remediation batch

Start the separately controlled authorization remediation for RC-001: enumerate affected server endpoints, define intended role/object policy, change code and add regression tests without operationalizing abuse paths. Credential handling remains a distinct security process. The next documentation/operations batch should then correct the deploy/Alembic contradiction, classify production data/deploy entrypoints and remove false event/duplicate ownership wording from the domain overview.
