"""Выбор провайдера транзакционной почты по ENV (stub / Unisender)."""
from __future__ import annotations

import logging
from typing import Optional

from settings import get_settings

from services.email.base import TransactionalEmailProvider
from services.email.stub_provider import FailingTransactionalProvider, StubTransactionalProvider
from services.email.unisender_provider import UnisenderTransactionalProvider

logger = logging.getLogger(__name__)

_provider_cache: Optional[TransactionalEmailProvider] = None


def _parse_bool(val: str) -> bool:
    return (val or "").strip().lower() in ("1", "true", "yes", "on")


def build_transactional_provider() -> TransactionalEmailProvider:
    """Создаёт новый экземпляр провайдера (без кеша)."""
    settings = get_settings()

    if not settings.email_enabled:
        logger.info(
            "transactional email provider: stub (EMAIL_ENABLED=false or unset)"
        )
        return StubTransactionalProvider(reason="EMAIL_ENABLED=false")

    provider_name = (settings.email_provider or "").strip().lower()
    if provider_name != "unisender":
        logger.error(
            "unknown EMAIL_PROVIDER=%s — используется stub с ошибкой отправки",
            settings.email_provider,
        )
        return FailingTransactionalProvider(
            error_message="Неизвестный EMAIL_PROVIDER",
        )

    key = (settings.UNISENDER_API_KEY or "").strip()
    from_addr = settings.email_from_address_effective
    list_id = (settings.UNISENDER_LIST_ID or "").strip()
    if not key or not from_addr:
        logger.error(
            "Unisender включён (EMAIL_ENABLED=true), но не заданы UNISENDER_API_KEY или EMAIL_FROM_ADDRESS"
        )
        return FailingTransactionalProvider(
            error_message="Почта не настроена на сервере (Unisender)",
        )
    if not list_id:
        logger.error(
            "Unisender включён (EMAIL_ENABLED=true), но не задан UNISENDER_LIST_ID "
            "(классический API sendEmail требует list_id)"
        )
        return FailingTransactionalProvider(
            error_message="Почта не настроена на сервере: задайте UNISENDER_LIST_ID для Unisender sendEmail",
        )

    timeout = float(settings.UNISENDER_REQUEST_TIMEOUT_SEC or "25")
    att_mode = (settings.UNISENDER_ATTACHMENTS_MODE or "multipart").strip().lower()
    p = UnisenderTransactionalProvider(
        api_key=key,
        api_base_url=settings.UNISENDER_API_BASE_URL,
        from_email=from_addr,
        from_name=settings.EMAIL_FROM_NAME,
        list_id=list_id,
        timeout_sec=timeout,
        attachments_mode=att_mode,
    )
    logger.info(
        "transactional email provider: unisender classic api (base_url=%s from=%s list_id=%s)",
        (settings.UNISENDER_API_BASE_URL or "").split("?")[0][:60],
        from_addr,
        list_id,
    )
    return p


def get_transactional_provider() -> TransactionalEmailProvider:
    """Синглтон провайдера на процесс (для согласованных логов и пула)."""
    global _provider_cache
    if _provider_cache is None:
        _provider_cache = build_transactional_provider()
    return _provider_cache


def reset_transactional_provider_cache() -> None:
    """Для тестов: сбросить кеш провайдера."""
    global _provider_cache
    _provider_cache = None
