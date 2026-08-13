#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "ERROR: run this script as root (for example: sudo bash $0)." >&2
  exit 1
fi

if [[ ! -r /etc/os-release ]]; then
  echo "ERROR: /etc/os-release is unavailable; Ubuntu cannot be verified." >&2
  exit 1
fi

# shellcheck disable=SC1091
source /etc/os-release
if [[ "${ID:-}" != "ubuntu" ]]; then
  echo "ERROR: this bootstrap supports Ubuntu only (detected: ${ID:-unknown})." >&2
  exit 1
fi
if ! dpkg --compare-versions "${VERSION_ID}" ge "20.04"; then
  echo "ERROR: Ubuntu ${VERSION_ID} is too old; Ubuntu 20.04 or newer is required." >&2
  exit 1
fi
echo "Detected Ubuntu ${VERSION_ID} (${VERSION_CODENAME:-unknown codename})."

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get upgrade -y
apt-get install -y ca-certificates curl file git gnupg ufw nginx certbot python3-certbot-nginx

install_docker() {
  local keyring="/etc/apt/keyrings/docker.gpg"
  install -m 0755 -d /etc/apt/keyrings
  if [[ ! -s "${keyring}" ]]; then
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
      | gpg --dearmor --batch --yes -o "${keyring}"
    chmod 0644 "${keyring}"
  fi

  local architecture
  architecture="$(dpkg --print-architecture)"
  printf 'deb [arch=%s signed-by=%s] https://download.docker.com/linux/ubuntu %s stable\n' \
    "${architecture}" "${keyring}" "${VERSION_CODENAME}" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
}

if ! command -v docker >/dev/null 2>&1 || ! docker compose version >/dev/null 2>&1; then
  install_docker
fi

systemctl enable --now docker
systemctl enable --now nginx

if [[ -z "$(swapon --show --noheadings)" ]]; then
  if [[ ! -e /swapfile ]]; then
    if ! fallocate -l 2G /swapfile; then
      dd if=/dev/zero of=/swapfile bs=1M count=2048 status=progress
    fi
    chmod 600 /swapfile
    mkswap /swapfile
  elif ! file /swapfile | grep -q 'swap file'; then
    echo "ERROR: /swapfile exists but is not a swap file; refusing to overwrite it." >&2
    exit 1
  fi
  chmod 600 /swapfile
  swapon /swapfile
  if ! grep -Eq '^[[:space:]]*/swapfile[[:space:]]' /etc/fstab; then
    printf '/swapfile none swap sw 0 0\n' >> /etc/fstab
  fi
fi

STAGING_OWNER="${SUDO_USER:-root}"
if ! id "${STAGING_OWNER}" >/dev/null 2>&1; then
  echo "ERROR: staging owner ${STAGING_OWNER} does not exist." >&2
  exit 1
fi
if [[ "${STAGING_OWNER}" != "root" ]]; then
  usermod -aG docker "${STAGING_OWNER}"
fi

install -d -o "${STAGING_OWNER}" -g docker -m 0750 /opt/dedato-staging
install -d -o root -g docker -m 0770 \
  /data/dedato-staging \
  /data/dedato-staging/uploads \
  /data/dedato-staging/backups \
  /var/log/dedato-staging \
  /var/log/dedato-staging/backend

# Open SSH before enabling the firewall, so the current SSH session remains
# reachable. Re-running these rules is safe: UFW reports existing rules.
ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

echo
echo "Bootstrap complete. No repository was cloned and no application was deployed."
echo "If ${STAGING_OWNER} was newly added to the docker group, start a new login session before using Docker without sudo."
echo
docker --version
docker compose version
nginx -v
free -h
df -h
ufw status verbose
