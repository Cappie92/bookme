#!/usr/bin/env bash
set -euo pipefail

# Apply Alembic migrations against the SAME DATABASE_URL used by backend container.
#
# Usage (on server, repo root):
#   ./scripts/prod/migrate.sh

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

# shellcheck source=compose.sh
source "${ROOT_DIR}/scripts/prod/compose.sh"

echo "Running: compose exec backend python -m alembic upgrade head"
compose_run -f "${ROOT_DIR}/docker-compose.prod.yml" exec -T backend \
  python -m alembic upgrade head

echo "OK."
