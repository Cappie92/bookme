#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="${1:-${ROOT_DIR}/deploy/staging/backend.env}"

fail() {
  echo "ERROR: staging env validation failed: $*" >&2
  exit 1
}

if [[ ! -f "${ENV_FILE}" ]]; then
  fail "missing ${ENV_FILE}; copy deploy/staging/backend.env.example and fill staging-only values"
fi

env_value() {
  local key="$1"
  awk -v wanted="${key}" '
    /^[[:space:]]*#/ || /^[[:space:]]*$/ { next }
    {
      line=$0
      sub(/\r$/, "", line)
      pos=index(line, "=")
      if (pos == 0) next
      name=substr(line, 1, pos - 1)
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", name)
      if (name == wanted) value=substr(line, pos + 1)
    }
    END { print value }
  ' "${ENV_FILE}"
}

env_has_key() {
  local key="$1"
  awk -v wanted="${key}" '
    /^[[:space:]]*#/ || /^[[:space:]]*$/ { next }
    {
      line=$0
      sub(/\r$/, "", line)
      pos=index(line, "=")
      if (pos == 0) next
      name=substr(line, 1, pos - 1)
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", name)
      if (name == wanted) found=1
    }
    END { exit(found ? 0 : 1) }
  ' "${ENV_FILE}"
}

require_present() {
  local key="$1"
  env_has_key "${key}" || fail "${key} is missing"
}

require_equal() {
  local key="$1"
  local expected="$2"
  local actual
  require_present "${key}"
  actual="$(env_value "${key}")"
  [[ "${actual}" == "${expected}" ]] || fail "${key} must equal the staging-safe value '${expected}'"
}

require_non_placeholder() {
  local key="$1"
  local value
  require_present "${key}"
  value="$(env_value "${key}")"
  [[ -n "${value}" ]] || fail "${key} is required"
  case "${value}" in
    *CHANGE_ME*|*change_me*|*PLACEHOLDER*|*placeholder*|*REPLACE_ME*|*replace_me*)
      fail "${key} still contains a placeholder"
      ;;
  esac
}

lowercase() {
  printf '%s' "$1" | tr '[:upper:]' '[:lower:]'
}

require_equal ENVIRONMENT staging
require_equal FRONTEND_URL https://test.dedato.ru
require_equal API_BASE_URL https://test.dedato.ru
require_equal DATABASE_URL sqlite:////data/bookme.db
require_equal REDIS_HOST redis
require_equal REDIS_PORT 6379
require_equal JWT_SESSION_VERSION_REQUIRED 0
require_equal JWT_TOKEN_TYPE_REQUIRED 0
require_equal ENABLE_DEV_TESTDATA ""
require_equal DEV_E2E ""

require_non_placeholder JWT_SECRET_KEY
JWT_SECRET_KEY_VALUE="$(env_value JWT_SECRET_KEY)"
if (( ${#JWT_SECRET_KEY_VALUE} < 32 )); then
  fail "JWT_SECRET_KEY must contain at least 32 characters"
fi

EMAIL_ENABLED="$(env_value EMAIL_ENABLED)"
require_present EMAIL_ENABLED
case "$(lowercase "${EMAIL_ENABLED}")" in
  false|0|no|"") ;;
  true|1|yes)
    require_non_placeholder UNISENDER_API_KEY
    require_non_placeholder UNISENDER_LIST_ID
    require_non_placeholder EMAIL_FROM_ADDRESS
    ;;
  *) fail "EMAIL_ENABLED must be true or false" ;;
esac

ROBOKASSA_MODE="$(env_value ROBOKASSA_MODE)"
require_present ROBOKASSA_MODE
if [[ "$(lowercase "${ROBOKASSA_MODE}")" != "stub" ]]; then
  require_equal ROBOKASSA_IS_TEST true
  require_non_placeholder ROBOKASSA_MERCHANT_LOGIN
  require_non_placeholder ROBOKASSA_TEST_PASSWORD_1
  require_non_placeholder ROBOKASSA_TEST_PASSWORD_2
fi

ZVONOK_MODE="$(env_value ZVONOK_MODE)"
require_present ZVONOK_MODE
if [[ "$(lowercase "${ZVONOK_MODE}")" != "stub" ]]; then
  require_non_placeholder ZVONOK_API_KEY
fi

PLUSOFON_MODE="$(env_value PLUSOFON_MODE)"
require_present PLUSOFON_MODE
if [[ "$(lowercase "${PLUSOFON_MODE}")" != "stub" ]]; then
  require_non_placeholder PLUSOFON_USER_ID
  require_non_placeholder PLUSOFON_ACCESS_TOKEN
fi

YANDEX_AUTH_ENABLED="$(env_value YANDEX_AUTH_ENABLED)"
require_present YANDEX_AUTH_ENABLED
case "$(lowercase "${YANDEX_AUTH_ENABLED}")" in
  false|0|no|"") ;;
  true|1|yes)
    require_non_placeholder YANDEX_CLIENT_ID
    require_non_placeholder YANDEX_CLIENT_SECRET
    require_equal YANDEX_REDIRECT_URI https://test.dedato.ru/api/auth/oauth/callback
    ;;
  *) fail "YANDEX_AUTH_ENABLED must be true or false" ;;
esac

if MODE="$(stat -c '%a' "${ENV_FILE}" 2>/dev/null)"; then
  [[ "${MODE}" == "600" ]] || fail "${ENV_FILE} permissions must be 600 (current: ${MODE})"
fi

echo "Staging env contract is valid (secret values were not printed)."
