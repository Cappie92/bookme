---
type: Knowledge
status: active
project: DeDato
last_runtime_check: 2026-08-04
---

# CI/CD

Repository-known GitHub Actions and delivery boundary. Host state, branch protection, environment approvals and provider settings are `UNKNOWN` without external access.

## Workflows

| Workflow | Trigger | Repository-known action |
|----------|---------|-------------------------|
| `gitleaks.yml` | pull request; push to `main`/`master` | downloads gitleaks and scans the commit range for the event |
| `mkdocs.yml` | push; pull request | prepares/builds MkDocs in strict mode and uploads the artifact |
| `arch-overview.yml` | daily schedule; manual | regenerates architecture overview and commits changes when generated output differs |
| `deploy.yml` | push to `main`; manual | opens remote deployment session, runs backend pytest before Compose update, then performs a shallow HTTP health check |

**Sources:** `.github/workflows/gitleaks.yml`; `.github/workflows/mkdocs.yml`; `.github/workflows/arch-overview.yml`; `.github/workflows/deploy.yml`; `docs.sh`.

## Pull-request gates

Repository workflows do not run backend application tests, frontend Vitest/Playwright, frontend lint/build or mobile Jest/build as independent PR jobs. PR automation is limited to incremental secret scanning and strict MkDocs build.

MkDocs uses `docs_dir: docs`; canonical `Knowledge/` is outside that build and therefore is not validated by Docs CI. Package-local Knowledge link/source checks currently depend on the documentation workflow used during this Knowledge track, not a repository action.

**Sources:** workflow job/step inventory; `mkdocs.yml`; `docs.sh`; package manifests.

## Deployment

The production workflow has one `deploy` job and no `needs` dependency on a separately isolated validation job. It transfers repository content through a password-authenticated remote session, executes backend pytest on the remote side before updating Compose services, and checks an HTTP health endpoint afterward.

The workflow does not declare frontend/mobile lint/unit/build gates or an explicit Alembic migration step. Deployment builds/updates mutable remote Compose state rather than promoting a pre-built immutable application artifact. The health endpoint proves process HTTP response only; readiness limitations are documented in [Production topology](../Infrastructure/production-topology.md) and [Client platforms Debt](../Debt/client-platforms.md).

No production target, credential reference or remote command sequence is reproduced in Knowledge.

**Sources:** `.github/workflows/deploy.yml`; `docker-compose.prod.yml` by structure only; `backend/main.py` — health endpoint; `frontend/nginx.conf`.

## Documentation automation

`docs.sh` owns virtualenv preparation, strict MkDocs build/serve and architecture overview generation. Scheduled overview automation can write generated documentation back to the repository. This generated `docs/` tree is supporting documentation; it does not override runtime-backed canonical `Knowledge/`.

**Sources:** `docs.sh`; `.github/workflows/mkdocs.yml`; `.github/workflows/arch-overview.yml`; [Knowledge governance](../README.md).

## Security scanning boundary

Gitleaks scans event commit ranges, not the full unchanged repository on every run. Existing credential-like repository evidence is tracked sanitized in [Security and privacy Debt](../Debt/security-and-privacy.md); scan success must not be interpreted as proof that the repository has no historical or unchanged sensitive artifacts.

**Sources:** `.github/workflows/gitleaks.yml`; [Security and privacy Debt](../Debt/security-and-privacy.md).
