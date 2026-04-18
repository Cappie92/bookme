#!/usr/bin/env bash
set -euo pipefail

# Экспорт текущего dataset (SQLite + uploads) для переноса в прод.
# Источник: локальная рабочая копия / текущее состояние после reseed.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
OUT_DIR="${ROOT_DIR}/artifacts"

DB_SRC="${ROOT_DIR}/backend/bookme.db"
UPLOADS_SRC="${ROOT_DIR}/backend/uploads"

ts="$(date +%Y%m%d_%H%M%S)"
ARCHIVE="${OUT_DIR}/dedato_dataset_${ts}.tar.gz"

mkdir -p "${OUT_DIR}"

if [[ ! -f "${DB_SRC}" ]]; then
  echo "ERROR: SQLite DB not found at ${DB_SRC}"
  exit 1
fi

echo "Creating dataset archive:"
echo "  DB:       ${DB_SRC}"
echo "  uploads:  ${UPLOADS_SRC} (if exists)"
echo "  out:      ${ARCHIVE}"

tmp="$(mktemp -d)"
trap 'rm -rf "${tmp}"' EXIT

mkdir -p "${tmp}/dataset"
cp -f "${DB_SRC}" "${tmp}/dataset/bookme.db"
# Сколько обычных файлов в uploads на источнике (0 — норма для пустого каталога).
UPLOAD_FILE_COUNT=0
if [[ -d "${UPLOADS_SRC}" ]]; then
  mkdir -p "${tmp}/dataset/uploads"
  # Кол-во обычных файлов до/после копирования — защита от silent-failure (раньше было || true).
  UPLOAD_FILE_COUNT="$(find "${UPLOADS_SRC}" -type f | wc -l | awk '{print $1}')"
  cp -R "${UPLOADS_SRC}/." "${tmp}/dataset/uploads/"
  dst_n="$(find "${tmp}/dataset/uploads" -type f | wc -l | awk '{print $1}')"
  if [[ "${UPLOAD_FILE_COUNT}" != "${dst_n}" ]]; then
    echo "ERROR: uploads copy mismatch (source files=${UPLOAD_FILE_COUNT}, staged files=${dst_n})"
    exit 1
  fi
else
  echo "NOTE: no uploads directory at ${UPLOADS_SRC} — archive will contain DB only (expected if you never generated uploads)."
fi

tar -C "${tmp}" -czf "${ARCHIVE}" dataset

if ! tar -tzf "${ARCHIVE}" | grep -q '^dataset/bookme.db$'; then
  echo "ERROR: archive is missing dataset/bookme.db (internal consistency check failed)"
  exit 1
fi
# Пустой каталог uploads без файлов в tar может не дать ни одной строки — проверяем только если были файлы.
if [[ "${UPLOAD_FILE_COUNT}" -gt 0 ]]; then
  up_entries="$(tar -tzf "${ARCHIVE}" | grep -c '^dataset/uploads/' || true)"
  up_entries="${up_entries:-0}"
  if [[ "${up_entries}" -eq 0 ]]; then
    echo "ERROR: staged uploads tree did not make it into the archive (tar integrity check)"
    exit 1
  fi
fi

echo "OK. Size:"
ls -lh "${ARCHIVE}"
echo ""
echo "Next step: upload this archive to the prod server and run scripts/prod/import_dataset.sh there."

