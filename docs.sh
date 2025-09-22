#!/usr/bin/env bash
set -euo pipefail

CMD="${1:-help}"

init() {
  if [ ! -d ".venv" ]; then
    python3 -m venv .venv
    echo "✅  Virtualenv создан."
  fi
  source .venv/bin/activate
  pip install -r requirements-docs.txt
  echo "✅  Зависимости установлены."
}

build() {
  if [ ! -d ".venv" ]; then
    echo "❌  Virtualenv не найден. Запустите: ./docs.sh init"
    exit 1
  fi
  source .venv/bin/activate
  mkdocs build --strict
}

serve() {
  if [ ! -d ".venv" ]; then
    echo "❌  Virtualenv не найден. Запустите: ./docs.sh init"
    exit 1
  fi
  source .venv/bin/activate
  mkdocs serve -a 0.0.0.0:8001
}

ci() {
  build
  echo "ℹ️  Сайт собран в ./site — можно публиковать в Pages."
}

arch_scan() {
  source .venv/bin/activate
  python tools/gen_arch_inventory.py
}

overview() {
  arch_scan
  source .venv/bin/activate
  python tools/gen_system_overview.py
  build
}

overview_scan() {
  arch_scan
  source .venv/bin/activate
  python tools/gen_system_overview.py
}

help() {
  cat <<EOF
Usage: ./docs.sh <command>
  init   — создать venv и поставить зависимости
  build  — однократная сборка
  serve  — локальный превью с hot-reload
  ci     — команда для CI (сборка + strict-проверка)
  overview — сканировать архитектуру и собрать сайт
  overview-scan — только сканирование без сборки
EOF
}

case "$CMD" in
  init)  init  ;;
  build) build ;;
  serve) serve ;;
  ci)    ci    ;;
  overview) overview ;;
  overview-scan) overview_scan ;;
  *)     help  ;;
esac 