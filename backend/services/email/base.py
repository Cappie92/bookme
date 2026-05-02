"""Базовые типы для транзакционной отправки писем (провайдеры подключаются через factory)."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Optional, Protocol, runtime_checkable


@dataclass
class EmailSendResult:
    """Единый результат отправки (для API и логов)."""

    ok: bool
    provider: str
    recipient: str
    message_id: Optional[str] = None
    error: Optional[str] = None

    def as_api_dict(self) -> dict[str, Any]:
        return {
            "success": self.ok,
            "recipient_email": self.recipient,
            "provider": self.provider,
            "message_id": self.message_id,
            "error": self.error,
        }


@runtime_checkable
class TransactionalEmailProvider(Protocol):
    """Провайдер транзакционных писем (Unisender, stub, будущий fallback)."""

    name: str

    async def send_message(
        self,
        *,
        to_email: str,
        subject: str,
        html_body: str,
        text_body: str,
        attachments: Optional[list[dict[str, Any]]] = None,
    ) -> EmailSendResult:
        """attachments — type, name, content (base64); провайдер декодирует во вложение sendEmail."""
        ...
