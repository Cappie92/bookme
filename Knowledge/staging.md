---
type: Knowledge
project: DeDato
knowledge_class: living
environment: test
status: active
last_verified: 2026-09-13
---

# Staging infrastructure

## Scope and evidence

Этот документ владеет test-environment контрактом staging-контура DeDato: topology/isolation, effective environment policy и staging-specific debt. Он **не** владеет current production release state — см. [Production topology](production-topology.md).

`last_verified` в frontmatter — дата Knowledge-review этого документа, **не** повторная проверка staging host. Host/VPS/smoke/reconciliation факты ниже остаются `REPORTED` с release handoff **2026-08-17**, пока отдельно не зафиксирована более поздняя authorized host check. Новая проверка staging host в этом проходе не выполнялась.

Факты из tracked Compose, scripts, migrations и tests помечаются `CONFIRMED`. Состояние VPS, базы, DNS/TLS, контейнеров, внешних кабинетов и результаты выполненных проверок получены из того handoff и помечаются `REPORTED`: repository сам по себе их не доказывает. Значения секретов здесь не хранятся.

## Purpose and release gate

Staging является test/pre-production контуром DeDato. **Он не является текущей production release branch и не задаёт current production cutover.** `test/apple-iap-handoff` и baseline `9dcd4ed` — исторический 1.0 staging gate; они не current production pointer и не действующий production release process. Current production state принадлежит [Production topology](production-topology.md); delivery method — [CI/CD](ci-cd.md).

Если staging host ещё используется, его topology ниже остаётся test-environment contract. Никакие commit, push, merge, PR, staging deploy или production actions не выполняются автоматически от имени Knowledge-работы.

## Current operational state

| Boundary | Current state | Confidence |
|----------|---------------|------------|
| Public origin | `https://test.dedato.ru` | REPORTED operational state; origin is also CONFIRMED in tracked staging config |
| VPS | `200.165.232.109` | REPORTED |
| Checkout | `/opt/dedato-staging` | REPORTED active; CONFIRMED target in scripts |
| Backend host port | loopback `8001` | REPORTED active; CONFIRMED Compose mapping |
| Frontend host port | loopback `8081` | REPORTED active; CONFIRMED Compose mapping |
| Containers | `dedato-staging-backend`, `dedato-staging-frontend`, `dedato-staging-redis` healthy | REPORTED |
| Public checks | `/` → `200`; `/api/health` → `200` | REPORTED |
| TLS | HTTPS via host Nginx and Certbot | REPORTED |
| Redis | isolated staging Redis with AOF; host `vm.overcommit_memory=1` | REPORTED runtime state; AOF is CONFIRMED in Compose |

The public health checks prove process/proxy availability only. Backend `/health` does not query SQLite, Redis, migration state or external providers and is not a business-readiness proof.

## Topology and isolation

```text
test.dedato.ru :80/:443
  -> host Nginx + Certbot TLS
     -> 127.0.0.1:8081 -> staging frontend container :80
     -> 127.0.0.1:8001 -> staging backend container :8000 (/api, /uploads)
        -> /data/bookme.db
        -> staging Redis service :6379
```

`docker-compose.staging.yml` defines a dedicated Compose project, the three named staging containers and network `dedato_staging_network`. Backend/frontend publications are loopback-only; Redis has no host port. Only host Nginx is public.

The environment has separate Docker network, containers, Redis persistence, SQLite file, uploads and logs. Production data was cloned into staging, but the active staging DB is not the production file or volume: there is no shared live data path, container, network or Redis resource.

| Host path | Purpose |
|-----------|---------|
| `/opt/dedato-staging` | checkout and ignored staging configuration |
| `/data/dedato-staging/bookme.db` | active staging SQLite copy |
| `/data/dedato-staging/uploads` | staging uploads |
| `/data/dedato-staging/backups` | operator-created staging DB backups |
| `/var/log/dedato-staging/backend` | backend file logs |
| `/var/log/dedato-staging/nginx-*.log` | host Nginx logs |

Compose maps `/data/dedato-staging` to backend `/data`, so `sqlite:////data/bookme.db` resolves to staging storage in this stack. Redis uses the separate named volume `dedato_staging_redis_data`.

## Production-clone database strategy

Active staging intentionally uses a production clone for realistic release smoke rather than a synthetic/empty database. The following is `REPORTED` operational state:

- snapshot created through SQLite Backup API: `bookme-prod-20260816-231742.db`;
- SHA-256: `f7dc84aa0310ea63825b3de24f4479503ce0da12586d598dd920701a9aeea4dd`;
- source revision: `20260721_account_deletion_fields`;
- before transfer: `integrity_check=ok`, `journal_mode=delete`;
- staging migration chain: `20260721_account_deletion_fields` → `20260809_apple_iap_fields` → `20260812_session_version`;
- current staging Alembic revision: `20260812_session_version`;
- after migration: `integrity_check=ok`;
- approximate active-copy counts: users `444`, masters `21`, bookings `1057`, subscriptions `21`, payments `10`.

The pristine snapshot is stored separately and remains immutable. `/data/dedato-staging/bookme.db` is an independent migrated working copy. A redeploy must not replace it with the pristine file or mutate the pristine snapshot.

At first startup, in-process background jobs ran against the clone. Diagnostic messages affecting subscriptions `19/21` and repeat-charge attempts were not startup blockers and are not a current incident. They do not prove provider readiness or billing correctness.

The tracked first-bootstrap path can still create an empty staging database, but that is not the strategy of the active release environment. Any future database replacement is a separately approved data operation: stop only the staging backend, verify provenance and integrity, preserve a staging backup, switch the staging copy atomically, migrate to head, and re-run health plus functional checks. There is no automated production fetch helper.

## Migration compatibility contract

Commit `7ad7b85` made the release-relevant migrations tolerant of ORM-created columns/indexes for the current application startup sequence:

```text
Base.metadata.create_all()
→ alembic upgrade head
```

Repository-confirmed guards exist in:

- `838e2b24a042_add_pending_contact_verification.py`;
- `20260721_account_deletion_fields.py`;
- `20260809_apple_iap_subscription_fields.py`;
- `20260812_user_session_version.py`.

`backend/tests/test_alembic_create_all_then_upgrade.py` covers create-all then upgrade plus repeat/partial-object cases. The focused regression result `6 passed` is `REPORTED`.

This is a narrow supported compatibility contract, not resolution of schema ownership. Bare Alembic-only bootstrap of an empty DB remains unsupported; `create_all` and Alembic retain dual ownership; normalization of schema defaults/nullability is deferred. The canonical architecture and risks are in [Data and migrations](data-and-migrations.md).

## Production-to-staging reconciliation

The release handoff reports that production checkout `/opt/dedato` was a dirty working tree at `eea80f34`. Before comparison, an immutable runtime evidence bundle was stored at `/root/dedato-prod-runtime-snapshot-20260816-230617` with:

- `tracked-production.patch`;
- `untracked-runtime-files.tar.gz`;
- `git-state.txt`;
- `MANIFEST.txt`.

Checksums were verified. The reported reconciliation conclusion is: `9dcd4ed already contains production runtime plus newer changes`. No production-only runtime change requiring import into the test branch was found. Therefore the staging baseline did not lose known production runtime behavior. Cleanup of the dirty production checkout is separate post-release debt and is outside release smoke.

## Effective staging environment

The active environment is `REPORTED` as follows; the tracked template/validator confirm the safety categories except where drift is called out below.

| Setting | Effective value/policy |
|---------|------------------------|
| `ENVIRONMENT` | `staging` |
| `FRONTEND_URL` | `https://test.dedato.ru` |
| `API_BASE_URL` | `https://test.dedato.ru` |
| `EMAIL_ENABLED` / `EMAIL_PROVIDER` | `false` / `unisender` |
| `ZVONOK_MODE` | `stub` |
| `ROBOKASSA_MODE` / `ROBOKASSA_IS_TEST` | `stub` / `true` |
| `YANDEX_AUTH_ENABLED` | `true` |
| `YANDEX_REDIRECT_URI` | `https://test.dedato.ru/api/auth/yandex/callback` |
| `SALONS_ENABLED` | `true` |
| `LEGACY_INDIE_MODE` | `0` |

Credentials for Unisender, Zvonok and Yandex were reportedly copied safely into the ignored staging environment. Their presence does not authorize live outbound traffic. Secret values must never enter Git or Knowledge.

Tracked scripts also force the staging SQLite/Redis coordinates, require `ENVIRONMENT=staging`, public staging URLs, disabled development test-data toggles and a non-placeholder JWT secret. Secrets live only in ignored `deploy/staging/backend.env`, mode `600`, and validators do not print their values.

## External integration gates

### Yandex OAuth

The effective callback contract is:

```text
https://test.dedato.ru/api/auth/yandex/callback
```

