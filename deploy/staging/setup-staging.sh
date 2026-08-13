#!/usr/bin/env bash
set -euo pipefail

REPOSITORY_URL="https://github.com/Cappie92/bookme.git"
EXPECTED_BRANCH="test/apple-iap-handoff"
APP_DIR="/opt/dedato-staging"
RUN_DEPLOY=0
ACTIVATE_NGINX=0

usage() {
  cat <<'EOF'
Usage: sudo bash deploy/staging/setup-staging.sh [--deploy] [--activate-nginx]

Default mode clones/fast-forwards the expected branch, creates the untracked env
from its template when absent, validates configuration, and installs the HTTP
nginx template without reloading nginx or starting containers.

  --deploy          explicitly run deploy-staging.sh after successful setup
  --activate-nginx  run nginx -t and reload nginx after installing the template
EOF
}

while (( $# > 0 )); do
  case "$1" in
    --deploy) RUN_DEPLOY=1 ;;
    --activate-nginx) ACTIVATE_NGINX=1 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "ERROR: unknown argument: $1" >&2; usage >&2; exit 2 ;;
  esac
  shift
done

if [[ "${EUID}" -ne 0 ]]; then
  echo "ERROR: run setup as root because it prepares /opt, /data, /var/log and /etc/nginx." >&2
  exit 1
fi
for command_name in git docker nginx; do
  command -v "${command_name}" >/dev/null 2>&1 || {
    echo "ERROR: ${command_name} is missing; run bootstrap-server.sh first." >&2
    exit 1
  }
done
docker compose version >/dev/null 2>&1 || {
  echo "ERROR: Docker Compose v2 plugin is missing; run bootstrap-server.sh first." >&2
  exit 1
}

install -d -o root -g docker -m 0770 \
  /data/dedato-staging \
  /data/dedato-staging/uploads \
  /data/dedato-staging/backups \
  /var/log/dedato-staging \
  /var/log/dedato-staging/backend

if [[ ! -d "${APP_DIR}/.git" ]]; then
  if [[ -d "${APP_DIR}" ]] && [[ -n "$(find "${APP_DIR}" -mindepth 1 -maxdepth 1 -print -quit)" ]]; then
    echo "ERROR: ${APP_DIR} exists, is non-empty, and is not a Git checkout; refusing to overwrite it." >&2
    exit 1
  fi
  rmdir "${APP_DIR}" 2>/dev/null || true
  git clone --branch "${EXPECTED_BRANCH}" --single-branch "${REPOSITORY_URL}" "${APP_DIR}"
else
  cd "${APP_DIR}"
  ORIGIN_URL="$(git remote get-url origin 2>/dev/null || true)"
  if [[ "${ORIGIN_URL}" != "${REPOSITORY_URL}" ]]; then
    echo "ERROR: origin must be ${REPOSITORY_URL}; found ${ORIGIN_URL:-none}. Refusing to update it." >&2
    exit 1
  fi
  if [[ -n "$(git status --porcelain)" ]]; then
    echo "ERROR: ${APP_DIR} has local changes; refusing to switch or update. Resolve them manually." >&2
    exit 1
  fi
  git fetch origin "${EXPECTED_BRANCH}"
  CURRENT_BRANCH="$(git branch --show-current)"
  if [[ "${CURRENT_BRANCH}" != "${EXPECTED_BRANCH}" ]]; then
    if git show-ref --verify --quiet "refs/heads/${EXPECTED_BRANCH}"; then
      git switch "${EXPECTED_BRANCH}"
    else
      git switch --create "${EXPECTED_BRANCH}" --track "origin/${EXPECTED_BRANCH}"
    fi
  fi
  git merge --ff-only "origin/${EXPECTED_BRANCH}"
fi

cd "${APP_DIR}"
CURRENT_BRANCH="$(git branch --show-current)"
if [[ "${CURRENT_BRANCH}" != "${EXPECTED_BRANCH}" ]]; then
  echo "ERROR: expected branch ${EXPECTED_BRANCH}, found ${CURRENT_BRANCH}." >&2
  exit 1
fi

ENV_FILE="${APP_DIR}/deploy/staging/backend.env"
if [[ ! -f "${ENV_FILE}" ]]; then
  install -m 0600 "${APP_DIR}/deploy/staging/backend.env.example" "${ENV_FILE}"
  echo "Created ${ENV_FILE} from the tracked template."
  echo "Fill it with staging-only values, then re-run setup. No containers were started."
  exit 1
fi
chmod 600 "${ENV_FILE}"
"${APP_DIR}/deploy/staging/check-env.sh" "${ENV_FILE}"

NGINX_AVAILABLE="/etc/nginx/sites-available/test.dedato.ru"
NGINX_ENABLED="/etc/nginx/sites-enabled/test.dedato.ru"
install -m 0644 "${APP_DIR}/deploy/staging/nginx-test.dedato.ru.conf" "${NGINX_AVAILABLE}"
if [[ -e "${NGINX_ENABLED}" ]] && [[ ! -L "${NGINX_ENABLED}" ]]; then
  echo "ERROR: ${NGINX_ENABLED} is a regular file; refusing to replace it." >&2
  exit 1
fi
ln -sfn "${NGINX_AVAILABLE}" "${NGINX_ENABLED}"

export STAGING_BACKEND_ENV_FILE="${ENV_FILE}"
docker compose -f "${APP_DIR}/docker-compose.staging.yml" config --quiet
nginx -t

if (( ACTIVATE_NGINX == 1 )); then
  systemctl reload nginx
  echo "Nginx HTTP configuration activated. TLS was not requested or issued."
else
  echo "Nginx template installed and validated, but nginx was not reloaded."
fi

echo "Staging preparation is valid at commit $(git rev-parse HEAD)."
if (( RUN_DEPLOY == 1 )); then
  exec "${APP_DIR}/deploy/staging/deploy-staging.sh"
fi
echo "Prepare-only mode complete. No containers were started and no migration ran."
