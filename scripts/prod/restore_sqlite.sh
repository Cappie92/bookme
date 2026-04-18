#!/usr/bin/env bash
set -euo pipefail

# Restore backup archive into prod volumes.
#
# Usage:
#   ./scripts/prod/restore_sqlite.sh backups/dedato_backup_*.tar.gz

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ARCHIVE="${1:-}"

if [[ -z "${ARCHIVE}" || ! -f "${ARCHIVE}" ]]; then
  echo "Usage: $0 backups/dedato_backup_*.tar.gz"
  exit 1
fi

tmp="$(mktemp -d)"
trap 'rm -rf "${tmp}"' EXIT

tar -C "${tmp}" -xzf "${ARCHIVE}"

if [[ ! -f "${tmp}/dataset/bookme.db" ]]; then
  echo "ERROR: backup does not contain dataset/bookme.db"
  exit 1
fi

echo "Stopping prod stack..."
docker compose -f "${ROOT_DIR}/docker-compose.prod.yml" down || true

echo "Restoring DB..."
docker run --rm \
  -v dedato_data:/data \
  -v "${tmp}/dataset:/in:ro" \
  alpine:3.20 \
  sh -c 'cp -f /in/bookme.db /data/bookme.db'

if [[ -d "${tmp}/dataset/uploads" ]]; then
  echo "Restoring uploads..."
  docker run --rm \
    -v dedato_uploads:/uploads \
    -v "${tmp}/dataset/uploads:/in_uploads:ro" \
    alpine:3.20 \
    sh -c 'mkdir -p /uploads && rm -rf /uploads/* && cp -R /in_uploads/. /uploads/'
fi

echo "Starting prod stack..."
docker compose -f "${ROOT_DIR}/docker-compose.prod.yml" up -d --build

echo "OK."

