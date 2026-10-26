#!/usr/bin/env bash
# Install the Playwright Chromium headless shell plus its apt dependencies on a
# GitHub-hosted Ubuntu runner. Run from frontend/ so npx resolves the locked
# Playwright version.
#
# apt's own timeout only fires when a connection stops sending data. A mirror
# that keeps trickling bytes never trips it, so every attempt is also bounded
# by wall time. Completed .deb files stay in /var/cache/apt/archives, so a
# later attempt does not download them again.

set -euo pipefail

APT_CONF=/etc/apt/apt.conf.d/80-dedato-ci-network
ATTEMPT_LIMITS_SEC=(180 300 420)
KILL_AFTER_SEC=30

sudo tee "$APT_CONF" >/dev/null <<'EOF'
Acquire::Retries "3";
Acquire::http::Timeout "30";
Acquire::https::Timeout "30";
DPkg::Lock::Timeout "120";
EOF

total=${#ATTEMPT_LIMITS_SEC[@]}
attempt=0
for limit in "${ATTEMPT_LIMITS_SEC[@]}"; do
  attempt=$((attempt + 1))
  echo "Playwright Chromium install attempt ${attempt}/${total} (limit ${limit}s)"
  status=0
  timeout --kill-after="${KILL_AFTER_SEC}" "$limit" \
    npx playwright install --with-deps --only-shell chromium || status=$?
  if [[ $status -eq 0 ]]; then
    exit 0
  fi
  if [[ $status -eq 124 || $status -eq 137 ]]; then
    reason="exceeded ${limit}s"
  else
    reason="exit ${status}"
  fi
  if [[ $attempt -lt $total ]]; then
    echo "::warning title=Playwright install::attempt ${attempt}/${total} failed (${reason}); retrying"
    # An attempt killed while dpkg was unpacking leaves packages half-configured.
    if ! sudo dpkg --configure -a; then
      echo "::warning title=Playwright install::dpkg --configure -a failed; next attempt will report it"
    fi
  else
    echo "::error title=Playwright install::all ${total} attempts failed (last: ${reason})"
  fi
done
exit 1
