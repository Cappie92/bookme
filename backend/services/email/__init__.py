"""Транзакционная почта: провайдеры и шаблоны."""
from services.email.base import EmailSendResult
from services.email.factory import (
    build_transactional_provider,
    get_transactional_provider,
    reset_transactional_provider_cache,
)

__all__ = [
    "EmailSendResult",
    "get_transactional_provider",
    "build_transactional_provider",
    "reset_transactional_provider_cache",
]