The staging server template and validator were reportedly corrected manually and then returned `Staging env contract is valid`. Current repository HEAD still contains the obsolete `/api/auth/oauth/callback` value in both `deploy/staging/backend.env.example` and `deploy/staging/check-env.sh`; server and Git therefore drift. Before provider smoke, the Yandex application allowlist must contain the effective callback exactly.

### Zvonok

`ZVONOK_MODE=stub` is mandatory for the reported staging smoke. Live Zvonok is `BLOCKED`, even though credentials are present. Remaining repository-confirmed blockers are owned by [Security and privacy Debt](security-and-privacy.md): fragmented live verification contracts, incomplete phone-change challenge semantics, sensitive provider logging and hard-coded campaign ID. Reverse-phone endpoints are retired (`404`) and are not a current staging surface; historical bypass is in [Reverse-phone verification bypass](reverse-phone-verification-bypass.md). Live enablement still requires a unified `VerificationService`, atomic/bound challenge consumption, log redaction and environment-owned `ZVONOK_CAMPAIGN_ID`.

### Email / Unisender

`EMAIL_ENABLED=false`. A later controlled smoke may use only controlled test addresses and must prevent sends to production-clone users. Verification, reset and notification paths need explicit checks before email can be considered ready.

### Robokassa

`ROBOKASSA_MODE=stub`, `ROBOKASSA_IS_TEST=true`. Production merchant context must not be enabled on staging. Real payment smoke requires a separate test context with test credentials, `test.dedato.ru` callback URLs and no production merchant/`InvId` overlap.

Apple IAP and other provider-live paths are outside the completed smoke boundary.

## Nginx and TLS state

HTTPS with Nginx + Certbot is `REPORTED` active. Before host hardening, scanner-like paths such as `/.env`, `/.git/config`, `/wp-config.php`, `/config.json` and `/actuator/health` could fall through the SPA and return `200`. Manual deny/not-found rules were added on the staging host.

Reported verification after hardening:

```text
/.env          -> 404
/.env.prod     -> 404
/.env.dev      -> 404
/.env.txt      -> 404
/.git/config   -> 404
/wp-config.php -> 404
/              -> 200
/api/health    -> 200
```

Current tracked `deploy/staging/nginx-test.dedato.ru.conf` does not contain these scanner-path rules. The active host hardening must be repositoryized before the tracked template can reproduce the server state. Certbot-generated TLS material remains host-owned and must not be committed.

## Reproduce / bootstrap staging

This is the repository-confirmed initial/recovery bootstrap capability, not a description of an empty active environment and not the current production release procedure. The 2026-08-17 reported staging host used the production clone documented above; that is test-environment history.

1. Start with a clean Ubuntu 20.04-or-newer VPS with root/sudo access, an operator-controlled SSH public key and enough disk for images, SQLite, uploads, logs, Redis AOF and backups.
2. Run the separately reviewed `deploy/staging/bootstrap-server.sh`. It installs the host prerequisites (including Docker/Compose, Nginx, UFW and Certbot), creates swap when the host has none and prepares `/opt/dedato-staging`, `/data/dedato-staging` and `/var/log/dedato-staging`. It does not clone the repository, create secrets, start containers, migrate data or request a certificate.
3. Run `deploy/staging/setup-staging.sh`. The tracked helper still prepares branch `test/apple-iap-handoff` as **historical 1.0 repository helper behavior**; that branch is not the current production release pointer and must not be followed as a current production cutover step. On first setup the script creates ignored `deploy/staging/backend.env` with mode `600` from the tracked template and stops while required values remain placeholders. Fill required secrets manually on the host. Existing Unisender/Zvonok/Yandex credentials may be present, but outbound traffic remains controlled by the effective allowlist rather than credential presence.
4. Re-run setup after env review. `--activate-nginx` explicitly activates the validated tracked HTTP virtual host; activation is not implied by prepare-only setup.
5. Point the DNS A record for `test.dedato.ru` to the staging VPS and verify that it resolves to this environment. Issue/renew TLS separately on the host with Certbot only after DNS and HTTP reachability are correct. The tracked Nginx template is HTTP-only and contains no certificate paths or certificate material.
6. Deploy separately and explicitly with `deploy/staging/deploy-staging.sh`, preferably with `--expected-commit`. It refuses a wrong branch or modified tracked files, validates env/Compose, builds and starts the stack, waits for health, shows current Alembic state, runs `alembic upgrade head`, checks health again and prints bounded status/log output. It does not fetch, checkout, commit, push, merge, deploy production or attempt automatic rollback.

