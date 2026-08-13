---
type: Knowledge
status: active
project: DeDato
---

# Staging infrastructure

## Purpose and isolation boundary

Staging is an independent DeDato environment for integration checks of branch
`test/apple-iap-handoff`. Its public origin is `https://test.dedato.ru`; the
repository does not assert that DNS, TLS, or the host is already configured.

Staging never shares production SQLite files, Docker volumes, Redis, env files,
containers, network, host paths, or Nginx configuration. Production data is not
required for a first deploy: the default is a new empty staging database.

## Repository-defined architecture

```text
test.dedato.ru :80/:443
  -> host Nginx
     -> 127.0.0.1:8081 -> staging frontend container :80
     -> 127.0.0.1:8001 -> staging backend container :8000 (/api, /uploads)
        -> /data/bookme.db
        -> staging Redis service :6379
```

`docker-compose.staging.yml` defines a dedicated Compose project and three
containers: `dedato-staging-frontend`, `dedato-staging-backend`, and
`dedato-staging-redis`. Its network is `dedato_staging_network`. Backend and
frontend host publications bind only to `127.0.0.1`; Redis has no host port.
Only host Nginx is intended to be public.

The frontend image retains its own Nginx SPA fallback. Host Nginx proxies normal
web paths to that container, so routes such as `/auth/mobile-handoff` and
`/auth/oauth/callback` resolve through the SPA. Host Nginx sends `/api/` and
`/uploads/` directly to the backend loopback listener.

Health boundaries are intentionally modest:

- Redis health runs `redis-cli ping`.
- Backend health calls its repository-defined `/health` endpoint.
- Frontend health calls the frontend container `/health` endpoint.
- `/api/health` is the external backend-process check.

Backend `/health` does not query SQLite or Redis, so it is an application-process
check, not a full dependency or business-readiness proof.

## Server and directories

The bootstrap target is a clean Ubuntu 20.04-or-newer VPS with root/sudo access,
an SSH public key already usable by the operator, and enough disk for images,
the SQLite file, uploads, logs, Redis AOF, and backups. The script creates:

| Host path | Purpose |
|-----------|---------|
| `/opt/dedato-staging` | Git checkout and staging configuration |
| `/data/dedato-staging/bookme.db` | Staging SQLite database |
| `/data/dedato-staging/uploads` | Staging uploads |
| `/data/dedato-staging/backups` | Operator-created staging DB backups |
| `/var/log/dedato-staging/backend` | Backend file-log mount |
| `/var/log/dedato-staging/nginx-*.log` | Host Nginx access/error logs |

Compose maps the entire host `/data/dedato-staging` directory to backend `/data`.
Therefore `sqlite:////data/bookme.db` can only address the staging bind mount in
this stack. Redis persistence uses the distinct named volume
`dedato_staging_redis_data`. The same host's production path or named volume is
never referenced.

## Branch and env policy

`setup-staging.sh` clones or fast-forwards only
`https://github.com/Cappie92/bookme.git`, branch `test/apple-iap-handoff`. It
stops on local changes and uses `git merge --ff-only`; it never resets a checkout.
`deploy-staging.sh` neither fetches nor checks out code. It refuses a different
branch or modified tracked files and can require an exact commit:

```bash
sudo deploy/staging/deploy-staging.sh --expected-commit FULL_OR_SHORT_SHA
```

Secrets live only in ignored `deploy/staging/backend.env`, mode `600`. The
tracked `backend.env.example` contains safe defaults and placeholders only.
Compose forcibly overrides the database and Redis coordinates, providing a
second isolation guard even if those entries in the env file are edited.

The env validator requires:

- `ENVIRONMENT=staging`;
- both public URLs equal `https://test.dedato.ru`;
- database `sqlite:////data/bookme.db` and Redis `redis:6379`;
- both JWT compatibility flags set to `0`;
- dev test-data/E2E toggles empty;
- a non-placeholder staging-only JWT secret of at least 32 characters.

Email, telephony, payments, OAuth, and RevenueCat start disabled/stubbed or empty.
If an operator explicitly enables an integration, its credentials must belong to
a staging/test account. The validator requires dependencies for enabled email,
telephony and OAuth; non-stub Robokassa is accepted only with test mode and test
passwords. Secret values are never printed by the scripts.

## First bootstrap and preparation

Obtain the tracked bootstrap script through the organization's approved artifact
transfer, inspect it, and run it on the staging VPS:

```bash
sudo bash deploy/staging/bootstrap-server.sh
```

It updates Ubuntu packages, installs Git, Docker Engine and Compose v2, Nginx,
UFW, Certbot, and the Nginx Certbot plugin; enables Docker/Nginx; creates 2 GiB
swap only when no swap is active; creates staging directories; and configures
UFW for OpenSSH, 80, and 443. It does not clone code, start containers, create
secrets, migrate a database, request a certificate, or deploy DeDato.

Run setup from a separately transferred copy of the tracked script:

```bash
sudo bash deploy/staging/setup-staging.sh
```

On first use it clones the branch, creates `deploy/staging/backend.env` from the
template, sets mode `600`, and stops because the JWT placeholder is incomplete.
Edit that file directly on staging, using staging-only values, then re-run setup.
The default completed path validates Compose and installs/tests the HTTP Nginx
template, but neither reloads Nginx nor starts containers.

