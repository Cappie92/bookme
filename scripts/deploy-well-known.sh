#!/usr/bin/env bash
# Deploy Universal Links / App Links well-known files to dedato.ru nginx.
# Usage: ./scripts/deploy-well-known.sh [SERVER_USER@SERVER_HOST]
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REMOTE="${1:-root@193.160.208.206}"
REMOTE_DIR="/var/www/dedato-well-known"

echo "→ Upload well-known files to ${REMOTE}:${REMOTE_DIR}"
ssh "$REMOTE" "mkdir -p ${REMOTE_DIR}"
scp "${ROOT}/deploy/well-known/apple-app-site-association" "${REMOTE}:${REMOTE_DIR}/"
scp "${ROOT}/deploy/well-known/assetlinks.json" "${REMOTE}:${REMOTE_DIR}/"
scp "${ROOT}/deploy/well-known/nginx-well-known.snippet" "${REMOTE}:/tmp/nginx-well-known.snippet"

echo "→ Patch nginx (both :80 and :443) if needed, reload"
ssh "$REMOTE" bash -s <<'REMOTE_SCRIPT'
set -euo pipefail
NGINX_SITE="/etc/nginx/sites-enabled/dedato.ru"
SNIPPET_MARKER="# Universal Links (iOS) + App Links (Android)"
if ! grep -q "$SNIPPET_MARKER" "$NGINX_SITE"; then
  python3 <<'PY'
from pathlib import Path
path = Path("/etc/nginx/sites-enabled/dedato.ru")
text = path.read_text()
snippet = Path("/tmp/nginx-well-known.snippet").read_text()
needle = "    location / {"
if text.count(needle) < 1:
    raise SystemExit("Could not find location / in nginx config")
text = text.replace(
    "    client_max_body_size 20m;\n\n    location / {",
    "    client_max_body_size 20m;\n\n" + snippet + "\n    location / {",
)
path.write_text(text)
print("nginx patched (all server blocks)")
PY
fi
nginx -t
systemctl reload nginx
REMOTE_SCRIPT

echo "→ Verify GET body"
curl -sf "https://dedato.ru/.well-known/apple-app-site-association" | head -3
curl -sf "https://dedato.ru/.well-known/assetlinks.json" | head -3
echo "Done."