Normal redeploy may recreate images and containers but must preserve `/data/dedato-staging/bookme.db`, uploads, backups, logs and the staging Redis persistence. `docker compose down -v` and deletion of staging data paths are not normal staging operations. Code rollback and any schema compatibility action require manual review; Alembic downgrade is never automatic. Create and verify a staging backup before every destructive DB operation.

## Smoke status

Infrastructure smoke is `REPORTED PASSED`:

- backend, frontend and Redis healthy;
- HTTPS and `/api/health` reachable;
- production clone loaded;
- migrations applied through `20260812_session_version` with integrity check `ok`.

Repository/integration verification is `REPORTED`:

- focused integration: `81 passed`;
- migration regression: `6 passed`;
- full backend: `770 passed, 9 skipped, 1 failed`.

The one failure, `tests/test_dashboard_top_services_statuses.py::test_top_services_consistent_status_filter`, is a pre-existing calendar/timezone-dependent baseline failure and is not attributed to staging/integration changes.

Manual functional web smoke was required before the historical 1.0 `APPROVE` gate. That APPROVE-flow is **not** the current production release contract. If staging is still used as a test environment, the checklist below is a functional smoke inventory, not a production cutover gate:

- login with an existing production-clone user;
- dashboard, profile, services and schedule;
- booking create/update/cancel;
- client and master views;
- salons;
- admin hard delete.

Live Zvonok, live email, real Robokassa, Apple IAP and complete Yandex provider OAuth are not completed parts of the current smoke.

## Open staging debt

Only the following staging-specific items remain open:

1. Port the correct Yandex callback from the staging host into the tracked env template and validator.
2. Repositoryize the active staging Nginx scanner-path hardening.
3. Complete the manual functional web smoke.
4. Verify the Yandex provider redirect allowlist and complete OAuth smoke.
5. Perform a controlled email smoke without contacting production-clone users.
6. Keep live Zvonok blocked until verification/security hardening is complete.
7. Create a separate Robokassa staging test context before real payment smoke.
8. Clean the dirty production checkout separately after release; do not add it to smoke scope.
9. The 1.0 branch-specific manual staging flow (`test/apple-iap-handoff` / explicit `APPROVE`) is historical; do not treat it as the current production delivery process. Later staging use is a test-environment question, not a second production pointer.

## Source anchors

- `docker-compose.staging.yml` — services, ports, healthchecks, mounts, Redis AOF and network.
- `deploy/staging/bootstrap-server.sh` — clean-host baseline and directories.
- `deploy/staging/setup-staging.sh` — branch preparation and opt-in activation/deploy.
- `deploy/staging/check-env.sh` — tracked env contract and current Yandex callback drift.
- `deploy/staging/backend.env.example` — safe defaults/placeholders and current Yandex callback drift.
- `deploy/staging/deploy-staging.sh` — explicit staging-only deploy/migration sequence.
- `deploy/staging/nginx-test.dedato.ru.conf` — tracked HTTP proxy and missing scanner-path hardening.
- `backend/main.py` — `create_all`, jobs and shallow health behavior.
- `backend/alembic/versions/838e2b24a042_add_pending_contact_verification.py`.
- `backend/alembic/versions/20260721_account_deletion_fields.py`.
- `backend/alembic/versions/20260809_apple_iap_subscription_fields.py`.
- `backend/alembic/versions/20260812_user_session_version.py` — current repository head.
- `backend/tests/test_alembic_create_all_then_upgrade.py` — compatibility regression.
- Git commits `7ad7b85`, `a7747bf`, `9dcd4ed` — historical baseline ancestry/content for the 2026-08-17 staging handoff, not current production HEAD.
- Release handoff dated 2026-08-17 — all `REPORTED` VPS, snapshot, reconciliation, smoke and test-run state. This date is the host-evidence baseline; it is not updated by the Knowledge `last_verified` field.

## Related documents

- [Data and migrations](data-and-migrations.md) — schema ownership and supported compatibility boundary.
- [CI/CD](ci-cd.md) — GitHub Actions and delivery gates.
- [Configuration](configuration.md) — application configuration layers.
- [Production topology](production-topology.md) — repository-known production topology.
- [Security and privacy Debt](security-and-privacy.md) — provider/verification blockers.
- [Testing/delivery/onboarding Debt](testing-delivery-onboarding.md) — automated gate limitations.
