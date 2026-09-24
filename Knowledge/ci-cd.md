---
type: Knowledge
project: DeDato
knowledge_class: living
environment: common
status: active
last_verified: 2026-09-24
---

# CI/CD

Repository-known GitHub Actions and delivery boundary. Host state, branch protection, environment approvals and provider settings are `UNKNOWN` without external access.

## Root GitHub Actions workflows

GitHub Actions discovers the four workflow files under the repository-root `.github/workflows/`:

| Workflow | Trigger | Repository-known action |
|----------|---------|-------------------------|
| `gitleaks.yml` | `pull_request_target`; push to `main`/`master`; manual | Checksum-pinned Gitleaks 8.21.2: directed history plus mandatory exact-tree scan; manual full history including merge diffs |
| `mkdocs.yml` | every push; pull request | Prepares and builds MkDocs in strict mode, then uploads the generated site artifact |
| `arch-overview.yml` | daily schedule; manual `workflow_dispatch` | Regenerates architecture overview and commits selected generated outputs when they differ |
| `deploy.yml` | manual `workflow_dispatch` only | Transfers the checkout, rebuilds/recreates Compose application services, runs the migration helper and performs an external HTTP health check |

Only the deploy job declares concurrency: one active run in the fixed `production` group across refs, with `cancel-in-progress: false`. The deploy workflow explicitly grants only `contents: read` to its repository token. Branch protection, required-check selection, environment approvals and external CI remain `UNKNOWN` without external access.

**Sources:** `.github/workflows/gitleaks.yml`; `.github/workflows/mkdocs.yml`; `.github/workflows/arch-overview.yml`; `.github/workflows/deploy.yml`.

## Pull-request gates

Root repository workflows do not run backend pytest/lint, frontend Vitest/Playwright/lint/build or mobile Jest/Maestro/EAS build as PR jobs. Root PR automation consists of directed-history/current-tree secret gates with trusted security regression tests, and strict MkDocs build. These workflow runs are repository capabilities; whether either is configured as a required branch-protection gate is `UNKNOWN`.

MkDocs uses `docs_dir: docs`; canonical `Knowledge/` is outside that build and therefore is not validated by Docs CI. Package-local Knowledge link/source checks currently depend on the documentation workflow used during this Knowledge track, not a repository action.

`backend/.github/workflows/ci.yml` describes backend pytest-with-coverage plus black/isort/flake8/mypy steps, but its nested location is outside the repository-root workflow discovery directory. It is therefore repository workflow-shaped capability, not an executed GitHub Actions gate for this repository. The actual executable test suites remain catalogued in [Testing strategy](testing-strategy.md).

Mobile EAS build/submit profiles exist in `mobile/eas.json`, but no root workflow invokes EAS. They are build capability, not a root CI or deployment gate.

**Sources:** root workflow job/step inventory; `backend/.github/workflows/ci.yml`; `mkdocs.yml`; `docs.sh`; `frontend/package.json`; `mobile/package.json`; `mobile/eas.json`; [Testing strategy](testing-strategy.md).

## Current production delivery method

GitHub `deploy.yml` остаётся repository-defined manual workflow, но **legacy Docker Compose recreate не считается безопасным canonical production method в текущем окружении**.

Подтверждённые проблемы Compose recreate:

- static `ipv4_address` нельзя применять к `dedato_network`, созданной без explicit user-configured subnet;
- legacy Compose 1.29.2 имеет ContainerConfig compatibility risk.

Последние успешные production deployments использовали controlled direct container replacement (без фиксации временных container IDs):

1. exact release source/image;
2. revision label verification;
3. backup;
4. pre-create candidate;
5. preserve env/mounts/network aliases/restart policy;
6. retain old container as rollback;
7. controlled rename/start;
8. health gate;
9. component rollback при failure;
10. migrations только при явной необходимости.

Current production runtime is split: backend `dedato_backend:96f3f27`, frontend `dedato_frontend:fde8033-prod`. Canonical `main` tip is `fde8033` (iOS 1.1.0 (13) / Android 1.1.0 (6) plus committed free-companion/legal history). Production backend is **not** at `fde8033`. Details of unsuccessful helper implementations are transient and not SSOT.

## Manual staging release gate

Для текущего production cut действует living state в [Production topology](production-topology.md). Ранее для 1.0 существовал `REPORTED` staging gate через `test/apple-iap-handoff`; **эта branch больше не является актуальной release branch**. Staging topology, если контур ещё существует, принадлежит [Staging infrastructure](staging.md) как test environment, не как current production pointer.

Текущий production flow:

```text
main (backend runtime 96f3f27 / frontend runtime fde8033-prod / tip fde8033)
→ separately authorized manual production cutover
→ health/integrity gates
```

CI on `main` does not auto-deploy. Agent/automation-initiated commit, push, merge, PR или deploy по-прежнему запрещены без отдельного явного разрешения пользователя.

**Sources:** [Production topology](production-topology.md); `.github/workflows/deploy.yml` by trigger only; `deploy/staging/deploy-staging.sh` as staging helper, not current production pointer.

## Deployment

Production deployment is manual-only: push (including tags), pull requests and completion of another workflow do not trigger `deploy.yml`. The workflow remains a repository capability, but current operational cutovers used controlled direct container replacement rather than Compose recreate — see above.

The production workflow has one `deploy` job and no `needs` dependency on a separately isolated validation job. It does not run backend or client test suites. The following repository-defined Compose sequence is **capability documentation**, not the proven-safe host method in the current environment:

1. transfer the checkout to the configured host;
2. build backend and frontend images;
3. remove the existing backend/frontend containers, leaving shared Redis/network/volumes outside a full `down`;
4. start/update the Compose stack with `up -d --remove-orphans`;
5. invoke `scripts/prod/migrate.sh`, which runs Alembic against the backend data volume;
6. after the remote deployment step, wait and call the external HTTP `/health` endpoint.

Alembic is therefore explicit but runs after application services are started. The workflow does not prove migration success on the active host beyond command exit, does not isolate migration as a prerequisite job and does not promote a pre-built immutable application artifact. The final health call proves an HTTP response only; readiness limitations are documented in [Production topology](production-topology.md) and [Client platforms Debt](client-platforms.md).

No production target, credential reference or remote command sequence is reproduced in Knowledge.

**Sources:** `.github/workflows/deploy.yml` — `deploy` job, concurrency and step order; `scripts/prod/migrate.sh`; `scripts/prod/compose.sh`; `docker-compose.prod.yml` by structure only; `backend/main.py` — health endpoint; `frontend/nginx.conf`.

## Documentation automation

`docs.sh` owns virtualenv preparation, strict MkDocs build/serve and architecture overview generation. Scheduled overview automation can write generated documentation back to the repository. This generated `docs/` tree is supporting documentation; it does not override runtime-backed canonical `Knowledge/`.

**Sources:** `docs.sh`; `.github/workflows/mkdocs.yml`; `.github/workflows/arch-overview.yml`; [Knowledge governance](README.md).

## Security scanning boundary

Gitleaks 8.21.2 uses three layers: directed new reachable history, an obligatory exact target-tree snapshot, and manually requested full history. Both history modes include individual merge-parent diffs (`--full-history -m`); incremental ranges are `BEFORE..HEAD`, never a silent latest-commit fallback. Missing/zero ranges, shallow history, scanner errors and unresolved findings fail closed.

For PRs, `pull_request_target` runs only the target-branch workflow and policy. The PR snapshot is untrusted data: no candidate code, package install, build or tests execute. Both checkouts disable persisted credentials; the job has only `contents: read`. PR changes to the workflow, wrapper, security tests or metadata/config produce `POLICY_REVIEW_REQUIRED`; they cannot approve themselves. Security-policy changes require a separate owner-reviewed integration, not a PR-authored allowlist or automatic bypass. This trust boundary must be preserved if the workflow is extended.

Current-tree input comes from Git blobs (not export-filtered archives), including tracked env templates. There are no project-wide path exclusions or inline allow-comment bypasses. The only current exception is an AppMetricaKeychain 40-hex checksum line inside `SPEC CHECKSUMS` in the exact `mobile/ios/Podfile.lock` path. It does not exclude that file or unrelated keys.

The historical ledger stores reviewed rule/path/line/commit/blob/fingerprint metadata, never credential values. It applies only to history; reintroducing a value in a new commit or retaining it in the current tree fails. History debt remains present in Git objects; a passing gate does not mean a purge, credential rotation or exhaustive proof of secret absence.

Scanner reports are redacted and transferred through a private FIFO into memory; stdout/stderr are captured, never forwarded. Only sanitized finding metadata and counts are emitted; raw reports are not uploaded. The Linux binary is version/checksum-pinned. The optional existing local pre-commit hook is not a substitute for these CI gates.

**Sources:** `.github/workflows/gitleaks.yml`; `scripts/security/gitleaks_gate.py`; `scripts/security/test_gitleaks_gate.py`; `.gitleaks-current-exceptions.json`; `.gitleaks-history-baseline.json`; [Security and privacy Debt](security-and-privacy.md).
