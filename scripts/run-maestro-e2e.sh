#!/usr/bin/env bash
# Local Maestro release-gate runner. Not CI. Not store/EAS production binaries.
# Usage:
#   ./scripts/run-maestro-e2e.sh ios
#   ./scripts/run-maestro-e2e.sh android
#   ./scripts/run-maestro-e2e.sh ios .maestro/flows/01-login-success.yaml

set -u

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MOBILE="$ROOT/mobile"
RECOMMENDED_VERSION_FILE="$MOBILE/.maestro/MAESTRO_VERSION"
CONFIG="$MOBILE/.maestro/config.yaml"

fail() {
  echo "ERROR: $*" >&2
  exit 1
}

is_loopback_http_url() {
  local raw=$1
  case "$raw" in
    http://127.0.0.1:*|http://localhost:*|http://[::1]:*|https://127.0.0.1:*|https://localhost:*|https://[::1]:*|http://10.0.2.2:*|https://10.0.2.2:*)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

PLATFORM="${1:-}"
if [ -z "$PLATFORM" ]; then
  fail "Usage: $0 <ios|android> [flow yaml...]"
fi
shift

case "$PLATFORM" in
  ios)
    APP_ID="${APP_ID:-com.dedato.app}"
    ;;
  android)
    APP_ID="${APP_ID:-ru.dedato.mobile}"
    ;;
  *)
    fail "Platform must be ios or android, got: $PLATFORM"
    ;;
esac

if [ "$PLATFORM" = "android" ]; then
  exec python3 "$ROOT/scripts/maestro_android.py" "$@"
fi

export PATH="${PATH}:${HOME}/.maestro/bin"

if ! command -v maestro >/dev/null 2>&1; then
  fail "Maestro CLI not found. Install locally (not silently from this script): curl -Ls https://get.maestro.mobile.dev | bash"
fi

ACTUAL_VERSION="$(maestro --version 2>/dev/null | head -1 | tr -d '[:space:]')"
RECOMMENDED_VERSION="$(tr -d '[:space:]' < "$RECOMMENDED_VERSION_FILE" 2>/dev/null || true)"
if [ -n "$RECOMMENDED_VERSION" ] && [ "$ACTUAL_VERSION" != "$RECOMMENDED_VERSION" ]; then
  echo "WARN: Maestro CLI is ${ACTUAL_VERSION:-unknown}; recommended ${RECOMMENDED_VERSION} (see mobile/.maestro/MAESTRO_VERSION). Not auto-upgrading." >&2
fi

case "$APP_ID" in
  host.exp.Exponent|host.exp.exponent)
    if [ "${MAESTRO_ALLOW_EXPO_GO:-}" != "1" ]; then
      fail "APP_ID=$APP_ID is Expo Go. launchApp cannot open the DeDato JS app inside Expo Go. Use a native development client (com.dedato.app / ru.dedato.mobile)."
    fi
    ;;
  com.yourcompany.dedato)
    fail "APP_ID=$APP_ID is a stale placeholder. Use com.dedato.app (iOS) or ru.dedato.mobile (Android)."
    ;;
  com.dedato.app|ru.dedato.mobile)
    ;;
  *)
    fail "Refusing unknown APP_ID=$APP_ID"
    ;;
esac

if [ "$PLATFORM" = "ios" ] && [ "$APP_ID" != "com.dedato.app" ]; then
  fail "iOS gate requires APP_ID=com.dedato.app (got $APP_ID)"
fi
if [ "$PLATFORM" = "android" ] && [ "$APP_ID" != "ru.dedato.mobile" ]; then
  fail "Android gate requires APP_ID=ru.dedato.mobile (got $APP_ID)"
fi

E2E_BACKEND_URL="${E2E_BACKEND_URL:-http://127.0.0.1:8000}"
E2E_BACKEND_LOWER="$(printf '%s' "$E2E_BACKEND_URL" | tr '[:upper:]' '[:lower:]')"
case "$E2E_BACKEND_LOWER" in
  *dedato.ru*|*test.dedato.ru*|*bookme*)
    fail "E2E_BACKEND_URL is not a disposable local target: $E2E_BACKEND_URL"
    ;;
esac
if ! is_loopback_http_url "$E2E_BACKEND_URL"; then
  fail "E2E_BACKEND_URL must be loopback or Android emulator host (10.0.2.2). Got: $E2E_BACKEND_URL"
fi

if [ "${MAESTRO_ALLOW_PRODUCTION_BACKEND:-}" = "1" ]; then
  fail "MAESTRO_ALLOW_PRODUCTION_BACKEND is not supported. Maestro mutating flows must not target production."
fi

if [ "$PLATFORM" = "android" ]; then
  if ! command -v adb >/dev/null 2>&1; then
    fail "adb not found"
  fi
  DEVICE_COUNT="$(adb devices | awk 'NR>1 && $2=="device" {c++} END {print c+0}')"
  if [ "$DEVICE_COUNT" -lt 1 ]; then
    fail "ENVIRONMENT BLOCKED: no Android device/emulator (adb devices empty). AVD Medium_Phone_API_36.1 exists locally but is not booted. This script does not start emulators or install the app."
  fi
else
  BOOTED="$(xcrun simctl list devices booted 2>/dev/null | grep -c Booted || true)"
  if [ "${BOOTED:-0}" -lt 1 ]; then
    fail "ENVIRONMENT BLOCKED: no booted iOS Simulator. Available runtimes may be missing/unavailable. This script does not create simulators, install Xcode runtimes, or install the app."
  fi
fi

E2E_PHONE_DIGITS="${E2E_PHONE_DIGITS:-9991111111}"
E2E_PASSWORD="${E2E_PASSWORD:-e2e123}"

echo "Maestro: ${ACTUAL_VERSION:-unknown}"
echo "Platform: $PLATFORM"
echo "APP_ID: $APP_ID"
echo "E2E_BACKEND_URL (guard only; binary API_URL is baked at build time): $E2E_BACKEND_URL"
echo "Account: Master A digits $E2E_PHONE_DIGITS"
echo "Install a local-API native build before running. Store/EAS preview production-API binaries are forbidden."

cd "$MOBILE"

FLOW_ARGS=()
if [ "$#" -eq 0 ]; then
  FLOW_ARGS+=(".maestro/flows")
else
  FLOW_ARGS+=("$@")
fi

exec maestro test \
  --config "$CONFIG" \
  --exclude-tags debug,helper \
  --env "APP_ID=${APP_ID}" \
  --env "E2E_PHONE_DIGITS=${E2E_PHONE_DIGITS}" \
  --env "E2E_PASSWORD=${E2E_PASSWORD}" \
  "${FLOW_ARGS[@]}"
