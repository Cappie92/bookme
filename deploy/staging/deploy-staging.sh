#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
EXPECTED_BRANCH="test/apple-iap-handoff"
ENV_FILE="${ROOT_DIR}/deploy/staging/backend.env"
COMPOSE_FILE="${ROOT_DIR}/docker-compose.staging.yml"
EXPECTED_COMMIT="${EXPECTED_COMMIT:-}"

usage() {
  cat <<'EOF'
Usage: sudo deploy/staging/deploy-staging.sh [--expected-commit SHA]

This is an explicit, manual staging-only deploy. It never updates Git, selects a
production env/Compose file, copies a database, or performs automatic rollback.
EOF
}

while (( $# > 0 )); do
  case "$1" in
    --expected-commit)
      [[ $# -ge 2 ]] || { echo "ERROR: --expected-commit requires a value." >&2; exit 2; }
      EXPECTED_COMMIT="$2"
      shift
      ;;
    -h|--help) usage; exit 0 ;;
    *) echo "ERROR: unknown argument: $1" >&2; usage >&2; exit 2 ;;
  esac
  shift
done

if [[ "${EUID}" -ne 0 ]]; then
  echo "ERROR: run this staging deploy as root." >&2
  exit 1
fi
for command_name in git docker curl; do
  command -v "${command_name}" >/dev/null 2>&1 || {
    echo "ERROR: missing required command: ${command_name}" >&2
    exit 1
  }
done
docker compose version >/dev/null 2>&1 || {
  echo "ERROR: Docker Compose v2 plugin is required." >&2
  exit 1
}

cd "${ROOT_DIR}"
CURRENT_BRANCH="$(git branch --show-current)"
[[ "${CURRENT_BRANCH}" == "${EXPECTED_BRANCH}" ]] || {
  echo "ERROR: expected branch ${EXPECTED_BRANCH}, found ${CURRENT_BRANCH:-detached HEAD}." >&2
  exit 1
}
if [[ -n "$(git status --porcelain --untracked-files=no)" ]]; then
  echo "ERROR: tracked files have local changes; deploy a known commit or resolve them manually." >&2
  exit 1
fi

CURRENT_COMMIT="$(git rev-parse HEAD)"
echo "Staging deploy commit: ${CURRENT_COMMIT}"
if [[ -n "${EXPECTED_COMMIT}" ]]; then
  RESOLVED_EXPECTED_COMMIT="$(git rev-parse "${EXPECTED_COMMIT}^{commit}" 2>/dev/null)" || {
    echo "ERROR: expected commit cannot be resolved: ${EXPECTED_COMMIT}" >&2
    exit 1
  }
  [[ "${CURRENT_COMMIT}" == "${RESOLVED_EXPECTED_COMMIT}" ]] || {
    echo "ERROR: HEAD does not match --expected-commit." >&2
    exit 1
  }
fi

chmod 600 "${ENV_FILE}" 2>/dev/null || true
"${ROOT_DIR}/deploy/staging/check-env.sh" "${ENV_FILE}"
export STAGING_BACKEND_ENV_FILE="${ENV_FILE}"

compose() {
  docker compose -f "${COMPOSE_FILE}" "$@"
}

wait_for_health() {
  local url="$1"
  local attempt
  for attempt in $(seq 1 30); do
    if curl --fail --silent --show-error --max-time 5 "${url}" >/dev/null; then
      echo "Health check passed: ${url}"
      return 0
    fi
    echo "Waiting for staging health (${attempt}/30)..."
    sleep 2
  done
  echo "ERROR: staging health check did not pass: ${url}" >&2
  return 1
}

compose config --quiet
compose build backend frontend
compose up -d
wait_for_health http://127.0.0.1:8081/api/health
compose exec -T backend python -m alembic current
compose exec -T backend python -m alembic upgrade head
wait_for_health http://127.0.0.1:8081/api/health
compose ps
compose logs --tail=80 backend frontend redis

echo "Staging deploy completed. No automatic rollback was attempted."
