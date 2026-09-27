# Maestro E2E — DeDato mobile

Native Maestro gate for an **installed development / local-API binary**.
This is **not** a GitHub Actions job and **not** safe against store / EAS preview
builds that bake `API_URL=https://dedato.ru`.

## Canonical command

From the repo root:

```bash
./scripts/run-maestro-e2e.sh ios
./scripts/run-maestro-e2e.sh android
./scripts/run-maestro-e2e.sh ios .maestro/flows/01-login-success.yaml
```

From `mobile/`:

```bash
npm run test:e2e:ios
npm run test:e2e:android
```

Do not run `maestro test .maestro/flows/` directly. That skips the production
guard, platform `APP_ID`, and DEV_E2E credentials.

## Required artifact

| Platform | appId | Intended binary |
| --- | --- | --- |
| iOS | `com.dedato.app` | Simulator **development client** or `expo run:ios` with local `API_URL` |
| Android | `ru.dedato.mobile` | Emulator **development client** or `expo run:android` with local `API_URL` / `API_URL_ANDROID=http://10.0.2.2:8000` |

**Not supported as a default gate:** Expo Go (`host.exp.Exponent`), EAS preview APK,
production/TestFlight/App Store binaries, `com.yourcompany.dedato`.

Expo Go cannot open the JS app after `launchApp` (it only relaunches Expo Go).
Preview/production EAS profiles bake production API — mutating flows against them
is forbidden.

## Required backend

Local only. Same synthetic users as Playwright:

| Role | Phone | Password |
| --- | --- | --- |
| Master A (gate flows) | `+79991111111` | `e2e123` |
| Master B | `+79992222222` | `e2e123` |
| Client C | `+79993333333` | `e2e123` |

Seed:

```bash
# backend with DEV_E2E=true, ENVIRONMENT=development, provider stubs
curl -X POST http://127.0.0.1:8000/api/dev/e2e/seed -H 'Content-Type: application/json' -d '{"reset":true}'
```

Android emulator loopback to the host is `10.0.2.2`, not `127.0.0.1`.
iOS Simulator can use `http://127.0.0.1:8000`.

The wrapper refuses `dedato.ru` / `test.dedato.ru` in `E2E_BACKEND_URL`.
It cannot inspect a binary's baked `API_URL` — the operator must not install a
production-API build.

## Tooling

- CLI install (global, not an npm dependency): `curl -Ls "https://get.maestro.mobile.dev" | bash`
- PATH: `$HOME/.maestro/bin`
- Recommended version (observed, not auto-installed): see `MAESTRO_VERSION`
- Java 17 is required by Maestro
- Version is **not pinned in CI**. Re-running on a floating latest CLI is a
  reproducibility debt; bump `MAESTRO_VERSION` only after a local proof.

## Default suite (release gate)

| Flow | Scenario | Mutation |
| --- | --- | --- |
| `flows/01-login-success.yaml` | Welcome → login → master dashboard | login only |
| `flows/02-login-error.yaml` | Wrong password → `Ошибка входа` | none |
| `flows/03-navigate-to-bookings.yaml` | Dashboard «Все записи» → future modal | none |
| `flows/04-open-booking-details.yaml` | iOS tabs / Android menu → schedule + services | none |
| `flows/05-logout.yaml` | Settings → logout → welcome | logout |

Helpers (`shared/*`, `debug/*`) are not in the default suite.

Each gate flow starts with `launchApp clearState` and does **not** depend on the
previous flow. OS notification permission can still persist across runs.

## Push

Maestro can dismiss `push-permission-education-dismiss` after login.
It cannot stably prove FCM/APNs delivery in generic CI. Real push delivery stays
manual smoke.

## Reset

- Canonical: `launchApp` with `clearState: true` (iOS also `clearKeychain: true`)
- Do not uninstall/reinstall as the default
- Optional helper: `shared/logout-if-needed.yaml`
- Permission dialogs are **not** reset by `clearState`

## Device

Need a booted iOS Simulator **or** an `adb` device/emulator **and** the native
app installed. The wrapper does not start emulators, does not install Maestro,
and does not build the app.
