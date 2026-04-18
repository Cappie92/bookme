"""Кастомные исключения для API с единой обработкой через exception handlers."""

from typing import Any, Dict, Optional


class SchemaOutdatedError(Exception):
    """
    Схема БД устарела (миграции не применены).
    Обрабатывается в main.py → flat JSON + 409 + X-Error-Code: SCHEMA_OUTDATED.
    """

    def __init__(
        self,
        detail: str = "Loyalty schema outdated, apply migrations",
        hint: str = "Run alembic upgrade head",
        debug: Optional[Dict[str, Any]] = None,
    ):
        self.detail = detail
        self.hint = hint
        self.debug = debug
        super().__init__(detail)
