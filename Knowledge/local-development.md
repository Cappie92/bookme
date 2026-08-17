---
type: Knowledge
project: DeDato
knowledge_class: living
environment: common
status: active
last_verified: 2026-08-04
---

# Local development

Safe repository-known bootstrap for local, non-production work. Commands intentionally omit credential values, production hosts and provider verification.

## Prerequisites and package ownership

- Backend runtime target: Python 3.9; dependencies are pinned in `backend/requirements.txt`.
- Web build target: Node 20; use `frontend/package-lock.json` from the `frontend/` package.
- Mobile is a separate Node package with `mobile/package-lock.json` and Expo tooling.
- Documentation has a separate Python requirements file and `.venv` lifecycle via `docs.sh`.

Root `package.json` is a wrapper/legacy package: its direct `dev/build/preview` commands intentionally fail and point to `frontend:*` wrappers. Prefer package-local commands so the selected lockfile/config is unambiguous.

**Sources:** `backend/Dockerfile`; `backend/requirements.txt`; `frontend/Dockerfile.prod`; root, frontend and mobile `package.json`/lockfiles; `docs.sh`; `requirements-docs.txt`.

## Backend bootstrap

From repository root:

```bash
python3 -m venv backend/.venv
backend/.venv/bin/pip install -r backend/requirements.txt
cd backend
.venv/bin/python -m uvicorn main:app --host 127.0.0.1 --port 8000
```

The root `make backend-run` wrapper starts the same entrypoint on loopback using the caller's active `python3`; activate the intended environment first if using that wrapper. Configuration precedence and safe environment rules belong to [Configuration](configuration.md). Schema lifecycle belongs to [Data and migrations](data-and-migrations.md); application `create_all` is not a substitute for reviewing/applying migrations.

Do not use `backend-run-legacy` unless the task explicitly owns the legacy indie boundary.

**Sources:** root `Makefile`; `backend/README.md`; `backend/main.py`; `backend/database.py`; Alembic configuration.

## Web bootstrap

```bash
cd frontend
npm ci
npm run dev
```

Vite serves the SPA and proxies API/upload/legacy paths to the configured local backend. The root alternative is `npm run frontend:dev`; package-local execution remains the clearer source of config and dependencies.

**Sources:** `frontend/package.json`; `frontend/vite.config.js`; root `package.json`.

## Mobile bootstrap

```bash
cd mobile
npm ci
npm run start
```

Use the package platform scripts only after local Expo/native prerequisites are installed. API/WEB URL precedence and production URL rejection are defined in [Mobile architecture](mobile.md) and [Configuration](configuration.md). Do not copy values from credential-like repository artifacts into local config.

**Sources:** `mobile/package.json`; `mobile/app.config.ts`; `mobile/src/config/env.ts`; `mobile/src/config/resolveMobileEnv.ts`.

## Routine validation

```bash
(cd backend && python3 -m pytest tests)
(cd frontend && npm test)
(cd mobile && npm run test:unit)
```

Run package install first. Mobile integration and web/mobile E2E are separate commands and have additional environment/data prerequisites described in [Testing strategy](testing-strategy.md). Targeted tests are preferred during iteration; expand before handoff according to affected boundaries.

## Local E2E and destructive data

`./scripts/e2e_full.sh` owns local service startup plus reset/seed/cleanup. Run it only against disposable local test state. `./scripts/test_e2e.sh` assumes services/data are already prepared. Neither command authorizes production or shared-environment access.

## Compose boundary

Tracked Compose configuration contains sanitized credential-like repository evidence with `validity: UNKNOWN`. This document does not reproduce or endorse that value. Review the separate security remediation before treating tracked Compose defaults as safe local examples.

**Sources:** `docker-compose.yml` path/structure only; [Security and privacy Debt](security-and-privacy.md).

## Documentation

```bash
./docs.sh ci
```

This validates the MkDocs `docs/` site. Canonical `Knowledge/` still requires its own relative-link/source-path, sensitive-pattern and `git diff --check` gates.

**Sources:** `docs.sh`; `mkdocs.yml`; `.github/workflows/mkdocs.yml`.
