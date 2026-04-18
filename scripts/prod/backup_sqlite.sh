#!/usr/bin/env bash
set -euo pipefail

# Быстрый бэкап продовых volumes (SQLite + uploads) в tar.gz на сервере.
#
# Output: backups/dedato_backup_YYYYMMDD_HHMMSS.tar.gz

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
OUT_DIR="${ROOT_DIR}/backups"
ts="$(date +%Y%m%d_%H%M%S)"
ARCHIVE="${OUT_DIR}/dedato_backup_${ts}.tar.gz"

mkdir -p "${OUT_DIR}"

tmp="$(mktemp -d)"
trap 'rm -rf "${tmp}"' EXIT
mkdir -p "${tmp}/dataset"

echo "Dumping SQLite from volume dedato_data..."
docker run --rm -v dedato_data:/data -v "${tmp}/dataset:/out" alpine:3.20 \
  sh -c 'cp -f /data/bookme.db /out/bookme.db'

echo "Dumping uploads from volume dedato_uploads..."
docker run --rm -v dedato_uploads:/uploads -v "${tmp}/dataset:/out" alpine:3.20 \
  sh -c 'mkdir -p /out/uploads && cp -R /uploads/. /out/uploads/ || true'

tar -C "${tmp}" -czf "${ARCHIVE}" dataset
echo "Backup created: ${ARCHIVE}"
ls -lh "${ARCHIVE}"

