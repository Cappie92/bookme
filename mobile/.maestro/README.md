# Local Maestro release gate

## Android — canonical command

Run from the repository root:

```bash
./scripts/run-maestro-e2e.sh android .maestro/flows/01-login-success.yaml
./scripts/run-maestro-e2e.sh android
```

`npm run test:e2e:android` from `mobile/` delegates to the same wrapper.
Run the full gate twice without source changes for repeatability review.
Do not invoke Maestro directly: that skips the local stack/artifact guards.

### Prerequisites — never automatically installed/upgraded

- Script-derived root must be its actual Git toplevel, branch `main`.
  Dirty files are reported, never reset/stashed. The known legacy clone is rejected
  when the local two-checkout layout can be identified, including symlink resolution.
- Node **20.19.4**: prefer a valid executable on PATH, then an existing nvm installation.
- Java **17**: prefer a valid `JAVA_HOME`/PATH runtime, then existing Homebrew locations.
  Tool paths affect only this process; nothing is installed or upgraded.
- Maestro version in `MAESTRO_VERSION` (**2.0.10**); mismatch fails closed.
- Existing Android SDK (`ANDROID_HOME` / `ANDROID_SDK_ROOT` or macOS default),
  adb, build-tools, cached Gradle dependencies, AVD `Medium_Phone_API_36.1`.
- Installed locked `mobile/node_modules` and `backend/.venv` dependencies.
- Free ports **8000** and **8081**. Stop previous manual servers yourself.

No SDK/AVD download, runtime installation or global toolchain change.
Gradle runs offline: missing dependencies require a separate reviewed setup.

### What one invocation owns

1. Validate tools, canonical repo, exact local URL overrides and synthetic identity.
2. Reuse the single matching AVD or start it and wait for `sys.boot_completed`.
   Physical devices/other AVDs are never selected or killed. Existing emulator stays
   running; an emulator started by the harness is stopped on exit.
   Disable API 36 handwriting tutorial interference for this run only; restore the
   original `stylus_handwriting_enabled` setting (including absent) during cleanup.
3. Run local `:app:assembleDebug`; Gradle incremental/up-to-date tasks avoid
   unnecessary rebuilds. Validate package, debuggable APK and absence of embedded
   JS bundle, then install that exact APK. No arbitrary installed/store/EAS artifact.
4. Create a unique `/private/tmp/dedato-maestro-*` directory (Linux: `/tmp`).
   Start backend from there with fresh `e2e.db`, no repo `.env`, provider stubs,
   email/IAP/push disabled. Require health and seed **HTTP 200**.
5. Start owned localhost Metro **8081**, clearing stale transform cache and setting
   all API overrides. Check manifest URLs, finish compiling its local launch bundle
   before UI assertions, and check device-scoped adb reverse **8081**.
6. Run the reviewed flows with APP_ID and synthetic Master A credentials.
7. Stop only owned process sessions and remove only an adb reverse created by this
   run. Preserve DB/WAL/SHM, logs, JUnit and failure screenshots.

