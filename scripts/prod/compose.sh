# Shared by scripts/prod/migrate.sh and .github/workflows/deploy.yml (remote, after scp).
# Prefer Docker Compose v2 plugin (`docker compose`), fallback to legacy `docker-compose` v1.
compose_run() {
  if docker compose version >/dev/null 2>&1; then
    docker compose "$@"
  elif docker-compose version >/dev/null 2>&1; then
    docker-compose "$@"
  else
    echo "ERROR: need 'docker compose' (Compose v2 plugin) or 'docker-compose' (v1) in PATH." >&2
    return 1
  fi
}
