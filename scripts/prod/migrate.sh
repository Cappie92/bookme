#!/usr/bin/env bash
set -euo pipefail

# Apply Alembic migrations against the SAME DATABASE_URL used by backend container.
#
# Usage (on server, repo root):
#   ./scripts/prod/migrate.sh

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

echo "Running: docker compose exec backend python -m alembic upgrade head"
docker compose -f "${ROOT_DIR}/docker-compose.prod.yml" exec -T backend \
  python -m alembic upgrade head

echo "OK."