Every flow uses `shared/launch-local.yaml`: `launchApp clearState`, then on
Android the explicit local development-client URL. The helper waits for original
`welcome-nav-auth` before login (bounded 120-second cold-start readiness).
Clearing native data loses the Metro URL;
plain launchApp does not prove that the React Native app loaded.
After readiness, dismiss the visible Android RN warning toast via its close
control: it overlaps bottom navigation in debug builds. This does not suppress
runtime logging or dismiss error dialogs. The selector is anchored to the warning
text and its parent ([Maestro relational selectors](https://docs.maestro.dev/reference/selectors/relational-selectors)).

The URL is supplied only by the harness, not duplicated across flows:
```text
dedato://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8081
```

### Safety and limitations

- Application API: **http://10.0.2.2:8000**. Host health/seed: **127.0.0.1:8000**.
  Both `@env` Android override and Expo config receive the same local URL.
  Debug JS comes from owned Metro; it is not embedded in this APK.
- Backend credentials/proxies are not inherited. Production URL overrides,
  custom DB, unknown flows and non-fixture logins are rejected.
- No reuse or automatic killing of an existing backend/Metro, even if healthy.
- Fresh SQLite directory prevents stale readonly DB/WAL/SHM contamination.
- Maestro JVM log home is redirected per-process into the run directory;
  `$HOME` remains unchanged, installed `~/.maestro` driver cache is preserved.
  JVM uses headless AWT for screenshot processing (no macOS desktop registration).
- Expo runs in offline mode with its own temporary cache, not `~/.expo`.
- Runtime API evidence comes from fresh app-UID-scoped Android logcat (RN 0.81),
  not Metro stdout. Every flow must report the expected local API.
- This is local **debug E2E**, not release signing/performance validation.
  FCM/APNs delivery remains a separate physical-device smoke.
- No automatic retry, arbitrary UI sleeps or optional release-gate assertions.
  Existing optional education/modal dismissal is not an assertion substitute.
- The local machine should not have extreme external network or ephemeral-socket
  pressure during the gate. That is an operator environment concern; the harness
  does not configure host routing.

### Failure snapshot

On Maestro non-zero exit, timeout, interrupt, or observed runtime network error
(`ERR_NETWORK` / failed connect to `10.0.2.2:8000`), the harness writes a
**one-shot** `failure-snapshot.json` **before** cleanup. It is not a background
poller and does not open extra connections once per second while flows run.

The snapshot is bounded and read-only:

- owned backend/Metro process metadata (pid/poll/exit observation)
- listeners on **8000** and **8081**
- host `/health` and a loopback TCP connect only if listener PID is the owned backend
- adb device state and `adb reverse --list`
- optional Android-side TCP probe to `10.0.2.2:8000` when `toybox nc` supports `-n -z -w`
- errno / HTTP status without dumping response bodies or credentials
- last 100 lines of `backend.log` and `app-runtime.log`

A passing gate does not write this snapshot. Runtime network failure still fails
the gate; there is no automatic backend restart.

Artifacts printed at startup: `backend.log`, `metro.log`, `gradle.log`,
`maestro.log`, `app-runtime.log`, `seed.json`, `junit.xml`, `debug/`, `output/`,
`e2e.db`, JVM logs. On failure also: `failure-snapshot.json`,
`failure-backend-tail.log`, `failure-app-runtime-tail.log`, `maestro.exitcode`.
Treat artifacts as private: synthetic session/token values may occur in logs.

## Five independent flows

| Flow | Purpose |
| --- | --- |
| 01-login-success | Welcome → login → dashboard |
| 02-login-error | Wrong password → «Ошибка входа», login remains visible |
| 03-navigate-to-bookings | Dashboard → «Все записи» future-bookings modal |
| 04-open-booking-details | Platform navigation → schedule → services |
| 05-logout | Settings → logout → original welcome testID |

04 covers schedule/services despite its legacy filename; booking-detail coverage
remains separate debt. Each flow resets independently; debug/helper files are not
top-level suite entries. `shared/logout-if-needed.yaml` is not the reset path.
Login flows explicitly dismiss the keyboard after text entry so Gboard cannot
intercept taps intended for the password/submit controls; assertions remain required.
The negative-login flow first asserts the error alert, closes it with OK, then
asserts that the login screen remains visible.

Fixtures: Master A `+79991111111`, Master B `+79992222222`, Client C
`+79993333333`; local seed password `e2e123`. Gate uses only Master A.

## Harness regression tests

```bash
python3 -m unittest discover -s scripts -p test_maestro_android.py -v
bash -n scripts/run-maestro-e2e.sh
git diff --check
```

## iOS — separate manual readiness gate

Android automation does not install Xcode runtimes or build iOS. Inspect first:
```bash
xcrun simctl list runtimes
xcrun simctl list devices booted
```

Existing `./scripts/run-maestro-e2e.sh ios` still requires an operator-owned local
backend and installed **local-API** Simulator artifact (`com.dedato.app`).
It is **not** self-contained and does not attest binary/API provenance.
Before execution, separately verify a usable Simulator/runtime, local artifact
and JS bootstrap strategy. Do not use store/TestFlight binaries.
Android bootstrap proof does not count as iOS validation.
