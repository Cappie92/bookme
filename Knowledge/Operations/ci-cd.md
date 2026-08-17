---
type: Knowledge
status: active
project: DeDato
last_runtime_check: 2026-08-17
---

# CI/CD

Repository-known GitHub Actions and delivery boundary. Host state, branch protection, environment approvals and provider settings are `UNKNOWN` without external access.

## Root GitHub Actions workflows

GitHub Actions discovers the four workflow files under the repository-root `.github/workflows/`:

| Workflow | Trigger | Repository-known action |
|----------|---------|-------------------------|
| `gitleaks.yml` | pull request; push to `main`/`master` | Downloads gitleaks and scans the commit range selected for the event |
| `mkdocs.yml` | every push; pull request | Prepares and builds MkDocs in strict mode, then uploads the generated site artifact |
| `arch-overview.yml` | daily schedule; manual `workflow_dispatch` | Regenerates architecture overview and commits selected generated outputs when they differ |
| `deploy.yml` | push to `main`; manual `workflow_dispatch` | Transfers the checkout, rebuilds/recreates Compose application services, runs the migration helper and performs an external HTTP health check |

Only the deploy job declares concurrency: one run per workflow/ref group, with `cancel-in-progress: false`. Branch protection, required-check selection, environment approvals and external CI remain `UNKNOWN`.

**Sources:** `.github/workflows/gitleaks.yml`; `.github/workflows/mkdocs.yml`; `.github/workflows/arch-overview.yml`; `.github/workflows/deploy.yml`.

## Pull-request gates

Root repository workflows do not run backend pytest/lint, frontend Vitest/Playwright/lint/build or mobile Jest/Maestro/EAS build as PR jobs. Root PR automation is limited to incremental secret scanning and strict MkDocs build. These workflow runs are repository capabilities; whether either is configured as a required branch-protection gate is `UNKNOWN`.

MkDocs uses `docs_dir: docs`; canonical `Knowledge/` is outside that build and therefore is not validated by Docs CI. Package-local Knowledge link/source checks currently depend on the documentation workflow used during this Knowledge track, not a repository action.

`backend/.github/workflows/ci.yml` describes backend pytest-with-coverage plus black/isort/flake8/mypy steps, but its nested location is outside the repository-root workflow discovery directory. It is therefore repository workflow-shaped capability, not an executed GitHub Actions gate for this repository. The actual executable test suites remain catalogued in [Testing strategy](testing-strategy.md).

Mobile EAS build/submit profiles exist in `mobile/eas.json`, but no root workflow invokes EAS. They are build capability, not a root CI or deployment gate.

**Sources:** root workflow job/step inventory; `backend/.github/workflows/ci.yml`; `mkdocs.yml`; `docs.sh`; `frontend/package.json`; `mobile/package.json`; `mobile/eas.json`; [Testing strategy](testing-strategy.md).

## Manual staging release gate

Для текущего release 1.0 действует `REPORTED` branch-specific delivery process:

```text
feature / integration branch
→ test/apple-iap-handoff
→ manual staging deploy
→ manual functional smoke
→ explicit APPROVE
→ user-managed merge to main
→ production workflow
```

Проверенный staging baseline — `9dcd4ed`. Repository подтверждает, что `deploy/staging/deploy-staging.sh` принимает уже выбранный clean commit, может проверить expected SHA, не fetch/checkout Git и не выполняет production actions. Сам manual smoke, approval и provider checks не являются GitHub Actions gates.

Процесс запрещает agent/automation-initiated commit, push, merge, PR или deploy: Git mutations и environment actions выполняет пользователь после review и отдельного явного `APPROVE`. Это текущий release contract, но ещё не generalized permanent workflow для следующих релизов. Topology, smoke scope и staging-specific open debt принадлежат [Staging infrastructure](../Infrastructure/staging.md).

**Sources:** `deploy/staging/deploy-staging.sh`; Git baseline `9dcd4ed`; release handoff dated 2026-08-17.

## Deployment

The production workflow has one `deploy` job and no `needs` dependency on a separately isolated validation job. It does not run backend or client test suites. Its repository-defined order is:

1. transfer the checkout to the configured host;
2. build backend and frontend images;
3. remove the existing backend/frontend containers, leaving shared Redis/network/volumes outside a full `down`;
4. start/update the Compose stack with `up -d --remove-orphans`;
5. invoke `scripts/prod/migrate.sh`, which runs Alembic against the backend data volume;
6. after the remote deployment step, wait and call the external HTTP `/health` endpoint.

Alembic is therefore explicit but runs after application services are started. The workflow does not prove migration success on the active host beyond command exit, does not isolate migration as a prerequisite job and does not promote a pre-built immutable application artifact. The final health call proves an HTTP response only; readiness limitations are documented in [Production topology](../Infrastructure/production-topology.md) and [Client platforms Debt](../Debt/client-platforms.md).

No production target, credential reference or remote command sequence is reproduced in Knowledge.

**Sources:** `.github/workflows/deploy.yml` — `deploy` job, concurrency and step order; `scripts/prod/migrate.sh`; `scripts/prod/compose.sh`; `docker-compose.prod.yml` by structure only; `backend/main.py` — health endpoint; `frontend/nginx.conf`.

## Documentation automation

`docs.sh` owns virtualenv preparation, strict MkDocs build/serve and architecture overview generation. Scheduled overview automation can write generated documentation back to the repository. This generated `docs/` tree is supporting documentation; it does not override runtime-backed canonical `Knowledge/`.

**Sources:** `docs.sh`; `.github/workflows/mkdocs.yml`; `.github/workflows/arch-overview.yml`; [Knowledge governance](../README.md).

## Security scanning boundary

Gitleaks scans event commit ranges, not the full unchanged repository on every run. Existing credential-like repository evidence is tracked sanitized in [Security and privacy Debt](../Debt/security-and-privacy.md); scan success must not be interpreted as proof that the repository has no historical or unchanged sensitive artifacts.

**Sources:** `.github/workflows/gitleaks.yml`; [Security and privacy Debt](../Debt/security-and-privacy.md).
