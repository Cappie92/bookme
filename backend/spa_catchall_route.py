"""
Кастомный APIRoute для SPA catch-all GET /{full_path:path}.

Проблема Starlette: маршрут с тем же path-regex, что и /api/..., но только GET,
даёт Match.PARTIAL для POST (path совпал, метод нет). Если в процессе нет
реального POST /api/master/schedule/day, первым partial оказывается catch-all →
405 Method Not Allowed, Allow: GET — хотя ожидаем 404 на «неизвестный API».

Исключаем из matches любые пути /api и /api/... — тогда POST к API не цепляется
за SPA, и отрабатывают только зарегистрированные API-роуты.
"""

from __future__ import annotations

from typing import Tuple

from fastapi.routing import APIRoute
from starlette._utils import get_route_path
from starlette.routing import Match
from starlette.types import Scope


class SpaCatchAllAPIRoute(APIRoute):
    """GET catch-all для SPA; не матчится на /api и /api/*."""

    def matches(self, scope: Scope) -> Tuple[Match, Scope]:
        if scope["type"] == "http":
            route_path = get_route_path(scope)
            if route_path == "/api" or route_path.startswith("/api/"):
                return Match.NONE, {}
        return super().matches(scope)
