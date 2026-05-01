"""Безопасный stub: без сети, для EMAIL_ENABLED=false или dev."""
from __future__ import annotations

import logging
from typing import Any, Optional

from services.email.base import EmailSendResult

logger = logging.getLogger(__name__)


class StubTransactionalProvider:
    name = "stub"

    def __init__(self, *, reason: str = "disabled") -> None:
        self._reason = reason

    async def send_message(
        self,
        *,
        to_email: str,
        subject: str,
        html_body: str,
        text_body: str,
        attachments: Optional[list[dict[str, Any]]] = None,
    ) -> EmailSendResult:
        logger.info(
            "email stub send skipped (%s): to=%s subject=%s",
            self._reason,
            to_email,
            subject[:120],
        )
        return EmailSendResult(
            ok=True,
            provider=self.name,
            recipient=to_email,
            message_id="stub-noop",
            error=None,
        )


class FailingTransactionalProvider:
    """Конфиг неполный — отправка не выполняется, возвращается понятная ошибка."""

    name = "stub"

    def __init__(self, *, error_message: str) -> None:
        self._error_message = error_message

    async def send_message(
        self,
        *,
        to_email: str,
        subject: str,
        html_body: str,
        text_body: str,
        attachments: Optional[list[dict[str, Any]]] = None,
    ) -> EmailSendResult:
        logger.error(
            "email send blocked (misconfigured): to=%s err=%s",
            to_email,
            self._error_message,
        )
        return EmailSendResult(
            ok=False,
            provider=self.name,
            recipient=to_email,
            message_id=None,
            error=self._error_message,
        )