To activate the validated HTTP site without deploying the app:

```bash
sudo bash deploy/staging/setup-staging.sh --activate-nginx
```

To opt in to both preparation and the explicit deploy flow:

```bash
sudo bash deploy/staging/setup-staging.sh --activate-nginx --deploy
```

The less surprising first-deploy procedure is to run setup and deploy as two
separate reviewed commands.

## Deploy and migrations

Manual first deploy:

```bash
cd /opt/dedato-staging
sudo deploy/staging/deploy-staging.sh --expected-commit EXPECTED_GIT_SHA
```

The script verifies branch, commit (when supplied), clean tracked state, env, and
Compose; builds images; starts the stack; waits for health; shows the current
Alembic revision; runs `alembic upgrade head`; checks health again; and prints
Compose status plus a bounded log tail. It uses only the staging Compose and env.
It does not update Git or attempt an automatic rollback.

The default empty database is created at the staging path by application/schema
lifecycle. Alembic always runs inside the staging backend container and therefore
uses the same forced staging `DATABASE_URL`.

## Optional database-copy procedure

There is intentionally no automated production fetch helper. If a sanitized copy
is approved and delivered separately to the staging VPS as a local file, the
operator must verify its provenance and sensitivity before proceeding. Then:

1. Stop only `dedato-staging-backend`.
2. Run SQLite `PRAGMA integrity_check` against the delivered local file.
3. Copy the current `/data/dedato-staging/bookme.db` to a timestamped file under
   `/data/dedato-staging/backups/` if it exists.
4. Copy the approved local file atomically to
   `/data/dedato-staging/bookme.db`, with no production path or connection in the
   command.
5. Start only the staging backend, run
   `docker compose -f docker-compose.staging.yml exec -T backend python -m alembic upgrade head`,
   and verify `/api/health` plus application behavior.

This procedure is never part of bootstrap or deploy. A failed import or migration
is a manual stop: do not perform an unreviewed automatic rollback. The timestamped
staging backup is the recovery input for an explicit operator decision.

## DNS and HTTPS

These are manual external steps and are not performed by repository scripts:

1. Create DNS A record `test.dedato.ru -> STAGING_IPV4`.
2. From an independent machine, verify the answer, for example
   `dig +short A test.dedato.ru`, and confirm it equals the staging IPv4.
3. Confirm HTTP reaches the staging Nginx virtual host and not production.
4. On the staging VPS only, run
   `sudo certbot --nginx -d test.dedato.ru`.
5. Verify `https://test.dedato.ru/` and
   `https://test.dedato.ru/api/health`, then run
   `sudo certbot renew --dry-run`.

The tracked Nginx template is HTTP-only and has no pre-baked certificate paths.
Certbot owns its generated TLS edits after DNS and HTTP readiness are confirmed.

## Recreate and rollback policy

Compose images and containers may be recreated from a reviewed staging commit;
the bind-mounted SQLite, uploads, Redis data, and logs remain outside containers.
`docker compose down -v`, deletion of `/data/dedato-staging`, or reuse of any
production Docker resource is not part of normal staging operations.

Application rollback is manual: select a reviewed prior staging commit, rebuild,
and deploy only after determining whether its schema is compatible with the
current staging DB. Alembic downgrade is not automatic. Before any destructive
DB operation, create and verify a staging-only backup.

## Security baseline and deferred hardening

- UFW denies inbound traffic by default and allows only OpenSSH, HTTP, and HTTPS.
- Backend ports are loopback-only; Redis is Compose-internal only.
- Secrets are untracked, mode `600`, and are not echoed by tooling.
- Production env, credentials, paths, containers, network, DB, and Redis are not
  copied or referenced by the staging runtime.
- The repository stores no root/SSH password and scripts do not alter SSH auth.

Fail2ban, a VPN/private network, centralized log shipping, monitoring, alerting,
resource limits, off-host backups, and formal secret management remain optional
operational debt; they are not prerequisites for this baseline.

## Source anchors

- `docker-compose.staging.yml` — services, ports, healthchecks, mounts, network.
- `deploy/staging/bootstrap-server.sh` — clean-host baseline.
- `deploy/staging/setup-staging.sh` — clone/update and prepare-only behavior.
- `deploy/staging/check-env.sh` — enforced staging env contract.
- `deploy/staging/deploy-staging.sh` — explicit deploy/migration sequence.
- `deploy/staging/nginx-test.dedato.ru.conf` — HTTP reverse proxy boundary.
- `backend/settings.py` — runtime env fields and safe integration defaults.
- `backend/main.py` — backend `/health` behavior.
- `frontend/nginx.conf` — frontend proxy and SPA fallback behavior.

## Related documents

- [Production topology](production-topology.md) — repository-known production
  topology, kept separate from this environment.
- [Configuration and feature flags](configuration.md) — application config layers.
- [Data and migrations](../Architecture/data-and-migrations.md) — schema lifecycle.
- [Deployment artifact inventory](../Operations/deployment-artifact-inventory.md)
  — production entry points and legacy boundaries.
