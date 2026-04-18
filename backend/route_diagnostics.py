"""
Опциональная диагностика таблицы маршрутов при старте.

Включение: DEDATO_DEBUG_ROUTES=1 (по умолчанию выключено).

Дополнительно: DEDATO_LOG_ENTRYPOINT=1 — одна строка с командой запуска uvicorn.
"""

from __future__ import annotations

import logging
import os
from typing import Any

_log = logging.getLogger("uvicorn.error")


def log_route_diagnostics(app: Any) -> None:
    if os.environ.get("DEDATO_DEBUG_ROUTES", "").strip().lower() not in ("1", "true", "yes"):
        return

    day_entries: list[tuple[int, str, list[str], str]] = []
    master_routes: list[tuple[int, str, list[str]]] = []
    catchalls: list[tuple[int, str, list[str], str]] = []

    for idx, route in enumerate(app.routes):
        path = getattr(route, "path", None)
        if path is None:
            continue
        methods = sorted(getattr(route, "methods", None) or [])
        rtype = type(route).__name__
        if "schedule/day" in path:
            day_entries.append((idx, path, methods, rtype))
        if "/api/master/" in path:
            master_routes.append((idx, path, methods))
        if "{full_path:path}" in path or "{full_path}" in path:
            catchalls.append((idx, path, methods, rtype))

    _log.info(
        "DEDATO_DEBUG_ROUTES: [index, path, methods, type] matching schedule/day: %s",
        day_entries,
    )
    _log.info(
        "DEDATO_DEBUG_ROUTES: total flat routes with /api/master/ in path: %s (showing first 25)",
        len(master_routes),
    )
    _log.info("DEDATO_DEBUG_ROUTES: /api/master/* sample: %s", master_routes[:25])
    _log.info(
        "DEDATO_DEBUG_ROUTES: catch-all-like routes [index, path, methods, type]: %s",
        catchalls,
    )


def log_app_entrypoint_hint() -> None:
    if os.environ.get("DEDATO_LOG_ENTRYPOINT", "").strip().lower() not in ("1", "true", "yes"):
        return
    _log.info(
        "DEDATO_LOG_ENTRYPOINT: из каталога backend — "
        "python3 -m uvicorn main:app --reload --host 0.0.0.0 --port 8000"
    )
